# Going Live with Real IremboPay — Do This Without Me

This is the exact, self-contained checklist to switch AfriStay from sandbox IremboPay to real live payments. You don't need an AI to do this — it's Supabase dashboard steps + one code edit.

## What's already built (don't touch this part)

- **`approve-booking` edge function** creates the actual payment invoice by calling Irembo's API. This is the real integration.
- **`irembo-webhook` edge function** receives Irembo's payment confirmation, verifies it's genuinely from Irembo (HMAC-SHA256 signature check), marks the booking as paid, and emails the guest + owner.
- **`irembo-pay` edge function** is dead placeholder code, not connected to anything real. Ignore it — safe to leave alone or delete later.

## Step 1 — Get your real Irembo merchant credentials

1. Complete and submit the Irembo Merchant Application Form (KYC) if you haven't already — this is the PDF we filled in earlier in this project. Attach: RDB registration certificate, ID, tax clearance, and your NCSA Data Controller certificate.
2. Once Irembo approves your merchant account, log into the **Irembo merchant/business dashboard** (they'll give you access after approval).
3. From that dashboard, get these three values — Irembo may call them slightly different names, but you're looking for:
   - **Secret Key** (sometimes called API Secret Key / Live Secret Key)
   - **Payment Account ID** (your merchant account identifier)
   - **Product Code** (the code representing your registered payment product/service)
4. Also find Irembo's **production API base URL** in their developer documentation (it will NOT be `sandbox.irembopay.com` — it'll be something like `api.irembopay.com`, but get the exact value from Irembo's own docs or your dashboard, don't guess).

## Step 2 — Update the 3 secrets in Supabase

1. Go to **Supabase Dashboard → your project → Edge Functions → Manage Secrets** (or Project Settings → Edge Functions → Secrets).
2. Set/update these to your **real production values** from Step 1:
   - `IREMBO_SECRET_KEY`
   - `IREMBO_PAYMENT_ACCOUNT`
   - `IREMBO_PRODUCT_CODE`
3. Save. These are used by both `approve-booking` (to create invoices) and `irembo-webhook` (to verify Irembo's signature on incoming payment confirmations) — same secret key, both places.

## Step 3 — Switch the API URL from sandbox to production

1. Open `supabase/functions/approve-booking/index.ts` in this project.
2. Find this line near the top (around line 22):
   ```ts
   const IREMBO_BASE_URL = 'https://api.sandbox.irembopay.com/payments';
   ```
3. Replace `https://api.sandbox.irembopay.com/payments` with the real production URL you got from Irembo in Step 1.
4. Save the file.

## Step 4 — Redeploy the function

Since you changed code, it has to be redeployed for the change to take effect. From a terminal in the project folder, with the Supabase CLI installed and logged in:

```
supabase functions deploy approve-booking --project-ref xuxzeinufjpplxkerlsd
```

If you don't have the Supabase CLI set up, you can instead paste the updated file content into **Supabase Dashboard → Edge Functions → approve-booking → Edit → Deploy**.

## Step 5 — Point Irembo's webhook at your site

1. In the Irembo merchant dashboard, find the **Webhook URL** setting for payment notifications.
2. Set it to your AfriStay webhook endpoint (the one behind your `api.afristay.rw` proxy — check what that URL currently is in your proxy/DNS config, since `irembo-webhook` rejects any request that doesn't come through that proxy with the correct `x-afristay-proxy-secret` header).
3. Make sure the `PROXY_SECRET` value your proxy sends matches the `PROXY_SECRET` set in Supabase's edge function secrets — if you don't already have this configured, you'll need to set the same secret value in both places.

## Step 6 — Test before fully launching

1. Make one small real booking yourself (smallest amount you can) and pay for it for real.
2. Confirm: the booking flips to "confirmed" and "paid" in the admin dashboard, you (as guest) get the confirmation email, and the listing owner gets the payout notification email.
3. Only after that real end-to-end test succeeds, announce/launch publicly.

## If something breaks

- Check **Supabase Dashboard → Edge Functions → approve-booking / irembo-webhook → Logs** — the code logs clear `[IREMBO]` / `[WEBHOOK]` prefixed messages for every step, including exactly which secret is missing or what Irembo's API responded with.
- Common failure: forgetting to update `IREMBO_BASE_URL` (Step 3) while updating the secrets (Step 2) — you'd be using real credentials against the sandbox URL, which will fail.
- Common failure: webhook signature mismatch — means `IREMBO_SECRET_KEY` in Supabase doesn't match what Irembo is actually signing with, or the proxy isn't forwarding the raw request body unmodified.

---
Written 30 July 2026. This file lives in the repo root — it doesn't depend on any AI session to exist.
