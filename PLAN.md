# PLAN — {{APP_NAME}}

Home-services marketplace for Oman: A/C maintenance in Seeb and Bawshar.
Customer website, technician app (PWA **and iPhone app with an Xcode project**), admin panel, one backend.

Status: **draft for approval. No code is written until you approve this plan and DECISIONS.md.**
Every choice I made where the brief allowed one is in DECISIONS.md, one line each (`D-xx` = build decisions, `M-xx` = money-rule interpretations you should confirm).

---

## 1. What I need from you

**Needed to start (please answer when you approve):**
1. **iPhone app approach (D-01).** My recommendation: the technician app is built once (React) and ships as a PWA and as an iPhone app from a Capacitor Xcode project (`tech/ios/App/App.xcodeproj`) with native camera, GPS, push and Keychain. The alternative is a fully native SwiftUI app. That would be a second codebase for every technician screen, and Android technicians would still need the PWA. Customers stay on the website (no install), as in §1 of the brief.
2. **Money interpretations M-01 … M-19 in DECISIONS.md.** Wherever the brief contradicts itself or leaves a case open, I chose the reading that matches the published legal text and protects the customer. Three of these matter most:
   - **M-03:** "customer absent" pays the technician the visit fee *after* our share.
   - **M-04:** the free-cancel window beats "on the way".
   - **M-10:** a quote can never be below the visit fee.

**Needed before the first deploy or TestFlight build (not blocking the start):**
3. App name, domain, booking-code prefix (default `SR`), logo. All of these are admin settings, never code.
4. Company details for legal pages and invoices: company name, CR number, address, contact email/phone, jurisdiction.
5. Apple Developer account (organisation) and the bundle ID to use, e.g. `om.yourdomain.pro`.
6. Hosting location. Under Oman's Personal Data Protection Law this is a **LEGAL GATE** question for the lawyer (D-43). Also an off-site backup target (S3-compatible bucket).
7. Thawani sandbox keys, SMS provider choice, SMTP account.
8. Whether this repository is the product's permanent home (D-03). This session can only push to `7mm41/Saqer`, so the build goes here. If you create a new repository later, the history moves over cleanly.

---

## 2. Architecture

```
                       ┌─────────────────────────────── Caddy (HTTPS, headers, CSP) ─────────────────────────────┐
 Customers (phone web) │  /            → web    Next.js: public pages (SSR), /book, /b/{code}, /t/{slug}, legal  │
 Technicians (PWA)     │  /tech/       → tech   static PWA build (same build as the iPhone app)                  │
 Technicians (iPhone)  │  (bundled)      tech   Capacitor iOS shell → calls /api directly                        │
 Staff                 │  /{ADMIN_PATH}/→ admin static SPA, only at the secret path; everything else = 404       │
                       │  /api/        → api    Fastify 5 (REST + SSE), OpenAPI                                   │
                       └─────────────────────────────────────────────────────────────────────────────────────────┘
                                  │
        api ── PostgreSQL 16 (Drizzle) ── scheduled_jobs poller (timers) ── LISTEN/NOTIFY → SSE
         │
         ├─ PaymentProvider   : mock | Thawani (sandbox)         ── webhooks (signed, idempotent)
         ├─ SmsProvider       : console | mock | Twilio | (Omani gateway when chosen)
         ├─ PushProvider      : Web Push (VAPID) | APNs (iPhone app)
         ├─ MailProvider      : SMTP
         ├─ StorageProvider   : encrypted local volume | S3-compatible
         └─ PdfRenderer       : Typst (Arabic shaping, receipts, statements)
```

- **One backend, three clients.** All business rules live in the API and `/shared`. The clients only display results and collect input.
- **Money is a ledger, not a column.** Every amount moves through balanced double-entry postings. Booking amounts are snapshots for display only.
- **Rules are data.** Every business number is a typed setting with a default, bounds, a description and a history. Legal texts render from the same settings at publish time.
- **Pluggable providers.** Payment, SMS, push, mail, storage and PDF each sit behind an interface with a mock used in tests. Live adapters refuse to run while `legal_gate_cleared = false`.

---

## 3. Repository layout

```
/api        Fastify 5 + TypeScript. Routes (zod), Drizzle schema + SQL migrations, services (money, ledger,
            booking state machine, consent, settings), scheduler, provider adapters, seed (prod / demo)
/web        Next.js (App Router), Arabic default + English, RTL. Public pages server-rendered for SEO;
            /book, /b/{code}, customer account are client islands
/tech       Technician app: Vite + React SPA. Built once → served as the PWA at /tech and bundled into iOS
  /ios/App/App.xcodeproj      the Xcode project (Capacitor 8, Swift Package Manager, no CocoaPods)
  /ios/App/Plugins/           small in-repo Swift plugins: Keychain token store, biometric unlock,
                              location integrity (simulated-location flag)
/admin      Admin SPA: Vite + React, relative base path, served only under /{ADMIN_PATH}/
/shared     zod schemas + types, money (baisa) maths, settings registry, booking state-machine table,
            i18n message files (ar, en), legal-text variable list
/ui         Design tokens (CSS variables, light/dark), self-hosted fonts, React components (§14 list)
/e2e        Playwright: ar-RTL + en-LTR × 390 px + 1280 px × light + dark; axe checks; screenshots
/deploy     docker-compose.yml, Caddyfile, Dockerfiles, install.sh, update.sh (auto-rollback),
            backup.sh / restore.sh (restic, AES-256), rotate-admin-path.sh, show-admin-path.sh
/docs       architecture.md, data-model.md (diagram), state-machine.md (generated from the table),
            security.md (threat model + what was tested), runbooks (deploy, backup, restore, key rotation)
/legacy/store-popup   the existing store-popup tool, moved here untouched (D-03)
README.md · PLAN.md · DECISIONS.md · CHANGELOG.md · .env.example · .github/workflows/
```

---

## 4. Core designs

### 4.1 Money and ledger
- All amounts are integer **baisa**. Percentages are integer **basis points**, so 15% is stored as `1500` (D-29). There are no floats anywhere in money code. A lint rule bans `parseFloat` and `toFixed` in `/shared/money` and `/api/src/money`.
- **One pure function, `priceBooking(settings, booking, events)`**, produces every split: commission, technician net, gateway fee, platform net, refund and cancel fee. The money results in the UI, the ledger postings and the legal-text examples all come from this one function. Worked examples A–F are its first unit tests.
- **Rounding (M-01):** the platform share of each line is rounded half up. The technician share is the line minus the platform share, so every split sums exactly and any remainder goes to the platform.
- **Ledger** (D-28):
  - Data model: `ledger_transactions` (one per business event, with an idempotency key) plus `ledger_entries` (lines).
  - Balance is enforced twice. A deferred database constraint trigger rejects any unbalanced transaction, and a test checks Σdebit = Σcredit for every booking in every scenario.
  - Accounts are those in §5 of the brief. `technician_payable` lines carry `technician_id` so each technician has a sub-ledger.
  - Corrections are new transactions. Nothing is ever updated or deleted.
- **Gateway fee (M-07):** posted at capture as a platform expense (estimated from the setting) and trued up by reconciliation against the provider report. It never touches the technician.
- **`escrow_mode = manual_payout`:** payouts are batches. The admin exports a bank CSV, then marks the batch paid with a bank reference, which posts `technician_payable → payouts_out`.

### 4.2 Settings
- The registry lives in `/shared/settings.ts`. Each entry has a key, type (`money_baisa | bps | minutes | hours | days | int | bool | text | json`), default, min/max, unit, Arabic and English description, and whether it may appear as a legal-text variable.
- **Storage:** values live in the `settings` table, and every change writes `settings_history` (old, new, who, reason).
- **Runtime:** values are read through a cached accessor with no restart needed. Every booking snapshots the values it depends on.
- **New settings:** every business number that appears in the brief's prose but not in the §2 list becomes a setting too (D-65). Examples: the 15-minute unpaid expiry, the 2-hour technician-cancel strike rule, the 30-day re-apply wait.
- **Legal-gate guards:** turning `legal_gate_cleared` on is refused while any required legal document is still a draft. Live payments, real SMS to non-allowlisted numbers, and open technician registration are all refused while it is off (D-36).

### 4.3 Booking state machine and timers
- **One transition table** in `/shared/booking-machine.ts` lists, for each transition: from, event, to, allowed actor roles, guards (geofence, photo count, quote ≥ visit fee, …) and effects (ledger postings, timers, notifications).
- **Enforcement:** the API runs every transition through the table inside a DB transaction that locks the row (`SELECT … FOR UPDATE`). An invalid transition returns 409, and a double accept leaves exactly one winner.
- **History:** `booking_events` is append-only and stores actor, from/to, GPS, media and note.
- **Docs and tests:** `docs/state-machine.md` (Mermaid) is generated from the table, and a test fails if the doc is stale. Every valid transition and every invalid one gets a unit test.
- **Timers** (D-21) are rows in `scheduled_jobs` (`kind, entity_id, due_at, status, attempts`):
  - A poller claims due jobs with `FOR UPDATE SKIP LOCKED`.
  - Handlers re-check state before acting, so a job that fires twice or after a restart does nothing wrong.
  - The clock is injected, so the tests fast-forward through every timer in §5.

### 4.4 Security (§13)
- **Field encryption:** AES-256-GCM with HKDF-derived sub-keys from `DATA_KEY` (one key for encryption, one for HMAC blind indexes). Ciphertexts carry a key-version prefix so keys can be rotated. A canary row makes the API refuse to start if the key cannot decrypt existing data.
- **Customer and technician sign-in:** phone OTP with a per-phone and per-IP limiter (doubling lock), a decoy delay for unknown numbers, and constant-time comparison.
- **Session tokens:** 10-minute signed access tokens plus opaque refresh tokens that are hashed in the DB, bound to a device ID, and rotated on every use, with reuse detection (D-23). The web keeps them in HttpOnly SameSite cookies; the iPhone app keeps them in the Keychain.
- **Admin sign-in:** argon2id password, TOTP, 10 one-time recovery codes, lockouts per §9.1, an 8 h absolute and 30 min idle session, and a session list with "end session".
- **Secret admin path:** the admin SPA is built with relative asset paths, and both it and its API are served only under `/{ADMIN_PATH}/`. Rotating the path is one command and needs no rebuild; the old path returns the generic 404 immediately (D-24).
- **Authorisation:** a route → roles matrix in code. Tests are generated from the matrix, covering every allowed and every forbidden role on every route, plus IDOR cases.
- **Audit log:** append-only and hash-chained (`row_hash = sha256(prev_hash ‖ canonical row)`), with a `verify-audit` command. Break-glass views of masked data require a reason and are logged.
- **Uploads:** an allow-list of types and sizes, magic-byte checks, and images re-encoded with sharp. Capture time and GPS are read *before* EXIF is stripped and stored encrypted server-side. Videos are remuxed with metadata removed. Files get random names, are encrypted at rest, and are served through signed URLs that expire in 5 minutes.
- **PII leak tests:** a test sweeps every API response, log line and error for a seeded phone number, civil ID and IBAN in clear text.

### 4.5 Legal texts and consent (§11)
- **Seeding:** the five Arabic drafts from §11b are copied verbatim into `api/src/seed/legal/*.ar.md` and seeded as version 0.1 «مسودة». The draft flag is visible in admin and cannot be removed by code.
- **Publishing:** publishing renders `{{variables}}` from the current settings into `rendered_body` and stores the snapshot. The consent row stores the SHA-256 of exactly that snapshot, so any accepted text can be reproduced byte for byte.
- **Out-of-date warning:** changing a setting that a published document uses raises "documents out of date" in admin.
- **Re-acceptance:** when a new version requires it, the technician app (new requests) and the customer's next booking are blocked until the new version is accepted on a full-screen diff page.
- **English versions** are written by you or the lawyer in the admin editor. Until then, English pages show the Arabic text with a note that the Arabic version governs (D-60).

### 4.6 Notifications (§10)
- **Templates:** seeded from the Arabic texts in §10, with English drafts. They are editable in admin and include a test-send.
- **Delivery:** push first (Web Push for the PWA, APNs for the iPhone app), falling back to SMS when the user has no push channel or delivery fails. New requests always go by push and SMS.
- **Quiet hours:** 22:00–07:00 Asia/Muscat, editable as settings. OTP, new-request and arrival messages ignore them.
- **SMS content:** never includes a phone number, full address or price breakdown. A test enforces this on every SMS template.

### 4.7 Design system and i18n (§14)
- **Tokens:** `/ui/tokens.css` defines the §14 colours on `:root`, then dark overrides under `prefers-color-scheme` and under `[data-theme]`. Contrast is checked automatically in tests.
- **Styling and components:**
  - Tailwind CSS v4 mapped onto the tokens. A lint rule **bans physical-direction classes** (`ml-`, `pr-`, `left-`, `text-right`, …) so every screen stays RTL-safe (D-08).
  - React Aria Components provide accessible primitives with built-in RTL and Arabic locale support (D-09).
  - Icons are Lucide at 24 px with a 1.75 stroke.
- **Fonts:** IBM Plex Sans Arabic and Readex Pro, self-hosted. No calls to Google Fonts, and the fonts also work offline inside the iPhone app.
- **Formatting:** `ar-OM-u-nu-latn` gives Latin digits, Arabic weekday names and ص/م time. `MoneyText` always shows 3 decimals with tabular figures.
- **Messages:** ICU message files in `/shared/i18n/{ar,en}.json` are shared by all three apps (next-intl on the web, use-intl in tech and admin). A test fails on any missing key.
- **Gallery:** a hidden component-gallery route shows every component in ar/en × light/dark, and its screenshots are the visual regression baseline.

### 4.8 iPhone app (D-01, D-49, D-50)
- **Shell:** a Capacitor 8 iOS project at `tech/ios/App/App.xcodeproj` that bundles the `/tech` build, so it works without a network connection to load.
- **Native features:**
  - Camera, with the photo library as fallback.
  - When-in-use location for "وصلت". Simulated GPS is flagged through a small Swift plugin.
  - APNs push for new requests: token-based, with a custom sound and the "time-sensitive" interruption level.
  - Haptics.
  - Face ID / Touch ID unlock.
  - Refresh token stored in the Keychain.
- **Apple requirements built into Phase 1:**
  - Arabic and English permission texts in Info.plist.
  - A `PrivacyInfo.xcprivacy` privacy manifest.
  - In-app account deletion.
  - Universal links for `/tech/jobs/{id}`.
- **Build check:** this cloud container is Linux, so it can't run Xcode. CI builds the Xcode project on a GitHub Actions macOS runner on every change to `/tech`. You open the same project in Xcode on a Mac to run it on a phone or send it to TestFlight.
- **Scope:** TestFlight for the pilot technicians is part of Phase 1. A public App Store release waits for `legal_gate_cleared` (Phase 3 items: store listing, privacy labels, review notes).

---

## 5. Order of work

Phase 0 is yours (calls, the manual paid test, the lawyer, the payment provider, the Ministry of Labour, consumer protection). The product checks `legal_gate_cleared` and runs only with the mock provider and allowlisted numbers until you set it.

**Phase 1** is large, so I split it into milestones. After each milestone I run the full test suite, commit, push and post a short note: what works, what is missing, what I decided. I stop for your approval at the end of Phase 1.

| # | Milestone | Done when |
|---|-----------|-----------|
| 1.1 | **Repo and tooling.** pnpm workspace, TS strict, ESLint/Prettier (+ RTL lint, money lint), Vitest, Playwright, CI (lint, types, tests, `pnpm audit`, gitleaks), `.env.example`, README skeleton; store-popup moved to `/legacy` | CI green on an empty skeleton |
| 1.2 | **Core domain, no UI.** Drizzle schema + migrations (all §4 tables + D-31 additions), settings registry + history, field encryption + blind index, audit hash chain, attempts limiter, money functions (examples A–F), ledger + balance invariant, booking state machine, scheduler with fake clock | All §15 unit tests for these pass on PGlite and on real Postgres 16 |
| 1.3 | **Auth, files, admin shell.** OTP flow + providers, device-bound sessions, admin password + TOTP + recovery + lockouts + session list, role matrix tests, secret-path serving + rotate command, storage + uploads (re-encode, EXIF capture, signed URLs, break-glass log) | Route × role tests and IDOR tests pass; admin sign-in works end to end |
| 1.4 | **Design system.** Tokens, fonts, every §14 component, i18n plumbing + formatters, component gallery, screenshot baseline, axe checks | Gallery passes axe and has no horizontal scroll at 390 px in all four combinations |
| 1.5 | **Legal and consent.** Seed §11b drafts, publish/render/snapshot, consent rows + hashes, re-acceptance gate, public legal pages with version list, admin legal editor + diff + consent report (CSV) | Consent-gating e2e passes; legal-gate guard refuses while drafts exist |
| 1.6 | **Technician side.** 10-step wizard with server drafts + duplicate/blocked checks + IBAN mod-97 + quiz + signature; status page; admin Applications review (checklist, approve → probation, needs-info, reject). Tech app: Home, request screen, Job details (accept → on the way → arrived with geofence + photo → diagnosis → quote builder → start → complete), Earnings (+ monthly statement PDF), My link (link + QR), Account (documents, bank change with OTP + 48 h lock, delete request), notifications centre. **iOS shell created here** and built in CI from this point on | Registration e2e with draft resume; admin approval e2e; iOS CI build green |
| 1.7 | **Customer side.** Home, how it works, services & prices, protection & warranty, coverage + waitlist, join as technician, FAQ, about, contact, legal pages; `/t/{slug}`; `/book` six screens with consent + payment (mock + Thawani sandbox); tracking `/b/{code}` with SSE, quote approve/reject, repair payment, work-done confirm / report a problem, rating, receipt PDF, cancel with refund preview, warranty revisit; minimal customer account (bookings, data export, delete) | Full happy-path e2e; reject-quote, each cancel tier, dispute e2e |
| 1.8 | **Admin.** Overview (incl. experiment panel numbers available in Phase 1), Technicians, Bookings (board + table + booking page with actions + refund preview), manual Dispatch queue, Disputes (manual decision with live money preview), Payments, Payouts (batch CSV, mark paid, holds, adjustments), Settings (values, defaults, history, flags, maintenance mode, staff, branding), minimal Catalog & Areas editor (D-33), Security & audit (sign-in history, sessions, audit search, break-glass log) | Payout batch e2e; every money action asks for a reason + second confirmation |
| 1.9 | **Notifications.** All §10 events Phase 1 touches; Web Push + APNs + SMS fallback; quiet hours; template editor + test-send | Each event has a test; SMS content test passes |
| 1.10 | **iPhone native features.** Swift plugins (Keychain, biometrics, location integrity), APNs registration, universal links, Info.plist texts, privacy manifest, app icon placeholders | macOS CI builds and runs the app's smoke test on the iOS Simulator |
| 1.11 | **Deploy.** Dockerfiles, compose (db, api, web, tech, admin, caddy), Caddy CSP/headers/HTTPS, `install.sh` (generates secrets, owner prompt with hidden input), `update.sh` (backup → migrate → health check → auto-rollback), restic nightly backup ×14 + restore drill, health endpoint, structured logs without PII, runbooks + docs | Fresh install and a forced-failure update rollback both tested locally in Docker |
| 1.12 | **Acceptance.** Full job e2e with the mock provider in ar/en, phone/desktop, light/dark; performance check; security sweep (no PII in responses/logs/errors); `docs/security.md`; CHANGELOG; written "not done" list | Report to you → wait for approval |

**Phase 2** (after approval): marketplace dispatch (batches of 3, first accept wins, timeouts, expiry refund), in-app chat with masking and flags, full disputes with SLA and appeal, ledger reports + daily closing + VAT report scaffold, reviews moderation, support inbox, broadcasts, document-expiry automation, strikes + standing + appeals, repeat-customer commission + "احجز نفس الفني", fraud-signal flags (§12), customers page, full experiment panel, complete English.

**Phase 3:** full offline queue for technician actions and photos, live location (flag), Android wrapper from the same Capacitor project, App Store / Google Play public release (privacy labels, review notes, demo account), WhatsApp Business API (flag), `provider_split` payouts if allowed, more areas and categories, annual maintenance contracts.

---

## 6. Testing

- **Unit (Vitest, PGlite):** money (A–F, rounding, every cancel tier), ledger invariant, every transition valid and invalid, every timer with a fake clock, settings history, blind indexes, IBAN, phone, consent hashing.
- **API (Vitest + real Postgres 16 in CI):**
  - every route × every role, including forbidden cases, and IDOR;
  - webhook signature checks and idempotency;
  - races: two accepts at once, double payment submit.
- **E2E (Playwright):** the §15 list in ar-RTL and en-LTR at 390 px and 1280 px, in light and dark. Axe runs on the main screens and screenshot baselines catch clipped text and horizontal scroll. A keyboard-only pass covers the admin.
- **iOS:** an Xcode build plus a Simulator smoke test (launch, sign-in screen renders RTL) on a macOS CI runner.
- **Rule:** a failing test is fixed at the cause. Tests are never skipped or deleted.

## 7. Environment notes
- This cloud container has Node 22, pnpm 10, Docker, the Postgres 16 client and Chromium for Playwright. That's enough for everything except Xcode, which runs on the macOS CI runner and on your Mac.
- No secrets are in the repository. `.env.example` lists every variable with no values, and `install.sh` generates the keys on the server.

## 8. Main risks
| Risk | Mitigation |
|------|-----------|
| The lawyer or provider changes how money may be held | Ledger and `PaymentProvider` are mode-independent; `escrow_mode` switches the flow, not the data |
| Thawani API details differ from expectations | Adapter is isolated behind the interface; the mock defines the contract; sandbox tests before any live use |
| App Store rejects a "web wrapper" (guideline 4.2) | The app is bundled (not a remote site) and uses native camera, location, push, biometrics and Keychain |
| Many technicians use Android | The PWA works for them from day one; the Android wrapper from the same project is cheap and can move from Phase 3 to Phase 2 |
| Phase 1 is large | Milestones with green tests and a push each, so progress is visible and reviewable |
