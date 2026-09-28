# Sarena · سرينا

Exclusive, members-only prices in Oman — **one annual membership (15 OMR)**, bookable venues and events, codes redeemed at the door.

| Folder | What it is |
| --- | --- |
| [`Sarena/`](Sarena/README.md) | The iOS app (SwiftUI + MVVM, floating glass design, Arabic/English) |
| [`backend/`](backend/.env.example) | The API server and database: accounts (email + SMS code), memberships, venues & events, bookings, seasonal themes, discounts, push notifications, live updates |
| [`dashboard/`](dashboard/README.md) | The control panel (installable web app) at `/admin/` |
| [`website/`](website/index.html) | The public website at `/`, with App Store / Google Play buttons |
| [`REQUIREMENTS.txt`](REQUIREMENTS.txt) | What the project needs to launch (OTP/SMS, server, accounts, payments...), approximate prices, and the plan for success |

## Run everything locally

```bash
cd dashboard && npm install && npm run build && cd ..
cd backend && npm install && npm start      # http://localhost:3000  (website)  ·  /admin/  (control panel)
```

The API prints the admin password on first start (or set `ADMIN_EMAIL` / `ADMIN_PASSWORD`). A demo member is seeded: `demo@sarena.om` / `Sarena2026`, or +968 9123 4567 with SMS code `123456`. In Xcode, set the scheme environment variable `SARENA_API_BASE_URL=http://localhost:3000` to point the app at it.

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
