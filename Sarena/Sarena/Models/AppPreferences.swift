import SwiftUI

// MARK: - App icon

/// Home Screen icons shipped in `Assets.xcassets`. Members no longer pick
/// them (the look is set in the control panel); the list lets someone who
/// chose one in an earlier version return to `.classic`.
///
/// Every alternate must also be listed in the target's
/// `ASSETCATALOG_COMPILER_ALTERNATE_APPICON_NAMES` build setting
/// (`AppIcon-Glass AppIcon-Midnight AppIcon-Frost`), otherwise
/// `setAlternateIconName(_:)` fails with "file not found".
enum AppIcon: String, CaseIterable, Identifiable {
    /// Primary icon — the classic orange Sarena tag rendered as 3D glass.
    case classic
    /// "Glassmorphism Logo" — frosted orange glass floating over colour orbs.
    case glass
    /// Smoked glass with a neon orange rim.
    case midnight
    /// White frosted glass on a sunset gradient.
    case frost
    /// Seasonal: Oman National Day (flag colours).
    case nationalDay
    /// Seasonal: Ramadan (night sky, golden crescent).
    case ramadan
    /// Seasonal: Eid (emerald and gold).
    case eid

    var id: String { rawValue }

    /// Name passed to `UIApplication.setAlternateIconName(_:)`; `nil` restores the primary icon.
    var alternateIconName: String? {
        switch self {
        case .classic: nil
        case .glass: "AppIcon-Glass"
        case .midnight: "AppIcon-Midnight"
        case .frost: "AppIcon-Frost"
        case .nationalDay: "AppIcon-NationalDay"
        case .ramadan: "AppIcon-Ramadan"
        case .eid: "AppIcon-Eid"
        }
    }

    init(alternateIconName: String?) {
        self = Self.allCases.first { $0.alternateIconName == alternateIconName } ?? .classic
    }
}

// MARK: - Language

/// In-app language override. `.system` follows iOS (including the per-app
/// language chosen in Settings › Sarena › Language).
enum AppLanguage: String, CaseIterable, Identifiable {
    case system
    case english
    case arabic

    static let storageKey = "sarena.language"

    var id: String { rawValue }

    /// Language names are shown in their own script in both UIs.
    var title: LocalizedStringKey {
        switch self {
        case .system: "System"
        case .english: "English"
        case .arabic: "العربية"
        }
    }

    /// Name in its own script, for the language-change screen.
    var nativeName: String {
        switch self {
        case .system: Self.systemResolved == .arabic ? "العربية" : "English"
        case .english: "English"
        case .arabic: "العربية"
        }
    }

    var flag: String {
        switch self {
        case .system: "🌐"
        case .english: "🇬🇧"
        case .arabic: "🇴🇲"
        }
    }

    /// The concrete language `.system` currently resolves to.
    private static var systemResolved: AppLanguage {
        Bundle.main.preferredLocalizations.first?.hasPrefix("ar") == true ? .arabic : .english
    }

    var locale: Locale {
        switch self {
        case .system: .autoupdatingCurrent
        case .english: Locale(identifier: "en_OM")
        case .arabic: Locale(identifier: "ar_OM")
        }
    }

    /// Direction of the language the UI is actually rendered in.
    var layoutDirection: LayoutDirection {
        let language: Locale.Language
        switch self {
        case .system:
            // The bundle localisation iOS picked for this app, not the device region.
            language = Locale.Language(identifier: Bundle.main.preferredLocalizations.first ?? "en")
        case .english, .arabic:
            language = locale.language
        }
        return language.characterDirection == .rightToLeft ? .rightToLeft : .leftToRight
    }
}

// MARK: - Appearance

enum AppAppearance: String, CaseIterable, Identifiable {
    case system
    case light
    case dark

    static let storageKey = "sarena.appearance"

    var id: String { rawValue }

    var colorScheme: ColorScheme? {
        switch self {
        case .system: nil
        case .light: .light
        case .dark: .dark
        }
    }

    var title: LocalizedStringKey {
        switch self {
        case .system: "Auto"
        case .light: "Light"
        case .dark: "Dark"
        }
    }
}

enum PreferenceKeys {
    static let hasCompletedOnboarding = "sarena.onboarding.completed"
}
