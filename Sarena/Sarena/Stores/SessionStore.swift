import Foundation
import Observation

/// Single source of truth for "who is signed in". The whole app is gated on
/// `phase`: without an account nobody sees a venue or a member price.
@Observable
@MainActor
final class SessionStore {
    enum Phase: Equatable {
        case restoring
        case signedOut
        case signedIn(User)
    }

    private(set) var phase: Phase = .restoring

    var user: User? {
        if case .signedIn(let user) = phase { return user }
        return nil
    }

    /// Runs before signing out while the session is still valid (e.g. to
    /// unlink this phone's push token from the member).
    @ObservationIgnored var beforeSignOut: (@MainActor () async -> Void)?

    private let auth: any AuthServicing
    private let keychain: KeychainStore
    private static let sessionAccount = "current-session"

    init(auth: any AuthServicing, keychain: KeychainStore = KeychainStore(service: "om.sarena.session")) {
        self.auth = auth
        self.keychain = keychain
        // The API rejected the token (signed out from the dashboard, suspended...).
        NotificationCenter.default.addObserver(forName: .sarenaSessionExpired, object: nil, queue: .main) { [weak self] _ in
            Task { @MainActor in self?.endSession() }
        }
    }

    /// Restores a persisted session at launch. The brief minimum keeps the
    /// splash on screen long enough to read as intentional, not as a flicker.
    func restore(minimumSplash: Duration = .milliseconds(600)) async {
        guard phase == .restoring else { return }
        try? await Task.sleep(for: minimumSplash)
        if let data = keychain.data(for: Self.sessionAccount),
           let user = try? JSONDecoder().decode(User.self, from: data) {
            phase = .signedIn(user)
        } else {
            phase = .signedOut
        }
    }

    /// Called by the login / registration view models after the API succeeds.
    func didAuthenticate(_ user: User) {
        store(user)
        phase = .signedIn(user)
    }

    /// Picks up profile changes made from the dashboard. An ended session
    /// (signed out elsewhere, suspended) signs the member out here too.
    func refresh() async {
        guard let user else { return }
        do {
            let fresh = try await auth.refreshed(user)
            guard self.user?.id == fresh.id else { return }
            if fresh != user {
                didAuthenticate(fresh)
            }
        } catch let error as APIError where error.endsSession {
            endSession()
        } catch {
            // Offline: keep the cached profile.
        }
    }

    func signOut() async {
        await beforeSignOut?()
        await auth.signOut()
        endSession()
    }

    /// Deletes the account for good (Settings › Delete account).
    func deleteAccount() async throws {
        guard let user else { return }
        await beforeSignOut?()
        try await auth.deleteAccount(user)
        endSession()
    }

    /// Clears the local session without calling the server.
    func endSession() {
        guard phase != .signedOut else { return }
        keychain.removeValue(for: Self.sessionAccount)
        phase = .signedOut
    }

    private func store(_ user: User) {
        // Only the profile; the API token lives in its own Keychain item.
        if let data = try? JSONEncoder().encode(user) {
            keychain.set(data, for: Self.sessionAccount)
        }
    }
}
