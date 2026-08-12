// NOTE: deployed under Supabase function slug "hyper-api", not "delete-listing-media".
// The dashboard's "name" field is delete-listing-media but the actual invoke URL is
// /functions/v1/hyper-api. Not currently called from any frontend code (confirmed dead).
// Deploy with: supabase functions deploy hyper-api --project-ref xuxzeinufjpplxkerlsd
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // This deletes real listing media with no prior authentication check —
    // owner_id/listing_id are visible in ordinary listing page URLs, not a
    // secret like a booking token, so this must verify the caller actually
    // owns the listing (or is an admin) before touching storage.
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }
    const { data: { user: caller }, error: callerErr } = await supabase.auth.getUser(authHeader.slice(7));
    if (callerErr || !caller) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }

    const { listing_id, owner_id } = await req.json();
    if (!listing_id || !owner_id) {
      return new Response(JSON.stringify({ error: "listing_id and owner_id required" }), { status: 400 });
    }

    const isOwner = caller.id === owner_id;
    if (!isOwner) {
      const { data: callerProfile } = await supabase.from("profiles").select("role").eq("id", caller.id).maybeSingle();
      if (callerProfile?.role !== "admin") {
        return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });
      }
    }

    // Path Logic: Assuming your Uploads are stored as {owner_id}/{listing_id}/filename.jpg
    const folderPath = `${owner_id}/${listing_id}`;

    // 1. List Images
    const { data: files } = await supabase.storage.from("listing-images").list(folderPath);

    if (files && files.length > 0) {
        const paths = files.map(f => `${folderPath}/${f.name}`);
        await supabase.storage.from("listing-images").remove(paths);
    }

    // 2. List Videos
    const { data: vids } = await supabase.storage.from("listing-videos").list(folderPath);

    if (vids && vids.length > 0) {
        const paths = vids.map(f => `${folderPath}/${f.name}`);
        await supabase.storage.from("listing-videos").remove(paths);
    }

    return new Response(JSON.stringify({ success: true }), { status: 200 });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
});
