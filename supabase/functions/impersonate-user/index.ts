// impersonate-user — AfriStay admin tool
// verify_jwt: false  — we do our own auth check inside
import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL         = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SUPABASE_ANON_KEY    = Deno.env.get('SUPABASE_ANON_KEY')!;
const SITE_URL             = 'https://afristay.rw';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

function err(msg: string, status = 400) {
  return new Response(JSON.stringify({ error: msg }), { status, headers: CORS });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return err('Method not allowed', 405);

  try {
    // 1. Pull JWT from Authorization header and verify via anon client
    const authHeader = req.headers.get('Authorization') || '';
    if (!authHeader.startsWith('Bearer ')) return err('Missing Authorization header', 401);

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller }, error: callerErr } = await userClient.auth.getUser();
    if (callerErr || !caller) {
      return err('Unauthorized: ' + (callerErr?.message || 'invalid session'), 401);
    }

    // 2. Confirm caller is admin via service client
    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const { data: callerProfile } = await adminClient
      .from('profiles')
      .select('role')
      .eq('id', caller.id)
      .single();

    if (callerProfile?.role !== 'admin') {
      return err('Admin access required', 403);
    }

    // 3. Parse target user ID
    const body = await req.json().catch(() => ({}));
    const targetUserId: string = body.user_id;
    if (!targetUserId) return err('user_id is required', 400);

    // 4. Look up target user
    const { data: { user: targetUser }, error: userErr } =
      await adminClient.auth.admin.getUserById(targetUserId);
    if (userErr || !targetUser?.email) {
      return err(userErr?.message || 'User not found or has no email', 404);
    }

    // 5. Generate magic link
    const { data: linkData, error: linkErr } = await adminClient.auth.admin.generateLink({
      type: 'magiclink',
      email: targetUser.email,
      options: { redirectTo: SITE_URL + '/' },
    });

    if (linkErr || !linkData?.properties?.action_link) {
      return err(linkErr?.message || 'Failed to generate magic link', 500);
    }

    // 6. Server-side audit log — authoritative, cannot be bypassed by calling
    // this function directly (e.g. with a stolen token) instead of through the
    // dashboard UI, unlike a client-side-only log call.
    await adminClient.from('audit_logs').insert({
      actor_id: caller.id,
      actor_role: 'admin',
      action: 'impersonate_user',
      table_name: 'profiles',
      record_id: targetUserId,
      description: `Admin ${caller.email} generated an impersonation link for ${targetUser.email}`,
    });

    return new Response(
      JSON.stringify({ url: linkData.properties.action_link, email: targetUser.email }),
      { status: 200, headers: CORS },
    );

  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[impersonate-user] error:', msg);
    return err('Internal error: ' + msg, 500);
  }
});
