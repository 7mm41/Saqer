# PLAN.md — كتف (Katf)

Status: **Approved by the owner on 2026-10-03** (every decision that waited for the owner, see DECISIONS.md). No code has been written yet; Phase 1 starts when the owner says so (G0).
بالعربي: هذه خطة العمل، وسُجّلت موافقتك عليها في 2026-10-03. يبدأ الكود عند وصول كلمة «ابدأ المرحلة الأولى»، وكل مرحلة تنتهي بتقرير وتنتظر موافقتك.

Product: **كتف**, a marketplace where customers in Oman book a verified home-service technician. Launch category: A/C maintenance and repair. Launch area: Seeb and Bawshar. Three surfaces on one backend: customer website, technician app (PWA **and iPhone app from an Xcode project**, D48), admin panel.

---

## 1. Gates before and during the build

| Gate | Who | What must be true | Enforced by |
|---|---|---|---|
| G0 | Owner | 5 technicians called, at least 3 accept the terms. A manual paid test (5 strangers pay in advance, half of the technicians reached accept). | Owner tells me to start Phase 1. |
| G1 | Owner + lawyer | Legal texts reviewed by a licensed Omani lawyer. Written answers on: holding customer money, who may work (Ministry of Labour), consumer-protection rules for the visit fee, data retention. | Setting `legal_gate_cleared`. While false: mock payments only, no public SMS, no public registration. |
| G2 | Owner | Payment-provider account and contract. | Production keys exist only on the server. |

بالعربي: البوابة 0 هي المكالمات والتجربة اليدوية، والبوابة 1 هي المحامي، والثالثة حساب الدفع. حتى تُفتح لا يعمل الدفع الحقيقي ولا التسجيل العام.

## 2. Architecture

```
 customer phone ────► web (Next.js, ar/en, RTL) ─────────┐
 technician phone ──► tech (React PWA at /tech) ──────────┤
 technician iPhone ─► tech iOS app (Xcode, Capacitor) ────┼──► api (Fastify 5, TypeScript)
 owner/staff ───────► admin (Vite SPA, secret path) ──────┘      │
                                                                  ├─ PostgreSQL 16 (field-encrypted PII, ledger, audit log)
                                                                  ├─ private file storage (signed URLs)
                                                                  ├─ scheduler (jobs table, idempotent)
                                                                  ├─ SSE (live booking status)
                                                                  └─ providers: Payment · SMS · Push (Web Push, APNs) · (WhatsApp, flag)
 caddy (HTTPS) in front of web, tech, api and admin
```

Repository layout (in `7mm41/Saqer` for now, D49)

```
/api        Fastify routes, services, state machine, ledger, scheduler, providers, drizzle schema + migrations
/web        Next.js: public site, booking flow, tracking page
/tech       Technician app (React + Vite): served as the PWA at /tech and bundled into the iPhone app
  /ios/App/App.xcodeproj   the Xcode project (Capacitor, Swift Package Manager)
/admin      React + Vite control panel
/shared     zod schemas, types, money library, i18n keys, status enums
/deploy     docker-compose, Caddyfile, install.sh, update.sh (rollback), backup.sh, restore.sh
/docs       architecture, data model, state machine, security notes, runbook
/legacy/store-popup   the earlier store-popup tool, unchanged
PLAN.md  DECISIONS.md  README.md  CHANGELOG.md  .env.example
```

## 3. Phase 1 — the smallest real product

> Build status: see [docs/status.md](docs/status.md).

Order of work. Each milestone is finished, tested and committed before the next starts.

| # | Milestone | Done when |
|---|---|---|
| M1 | Foundation: monorepo, CI (lint, types, tests, audit), Docker dev setup, PGlite for tests, `.env.example`, secrets rules; store-popup moved to `/legacy` | `pnpm test` and CI pass on an empty app; no secret in the repo |
| M2 | Settings with history, audit log (append-only, hash-chained), feature flags, `legal_gate_cleared` | Changing a setting writes history; legal gate blocks live payments in a test |
| M3 | Security base: field encryption + blind indexes, attempt limiter, OTP, sessions, admin password + TOTP, secret admin path | Tests: lockouts, decoy delay, key-mismatch refuses to start, no PII in logs |
| M4 | Money library + ledger (including the readings D50–D57) | Examples A–F from the prompt pass; debits equal credits for every generated booking (property test) |
| M5 | Booking state machine + scheduler | Every valid and invalid transition tested; timers resume after restart; double-accept race gives exactly one winner |
| M6 | Legal documents and consent | Draft seeded as v0.1 and flagged; consent rows store text hash; forced re-acceptance works |
| M7 | Technician registration (10 steps) + status page + admin application review | Draft resumes on another device; duplicate civil ID/phone/IBAN blocked; verifier decisions logged |
| M8 | Technician app (`/tech`): home, request, job flow (on the way → arrived → diagnosis → quote → complete), earnings, my link and QR, account. The iPhone Xcode project is created here and built by CI on a Mac runner from then on | A technician completes a full job on a phone-size browser with the mock provider; the Xcode project builds in CI |
| M9 | Customer site: public pages, technician link page, 6-screen booking with consent and payment, tracking, quote approval, report a problem, rating | A customer books, approves, confirms and rates end to end in Arabic RTL and English |
| M10 | Admin: overview, applications, technicians, bookings, disputes (manual decision), payments, payouts (batch CSV, mark paid), settings, legal documents + consent report, audit log | Each role sees only what it should (tests per role) |
| M11 | Notifications for every Phase-1 event (SMS + push, templates editable) | Template test-send in admin; quiet-hours rule tested |
| M12 | iPhone app: native camera, GPS with a simulated-location flag, new-request push with sound (APNs), Face ID, sign-in kept in the Keychain, account deletion inside the app, privacy manifest, Arabic and English permission texts | The full technician job flow runs on the iOS Simulator in CI; a TestFlight build installs on a real iPhone |
| M13 | Hardening: threat-model note, axe checks, performance pass, backup + tested restore, install/update scripts | Section 15 of the prompt is green; a written list of what is not done |

Out of Phase 1 on purpose: marketplace dispatch, chat, full dispute workflow, ledger reports, live location, the Android wrapper, public App Store and Google Play releases.

## 4. Phase 2 — marketplace and operations (after Phase 1 is approved)

Dispatch in batches of 3 (first accept wins, timeouts, expiry refund); in-app chat with masking and flags; disputes with SLA and appeal; ledger reports and daily closing; review moderation; support inbox; broadcasts; document-expiry automation; strikes and standing; repeat-customer commission; experiment panel; English complete.

## 5. Phase 3 — scale

Offline queue for technician actions and photos; live location behind a flag; Android wrapper for Google Play and the public App Store release (the iPhone app itself is built in Phase 1); WhatsApp Business API; provider-split payouts if the provider and the lawyer allow; more areas and categories; annual maintenance contracts.

## 6. Testing and quality

- Unit: money, ledger, state machine, timers, fee tiers, strikes, IBAN checksum, phone validation, consent hashing.
- API: every route × every role, including forbidden cases; webhook idempotency; races on accept and payment.
- End-to-end (Playwright): technician registration; consent gating; book and pay; full job to payout batch; reject quote; cancel at each tier; dispute; admin approval; legal publish and re-acceptance. Phone (390 px) and desktop, Arabic RTL and English, light and dark.
- iPhone: Xcode build and a Simulator run of the technician flow on a macOS CI runner (the build environment is Linux and cannot run Xcode).
- Security: no response, log or error contains a phone, civil ID or IBAN in clear.

## 7. Risks and how the plan answers them

| Risk | Answer in the plan |
|---|---|
| Customers and technicians move to WhatsApp after job one | Warranty, one-tap rebook, receipts, low own-customer and repeat commission, masked numbers in chat, flags (not bans) |
| Legal limits on holding money / who may work | Gates G1; `manual_payout` first; eligibility rules are configuration, not code |
| Thin margin per job (about 0.60–2.60 OMR on a 20 OMR job) | Settings are editable; experiment panel shows real margin per job; Phase 3 adds recurring contracts |
| Fraud and fake arrivals | Geofence + photo, mock-location flag, duplicate-identity flags, probation limits |
| Identity data leak | Field encryption, blind indexes, signed URLs, break-glass logging, backups encrypted |
| Cold start (no technicians, no customers) | Direct-link bookings first: technicians bring their own customers |
| App Store rejects a wrapped web app | The iPhone app bundles its own code and uses native camera, GPS, push, Face ID and Keychain |

## 8. Environments and deployment

Local: Docker Compose + PGlite for tests. Staging: same compose file with test keys and mock providers. Production: Docker Compose (db, api, web, admin, caddy; the `/tech` PWA is static files served by caddy) on the VPS, automatic HTTPS, nightly AES-256 encrypted backup (14 kept) with a tested restore, one-command install, one-command update with rollback, health endpoint, logs without personal data. iPhone builds go to TestFlight from Xcode or CI.

## 9. What I need from the owner before Phase 1 starts

1. ~~App name~~ **كتف** (decided, D59). Logo and domain still needed.
2. Company name, commercial registration number, address, contact email and phone, court/jurisdiction text.
3. SMS provider choice and account.
4. Payment provider account (sandbox is enough for Phase 1 testing).
5. ~~Confirmation of the default numbers~~ confirmed on 2026-10-03 (D4, D5, D10, D11).
6. Lawyer review of the draft legal texts.
7. Review time promised to applicants (default: one to two working days).
8. Whether the company is VAT-registered.
9. Apple Developer account and the app's bundle ID (now needed in Phase 1 for TestFlight, D48); Google developer account (Phase 3).
