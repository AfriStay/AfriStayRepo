/**
 * confirm-booking — AfriStay v5
 * Uses total_amount_original for payout calculation (not the markup total)
 * AfriStay earns: markup collected + platform_fee% of original
 */

import { serve }        from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });
const fail = (m: string, s = 400) => json({ error: m }, s);

async function sendEmail(to: string, subject: string, html: string) {
  const key = Deno.env.get('RESEND_API_KEY'); if (!key) return;
  const from = Deno.env.get('EMAIL_FROM') || 'AfriStay <bookings@dm.afristay.rw>';
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST', headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [to], subject, html }),
  });
  if (!r.ok) console.error('[EMAIL]', r.status, await r.text());
}

function lbl(slug: string) {
  const v = slug === 'vehicle';
  return { unit: v?'day':'night', plural: v?'days':'nights', action: v?'rental':'stay',
    start: v?'Pick-up':'Check-in', end: v?'Return':'Check-out' };
}

function confirmedEmail(p: {
  name: string; listingTitle: string; startDate: string; endDate: string;
  duration: number; totalDisplay: number; totalOriginal: number; currency: string;
  bookingRef: string; catSlug: string; priceZone?: string;
  isOwner?: boolean; guestName?: string; ownerName?: string;
  ownerEmail?: string; ownerPhone?: string;
  markupCollected?: number; platformFee?: number; platformFeePct?: number; ownerAmount?: number;
}): string {
  const fmt = (d: string) => { try { return new Date(d+'T00:00:00').toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric',year:'numeric'}); } catch { return d; }};
  const L = lbl(p.catSlug);
  const isVeh = p.catSlug === 'vehicle';
  const zoneTag = isVeh ? (p.priceZone === 'outside_kigali'
    ? ' <span style="background:#fef3c7;color:#92400e;font-size:11px;font-weight:700;padding:2px 8px;border-radius:20px;">Outside Kigali</span>'
    : ' <span style="background:#d1fae5;color:#065f46;font-size:11px;font-weight:700;padding:2px 8px;border-radius:20px;">Kigali</span>') : '';

  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f2f0ec;font-family:'Helvetica Neue',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f2f0ec;padding:40px 16px;">
<tr><td align="center"><table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;box-shadow:0 10px 30px rgba(0,0,0,.05);">
  <tr><td style="background:#f5f5f5;border-radius:20px 20px 0 0;padding:35px 40px;text-align:center;border-bottom:1px solid #ebebdd;">
    <img src="https://afristay.rw/Pictures/light-afri.svg" alt="AfriStay" width="180" style="display:block;margin:0 auto;">
    <div style="color:#a6a68d;font-size:11px;margin-top:15px;letter-spacing:2.5px;text-transform:uppercase;font-weight:bold;">${p.isOwner?'Owner Notification':'Booking Confirmed'}</div>
  </td></tr>
  <tr><td style="background:#16a34a;padding:28px 40px;text-align:center;">
    <div style="font-size:36px;margin-bottom:10px;">&#9989;</div>
    <div style="color:#fff;font-size:22px;font-weight:800;">${p.isOwner ? `${p.guestName} confirmed their ${L.action}!` : `Your ${L.action} is confirmed!`}</div>
    <div style="color:rgba(255,255,255,0.88);font-size:14px;margin-top:6px;">${p.isOwner ? 'Prepare to receive your guest' : 'Everything is locked in'}</div>
  </td></tr>
  <tr><td style="background:#fff;padding:36px 40px;">
    <p style="margin:0 0 6px;font-size:16px;font-weight:700;color:#1a1a1a;">Hi ${p.name},</p>
    <p style="margin:0 0 28px;font-size:15px;color:#555;line-height:1.75;">
      ${p.isOwner ? `<strong>${p.guestName}</strong> confirmed their ${L.action} at` : `Your ${L.action} at`}
      <strong>${p.listingTitle}</strong>${zoneTag} is confirmed.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#fdf1ef;border-radius:14px;margin-bottom:20px;border:1px solid #f9dad5;">
    <tr><td style="padding:22px 24px;">
      <div style="font-size:11px;font-weight:800;color:#EB6753;text-transform:uppercase;letter-spacing:1px;margin-bottom:16px;">Booking Details</div>
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr><td style="padding:10px 0;border-bottom:1px solid #ebd2cf;font-size:14px;color:#666;">Reference</td><td style="padding:10px 0;border-bottom:1px solid #ebd2cf;font-size:14px;font-weight:800;color:#EB6753;text-align:right;font-family:monospace;">${p.bookingRef}</td></tr>
        ${p.isOwner?`<tr><td style="padding:10px 0;border-bottom:1px solid #ebd2cf;font-size:14px;color:#666;">Guest</td><td style="padding:10px 0;border-bottom:1px solid #ebd2cf;font-size:14px;font-weight:700;text-align:right;">${p.guestName}</td></tr>`:`<tr><td style="padding:10px 0;border-bottom:1px solid #ebd2cf;font-size:14px;color:#666;">Host</td><td style="padding:10px 0;border-bottom:1px solid #ebd2cf;font-size:14px;font-weight:600;text-align:right;">${p.ownerName}</td></tr>`}
        <tr><td style="padding:10px 0;border-bottom:1px solid #ebd2cf;font-size:14px;color:#666;">${L.start}</td><td style="padding:10px 0;border-bottom:1px solid #ebd2cf;font-size:14px;font-weight:700;color:#16a34a;text-align:right;">${fmt(p.startDate)}</td></tr>
        <tr><td style="padding:10px 0;border-bottom:1px solid #ebd2cf;font-size:14px;color:#666;">${L.end}</td><td style="padding:10px 0;border-bottom:1px solid #ebd2cf;font-size:14px;font-weight:600;text-align:right;">${fmt(p.endDate)}</td></tr>
        <tr><td style="padding:10px 0;border-bottom:1px solid #ebd2cf;font-size:14px;color:#666;">Duration</td><td style="padding:10px 0;border-bottom:1px solid #ebd2cf;font-size:14px;font-weight:600;text-align:right;">${p.duration} ${L.plural}</td></tr>
        <tr><td style="padding:14px 0 0;font-size:16px;font-weight:800;color:#1a1a1a;">Total</td><td style="padding:14px 0 0;font-size:22px;font-weight:900;color:#EB6753;text-align:right;">${Number(p.totalDisplay).toLocaleString('en-RW')} ${p.currency}</td></tr>
      </table>
    </td></tr></table>

    ${p.isOwner && p.ownerAmount != null ? `
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0fdf4;border:1.5px solid #bbf7d0;border-radius:14px;margin-bottom:20px;">
    <tr><td style="padding:20px 24px;">
      <div style="font-size:11px;font-weight:800;color:#16a34a;text-transform:uppercase;letter-spacing:1px;margin-bottom:14px;">Your Earnings Breakdown</div>
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr><td style="font-size:13px;color:#555;padding:5px 0;">Guest paid</td><td style="font-size:13px;font-weight:600;color:#1a1a1a;text-align:right;">${Number(p.totalDisplay).toLocaleString('en-RW')} ${p.currency}</td></tr>
        <tr><td style="font-size:13px;color:#555;padding:5px 0;">AfriStay service fee (${p.platformFeePct}% of base)</td><td style="font-size:13px;color:#e74c3c;text-align:right;">- ${Number(p.platformFee).toLocaleString('en-RW')} ${p.currency}</td></tr>
        <tr><td colspan="2" style="padding:8px 0;border-top:1px solid #bbf7d0;"></td></tr>
        <tr><td style="font-size:16px;font-weight:800;color:#166534;padding:4px 0;">Your payout</td><td style="font-size:20px;font-weight:900;color:#16a34a;text-align:right;">${Number(p.ownerAmount).toLocaleString('en-RW')} ${p.currency}</td></tr>
      </table>
    </td></tr></table>` : ''}

    ${!p.isOwner && p.ownerName ? `
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border-radius:14px;margin-bottom:18px;border:1px solid #eee;">
    <tr><td style="padding:18px 22px;">
      <div style="font-size:11px;font-weight:800;color:#EB6753;text-transform:uppercase;letter-spacing:1px;margin-bottom:10px;">Your Host</div>
      <div style="font-size:15px;font-weight:700;color:#1a1a1a;margin-bottom:5px;">${p.ownerName}</div>
      ${p.ownerEmail?`<div style="font-size:13px;color:#888;">&#128231; <a href="mailto:${p.ownerEmail}" style="color:#EB6753;text-decoration:none;">${p.ownerEmail}</a></div>`:''}
      ${p.ownerPhone?`<div style="font-size:13px;color:#888;margin-top:3px;">&#128222; <a href="tel:${p.ownerPhone}" style="color:#EB6753;text-decoration:none;">${p.ownerPhone}</a></div>`:''}
    </td></tr></table>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:18px;">
    <tr><td style="background:#f0fdf4;border:1.5px solid #bbf7d0;border-radius:12px;padding:14px 18px;">
      <p style="margin:0;font-size:13px;color:#166534;line-height:1.65;">&#128179; Payment collected by host. Keep ref <strong style="font-family:monospace;">${p.bookingRef}</strong> handy.</p>
    </td></tr></table>` : ''}

    <a href="https://afristay.rw" style="display:block;background:#EB6753;color:#fff;text-decoration:none;text-align:center;padding:18px;border-radius:14px;font-size:16px;font-weight:700;">Go to AfriStay</a>
  </td></tr>
  <tr><td style="background:#16213e;border-radius:0 0 20px 20px;padding:22px 40px;text-align:center;">
    <p style="margin:0;font-size:12px;color:rgba(255,255,255,0.35);">&#169; 2026 AfriStay &middot; <a href="https://afristay.rw" style="color:#EB6753;text-decoration:none;">afristay.rw</a></p>
  </td></tr>
</table></td></tr></table></body></html>`;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return fail('Method not allowed', 405);

  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  let body: Record<string,string>; try { body = await req.json(); } catch { return fail('Invalid JSON'); }
  const { booking_id } = body;
  if (!booking_id) return fail('booking_id required');

  const { data: b, error: bErr } = await sb
    .from('bookings')
    .select('*, listings(id,title,owner_id,currency), profiles!bookings_user_id_fkey(full_name,email)')
    .eq('id', booking_id).single();

  if (bErr || !b) return fail('Booking not found', 404);
  if (b.status === 'confirmed') return json({ success: true, already_confirmed: true });
  if (b.status !== 'approved')  return fail(`Cannot confirm a booking with status: ${b.status}`);

  /* Read config */
  const { data: cfgs } = await sb.from('platform_config')
    .select('key,value')
    .in('key', ['payout_fee_percent','platform_fee_percent']);

  const cfgMap: Record<string,string> = {};
  (cfgs||[]).forEach(c => { cfgMap[c.key] = c.value; });
  const feePercent = parseFloat(cfgMap['payout_fee_percent'] || cfgMap['platform_fee_percent'] || '5');

  /* Amounts */
  const totalDisplay  = Number(b.total_amount);
  const totalOriginal = Number(b.total_amount_original || b.total_amount);
  const platformFee   = Math.round(totalOriginal * feePercent / 100);
  const ownerAmount   = totalOriginal - platformFee;
  // AfriStay total = markup collected + platform fee
  const markupCollected = totalDisplay - totalOriginal;
  const currency = b.listings?.currency || b.currency || 'RWF';
  const catSlug  = b.category_slug || 'real_estate';
  const duration = b.nights || Math.ceil((new Date(b.end_date).getTime()-new Date(b.start_date).getTime())/86400000);
  const L        = lbl(catSlug);

  /* Update booking */
  const { error: updErr } = await sb.from('bookings')
    .update({ status: 'confirmed', confirmed_at: new Date().toISOString(), payment_status: 'unpaid' })
    .eq('id', booking_id);
  if (updErr) return fail('Failed to confirm: ' + updErr.message);

  /* Record payout */
  await sb.from('payouts').insert({
    booking_id, owner_id: b.listings?.owner_id,
    gross_amount: totalDisplay, original_amount: totalOriginal,
    platform_fee: platformFee + markupCollected, // AfriStay keeps both
    owner_amount: ownerAmount,
    currency, status: 'pending',
  });

  /* Update owner wallet */
  await sb.rpc('increment_owner_wallet', {
    p_owner_id: b.listings?.owner_id, p_amount: ownerAmount, p_currency: currency,
  }).catch(() => {});

  const { data: owner } = await sb.from('profiles').select('full_name,email,phone').eq('id', b.listings?.owner_id).single();
  const bookingRef = b.booking_reference || booking_id.slice(0,8).toUpperCase();
  const guestEmail = b.guest_email || b.profiles?.email;
  const guestName  = b.guest_name  || b.profiles?.full_name || 'Guest';

  /* Email guest */
  if (guestEmail) {
    await sendEmail(guestEmail,
      `${L.action.charAt(0).toUpperCase()+L.action.slice(1)} confirmed — ${b.listings?.title} · ${bookingRef}`,
      confirmedEmail({ name: guestName, listingTitle: b.listings?.title||'', startDate: b.start_date, endDate: b.end_date,
        duration, totalDisplay, totalOriginal, currency, bookingRef, catSlug, priceZone: b.price_zone,
        ownerName: owner?.full_name, ownerEmail: owner?.email, ownerPhone: owner?.phone }));
  }

  /* Email owner */
  if (owner?.email) {
    await sendEmail(owner.email,
      `${guestName} confirmed their ${L.action} — ${bookingRef}`,
      confirmedEmail({ name: owner.full_name||'Host', listingTitle: b.listings?.title||'', startDate: b.start_date,
        endDate: b.end_date, duration, totalDisplay, totalOriginal, currency, bookingRef, catSlug, priceZone: b.price_zone,
        isOwner: true, guestName, markupCollected, platformFee, platformFeePct: feePercent, ownerAmount }));
  }

  return json({ success: true, booking_id, reference: bookingRef });
});
