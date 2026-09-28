import CryptoKit
import Foundation
import SwiftUI

protocol AuthServicing: Sendable {
    /// Email + password sign-in.
    func signIn(email: String, password: String) async throws -> User
    /// Sends a one-time code by SMS to a registered Omani mobile number.
    func requestCode(phone: String) async throws -> OTPChallenge
    /// Verifies the SMS code and signs the member in.
    func verifyCode(_ code: String, phone: String) async throws -> User
    func register(_ form: RegistrationForm) async throws -> User
    /// The member's latest profile (name, status...). Throws `APIError` 401 once the session has ended.
    func refreshed(_ user: User) async throws -> User
    /// Permanently deletes the signed-in account (App Store requirement).
    func deleteAccount(_ user: User) async throws
    func signOut() async
}

struct OTPChallenge: Equatable, Sendable {
    /// Digits only, without the +968 prefix.
    let phone: String
    let codeLength: Int
    let resendAvailableAt: Date
}

enum AuthError: Error, Equatable {
    case invalidCredentials
    case emailAlreadyRegistered
    case phoneAlreadyRegistered
    case phoneNotRegistered
    case invalidCode
    case suspended
    case tooManyRequests
    case network

    var message: LocalizedStringKey {
        switch self {
        case .invalidCredentials: "The email or password is incorrect."
        case .emailAlreadyRegistered: "An account with this email already exists. Try signing in."
        case .phoneAlreadyRegistered: "This mobile number is already linked to an account."
        case .phoneNotRegistered: "No account uses this number yet. Create a free account first."
        case .invalidCode: "That code isn't right. Check the SMS and try again."
        case .suspended: "This account is suspended. Contact Sarena support."
        case .tooManyRequests: "Too many attempts. Please wait a moment and try again."
        case .network: "We couldn't reach Sarena. Check your connection and try again."
        }
    }
}

/// Test-only member seeded by the mock backend so the app can be explored
/// without registering. Never ship these credentials against the real API.
enum DemoAccount {
    static let fullName = "Demo Member"
    static let email = "demo@sarena.om"
    static let password = "Sarena2026"
    static let phone = "91234567"
    /// The mock backend accepts this SMS code for every registered number.
    static let otp = "123456"
}

/// Local stand-in for the Sarena identity API.
///
/// DEMO ONLY: accounts are stored on-device with a salted SHA-256 hash and SMS
/// codes are simulated, so the sign-in / sign-up flows behave realistically.
/// Production must authenticate against the backend (which sends the real SMS)
/// and keep only the session token, in the Keychain.
actor MockAuthService: AuthServicing {
    private struct StoredAccount: Codable {
        var user: User
        var salt: String
        var passwordHash: String
    }

    private static let storageKey = "sarena.mock.accounts"
    private let latency: Duration
    private let defaults: UserDefaults
    /// Keyed by normalised email.
    private var accounts: [String: StoredAccount]

    init(latency: Duration = .milliseconds(900), defaults: UserDefaults = .standard) {
        var accounts = defaults.data(forKey: Self.storageKey)
            .flatMap { try? JSONDecoder().decode([String: StoredAccount].self, from: $0) } ?? [:]
        if accounts[DemoAccount.email] == nil {
            // Seed (and persist, so the demo member keeps the same id and wallet across launches).
            accounts[DemoAccount.email] = Self.makeAccount(
                RegistrationForm(fullName: DemoAccount.fullName, email: DemoAccount.email,
                                 phone: DemoAccount.phone, password: DemoAccount.password)
            )
            Self.save(accounts, to: defaults)
        }
        self.latency = latency
        self.defaults = defaults
        self.accounts = accounts
    }

    // MARK: Email

    func signIn(email: String, password: String) async throws -> User {
        try await Task.sleep(for: latency)
        guard let account = accounts[Self.normalized(email)],
              Self.hash(password, salt: account.salt) == account.passwordHash else {
            throw AuthError.invalidCredentials
        }
        return account.user
    }

    // MARK: Phone (OTP)

    func requestCode(phone: String) async throws -> OTPChallenge {
        try await Task.sleep(for: latency)
        let digits = Validation.normalizedOmaniPhone(phone)
        guard account(forPhone: digits) != nil else { throw AuthError.phoneNotRegistered }
        // The real backend sends an SMS here.
        return OTPChallenge(phone: digits, codeLength: DemoAccount.otp.count, resendAvailableAt: .now.addingTimeInterval(30))
    }

    func verifyCode(_ code: String, phone: String) async throws -> User {
        try await Task.sleep(for: latency)
        let digits = Validation.normalizedOmaniPhone(phone)
        guard let account = account(forPhone: digits) else { throw AuthError.phoneNotRegistered }
        guard Validation.normalizedDigits(code) == DemoAccount.otp else { throw AuthError.invalidCode }
        return account.user
    }

    // MARK: Registration

    func register(_ form: RegistrationForm) async throws -> User {
        try await Task.sleep(for: latency)
        let email = Self.normalized(form.email)
        guard accounts[email] == nil else { throw AuthError.emailAlreadyRegistered }
        guard account(forPhone: Validation.normalizedOmaniPhone(form.phone)) == nil else {
            throw AuthError.phoneAlreadyRegistered
        }
        let account = Self.makeAccount(form)
        accounts[email] = account
        Self.save(accounts, to: defaults)
        return account.user
    }

    func refreshed(_ user: User) async throws -> User {
        accounts.values.first { $0.user.id == user.id }?.user ?? user
    }

    func deleteAccount(_ user: User) async throws {
        try await Task.sleep(for: latency)
        guard let email = accounts.first(where: { $0.value.user.id == user.id })?.key else { return }
        accounts[email] = nil
        Self.save(accounts, to: defaults)
    }

    func signOut() async {
        // Nothing to revoke on-device.
    }

    // MARK: Helpers

    private func account(forPhone digits: String) -> StoredAccount? {
        accounts.values.first { $0.user.phone == digits }
    }

    private static func save(_ accounts: [String: StoredAccount], to defaults: UserDefaults) {
        if let data = try? JSONEncoder().encode(accounts) {
            defaults.set(data, forKey: storageKey)
        }
    }

    private static func makeAccount(_ form: RegistrationForm) -> StoredAccount {
        let salt = UUID().uuidString
        let user = User(
            id: UUID(),
            fullName: form.fullName.trimmingCharacters(in: .whitespacesAndNewlines),
            email: normalized(form.email),
            phone: Validation.normalizedOmaniPhone(form.phone),
            memberNumber: "SRN-" + String(Int.random(in: 100_000...999_999)),
            memberSince: .now
        )
        return StoredAccount(user: user, salt: salt, passwordHash: hash(form.password, salt: salt))
    }

    private static func normalized(_ email: String) -> String {
        email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    }

    private static func hash(_ password: String, salt: String) -> String {
        SHA256.hash(data: Data((salt + password).utf8))
            .map { String(format: "%02x", $0) }
            .joined()
    }
}
