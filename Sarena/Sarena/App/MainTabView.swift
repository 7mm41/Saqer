import SwiftUI

struct MainTabView: View {
    @Environment(\.services) private var services
    @Environment(SessionStore.self) private var session
    @Environment(WalletStore.self) private var wallet
    @State private var router = AppRouter()

    var body: some View {
        TabView(selection: $router.selectedTab) {
            HomeView(catalog: services.catalog)
                .glassTabBar()
                .tabItem { Label("Discover", systemImage: "sparkles") }
                .tag(AppTab.discover)

            WalletView(wallet: wallet)
                .glassTabBar()
                .tabItem { Label("Wallet", systemImage: "wallet.pass.fill") }
                .badge(wallet.activeCodes.count)
                .tag(AppTab.wallet)

            SettingsView(session: session)
                .glassTabBar()
                .tabItem { Label("Settings", systemImage: "gearshape.fill") }
                .tag(AppTab.settings)
        }
        .environment(router)
        .sensoryFeedback(.selection, trigger: router.selectedTab)
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
