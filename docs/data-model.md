# Data model

PostgreSQL 16 (PGlite in development and tests), schema in [`api/src/db/schema.ts`](../api/src/db/schema.ts),
migrations in [`api/migrations`](../api/migrations). Money columns are `integer` baisa everywhere.

## People and access

| Table | What it holds | Protection |
|---|---|---|
| `users` | Every person: customer, technician or staff. Phone and email | Encrypted (AES-256-GCM) with a blind index for lookups |
| `technicians` | Application and profile: names, civil ID, date of birth, work status, services, areas, hours, rating, strikes, probation, booking link | Civil ID, full name, DOB, CR number, references and emergency contact encrypted |
| `technician_documents` | Civil ID photos, selfie, labour card… with expiry | Files private; every opening by staff is audit-logged |
| `technician_bank` | Bank name, IBAN, holder name, verified date, 48-hour lock after changes | IBAN and holder encrypted; IBAN blind index blocks re-use by banned people |
| `admin_accounts` | Staff role, Argon2id password hash, TOTP secret, hashed recovery codes, lock state | TOTP secret encrypted |
| `sessions` | Refresh-token families per device, last use, revocation | Only token hashes stored |
| `otp_challenges` | One-time codes for sign-in and bank changes, attempts | Only an HMAC of the code |
| `attempts` | Lock counters (doubling locks) per phone, IP hash, admin | |
| `sign_in_history` | Staff sign-ins | IP stored as a hash |
| `blocked_identities` | Banned phones, civil IDs, IBANs | Blind indexes only |

## Bookings

| Table | What it holds |
|---|---|
| `bookings` | One visit: problem, units, address (notes encrypted), pin, window, status + version, visit fee, commission rate and reason fixed at creation, money results, settings snapshot, timeline |
| `booking_events` | Every transition and action, who, where, photo — **append-only** |
| `booking_offers` | Marketplace offers to technicians (Phase 2 dispatch) |
| `quotes` | Versions of the quote: lines (labour/part/other), totals, validity, admin hold for probation technicians |
| `call_logs`, `messages` | Masked calls and the in-app chat (off-platform contact attempts are flagged) |
| `disputes` | Reason, evidence, SLA, decision and amounts, one appeal decided by a second reviewer |
| `reviews` | Ratings both ways, tags, moderation |
| `addresses` | Customers' saved addresses |

## Money

| Table | What it holds |
|---|---|
| `payments` | Visit-fee and repair payments with the provider reference; status re-fetched from the provider, never trusted from a redirect |
| `refunds` | Refunds with reason and provider reference |
| `ledger_transactions`, `ledger_entries` | Double-entry ledger — **append-only**; a deferred trigger rejects any transaction whose debits ≠ credits |
| `payable_items` | What is owed to a technician and when (`scheduled` → `held` → `in_batch` → `paid`) |
| `payout_batches`, `payouts` | Bank batches, CSV export, bank reference when paid |
| `adjustments` | Manual corrections by finance, with reason |

Ledger accounts: `customer_receipts`, `held_for_technicians`, `technician_payable`, `platform_revenue`,
`gateway_fees`, `refunds_out`, `payouts_out`.

## Legal, settings, operations

| Table | What it holds |
|---|---|
| `legal_documents` | Versions per document and language: draft flag, rendered text snapshot, settings snapshot, effective date, re-acceptance flag |
| `consents` | Who accepted which version, when, context, locale, SHA-256 of the exact text, typed name and drawn signature — can only be withdrawn (marketing), never edited or deleted |
| `settings`, `settings_history` | Every business number; history is **append-only** |
| `audit_log` | Hash-chained (`prev_hash` → `row_hash`), **append-only**; `cli verify-audit` and the admin panel re-check the chain |
| `scheduled_jobs` | Durable timers |
| `notifications`, `notification_templates`, `push_subscriptions`, `broadcasts` | Messaging |
| `files` | Uploads: random names, type checked by magic bytes, images re-encoded (metadata removed), encrypted at rest, served by signed links valid for minutes |
| `service_catalog`, `areas`, `waitlist_entries` | Services with price guides; wilayats with neighbourhood pins and radius; demand outside coverage |
| `support_tickets`, `strikes`, `quiz_attempts`, `profile_edit_requests` | Operations |

## Database guards (migration `0001_integrity.sql`)

- `ledger_check_balance` — deferred constraint trigger: each ledger transaction must balance.
- `forbid_change` on `ledger_entries`, `ledger_transactions`, `audit_log`, `booking_events`,
  `settings_history` — no update, no delete.
- `consents_guard` — the only allowed change is setting `withdrawn_at` once.
