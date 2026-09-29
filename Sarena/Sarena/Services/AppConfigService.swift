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

/// Which of Apple's two push gateways this build's token belongs to: apps run
/// from Xcode get sandbox tokens, TestFlight and App Store installs production
/// ones. Sent with the token so the server uses the right gateway.
enum PushEnvironment: String, Sendable {
    case sandbox, production

    static let current: PushEnvironment = {
        #if targetEnvironment(simulator)
        return .sandbox
        #else
        let profile = Bundle.main.url(forResource: "embedded", withExtension: "mobileprovision")
        return from(provisioningProfile: profile.flatMap { try? Data(contentsOf: $0) })
        #endif
    }()

    /// Reads `aps-environment` from the provisioning profile inside the app.
    /// App Store builds have none, and use production.
    static func from(provisioningProfile data: Data?) -> PushEnvironment {
        guard let data,
              let start = data.range(of: Data("<?xml".utf8)),
              let end = data.range(of: Data("</plist>".utf8), in: start.lowerBound..<data.endIndex),
              let plist = try? PropertyListSerialization.propertyList(from: data.subdata(in: start.lowerBound..<end.upperBound), format: nil),
              let entitlements = (plist as? [String: Any])?["Entitlements"] as? [String: Any]
        else { return .production }
        return entitlements["aps-environment"] as? String == "development" ? .sandbox : .production
    }
}
