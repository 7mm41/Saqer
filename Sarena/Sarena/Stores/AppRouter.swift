import Observation

enum AppTab: Hashable {
    case discover
    case wallet
    case account
    case settings
}

/// Cross-tab navigation, e.g. "View in Wallet" after a booking.
@Observable
@MainActor
final class AppRouter {
    var selectedTab: AppTab = .discover
    /// A venue to open on Discover (e.g. from a tapped notification).
    var pendingVenueID: String?

    nonisolated init() {}
}
