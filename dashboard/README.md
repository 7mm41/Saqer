# Sarena Admin · لوحة تحكم سرينا

The control panel for Sarena, styled like the app (Sarena orange, Arabic first with an English switch, light and dark). It is an **installable web app (PWA)**: open it in Safari or Chrome and choose *Add to Home Screen* / *Install app*, and it runs like a native app on iPhone, Android, Mac or Windows.

| Page | What you can do |
| --- | --- |
| نظرة عامة · Overview | Live numbers: members, active memberships, revenue, bookings, redemptions, member savings, memberships ending soon, 30-day sign-ups, top venues |
| الأماكن والفعاليات · Venues & events | Search by name or area, filter by category or published/draft. Add or edit venues and events: photo upload, description, dates, map position, featured and published flags, **ticket options** (original vs member price, remaining). Publishing a new one notifies members automatically |
| الأعضاء · Members | Search. **Create accounts**: another admin, venue staff or a member, with a generated password and sign-in details ready to copy. Grant or extend a membership (gift, partner, cash sale), suspend or reactivate an account, give **venue staff** access, see a member's codes, send one member a notification |
| الاشتراكات · Memberships | Every membership: active, expired or cancelled, searchable by member name, number, email or phone |
| العضوية والخصومات · Membership & discounts | The single annual plan (15 OMR): name, price, perks. Also a **limited-time discount** (for example, National Day at 12 OMR) with dates, and a live preview of the app card |
| الشعار والمظهر · Logo & looks | The logo, greeting, banner and colour in the app and on the website. Only admins change them; members can't. A look without dates is the everyday logo, and a look with dates (National Day, Ramadan, Eid…) replaces it for its season |
| الإشعارات · Notifications | Write a push notification now or schedule it, for everyone, members or non-members. Turn automatic notifications on or off (new events, event-day morning, discount start, membership ending), set the reminder timings for booked events, and search the full history (automatic or written). The history shows how many phones Apple accepted and why the rest didn't. **Delivery to phones** shows whether push is connected and which settings are missing, and **Send a test to my phone** returns Apple's answer, explained |
| استخدام الأكواد · Redeem | For venue staff: type the code or scan the member's QR code with the camera. Scanning a **membership card** (Apple Wallet or the app) shows whether the member is active and until when, without using anything up. Look up any code or member |

**Search everything** from the top bar, or press <kbd>Ctrl</kbd> <kbd>K</kbd> (<kbd>⌘</kbd> <kbd>K</kbd> on a Mac) or <kbd>/</kbd>: pages, venues and events, members (name, phone, member number) and booking codes. Picking a result opens it directly.

**Layout.** The menu sits on the right (the left in English). On tablets and phones it becomes a drawer that slides in from that side, from the menu button at the top. Text uses IBM Plex Sans Arabic, and all figures use Western digits (1,769.100 ر.ع.) so they line up in tables.

**Connect the app** (bottom of the menu) points the iPhone app at this server: open the control panel on the iPhone and tap *Open in the Sarena app*.

Every page updates **live**. The dashboard listens to the API's event stream (`/v1/live`), so new members, bookings and redemptions appear without refreshing. Changes made here reach open apps immediately.

## Try it without a server

Open **`demo/sarena-admin-demo.html`** in any browser: double-click it on a computer, or send it to your phone and open it there. It is the whole control panel with a built-in pretend server, and it comes with sample members, venues, codes and notifications. Everything works (adding events, discounts, seasonal looks, redeeming codes...) and is saved **on that device only**. It also simulates live activity: a new member or booking every half minute or so. *Reset sample data* starts over.

You can also try it from the real dashboard's sign-in page with **Try without a server**, or rebuild the file with `npm run build:demo`.

## Run

```bash
npm install
npm run dev      # http://localhost:5173/admin/ — proxies the API on :3000
npm run build    # → dist/, served by the API at /admin/
```

`npm start` in `backend/` builds it for you when `dist/` is missing or older than the source.

Sign in with the admin account the API creates on first start (`ADMIN_EMAIL` / `ADMIN_PASSWORD`, see `backend/.env.example`). Venue staff accounts only see *Redeem*.
