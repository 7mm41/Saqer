# Sarena · سرينا: full build prompt

Paste this into an AI coding assistant to rebuild, extend or audit the Sarena project. It describes everything that exists in this repository: the iPhone app, the server, the control panel, the website, and how they connect.

---

## Your role and goal

You are a senior full-stack and iOS engineer. Build **Sarena (سرينا)**, a members-only discounts and bookings platform for **Oman**. It has four parts in one repository, all connected through one API:

1. `Sarena/`: the **iPhone app** (SwiftUI).
2. `backend/`: the **server and database**. It serves the API, the website at `/`, and the control panel at `/admin/`.
3. `dashboard/`: the **control panel**, an installable web app (PWA).
4. `website/`: the **public website**.

Plus `REQUIREMENTS.txt`, an Arabic launch plan with services and approximate prices.

The owner controls **everything from the control panel**. Every change appears **instantly**, with no sign-out and no refresh, in:

* the app;
* the website;
* every open copy of the control panel.

Arabic comes first, and English is always available. Write production-quality code with tests, and never leave placeholders.

---

## 1. The product

* **Members only.** Nobody sees a venue or a price without an account.
* **One annual membership: 15 OMR a year.** There are no other packages: no family plan, no gold or regular tiers. Renewing adds a year to the current expiry date.
* **Discounts on the membership.** The admin can run a limited-time price, for example "National Day offer: 12 OMR instead of 15", with optional start and end dates.
* **Seven categories:**
  * Cinema
  * Jet Ski
  * Oman Shooting Club
  * Oman Automobile Association
  * Ibri Arena
  * Video Game Arcades
  * Oman Festivals (Ibri & Muscat Nights)
* **Venues and events** each have:
  * photos;
  * a description and highlights;
  * opening hours and a map position;
  * optional event start and end dates, and a deal countdown;
  * **ticket options**: the original price (shown struck through), the member price, and the number remaining (scarcity).
* **Booking** creates a **code** (e.g. `SRN-AB12-CD34`) with a **QR**. The member shows it at the door, and venue staff **redeem** it once.
* **Logo & looks**, managed only from the control panel (members can't change them):
  * the in-app and website logo, a greeting, a home banner and an accent colour;
  * a look without dates is the everyday logo; a look with dates (National Day, Ramadan, Eid…) replaces it for its season;
  * the home-screen icon stays the Sarena icon. Apple allows only icons built into the app, switched by the member's own tap (rule 4.6), so the app has no icon picker and never offers or switches icons. Someone who picked one in an earlier version gets "Use the original app icon" in Settings.
* **Notifications:**
  * **Automatic, with no admin action:**
    * a new venue or event, announced a few minutes after publishing;
    * "starts today" on the event morning;
    * a membership discount starting;
    * a membership ending (7 days before) and ended.
  * **Written by the admin:** now or scheduled, to everyone, members only, non-members, or one member.
  * **On-phone reminders for booked events,** which work offline:
    * the morning of the event;
    * **always at least 5 hours before it starts** (the evening before for early events);
    * a last nudge 1 hour before.

    All timings are set in the control panel.

---

## 2. Brand and design

**Name, identity and colours**

* Name: **Sarena · سرينا**. Logo: an orange glass tag with a **%** sign.
* Colours:
  * orange `#FF7900`, glow `#FFB05C`, ember `#E45A00`;
  * pink `#FF2F7D`, violet `#6B3DFF`, lagoon `#19C3D8`, mint `#2FD8A6`, gold `#FFC24D`;
  * night plum `#170A24`, ink `#15151B`;
  * success `#22C55E`, danger `#FF4D5E`.
* Brand gradient: `#FF9A3C → #F77800 → #E05A00`.

**App style**

* **Calm and minimal: Sarena orange, greys and white only.**
  * A **plain background**: light grey `#F3F3F5`, or near-black `#121214` in dark mode. It is the same colour set as the launch screen.
  * White (or raised dark grey) cards with a hairline edge and a soft shadow.
  * Orange for primary actions and highlights.
  * Red and green only for errors and the password meter.
* App fonts: Montserrat (Latin) and Alexandria (Arabic).

**Control panel style**

* IBM Plex Sans Arabic for both scripts, bundled with its OFL licence.
* **Western digits everywhere**, e.g. `1,769.100 ر.ع.`, with tabular figures.

**Categories:** in the app, every category is the **same orange circle with a white symbol**; the symbol tells them apart.

* Venue art without a photo: dark grey, with the symbol in an orange disc.
* The control panel uses its own SVG icon set, not emoji:

| Category | Icon |
| --- | --- |
| Cinema | clapperboard |
| Jet Ski | waves |
| Shooting club | target |
| Automobile | car |
| Ibri Arena | flag |
| Video games | gamepad |
| Festivals | sparkles |

**Money:** amounts are stored in **baisa** (1 OMR = 1000 baisa) and always shown with 3 decimals, e.g. `15.000 ر.ع.` / `OMR 15.000`.

**Phone edges:** the website and control panel must not show dark strips at the top or bottom in iPhone Safari.

* `theme-color` must match the page background (light `#FBF6F1` / dark `#121017` for the control panel; `#FFF5EC` / `#140C1C` for the website).
* `html` gets the page background.
* Decorative glows fade out before the top and bottom edges (CSS mask), so the bars blend in.
* When the user chooses light or dark by hand, update the `theme-color` tags to match.

---

## 3. The iPhone app (`Sarena/`)

**Stack:** SwiftUI and MVVM, iOS 17+, Xcode 15+.

* Stores use `@Observable` and `@MainActor`.
* Services are injected through `@Environment(\.services)` and passed into view models, so everything can be tested with fakes.
* Fully localized in **Arabic (RTL) and English** with `Localizable.xcstrings`, keys in English.

**Layout:**

| Folder | Contents |
| --- | --- |
| `App/` | `SarenaApp`, `RootView` (the sign-in gate), `MainTabView` |
| `DesignSystem/` | `Theme` tokens, `glassSurface(...)`, `GlassBackground`, buttons (`.sarenaProminent`, `.sarenaGlass`, `.sarenaDestructive`), fields, segmented control, brand views |
| `Models/` | User, OfferCategory, Venue + TicketOption, MembershipPlan + Membership, PromoCode, AppConfig/SeasonalTheme |
| `Services/` | Auth, Catalog, Booking, Membership (mock + API versions), `APIClient`, Server-Sent Events client, Keychain, `ServerAddress`, `NotificationsManager` |
| `Stores/` | SessionStore, CatalogStore, WalletStore, MembershipStore, AppConfigStore, LiveSync, LanguageCoordinator, AppRouter, EventReminders |
| `ViewModels/`, `Views/` | Onboarding, Auth, Home, Detail, Wallet, Account, Settings, Shared |

**First launch:**

1. Launch screen: the logo on a warm background.
2. Splash: the logo, still, while the session restores.
3. Language picker: greeting chips, with Arabic and English live and other languages marked "Soon".
4. Onboarding carousel: three illustrated pages with Continue/Skip and a capsule indicator.
5. Sign in by **mobile number + SMS code** (SMS AutoFill) or **email + password**, or create a free account.
   * Switching between phone and email **cross-fades the two forms in the same place**: the old one fades out, then the new one fades in while the panel resizes. Nothing slides over the content below.
   * Registration validates live: Omani numbers (8 digits starting with 7 or 9), Arabic-Indic digits accepted, password strength.
   * The session lives in the Keychain.

**Tabs:** Discover · Wallet · My Account · Settings.

* **Discover:**
  * a savings banner and a seasonal banner/greeting;
  * a 3D cover-flow featured carousel with live countdowns;
  * the 7 category cards, a "Biggest savings" list, and search;
  * a category with one venue opens it directly;
  * an empty category shows a "Soon" badge, and its screen says "Coming soon" instead of staying blank;
  * every screen fills the full width before drawing its background, so a short list never leaves black bands at the sides.
* **Venue detail:**
  * a hero photo (uploaded from the control panel) or the category art, with the discount disc inside the picture;
  * event dates, description, highlights;
  * a MapKit map with directions;
  * ticket options with original vs member price and live scarcity;
  * a quantity picker and a floating **Book Now** bar, which becomes **Become a member** without a membership.
* **Wallet:**
  * a segmented control "Active / Used";
  * ticket-shaped cards, a QR sheet, copy code, mark as used;
  * **Add to Apple Wallet** on every active code.
* **My Account:**
  * the membership card and member savings (total saved, ready and redeemed codes);
  * the single plan (15 OMR / year, or the discount price) with status, valid-until date, days left, progress and perks;
  * **Subscribe / Renew**, with the confirmation anchored to the button;
  * **Add to Apple Wallet** for active members: the membership card as a pass, whose QR lets any partner confirm the membership;
  * **Delete account** (an Apple requirement).
* **Settings:**
  * language (current language with an LTR/RTL badge, in-app switch, link to iOS language settings);
  * notifications (and why the phone couldn't register, if iOS gave no token), appearance;
  * About: the version, **the connected server, and a green dot while live updates flow**;
  * Log Out, with the confirmation anchored to its button.

**Language switch:** show a short branded "Changing language…" cover (the logo in a filling timer ring, the target language and its flag). Switch behind it, so the layout never flips between RTL and LTR in view.

**Design: calm and readable.**

* White cards (dark grey in dark mode) with dark text on a plain grey background; a hairline edge and a very soft neutral shadow, so cards never bleed into each other.
* No gradients, gloss, coloured glows or device-motion tilt.
* Orange only as an accent, in shades chosen for contrast: `#FF7900` for icons, `#EC6D00` behind white text (buttons, badges), and a darker orange for orange words on cards (`#C75A00`; `#FF9A3D` in dark mode). Soft orange washes behind icons and small badges.
* Every category uses the same soft orange circle; the symbol tells them apart. Venue art without a photo is light grey with an orange symbol.
* Badges on photos are solid white chips with dark text. Never white text on a light surface.
* Solid title bars, so a title never sits on scrolled content; screens without a title bar give the status bar the screen colour.
* Nothing overlaps: badges and the discount disc sit inside their pictures.

**Performance rules** (the app must stay cool):

* A plain background colour; content cards use a solid fill, not live blur.
* Real materials only on bars, sheets and form panels.
* No motion sensor and no endless animations. QR codes are cached.
* Cross-fades use opacity only, so black edges never show.

**Backend connection:**

* `AppServices.configured()` picks the on-device **demo backend** (mock services) or the **API**.
* The server address is chosen in this order:
  1. the Xcode scheme variable `SARENA_API_BASE_URL`;
  2. a server chosen from a **`sarena://connect?server=https://…`** link, the control panel's "Connect the app" button;
  3. `Info.plist › SarenaAPIBaseURL`.
* Register the `sarena` URL scheme.
* **Connecting from a link:**
  * confirm with an alert showing the host;
  * sign out locally, clear the old token and the cached look;
  * save the address and rebuild all stores (an `AppContainer`, with the view tree keyed by its id), so nothing from one server is sent to another.
* `Info.plist › SarenaAllowServerLinks` (default YES) turns links off for the App Store build.
* **Image links** from the API may be relative paths (`/uploads/x.jpg`). Resolve them against the API address with a decoder `userInfo` key. Links saved as `http://localhost…/uploads/…` are also moved to the API address.

**Live updates** (`LiveSync`):

* On every return to the foreground, re-check everything; ETags make unchanged data cost a 304.
* While open, keep a **Server-Sent Events** stream:
  * signed in: `GET /v1/live` with the token;
  * signed out: `GET /v1/live/public` (seasonal look and plans only).
* Handle each event:

  | Event | Action |
  | --- | --- |
  | `catalog` | reload venues, debounced 400 ms |
  | `offer` | patch the remaining count in place |
  | `plans` | reload plans |
  | `config` | reload the look and reminder timings |
  | `membership` | refresh the membership |
  | `bookings` | refresh the wallet |
  | `account` | re-fetch the profile; a 401 signs out |
* Reconnect with back-off (2, 4, 8 … 60 s) and re-sync after a gap.

**Notifications:**

* Push via APNs: register the device token with the server, together with the **gateway** it belongs to (read `aps-environment` from the app's `embedded.mobileprovision`: development → sandbox; none, as in App Store builds → production) and the **bundle identifier**. Register again after connecting to another server. Tapping a notification about a venue opens it.
* On-phone reminders for booked events: the morning of the event and at least N hours before, plus a final nudge, timed from the server's settings.
* Ask for permission after booking an event, or from Settings.

**Apple Wallet:**

* `AddToAppleWallet` wraps Apple's own `PKAddPassButton`. It downloads the signed pass from the server with the member's token and the app language, then shows `PKAddPassesViewController`.
* It appears only when `/app/config` says `wallet.enabled`, the services have `walletPasses` (not on the on-device demo), and the device can add passes.

**Demo account** (on-device demo and server demo mode):

* `demo@sarena.om` / `Sarena2026`;
* or `+968 9123 4567` with SMS code `123456`;
* starts with an active annual membership.

**Tests:** XCTest for the view models and stores, using the mock services. Cover:

* the reminder planner;
* live-sync event routing;
* the signed-out public stream;
* server-address parsing and order;
* media URL resolution;
* config caching and the language coordinator.

---

## 4. The server (`backend/`)

**Stack:**

* Node 22 running TypeScript directly (type stripping), Fastify 5, Drizzle ORM, zod 4, jose (JWT HS256).
* Passwords hashed with scrypt.
* Database:
  * **PGlite** (embedded) when `DATABASE_URL` is empty;
  * **PostgreSQL** in production, with `docker compose up -d --build` running Sarena and Postgres on port 3000.
* Serves `website/` at `/` and `dashboard/dist` at `/admin/`, with an SPA fallback to `index.html`.
* **Security:**
  * helmet with a strict CSP (images `self data: blob:`), **without `upgrade-insecure-requests`**: Safari applies it to `http://localhost` and the pages would load blank. HTTPS belongs to the proxy;
  * rate limits on sign-in, OTP and the public stream;
  * JSON errors `{ error: { code, message } }`.

**Data model:**

* `users`: role `member | staff | admin`, status `active | suspended`, member number `SRN-######`.
* `sessions` and `otp_codes`.
* `plans`: price, duration, bilingual name/description/perks, promo price/label/start/end.
* `memberships`: source `app_store | web | admin | demo`, starts/expires, paid.
* `venues`: bilingual fields, category, coordinates, rating, image, featured/published, event and deal dates.
* `offers`: ticket options.
* `bookings`: code, quantity, paid vs original totals, status `active | used | cancelled`.
* `themes`: logo, banner, greeting, accent, icon name, schedule, enabled.
* `devices`: push tokens.
* `notifications`: kind, audience, schedule, status, recipients, dedupe key.
* `settings`: notification rules and timings.

**Endpoints** (`/v1`):

* **Public:**
  * `GET /health`, `GET /app/config` (active theme, reminder timings, store and support links, time zone), `GET /plans`;
  * `GET /live/public` (SSE: catalog, plans, config, offer only).
* **Auth:**
  * `POST /auth/register`, `/auth/login`, `/auth/otp/request`, `/auth/otp/verify`, `/auth/logout`;
  * SMS provider: `console` or `twilio`;
  * demo mode accepts code `123456` for the demo number.
* **Member:**
  * `GET /me`, `DELETE /me`;
  * `POST /me/devices`, `DELETE /me/devices/:token`;
  * `GET /venues`, `GET /venues/:id` (members only; ETag / 304);
  * `POST /membership/subscribe` (demo payments until a real gateway is added; renewing extends from the current expiry);
  * `POST /bookings`, `GET /me/bookings`, `POST /me/bookings/:id/mark-used`;
  * `GET /live` (SSE with the token).
* **Admin** (`/admin/*`, admins; staff only redeem):
  * `GET /stats`: members, active memberships, revenue (30 days and total), bookings, redemptions, member savings, ending within 30 days, push devices, 30-day sign-ups, top venues.
  * Members:
    * `GET /members?q=&status=` (search name, email, phone, member number);
    * **`POST /members`**: create an admin, staff or member account with a password; 409 on a duplicate email or phone;
    * `GET/PATCH /members/:id` (role, status; suspending signs the account out everywhere; admins cannot suspend or demote themselves);
    * `POST /members/:id/memberships` (grant or extend).
  * Memberships: `GET /memberships?q=&status=`, `POST /memberships/:id/cancel`.
  * Plans: `GET/POST/PATCH /plans` (promo price must be below the price; end after start).
  * Venues and tickets:
    * `GET/POST/PATCH/DELETE /venues`, `POST /venues/:id/offers`, `PATCH/DELETE /offers/:id`;
    * `POST /uploads`: JPEG, PNG or WebP up to 5 MB. Returns a **relative** `/uploads/<uuid>.<ext>`, so links survive a change of address. Old `http://localhost…/uploads/…` links are served as paths.
  * Themes: `GET/POST/PATCH/DELETE /themes`.
  * Notifications:
    * `GET /notifications?q=&origin=written|automatic&kind=&status=`;
    * `POST /notifications` (now or scheduled);
    * `GET /notifications/audience` (device count);
    * `POST /notifications/:id/cancel`;
    * `GET/PATCH /settings/notifications`.
  * Bookings: `GET /bookings?q=&status=` (code or member name), `POST /bookings/redeem` (once; clear errors for already used, expired, not found).
  * **Membership cards**: `POST /members/verify { qr }` (admins and staff). It returns the member, `active` and the expiry date, checked live. A forged or unknown card gets 404, and anything that isn't a card gets 400.
* **Apple Wallet** (members):
  * `GET /me/wallet/membership.pkpass?lang=ar|en` for the membership card;
  * `GET /me/bookings/:id/wallet.pkpass?lang=` for one code;
  * `/app/config` reports `wallet.enabled`.

**Live hub** (`/v1/live`, Server-Sent Events):

* Send `retry: 3000` and a `ready` event, then events.
* A `: ping` heartbeat every 25 s keeps proxies and tunnels open.
* Audiences:
  * **all**: `catalog`, `offer`, `plans`, `config`;
  * **the member**: `membership`, `bookings`, `account`;
  * **admins and staff**: `admin {topic}`.
* Signing out or suspension ends the member's streams.
* Public streams carry only the "all" events.
* With several server instances, bridge events through Postgres LISTEN/NOTIFY.

**Apple Wallet passes** (`lib/wallet.ts`, node-forge):

* A `.pkpass` zip holds:
  * `pass.json`, icons and logo;
  * `en.lproj` / `ar.lproj/pass.strings` for the labels;
  * `manifest.json` with SHA-1 hashes;
  * `signature`: a detached PKCS #7 signature by the Pass Type ID certificate (.p12) plus Apple's WWDR certificate.
* Colours: orange background, white text.
* **Membership card** (generic pass):
  * shows the name, member number, status and valid-until date;
  * QR `sarena://member?n=<number>&s=<HMAC of the account id>`, so a number that is merely guessed is refused;
  * Wallet greys it out after the expiry date.
* **Code pass** (event ticket for events, coupon otherwise):
  * shows the venue, ticket, quantity, code, and price vs original;
  * carries the same QR as the app (`sarena://redeem?code=…`);
  * appears on the lock screen near the venue (`locations`) and on the event day (`relevantDate`);
  * is voided once used.
* Settings: `WALLET_PASS_TYPE_ID`, `WALLET_TEAM_ID`, `WALLET_CERT_FILE`, `WALLET_CERT_PASSWORD`, `WALLET_WWDR_FILE`. The feature is off (503 `wallet_unavailable`, and the app hides the button) until they are set.
* Keys stay out of git (`*.p12`, `*.p8`, `certs/`).
* Tests make a test CA and certificate, check the zip and hashes, verify the signature with OpenSSL, and cover verification and forged cards.

**Notifier:**

* A 30-second scheduler, with ticks run one at a time (no overlap).
* Dedupe keys, and waking hours in Oman time (UTC+4).
* Sends the automatic rules and scheduled broadcasts through APNs over HTTP/2 with an ES256 JWT.
  * Each phone goes to its own gateway, with its own bundle identifier as the topic. A `BadDeviceToken` is retried on the other gateway (and the right one remembered) before the token is forgotten.
  * Each notification records the phones targeted, how many Apple accepted, and the main reason for the rest.
  * The `.p8` key is read however it was pasted (with or without BEGIN lines, with `\n`, quoted); a wrong key path doesn't stop the server.
  * `GET /admin/push/status` (configured, missing settings, a problem, phones per gateway, recent failures) and `POST /admin/push/test` (a test to your own phones, with Apple's answer for each).
* Without APNs keys it records and logs notifications instead of sending them.

**Configuration** (`.env`; every value is optional in development):

* **A blank line means "not set"**, e.g. `JWT_SECRET=` as copied from `.env.example`. Otherwise an empty secret breaks every sign-in.
* `JWT_SECRET` is required in production (at least 32 characters).
* `ADMIN_EMAIL` / `ADMIN_PASSWORD`:
  * the first admin is created on first start, and a generated password is printed if none is given;
  * **setting `ADMIN_PASSWORD` also resets the admin's password on the next start**;
  * an admin left with a blank password gets a new generated one.
* Other settings:
  * `DEMO_MODE`, `PAYMENTS_MODE`;
  * `SMS_PROVIDER` and the Twilio keys;
  * `APNS_*`;
  * store and support links;
  * `PUBLIC_URL`: optional, shown in the start-up message.

**Seed data:** the plan (15 OMR), the admin, the demo member (in demo mode), and sample venues for all 7 categories.

**Tests** (`node --test`) must cover:

* auth, OTP and registration rules;
* subscribing, renewing, booking and redeeming once;
* dashboard permissions, search and account creation;
* uploads, and portable image paths;
* blank `.env` values and admin password recovery;
* live updates for members, admins and the public stream;
* the automatic notifications and their timings;
* the SPA fallback.

---

## 5. The control panel (`dashboard/`)

**Stack:** React 18, TypeScript, Vite 6, an installable **PWA** at `/admin/` with a service worker and manifest.

* Arabic-first, with an English switch, **light and dark** (remembered), and Western digits.
* Live updates through `/v1/live`: every page reloads by itself when its data changes.

**Layout:**

* The menu sits **on the right** (inline-start in RTL; on the left in English).
* It is grouped: Main · Content · Members · Engagement · At the venue.
* At the bottom: the demo card (in demo mode), **Connect the app**, the user row, and language / appearance / sign-out buttons.
* **Below 1100 px** the menu becomes a **drawer sliding in from the right**:
  * a blurred backdrop and a staggered entrance;
  * a close button, and Esc closes it;
  * the page behind does not scroll.
* A top bar shows:
  * the menu button on narrow screens;
  * the page title;
  * a search field (`Ctrl/⌘ K` or `/`);
  * the live status.
* **Every window (modal) is rendered on `<body>` through a portal**, so page animations or blur can never clip it. Confirmations use an in-page dialog, never `window.confirm`.

**Global search (command palette):**

* Searches pages, venues and events, members (name, phone, member number) and booking codes.
* Arabic-insensitive matching: `احمد` finds `أحمد`; ى/ي and ة/ه are treated alike.
* Arrow keys, Enter and Esc work.
* Picking a result **opens it**: the member's details, the venue editor, or the code ready to redeem.

**Pages:**

1. **Overview:**
   * 8 stat cards with icons, and the currency set apart;
   * 30-day sign-ups chart (SVG, guide lines, dates);
   * ranked top venues with bars.
2. **Venues & events:**
   * search by name or area; category chips with counts; published/draft filter;
   * cards with category art or a photo, badges, event dates, and the cheapest original vs member price;
   * editor:
     * bilingual fields, highlights, photo upload;
     * event, end and deal dates; map position; featured and published toggles;
     * **ticket options** with original and member price, discount %, remaining and on-sale toggle.
   * Publishing announces the venue automatically.
3. **Membership & discounts:**
   * the single plan (name, description, price, days, perks);
   * a **limited-time discount** (price, label, start, end; running / scheduled badges);
   * a live preview of the app's membership card.
4. **Logo & looks:**
   * logo, banner, greeting, accent colour and dates; no dates = the everyday logo, dates = a seasonal look that replaces it;
   * live / upcoming / ended states.
5. **Members:**
   * search and an active/suspended filter;
   * **New account**:
     * create an admin, venue staff or member;
     * a generated 12-character password with show/hide;
     * after creating, show the **sign-in details** (email, password, control panel link) once, with a copy button.
   * The member window:
     * role, suspend or reactivate;
     * grant or extend a membership;
     * membership history, codes;
     * send this member a notification.
6. **Memberships:** search by member name, number, email or phone; filter active / expired / cancelled / all; a row opens the member.
7. **Notifications:**
   * **writer**: bilingual, audience with a live phone count, send now or schedule, link to a venue, lock-screen preview;
   * **automatic rules**: on/off switches and timings (announcement delay, morning hour, hours before, last nudge);
   * **history**: search, automatic/written filter, cancel a scheduled one; "delivered X of Y phones", and the reason explained when some didn't arrive;
   * **Delivery to phones**: connected or not, the missing `.env` settings or the problem (e.g. no key file at that path), phones per gateway, recent problems, and **Send a test to my phone** with Apple's answer explained (wrong Key/Team ID, bundle identifier mismatch, out-of-date registration…).
8. **Redeem codes** (the only page for venue staff):
   * type or scan the QR with the camera (`BarcodeDetector`);
   * clear success or error states;
   * recent codes, with a lookup for any code or member;
   * scanning a **membership card** (from Apple Wallet or the app) shows "Active member — member prices apply" with the name, number and valid-until date, or "no active membership", without using anything up. A hand scanner typing the link keeps its case.

**Connect the app:**

* A window showing this server's address with a copy button.
* A button linking to `sarena://connect?server=<this origin>`.
* A note that trycloudflare addresses change whenever the tunnel restarts.
* In demo mode, it explains that there is no server to connect to.

**Demo mode (no server):**

* An in-browser mock of the whole admin API, saved in `localStorage`.
* Sample members, venues, codes and notifications, with simulated live activity.
* Sample data can be reset.
* `npm run build:demo` builds **one self-contained HTML file** (fonts, icons and scripts inlined; hash routing so it runs from `file://`): `dashboard/demo/sarena-admin-demo.html`.
* Opening the source `index.html` directly shows a help message instead of a blank page.

---

## 6. The website (`website/`)

**Pages:** a single page plus `privacy.html`, in Arabic and English.

* Sections: hero, "seven experiences, one membership", how it works, pricing (one price, one year, with any running discount), partners, FAQ.
* App Store and Google Play buttons (Google Play marked "soon" until a link is set).
* WhatsApp and email contact.

**Live content:** the seasonal greeting and bar, the plan price and discount, and links, all read from `/v1/app/config` and `/v1/plans`.

* It updates **the moment they change**, through `EventSource('/v1/live/public')`.
* A slow poll is kept as a fallback.

**Portability:**

* Relative paths only.
* When opened from the folder (`file://`), its control panel links open the demo file.
* `[hidden]{display:none!important}`, so empty bars stay hidden.

---

## 7. Running and sharing

```bash
cd backend && npm start     # website http://localhost:3000 · control panel /admin/
cloudflared tunnel --url http://localhost:3000   # public https://….trycloudflare.com for the phone
```

* `npm start` first runs `backend/scripts/prepare.ts`: it installs packages when `node_modules` is missing or older than `package.json`/`package-lock.json`, and builds the control panel when `dashboard/dist` is missing or older than its source. It only warns on failure. The server loads `backend/.env` with `--env-file-if-exists`.
* `bash admin-password.sh [password]` (repo root) finds Node 22.18+ even off the PATH (Homebrew, installer, Volta, nvm, fnm, or a copy under the home folder) and runs the same script.
* `npm run admin-password [-- password]` resets the dashboard admin (the ADMIN_EMAIL account, else the first admin; created if none) to the given password, ADMIN_PASSWORD, or a new readable one, and prints the email and password. With the built-in database it refuses while the server answers on PORT. Generated passwords avoid look-alike characters (0/O, 1/l/I). Sign-in also accepts a password with spaces a phone keyboard added around it, and the dashboard sign-in has a show-password button.
* `/Admin`, `/ADMIN/…` redirect to `/admin/…`; without a build, `/admin/` shows a bilingual page with the build command (503) and the server logs a warning.
* The app's `Info.plist › SarenaAPIBaseURL` holds the public address.
* After a tunnel restart, open the control panel on the iPhone → **Connect the app**.
* For a permanent address, use a named Cloudflare tunnel or HTTPS hosting on your own domain.

---

## 8. `REQUIREMENTS.txt` (in Arabic)

List what is already built and what is still needed before launch:

* a real payment gateway;
* a real SMS provider;
* an APNs key;
* an Android app;
* partner contracts.

Give approximate 2026 prices in OMR (1 USD ≈ 0.385 OMR) in these sections:

1. Official accounts and registrations: Apple and Google developer accounts, commercial registration, domain, trademark, legal review.
2. Server and technical services.
3. OTP text messages (SMS).
4. Payments, the most important decision before launch.
5. Law and compliance, including Oman's data-protection law.
6. Team and operations (monthly).
7. Marketing.
8. Financial summary.
9. Expected success in Oman with one 15 OMR yearly membership.
   * Why the price works: 1.25 OMR a month, and "your membership pays for itself" examples.
   * The biggest risks, starting with 30–50 attractive partners at launch.
   * The plan to succeed.

---

## 9. Quality bar

* **Every** change made in the control panel shows up with no refresh and no sign-in:
  * in the open app within about a second, including before sign-in for the seasonal look;
  * on the website;
  * in other open copies of the control panel.
* Arabic RTL and English LTR are both perfect.
* Western digits in the control panel.
* No dark strips in iPhone Safari.
* Works at 1440 px, 960 px (drawer) and 390 px (phone) with no horizontal scroll.
* No console errors.
* All server and app tests pass. Type-check and build succeed for the control panel (normal and demo builds).
* Never commit secrets. `.env.example` documents every setting.
