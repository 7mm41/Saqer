import Foundation
import SwiftUI

protocol MembershipServicing: Sendable {
    /// Plans on sale (Sarena launches with one: 15 OMR a year).
    func plans() async throws -> [MembershipPlan]
    /// The member's current membership, if any.
    func membership(for user: User) async throws -> Membership?
    /// Starts the membership, or renews it from the current expiry date.
    /// Production: an App Store purchase verified by the Sarena API.
    func subscribe(to plan: MembershipPlan, for user: User) async throws -> Membership
}

enum MembershipError: Error, Equatable {
    case paymentsUnavailable
    case network

    var message: LocalizedStringKey {
        switch self {
        case .paymentsUnavailable: "Subscriptions open soon. Please try again later."
        case .network: "We couldn't reach Sarena. Check your connection and try again."
        }
    }
}

/// On-device stand-in for the membership API.
///
/// DEMO ONLY: no payment is taken. The demo member starts with an active
/// annual membership; new accounts start without one.
actor MockMembershipService: MembershipServicing {
    private let latency: Duration
    private let defaults: UserDefaults
    private let plan: MembershipPlan

    init(latency: Duration = .milliseconds(800), defaults: UserDefaults = .standard, plan: MembershipPlan = .annual) {
        self.latency = latency
        self.defaults = defaults
        self.plan = plan
    }

    func plans() async throws -> [MembershipPlan] {
        [plan]
    }

    func membership(for user: User) async throws -> Membership? {
        if let data = defaults.data(forKey: key(for: user)),
           let stored = try? JSONDecoder().decode(Membership.self, from: data) {
            return stored
        }
        guard user.email == DemoAccount.email else { return nil }
        // The demo member joined a few weeks ago.
        let started = Date.now.addingTimeInterval(-40 * 86_400)
        let demo = Membership(id: UUID().uuidString, plan: plan, status: .active, startsAt: started,
                              expiresAt: started.addingTimeInterval(TimeInterval(plan.durationDays) * 86_400))
        save(demo, for: user)
        return demo
    }

    func subscribe(to plan: MembershipPlan, for user: User) async throws -> Membership {
        try await Task.sleep(for: latency)
        let current = try await membership(for: user)
        // Renewing keeps the remaining days: the new year starts when the current one ends.
        let startsAt = current.flatMap { $0.isActive() ? $0.expiresAt : nil } ?? .now
        let membership = Membership(
            id: UUID().uuidString, plan: plan, status: .active, startsAt: startsAt,
            expiresAt: startsAt.addingTimeInterval(TimeInterval(plan.durationDays) * 86_400)
        )
        save(membership, for: user)
        return membership
    }

    private func save(_ membership: Membership, for user: User) {
        if let data = try? JSONEncoder().encode(membership) {
            defaults.set(data, forKey: key(for: user))
        }
    }

    private func key(for user: User) -> String {
        "sarena.membership.\(user.id.uuidString)"
    }
}
