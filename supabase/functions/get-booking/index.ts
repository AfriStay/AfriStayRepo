/**
 * get-booking — AfriStay v5
 * Public endpoint to fetch booking details for the confirm-stay page.
 * No auth required — booking_id is the implicit credential.
 * Only returns safe fields needed for display (no sensitive owner data).
 *
 * GET /functions/v1/get-booking?booking_id=xxx
 */

import { serve }        from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const fail = (msg: string, status = 400) =>
  json({ error: msg }, status);

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'GET')    return fail('Method not allowed', 405);

  const url       = new URL(req.url);
  const bookingId = url.searchParams.get('booking_id') || '';

  if (!bookingId) return fail('booking_id required');

  // Use service role to bypass RLS — safe because we control what we return
  const sb = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { data: booking, error } = await sb
    .from('bookings')
    .select(`
      id,
      status,
      guest_name,
      guest_email,
      start_date,
      end_date,
      total_amount,
      nights,
      booking_reference,
      listings ( title, currency, category_slug )
    `)
    .eq('id', bookingId)
    .single();

  if (error || !booking) return fail('Booking not found', 404);

  // Only expose what the confirm page needs — no tokens, no owner details
  return json({
    id:                booking.id,
    status:            booking.status,
    guest_name:        booking.guest_name,
    guest_email:       booking.guest_email,
    start_date:        booking.start_date,
    end_date:          booking.end_date,
    total_amount:      booking.total_amount,
    nights:            booking.nights,
    booking_reference: booking.booking_reference,
    listing_title:     booking.listings?.title         || '',
    currency:          booking.listings?.currency      || 'RWF',
    category_slug:     booking.listings?.category_slug || 'real-estate',
    // owner contact intentionally omitted — only shown post-confirmation
  });
});
