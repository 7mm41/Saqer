import Foundation
import Observation

/// "حسابي" — profile, member savings, subscription info and package switching.
@Observable
@MainActor
final class AccountViewModel {
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
    private let wallet: WalletStore

    init(service: any SubscriptionServicing, store: SubscriptionStore, session: SessionStore, wallet: WalletStore, isDemo: Bool = false) {
        self.service = service
        self.store = store
        self.session = session
        self.wallet = wallet
        self.isDemo = isDemo
    }

    // MARK: Profile & member savings

    var user: User? { session.user }

    /// Lifetime savings — the number marketing loves to show.
    var totalSavings: Decimal { wallet.totalSavings }
    var readyCount: Int { wallet.activeCodes.count }
    var redeemedCount: Int { wallet.codes.filter { $0.status == .used }.count }

    // MARK: Subscription & packages

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
