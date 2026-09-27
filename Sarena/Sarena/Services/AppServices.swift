import SwiftUI

/// Dependency container. Views read it from the environment and hand the
/// individual services to their view models, which keeps every view model
/// testable with fakes.
struct AppServices: Sendable {
    let auth: any AuthServicing
    let catalog: any CatalogServicing
    let booking: any BookingServicing
    /// True while the app runs on the mock backend: enables the demo-account shortcut.
    var isDemo = false

    /// In-memory implementations used until the Sarena API is live.
    /// Swap for `.live` (URLSession-backed clients) without touching any view.
    static let mock = AppServices(
        auth: MockAuthService(),
        catalog: MockCatalogService(),
        booking: MockBookingService(),
        isDemo: true
    )

    /// Instant responses for SwiftUI previews.
    static let preview = AppServices(
        auth: MockAuthService(latency: .zero),
        catalog: MockCatalogService(latency: .zero),
        booking: MockBookingService(latency: .zero),
        isDemo: true
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
