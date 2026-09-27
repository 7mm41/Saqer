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
    @State private var motion: MotionManager
    private let content: Content

    @MainActor
    init(signedIn: Bool = true, @ViewBuilder content: () -> Content) {
        let session = SessionStore(auth: AppServices.preview.auth, keychain: KeychainStore(service: "om.sarena.preview"))
        let wallet = WalletStore(
            directory: .temporaryDirectory.appending(path: "SarenaPreview", directoryHint: .isDirectory),
            defaults: UserDefaults(suiteName: "om.sarena.preview") ?? .standard
        )
        if signedIn {
            session.didAuthenticate(.preview)
            wallet.load(for: User.preview.id)
        }
        _session = State(initialValue: session)
        _wallet = State(initialValue: wallet)
        _motion = State(initialValue: MotionManager())
        self.content = content()
    }

    var body: some View {
        content
            .environment(\.services, .preview)
            .environment(session)
            .environment(wallet)
            .environment(motion)
    }
}
