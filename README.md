# كتف — Katf

A home-services marketplace for Oman, starting with air-conditioner repair in Seeb and Bawshar.
Customers book a verified technician and pay a visit fee up front; the technician diagnoses, quotes,
and is paid after the customer confirms the work. Arabic first (RTL), English second.

> **Status:** Phase 1 is built and tested. It is **not live**: payments, SMS to the public and public
> registration stay off until a lawyer approves the legal texts and the owner opens the legal gate in
> the admin panel. See [What is not done](#what-is-not-done).

## What is in this repository

| Folder | What it is |
|---|---|
| [`web/`](web) | Customer website (Next.js): public pages, technician link pages, 6-step booking, tracking, quote approval, receipts, account |
| [`tech/`](tech) | Technician app (React + Vite). Ships as the PWA at `/tech` **and** as the iPhone app from the Xcode project in [`tech/ios/App/App.xcodeproj`](tech/ios/App) |
| [`admin/`](admin) | Admin panel (React + Vite), served by the API only under a secret path |
| [`api/`](api) | API (Fastify + Drizzle + PostgreSQL): money, ledger, booking state machine, auth, legal consent, payouts, notifications |
| [`shared/`](shared) | Money library (integer baisa), settings registry, state machine, validation, Arabic/English common texts |
| [`ui/`](ui) | "Floating glass" design system shared by the three front ends |
| [`e2e/`](e2e) | Playwright end-to-end and accessibility tests |
| [`deploy/`](deploy) | Docker images, Caddy, one-command install, update with rollback, encrypted backups |
| [`docs/`](docs) | Architecture, data model, state machine, security, runbooks, iPhone guide |
| [`legacy/store-popup`](legacy/store-popup) | The earlier store-popup tool, unchanged |

[`PLAN.md`](PLAN.md) and [`DECISIONS.md`](DECISIONS.md) record what was agreed with the owner.

## Run it on your computer

Needs Node 22+ and pnpm 10 (`corepack enable`).

```bash
pnpm install
pnpm dev:api     # API on http://localhost:4000 (embedded database, no setup)
pnpm dev:web     # website on http://localhost:3000
pnpm dev:tech    # technician app on http://localhost:5173/tech/
pnpm dev:admin   # admin panel on http://localhost:5174/dev-admin/
```

- Sign-in codes (OTP) are printed in the API log in development; nothing is sent.
- Payments use a clearly labelled test page; no card is ever charged.
- To click through with a sample technician: `DEMO_MODE=true pnpm --filter @katf/api cli demo-seed`,
  then start the API with `DEMO_MODE=true`. Every demo screen says "Demo data — not real".
- Create an admin owner: `pnpm --filter @katf/api cli create-owner` (the password is typed into a
  hidden prompt and never printed). First sign-in sets up the authenticator app.

## Tests and checks

```bash
pnpm lint         # ESLint + no physical left/right in styles + money is integer baisa only
pnpm typecheck
pnpm test         # money examples A–F, state machine, full API flows, security, i18n coverage
pnpm e2e          # real browsers: book → pay → technician job → confirm → admin; axe accessibility
```

CI runs all of this, plus a dependency audit, a secret scan, the production Docker build and an
iPhone Simulator build ([`.github/workflows`](.github/workflows)).

## Put it on a server

On a fresh Ubuntu/Debian server with Docker and a domain pointing to it:

```bash
git clone <this repository> /opt/katf
sudo /opt/katf/deploy/install.sh
```

The script generates every secret, builds and starts the stack with automatic HTTPS, asks you to
create the owner account, schedules nightly encrypted backups with a weekly restore test, and prints
the private admin address. Updates: `sudo /opt/katf/deploy/update.sh` (backs up first, rolls back on
failure). Details: [docs/runbooks.md](docs/runbooks.md).

## Rules the code keeps

- No secret, key, password or personal data in the repository, logs, error messages or test fixtures.
- Money is always an integer number of baisa (1 OMR = 1000 baisa); a lint check enforces it.
- Every business number lives in the settings table with history; nothing is hard-coded.
- Legal texts are drafts until a lawyer approves them; the legal gate cannot open while any required
  text is a draft.
- No analytics or ad trackers, fake reviews, fake counters or fake urgency.
- Personal data of either side is shown to the other side only after acceptance, and only what is needed.

## What is not done

See the list at the end of [docs/status.md](docs/status.md): it covers the owner's open items (lawyer
review, company details, payment and SMS contracts, Apple account), and the parts of Phase 2 that are
built but not yet switched on.
