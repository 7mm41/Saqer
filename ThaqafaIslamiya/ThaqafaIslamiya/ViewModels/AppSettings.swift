//
//  AppSettings.swift
//  ثقافة إسلامية
//
//  إعدادات المستخدم المحفوظة على الجهاز: اللغة، والمظهر (فاتح/داكن)، وخلفية التطبيق، وإظهار التشكيل،
//  والقراءة الصوتية وسرعتها، والاهتزاز، والتذكير اليومي.
//

import SwiftUI
import Observation

/// مظهر التطبيق.
enum Appearance: String, CaseIterable, Identifiable {
    case system, light, dark
    var id: String { rawValue }
    var colorScheme: ColorScheme? {
        switch self {
        case .system: nil
        case .light: .light
        case .dark: .dark
        }
    }
    var symbol: String {
        switch self {
        case .system: "circle.lefthalf.filled"
        case .light: "sun.max.fill"
        case .dark: "moon.stars.fill"
        }
    }
    var title: String { L10n.t("appearance.\(rawValue)") }
}

/// ألوان خلفية التطبيق (الزجاج السائل فوقها).
enum BackgroundTheme: String, CaseIterable, Identifiable {
    case classic, ocean, sunset, emerald, royal
    var id: String { rawValue }
    var colors: [Color] {
        switch self {
        case .classic: [.teal, .indigo, .pink, .mint]
        case .ocean: [.cyan, .blue, .teal, .indigo]
        case .sunset: [.orange, .pink, .yellow, .red]
        case .emerald: [.green, .mint, .teal, .yellow]
        case .royal: [.purple, .indigo, .pink, .blue]
        }
    }
    var title: String { L10n.t("theme.\(rawValue)") }
}

/// أيقونة التطبيق على الشاشة الرئيسية للجهاز.
enum AppIconChoice: String, CaseIterable, Identifiable {
    case classic, night, desert, emerald, rose
    var id: String { rawValue }
    /// اسم الأيقونة البديلة (nil = الأساسية).
    var alternateName: String? { self == .classic ? nil : "AppIcon-\(rawValue.capitalized)" }
    var previewImage: String { "IconPreview-\(rawValue.capitalized)" }
    var title: String { L10n.t("icon.\(rawValue)") }

    static func from(alternateName: String?) -> AppIconChoice {
        allCases.first { $0.alternateName == alternateName } ?? .classic
    }
}

@Observable
final class AppSettings {
    var language: AppLanguage {
        didSet {
            L10n.language = language
            defaults.set(language.rawValue, forKey: Keys.language)
        }
    }
    var appearance: Appearance {
        didSet { defaults.set(appearance.rawValue, forKey: Keys.appearance) }
    }
    var theme: BackgroundTheme {
        didSet { defaults.set(theme.rawValue, forKey: Keys.theme) }
    }
    /// إظهار التشكيل الكامل على نصوص المسائل والخطوات (العربية).
    var showTashkeel: Bool {
        didSet { defaults.set(showTashkeel, forKey: Keys.tashkeel) }
    }
    var autoNarrate: Bool {
        didSet { defaults.set(autoNarrate, forKey: Keys.autoNarrate) }
    }
    /// سرعة القراءة: 1.0 = السرعة الطبيعية (٠٪).
    var speechRate: Double {
        didSet { defaults.set(speechRate, forKey: Keys.speechRate) }
    }
    var haptics: Bool {
        didSet { defaults.set(haptics, forKey: Keys.haptics) }
    }
    var reminderEnabled: Bool {
        didSet { defaults.set(reminderEnabled, forKey: Keys.reminder) }
    }
    /// وقت التذكير بالدقائق منذ منتصف الليل.
    var reminderMinutes: Int {
        didSet { defaults.set(reminderMinutes, forKey: Keys.reminderTime) }
    }

    private let defaults: UserDefaults

    private enum Keys {
        static let language = "settings.language"
        static let appearance = "settings.appearance"
        static let theme = "settings.theme"
        static let tashkeel = "settings.tashkeel"
        static let autoNarrate = "settings.autoNarrate"
        static let speechRate = "settings.speechRate"
        static let haptics = "settings.haptics"
        static let reminder = "settings.reminder"
        static let reminderTime = "settings.reminderTime"
    }

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        let language = defaults.string(forKey: Keys.language).flatMap(AppLanguage.init(rawValue:)) ?? .deviceDefault
        self.language = language
        self.appearance = defaults.string(forKey: Keys.appearance).flatMap(Appearance.init(rawValue:)) ?? .system
        self.theme = defaults.string(forKey: Keys.theme).flatMap(BackgroundTheme.init(rawValue:)) ?? .classic
        self.showTashkeel = defaults.object(forKey: Keys.tashkeel) as? Bool ?? false
        self.autoNarrate = defaults.object(forKey: Keys.autoNarrate) as? Bool ?? true
        self.speechRate = defaults.object(forKey: Keys.speechRate) as? Double ?? 1.0
        self.haptics = defaults.object(forKey: Keys.haptics) as? Bool ?? true
        self.reminderEnabled = defaults.object(forKey: Keys.reminder) as? Bool ?? false
        self.reminderMinutes = defaults.object(forKey: Keys.reminderTime) as? Int ?? 17 * 60
        L10n.language = language
    }

    var layoutDirection: LayoutDirection { language.isRightToLeft ? .rightToLeft : .leftToRight }

    /// ملف المحتوى المناسب: العربية المشكولة عند تفعيل «إظهار التشكيل».
    var contentFileName: String {
        language == .arabic && showTashkeel ? "TalqeenData.tashkeel" : language.dataFileName
    }

    var reminderDate: Date {
        get { Calendar.current.date(bySettingHour: reminderMinutes / 60, minute: reminderMinutes % 60, second: 0, of: .now) ?? .now }
        set {
            let parts = Calendar.current.dateComponents([.hour, .minute], from: newValue)
            reminderMinutes = (parts.hour ?? 17) * 60 + (parts.minute ?? 0)
        }
    }
}
