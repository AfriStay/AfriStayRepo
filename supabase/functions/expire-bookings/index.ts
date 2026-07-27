/**
 * expire-bookings — AfriStay
 * Expires approved-but-unpaid bookings past their deadline.
 * Also expires awaiting_approval bookings past owner_response_deadline.
 * Fire-and-forget from dashboard/page loads.
 */
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const sb = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const [r1, r2] = await Promise.all([
    sb.rpc('expire_unpaid_approved_bookings'),
    sb.rpc('cancel_expired_bookings'),
  ]);

  if (r1.error) console.error('[EXPIRE] Payment expiry error:', r1.error.message);
  if (r2.error) console.error('[EXPIRE] Approval expiry error:', r2.error.message);

  console.log('[EXPIRE] Expired payment:', r1.data, '| Expired approval:', r2.data);

  return new Response(JSON.stringify({
    success: true,
    expired_payment: r1.data || 0,
    expired_approval: r2.data || 0,
  }), { headers: { ...CORS, 'Content-Type': 'application/json' } });
});
