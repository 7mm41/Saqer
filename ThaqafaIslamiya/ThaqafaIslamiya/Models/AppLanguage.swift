//
//  AppLanguage.swift
//  ثقافة إسلامية
//
//  لغات التطبيق الست. العربية هي لغة الكتاب الأصلية، والبقية ترجمات لمعانيه.
//

import Foundation

enum AppLanguage: String, CaseIterable, Identifiable, Codable {
    case arabic = "ar"
    case english = "en"
    case persian = "fa"
    case turkish = "tr"
    case hindi = "hi"
    case bengali = "bn"

    var id: String { rawValue }

    /// اسم اللغة بلغتها نفسها (يظهر في قائمة الاختيار).
    var nativeName: String {
        switch self {
        case .arabic: "العربية"
        case .english: "English"
        case .persian: "فارسی"
        case .turkish: "Türkçe"
        case .hindi: "हिन्दी"
        case .bengali: "বাংলা"
        }
    }

    /// اسم اللغة بالإنجليزية (سطر ثانوي في قائمة الاختيار).
    var englishName: String {
        switch self {
        case .arabic: "Arabic"
        case .english: "English"
        case .persian: "Persian"
        case .turkish: "Turkish"
        case .hindi: "Hindi"
        case .bengali: "Bengali"
        }
    }

    /// حرف أو رمز قصير يظهر في دائرة اللغة.
    var glyph: String {
        switch self {
        case .arabic: "ع"
        case .english: "En"
        case .persian: "فا"
        case .turkish: "Tr"
        case .hindi: "हि"
        case .bengali: "বা"
        }
    }

    var isRightToLeft: Bool { self == .arabic || self == .persian }

    var locale: Locale { Locale(identifier: rawValue) }

    /// رمز لغة صوت النظام الاحتياطي (AVSpeechSynthesisVoice).
    var speechCode: String {
        switch self {
        case .arabic: "ar-SA"
        case .english: "en-US"
        case .persian: "fa-IR"
        case .turkish: "tr-TR"
        case .hindi: "hi-IN"
        case .bengali: "bn-IN"
        }
    }

    /// ملف المحتوى: `TalqeenData.json` للعربية و`TalqeenData.<code>.json` للترجمات.
    var dataFileName: String { self == .arabic ? "TalqeenData" : "TalqeenData.\(rawValue)" }

    /// لغة الجهاز إن كانت من لغات التطبيق، وإلا العربية.
    static var deviceDefault: AppLanguage {
        for identifier in Locale.preferredLanguages {
            let code = Locale(identifier: identifier).language.languageCode?.identifier ?? ""
            if let language = AppLanguage(rawValue: code) { return language }
        }
        return .arabic
    }
}
