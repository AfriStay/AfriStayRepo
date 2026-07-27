/**
 * Edge Function: send-sms
 * ════════════════════════════════════════════════════════════════
 * Sends SMS via Twilio. Called internally by other edge functions.
 *
 * SMS TRIGGERS:
 *   guest  → booking submitted    "Your booking request was sent. Ref: AS-XXXXX"
 *   owner  → new booking          "New booking for [listing]. Approve: [link]"
 *   guest  → booking approved     "Approved! Complete payment: [link]"
 *   guest  → booking confirmed    "Confirmed! Check-in [date]. Ref: [ref]"
 *   guest  → payment failed       "Payment failed: [reason]. Retry: [link]"
 *   guest  → booking rejected     "Your booking was declined. No payment taken."
 *   owner  → payout sent          "Payout of [amount] RWF sent to your MoMo."
 *
 * DEPLOY:
 *   supabase functions deploy send-sms --no-verify-jwt
 *
 * SECRETS:
 *   TWILIO_ACCOUNT_SID   from twilio.com dashboard
 *   TWILIO_AUTH_TOKEN    from twilio.com dashboard
 *   TWILIO_FROM_NUMBER   your Twilio number e.g. +12015551234
 *   SITE_ORIGIN          https://afristay.rw
 * ════════════════════════════════════════════════════════════════
 */

import { serve }        from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ── CORS — must include apikey for Supabase client requests ───────
const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

  try {
    const body = await req.json();
    const { to, message, booking_id, message_type, recipient_type } = body;

    if (!to || !message) return json({ error: "to and message are required" }, 400);

    const result = await sendSMS(to, message);

    // Log to sms_log table
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")              || "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""
    );

    await sb.from("sms_log").insert({
      booking_id:      booking_id      || null,
      recipient_phone: normalisePhone(to),
      recipient_type:  recipient_type  || "guest",
      message_type:    message_type    || "general",
      twilio_sid:      result.sid      || null,
      status:          result.success  ? "sent" : "failed",
      error:           result.error    || null,
    }).catch(e => console.error("[SMS] Log error:", e));

    if (!result.success) {
      console.error("[SMS] Failed to send to", to, ":", result.error);
      return json({ success: false, error: result.error }, 200); // 200 so callers don't crash
    }

    console.log("[SMS] ✅ Sent to", normalisePhone(to), "SID:", result.sid);
    return json({ success: true, sid: result.sid });

  } catch(err) {
    console.error("[SMS] Error:", err);
    return json({ success: false, error: (err as Error).message }, 500);
  }
});

async function sendSMS(to: string, body: string) {
  const SID   = Deno.env.get("TWILIO_ACCOUNT_SID")  || "";
  const TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN")    || "";
  const FROM  = Deno.env.get("TWILIO_FROM_NUMBER")   || "";

  if (!SID || !TOKEN || !FROM) {
    console.warn("[SMS] Twilio not configured — skipping SMS");
    return { success: false, error: "Twilio credentials not set", sid: null };
  }

  const phone = normalisePhone(to);
  if (!phone) return { success: false, error: "Invalid phone number: " + to, sid: null };

  try {
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${SID}/Messages.json`,
      {
        method:  "POST",
        headers: {
          "Authorization": "Basic " + btoa(SID + ":" + TOKEN),
          "Content-Type":  "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ To: phone, From: FROM, Body: body }).toString(),
      }
    );
    const data = await res.json();
    if (res.ok && data.sid) return { success: true, sid: data.sid, error: null };
    return { success: false, sid: null, error: data.message || JSON.stringify(data) };
  } catch(e) {
    return { success: false, sid: null, error: (e as Error).message };
  }
}

// Accepts: 0781234567 / 250781234567 / +250781234567 / +447911123456
// Returns E.164: +250781234567 / +447911123456
function normalisePhone(raw: string): string {
  const trimmed = (raw || "").trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("+")) {
    const d = trimmed.slice(1).replace(/\D/g, "");
    return (d.length >= 7 && d.length <= 15) ? "+" + d : "";
  }
  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("0") && digits.length === 10) return "+250" + digits.slice(1); // Rwanda local
  if (digits.startsWith("250") && digits.length === 12) return "+" + digits;           // Rwanda with code
  if (digits.length >= 7 && digits.length <= 15) return "+" + digits;                  // International
  return "";
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status, headers: { ...CORS, "Content-Type": "application/json" },
  });
}
