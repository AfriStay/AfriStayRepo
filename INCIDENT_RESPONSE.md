# AfriStay Data Breach / Security Incident Response Plan

This document defines what happens if AfriStay experiences a data breach or security incident involving personal data, in accordance with Law N° 058/2021 of 13/10/2021 (Rwanda) and our obligations to the National Cyber Security Authority (NCSA) and IremboPay.

## 1. What counts as an incident
- Unauthorized access to the Supabase database, Resend account, or admin dashboard.
- Loss, theft, or exposure of user personal data (names, emails, phone numbers, bank/momo details, booking data).
- A compromised admin account or leaked service role / API key.
- Any unexpected mass data deletion or modification not traceable to a known cause.

## 2. Immediate response (first 24 hours)
1. **Contain**: rotate the affected credential immediately — Supabase service role key, anon key, Resend API key, or admin password, via the Supabase dashboard / Resend dashboard.
2. **Assess scope**: query `audit_logs` for the affected table(s) and time window to determine which records and users were touched, and by whom (`actor_id`, `actor_role`).
3. **Stop the bleeding**: if a specific admin account or API key is compromised, disable/revoke it before investigating further.
4. **Preserve evidence**: export the relevant `audit_logs` rows before any cleanup so there's a record of what happened.

## 3. Notification
- **Data Subjects**: if the breach affects personal data and creates a risk to affected users, notify them by email without undue delay, describing what happened and what to do.
- **NCSA**: notify the National Cyber Security Authority in accordance with Law N° 058/2021 if the breach is likely to result in a risk to the rights of data subjects.
- **IremboPay**: notify if the breach could affect payment-related data or the integration.

## 4. Roles
- **Josue** (Founder/Managing Director): overall incident owner, makes the call on containment actions, external notifications, and NCSA reporting.
- Until AfriStay has additional staff, all response steps above are Josue's responsibility. This section should be updated once the team grows.

## 5. Post-incident
- Document what happened, how it was found, what was affected, and what was fixed in a written post-mortem.
- Update this plan and the relevant RLS policies / access controls to close the gap that allowed the incident.

## 6. Useful queries
Check recent sensitive-table activity:
```sql
select * from audit_logs
where table_name in ('profiles','owner_wallets','payments','bookings')
order by created_at desc
limit 100;
```

---
Last updated: 30 July 2026.
