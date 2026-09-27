import SwiftUI

/// Sarena · سرينا — exclusive, members-only discounts and bookings in Oman.
@main
struct SarenaApp: App {
    private let services: AppServices
    @State private var session: SessionStore
    @State private var wallet: WalletStore
    @State private var motion: MotionManager

    @AppStorage(AppLanguage.storageKey) private var language: AppLanguage = .system
    @AppStorage(AppAppearance.storageKey) private var appearance: AppAppearance = .system

    init() {
        // Replace `.mock` with the URLSession-backed services once the API is live.
        let services = AppServices.mock
        self.services = services
        _session = State(initialValue: SessionStore(auth: services.auth))
        _wallet = State(initialValue: WalletStore())
        _motion = State(initialValue: MotionManager())
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(\.services, services)
                .environment(session)
                .environment(wallet)
                .environment(motion)
                .appLanguage(language)
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
