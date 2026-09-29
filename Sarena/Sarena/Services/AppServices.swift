import SwiftUI

/// Dependency container. Views read it from the environment and hand the
/// individual services to their view models, which keeps every view model
/// testable with fakes.
struct AppServices: Sendable {
    let auth: any AuthServicing
    let catalog: any CatalogServicing
    let booking: any BookingServicing
    let membership: any MembershipServicing
    /// Seasonal theme and reminder timings from the dashboard.
    var config: any AppConfigServicing = MockAppConfigService()
    /// Push-notification token registration.
    var push: any PushRegistrationServicing = NoPushRegistration()
    /// Server push for live updates; nil for the on-device mock backend.
    var live: (any LiveUpdatesServicing)?
    /// Apple Wallet passes; nil for the on-device mock backend (nothing to sign them).
    var walletPasses: (any WalletPassServicing)? = nil

    /// On-device stand-ins for SwiftUI previews and tests; the app itself always uses the API.
    static let mock = AppServices(
        auth: MockAuthService(),
        catalog: MockCatalogService(),
        booking: MockBookingService(),
        membership: MockMembershipService(),
        live: nil
    )

    /// Instant responses for SwiftUI previews.
    static let preview = AppServices(
        auth: MockAuthService(latency: .zero),
        catalog: MockCatalogService(latency: .zero),
        booking: MockBookingService(latency: .zero,
                                    directory: .temporaryDirectory.appending(path: "SarenaPreview", directoryHint: .isDirectory),
                                    defaults: UserDefaults(suiteName: "om.sarena.preview") ?? .standard),
        membership: MockMembershipService(latency: .zero, defaults: UserDefaults(suiteName: "om.sarena.preview") ?? .standard),
        live: nil
    )
}

private struct AppServicesKey: EnvironmentKey {
    static let defaultValue = AppServices.mock
}

extension EnvironmentValues {
    var services: AppServices {
        get { self[AppServicesKey.self] }
        set { self[AppServicesKey.self] = newValue }
    }
}
