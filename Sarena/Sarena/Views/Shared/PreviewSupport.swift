import SwiftUI

extension User {
    static let preview = User(
        id: UUID(uuidString: "5A7E1A00-0000-4000-8000-000000000001")!,
        fullName: "Saqer Al Balushi",
        email: "member@example.com",
        phone: "91234567",
        memberNumber: "SRN-204851",
        memberSince: Date(timeIntervalSince1970: 1_767_225_600)
    )
}

/// Wraps a preview in a fully wired, signed-in (or signed-out) environment
/// backed by instant mock services and sandboxed storage.
struct PreviewContainer<Content: View>: View {
    @State private var session: SessionStore
    @State private var wallet: WalletStore
    @State private var membership: MembershipStore
    @State private var catalog: CatalogStore
    @State private var liveSync: LiveSync
    @State private var appConfig: AppConfigStore
    @State private var languageCoordinator: LanguageCoordinator
    private let content: Content

    @MainActor
    init(signedIn: Bool = true, @ViewBuilder content: () -> Content) {
        let session = SessionStore(auth: AppServices.preview.auth, keychain: KeychainStore(service: "om.sarena.preview"))
        let services = AppServices.preview
        let wallet = WalletStore(booking: services.booking)
        let membership = MembershipStore(service: services.membership)
        let catalog = CatalogStore(catalog: services.catalog)
        if signedIn {
            session.didAuthenticate(.preview)
        }
        _session = State(initialValue: session)
        _wallet = State(initialValue: wallet)
        _membership = State(initialValue: membership)
        _catalog = State(initialValue: catalog)
        _appConfig = State(initialValue: AppConfigStore(service: services.config,
                                                        defaults: UserDefaults(suiteName: "om.sarena.preview") ?? .standard))
        _liveSync = State(initialValue: LiveSync(
            live: nil, session: session, catalog: catalog, membership: membership, wallet: wallet
        ))
        _languageCoordinator = State(initialValue: LanguageCoordinator(
            defaults: UserDefaults(suiteName: "om.sarena.preview") ?? .standard
        ))
        self.content = content()
    }

    var body: some View {
        content
            .environment(\.services, .preview)
            .environment(session)
            .environment(wallet)
            .environment(membership)
            .environment(catalog)
            .environment(liveSync)
            .environment(appConfig)
            .environment(languageCoordinator)
            .appLanguage(languageCoordinator.language)
            .languageTransitionCover(languageCoordinator)
            .task {
                await wallet.load(for: session.user)
                await membership.load(for: session.user)
            }
    }
}
