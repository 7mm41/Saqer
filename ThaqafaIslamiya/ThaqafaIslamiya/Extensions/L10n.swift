//
//  L10n.swift
//  ثقافة إسلامية
//
//  نصوص الواجهة بست لغات من الملف المحلي `UIStrings.json` ({key: {lang: text}}).
//  الاستخدام: `L10n.t("quiz.score", score.digits, total.digits)` — تُستبدل {0} و{1} بالقيم.
//  عند تغيير اللغة يُعاد بناء الواجهة كلها (انظر `RootView.id`)، فتكفي قراءة `L10n.language` الحالية.
//

import Foundation

enum L10n {
    /// اللغة الحالية — يضبطها `AppSettings` فقط.
    nonisolated(unsafe) static var language: AppLanguage = .arabic

    private static let table: [String: [String: String]] = {
        guard let url = Bundle.main.url(forResource: "UIStrings", withExtension: "json"),
              let data = try? Data(contentsOf: url),
              let table = try? JSONDecoder().decode([String: [String: String]].self, from: data)
        else { return [:] }
        return table
    }()

    static func t(_ key: String, _ args: String...) -> String {
        let entry = table[key]
        var text = entry?[language.rawValue] ?? entry?[AppLanguage.arabic.rawValue] ?? key
        for (index, value) in args.enumerated() {
            text = text.replacingOccurrences(of: "{\(index)}", with: value)
        }
        return text
    }
}

extension Int {
    /// الرقم بأرقام اللغة الحالية (١٢٣ للعربية، ۱۲۳ للفارسية، ১২৩ للبنغالية…).
    var digits: String {
        let language = L10n.language
        let formatter = Self.formatters[language] ?? {
            let formatter = NumberFormatter()
            formatter.locale = language.locale
            formatter.numberStyle = .none
            Self.formatters[language] = formatter
            return formatter
        }()
        return formatter.string(from: NSNumber(value: self)) ?? String(self)
    }

    nonisolated(unsafe) private static var formatters: [AppLanguage: NumberFormatter] = [:]
}
