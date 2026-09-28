# Sarena · سرينا

Sarena is an iOS app for exclusive discounts and bookings in Oman. It is for members only: nobody sees a venue or a price without an account. It's built with **SwiftUI + MVVM** and has a floating **glassmorphism** design. It is fully localized in **English and Arabic (RTL)**.

![Brand sheet](Branding/renders/brand-sheet.png)

## Open & run

1. Open `Sarena.xcodeproj` in **Xcode 15 or newer**.
2. Select the **Sarena** target → *Signing & Capabilities* → choose your Team.
3. Run on an iPhone simulator or device (iOS 17+).

## Backend: on-device demo or the Sarena API

* **No setup:** when `Info.plist › SarenaAPIBaseURL` is empty, the app runs on an on-device demo backend (`AppServices.mock`).
* **Real server:** start the API in `../backend` (`npm install && npm start`), then either set `SarenaAPIBaseURL` (for example `https://api.sarena.om`) or add the scheme environment variable `SARENA_API_BASE_URL=http://localhost:3000`. Every service then goes through `APIClient`, and the token is kept in the Keychain.
* **Live updates:** changes made in the dashboard reach the app without signing out and back in. That includes new events, prices, photos, the membership price, a membership granted by an admin, and a code redeemed at the venue. The app re-checks everything each time it returns to the foreground; ETags keep that cheap. While it is open, it also listens to the server's event stream (`GET /v1/live`, see `Stores/LiveSync.swift`).

## 🧪 Demo account (testing only)

Both the on-device backend and the API (with `DEMO_MODE` on) seed this member:

| Sign-in method | Credentials |
| --- | --- |
| Mobile number | **+968 9123 4567** → SMS code **123456** |
| Email | **demo@sarena.om** / **Sarena2026** |

The demo member starts with an active **annual membership**. In demo mode, subscribing and renewing are simulated and no payment is taken.

The login screen also has a **Demo account** card with a **Use demo account** button. It fills in the details (and the SMS code) for you. The card only appears while `AppServices.isDemo` is `true`, so it goes away once you switch to the real API. With the mock backend, every registered number accepts `123456` as its SMS code.

## First launch flow

1. **Launch screen**: the Sarena lockup on a warm background, set in `Info.plist › UILaunchScreen`.
2. **Splash**: the glass tag floats in while the session restores.
3. **Language picker**: greeting chips ("Hello · مرحبا · Hola…") and language cards. Arabic and English are live; French, Spanish, Russian and Chinese are marked *Soon*.
4. **Onboarding carousel**: three illustrated pages with *Continue* / *Skip* and a capsule page indicator.
5. **Sign in**: by **mobile number (SMS code)** or **email + password**, or **Create a free account**.

## Features

| Area | What's inside |
| --- | --- |
| Auth | Phone OTP (SMS AutoFill), email/password, registration with live validation (Omani numbers, Arabic-Indic digits, password strength), Keychain-backed session |
| Dashboard | Savings banner, 3D "cover-flow" featured carousel with live countdowns, the 7 category cards, a "Biggest savings" list, search |
| Categories | Cinema · Jet Ski · Oman Shooting Club · Oman Automobile Association · Ibri Arena · Video Game Arcades · Oman Festivals (Ibri & Muscat Nights) |
| Venue detail | Hero photo (uploaded from the dashboard) or category art, with a floating discount medallion. Also: event dates, description, highlights, and a MapKit `Map` with a marker and directions. **Ticket options** show the struck-through original price vs the member price, with live scarcity. Then quantity and a floating **Book Now** bar; without a membership that bar shows **Become a member** instead |
| My Account (حسابي) | Membership card, **member savings** (total saved, ready and redeemed codes, a link to the Wallet) and the **Sarena membership**. There is one plan: **15 OMR a year**, set in the dashboard. The screen shows its status, valid-until date, days left, progress, perks and a **Subscribe / Renew** button, whose confirmation is anchored to the button. Renewing adds a year to the current expiry date |
| Wallet | Glass segmented control **Active Codes / Used Codes**, ticket-shaped cards, QR sheet, copy code, mark as used |
| Language switch | Changing the language shows a short branded **"Changing language…" screen** (logo in a filling timer ring, the target language with its flag). The switch happens behind it, so the layout never flips between LTR and RTL in view. The same screen appears when the language is picked on first launch |
| Settings | **Language indicator** (current language + LTR/RTL badge, in-app switch, iOS language settings), **app icon picker**, appearance, floating-motion toggle, **Log Out** |

## Architecture (MVVM)

```
Sarena/
├── App/            SarenaApp (entry point), RootView (auth gate), MainTabView
├── DesignSystem/   Theme tokens, GlassSurface modifier, FloatingGlass (motion),
│                   GlassBackground, buttons / text field / segmented control, brand views
├── Models/         User, OfferCategory, Venue + TicketOption, MembershipPlan + Membership, PromoCode, AppPreferences, sample data
├── Services/       Auth, Catalog, Booking, Membership (mock + API), APIClient, LiveUpdates (SSE), KeychainStore, AppServices (DI)
├── Stores/         SessionStore, CatalogStore, WalletStore, MembershipStore, LiveSync, LanguageCoordinator, AppRouter  (@Observable, @MainActor)
├── ViewModels/     Login, Register, Home, VenueDetail, Wallet, Account, Settings
├── Views/          Onboarding, Auth, Home, Detail, Wallet, Account, Settings, Shared
└── Resources/      Assets.xcassets, Localizable.xcstrings, InfoPlist.xcstrings, Info.plist
```

* Views get services from `@Environment(\.services)` and **inject them into their view models**, so every view model can be tested with fakes (see `SarenaTests`).
* `AppServices.configured()` picks the on-device demo services or the URLSession-backed API services (`Services/APIServices.swift`). No view depends on which one is used.

## The glass design system

```swift
content.glassSurface()                                        // frosted glass card
content.glassSurface(.panel)                                  // thinMaterial panel (forms)
content.glassSurface(.bar)                                    // ultraThinMaterial bar over scrolling content
content.glassSurface(.tinted(Theme.Palette.orange))           // orange glass with glow
content.glassSurface(.chip, in: Capsule())                    // any InsettableShape
content.glassSurface(.card, in: TicketShape())                // ticket with notches
logo.idleFloat().parallax()                                   // hero artwork only
Button("Book Now") { }.buttonStyle(.sarenaProminent)          // .sarenaGlass, .sarenaDestructive
```

Each pane has a glass body, an optional colour tint, an inner reflection, a gradient rim light, and a soft floating shadow.

### Performance rules (why the app stays cool)

* **The backdrop is a static, pre-blurred image** (`GlassBackdrop`, light + dark). Nothing animates behind the glass, so nothing gets re-blurred frame after frame.
* **Content cards use frosted glass**: a translucent fill with sheen and rim, and no live backdrop blur. Over an already-blurred backdrop it looks the same and costs a fraction of a `Material`. Real `ultraThinMaterial` / `thinMaterial` is kept for surfaces that float over moving content: the booking bar, form panels, sheets and the tab bar.
* **No endless animations on glass panes.** `idleFloat()` is only for lightweight artwork, such as the logo on the splash, sign-in and onboarding screens.
* **`parallax()` is used on a few hero elements only**: the logo, the discount medallion and the membership card. `MotionManager` is reference-counted, so the motion sensor runs only while one of them is on screen. It samples at 20 Hz, ignores sub-pixel changes, and pauses in Low Power Mode, under thermal pressure, with Reduce Motion, or when the Settings toggle is off.
* No blur filters on scrolling content (glows use radial gradients), the map is flat and non-interactive, and QR codes are cached.

The style names use a `Sarena`/`glassSurface` prefix on purpose. iOS 26 adds its own `.glass` button style and `glassEffect`, and the prefix keeps this code compiling on every SDK.

## App icons

| Icon | Asset | Notes |
| --- | --- | --- |
| Sarena Classic | `AppIcon` | Primary icon, with iOS 18 dark and tinted variants |
| **Glassmorphism Logo** | `AppIcon-Glass` | Frosted orange glass floating over colour orbs |
| Midnight Glass | `AppIcon-Midnight` | Smoked glass with a neon rim |
| Frost Glass | `AppIcon-Frost` | White frosted glass on a sunset gradient |

`SettingsViewModel.setIcon(_:)` calls `UIApplication.setAlternateIconName(_:)`. The alternates are listed in the `ASSETCATALOG_COMPILER_ALTERNATE_APPICON_NAMES` build setting.

## Branding renders

All logos, icons and onboarding illustrations are built from HTML/CSS in `Branding/source`:

```bash
cd Branding/source && ./render.sh     # needs chrome-headless-shell + python3/Pillow
```

It writes PNG/JPEG files to `Branding/renders/` and updates `Assets.xcassets` in place. The fonts are Montserrat and Alexandria, both under the SIL Open Font License.

## Regenerating the Xcode project

```bash
gem install xcodeproj
ruby scripts/generate_xcodeproj.rb
```

Every `.swift` file under `Sarena/` and `SarenaTests/` is picked up automatically.

---

### بالعربية

**سرينا** تطبيق iOS لعروض وحجوزات حصرية في عُمان للأعضاء فقط، مبني بـ SwiftUI ونمط MVVM، بتصميم الزجاج العائم، ويدعم العربية (من اليمين لليسار) والإنجليزية بالكامل.

* افتح `Sarena.xcodeproj` في Xcode، واختر فريق التوقيع، ثم شغّل التطبيق.
* **الحساب التجريبي (للتجربة فقط):**
  * بالجوال: `‎+968 9123 4567` ثم رمز التحقق `123456`
  * بالبريد: `demo@sarena.om` وكلمة المرور `Sarena2026`
* عند أول تشغيل: شاشة الشعار، ثم اختيار اللغة، ثم ثلاث شاشات تعريفية فيها «المتابعة» و«تخطي»، ثم تسجيل الدخول بالجوال أو البريد، أو إنشاء حساب جديد.
