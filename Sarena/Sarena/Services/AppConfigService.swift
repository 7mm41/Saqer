import Foundation

protocol AppConfigServicing: Sendable {
    /// The dashboard-controlled look and reminder timings.
    func fetchConfig() async throws -> AppConfig
}

/// The on-device demo has no dashboard: standard look and timings.
struct MockAppConfigService: AppConfigServicing {
    var config: AppConfig = .standard

    func fetchConfig() async throws -> AppConfig { config }
}

/// Apple Wallet passes made by the server: the membership card and each code.
/// Every pass carries a QR the venue scans to confirm the membership or redeem the code.
protocol WalletPassServicing: Sendable {
    /// `language`: "ar" or "en", for venue names and titles on the pass.
    func membershipPass(language: String) async throws -> Data
    func bookingPass(id: String, language: String) async throws -> Data
}

protocol PushRegistrationServicing: Sendable {
    /// Links this phone's push token to the signed-in member.
    func register(token: String, locale: String) async throws
    /// Called on sign-out so the phone stops receiving the member's notifications.
    func unregister(token: String) async
}

struct NoPushRegistration: PushRegistrationServicing {
    func register(token: String, locale: String) async throws {}
    func unregister(token: String) async {}
}
