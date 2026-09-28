import SwiftUI

/// Sarena · سرينا — exclusive, members-only discounts and bookings in Oman.
@main
struct SarenaApp: App {
    private let services: AppServices
    @State private var session: SessionStore
    @State private var wallet: WalletStore
    @State private var subscription: SubscriptionStore
    @State private var catalog: CatalogStore
    @State private var motion: MotionManager
    @State private var languageCoordinator: LanguageCoordinator

    @AppStorage(AppAppearance.storageKey) private var appearance: AppAppearance = .system

    init() {
        // Replace `.mock` with the URLSession-backed services once the API is live.
        let services = AppServices.mock
        self.services = services
        _session = State(initialValue: SessionStore(auth: services.auth))
        _wallet = State(initialValue: WalletStore())
        _subscription = State(initialValue: SubscriptionStore())
        _catalog = State(initialValue: CatalogStore(catalog: services.catalog))
        _motion = State(initialValue: MotionManager())
        _languageCoordinator = State(initialValue: LanguageCoordinator())
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(\.services, services)
                .environment(session)
                .environment(wallet)
                .environment(subscription)
                .environment(catalog)
                .environment(motion)
                .environment(languageCoordinator)
                .appLanguage(languageCoordinator.language)
                // Branded "changing language" cover, so the switch never flips the UI in view.
                .languageTransitionCover(languageCoordinator)
                .preferredColorScheme(appearance.colorScheme)
                .tint(Theme.Palette.orange)
        }
    }
}

// MARK: - Language environment

private struct AppLanguageModifier: ViewModifier {
    let language: AppLanguage

    func body(content: Content) -> some View {
        // Always applied (never conditionally) so switching language keeps
        // navigation state instead of rebuilding the view tree.
        content
            .environment(\.locale, language.locale)
            .environment(\.layoutDirection, language.layoutDirection)
    }
}

extension View {
    /// Re-renders SwiftUI text, number/currency formats and RTL/LTR layout
    /// instantly when the member switches language inside the app.
    func appLanguage(_ language: AppLanguage) -> some View {
        modifier(AppLanguageModifier(language: language))
    }
}
