# DECISIONS.md — كتف (Katf)

One line each where the prompt allowed a choice. "Owner" = needs the owner's confirmation. "Legal" = depends on the lawyer. Every business number is a setting, never code.
بالعربي: كل قرار فيه سببه، وما يحتاج موافقتك أو المحامي مكتوب بوضوح.

**Owner approval, 2026-10-03:** the owner approved every decision that was waiting for them, and named the app **كتف**. Items marked **Legal** keep that mark: the owner has approved the approach, but the lawyer's answer is still required, and an owner approval cannot replace it.
بالعربي: وافقتَ في 2026-10-03 على كل القرارات التي كانت تنتظرك، واسم التطبيق «كتف». البنود القانونية تبقى بانتظار المحامي.

## A. Product and money

| # | Decision | Reason | Status |
|---|---|---|---|
| D1 | One category (A/C) in Seeb and Bawshar first | The council's verdict: one narrow market proves or kills the idea cheaply | Decided |
| D2 | Two booking entries: direct technician link (Phase 1) and marketplace request (Phase 2) | Technicians bring their first customers; no ad spend needed | Decided |
| D3 | Visit fee paid at booking, held, and **included** in the quote total | Customer never pays it twice; rejecting costs only the visit fee | Decided |
| D4 | Defaults: visit fee 5.000 OMR; commission 15% marketplace, 5% own-link and repeat; our share of visit fee on rejection 10%; failed repair 0% | Assumptions to be tested; all editable in admin | Approved 2026-10-03 |
| D5 | Payout 48 h after confirmation (72 h for first 3 jobs); auto-confirm after 24 h | Faster than platforms technicians complain about; short enough to be a selling point | Approved 2026-10-03 |
| D6 | Money stored as integer baisa; round half up per line; remainder to the platform | No floating-point errors; consistent audit | Decided |
| D7 | Double-entry ledger, append-only; corrections are new entries with a reason | Auditable, nothing silently edited | Decided |
| D8 | `escrow_mode = manual_payout` first (captured into our merchant account, shown as owed to technicians, paid by bank-transfer batches); `provider_split` later | We do not yet know if holding funds needs a licence | Approved by owner; **Legal** answer still needed |
| D9 | Gateway fee (2%) is our cost, never deducted from the technician | Keeps the technician's promise simple and visible | Decided |
| D10 | Cancellation tiers: free 10 min; 30% of visit fee if a technician accepted; 100% once he is on the way; technician no-show = full refund + strike | Protects both sides; numbers are settings | Approved 2026-10-03 |
| D11 | Warranty 14 days on the same fault, one free revisit, then refund labor (not parts), no commission | Gives customers a reason to book through us | Approved 2026-10-03 |
| D12 | Technician is paid the visit fee if he arrived (GPS + photo) even if the customer rejects the quote | The guaranteed visit fee is the main reason a good technician joins | Decided |

## B. Architecture

| # | Decision | Reason | Status |
|---|---|---|---|
| D13 | New standalone repo, own database, domain, accounts, secrets | No risk to the existing Sarena app or its data | Decided (repository: built in `7mm41/Saqer` for now, see D49) |
| D14 | pnpm monorepo: api, web, admin, shared, deploy | One place for types and money rules; shared validation | Decided (plus `tech`, see D48) |
| D15 | TypeScript strict everywhere; zod schemas in `/shared` used by api and clients | One source of truth for validation | Decided |
| D16 | API: Fastify 5 + Drizzle + PostgreSQL 16; PGlite for tests and local dev | Same stack as the earlier project; fast tests with no server | Decided |
| D17 | Web: Next.js App Router, Arabic default, RTL, English second | Public pages need SEO and server rendering | Decided |
| D18 | Technician app = installable PWA at `/tech` first; Capacitor wrappers in Phase 3 | One codebase, no store review while we are still learning | Superseded by D48 (approved 2026-10-03) |
| D19 | Customer needs no install and no password: phone + OTP at booking | Fewest steps from a WhatsApp link to a paid booking | Decided |
| D20 | Admin = separate Vite SPA, only at a secret path, never linked | Hides the panel; same approach as the earlier project | Decided |
| D21 | Live status over Server-Sent Events | Simpler than WebSockets, enough for status changes | Decided |
| D22 | Scheduler = a jobs table polled every 10 s with `FOR UPDATE SKIP LOCKED`; handlers are idempotent | No extra infrastructure; survives restarts | Decided |
| D23 | Payment behind a `PaymentProvider` interface; Thawani sandbox adapter plus a mock | Swap provider without touching business logic | Approved 2026-10-03; account still needed |
| D24 | SMS behind `SmsProvider`; push via Web Push (VAPID); WhatsApp API behind a flag | Provider can change; WhatsApp needs business approval | Approved 2026-10-03; SMS provider still needed. Push also via APNs for the iPhone app (D48) |
| D25 | Booking code = prefix + 6 random characters, not sequential | Codes cannot be guessed or enumerated | Decided (prefix `KT`, D59) |
| D26 | Arrival = within 300 m of the pin plus a photo; override only with an admin-visible flag | Proves the visit fee was earned without blocking GPS failures | Decided |
| D27 | Deployment: Docker Compose + Caddy; nightly AES-256 encrypted backups (14 kept); update script with rollback | Proven on the earlier project | Decided |

## C. Security and privacy

| # | Decision | Reason | Status |
|---|---|---|---|
| D28 | Field-level AES-256-GCM for phone, email, civil ID, birth date, IBAN, account holder, notes, references; HMAC blind indexes for lookups | A database leak exposes nothing readable | Decided |
| D29 | App refuses to start if the encryption key changed and data cannot be decrypted | Prevents silent data loss | Decided |
| D30 | Customers and technicians: OTP only (no passwords). Admins: password (argon2id) + TOTP | Fewer secrets to leak; strong control on the panel | Decided |
| D31 | Attempt limiter: 5 wrong → 15 min lock, doubling to 24 h; per-IP limits; decoy delay for unknown identities | Same protection as the earlier project | Decided |
| D32 | Uploaded files: type allow-list, magic-byte check, re-encoded, random names, private, signed URLs valid for minutes | Prevents malicious uploads and link sharing of identity documents | Decided |
| D33 | Admin roles: owner, verifier, support, finance; least privilege; documents shown masked, "reveal" needs a reason and is logged | Staff can only touch what their job needs | Decided |
| D34 | Phone numbers shared only after acceptance; chat masks numbers and "WhatsApp"; flags go to admin, never auto-ban | Reduces off-platform leakage without punishing honest people | Decided |
| D35 | No analytics or ad trackers; no personal data in logs or URLs | Privacy by default | Decided |

## D. Legal and consent

| # | Decision | Reason | Status |
|---|---|---|---|
| D36 | Five documents (technician agreement, code of conduct, cancellation/refund, customer terms, privacy); nothing pre-ticked; each has its own checkbox | Clear, provable consent | Decided |
| D37 | Each acceptance stores the version, time, IP hash, device, locale, SHA-256 of the exact text, and for technicians a typed name + drawn signature | The accepted text can always be reproduced | Decided |
| D38 | `{{setting}}` variables rendered into a snapshot at publish time; changing a setting never alters a published text | Legal text always matches what the person saw | Decided |
| D39 | New version with `requires_reacceptance` blocks technicians from new requests and customers from the next booking until accepted | Changes are binding only when accepted | Decided |
| D40 | Texts seeded as v0.1 **draft**; `legal_gate_cleared` cannot be switched on while a required document is draft | A lawyer must review first | Approved by owner; **Legal** review still needed |
| D41 | Eligibility rules per work status (Omani / expat with labour card / company) are editable configuration | Rules come from the Ministry of Labour via the lawyer | Approved by owner; **Legal** answer still needed |
| D42 | Retention: documents kept 24 months after closure (setting) | Placeholder until the lawyer decides | Approved by owner; **Legal** answer still needed |

## E. Design and quality

| # | Decision | Reason | Status |
|---|---|---|---|
| D43 | IBM Plex Sans Arabic (body) + Readex Pro (headings); Latin digits; slate ground with a copper accent; light and dark | Calm, readable, consistent with the earlier project | Decided |
| D44 | RTL first with logical CSS properties; every screen tested in RTL and LTR at 390 px and 1280 px | Most customers use phones in Arabic | Decided |
| D45 | Vitest for unit/API, Playwright for end-to-end, axe for accessibility | Standard and fast | Decided |
| D46 | Disputes decided manually by admin in Phase 1; workflow with SLA and appeal in Phase 2 | Few disputes expected at 50 services | Decided |
| D47 | Production seed contains only: owner (typed in a hidden prompt), catalog, areas, legal drafts, default settings. Demo data only with `DEMO_MODE=true` | No default or demo accounts anywhere | Decided |

## F. Still open

1. Domain and logo (the name is decided: كتف, D59). 2. Company details and court text. 3. SMS provider. 4. Payment provider contract. 5. Lawyer review (the texts, D8, D40–D42, and where the server may be hosted under the data-protection law). 6. VAT registration. 7. Apple Developer account and the app's bundle ID (needed for TestFlight in Phase 1, D48).

## G. Added after comparing with the builder's first draft (approved by the owner on 2026-10-03)

بالعربي: نقاط ظهرت عند مقارنة نسختك بمسودتي الأولى، ووافقتَ عليها كلها في 2026-10-03.

| # | Decision | Reason | Status |
|---|---|---|---|
| D48 | **iPhone app in Phase 1.** One technician codebase (`/tech`, React + Vite) ships as the PWA and as an iPhone app from a Capacitor Xcode project (`tech/ios/App/App.xcodeproj`), with native camera, GPS, push with sound (APNs), Face ID and Keychain. `/tech` is its own static-built package instead of a route inside `/web`, because the Xcode project has to bundle a static build. Replaces D18 | The first request asked for "application for iphone with xcodeproject". Web push on iPhone works only after "Add to Home Screen" (iOS 16.4+) and can't play a custom sound, so new-request alerts could be missed. A native SwiftUI app would duplicate every technician screen | Approved 2026-10-03 |
| D49 | **Repository.** Build in `7mm41/Saqer`, the only repository this build session can push to, and move to a standalone repository later with full history. The existing store-popup tool moves to `/legacy/store-popup` unchanged | D13 asks for a standalone repository; this keeps the work moving until one exists | Approved 2026-10-03 |
| D50 | **Customer not home** after the wait: the technician gets the visit fee minus our share (10% by default), the same as a rejected quote | The prompt's state machine says "kept by the technician", but cancellation-policy row 8 and agreement §7 (the texts people sign) say "after the platform's share" | Approved 2026-10-03 |
| D51 | **Free 10-minute cancel window:** cancelling inside it is always free, even if the technician already tapped "on the way". The app shows the technician when the free window ends | Policy row 1 promises it without conditions | Approved 2026-10-03 |
| D52 | Cancelling **after the free window when no technician has accepted yet** is free | The 30% fee applies only "if a technician already accepted"; row 6 refunds fully when no one accepts | Approved 2026-10-03 |
| D53 | A **quote total can never be lower than the visit fee** | The quote includes the visit fee, which the technician has already earned on arrival | Approved 2026-10-03 |
| D54 | **Failed repair (example D):** parts are reimbursed only for part lines in the approved quote with a receipt photo the admin accepted, capped at the repair payment. The technician keeps the whole visit fee, with no platform share | "Evidenced cost of parts" needs a concrete test; the customer can never be refunded less than zero | Approved 2026-10-03 |
| D55 | **Quote approved but the rest not paid** within `repair_payment_timeout_minutes` (new setting, default 30) → closed as visit-only, like a rejected quote | The prompt gives this state no timeout; a booking must never hang | Approved 2026-10-03 |
| D56 | A **probation technician's quote above** `probation_max_quote_omr` waits for admin approval before the customer sees it; the quote timer starts when the admin releases it | The customer must get the full time to decide | Approved 2026-10-03 |
| D57 | When **more than one commission rate applies** (technician override, own link, repeat customer), the lowest is used. It is fixed on the booking at creation and shown to the technician before accepting | Predictable for the technician; an override never makes their own customers more expensive | Approved 2026-10-03 |
| D58 | Numbers that appear only in the prompt's prose also become settings with history. Examples: 15-minute unpaid expiry, 2-hour technician-cancel strike rule, 30-day re-apply wait, 5 probation jobs, 48-hour bank-change lock, 3 chat flags in 30 days, quiet hours 22:00–07:00 | "Every business number is a setting, never code" | Decided |
| D59 | **App name: كتف.** Latin spelling "Katf" for English pages and the App Store [DEFAULT]; booking-code prefix `KT`, e.g. `KT-7Q4M2X` [DEFAULT]. All three are branding settings in admin, and the legal texts render the name from `{{APP_NAME}}` | Named by the owner on 2026-10-03; the Latin spelling and the prefix are my defaults and can be changed in admin without code | Approved 2026-10-03 (name); Latin spelling and prefix are defaults |
