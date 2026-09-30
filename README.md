# Sarena · سرينا

Exclusive, members-only prices in Oman — **one annual membership (15 OMR)**, bookable venues and events, codes redeemed at the door.

| Folder | What it is |
| --- | --- |
| [`Sarena/`](Sarena/README.md) | The iOS app (SwiftUI + MVVM, calm white-card design, Arabic/English) |
| [`backend/`](backend/.env.example) | The API server and database: accounts (email + SMS code), memberships, venues & events, bookings, logo & seasonal looks, discounts, push notifications, live updates |
| [`dashboard/`](dashboard/README.md) | The control panel (installable web app) at a private address that nothing links to |
| [`website/`](website/index.html) | The public website at `/`, with App Store / Google Play buttons |
| [`REQUIREMENTS.txt`](REQUIREMENTS.txt) | What the project needs to launch (OTP/SMS, server, accounts, payments...), approximate prices, and the plan for success |

## Security · الحماية

* **One account runs everything:** the owner, `saqer@sarena.tech` (`ADMIN_EMAIL`). It opens the control panel and also signs in to the app (with a membership). There are no demo, default or staff accounts, and the control panel can't create any; members sign up in the app. The first start of this version deletes every older test account once.
* **Passwords are never shown, printed or stored in clear.** The owner's password is typed hidden (`sudo bash deploy/install.sh --password` on the server, `bash admin-password.sh` on a Mac) and kept only as a scrypt hash. SMS codes are hashed too, and there are no fixed test codes.
* **The control panel has a private address,** `https://sarena.tech/<ADMIN_PATH>/`, printed only by the installer. The website doesn't link to it, search engines are told to skip it, and `/admin` is a plain "not found". Only sign-ins made from that address can manage anything: the same account signed in from the app is just a member.
* **Password guessing is stopped:** 5 wrong passwords lock that account's sign-in for 15 minutes, then 30, 1 hour… up to a day, whatever address the guesses come from. 20 wrong attempts lock the address too, and every address is limited to 10 sign-in attempts and 600 requests a minute. Wrong passwords for the owner's account are recorded.
* **Sign-in history:** the control panel shows when you last signed in to it (bottom of the menu) and lists every sign-in (time, device, address, app or panel) and wrong password. *Sign out everywhere else* ends any sign-in you don't recognise.
* **Encrypted data:** names, emails, phone numbers and sign-in details are stored encrypted (AES-256-GCM) in the database, found by keyed hashes. Everything travels over HTTPS. Every night `deploy/backup.sh` saves an encrypted copy of the database (AES-256) in `backups/`, keeping 14.
* **The app always talks to `https://sarena.tech`**, over HTTPS only. There is no server setting, link or screen that shows or changes it.
* **Keep the code private:** make this GitHub repository private (Settings › General › Danger Zone › Change visibility). The server's code runs only on the server; the iPhone app is compiled, and Apple encrypts App Store apps; the website and control panel files are minified.

## Run it on your Mac (development)

```bash
cd backend && npm start      # http://localhost:3000  (website)  ·  http://localhost:3000/admin/  (control panel, development only)
bash admin-password.sh       # first time: choose the owner's password (typed hidden)
```

`npm start` installs missing packages and builds the control panel on the first start, and again after an update changes them. It reads `backend/.env` if there is one. In development the control panel is at `/admin/`; on the server it has its private address.

`dashboard/demo/sarena-admin-demo.html` is a stand-alone demo of the control panel with made-up data and no server behind it.

## Deploy

Sarena needs a server that runs Node.js and a database around the clock: a **VPS** (e.g. Hostinger KVM, Hetzner, DigitalOcean) with Ubuntu. Shared web hosting (such as Hostinger *Premium Web Hosting*) runs PHP sites only and can't run it.

1. Point the domain's DNS **A** records (`@` and `www`) at the VPS's IP.
2. Copy this folder to the VPS (`git clone`, or upload the zip), then inside it:

```bash
sudo bash deploy/install.sh --domain sarena.tech
```

It installs Docker and creates the settings: a random database password, `JWT_SECRET`, `DATA_KEY` and the panel's private address. It then starts Sarena, PostgreSQL and **Caddy**, which gets and renews the HTTPS certificate by itself. The first time, it asks for the owner's password (hidden). Finally it prints the website and the private control panel link, and sets up the nightly encrypted backup. Run it again after an update; settings and data are kept.

* Website `https://<domain>/` · control panel `https://<domain>/<ADMIN_PATH>/` · API `/v1/`. Live updates stream straight through Caddy (never compressed).
* Change the owner's password: `sudo bash deploy/install.sh --password`.
* **Automatic updates:** `sudo bash deploy/install.sh --auto-update` checks GitHub every 10 minutes (`deploy/update.sh`). A new version is installed by itself: an encrypted backup first, then the build while the site keeps running, then the switch. If it doesn't build or start, the previous version is put back and that version is skipped. `bash deploy/update.sh --status` shows the installed and latest versions and the log (`/var/log/sarena-update.log`). For a private repository, `bash deploy/github-access.sh` gives the server a read-only GitHub deploy key.
* **Push notifications:** `bash deploy/push-setup.sh` asks for the Key ID, Team ID and the `.p8` key (pasted hidden), writes `backend/.env` and `backend/certs/`, restarts the server and checks that push is on. Then use *Notifications › Send a test to my phone* in the control panel.
* The APNs key and Wallet certificates go in `backend/certs/`, which is mounted read-only and never built into the image.
* Never change `JWT_SECRET` or `DATA_KEY` once there is data: the encrypted fields would become unreadable (the server then refuses to start and says why).

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
