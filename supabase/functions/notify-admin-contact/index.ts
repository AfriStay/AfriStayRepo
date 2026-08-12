import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function escapeHtml(s: string) {
  return String(s || "").replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!
  ));
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

  const { name, email, message } = await req.json();
  if (!name || !email || !message) {
    return new Response(JSON.stringify({ error: "name, email, and message are required" }), { status: 400, headers: CORS });
  }

  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
  const ADMIN_EMAIL = Deno.env.get("CONTACT_NOTIFY_EMAIL") || "info@afristay.rw";

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${RESEND_API_KEY}`
    },
    body: JSON.stringify({
      from: "AfriStay Contact Form <noreply@afristay.rw>",
      to: [ADMIN_EMAIL],
      subject: "New Contact Message",
      html: `<p>From: ${escapeHtml(name)} (${escapeHtml(email)})</p><p>${escapeHtml(message)}</p>`
    })
  });

  if (!res.ok) {
    console.error("[CONTACT] Resend error:", res.status, await res.text());
    return new Response(JSON.stringify({ error: "Failed to send notification" }), { status: 500, headers: CORS });
  }

  return new Response(JSON.stringify({ success: true }), { status: 200, headers: CORS });
});
