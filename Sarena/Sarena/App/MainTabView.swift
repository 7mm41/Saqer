import SwiftUI

struct MainTabView: View {
    @Environment(\.services) private var services
    @Environment(SessionStore.self) private var session
    @Environment(WalletStore.self) private var wallet
    @Environment(MembershipStore.self) private var membership
    @Environment(CatalogStore.self) private var catalog
    @State private var router = AppRouter()
    @State private var notifications = NotificationsManager.shared

    var body: some View {
        TabView(selection: $router.selectedTab) {
            HomeView(catalog: catalog)
                .glassTabBar()
                .tabItem { Label("Discover", systemImage: "sparkles") }
                .tag(AppTab.discover)

            WalletView(wallet: wallet)
                .glassTabBar()
                .tabItem { Label("Wallet", systemImage: "wallet.pass.fill") }
                .badge(wallet.activeCodes.count)
                .tag(AppTab.wallet)

            // "حسابي": member savings + the annual membership in one place.
            AccountView(store: membership, session: session, wallet: wallet, isDemo: services.isDemo)
            .glassTabBar()
            .tabItem { Label("My Account", systemImage: "person.crop.circle.fill") }
            .tag(AppTab.account)

            SettingsView(session: session)
                .glassTabBar()
                .tabItem { Label("Settings", systemImage: "gearshape.fill") }
                .tag(AppTab.settings)
        }
        .environment(router)
        .sensoryFeedback(.selection, trigger: router.selectedTab)
        // Tapped notifications: a venue opens on Discover, a reminder opens the Wallet.
        .onChange(of: notifications.pendingVenueID, initial: true) { _, venueID in
            guard let venueID else { return }
            router.selectedTab = .discover
            router.pendingVenueID = venueID
            notifications.pendingVenueID = nil
        }
        .onChange(of: notifications.opensWallet, initial: true) { _, opens in
            guard opens else { return }
            router.selectedTab = .wallet
            notifications.opensWallet = false
        }
    }
}

private extension View {
    /// Frosted tab bar so content glides underneath it.
    func glassTabBar() -> some View {
        toolbarBackground(.ultraThinMaterial, for: .tabBar)
            .toolbarBackground(.visible, for: .tabBar)
    }
}

#Preview {
    PreviewContainer {
        MainTabView()
    }
}
