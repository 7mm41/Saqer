import SwiftUI

/// Sarena · سرينا — exclusive, members-only discounts and bookings in Oman.
@main
struct SarenaApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    /// Everything that talks to the server (always https://sarena.tech).
    @State private var container = AppContainer(services: .configured())
    @State private var languageCoordinator = LanguageCoordinator()

    @AppStorage(AppAppearance.storageKey) private var appearance: AppAppearance = .system

    init() {
        ServerAddress.forgetLegacySettings()
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(\.services, container.services)
                .environment(container.session)
                .environment(container.wallet)
                .environment(container.membership)
                .environment(container.catalog)
                .environment(container.liveSync)
                .environment(container.appConfig)
                .environment(languageCoordinator)
                .appLanguage(languageCoordinator.language)
                // Branded "changing language" cover, so the switch never flips the UI in view.
                .languageTransitionCover(languageCoordinator)
                .preferredColorScheme(appearance.colorScheme)
                .tint(Theme.Palette.orange)
        }
    }
}

/// The server-facing half of the app: its services and the stores built on them.
@MainActor
final class AppContainer {
    let services: AppServices
    let session: SessionStore
    let wallet: WalletStore
    let membership: MembershipStore
    let catalog: CatalogStore
    let liveSync: LiveSync
    let appConfig: AppConfigStore

    init(services: AppServices) {
        self.services = services
        session = SessionStore(auth: services.auth)
        wallet = WalletStore(booking: services.booking)
        membership = MembershipStore(service: services.membership)
        catalog = CatalogStore(catalog: services.catalog)
        appConfig = AppConfigStore(service: services.config)
        liveSync = LiveSync(
            live: services.live, session: session, catalog: catalog, membership: membership, wallet: wallet,
            appConfig: appConfig
        )
        // Push notifications and on-phone event reminders.
        NotificationsManager.shared.activate(registration: services.push)
        session.beforeSignOut = { await NotificationsManager.shared.sessionChanged(signedIn: false) }
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
