import Foundation

protocol SubscriptionServicing: Sendable {
    /// Starts (or switches to) a package. Production: a StoreKit 2 auto-renewable
    /// subscription verified by the Sarena backend.
    func subscribe(to plan: MembershipPlan, for user: User) async throws -> Subscription
}

struct MockSubscriptionService: SubscriptionServicing {
    var latency: Duration = .milliseconds(800)

    func subscribe(to plan: MembershipPlan, for user: User) async throws -> Subscription {
        try await Task.sleep(for: latency)
        let now = Date.now
        // DEMO ONLY: no payment is taken.
        return Subscription(
            plan: plan,
            startedAt: now,
            renewsAt: plan.monthlyPrice > 0 ? Calendar.current.date(byAdding: .month, value: 1, to: now) : nil
        )
    }
}
