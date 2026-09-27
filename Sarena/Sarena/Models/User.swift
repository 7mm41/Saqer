import Foundation

struct User: Identifiable, Hashable, Codable, Sendable {
    let id: UUID
    var fullName: String
    var email: String
    /// Omani mobile number, digits only (e.g. "91234567").
    var phone: String
    let memberNumber: String
    let memberSince: Date

    var firstName: String {
        fullName.split(separator: " ").first.map(String.init) ?? fullName
    }

    var initials: String {
        let letters = fullName.split(separator: " ").prefix(2).compactMap(\.first)
        return letters.isEmpty ? "S" : String(letters).uppercased()
    }
}

/// Everything the registration screen collects.
struct RegistrationForm: Sendable {
    var fullName: String
    var email: String
    var phone: String
    var password: String
}
