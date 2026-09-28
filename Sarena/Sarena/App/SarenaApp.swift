import SwiftUI

/// Sarena · سرينا — exclusive, members-only discounts and bookings in Oman.
@main
struct SarenaApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    private let services: AppServices
    @State private var session: SessionStore
    @State private var wallet: WalletStore
    @State private var membership: MembershipStore
    @State private var catalog: CatalogStore
    @State private var liveSync: LiveSync
    @State private var appConfig: AppConfigStore
    @State private var motion: MotionManager
    @State private var languageCoordinator: LanguageCoordinator

    @AppStorage(AppAppearance.storageKey) private var appearance: AppAppearance = .system

    init() {
        // The Sarena API when Info.plist › SarenaAPIBaseURL is set, else the on-device demo backend.
        let services = AppServices.configured()
        self.services = services
        let session = SessionStore(auth: services.auth)
        let wallet = WalletStore(booking: services.booking)
        let membership = MembershipStore(service: services.membership)
        let catalog = CatalogStore(catalog: services.catalog)
        let appConfig = AppConfigStore(service: services.config)
        _session = State(initialValue: session)
        _appConfig = State(initialValue: appConfig)
        _wallet = State(initialValue: wallet)
        _membership = State(initialValue: membership)
        _catalog = State(initialValue: catalog)
        _liveSync = State(initialValue: LiveSync(
            live: services.live, session: session, catalog: catalog, membership: membership, wallet: wallet,
            appConfig: appConfig
        ))
        // Push notifications and on-phone event reminders.
        NotificationsManager.shared.activate(registration: services.push)
        session.beforeSignOut = { await NotificationsManager.shared.sessionChanged(signedIn: false) }
        _motion = State(initialValue: MotionManager())
        _languageCoordinator = State(initialValue: LanguageCoordinator())
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(\.services, services)
                .environment(session)
                .environment(wallet)
                .environment(membership)
                .environment(catalog)
                .environment(liveSync)
                .environment(appConfig)
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
