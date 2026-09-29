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
* **Seasonal looks** for National Day, Ramadan, Eid and other occasions:
  * the in-app logo, a greeting, a home banner and an accent colour, all scheduled from the control panel;
  * a matching **home-screen icon** that the app *offers*. Apple rule 4.6 requires a member tap for every icon change, so the app never switches the icon by itself.
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

* **Floating glassmorphism** with a warm backdrop, frosted cards, rim light, soft shadows and orange-tinted glass for primary actions.
* App fonts: Montserrat (Latin) and Alexandria (Arabic).

**Control panel style**

* IBM Plex Sans Arabic for both scripts, bundled with its OFL licence.
* **Western digits everywhere**, e.g. `1,769.100 ر.ع.`, with tabular figures.

**Categories:** each has its own two-colour gradient and a line icon, the same in the app and the control panel. The panel uses its own SVG icon set, not emoji:

| Category | Colours | Icon |
| --- | --- | --- |
| Cinema | `#FF5A5F → #C2185B` | clapperboard |
| Jet Ski | `#3DD6F5 → #1565C0` | waves |
| Shooting club | `#9CCC65 → #2E7D32` | target |
| Automobile | `#FFB05C → #E45A00` | car |
| Ibri Arena | `#FFD54F → #F57F17` | flag |
| Video games | `#B388FF → #5E35B1` | gamepad |
| Festivals | `#FF80AB → #FF2F7D` | sparkles |

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
2. Splash: the glass tag floats in while the session restores.
3. Language picker: greeting chips, with Arabic and English live and other languages marked "Soon".
4. Onboarding carousel: three illustrated pages with Continue/Skip and a capsule indicator.
5. Sign in by **mobile number + SMS code** (SMS AutoFill) or **email + password**, or create a free account.
   * Registration validates live: Omani numbers (8 digits starting with 7 or 9), Arabic-Indic digits accepted, password strength.
   * The session lives in the Keychain.

**Tabs:** Discover · Wallet · My Account · Settings, on a glass tab bar.

* **Discover:**
  * a savings banner and a seasonal banner/greeting;
  * a 3D cover-flow featured carousel with live countdowns;
  * the 7 category cards, a "Biggest savings" list, and search.
* **Venue detail:**
  * a hero photo (uploaded from the control panel) or the category art, with a floating discount medallion;
  * event dates, description, highlights;
  * a MapKit map with directions;
  * ticket options with original vs member price and live scarcity;
  * a quantity picker and a floating **Book Now** bar, which becomes **Become a member** without a membership.
* **Wallet:**
  * glass segmented control "Active / Used";
  * ticket-shaped cards, a QR sheet, copy code, mark as used.
* **My Account:**
  * the membership card and member savings (total saved, ready and redeemed codes);
  * the single plan (15 OMR / year, or the discount price) with status, valid-until date, days left, progress and perks;
  * **Subscribe / Renew**, with the confirmation anchored to the button;
  * **Delete account** (an Apple requirement).
* **Settings:**
  * language (current language with an LTR/RTL badge, in-app switch, link to iOS language settings);
  * app icon picker, appearance, floating-motion toggle, notifications;
  * About: the version, **the connected server, and a green dot while live updates flow**;
  * Log Out, with the confirmation anchored to its button.

**Language switch:** show a short branded "Changing language…" cover (the logo in a filling timer ring, the target language and its flag). Switch behind it, so the layout never flips between RTL and LTR in view.

**Alternate app icons:**

* Classic (with iOS 18 dark and tinted variants), Glass, Midnight Glass, Frost Glass.
* Seasonal icons: National Day, Ramadan, Eid.
* Home offers the seasonal icon while a theme runs, and "Switch back" when it ends.

**Performance rules** (the app must stay cool):

* A static, pre-blurred backdrop image; content cards use a frosted fill, not live blur.
* Real materials only on bars, sheets and form panels.
* No endless animations on glass.
* Parallax on a few hero elements only. The motion manager is reference-counted, samples at 20 Hz, and pauses in Low Power Mode, under heat, with Reduce Motion, or when the Settings toggle is off.
* Glows use gradients, not blur filters; QR codes are cached.
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

* Push via APNs: register the device token with the server; tapping a notification about a venue opens it.
* On-phone reminders for booked events: the morning of the event and at least N hours before, plus a final nudge, timed from the server's settings.
* Ask for permission after booking an event, or from Settings.

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
  * helmet with a strict CSP (images `self data: blob:`);
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

**Notifier:**

* A 30-second scheduler, with ticks run one at a time (no overlap).
* Dedupe keys, and waking hours in Oman time (UTC+4).
* Sends the automatic rules and scheduled broadcasts through APNs over HTTP/2 with an ES256 JWT.
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
4. **Seasonal looks:**
   * logo, banner, greeting, accent colour, bundled home-screen icon, and schedule;
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
   * **history**: search, automatic/written filter, cancel a scheduled one.
8. **Redeem codes** (the only page for venue staff):
   * type or scan the QR with the camera (`BarcodeDetector`);
   * clear success or error states;
   * recent codes, with a lookup for any code or member.

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
cd dashboard && npm install && npm run build && cd ..
cd backend && npm install && npm start     # website http://localhost:3000 · control panel /admin/
cloudflared tunnel --url http://localhost:3000   # public https://….trycloudflare.com for the phone
```

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
