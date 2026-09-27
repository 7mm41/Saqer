import SwiftUI

/// Gatekeeper: splash → (first launch) language + onboarding → authentication → members' area.
/// Nothing behind the login is reachable without an account.
struct RootView: View {
    @Environment(\.services) private var services
    @Environment(SessionStore.self) private var session
    @Environment(WalletStore.self) private var wallet
    @Environment(MotionManager.self) private var motion
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @AppStorage(PreferenceKeys.floatingMotion) private var floatingMotion = true
    @AppStorage(PreferenceKeys.hasCompletedOnboarding) private var hasCompletedOnboarding = false

    var body: some View {
        ZStack {
            switch session.phase {
            case .restoring:
                SplashView()
                    .transition(.opacity)
            case .signedOut where !hasCompletedOnboarding:
                OnboardingFlowView()
                    .transition(.opacity)
            case .signedOut:
                LoginView(auth: services.auth, session: session, isDemo: services.isDemo)
                    .transition(.asymmetric(insertion: .opacity, removal: .opacity.combined(with: .scale(scale: 1.04))))
            case .signedIn:
                MainTabView()
                    .transition(.opacity.combined(with: .scale(scale: 0.96)))
            }
        }
        .animation(.smooth(duration: 0.55), value: session.phase)
        .task { await session.restore() }
        .onChange(of: session.user?.id, initial: true) { _, userID in
            wallet.load(for: userID)
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

/// Launch moment: the glass tag floats in while the session restores.
struct SplashView: View {
    @State private var appeared = false

    var body: some View {
        VStack(spacing: Theme.Spacing.l) {
            SarenaWordmark(logoSize: 132)
            Text("Exclusive deals. Members only.")
                .font(.sarena(.subheadline, weight: .semibold))
                .foregroundStyle(.secondary)
        }
        .scaleEffect(appeared ? 1 : 0.85)
        .opacity(appeared ? 1 : 0)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .sarenaScreenBackground()
        .onAppear {
            withAnimation(.spring(response: 0.7, dampingFraction: 0.7)) { appeared = true }
        }
    }
}

#Preview("Splash") {
    SplashView()
}
