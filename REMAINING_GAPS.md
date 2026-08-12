# AfriStay — Remaining Gaps Before Launch

Status as of 30 July 2026. The backend/security audit for this session is complete and verified — everything below is what's still open.

## 1. Payments still on sandbox (biggest blocker)
IremboPay is wired up correctly in code, but still pointed at the sandbox API. Nobody can pay for a real booking until this is switched.
- Full checklist: [`IREMBO_LIVE_SETUP.md`](IREMBO_LIVE_SETUP.md)
- Short version: get live credentials from Irembo after KYC approval → update 3 Supabase secrets → change one line in `approve-booking/index.ts` (sandbox URL → production URL) → redeploy → point Irembo's webhook at your proxy → test with a real small payment.

## 2. NCSA outside-Rwanda data storage authorization not submitted
Supporting documents are ready in `Legals/` (Application Letter, Storage Architecture, DPIA, Data Flow & Sub-Processor Register — both `.html` and `.docx`), but:
- Not yet actually submitted to NCSA, as far as I know.
- The **Supabase Data Processing Agreement is still marked "to be obtained"** — you need to get this from Supabase and attach it alongside the already-signed Resend DPA.

## 3. Two dashboard-only security toggles — unconfirmed
I gave you the steps for both; I can't verify from code whether you've actually done them.
- **MFA enforcement**: Supabase Dashboard → Authentication → Providers → enable TOTP (the app-side enforcement code is already built and deployed).
- **Sign-in rate limit**: Supabase Dashboard → Authentication → Rate Limits → lower "sign-ups and sign-ins" from 100/5min to something tighter (~20/5min recommended).
- Also recommended, low effort: enable **Leaked Password Protection** (Authentication → Providers) — flagged by the security advisor as currently off.

## 4. Orphaned files in storage buckets
DB references were cleaned during the test-data wipe, but the actual files in `listing-images`, `listing-videos`, `promotion-images`, `event-images` weren't physically deleted (no delete-capable tool available from here). Cosmetic/cost issue only — go to Supabase Dashboard → Storage and clear out old test uploads if you want.

## 5. Minor/cosmetic
- Footer social media icons (Facebook/X/Instagram/LinkedIn) still link to `#` — never wired to real URLs.
- `Listings/Checkout/index.html` contains dead "Pesapal" integration code from an earlier payment provider attempt. It auto-redirects before ever rendering, so it's harmless, but worth deleting for cleanliness.

## 6. Can't be verified by code review at all
- Whether the actual product experience (listings quality, pricing, real owner onboarding flow) is ready for real users — this needs you or a real tester actually using the site, not code inspection.
