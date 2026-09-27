import Foundation

extension Decimal {
    /// "OMR 5.500" / "‏٥٫٥٠٠ ر.ع.‏" — formatted for the *view's* locale so the
    /// in-app language switch also switches digits and currency placement.
    func omr(_ locale: Locale) -> String {
        formatted(.currency(code: "OMR").locale(locale))
    }
}

extension Date {
    func shortDate(_ locale: Locale) -> String {
        formatted(.dateTime.day().month(.abbreviated).year().locale(locale))
    }
}

extension Int {
    func localizedPercent(_ locale: Locale) -> String {
        (Double(self) / 100).formatted(.percent.precision(.fractionLength(0)).locale(locale))
    }

    func localizedNumber(_ locale: Locale) -> String {
        formatted(.number.locale(locale))
    }
}

extension Double {
    func rating(_ locale: Locale) -> String {
        formatted(.number.precision(.fractionLength(1)).locale(locale))
    }
}
