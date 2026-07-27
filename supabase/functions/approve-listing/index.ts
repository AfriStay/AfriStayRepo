/**
 * approve-listing — AfriStay v6
 * Admin approves a listing AND sets the AfriStay flat fee in one step.
 * price_display = listing.price + afristay_fee (set here, stored in DB)
 *
 * POST { listing_id, action: 'approve'|'reject', afristay_fee?: number, reject_reason?: string }
 * Requires: admin Bearer token
 */

import { serve }        from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });
const fail = (m: string, s = 400) => json({ error: m }, s);

async function sendEmail(to: string, subject: string, html: string) {
  const key  = Deno.env.get('RESEND_API_KEY'); if (!key) return;
  const from = Deno.env.get('EMAIL_FROM') || 'AfriStay <bookings@dm.afristay.rw>';
  const r    = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [to], subject, html }),
  });
  if (!r.ok) console.error('[EMAIL]', r.status, await r.text());
}

function approvedEmail(ownerName: string, listingTitle: string, displayPrice: number, currency: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f2f0ec;font-family:'Helvetica Neue',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f2f0ec;padding:40px 16px;">
<tr><td align="center"><table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;box-shadow:0 10px 30px rgba(0,0,0,.05);">
  <tr><td style="background:#f5f5f5;border-radius:20px 20px 0 0;padding:35px 40px;text-align:center;border-bottom:1px solid #ebebdd;">
    <img src="https://afristay.rw/Pictures/light-afri.svg" alt="AfriStay" width="180" style="display:block;margin:0 auto;">
    <div style="color:#a6a68d;font-size:11px;margin-top:15px;letter-spacing:2.5px;text-transform:uppercase;font-weight:bold;">Listing Update</div>
  </td></tr>
  <tr><td style="background:#16a34a;padding:26px 40px;text-align:center;">
    <div style="font-size:36px;margin-bottom:8px;">&#127881;</div>
    <div style="color:#fff;font-size:22px;font-weight:800;">Your Listing is Live!</div>
    <div style="color:rgba(255,255,255,0.88);font-size:14px;margin-top:6px;">Guests can now book your listing on AfriStay</div>
  </td></tr>
  <tr><td style="background:#fff;padding:36px 40px;">
    <p style="margin:0 0 6px;font-size:16px;font-weight:700;color:#1a1a1a;">Hi ${ownerName},</p>
    <p style="margin:0 0 28px;font-size:15px;color:#555;line-height:1.75;">
      Great news — your listing <strong style="color:#1a1a1a;">${listingTitle}</strong> has been approved
      and is now live on AfriStay. Guests can book it starting now.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#fdf1ef;border-radius:14px;margin-bottom:24px;border:1px solid #f9dad5;">
    <tr><td style="padding:20px 24px;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr><td style="padding:10px 0;border-bottom:1px solid #ebd2cf;font-size:14px;color:#666;">Listing</td>
            <td style="padding:10px 0;border-bottom:1px solid #ebd2cf;font-size:14px;font-weight:700;color:#1a1a1a;text-align:right;">${listingTitle}</td></tr>
        <tr><td style="padding:10px 0;font-size:14px;color:#666;">Displayed price</td>
            <td style="padding:10px 0;font-size:18px;font-weight:900;color:#EB6753;text-align:right;">${Number(displayPrice).toLocaleString('en-RW')} ${currency}</td></tr>
      </table>
    </td></tr></table>
    <a href="https://afristay.rw/Listings/" style="display:block;background:#EB6753;color:#fff;text-decoration:none;text-align:center;padding:18px;border-radius:14px;font-size:16px;font-weight:800;">View Your Listing</a>
  </td></tr>
  <tr><td style="background:#16213e;border-radius:0 0 20px 20px;padding:22px 40px;text-align:center;">
    <p style="margin:0;font-size:12px;color:rgba(255,255,255,0.35);">&#169; 2026 AfriStay &middot; <a href="https://afristay.rw" style="color:#EB6753;text-decoration:none;">afristay.rw</a></p>
  </td></tr>
</table></td></tr></table></body></html>`;
}

function rejectedEmail(ownerName: string, listingTitle: string, reason?: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f2f0ec;font-family:'Helvetica Neue',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f2f0ec;padding:40px 16px;">
<tr><td align="center"><table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;box-shadow:0 10px 30px rgba(0,0,0,.05);">
  <tr><td style="background:#f5f5f5;border-radius:20px 20px 0 0;padding:35px 40px;text-align:center;border-bottom:1px solid #ebebdd;">
    <img src="https://afristay.rw/Pictures/light-afri.svg" alt="AfriStay" width="180" style="display:block;margin:0 auto;">
    <div style="color:#a6a68d;font-size:11px;margin-top:15px;letter-spacing:2.5px;text-transform:uppercase;font-weight:bold;">Listing Update</div>
  </td></tr>
  <tr><td style="background:#EB6753;padding:22px 40px;text-align:center;">
    <div style="color:#fff;font-size:20px;font-weight:800;">Listing Review Update</div>
  </td></tr>
  <tr><td style="background:#fff;padding:36px 40px;">
    <p style="margin:0 0 6px;font-size:16px;font-weight:700;color:#1a1a1a;">Hi ${ownerName},</p>
    <p style="margin:0 0 22px;font-size:15px;color:#555;line-height:1.75;">
      We reviewed your listing <strong>${listingTitle}</strong> and were unable to approve it at this time.
    </p>
    ${reason ? `<div style="background:#fdf1ef;border:1.5px solid #f9dad5;border-radius:12px;padding:14px 18px;margin-bottom:22px;">
      <p style="margin:0;font-size:13px;color:#b91c1c;"><strong>Reason:</strong> ${reason}</p>
    </div>` : ''}
    <p style="margin:0 0 24px;font-size:14px;color:#555;line-height:1.75;">
      Please update your listing based on the feedback above and resubmit for review.
      Contact us at <a href="mailto:support@afristay.rw" style="color:#EB6753;">support@afristay.rw</a> if you have questions.
    </p>
    <a href="https://afristay.rw/Dashboards/Owner/" style="display:block;background:#EB6753;color:#fff;text-decoration:none;text-align:center;padding:18px;border-radius:14px;font-size:16px;font-weight:800;">Go to My Dashboard</a>
  </td></tr>
  <tr><td style="background:#16213e;border-radius:0 0 20px 20px;padding:22px 40px;text-align:center;">
    <p style="margin:0;font-size:12px;color:rgba(255,255,255,0.35);">&#169; 2026 AfriStay &middot; <a href="https://afristay.rw" style="color:#EB6753;text-decoration:none;">afristay.rw</a></p>
  </td></tr>
</table></td></tr></table></body></html>`;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return fail('Method not allowed', 405);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return fail('Unauthorized', 401);

  const sb  = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const tok = authHeader.replace('Bearer ', '');
  const { data: { user }, error: authErr } = await sb.auth.getUser(tok);
  if (authErr || !user) return fail('Unauthorized', 401);

  const { data: adminProfile } = await sb.from('profiles').select('role').eq('id', user.id).single();
  if (adminProfile?.role !== 'admin') return fail('Admin access required', 403);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return fail('Invalid JSON'); }

  const { listing_id, action, afristay_fee = 0, afristay_fee_outside = 0, reject_reason } = body as {
    listing_id: string; action: string;
    afristay_fee?: number; afristay_fee_outside?: number; reject_reason?: string;
  };

  if (!listing_id) return fail('listing_id required');
  if (!['approve','reject'].includes(action)) return fail('action must be approve or reject');

  /* Fetch listing */
  const { data: listing, error: lErr } = await sb
    .from('listings')
    .select('id, title, price, price_outside_kigali, currency, owner_id, status')
    .eq('id', listing_id)
    .single();

  if (lErr || !listing) return fail('Listing not found', 404);

  if (action === 'reject') {
    const { error: updErr } = await sb.from('listings')
      .update({ status: 'rejected', updated_at: new Date().toISOString() })
      .eq('id', listing_id);
    if (updErr) return fail('Failed to reject: ' + updErr.message);

    /* Email owner */
    const { data: owner } = await sb.from('profiles').select('full_name, email').eq('id', listing.owner_id).single();
    if (owner?.email) {
      await sendEmail(owner.email, `Update on your listing: ${listing.title}`,
        rejectedEmail(owner.full_name || 'Host', listing.title, reject_reason as string | undefined));
    }

    return json({ success: true, action: 'rejected' });
  }

  /* APPROVE — compute display price */
  const fee         = Math.max(0, Number(afristay_fee) || 0);
  const feeOutside  = Math.max(0, Number(afristay_fee_outside) || 0);
  const priceDisplay = listing.price + fee;
  const priceOutsideDisplay = listing.price_outside_kigali
    ? listing.price_outside_kigali + feeOutside
    : null;

  const { error: updErr } = await sb.from('listings')
    .update({
      status:                          'approved',
      availability_status:             'available',
      price_afristay_fee:              fee,
      price_afristay_fee_outside:      feeOutside,
      price_display:                   priceDisplay,
      price_outside_kigali_display:    priceOutsideDisplay,
      price_markup_applied:            true,
      fee_set_by:                      user.id,
      fee_set_at:                      new Date().toISOString(),
      updated_at:                      new Date().toISOString(),
    })
    .eq('id', listing_id);

  if (updErr) return fail('Failed to approve: ' + updErr.message);

  /* Email owner */
  const { data: owner } = await sb.from('profiles').select('full_name, email').eq('id', listing.owner_id).single();
  if (owner?.email) {
    await sendEmail(
      owner.email,
      `Your listing is live on AfriStay — ${listing.title}`,
      approvedEmail(owner.full_name || 'Host', listing.title, priceDisplay, listing.currency || 'RWF'),
    );
  }

  console.log('[APPROVE-LISTING]', listing_id, '| Fee:', fee, '| Display price:', priceDisplay);
  return json({ success: true, action: 'approved', price_display: priceDisplay });
});
