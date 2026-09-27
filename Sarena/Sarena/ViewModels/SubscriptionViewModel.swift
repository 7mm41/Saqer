import Foundation
import Observation

@Observable
@MainActor
final class SubscriptionViewModel {
    /// Package awaiting confirmation (drives the confirmation dialog).
    var pendingPlan: MembershipPlan?
    private(set) var processingPlan: MembershipPlan?
    var didFail = false
    /// Briefly true after a switch, for the success haptic / banner.
    private(set) var justSubscribed: MembershipPlan?

    let isDemo: Bool
    private let service: any SubscriptionServicing
    private let store: SubscriptionStore
    private let session: SessionStore

    init(service: any SubscriptionServicing, store: SubscriptionStore, session: SessionStore, isDemo: Bool = false) {
        self.service = service
        self.store = store
        self.session = session
        self.isDemo = isDemo
    }

    var plans: [MembershipPlan] { MembershipPlan.allCases }
    var current: Subscription { store.current }

    func isCurrent(_ plan: MembershipPlan) -> Bool { plan == store.plan }

    func choose(_ plan: MembershipPlan) {
        guard !isCurrent(plan), processingPlan == nil else { return }
        pendingPlan = plan
    }

    /// Takes the package explicitly: the dialog clears `pendingPlan` as it
    /// dismisses, before this async work starts.
    func confirm(_ plan: MembershipPlan) async {
        pendingPlan = nil
        guard !isCurrent(plan), processingPlan == nil, let user = session.user else { return }
        processingPlan = plan
        defer { processingPlan = nil }
        do {
            let subscription = try await service.subscribe(to: plan, for: user)
            store.update(subscription)
            justSubscribed = plan
        } catch {
            didFail = true
        }
    }
}
