//
//  AppSettings.swift
//  ثقافة إسلامية
//
//  إعدادات المستخدم المحفوظة على الجهاز: لغة التطبيق، والقراءة الصوتية التلقائية للخطوات.
//

import SwiftUI
import Observation

@Observable
final class AppSettings {
    var language: AppLanguage {
        didSet {
            L10n.language = language
            defaults.set(language.rawValue, forKey: Keys.language)
        }
    }

    var autoNarrate: Bool {
        didSet { defaults.set(autoNarrate, forKey: Keys.autoNarrate) }
    }

    private let defaults: UserDefaults

    private enum Keys {
        static let language = "settings.language"
        static let autoNarrate = "settings.autoNarrate"
    }

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        let saved = defaults.string(forKey: Keys.language).flatMap(AppLanguage.init(rawValue:))
        let language = saved ?? .deviceDefault
        self.language = language
        self.autoNarrate = defaults.object(forKey: Keys.autoNarrate) as? Bool ?? true
        L10n.language = language
    }

    var layoutDirection: LayoutDirection { language.isRightToLeft ? .rightToLeft : .leftToRight }
}
