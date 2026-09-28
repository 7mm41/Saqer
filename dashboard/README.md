# Sarena Admin · لوحة تحكم سرينا

The control panel for Sarena, styled like the app (floating glass, Sarena orange, Arabic first with an English switch). It is an **installable web app (PWA)**: open it in Safari or Chrome and choose *Add to Home Screen* / *Install app*, and it runs like a native app on iPhone, Android, Mac or Windows.

| Page | What you can do |
| --- | --- |
| نظرة عامة · Overview | Live numbers: members, active memberships, revenue, bookings, redemptions, member savings, memberships ending soon, phones with notifications, 30-day sign-ups, top venues |
| الأماكن والفعاليات · Venues & events | Add or edit venues and events: photo upload, description, dates, map position, featured and published flags, **ticket options** (original vs member price, remaining). Publishing a new one notifies members automatically |
| الأعضاء · Members | Search. Grant or extend a membership (gift, partner, cash sale), suspend or reactivate an account, give **venue staff** access, see a member's codes, send one member a notification |
| الاشتراكات · Memberships | Every membership: active, expired or cancelled |
| العضوية والخصومات · Membership & discounts | The single annual plan (15 OMR): name, price, perks. Also a **limited-time discount** (for example, National Day at 12 OMR) with dates, and a live preview of the app card |
| المظهر الموسمي · Seasonal looks | For National Day, Ramadan, Eid and other occasions: the in-app logo, greeting, banner and colour, plus the bundled home-screen icon the app offers members, all on a schedule |
| الإشعارات · Notifications | Write a push notification now or schedule it, for everyone, members or non-members. Turn automatic notifications on or off (new events, event-day morning, discount start, membership ending), set the reminder timings for booked events, and see the full history |
| استخدام الأكواد · Redeem | For venue staff: type the code or scan the member's QR code with the camera |

Every page updates **live**. The dashboard listens to the API's event stream (`/v1/live`), so new members, bookings and redemptions appear without refreshing. Changes made here reach open apps immediately.

## Run

```bash
npm install
npm run dev      # http://localhost:5173/admin/ — proxies the API on :3000
npm run build    # → dist/, served by the API at /admin/
```

Sign in with the admin account the API creates on first start (`ADMIN_EMAIL` / `ADMIN_PASSWORD`, see `backend/.env.example`). Venue staff accounts only see *Redeem*.
