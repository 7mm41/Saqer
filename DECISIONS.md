# DECISIONS — {{APP_NAME}}

One line per choice, with the reason. `D-xx` = build decisions. `M-xx` = how I read a money or cancellation rule where the brief is ambiguous or contradicts itself. **Please confirm or correct the M-lines**; each one is a single function in `/shared/money` and has its own test.
Items marked **[CONFIRM]** are the ones I most need you to look at. **LEGAL GATE** items ship behind a flag that stays OFF.

## Money and cancellation rules (M)

- **M-01 · Rounding.** The platform's share of each line (commission, visit-fee share, cancel-fee share) is computed in baisa and rounded half up; the technician gets line − platform share — *why:* every split then sums exactly, and any half-baisa goes to the platform as the brief says.
- **M-02 · Which commission applies.** The lowest of the rates that apply: standard (or the technician's `commission_override_pct`, which replaces the standard rate only), own-link and repeat-customer. It is snapshotted on the booking at creation and shown before accept — *why:* predictable for the technician; an override never makes own-link customers more expensive.
- **M-03 · Customer absent [CONFIRM].** After `customer_wait_minutes` from arrival and at least 2 logged call attempts, the technician receives the visit fee *minus* `visit_only_platform_share_pct` — *why:* §5 says "kept by the technician", but the cancellation policy (row 8) and technician agreement §7, which people actually sign, say "after the platform's share"; I follow the signed text.
- **M-04 · Free window vs "on the way" [CONFIRM].** A cancel within `free_cancel_minutes` of booking is always free, even if the technician has already set off. The app shows the technician "يمكن للزبون الإلغاء مجاناً حتى hh:mm" — *why:* policy row 1 promises it unconditionally; this protects the customer and warns the technician.
- **M-05 · Cancel after the free window, nobody accepted yet.** Free, full refund — *why:* the late-cancel fee applies "only if a technician already accepted" (§2), and row 6 refunds fully when no one accepts.
- **M-06 · Example D (repair failed).**
  - Parts reimbursement covers only part lines from the approved quote that have a receipt photo approved by the admin.
  - It is capped at the repair payment, so the customer is never refunded less than zero.
  - The technician keeps the whole visit fee with no platform share; commission is 0.
  - *Why:* "evidenced cost of parts" needs a concrete test, and the agreement (§11) says the technician keeps the visit fee.
- **M-07 · Gateway fee.** Posted at capture as a platform expense (`gateway_fees`), estimated from `payment_gateway_fee_pct` and trued up by reconciliation. A refunded payment's fee stays our cost unless the provider returns it (then a reversal entry) — *why:* the brief makes it our cost, never the technician's; the actual fee comes from the provider report.
- **M-08 · Cancel-fee split.** For the late-cancel fee (30%) and the on-the-way fee (100%), the platform takes `visit_only_platform_share_pct` of the fee and the technician the rest; the remainder of the visit fee is refunded — *why:* Example F.
- **M-09 · Technician late beyond grace.** If the technician hasn't arrived by window end + `arrival_grace_minutes`, the customer may cancel free with a full refund, and the technician gets a strike — *why:* §2 and policy row 5.
- **M-10 · Minimum quote [CONFIRM].** A quote total can never be below the visit fee; the quote builder starts at the visit fee — *why:* the quote total *includes* the visit fee (Example A), and the technician has earned the visit fee on arrival (agreement §7), so a smaller total would mean refunding part of an earned fee.
- **M-11 · Second payment.** What the customer pays after approving = quote total − visit fee already paid — *why:* Example A (20.000 − 5.000 = 15.000).
- **M-12 · Probation quote cap.** A quote above `probation_max_quote_omr` from a probation technician goes to an admin approval queue before the customer sees it; `quote_expiry_minutes` starts when the admin releases it — *why:* §2 "without admin approval"; the customer must get the full time to decide.
- **M-13 · Warranty revisit.** A revisit (entry_mode `repeat`, parent booking) carries no charge and no commission. If the technician finds a *different* fault, they close the revisit and the customer books a normal visit — *why:* the warranty covers the same fault only; mixing new charges into a free revisit muddies the ledger and the promise.
- **M-14 · What a dispute freezes.** Only that booking's payout; the technician's other payouts continue — *why:* "payout frozen" in §5 is about the disputed money, not the person.
- **M-15 · Approved but unpaid.** If the repair payment isn't completed within `repair_payment_timeout_minutes` (new setting, default 30 [DEFAULT]), the booking closes as visit-only, like a rejected quote — *why:* §5 has no timeout for `repair_payment_pending`, and a booking must never hang.
- **M-16 · Technician cancels.** The customer always gets a full refund. A strike applies when the cancel is less than `technician_cancel_strike_hours` (2) before the window starts — *why:* §5 item 3, with the number turned into a setting.
- **M-17 · VAT (LEGAL GATE).** `vat_pct` stays 0 and `vat_invoices` stays off. Whether VAT applies to our commission only or to the full service price is for the tax adviser — *why:* the brief says switch only when VAT-registered; the taxable base is a legal question.
- **M-18 · Payout timing.** An item becomes payable at confirmation + `payout_delay_hours` (+ `new_technician_payout_delay_hours` for a technician's first `new_technician_payout_jobs` (3) jobs). A batch includes every payable item that is not held or disputed — *why:* §2; the 48 h is a promise, so the batch screen highlights items that are due.
- **M-19 · "ستستلم" on a new request.** Shows the guaranteed visit fee, what the technician gets if the customer pays only the visit (fee − visit share), and the commission % that will apply to an approved quote — *why:* the final price isn't known at request time, and the brief requires the net and the rate to be visible before accepting.

## Platform and repository (D)

- **D-01 · iPhone app [CONFIRM].** The technician app is one React codebase that ships as the PWA *and* as an iPhone app from a Capacitor 8 Xcode project (`tech/ios/App/App.xcodeproj`, Swift Package Manager), with native camera, location, APNs push, biometrics and Keychain. The iPhone app moves from Phase 3 to Phase 1 because you asked for it — *why:* a fully native SwiftUI app would duplicate ~40 technician screens and still leave Android technicians on the PWA. The native parts that matter most (new-request push with sound, GPS, camera, secure token storage) are native either way.
- **D-02 · `/tech` is its own Vite SPA** instead of living inside the Next.js `/web` app — *why:* the Xcode project must bundle a static build; Next.js can't statically export the technician area while also server-rendering the public pages.
- **D-03 · Repository home.** The product is built in `7mm41/Saqer`, the repository this session can push to. The existing store-popup tool moves untouched to `/legacy/store-popup` so the root becomes the monorepo — *why:* §3 asks for a standalone repository; if you prefer a new one, the history moves cleanly.
- **D-04 · Node 24 LTS** in Docker images and CI, with `engines >=22.12` so Node 22 still works locally — *why:* Node 22 reaches end of life on 2027-04-30, months after a likely launch.
- **D-05 · PostgreSQL 16** in production and in CI integration tests, with PGlite for fast unit tests and local dev, as the brief says — *why:* real Postgres in CI catches anything PGlite does differently.
- **D-06 · pnpm workspaces**, with no Turborepo or Nx — *why:* the toolchain is already installed and five packages don't need a build orchestrator.
- **D-07 · Packages:** `/api /web /tech /admin /shared /ui /e2e /deploy /docs`. `/ui` and `/e2e` are added to the brief's layout — *why:* three React apps share one component library, and the browser tests span all apps.

## Front end (D)

- **D-08 · Tailwind CSS v4 on top of the §14 CSS-variable tokens**, with a lint rule that rejects physical-direction classes (`ml-`, `pr-`, `left-`, `text-right`, …) — *why:* fast to build many screens, and RTL safety is enforced by a machine, not by memory.
- **D-09 · React Aria Components** as the accessible headless layer for Modal, Select, Tabs, Radio cards, etc. — *why:* the best built-in RTL, Arabic locale and keyboard/screen-reader behaviour of the headless libraries.
- **D-10 · i18n.**
  - ICU message files are shared in `/shared/i18n/{ar,en}.json`: `next-intl` on the web, `use-intl` in tech and admin.
  - Locale `ar-OM-u-nu-latn` gives Latin digits, Arabic weekday names and ص/م time.
  - *Why:* one message format across three apps, with exactly the date and number rules in §3.
- **D-11 · Fonts self-hosted** (IBM Plex Sans Arabic, Readex Pro; both OFL), with no Google Fonts requests — *why:* no third party sees our visitors, and fonts work offline in the iPhone app.
- **D-12 · Icons:** `lucide-react`, 24 px, 1.75 stroke — *why:* §14.
- **D-13 · Forms:** react-hook-form with the same zod schemas the API uses — *why:* one validation source; client errors match server errors.
- **D-14 · Data fetching:** TanStack Query in tech and admin; TanStack Table with server-side pagination in admin — *why:* caching and retries on weak connections; §15 requires server-side pagination.
- **D-15 · Maps:** MapLibre GL with a self-hosted Protomaps (PMTiles) extract of Muscat Governorate, served by Caddy, and OpenStreetMap attribution. "افتح الخريطة" uses Google/Apple Maps deep links — *why:* no map vendor sees customer locations and there are no per-request map fees; deep links need no API key.
- **D-16 · ETA:** the technician picks it (10/20/30/45/60 min) when tapping «أنا في الطريق». The request card shows straight-line distance labelled «تقريباً» — *why:* no routing API is needed in Phase 1; live location is Phase 3 behind its flag.
- **D-17 · Coverage check:** the pin must fall within a per-neighbourhood radius of that neighbourhood's centre point (editable in admin); polygons can come later — *why:* reliable enough for two wilayats with no boundary dataset to license.
- **D-18 · Booking draft:** saved in the browser for 24 h, never containing the OTP or tokens, and cleared after payment — *why:* §8.3 "a refresh loses nothing" without keeping secrets.
- **D-19 · A hidden component-gallery route** instead of Storybook — *why:* fewer dependencies; the same page doubles as the visual-regression baseline.
- **D-20 · PDFs (receipts, monthly statements) are rendered with Typst** and our bundled fonts — *why:* correct Arabic shaping and right-to-left text from a small single binary, with no headless browser in the API container. Headless Chromium is the fallback if a layout needs it.

## Back end (D)

- **D-21 · Timers are rows in a `scheduled_jobs` table**, claimed by a poller with `FOR UPDATE SKIP LOCKED`. Handlers re-check state, and the clock is injected — *why:* idempotent and resumable after restart, testable with a fake clock, and no extra queue service.
- **D-22 · Real-time:** Server-Sent Events, fanned out through Postgres `LISTEN/NOTIFY` — *why:* §3; no Redis needed, and it still works with more than one API instance.
- **D-23 · Sessions.**
  - Access tokens are signed and last 10 minutes.
  - Refresh tokens are opaque, stored hashed, bound to a device ID, rotated on every use, and reuse revokes the whole family.
  - The web keeps them in HttpOnly SameSite cookies; the iPhone app keeps them in the Keychain.
  - *Why:* §13 asks for short access tokens, device binding and rotation, and the Keychain is the right store on iOS.
- **D-24 · Admin path.**
  - The admin SPA is built with relative asset paths; it and its API are served only under `/{ADMIN_PATH}/`, and every other admin URL returns the generic 404.
  - Rotation is `deploy/rotate-admin-path.sh` (env change + reload, no rebuild).
  - *Why:* §9.1 says the old path must stop at once and the path is never baked into a build artifact.
- **D-25 · Admin sign-in:** argon2id (OWASP-recommended parameters), TOTP via `otpauth`, 10 recovery codes shown once and stored hashed. Unknown emails take the same time as known ones — *why:* §9.1.
- **D-26 · Field encryption.** AES-256-GCM with HKDF sub-keys derived from `DATA_KEY`: one for encryption, one for the HMAC blind index. Ciphertexts carry a key-version prefix, and a boot-time canary check makes the app refuse to start if the key is wrong — *why:* §4 and §13, plus key rotation without a big-bang re-encryption.
- **D-27 · Audit log:** hash-chained rows plus a `verify-audit` command; the database user the app runs as cannot UPDATE or DELETE that table — *why:* §4 "append-only, hash-chained" must hold even against an app bug.
- **D-28 · Ledger structure.** `ledger_transactions` (one per business event, with an idempotency key) plus `ledger_entries` (lines). A deferred constraint trigger rejects unbalanced transactions, and `technician_payable` lines carry `technician_id` — *why:* balance is guaranteed by the database as well as by tests, and each technician gets a sub-ledger for statements.
- **D-29 · Units:** money settings are stored in baisa and edited as OMR with 3 decimals. Percentages are stored as basis points (15% → 1500) and edited as a percent with up to 2 decimals — *why:* no floats anywhere, and the owner can still enter 12.5%.
- **D-30 · Booking code:** `{prefix}-{6-digit counter}-{4 Crockford-base32 chars}`, e.g. `SR-000123-K7QM`, with the prefix as the setting `booking_code_prefix` (default `SR`) — *why:* §4 "never sequential-guessable"; the prefix follows the brand you choose.
- **D-31 · Tables added to the §4 model:**
  - `sessions`, `otp_challenges`, `devices`, `push_subscriptions`
  - `scheduled_jobs`, `idempotency_keys`, `webhook_events`
  - `ledger_transactions`, `files` (metadata, sha256, encrypted capture time and GPS)
  - `quiz_attempts`, `call_logs`, `profile_edit_requests`, `waitlist_entries`, `booking_offers` (used by Phase 2 dispatch)
  - Technician wizard drafts are stored as JSON on the `technicians` row while its status is `draft`
  - *Why:* each one backs a feature or rule the brief requires but whose storage it doesn't list.
- **D-32 · File storage.**
  - Behind a `StorageProvider` interface. Phase 1 uses an encrypted local volume (per-file AES-256-GCM); an S3 adapter is ready for any S3-compatible host.
  - Images are re-encoded with sharp after `exifr` reads the capture time and GPS. Videos are capped at 30 s / 25 MB and remuxed with ffmpeg with all metadata removed.
  - *Why:* §3 and §13; there's no dependency on a particular object-storage product until you pick a host.
- **D-33 · A minimal Catalog & Areas editor ships in Phase 1**, although §17 lists it later. Price-guide bands start empty and are hidden until you fill them — *why:* "no fake data in production". I won't invent Omani A/C prices, and quote-band flagging needs your numbers.
- **D-34 · OpenAPI:** generated from the route zod schemas (`fastify-type-provider-zod` + `@fastify/swagger`) and checked into `/docs` by CI — *why:* §3; the spec cannot drift from the code.
- **D-35 · Payments.**
  - A Thawani adapter using its hosted checkout, in sandbox only; a mock adapter defines the contract.
  - Every webhook is signature-checked in constant time and stored in `webhook_events` with a unique provider event ID.
  - *Why:* §3 and §13; we never handle card data, and replays are harmless.

## Scope and safety (D)

- **D-36 · Before `legal_gate_cleared`:**
  - Live payment keys are refused.
  - SMS goes only to numbers in `sms_allowlist`.
  - Technician registration accepts only phones in `registration_allowlist` (your pilot technicians).
  - *Why:* §18; this makes the Phase 0 pilot possible without opening anything to the public.
- **D-37 · Phase 1 dispatch.** Direct-link bookings only.
  - If the technician doesn't accept in time, the booking goes to the admin's manual dispatch queue.
  - On a paused or on-vacation technician's page, "اطلب فنّياً آخر" also creates a request in that queue.
  - *Why:* §17 Phase 1; the marketplace is Phase 2.
- **D-38 · The warranty revisit ships in Phase 1** — *why:* the public "الحماية والضمان" page and Example D promise it, and it sits inside the state machine.
- **D-39 · Phase 1 call button** is a `tel:` link shown only after acceptance; every tap is logged. In-app chat is Phase 2 — *why:* §12 "shared only after acceptance, through logged call buttons"; chat masking is a Phase 2 item.
- **D-40 · A minimal customer account ships in Phase 1:** my bookings, «تنزيل بياناتي», «حذف حسابي» — *why:* §13 data rights are "non-negotiable"; the rest of §8.5 is Phase 2.
- **D-41 · Notification fallback.** Push first. SMS when there's no push channel or push delivery fails. New requests go by push *and* SMS — *why:* §10 "push first, SMS fallback", and §10 explicitly says push + SMS for new requests.
- **D-42 · Message providers:**
  - SMS: console (dev), mock (tests), Twilio, and an Omani gateway adapter once you choose one.
  - Email: SMTP via nodemailer.
  - Push: Web Push (VAPID) and APNs (token-based `.p8` key).
  - *Why:* §3; nothing is locked to one vendor.
- **D-43 · Hosting (LEGAL GATE).**
  - Single server, Docker Compose (db, api, web, tech, admin, caddy).
  - Whether the server must be in Oman, or where it may be, is for the lawyer under the Personal Data Protection Law (cross-border transfer rules).
  - *Why:* §3 compose; data location is a legal question I must not guess.
- **D-44 · Backups:** restic (AES-256), nightly database dump plus the files volume, keep 14. Off-site target recommended, with a scripted restore drill that is tested — *why:* §3 and §13; a backup on the same disk is not a backup.
- **D-45 · No analytics in Phase 1.** The experiment panel is computed from our own database — *why:* §13 and §18; no tracker is needed to measure the pilot.
- **D-46 · Documents required per work status (LEGAL GATE)** are an editable JSON setting, seeded with the documents named in §6 step 3 and marked "pending lawyer confirmation" — *why:* the brief says the eligibility rules come from the Ministry of Labour via the lawyer, as configuration, not code.
- **D-47 · Training lessons and quiz.** I draft the five lessons and the 10 questions from the brief's own rules; they are marked draft for your review — *why:* the brief describes the topics but not the text; the content is operational, not legal.
- **D-48 · Bank list:** an editable setting seeded with §6 step 7's list. IBAN validation: `OM` + 21 characters (23 total) + mod-97 — *why:* banks change; the format check is fixed by the standard.

## iPhone app (D)

- **D-49 · iOS details.**
  - Minimum iOS 16 [DEFAULT].
  - Small Swift plugins in the repo: Keychain token store, Face ID / Touch ID unlock, location-integrity check that flags simulated GPS.
  - APNs new-request alerts use a custom sound and the "time-sensitive" level.
  - Arabic and English permission texts, `PrivacyInfo.xcprivacy`, in-app account deletion, universal links for job deep links.
  - *Why:* Apple's review rules (account deletion, privacy manifest), §12 fraud signals, and the least third-party code on the security path.
- **D-50 · Building the iPhone app.** This cloud container is Linux with no Xcode, so a GitHub Actions macOS job builds the Xcode project and runs a Simulator smoke test on every `/tech` change. You open the same project in Xcode to run it on a phone or upload to TestFlight — *why:* the only way to verify iOS builds from here; macOS CI minutes cost more, so it runs only when `/tech` changes.
- **D-51 · No customer iPhone app in Phase 1** — *why:* §1 says customers book on the web with no install; a second app target can be added later from the same project.

## Tooling and process (D)

- **D-52 · Tooling:** TypeScript strict, ESLint (flat config, typescript-eslint, jsx-a11y) + Prettier, Vitest, Playwright + @axe-core/playwright, gitleaks and `pnpm audit` in CI — *why:* §15 and §16.
- **D-53 · Time:** timestamps are stored as UTC `timestamptz` and shown in Asia/Muscat via `@date-fns/tz`; slots are computed in Muscat time — *why:* §3; Oman has no daylight saving, but explicit zones keep tests honest.
- **D-54 · Placeholders.** `{{APP_NAME}}`, logo, company name, CR number, address, contact details and jurisdiction are settings filled in admin; the code uses the neutral package scope `@app/*` — *why:* the brief left them blank, and §14 says the name and logo are uploaded in admin.
- **D-55 · The earlier project (Sarena) is not available in this session**, so its security patterns are written fresh to the same §13 rules — *why:* nothing to reuse here, and no data or accounts are shared in any case.
- **D-56 · Phase 1 runs as milestones 1.1–1.12** (PLAN.md §5). Each one: tests green, commit, push, short note. I stop for your approval at the end of Phase 1 — *why:* the brief's Phase 1 is very large; visible progress and early correction beat one huge report.
- **D-57 · The installed `ui-ux-pro-max` skill is used to review screens** (accessibility, touch targets, contrast, RTL) during the UI milestones — *why:* a second checklist against §14 and §15 at no cost.
- **D-58 · Security thresholds** (OTP, lockouts, per-IP limits) are settings, with minimums that can't be set below the brief's values; generic request-rate limits are deployment config — *why:* they're editable like other rules but can't be weakened by accident.
- **D-59 · The public technician name** is the first name plus the family-name initial, taken from the ID name and confirmed by the technician in the wizard. Changes go through admin approval — *why:* §7 shows exactly this, and it prevents impersonation via a free-text name.
- **D-60 · English legal texts** are written by you or the lawyer in the admin editor. Until then, English pages show the Arabic text with a note that the Arabic version governs — *why:* only Arabic drafts were provided, and a translation is a second legal text that needs review.
- **D-61 · Quotes outside the price band** are flagged for admin review and never blocked — *why:* §7.3.
- **D-62 · Quote expiry reminder:** at half of `quote_expiry_minutes` (30 of 60); an expired quote is then treated as rejected — *why:* §5 says "after a reminder" without a time.
- **D-63 · Repeated declines** are shown only as a tip in "my standing", never penalised — *why:* §7.2.
- **D-64 · Demo data** exists only behind `DEMO_MODE=true`, from a separate seed, with a visible «بيانات تجريبية» banner on every screen — *why:* §0.
- **D-65 · New settings.** Every business number in the brief's prose that isn't in the §2 list also becomes a setting with history. Each one, with its default:

  | Setting | Default |
  |---|---|
  | `payment_expiry_minutes` | 15 |
  | `technician_cancel_strike_hours` | 2 |
  | `reapply_after_days` | 30 |
  | `probation_jobs` | 5 |
  | `new_technician_payout_jobs` | 3 |
  | `bank_change_lock_hours` | 48 |
  | `otp_resend_seconds` | 60 |
  | `otp_lock_minutes` | 15, doubling to 24 h |
  | `admin_lock_attempts` | 5 |
  | `admin_ip_lock_attempts` | 20 |
  | `chat_flags_for_review` | 3 in 30 days |
  | `review_window_days` | 7 |
  | `repair_payment_timeout_minutes` | 30 |
  | `quiet_hours` | 22:00–07:00 |
  | `max_booking_photos` | 5 |
  | `work_photos` | 3–10 |
  | `bio_max_chars` | 300 |
  | `problem_text_max_chars` | 500 |
  | `quiz_pass_pct` | 80 |
  | `booking_days_ahead` | 7 |
  | `slot_length_minutes` | 120 |
  | `booking_code_prefix` | SR |
  | `sms_allowlist` | empty |
  | `registration_allowlist` | empty |

  *Why:* §0 says every business-rule number lives in settings.
