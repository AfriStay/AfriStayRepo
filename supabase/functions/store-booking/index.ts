/**
 * store-booking — AfriStay v5
 */

import { serve }        from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const fail = (msg: string, code?: string, status = 400) =>
  json({ error: msg, code }, status);

function genRef(): string {
  const c = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let r = '';
  for (let i = 0; i < 6; i++) r += c[Math.floor(Math.random() * c.length)];
  return `ASR-${r}`;
}
function genToken(): string {
  const a = new Uint8Array(32);
  crypto.getRandomValues(a);
  return Array.from(a).map(b => b.toString(16).padStart(2,'0')).join('');
}

function lbl(slug: string) {
  const v = slug === 'vehicle';
  return {
    unit:       v ? 'day'     : 'night',
    unitPlural: v ? 'days'    : 'nights',
    action:     v ? 'rental'  : 'stay',
    startLabel: v ? 'Pick-up' : 'Check-in',
    endLabel:   v ? 'Return'  : 'Check-out',
    icon:       v ? '🚗'      : '🏠',
  };
}

async function sendEmail(to: string, subject: string, html: string) {
  const key = Deno.env.get('RESEND_API_KEY');
  if (!key) { console.error('[EMAIL] No RESEND_API_KEY'); return; }
  const from = Deno.env.get('EMAIL_FROM') || 'AfriStay <bookings@dm.afristay.rw>';
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [to], subject, html }),
  });
  if (!res.ok) console.error('[EMAIL] Resend error:', res.status, await res.text());
  else console.log('[EMAIL] Sent to:', to);
}

function ownerEmail(p: {
  ownerName: string; guestName: string; guestEmail: string; guestPhone: string;
  listingTitle: string; startDate: string; endDate: string;
  duration: number; unitPlural: string; action: string; icon: string;
  totalAmount: number; currency: string; bookingRef: string;
  priceZone?: string; categorySlug: string;
  approveUrl: string; rejectUrl: string; notes?: string;
}): string {
  const fmt = (d: string) => {
    try { return new Date(d+'T00:00:00').toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric',year:'numeric'}); }
    catch { return d; }
  };
  const isVeh   = p.categorySlug === 'vehicle';
  const zoneTag = isVeh
    ? (p.priceZone === 'outside_kigali'
        ? ' <span style="background:#fef3c7;color:#92400e;font-size:11px;font-weight:700;padding:2px 8px;border-radius:20px;">Outside Kigali</span>'
        : ' <span style="background:#d1fae5;color:#065f46;font-size:11px;font-weight:700;padding:2px 8px;border-radius:20px;">Kigali</span>')
    : '';

  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f2f0ec;font-family:'Helvetica Neue',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f2f0ec;padding:40px 16px;">
<tr><td align="center"><table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;box-shadow:0 10px 30px rgba(0,0,0,.05);">
  <tr><td style="background:#f5f5f5;border-radius:20px 20px 0 0;padding:35px 40px;text-align:center;border-bottom:1px solid #ebebdd;">
    <img src="https://afristay.rw/Pictures/light-afri.svg" alt="AfriStay" width="180" style="display:block;margin:0 auto;">
    <div style="color:#a6a68d;font-size:11px;margin-top:15px;letter-spacing:2.5px;text-transform:uppercase;font-weight:bold;">New Booking Request</div>
  </td></tr>
  <tr><td style="background:#EB6753;padding:24px 40px;text-align:center;">
    <div style="color:#fff;font-size:20px;font-weight:800;">${p.icon} New ${isVeh ? 'Vehicle Rental' : 'Booking'} Request</div>
    <div style="color:rgba(255,255,255,0.9);font-size:13px;margin-top:5px;">Please respond within 24 hours</div>
  </td></tr>
  <tr><td style="background:#fff;padding:36px 40px;">
    <p style="margin:0 0 6px;font-size:16px;font-weight:700;color:#1a1a1a;">Hi ${p.ownerName},</p>
    <p style="margin:0 0 28px;font-size:15px;color:#555;line-height:1.75;">
      New ${p.action} request for <strong>${p.listingTitle}</strong>${zoneTag}.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#fdf1ef;border-radius:14px;margin-bottom:20px;border:1px solid #f9dad5;">
    <tr><td style="padding:22px 24px;">
      <div style="font-size:11px;font-weight:800;color:#EB6753;text-transform:uppercase;letter-spacing:1px;margin-bottom:16px;">Booking Details</div>
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr><td style="padding:10px 0;border-bottom:1px solid #ebd2cf;font-size:14px;color:#666;">Reference</td><td style="padding:10px 0;border-bottom:1px solid #ebd2cf;font-size:14px;font-weight:800;color:#EB6753;text-align:right;font-family:monospace;">${p.bookingRef}</td></tr>
        <tr><td style="padding:10px 0;border-bottom:1px solid #ebd2cf;font-size:14px;color:#666;">${isVeh ? 'Pick-up' : 'Check-in'}</td><td style="padding:10px 0;border-bottom:1px solid #ebd2cf;font-size:14px;font-weight:600;text-align:right;">${fmt(p.startDate)}</td></tr>
        <tr><td style="padding:10px 0;border-bottom:1px solid #ebd2cf;font-size:14px;color:#666;">${isVeh ? 'Return' : 'Check-out'}</td><td style="padding:10px 0;border-bottom:1px solid #ebd2cf;font-size:14px;font-weight:600;text-align:right;">${fmt(p.endDate)}</td></tr>
        <tr><td style="padding:10px 0;border-bottom:1px solid #ebd2cf;font-size:14px;color:#666;">Duration</td><td style="padding:10px 0;border-bottom:1px solid #ebd2cf;font-size:14px;font-weight:600;text-align:right;">${p.duration} ${p.unitPlural}</td></tr>
        <tr><td style="padding:14px 0 0;font-size:16px;font-weight:800;color:#1a1a1a;">Total</td><td style="padding:14px 0 0;font-size:22px;font-weight:900;color:#EB6753;text-align:right;">${Number(p.totalAmount).toLocaleString('en-RW')} ${p.currency}</td></tr>
      </table>
    </td></tr></table>
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border-radius:14px;margin-bottom:24px;border:1px solid #eee;">
    <tr><td style="padding:22px 24px;">
      <div style="font-size:11px;font-weight:800;color:#EB6753;text-transform:uppercase;letter-spacing:1px;margin-bottom:16px;">Guest Information</div>
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr><td style="padding:10px 0;border-bottom:1px solid #eee;font-size:14px;color:#666;">Name</td><td style="padding:10px 0;border-bottom:1px solid #eee;font-size:14px;font-weight:700;color:#1a1a1a;text-align:right;">${p.guestName}</td></tr>
        <tr><td style="padding:10px 0;border-bottom:1px solid #eee;font-size:14px;color:#666;">Email</td><td style="padding:10px 0;border-bottom:1px solid #eee;font-size:14px;text-align:right;"><a href="mailto:${p.guestEmail}" style="color:#EB6753;text-decoration:none;">${p.guestEmail}</a></td></tr>
        <tr><td style="padding:10px 0;font-size:14px;color:#666;">Phone</td><td style="padding:10px 0;font-size:14px;text-align:right;">${p.guestPhone || '&#8212;'}</td></tr>
      </table>
      ${p.notes ? `<div style="margin-top:14px;padding:12px 14px;background:#fff8f3;border-left:3px solid #EB6753;border-radius:0 8px 8px 0;font-size:13px;color:#555;font-style:italic;">"${p.notes}"</div>` : ''}
    </td></tr></table>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
    <tr>
      <td width="50%" style="padding-right:6px;"><a href="${p.approveUrl}" style="display:block;background:#16a34a;color:#fff;text-decoration:none;text-align:center;padding:18px;border-radius:14px;font-size:16px;font-weight:800;">&#10003; Approve</a></td>
      <td width="50%" style="padding-left:6px;"><a href="${p.rejectUrl}" style="display:block;background:#ef4444;color:#fff;text-decoration:none;text-align:center;padding:18px;border-radius:14px;font-size:16px;font-weight:800;">&#10007; Reject</a></td>
    </tr></table>
    <table width="100%" cellpadding="0" cellspacing="0">
    <tr><td style="background:#fefce8;border:1.5px solid #fde047;border-radius:12px;padding:14px 18px;">
      <p style="margin:0;font-size:13px;color:#713f12;line-height:1.65;">&#9200; Respond within 24 hours or the request expires automatically.</p>
    </td></tr></table>
  </td></tr>
  <tr><td style="background:#16213e;border-radius:0 0 20px 20px;padding:22px 40px;text-align:center;">
    <p style="margin:0;font-size:12px;color:rgba(255,255,255,0.35);">&#169; 2026 AfriStay &middot; <a href="https://afristay.rw" style="color:#EB6753;text-decoration:none;">afristay.rw</a></p>
  </td></tr>
</table></td></tr></table></body></html>`;
}

/* ════ MAIN ════ */
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST')   return fail('Method not allowed', undefined, 405);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return fail('Unauthorized', undefined, 401);

  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error: authErr } = await sb.auth.getUser(token);
  if (authErr || !user) return fail('Unauthorized', undefined, 401);

  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return fail('Invalid JSON'); }

  const {
    listing_id, start_date, end_date, nights,
    total_amount, currency = 'RWF',
    guest_name, guest_email, guest_phone, user_id, notes,
    price_zone = 'kigali',
  } = body as Record<string, string | number>;

  if (!listing_id)  return fail('listing_id required');
  if (!start_date)  return fail('start_date required');
  if (!end_date)    return fail('end_date required');
  if (!guest_name)  return fail('guest_name required');
  if (!guest_email) return fail('guest_email required');
  if (Number(total_amount) <= 0) return fail('total_amount must be greater than zero');
  if (!guest_phone || String(guest_phone).replace(/\D/g,'').length < 9)
    return fail('Phone number is required. Please enter your phone number to continue.');

  /* Fetch listing with display prices */
  const { data: listing, error: listErr } = await sb
    .from('listings')
    .select('id,title,owner_id,status,availability_status,category_slug,price,price_display,price_outside_kigali,price_outside_kigali_display,currency')
    .eq('id', listing_id)
    .single();

  if (listErr || !listing) return fail('Listing not found. Please go back and try again.', undefined, 404);
  if (listing.status !== 'approved') return fail('This listing is not available for booking.');
  if (listing.availability_status !== 'available') return fail('This listing is currently unavailable.');
  if (listing.owner_id === (user_id || user.id)) return fail('You cannot book your own listing.', 'SELF_BOOKING');

  /* Only block if new dates overlap with an existing active booking */
  const { data: existingList } = await sb
    .from('bookings').select('id, start_date, end_date')
    .eq('listing_id', listing_id)
    .eq('user_id', user_id || user.id)
    .in('status', ['awaiting_approval','pending','approved','confirmed']);
  const hasOverlap = (existingList || []).some((b: { start_date: string; end_date: string }) =>
    new Date(String(start_date)) < new Date(b.end_date) &&
    new Date(String(end_date))   > new Date(b.start_date)
  );
  if (hasOverlap) return fail('You already have an overlapping booking for these dates. Check your bookings.', 'DUPLICATE_BOOKING');

  const catSlug  = listing.category_slug || 'real_estate';
  const isVeh    = catSlug === 'vehicle';
  const labels   = lbl(catSlug);
  const duration = Number(nights) || Math.ceil(
    (new Date(end_date as string).getTime() - new Date(start_date as string).getTime()) / 86400000
  );

  const priceOriginal = isVeh && price_zone === 'outside_kigali' && listing.price_outside_kigali
    ? listing.price_outside_kigali
    : listing.price;

  const priceDisplay = isVeh && price_zone === 'outside_kigali' && listing.price_outside_kigali_display
    ? listing.price_outside_kigali_display
    : (listing.price_display || listing.price);

  const totalDisplay  = Number(total_amount);
  const totalOriginal = priceOriginal * duration;

  const bookingRef    = genRef();
  const approvalToken = genToken();
  const deadline      = new Date(Date.now() + 24 * 60 * 60 * 1000);

  const { data: booking, error: insertErr } = await sb
    .from('bookings')
    .insert({
      listing_id,
      user_id:                   user_id || user.id,
      start_date, end_date,
      nights:                    duration,
      total_amount:              totalDisplay,
      total_amount_original:     totalOriginal,
      currency,
      status:                    'awaiting_approval',
      payment_method:            'pay_on_arrival',
      payment_status:            'unpaid',
      guest_name, guest_email,
      guest_phone:               guest_phone || null,
      guest_notes:               notes || null,
      booking_reference:         bookingRef,
      approval_token:            approvalToken,
      approval_token_expires_at: deadline.toISOString(),
      owner_response_deadline:   deadline.toISOString(),
      category_slug:             catSlug,
      price_zone:                isVeh ? String(price_zone) : 'kigali',
      price_per_unit:            priceDisplay,
    })
    .select('id').single();

  if (insertErr || !booking) {
    console.error('[STORE-BOOKING] Insert error:', insertErr);
    return fail('Failed to create booking. Please try again or contact support. Error: ' + insertErr?.message);
  }

  const { data: owner } = await sb.from('profiles').select('full_name,email').eq('id', listing.owner_id).single();
  if (!owner?.email) {
    console.warn('[STORE-BOOKING] Owner has no email');
    return json({ success: true, booking_id: booking.id, reference: bookingRef });
  }

  const fnBase     = Deno.env.get('SUPABASE_URL') + '/functions/v1';
  const approveUrl = `${fnBase}/approve-booking?token=${approvalToken}&action=approve`;
  const rejectUrl  = `${fnBase}/approve-booking?token=${approvalToken}&action=reject`;

  await sendEmail(
    owner.email,
    `New ${labels.action} request for ${listing.title} — ${bookingRef}`,
    ownerEmail({
      ownerName: owner.full_name || 'Host', guestName: String(guest_name),
      guestEmail: String(guest_email), guestPhone: String(guest_phone || ''),
      listingTitle: listing.title, startDate: String(start_date), endDate: String(end_date),
      duration, unitPlural: labels.unitPlural, action: labels.action, icon: labels.icon,
      totalAmount: totalDisplay, currency: String(currency), bookingRef,
      priceZone: isVeh ? String(price_zone) : undefined, categorySlug: catSlug,
      approveUrl, rejectUrl, notes: notes as string | undefined,
    }),
  );

  console.log('[STORE-BOOKING]', booking.id, '| Ref:', bookingRef, '| Display:', totalDisplay, '| Original:', totalOriginal);
  return json({ success: true, booking_id: booking.id, reference: bookingRef });
});
