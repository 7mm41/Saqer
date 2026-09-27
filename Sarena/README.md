# Sarena · سرينا

Sarena is an iOS app for exclusive discounts and bookings in Oman. It is for members only: nobody sees a venue or a price without an account. It's built with **SwiftUI + MVVM** and has a floating **glassmorphism** design. It is fully localized in **English and Arabic (RTL)**.

![Brand sheet](Branding/renders/brand-sheet.png)

## Open & run

1. Open `Sarena.xcodeproj` in **Xcode 15 or newer**.
2. Select the **Sarena** target → *Signing & Capabilities* → choose your Team.
3. Run on an iPhone simulator or device (iOS 17+).

## 🧪 Demo account (testing only)

The app ships with a mock backend (`AppServices.mock`) that seeds this member:

| Sign-in method | Credentials |
| --- | --- |
| Mobile number | **+968 9123 4567** → SMS code **123456** |
| Email | **demo@sarena.om** / **Sarena2026** |

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
| Venue detail | Hero art with a floating discount medallion, description, highlights, MapKit `Map` with a marker and directions, VIP/Regular/Family/Group tickets (struck-through original price vs member price, scarcity), quantity, floating **Book Now** bar |
| Wallet | Lifetime savings card, glass segmented control **Active Codes / Used Codes**, ticket-shaped cards, QR sheet, copy code, mark as used |
| Settings | Membership card, **language indicator** (current language + LTR/RTL badge, in-app switch, iOS language settings), **app icon picker**, appearance, floating-motion toggle, **Log Out** |

## Architecture (MVVM)

```
Sarena/
├── App/            SarenaApp (entry point), RootView (auth gate), MainTabView
├── DesignSystem/   Theme tokens, GlassSurface modifier, FloatingGlass (motion),
│                   GlassBackground, buttons / text field / segmented control, brand views
├── Models/         User, OfferCategory, Venue + TicketOption, PromoCode, AppPreferences, sample data
├── Services/       AuthService (email + OTP), CatalogService, BookingService, KeychainStore, AppServices (DI)
├── Stores/         SessionStore, WalletStore, AppRouter  (@Observable, @MainActor)
├── ViewModels/     Login, Register, Home, VenueDetail, Wallet, Settings
├── Views/          Onboarding, Auth, Home, Detail, Wallet, Settings, Shared
└── Resources/      Assets.xcassets, Localizable.xcstrings, InfoPlist.xcstrings, Info.plist
```

* Views get services from `@Environment(\.services)` and **inject them into their view models**, so every view model can be tested with fakes (see `SarenaTests`).
* To go live, add URLSession-backed types that conform to `AuthServicing`, `CatalogServicing` and `BookingServicing`, and replace `AppServices.mock` in `SarenaApp`. No view needs to change.

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
