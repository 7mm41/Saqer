import SwiftUI

/// Sarena · سرينا — exclusive, members-only discounts and bookings in Oman.
@main
struct SarenaApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    /// Everything that talks to the server; rebuilt when the app is connected to another one.
    @State private var container = AppContainer(services: .configured())
    @State private var languageCoordinator = LanguageCoordinator()
    /// A server offered by a `sarena://connect?server=…` link, awaiting confirmation.
    @State private var offeredServer: URL?

    @AppStorage(AppAppearance.storageKey) private var appearance: AppAppearance = .system

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
                // A fresh screen tree (and fresh stores) for a new server.
                .id(container.id)
                .environment(languageCoordinator)
                .appLanguage(languageCoordinator.language)
                // Branded "changing language" cover, so the switch never flips the UI in view.
                .languageTransitionCover(languageCoordinator)
                .preferredColorScheme(appearance.colorScheme)
                .tint(Theme.Palette.orange)
                .onOpenURL { url in
                    guard ServerAddress.linksAllowed(), let server = ServerAddress.fromConnectLink(url) else { return }
                    offeredServer = server
                }
                .alert(
                    Text("Connect Sarena to this server?"),
                    isPresented: Binding(get: { offeredServer != nil }, set: { if !$0 { offeredServer = nil } }),
                    presenting: offeredServer
                ) { server in
                    Button("Connect") { connect(to: server) }
                    Button("Cancel", role: .cancel) {}
                } message: { server in
                    Text("\(server.host() ?? server.absoluteString)\nYou will sign in again on this server.")
                }
        }
    }

    /// Switches every store to `server`. The old server's sign-in and cached
    /// look are dropped first, so nothing of one server is sent to another.
    private func connect(to server: URL) {
        guard server != ServerAddress.current() || container.services.isDemo else { return }
        container.session.endSession()
        TokenStore().clear()
        AppConfigStore.clearCache()
        ServerAddress.save(server)
        container = AppContainer(services: .configured())
    }
}

/// The server-facing half of the app: its services and the stores built on them.
@MainActor
final class AppContainer {
    let id = UUID()
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
