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

    private let auth: any AuthServicing
    private let keychain: KeychainStore
    private static let sessionAccount = "current-session"

    init(auth: any AuthServicing, keychain: KeychainStore = KeychainStore(service: "om.sarena.session")) {
        self.auth = auth
        self.keychain = keychain
    }

    /// Restores a persisted session at launch. The short pause lets the
    /// animated splash play once instead of flashing.
    func restore(splashDuration: Duration = .milliseconds(1_200)) async {
        guard phase == .restoring else { return }
        try? await Task.sleep(for: splashDuration)
        if let data = keychain.data(for: Self.sessionAccount),
           let user = try? JSONDecoder().decode(User.self, from: data) {
            phase = .signedIn(user)
        } else {
            phase = .signedOut
        }
    }

    /// Called by the login / registration view models after the API succeeds.
    func didAuthenticate(_ user: User) {
        // A production app stores the access/refresh tokens here, not the profile.
        if let data = try? JSONEncoder().encode(user) {
            keychain.set(data, for: Self.sessionAccount)
        }
        phase = .signedIn(user)
    }

    func signOut() async {
        await auth.signOut()
        keychain.removeValue(for: Self.sessionAccount)
        phase = .signedOut
    }
}
