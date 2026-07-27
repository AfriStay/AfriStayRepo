/**
 * export-payouts — AfriStay v5
 * Returns payout data as JSON for admin financial reports.
 * Frontend (Claude Code) generates the Excel/PDF from this data.
 *
 * GET /functions/v1/export-payouts?format=json&status=all&from=2026-01-01&to=2026-12-31
 * Requires: admin Bearer token
 */

import { serve }        from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

const json  = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });
const fail  = (m: string, s = 400) => json({ error: m }, s);

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'GET') return fail('Method not allowed', 405);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return fail('Unauthorized', 401);

  const sb  = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const tok = authHeader.replace('Bearer ', '');
  const { data: { user }, error: authErr } = await sb.auth.getUser(tok);
  if (authErr || !user) return fail('Unauthorized', 401);

  const { data: profile } = await sb.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') return fail('Admin access required', 403);

  const url    = new URL(req.url);
  const status = url.searchParams.get('status') || 'all';   // all | pending | paid
  const from   = url.searchParams.get('from')   || null;    // YYYY-MM-DD
  const to     = url.searchParams.get('to')     || null;    // YYYY-MM-DD
  const page   = parseInt(url.searchParams.get('page') || '1');
  const limit  = 100;
  const offset = (page - 1) * limit;

  /* Query v_financial_report view */
  let q = sb.from('v_financial_report')
    .select('*', { count: 'exact' })
    .order('booking_date', { ascending: false })
    .range(offset, offset + limit - 1);

  if (status !== 'all') q = q.eq('payout_status', status);
  if (from)             q = q.gte('booking_date', from);
  if (to)               q = q.lte('booking_date', to);

  const { data: rows, error, count } = await q;
  if (error) return fail('Query failed: ' + error.message);

  /* Summary totals */
  const totals = (rows || []).reduce((acc, r) => ({
    total_guest_paid:    acc.total_guest_paid    + Number(r.amount_paid_by_guest || 0),
    total_markup:        acc.total_markup        + Number(r.markup_collected     || 0),
    total_platform_fees: acc.total_platform_fees + Number(r.platform_fee        || 0),
    total_owner_payouts: acc.total_owner_payouts + Number(r.payout_to_owner     || 0),
    total_afristay_revenue: acc.total_afristay_revenue + Number(r.markup_collected||0) + Number(r.platform_fee||0),
  }), { total_guest_paid: 0, total_markup: 0, total_platform_fees: 0, total_owner_payouts: 0, total_afristay_revenue: 0 });

  return json({
    success: true,
    meta: { total: count, page, limit, pages: Math.ceil((count||0)/limit), filters: { status, from, to } },
    totals,
    rows: rows || [],
  });
});
