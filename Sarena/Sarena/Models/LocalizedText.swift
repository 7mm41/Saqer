import Foundation

/// Bilingual content delivered by the backend (venue names, descriptions...).
///
/// UI chrome is localised through `Localizable.xcstrings` + `LocalizedStringKey`;
/// *content* arrives in both languages and is resolved against the active locale:
///
/// ```swift
/// @Environment(\.locale) private var locale
/// Text(venue.name(locale))
/// ```
struct LocalizedText: Hashable, Codable, Sendable {
    let en: String
    let ar: String

    init(_ en: String, ar: String) {
        self.en = en
        self.ar = ar
    }

    func callAsFunction(_ locale: Locale) -> String {
        locale.language.languageCode?.identifier == "ar" ? ar : en
    }

    /// Case- and diacritic-insensitive search across both languages.
    func matches(_ query: String) -> Bool {
        let options: String.CompareOptions = [.caseInsensitive, .diacriticInsensitive]
        return en.range(of: query, options: options) != nil || ar.range(of: query, options: options) != nil
    }
}
