/**
 * reject-booking — AfriStay v4
 * POST { booking_id, reason? }  → admin/owner rejects → emails guest → returns JSON
 * GET  ?token=xxx&action=reject → owner email link → process → redirect home
 */

import { serve }        from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const fail = (msg: string, status = 400) => json({ error: msg }, status);

async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  const key = Deno.env.get('RESEND_API_KEY');
  if (!key) { console.error('[EMAIL] No RESEND_API_KEY'); return; }
  const from = Deno.env.get('EMAIL_FROM') || 'AfriStay <bookings@dm.afristay.rw>';
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [to], subject, html }),
  });
  if (!res.ok) console.error('[EMAIL] Resend error:', res.status, await res.text());
}

function guestRejectedEmail(p: {
  guestName: string; listingTitle: string; startDate: string; endDate: string;
  bookingRef: string; reason?: string;
}): string {
  const fmt = (d: string) => {
    try { return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric', year:'numeric' }); }
    catch { return d; }
  };
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Booking Update — AfriStay</title></head>
<body style="margin:0;padding:0;background:#f2f0ec;font-family:'Inter',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f2f0ec;padding:40px 16px;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
  <tr><td style="background:#16213e;border-radius:20px 20px 0 0;padding:30px 40px;text-align:center;">
    <div style="font-size:30px;font-weight:900;color:#EB6753;">AfriStay</div>
    <div style="color:rgba(255,255,255,0.6);font-size:12px;margin-top:4px;letter-spacing:1px;text-transform:uppercase;">Rwanda Property Rentals</div>
  </td></tr>
  <tr><td style="background:#f59e0b;padding:20px 40px;text-align:center;">
    <div style="color:#fff;font-size:20px;font-weight:800;">Booking Update</div>
    <div style="color:rgba(255,255,255,0.88);font-size:14px;margin-top:6px;">Ref: ${p.bookingRef}</div>
  </td></tr>
  <tr><td style="background:#ffffff;padding:36px 40px;">
    <p style="color:#1a1a1a;font-size:16px;margin:0 0 8px;font-weight:600;">Hi ${p.guestName},</p>
    <p style="color:#555;font-size:15px;line-height:1.7;margin:0 0 24px;">
      Unfortunately, the host was unable to accommodate your request for
      <strong style="color:#1a1a1a;">${p.listingTitle}</strong>
      (${fmt(p.startDate)} → ${fmt(p.endDate)}).
    </p>
    ${p.reason ? `<div style="background:#fef2f2;border:1.5px solid #fecaca;border-radius:12px;padding:14px 18px;margin-bottom:24px;"><p style="margin:0;font-size:13px;color:#b91c1c;line-height:1.6;"><strong>Reason:</strong> ${p.reason}</p></div>` : ''}
    <p style="color:#555;font-size:15px;line-height:1.7;margin:0 0 24px;">
      No charges were made. We encourage you to browse other available listings on AfriStay.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0">
    <tr><td>
      <a href="https://afristay.rw/Listings" style="display:block;background:#EB6753;color:#fff;text-decoration:none;text-align:center;padding:18px;border-radius:14px;font-size:16px;font-weight:800;">Browse Other Listings</a>
    </td></tr></table>
  </td></tr>
  <tr><td style="background:#16213e;border-radius:0 0 20px 20px;padding:24px 40px;text-align:center;">
    <p style="margin:0 0 6px;color:rgba(255,255,255,0.4);font-size:12px;">© ${new Date().getFullYear()} AfriStay · afristay.rw</p>
    <p style="margin:0;font-size:11px;color:rgba(255,255,255,0.3);">Questions? <a href="mailto:support@afristay.rw" style="color:#EB6753;text-decoration:none;">support@afristay.rw</a></p>
  </td></tr>
</table></td></tr></table></body></html>`;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const sb          = createClient(supabaseUrl, supabaseKey);
  const origin      = Deno.env.get('SITE_ORIGIN') || 'https://afristay.rw';

  let bookingId: string | null = null;
  let reason: string | undefined;
  let isGet = false;

  if (req.method === 'GET') {
    isGet = true;
    const url   = new URL(req.url);
    const token = url.searchParams.get('token') || '';
    reason      = url.searchParams.get('reason') || undefined;
    if (!token) return new Response('Invalid link', { status: 400 });

    const { data: b } = await sb.from('bookings').select('id, status').eq('approval_token', token).single();
    if (!b) return new Response(`<html><body style="font-family:system-ui;text-align:center;padding:60px"><h2>Link invalid or expired</h2><p><a href="${origin}">Back to AfriStay</a></p></body></html>`, { status: 400, headers: { 'Content-Type': 'text/html' } });
    bookingId = b.id;
  } else if (req.method === 'POST') {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return fail('Unauthorized', 401);
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authErr } = await sb.auth.getUser(token);
    if (authErr || !user) return fail('Unauthorized', 401);

    let body: Record<string, string>;
    try { body = await req.json(); }
    catch { return fail('Invalid JSON'); }
    bookingId = body.booking_id;
    reason    = body.reason;
    if (!bookingId) return fail('booking_id required');
  } else {
    return fail('Method not allowed', 405);
  }

  /* Fetch booking */
  const { data: booking } = await sb
    .from('bookings')
    .select('*, listings(title, currency), profiles!bookings_user_id_fkey(full_name, email)')
    .eq('id', bookingId!)
    .single();

  if (!booking) {
    if (isGet) return new Response(`<html><body style="font-family:system-ui;text-align:center;padding:60px"><h2>Booking not found</h2></body></html>`, { status: 404, headers: { 'Content-Type': 'text/html' } });
    return fail('Booking not found', 404);
  }

  /* Update */
  await sb.from('bookings').update({
    status:       'rejected',
    rejected_at:  new Date().toISOString(),
    reject_reason: reason || null,
    approval_token: null,
  }).eq('id', bookingId!);

  /* Email guest */
  const guestEmail = booking.guest_email || booking.profiles?.email;
  if (guestEmail) {
    await sendEmail(
      guestEmail,
      `Update on your booking request — ${booking.booking_reference || ''}`,
      guestRejectedEmail({
        guestName:    booking.guest_name || booking.profiles?.full_name || 'Guest',
        listingTitle: booking.listings?.title || 'the listing',
        startDate:    booking.start_date,
        endDate:      booking.end_date,
        bookingRef:   booking.booking_reference || bookingId!.slice(0, 8).toUpperCase(),
        reason,
      }),
    );
  }

  if (isGet) {
    const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Done — AfriStay</title><style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:system-ui,sans-serif;background:#f2f0ec;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}.card{background:#fff;border-radius:20px;padding:40px;max-width:400px;width:100%;text-align:center;box-shadow:0 4px 24px rgba(0,0,0,.08)}</style></head>
<body><div class="card"><div style="font-size:52px;margin-bottom:16px">✅</div><h2 style="font-size:20px;font-weight:800;color:#1a1a1a;margin-bottom:10px">Booking Rejected</h2><p style="color:#666;font-size:14px;line-height:1.7;margin-bottom:16px">The guest has been notified.</p><p style="color:#aaa;font-size:12px">Redirecting to AfriStay…</p></div>
<script>setTimeout(()=>window.location.replace('${origin}'),2200);</script></body></html>`;
    return new Response(html, { status: 200, headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
  }

  return json({ success: true });
});
