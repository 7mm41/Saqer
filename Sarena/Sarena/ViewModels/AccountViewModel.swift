import Foundation
import Observation

/// "حسابي" — profile, member savings and the Sarena membership.
@Observable
@MainActor
final class AccountViewModel {
    /// Drives the confirmation dialog (attached to the subscribe button).
    var isConfirming = false
    private(set) var isProcessing = false
    var failure: MembershipError?
    /// Changes after a successful purchase, for the success haptic.
    private(set) var subscribedAt: Date?

    private let store: MembershipStore
    private let session: SessionStore
    private let wallet: WalletStore

    init(store: MembershipStore, session: SessionStore, wallet: WalletStore) {
        self.store = store
        self.session = session
        self.wallet = wallet
    }

    // MARK: Profile & member savings

    var user: User? { session.user }

    /// Lifetime savings — the number marketing loves to show.
    var totalSavings: Decimal { wallet.totalSavings }
    var readyCount: Int { wallet.activeCodes.count }
    var redeemedCount: Int { wallet.codes.filter { $0.status == .used }.count }

    // MARK: Membership

    var plan: MembershipPlan { store.plan }
    var membership: Membership? { store.membership }
    var isActive: Bool { store.isActive }
    var isLoading: Bool { store.state == .loading && store.membership == nil }

    /// "Subscribe" for new members, "Renew" for existing and lapsed ones.
    var isRenewal: Bool { membership != nil }

    /// Share of the membership period already used (for the progress bar).
    func progress(now: Date = .now) -> Double {
        guard let membership, membership.isActive(at: now) else { return 1 }
        let total = membership.expiresAt.timeIntervalSince(membership.startsAt)
        guard total > 0 else { return 1 }
        return min(1, max(0, now.timeIntervalSince(membership.startsAt) / total))
    }

    func requestSubscription() {
        guard !isProcessing, user != nil else { return }
        isConfirming = true
    }

    func confirmSubscription() async {
        isConfirming = false
        guard !isProcessing, user != nil else { return }
        isProcessing = true
        defer { isProcessing = false }
        do {
            try await store.subscribe()
            subscribedAt = .now
        } catch let error as MembershipError {
            failure = error
        } catch {
            failure = .network
        }
    }
}
