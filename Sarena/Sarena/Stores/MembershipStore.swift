import Foundation
import Observation

/// The signed-in member's Sarena membership and the plan on sale.
/// Booking at member prices needs an active membership.
@Observable
@MainActor
final class MembershipStore {
    enum LoadState: Equatable {
        case idle, loading, loaded, failed
    }

    /// Plans on sale; the launch plan is shown until the server answers.
    private(set) var plans: [MembershipPlan] = [.annual]
    private(set) var membership: Membership?
    private(set) var state: LoadState = .idle

    private let service: any MembershipServicing
    @ObservationIgnored private var owner: User?

    init(service: any MembershipServicing) {
        self.service = service
    }

    /// Sarena sells a single plan.
    var plan: MembershipPlan { plans.first ?? .annual }

    var isActive: Bool { membership?.isActive() ?? false }

    /// Switches to the given member (or clears on sign-out) and loads.
    func load(for user: User?) async {
        guard user?.id != owner?.id || state == .idle || state == .failed else { return }
        owner = user
        membership = nil
        guard user != nil else {
            state = .idle
            return
        }
        state = .loading
        await refresh()
        await reloadPlans()
    }

    func refresh() async {
        guard let owner else { return }
        do {
            let current = try await service.membership(for: owner)
            guard owner.id == self.owner?.id else { return }
            membership = current
            state = .loaded
        } catch is CancellationError {
            if state == .loading { state = .idle }
        } catch {
            if state != .loaded { state = .failed }
        }
    }

    func reloadPlans() async {
        if let fresh = try? await service.plans(), !fresh.isEmpty {
            plans = fresh
        }
    }

    /// Starts or renews the membership (renewals add a year to the current expiry).
    @discardableResult
    func subscribe() async throws -> Membership {
        guard let owner else { throw MembershipError.network }
        let membership = try await service.subscribe(to: plan, for: owner)
        self.membership = membership
        state = .loaded
        return membership
    }
}
