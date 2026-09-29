# Sarena · سرينا

Exclusive, members-only prices in Oman — **one annual membership (15 OMR)**, bookable venues and events, codes redeemed at the door.

| Folder | What it is |
| --- | --- |
| [`Sarena/`](Sarena/README.md) | The iOS app (SwiftUI + MVVM, calm white-card design, Arabic/English) |
| [`backend/`](backend/.env.example) | The API server and database: accounts (email + SMS code), memberships, venues & events, bookings, logo & seasonal looks, discounts, push notifications, live updates |
| [`dashboard/`](dashboard/README.md) | The control panel (installable web app) at `/admin/` |
| [`website/`](website/index.html) | The public website at `/`, with App Store / Google Play buttons |
| [`REQUIREMENTS.txt`](REQUIREMENTS.txt) | What the project needs to launch (OTP/SMS, server, accounts, payments...), approximate prices, and the plan for success |

## Try it without a server · جرّب بدون خادم

| Open this file | What you get |
| --- | --- |
| **`dashboard/demo/sarena-admin-demo.html`** | The full control panel with sample data, saved on your device. Double-click it, or send it to your phone |
| **`website/index.html`** | The website (its dashboard button opens the demo above) |

افتح **`dashboard/demo/sarena-admin-demo.html`** لتجربة لوحة التحكم كاملة ببيانات تجريبية. أما `dashboard/index.html` فهو ملف المصدر، ولا يعمل عند فتحه مباشرة.

## Run everything locally

```bash
cd backend && npm start      # http://localhost:3000  (website)  ·  /admin/  (control panel)
```

`npm start` installs missing packages and builds the control panel on the first start, and again after an update changes them, so a fresh download or a `git pull` needs nothing else. It reads `backend/.env` if there is one. The address works in any letter case (`/Admin/` opens `/admin/`).

**Sign in to the control panel** with `ADMIN_EMAIL` / `ADMIN_PASSWORD` from `backend/.env`. Without `ADMIN_PASSWORD`, the server prints a password when it first creates the admin. **Forgot it?** Stop the server and run `bash admin-password.sh` in the project folder: it prints the admin's email and a new password (or sets yours: `bash admin-password.sh MyPassword2026`). It finds Node itself, even when the Terminal says `npm: command not found`; `cd backend && npm run admin-password` does the same. Setting `ADMIN_PASSWORD` also resets it on the next start. More admins and venue staff: *Members › New account*. A demo member is seeded: `demo@sarena.om` / `Sarena2026`, or +968 9123 4567 with SMS code `123456`.

**Connect the iPhone app:** open the control panel on the iPhone, choose *Connect the app* and tap *Open in the Sarena app*. For local testing in Xcode, set the scheme environment variable `SARENA_API_BASE_URL=http://localhost:3000`.

**Share it from your Mac:** `cloudflared tunnel --url http://localhost:3000` prints a public `https://….trycloudflare.com` address for the website, the control panel (`/admin/`) and the app. That address changes whenever the tunnel restarts: tap *Connect the app* again afterwards, or use a named Cloudflare tunnel on your own domain for a permanent address.

## Deploy

```bash
cp backend/.env.example backend/.env      # JWT_SECRET, ADMIN_*, APNS_*, SMS, store links
docker compose up -d --build              # Sarena + PostgreSQL on :3000
```

Put it behind HTTPS (Caddy, nginx or a cloud load balancer), then set `PUBLIC_URL`, the app's `SarenaAPIBaseURL` and the store links.

## Tests

```bash
cd backend && npm test          # API: auth, memberships, bookings, dashboard, live updates, notifications
cd dashboard && npm run build   # type-check + production build
```

---

## أداة نافذة المتجر (Store Popup)

نافذة منبثقة خفيفة تعرض **صورة المتجر** و**رابطه** و**معلومات الاتصال**، بدون أي مكتبات خارجية.

- `index.html` — صفحة لتعديل البيانات ومعاينة النافذة وتوليد كود التضمين.
- `store-popup.js` — الأداة نفسها (ملف واحد).

## التضمين في موقعك

```html
<script>
  window.StorePopupConfig = {
    name: "متجري",
    tagline: "منتجات مختارة بعناية",
    image: "https://.../cover.jpg",
    logo: "https://.../logo.png",
    url: "https://mystore.com",
    phone: "+966 50 000 0000",
    whatsapp: "966500000000",
    email: "info@mystore.com",
    address: "الرياض",
    hours: "يومياً 9 ص – 11 م",
    social: { instagram: "mystore", x: "mystore", snapchat: "", tiktok: "" },
    accent: "#0f766e",
    position: "left",      // مكان الزر العائم: left أو right
    autoOpenDelay: 0       // فتح تلقائي بعد X ثانية (0 = معطّل)
  };
</script>
<script src="store-popup.js" defer></script>
```

التحكم برمجياً: `StorePopup.open()` و`StorePopup.close()` و`StorePopup.init({...})`.

## المزايا

- زر عائم يفتح النافذة، وتُغلق بزر الإغلاق أو بالنقر خارجها أو بمفتاح Esc.
- زر لزيارة المتجر، ونسخ الرابط، ومشاركته.
- روابط مباشرة للاتصال وواتساب والبريد والخريطة.
- يدعم العربية (RTL)، والوضع الداكن، والجوال.
- معزول داخل Shadow DOM فلا يتأثر بتنسيقات موقعك ولا يؤثر عليها.

---

## تطبيق سرينا (iOS)

مشروع تطبيق **سرينا** (SwiftUI + MVVM بتصميم الزجاج العائم) موجود في المجلد [`Sarena/`](Sarena/README.md). افتح `Sarena/Sarena.xcodeproj` في Xcode.
