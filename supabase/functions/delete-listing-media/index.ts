// NOTE: deployed under Supabase function slug "hyper-api", not "delete-listing-media".
// The dashboard's "name" field is delete-listing-media but the actual invoke URL is
// /functions/v1/hyper-api. Not currently called from any frontend code (confirmed dead).
// Deploy with: supabase functions deploy hyper-api --project-ref xuxzeinufjpplxkerlsd
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  try {
    const { listing_id, owner_id } = await req.json();
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

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
