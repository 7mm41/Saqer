import SwiftUI

extension User {
    static let preview = User(
        id: UUID(uuidString: "5A7E1A00-0000-4000-8000-000000000001")!,
        fullName: "Saqer Al Balushi",
        email: "demo@sarena.om",
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
    @State private var subscription: SubscriptionStore
    @State private var catalog: CatalogStore
    @State private var motion: MotionManager
    @State private var languageCoordinator: LanguageCoordinator
    private let content: Content

    @MainActor
    init(signedIn: Bool = true, @ViewBuilder content: () -> Content) {
        let session = SessionStore(auth: AppServices.preview.auth, keychain: KeychainStore(service: "om.sarena.preview"))
        let wallet = WalletStore(
            directory: .temporaryDirectory.appending(path: "SarenaPreview", directoryHint: .isDirectory),
            defaults: UserDefaults(suiteName: "om.sarena.preview") ?? .standard
        )
        let subscription = SubscriptionStore(defaults: UserDefaults(suiteName: "om.sarena.preview") ?? .standard)
        if signedIn {
            session.didAuthenticate(.preview)
            wallet.load(for: User.preview.id)
            subscription.load(for: .preview)
        }
        _session = State(initialValue: session)
        _wallet = State(initialValue: wallet)
        _subscription = State(initialValue: subscription)
        _catalog = State(initialValue: CatalogStore(catalog: AppServices.preview.catalog))
        _motion = State(initialValue: MotionManager())
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
            .environment(subscription)
            .environment(catalog)
            .environment(motion)
            .environment(languageCoordinator)
            .appLanguage(languageCoordinator.language)
            .languageTransitionCover(languageCoordinator)
    }
}
