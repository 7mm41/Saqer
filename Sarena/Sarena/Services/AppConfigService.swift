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
