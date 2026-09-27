import Foundation

enum Validation {
    static func isValidEmail(_ email: String) -> Bool {
        email.trimmingCharacters(in: .whitespaces)
            .wholeMatch(of: #/[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/#) != nil
    }

    /// Keeps digits only, converting Arabic-Indic digits (٠١٢…) typed on an
    /// Arabic keyboard to ASCII.
    static func normalizedDigits(_ input: String) -> String {
        input.compactMap { $0.wholeNumberValue.map(String.init) }.joined()
    }

    /// Digits only, with a leading +968 / 00968 country code dropped.
    static func normalizedOmaniPhone(_ input: String) -> String {
        var digits = normalizedDigits(input)
        for prefix in ["00968", "968"] where digits.hasPrefix(prefix) && digits.count > 8 {
            digits.removeFirst(prefix.count)
            break
        }
        return digits
    }

    /// Omani mobile numbers: 8 digits starting with 7 or 9.
    static func isValidOmaniPhone(_ input: String) -> Bool {
        let digits = normalizedOmaniPhone(input)
        return digits.count == 8 && (digits.hasPrefix("7") || digits.hasPrefix("9"))
    }

    enum PasswordStrength: Int, Comparable {
        case weak, fair, strong

        static func < (lhs: Self, rhs: Self) -> Bool { lhs.rawValue < rhs.rawValue }
    }

    static func strength(of password: String) -> PasswordStrength {
        guard password.count >= 8,
              password.contains(where: \.isLetter),
              password.contains(where: \.isNumber) else { return .weak }
        let hasSymbol = password.contains { !$0.isLetter && !$0.isNumber }
        let hasMixedCase = password.contains(where: \.isUppercase) && password.contains(where: \.isLowercase)
        return password.count >= 12 || (hasSymbol && hasMixedCase) ? .strong : .fair
    }
}
