/**
 * irembo-pay — AfriStay v4  (DUMMY — awaiting Irembo integration)
 *
 * This is a placeholder that mimics a payment gateway response so the
 * rest of the booking flow can be tested end-to-end.
 *
 * ── HOW TO DISABLE ──
 * In Supabase SQL Editor run:
 *   UPDATE platform_config SET value = 'false' WHERE key = 'irembo_enabled';
 * When disabled, this function returns { skipped: true } and the frontend
 * should treat that as "no payment needed, proceed to confirm-booking directly".
 *
 * ── HOW TO REPLACE WITH REAL IREMBO ──
 * 1. Add IREMBO_API_KEY to Supabase secrets
 * 2. Replace the DUMMY RESPONSE block below with the real Irembo API call
 * 3. Update platform_config: irembo_enabled = 'true'
 *
 * NOTE: not part of the live payment flow — approve-booking + irembo-webhook
 * are what actually process real payments. Not currently called from any
 * frontend code (confirmed dead). Safe to ignore or delete.
 */

import { serve }        from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function ok(body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } });
}
function err(msg: string, status = 400) {
  return new Response(JSON.stringify({ error: msg }), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}
function ref(prefix: string): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let r = '';
  for (let i = 0; i < 8; i++) r += chars[Math.floor(Math.random() * chars.length)];
  return `${prefix}-${r}`;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST')   return err('Method not allowed', 405);

  /* ── Check if enabled ── */
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const sb          = createClient(supabaseUrl, supabaseKey);

  const { data: cfg } = await sb
    .from('platform_config')
    .select('value')
    .eq('key', 'irembo_enabled')
    .single();

  /* ── DISABLED: skip payment, allow booking to proceed ── */
  if (!cfg || cfg.value !== 'true') {
    console.log('[IREMBO-PAY] Disabled via platform_config — returning skipped');
    return ok({ skipped: true, message: 'Irembo payment disabled — booking proceeds without payment' });
  }

  /* ── Parse request ── */
  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return err('Invalid JSON'); }

  const { amount, currency, method, booking_id, guest_name, guest_email, listing_id } = body as Record<string, string | number>;

  if (!amount || Number(amount) <= 0) return err('Invalid amount');
  if (!method)                        return err('Payment method required');
  if (!guest_name)                    return err('Guest name required');
  if (!guest_email)                   return err('Guest email required');
  if (!booking_id)                    return err('booking_id required');

  /* ══════════════════════════════════════════════════════════
     DUMMY RESPONSE
     Replace this block with real Irembo API call when ready.
     ══════════════════════════════════════════════════════════ */

  if (method === 'card') {
    const { card_number, card_expiry, card_cvv, card_name } = body as Record<string, string>;
    if (!card_name)   return err('Name on card required');
    if (!card_number) return err('Card number required');
    if (!card_expiry) return err('Card expiry required (MM/YY)');
    if (!card_cvv)    return err('CVV required');

    const digits = String(card_number).replace(/\s/g, '');
    if (!/^\d{13,19}$/.test(digits)) return err('Invalid card number');

    const [mm, yy] = String(card_expiry).replace(/\s/g, '').split('/');
    const expiryDate = new Date(2000 + parseInt(yy || '0', 10), parseInt(mm || '0', 10) - 1, 28);
    if (expiryDate < new Date()) return err('Card has expired');

    console.log(`[IREMBO-PAY] DUMMY CARD | ${amount} ${currency} | booking=${booking_id}`);
    return ok({
      success:        true,
      status:         'initiated',
      reference:      ref('IRM'),
      transaction_id: ref('TXN'),
      provider:       'irembo_pay',
      method:         'card',
      amount:         Number(amount),
      currency:       currency || 'RWF',
      card_last4:     digits.slice(-4),
      card_brand:     digits.startsWith('4') ? 'Visa' : 'Mastercard',
      message:        '[DUMMY] Card payment accepted. Replace with real Irembo call.',
    });
  }

  if (method === 'momo') {
    const { momo_phone, momo_network } = body as Record<string, string>;
    if (!momo_phone) return err('MoMo phone required');
    const network = (momo_network || 'mtn').toLowerCase();
    if (!['mtn', 'airtel'].includes(network)) return err('Network must be mtn or airtel');
    const phone = String(momo_phone).replace(/\D/g, '');
    if (phone.length < 9) return err('Invalid phone number');

    console.log(`[IREMBO-PAY] DUMMY MOMO ${network.toUpperCase()} | ${amount} ${currency} | booking=${booking_id}`);
    return ok({
      success:        true,
      status:         'ussd_push_sent',
      reference:      ref('IRM'),
      transaction_id: ref('TXN'),
      provider:       'irembo_pay',
      method:         'momo',
      network:        network.toUpperCase(),
      momo_phone,
      amount:         Number(amount),
      currency:       currency || 'RWF',
      message:        `[DUMMY] USSD push sent to ${momo_phone}. Replace with real Irembo call.`,
    });
  }

  /* ══════════════════════════════════════════════════════════
     END DUMMY RESPONSE
     ══════════════════════════════════════════════════════════ */

  return err(`Unsupported method: ${method}`);
});
