# Status — Phase 1 build

_Last updated: 2026-10-06._

## Milestones (PLAN.md §3)

| # | Milestone | State | Evidence |
|---|---|---|---|
| M1 | Foundation, CI, legacy move | Done | `pnpm lint/typecheck/test/build`, CI workflows, `legacy/store-popup` |
| M2 | Settings with history, hash-chained audit, flags, legal gate | Done | API tests: setting history, gate refuses while drafts exist, audit chain + append-only |
| M3 | Encryption, blind indexes, OTP, sessions, admin TOTP, secret path, key rotation | Done | Tests: OTP lockout, refresh-token reuse, TOTP lockout, wrong DATA_KEY refuses to start, rotation |
| M4 | Money library + ledger (D50–D57) | Done | Examples A–F, every booking ledger balances, database balance trigger |
| M5 | State machine + scheduler | Done | Valid/invalid transitions, double-accept race, timers (expiry, auto-confirm) |
| M6 | Legal documents and consent | Done (texts are drafts) | Consent rows with text hash; forced re-acceptance in the browser test |
| M7 | Registration (10 steps) + admin review | Done | API test registers and approves; admin applications page with checklist and logged document viewer |
| M8 | Technician app | Done | Browser test: accept → on the way → geofenced check-in → diagnosis → quote → finish with photos |
| M9 | Customer site | Done | Browser test: book → pay → approve quote → pay rest → confirm → rate, in English; Arabic RTL screens checked by axe and screenshots |
| M10 | Admin | Done | All pages in Arabic/English, light/dark; role matrix tested in the API; owner flow in the browser test |
| M11 | Notifications | Done (providers need keys) | Templates editable with test-send; quiet hours; push then SMS fallback |
| M12 | iPhone app | Built; compiles in Xcode (simulator); not yet run on a device or TestFlight | Xcode project `ios/Katf.xcodeproj` that builds without Node, Keychain, Face ID, camera, GPS, APNs sound, permission texts, privacy manifest; `BUILD SUCCEEDED` on GitHub's macOS runner for every change, from the repository as committed |
| M13 | Hardening | Done | axe (8 screens × ar/en × light/dark), threat model in [security.md](security.md), backup + tested restore, install/update/rollback, key and admin-path rotation verified on a local production stack |

Test counts at this commit: 43 shared unit tests, 28 API tests, 9 browser tests (5 journey + 4 accessibility).
All CI jobs pass on GitHub: checks, end-to-end, security scan, Docker build, Xcode build.

## What is not done

**Waiting on the owner** (cannot be done in code):

1. **Lawyer review** of the five legal texts (all v0.1 drafts), the open questions in DECISIONS.md F,
   eligibility rules per work status (D41), retention (D42), and whether the server may be outside Oman.
   English versions of the legal texts are not written; English pages show the Arabic text with a note that
   the Arabic governs.
2. **Company details**: name, CR number, address, jurisdiction (empty settings; legal texts show them).
3. **Payment provider** contract and live keys. The Thawani adapter is written to the provider's hosted-
   checkout + re-fetch pattern but has only run against the built-in mock; test it in the provider's
   sandbox before opening the gate.
4. **SMS provider** choice and keys (Twilio and generic HTTP adapters exist; not tested against a real
   provider).
5. **Apple Developer account**, final bundle ID, APNs key, TestFlight build ([ios.md](ios.md)).
6. **Domain, logo** (the current mark is a placeholder drawn in code), **VAT** registration.

**Technical gaps, known and accepted for now:**

- The iPhone app compiles in Xcode for the simulator (CI on macOS), but has not yet been run on a real
  iPhone or uploaded to TestFlight; that needs the Apple account (item 5 above).
- Push delivery (APNs and Web Push) and email are untested against real services.
- No uptime monitoring or error alerting beyond the health endpoint and logs. Recommended: an external
  uptime check on `/api/health` and on the backup log.
- Receipts and monthly statements are printable pages (browser "Save as PDF"), not generated PDF files.
- The website's CSP allows inline scripts (needed by Next.js without per-request nonces).
- No load test; the app and admin main bundles are about 150 KB gzipped each.
- Accessibility is checked automatically (axe); no manual screen-reader session yet.

**Phase 2 parts that exist but stay off** (switches in Settings → Switches): marketplace dispatch to
several technicians, live location, WhatsApp Business API, VAT invoices. Chat, disputes with appeal,
reports, broadcasts and the experiment panel are already usable in Phase 1.
