import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const RESEND_KEY = Deno.env.get('RESEND_API_KEY')!;
const SB_URL     = Deno.env.get('SUPABASE_URL')!;
const SB_KEY     = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });

  const sb = createClient(SB_URL, SB_KEY);

  // Verify caller is admin
  const authHeader = req.headers.get('Authorization') || '';
  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error: authErr } = await sb.auth.getUser(token);
  if (authErr || !user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: cors });
  const { data: prof } = await sb.from('profiles').select('role').eq('id', user.id).single();
  if (prof?.role !== 'admin') return new Response(JSON.stringify({ error: 'Admin only' }), { status: 403, headers: cors });

  const { booking_ids, notes, action } = await req.json();

  // action='mark_paid' → mark existing payout records as paid
  if (action === 'mark_paid') {
    if (!booking_ids?.length) return new Response(JSON.stringify({ error: 'No IDs' }), { status: 400, headers: cors });
    await sb.from('payouts').update({ status: 'completed', completed_at: new Date().toISOString(), paid_at: new Date().toISOString() }).in('booking_id', booking_ids);
    await sb.from('bookings').update({ payout_status: 'paid' }).in('id', booking_ids);
    // Notify owners
    const { data: bks } = await sb.from('bookings')
      .select('id, total_amount, guest_name, listings(title, profiles!owner_id(full_name, email))')
      .in('id', booking_ids);
    for (const b of bks ?? []) {
      const owner = (b.listings as any)?.profiles;
      if (owner?.email) await sendEmail(owner.email, owner.full_name, b, 'paid');
    }
    return new Response(JSON.stringify({ success: true }), { headers: { ...cors, 'Content-Type': 'application/json' } });
  }

  // Default action: initiate payouts
  if (!booking_ids?.length) return new Response(JSON.stringify({ error: 'No booking IDs' }), { status: 400, headers: cors });

  const { data: bookings, error: bErr } = await sb
    .from('bookings')
    .select('id, booking_reference, total_amount, price_per_unit, nights, guest_name, guest_email, guest_phone, payout_status, listings(id, title, owner_id, profiles!owner_id(id, full_name, email, phone))')
    .in('id', booking_ids)
    .eq('payment_status', 'paid');

  if (bErr) return new Response(JSON.stringify({ error: bErr.message }), { status: 500, headers: cors });

  const results: any[] = [];
  const errors: any[]  = [];

  for (const booking of bookings ?? []) {
    const already = booking.payout_status === 'processing' || booking.payout_status === 'paid';
    if (already) { errors.push({ booking_id: booking.id, error: 'Already processed' }); continue; }

    const owner = (booking.listings as any)?.profiles;
    if (!owner) { errors.push({ booking_id: booking.id, error: 'No owner' }); continue; }

    // Get wallet details
    const { data: wallet } = await sb.from('owner_wallets').select('payout_method,momo_phone,bank_name,bank_account,bank_holder').eq('owner_id', owner.id).maybeSingle();

    const { data: payout, error: pe } = await sb.from('payouts').insert({
      booking_id:     booking.id,
      recipient_type: 'owner',
      owner_id:       owner.id,
      gross_amount:   booking.total_amount,
      payout_amount:  booking.total_amount,
      currency:       'RWF',
      status:         'pending',
      notes:          notes || 'Admin initiated payout',
      payout_method:  wallet?.payout_method || 'manual',
      payout_phone:   wallet?.momo_phone || null,
      bank_name:      wallet?.bank_name || null,
      bank_account:   wallet?.bank_account || null,
      bank_holder:    wallet?.bank_holder || null,
    }).select().single();

    if (pe) { errors.push({ booking_id: booking.id, error: pe.message }); continue; }

    await sb.from('bookings').update({ payout_status: 'processing' }).eq('id', booking.id);
    await sendEmail(owner.email, owner.full_name, booking, 'processing', wallet);

    results.push({ booking_id: booking.id, payout_id: payout.id, owner: owner.full_name, amount: booking.total_amount });
  }

  return new Response(JSON.stringify({ success: true, processed: results.length, results, errors }), {
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
});

async function sendEmail(email: string, name: string, booking: any, stage: 'processing' | 'paid', wallet?: any) {
  const fmt = (n: number) => Number(n || 0).toLocaleString('en-RW') + ' RWF';
  const listing = (booking.listings as any)?.title || 'your listing';
  const ref     = booking.booking_reference || booking.id?.slice(0, 8)?.toUpperCase();

  const subject = stage === 'paid'
    ? `Payout confirmed — ${listing}`
    : `Payout initiated — ${listing}`;

  const body = stage === 'paid' ? `
    <p>Hi ${name},</p>
    <p>Your payout for booking <strong>#${ref}</strong> (${listing}) has been confirmed and sent to your account.</p>
    <p><strong>Amount:</strong> ${fmt(booking.total_amount)}</p>
    <p>The funds should reflect within 1–2 business days depending on your bank or mobile money provider.</p>
    <p>Log in to your owner dashboard to view your earnings history.</p>
    <p style="margin-top:24px;">AfriStay Team</p>
  ` : `
    <p>Hi ${name},</p>
    <p>A payout has been initiated for booking <strong>#${ref}</strong> (${listing}).</p>
    <p><strong>Amount:</strong> ${fmt(booking.total_amount)}</p>
    ${wallet?.momo_phone ? `<p><strong>Sending to:</strong> ${wallet.payout_method?.replace(/_/g,' ') || 'Mobile Money'} — ${wallet.momo_phone}</p>` : wallet?.bank_name ? `<p><strong>Sending to:</strong> ${wallet.bank_name}</p>` : ''}
    <p>You will receive another notification once the transfer is complete.</p>
    <p style="margin-top:24px;">AfriStay Team</p>
  `;

  const html = `<!DOCTYPE html><html><body style="font-family:Inter,sans-serif;color:#222;max-width:560px;margin:0 auto;padding:32px 20px;">
    <img src="https://afristay.rw/Pictures/light-afri1.png" height="28" alt="AfriStay" style="margin-bottom:24px;">
    <h2 style="color:#EB6753;margin:0 0 16px;">${subject}</h2>
    ${body}
  </body></html>`;

  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: 'AfriStay <noreply@afristay.rw>', to: email, subject, html }),
  });
}
