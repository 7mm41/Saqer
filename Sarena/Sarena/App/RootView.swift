import SwiftUI

/// Gatekeeper: splash → (first launch) language + onboarding → authentication → members' area.
/// Nothing behind the login is reachable without an account.
struct RootView: View {
    @Environment(\.services) private var services
    @Environment(SessionStore.self) private var session
    @Environment(WalletStore.self) private var wallet
    @Environment(MembershipStore.self) private var membership
    @Environment(CatalogStore.self) private var catalog
    @Environment(LiveSync.self) private var liveSync
    @Environment(AppConfigStore.self) private var appConfig
    @Environment(\.locale) private var locale
    @State private var notifications = NotificationsManager.shared
    @Environment(MotionManager.self) private var motion
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @AppStorage(PreferenceKeys.floatingMotion) private var floatingMotion = true
    @AppStorage(PreferenceKeys.hasCompletedOnboarding) private var hasCompletedOnboarding = false
    @State private var launchFinished = false
    /// The member whose data was last loaded; later activations re-sync it.
    @State private var syncedUserID: User.ID?

    /// Reminders follow the wallet, the dashboard's timings, the language and permission.
    private struct ReminderKey: Equatable {
        let codes: [PromoCode]
        let settings: ReminderSettings
        let language: String
        let authorized: Bool
    }

    /// Live updates run while the app is on screen: the member's stream when
    /// signed in, the public one (seasonal look, plans) before that.
    private struct SyncKey: Equatable {
        let userID: User.ID?
        let isForeground: Bool
        let isReady: Bool
    }

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
            // The seasonal look (logo, greeting): cached from last time, refreshed now.
            Task { await appConfig.refresh() }
            await session.restore()
            // Arrive on a filled Home rather than on loading placeholders.
            if let user = session.user {
                async let venues: Void = catalog.loadIfNeeded()
                async let current: Void = membership.load(for: user)
                _ = await (venues, current)
            }
            launchFinished = true
        }
        .onChange(of: session.user?.id, initial: true) { _, userID in
            let user = session.user
            if userID == nil { catalog.reset() }
            Task {
                await notifications.sessionChanged(signedIn: user != nil)
                async let codes: Void = wallet.load(for: user)
                async let current: Void = membership.load(for: user)
                if userID != nil { await catalog.loadIfNeeded() }
                _ = await (codes, current)
            }
        }
        // Dashboard changes appear by themselves: re-sync on every return to
        // the foreground, then listen for pushed updates while on screen.
        .task(id: SyncKey(userID: session.user?.id, isForeground: scenePhase != .background, isReady: launchFinished)) {
            guard launchFinished, scenePhase != .background else { return }
            if let userID = session.user?.id {
                if syncedUserID == userID {
                    await liveSync.refreshAll()
                } else {
                    syncedUserID = userID
                }
                await notifications.refreshAuthorization()
            } else {
                await liveSync.refreshAll()
            }
            await liveSync.run()
        }
        .task(id: ReminderKey(codes: wallet.codes, settings: appConfig.reminders,
                              language: locale.identifier, authorized: notifications.isAuthorized)) {
            guard notifications.isAuthorized, session.user != nil else { return }
            // Let quick successive changes settle first.
            try? await Task.sleep(for: .milliseconds(300))
            guard !Task.isCancelled else { return }
            await notifications.reminders.sync(codes: wallet.codes, settings: appConfig.reminders, locale: locale)
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
