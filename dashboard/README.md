# Sarena Admin · لوحة تحكم سرينا

The control panel for Sarena, styled like the app (Sarena orange, Arabic first with an English switch, light and dark). It is an **installable web app (PWA)**: open it in Safari or Chrome and choose *Add to Home Screen* / *Install app*, and it runs like a native app on iPhone, Android, Mac or Windows.

| Page | What you can do |
| --- | --- |
| نظرة عامة · Overview | Live numbers: members, active memberships, revenue, bookings, redemptions, member savings, memberships ending soon, 30-day sign-ups, top venues |
| الأماكن والفعاليات · Venues & events | Search by name or area, filter by category or published/draft. Add or edit venues and events: photo upload, description, dates, map position, featured and published flags, **ticket options** (original vs member price, remaining). Publishing a new one notifies members automatically |
| الأعضاء · Members | Search (names, emails and numbers are stored encrypted and searched on the server). See when each account **last signed in**. Grant or extend a membership (gift, partner, cash sale), suspend or reactivate an account, **delete** an account (test accounts), see a member's codes, send one member a notification. No accounts are created here: members sign up in the app |
| الاشتراكات · Memberships | Every membership: active, expired or cancelled, searchable by member name, number, email or phone |
| العضوية والخصومات · Membership & discounts | The single annual plan (15 OMR): name, price, perks. Also a **limited-time discount** (for example, National Day at 12 OMR) with dates, and a live preview of the app card |
| الشعار والمظهر · Logo & looks | The logo, greeting, banner and colour in the app and on the website. Only admins change them; members can't. A look without dates is the everyday logo, and a look with dates (National Day, Ramadan, Eid…) replaces it for its season |
| الإشعارات · Notifications | Write a push notification now or schedule it, for everyone, members or non-members. Turn automatic notifications on or off (new events, event-day morning, discount start, membership ending), set the reminder timings for booked events, and search the full history (automatic or written). The history shows how many phones Apple accepted and why the rest didn't. **Delivery to phones** shows whether push is connected and which settings are missing, and **Send a test to my phone** returns Apple's answer, explained |
| سجل الدخول · Sign-in history | When you last signed in to the control panel, every sign-in to your account (time, device, address, app or panel), and every wrong password given for it. *Sign out everywhere else* ends the others |
| استخدام الأكواد · Redeem | At the entrance: type the code or scan the member's QR code with the camera. Scanning a **membership card** (Apple Wallet or the app) shows whether the member is active and until when, without using anything up. Look up any code or member |

**Search everything** from the top bar, or press <kbd>Ctrl</kbd> <kbd>K</kbd> (<kbd>⌘</kbd> <kbd>K</kbd> on a Mac) or <kbd>/</kbd>: pages, venues and events, members (name, phone, member number) and booking codes. Picking a result opens it directly.

**Layout.** The menu sits on the right (the left in English). On tablets and phones it becomes a drawer that slides in from that side, from the menu button at the top. Text uses IBM Plex Sans Arabic, and all figures use Western digits (1,769.100 ر.ع.) so they line up in tables.

**Who can open it.** Only the owner (`saqer@sarena.tech`), and only from the panel's private address (`https://sarena.tech/<ADMIN_PATH>/`, printed by the installer). The panel sends that address with the sign-in; a sign-in without it (the app, or anyone guessing) can't manage anything. Nothing links to the address, and `/admin` is "not found". The bottom of the menu shows your last sign-in to the panel, and turns red when someone gave a wrong password since.

Every page updates **live**. The dashboard listens to the API's event stream (`/v1/live`), so new members, bookings and redemptions appear without refreshing. Changes made here reach open apps immediately.

## Stand-alone demo

**`demo/sarena-admin-demo.html`** is the whole control panel with a built-in pretend server and made-up data, saved on the device that opens it (`npm run build:demo` rebuilds it). The real control panel has no demo mode.

## Run

```bash
npm install
npm run dev      # http://localhost:5173 — proxies the API on :3000 (whose development panel address is /admin/)
npm run build    # → dist/ (relative paths), served by the API at the panel's private address
```

`npm start` in `backend/` builds it for you when `dist/` is missing or older than the source.

Sign in as the owner. Its password is set with `bash admin-password.sh` (Mac) or `sudo bash deploy/install.sh --password` (server), typed hidden and never shown.
