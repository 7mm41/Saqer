import SwiftUI

/// Gatekeeper: splash → (first launch) language + onboarding → authentication → members' area.
/// Nothing behind the login is reachable without an account.
struct RootView: View {
    @Environment(\.services) private var services
    @Environment(SessionStore.self) private var session
    @Environment(WalletStore.self) private var wallet
    @Environment(SubscriptionStore.self) private var subscription
    @Environment(CatalogStore.self) private var catalog
    @Environment(MotionManager.self) private var motion
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @AppStorage(PreferenceKeys.floatingMotion) private var floatingMotion = true
    @AppStorage(PreferenceKeys.hasCompletedOnboarding) private var hasCompletedOnboarding = false
    @State private var launchFinished = false

    private enum Screen: Equatable { case splash, onboarding, login, main }

    private var screen: Screen {
        guard launchFinished else { return .splash }
        switch session.phase {
        case .restoring: return .splash
        case .signedOut: return hasCompletedOnboarding ? .login : .onboarding
        case .signedIn: return .main
        }
    }

    var body: some View {
        ZStack {
            // One constant backdrop behind every screen: cross-fades never reveal
            // the black window underneath.
            GlassBackground()

            switch screen {
            case .splash:
                SplashView()
                    .transition(.opacity)
            case .onboarding:
                OnboardingFlowView()
                    .transition(.opacity)
            case .login:
                LoginView(auth: services.auth, session: session, isDemo: services.isDemo)
                    .transition(.opacity)
            case .main:
                MainTabView()
                    .transition(.opacity)
            }
        }
        // Opacity only: scaling a full screen exposes black edges around it.
        .animation(.easeInOut(duration: 0.45), value: screen)
        .task {
            await session.restore()
            // Arrive on a filled Home rather than on loading placeholders.
            if session.user != nil {
                await catalog.loadIfNeeded()
            }
            launchFinished = true
        }
        .onChange(of: session.user?.id, initial: true) { _, userID in
            wallet.load(for: userID)
            subscription.load(for: session.user)
            if userID == nil {
                catalog.reset()
            } else {
                Task { await catalog.loadIfNeeded() }
            }
        }
        .onChange(of: motionAllowed, initial: true) { _, allowed in
            // The sensor itself only runs while a `.parallax()` view is on screen.
            motion.setAllowed(allowed)
        }
    }

    private var motionAllowed: Bool {
        floatingMotion && !reduceMotion && scenePhase == .active
    }
}

/// A pixel-for-pixel continuation of the system launch screen (same colour, same
/// `LaunchLogo` image at its natural size, centred in the safe area), so the
/// hand-off from iOS to the app is invisible. A spinner fades in only if
/// loading takes unusually long.
struct SplashView: View {
    @State private var showsSpinner = false

    var body: some View {
        ZStack {
            Color("LaunchBackground")
                .ignoresSafeArea()
            Image("LaunchLogo")
                .accessibilityLabel(Text("Sarena"))
            ProgressView()
                .tint(Theme.Palette.orange)
                .offset(y: 170)
                .opacity(showsSpinner ? 1 : 0)
                .animation(.easeIn(duration: 0.3), value: showsSpinner)
        }
        .task {
            try? await Task.sleep(for: .milliseconds(1_500))
            showsSpinner = true
        }
    }
}

#Preview("Splash") {
    SplashView()
}
