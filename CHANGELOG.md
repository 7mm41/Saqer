# Changelog

All notable changes. Dates are Muscat time.

## 0.1.1 — 2026-10-06

### Changed
- **Repository layout** (D71): `apps/` (api, web, tech, admin), `packages/` (shared, ui), `tests/e2e`, and
  the iPhone project at `ios/`. Docker, CI, lint checks and docs follow the new paths.
- **iPhone app**: the Xcode project is now `ios/Katf.xcodeproj` (target and scheme "Katf") and builds
  straight after cloning, without Node: the app's web bundle and the Capacitor plugin sources are committed
  under `ios/` and refreshed with `pnpm ios:sync` (CI checks they are current, then builds the committed
  project on macOS without installing Node). The server address is the Xcode build setting `KATF_API_URL`.

### Fixed
- Sign-in codes, call logs, strikes and chat messages take their creation time from the app's clock, like
  the checks that read them (resend wait, two-calls-before-absent, appeal window, flagged-chat window).
  Before, the database's own clock was used, which only matched by coincidence in tests.

## 0.1.0 — 2026-10-03 (Phase 1 build, not live)

### Added
- **API**: integer-baisa money library and double-entry ledger with a database balance check; booking state
  machine with compare-and-set and durable timers; OTP sign-in with doubling locks; device-bound rotating
  refresh tokens; staff passwords (Argon2id) + mandatory TOTP + recovery codes; field encryption with blind
  indexes and key rotation; legal documents with versioned consent and forced re-acceptance; payouts in bank
  batches; disputes with one appeal; notifications (push first, SMS fallback, quiet hours); hash-chained
  audit log; mock and Thawani payment providers.
- **Customer website** (Next.js): public pages, technician link pages with QR, 6-step booking, tracking,
  quote approval, confirmation, rating, receipts, account, waitlist outside coverage.
- **Technician app**: PWA at `/tech` and iPhone app (Capacitor Xcode project): 10-step application,
  request cards with countdown, the full job flow with geofenced check-in and photos, earnings and monthly
  statements, my link, schedule, documents, reviews, Face ID, Keychain, APNs push with its own sound.
- **Admin panel** under a secret, rotatable path: overview with the experiment panel, applications,
  technicians, customers, bookings, dispatch, disputes with money preview, payments and reconciliation,
  payouts, reports, services, areas, legal versions and consent report, messaging, reviews, support,
  settings with history, staff, security and audit.
- **Floating-glass design system** shared by all three front ends, Arabic first (RTL), light and dark.
- **Deployment**: Docker images, Caddy with automatic HTTPS and per-app CSP, one-command install, update
  with automatic rollback, restic backups with a weekly restore test, admin-path and data-key rotation.
- **Quality**: ESLint, RTL and money lint checks, 71 unit/API tests, Playwright journey and axe
  accessibility tests, CI with audit, secret scan, Docker build and an iPhone Simulator build.
