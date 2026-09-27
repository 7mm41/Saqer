import Foundation
import Observation

/// The signed-in member's package. Drives the prices shown at every venue and
/// the package name on the "Subscription" tab.
@Observable
@MainActor
final class SubscriptionStore {
    private(set) var current: Subscription = .free

    var plan: MembershipPlan { current.plan }

    @ObservationIgnored private var ownerID: User.ID?
    private let defaults: UserDefaults

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
    }

    /// Switches to the given member (or resets on sign-out).
    func load(for user: User?) {
        ownerID = user?.id
        guard let user else {
            current = .free
            return
        }
        if let data = defaults.data(forKey: Self.key(for: user.id)),
           let stored = try? JSONDecoder().decode(Subscription.self, from: data) {
            current = stored
        } else if user.email == DemoAccount.email {
            // The demo member showcases the Gold package.
            current = Subscription(plan: .gold, startedAt: .now, renewsAt: Calendar.current.date(byAdding: .month, value: 1, to: .now))
        } else {
            current = .free
        }
    }

    func update(_ subscription: Subscription) {
        current = subscription
        guard let ownerID, let data = try? JSONEncoder().encode(subscription) else { return }
        defaults.set(data, forKey: Self.key(for: ownerID))
    }

    private static func key(for userID: User.ID) -> String {
        "sarena.subscription.\(userID.uuidString)"
    }
}
