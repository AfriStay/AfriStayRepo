/**
 * Edge Function: generate-receipt
 * ─────────────────────────────────────────────────────────────────
 * SECRETS:
 *   BREVO_API_KEY            xkeysib-xxx
 *   EMAIL_FROM_NAME          AfriStay
 *   EMAIL_FROM_ADDRESS       bookings@afristay.rw
 *   SITE_ORIGIN              https://afristay.rw
 *   PLATFORM_FEE_PERCENT     5
 */
import { serve }        from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ── Brevo ─────────────────────────────────────────────────────────
async function sendBrevo(to: string, subject: string, html: string) {
  const key  = Deno.env.get("BREVO_API_KEY")      || "";
  const name = Deno.env.get("EMAIL_FROM_NAME")    || "AfriStay";
  const addr = Deno.env.get("EMAIL_FROM_ADDRESS") || "bookings@afristay.rw";
  if (!key) { console.warn("[EMAIL] No BREVO_API_KEY — skipping"); return; }
  try {
    const r = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": key, "Content-Type": "application/json" },
      body: JSON.stringify({ sender: { name, email: addr }, to: [{ email: to }], subject, htmlContent: html }),
    });
    const d = await r.json();
    if (r.ok) console.log("[EMAIL] ✅ sent to:", to, "msgId:", d.messageId);
    else      console.error("[EMAIL] ❌ Brevo error:", JSON.stringify(d));
  } catch(e) { console.error("[EMAIL] exception:", (e as Error).message); }
}

function fmtDate(d: string) {
  try { return new Date(d + "T00:00:00").toLocaleDateString("en-US", { weekday:"short", month:"short", day:"numeric", year:"numeric" }); }
  catch { return d; }
}
function fmtMoney(n: number) { return Number(n).toLocaleString("en-RW"); }
function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST")   return json({ error: "Method not allowed" }, 405);

  const SVC_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const SB_URL  = Deno.env.get("SUPABASE_URL")              || "";
  const ORIGIN  = Deno.env.get("SITE_ORIGIN")               || "https://afristay.rw";
  const sb      = createClient(SB_URL, SVC_KEY);

  try {
    const { booking_id } = await req.json();
    if (!booking_id) return json({ error: "booking_id required" }, 400);

    console.log("[RECEIPT] Generating for booking:", booking_id);

    // Idempotency — return existing
    const { data: existing } = await sb.from("digital_receipts")
      .select("*").eq("booking_id", booking_id).maybeSingle();
    if (existing) { console.log("[RECEIPT] Already exists:", existing.receipt_number); return json({ success: true, receipt: existing }); }

    const { data: booking, error: bkErr } = await sb.from("bookings").select("*").eq("id", booking_id).single();
    if (bkErr || !booking) return json({ error: "Booking not found" }, 404);

    const { data: listing } = await sb.from("listings")
      .select("title,address,price,currency,province_id,district_id,owner_id").eq("id", booking.listing_id).single();

    const { data: owner } = await sb.from("profiles")
      .select("full_name,email,phone").eq("id", listing?.owner_id).maybeSingle();

    // Location
    let location = listing?.address || "Rwanda";
    if (listing?.district_id || listing?.province_id) {
      const [{ data: dist }, { data: prov }] = await Promise.all([
        listing?.district_id ? sb.from("districts").select("name").eq("id", listing.district_id).single() : Promise.resolve({ data: null }),
        listing?.province_id ? sb.from("provinces").select("name").eq("id", listing.province_id).single() : Promise.resolve({ data: null }),
      ]);
      location = [dist?.name, prov?.name].filter(Boolean).join(", ") || location;
    }

    const FEE_PCT       = Number(Deno.env.get("PLATFORM_FEE_PERCENT") || "5");
    const totalAmount   = Number(booking.total_amount || 0);
    const nights        = Math.max(1, Math.ceil((new Date(booking.end_date).getTime() - new Date(booking.start_date).getTime()) / 86400000));
    const pricePerNight = Number(listing?.price || Math.round(totalAmount / nights));
    const platformFee   = Math.round(totalAmount * FEE_PCT / 100);
    const currency      = listing?.currency || "RWF";

    const datePart   = new Date().toISOString().slice(0,10).replace(/-/g,"");
    const receiptNum = `RCP-${datePart}-${Math.random().toString(36).slice(2,8).toUpperCase()}`;
    const method     = (booking.payment_method || "").replace(/_/g," ").replace(/\b\w/g,(c: string)=>c.toUpperCase());

    const receiptPayload = {
      booking_id,
      receipt_number:  receiptNum,
      guest_id:        booking.user_id,
      listing_id:      booking.listing_id,
      listing_title:   listing?.title   || "AfriStay Property",
      listing_address: location,
      check_in:        booking.start_date,
      check_out:       booking.end_date,
      nights,
      price_per_night: pricePerNight,
      subtotal:        pricePerNight * nights,
      platform_fee:    platformFee,
      total_amount:    totalAmount,
      currency,
      payment_method:  booking.payment_method || "unknown",
      guest_name:      booking.guest_name  || "",
      guest_email:     booking.guest_email || "",
      guest_phone:     booking.guest_phone || "",
      owner_name:      owner?.full_name    || "Host",
    };

    const { data: receipt, error: rErr } = await sb.from("digital_receipts").insert(receiptPayload).select("*").single();
    if (rErr) { console.error("[RECEIPT] Insert error:", rErr); return json({ error: rErr.message }, 500); }

    console.log("[RECEIPT] ✅ Created:", receiptNum);

    // Confirmation email to guest
    if (booking.guest_email) {
      await sendBrevo(booking.guest_email, `✅ Booking Confirmed — ${listing?.title || "your stay"} · ${receiptNum}`, `
<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="font-family:system-ui,sans-serif;background:#f2f0ec;margin:0;padding:20px">
<div style="max-width:580px;margin:0 auto;background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.09)">
  <div style="background:#16a34a;padding:30px;color:#fff;text-align:center">
    <div style="font-size:48px;margin-bottom:8px">✅</div>
    <h1 style="margin:0 0 6px;font-size:24px;font-weight:800">Booking Confirmed!</h1>
    <p style="margin:0;opacity:.9;font-size:14px">Your stay is booked and payment confirmed</p>
  </div>
  <div style="padding:28px 30px">
    <p style="font-size:15px;color:#555;margin:0 0 20px">Hi <strong>${booking.guest_name || "Guest"}</strong>, here's your receipt.</p>
    <div style="background:#f0fdf4;border:1.5px solid #bbf7d0;border-radius:12px;padding:14px 18px;margin-bottom:20px;text-align:center">
      <p style="margin:0;font-size:11px;color:#166534;font-weight:700;text-transform:uppercase;letter-spacing:.5px">Receipt Number</p>
      <p style="margin:4px 0 0;font-size:20px;font-weight:800;color:#15803d;font-family:monospace">${receiptNum}</p>
    </div>
    <table style="width:100%;border-collapse:collapse;font-size:14px">
      <tr style="border-bottom:1px solid #f3f3f3"><td style="padding:10px 0;color:#aaa">Property</td><td style="padding:10px 0;font-weight:700;text-align:right">${listing?.title || "AfriStay Property"}</td></tr>
      <tr style="border-bottom:1px solid #f3f3f3"><td style="padding:10px 0;color:#aaa">Location</td><td style="padding:10px 0;text-align:right">${location}</td></tr>
      <tr style="border-bottom:1px solid #f3f3f3"><td style="padding:10px 0;color:#aaa">Check-in</td><td style="padding:10px 0;font-weight:700;text-align:right">${fmtDate(booking.start_date)}</td></tr>
      <tr style="border-bottom:1px solid #f3f3f3"><td style="padding:10px 0;color:#aaa">Check-out</td><td style="padding:10px 0;font-weight:700;text-align:right">${fmtDate(booking.end_date)}</td></tr>
      <tr style="border-bottom:1px solid #f3f3f3"><td style="padding:10px 0;color:#aaa">Duration</td><td style="padding:10px 0;text-align:right">${nights} night${nights!==1?"s":""}</td></tr>
      <tr style="border-bottom:1px solid #f3f3f3"><td style="padding:10px 0;color:#aaa">Rate</td><td style="padding:10px 0;text-align:right">${fmtMoney(pricePerNight)} ${currency}/night</td></tr>
      <tr style="border-bottom:1px solid #f3f3f3"><td style="padding:10px 0;color:#aaa">Payment</td><td style="padding:10px 0;text-align:right">${method}</td></tr>
      <tr style="border-bottom:1px solid #f3f3f3"><td style="padding:10px 0;color:#aaa">Host</td><td style="padding:10px 0;text-align:right">${owner?.full_name || "Host"}${owner?.phone ? " · " + owner.phone : ""}</td></tr>
      <tr><td style="padding:12px 0;font-weight:800;font-size:15px">Total Paid</td><td style="padding:12px 0;font-weight:800;font-size:20px;color:#16a34a;text-align:right">${fmtMoney(totalAmount)} ${currency}</td></tr>
    </table>
    <div style="background:#f9f9f9;border-radius:12px;padding:14px 18px;margin-top:20px;font-size:13px;color:#555;line-height:1.8">
      📋 Keep this email as your booking confirmation.<br>
      📞 Need help? Visit your <a href="${ORIGIN}/Dashboards/Profile/" style="color:#EB6753">AfriStay Dashboard</a>.
    </div>
    <a href="${ORIGIN}/Dashboards/Profile/?tab=bookings" style="display:block;margin-top:18px;padding:14px;background:#EB6753;color:#fff;border-radius:12px;text-align:center;text-decoration:none;font-weight:800;font-size:15px">View Booking Details</a>
  </div>
  <div style="background:#f9f9f9;padding:14px;text-align:center;font-size:12px;color:#bbb">AfriStay · <a href="${ORIGIN}" style="color:#EB6753">afristay.rw</a></div>
</div></body></html>`);
    }

    return json({ success: true, receipt });
  } catch(err) {
    console.error("[RECEIPT] Fatal:", err);
    return json({ error: (err as Error).message }, 500);
  }
});
