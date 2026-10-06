# Security notes and threat model

## What we protect, from whom

| Asset | Threats | Main controls |
|---|---|---|
| Technicians' identity documents, civil IDs, IBANs | Data breach, curious staff, insider leak | Field encryption, private files with short signed links, masked by default, break-glass reveal with reason + audit, role limits (support cannot see IBAN/civil ID; finance cannot see civil ID/DOB) |
| Customers' phone and exact address | Technician contacting off-platform, scraping | Address and first name shown to the technician only after acceptance; calls via the app; chat masks phone numbers and flags off-platform attempts |
| Money | Fraud, double charges, wrong payouts, tampering | Integer baisa, double-entry ledger with a database balance check, append-only ledger, provider status re-fetched (never trusted from a redirect), idempotent webhooks, payout batches with a second confirmation, bank-change OTP + 48-hour payout lock |
| Accounts | OTP guessing, stolen sessions, staff phishing | Doubling locks per phone/IP, short access tokens + rotating refresh tokens bound to a device with reuse detection, staff Argon2id + mandatory TOTP + recovery codes, 8 h absolute / 30 min idle staff sessions |
| The admin panel | Discovery, brute force | Secret 32-character path (rotatable), plain 404 elsewhere, `noindex`, strict CSP, SameSite=Strict cookies scoped to the path, rate limits, sign-in history |
| Records | Silent edits | Hash-chained audit log, append-only tables (ledger, events, settings history, audit), consents can only be withdrawn |
| Legal exposure | Going live with unreviewed terms | Legal gate: live payments, public registration and SMS to the public stay off until every required document is lawyer-approved and the owner opens the gate |

## Controls by layer

**Transport and browser.** HTTPS only (Caddy, automatic certificates, HSTS). Content-Security-Policy per
app: the technician app and admin panel allow scripts only from the same origin; the website also
allows Next.js inline bootstrap scripts. `X-Frame-Options: DENY`, `nosniff`, a strict referrer policy,
and a permissions policy that allows only camera and location on our own origin.

**Requests.** Every body is validated with zod. Cookie-authenticated writes need the
`x-requested-with: katf` header (CSRF). CORS allows only our own origins (and the iPhone app's
`capacitor://localhost`). Return links after payment must match our origins exactly. Rate limits per IP
and stricter ones on OTP, sign-in, booking and uploads.

**Uploads.** Allowed types only, checked by magic bytes; images re-encoded (which drops location
metadata); random names; encrypted at rest; served only through signed links that expire in minutes.

**Secrets.** Only in environment files created on the server by `install.sh` (`deploy/.env`,
`deploy/backup.env`, mode 600, git-ignored). The API refuses to start if `DATA_KEY` does not match the
data (a key-check row). CI runs a secret scan over the whole git history.

**Logs.** No phone numbers, codes, addresses, IBANs, tokens or cookies. Caddy removes query strings that
carry tokens and masks client IPs. Error responses carry a code, never internal details.

**Backups.** restic (AES-256), nightly, 14 days kept, with a weekly automatic restore test that also
checks the ledger balance and the audit chain. Keep `deploy/.env` and `deploy/backup.env` offline: without
`DATA_KEY` the encrypted fields in a backup cannot be read.

**Demo data.** Only in two clearly labelled places, never on by default: the server's `DEMO_MODE` (off unless
set) and the iPhone app's offline demo, which Debug builds include and Release builds remove (D72). The public
PWA and the real admin panel are built without the demo code.

**Dependencies.** Lockfile, `pnpm audit` in CI, no analytics or ad trackers, fonts self-hosted.

## Known limits (accepted for Phase 1)

- The website's CSP allows inline scripts because Next.js needs them without per-request nonces.
- One server: no high availability. Recovery is by restore from backup (tested weekly).
- Data stays on the server the owner chooses; whether that may be outside Oman is a question for the
  lawyer (DECISIONS F.5).
- Push notification contents are short and contain no personal data, but they pass through Apple/Google.
- Rotating `DATA_KEY` needs the procedure in [runbooks.md](runbooks.md#rotate-the-data-key).

## Reporting a problem

Write to the contact address set in Settings → Brand & company. Do not include personal data of others.
