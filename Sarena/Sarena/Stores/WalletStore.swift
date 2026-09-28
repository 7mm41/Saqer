import Foundation
import Observation

/// The member's booked codes. Booking adds codes here; the Wallet tab reads
/// from here; live updates refresh it when staff redeem a code.
@Observable
@MainActor
final class WalletStore {
    private(set) var codes: [PromoCode] = []
    private(set) var isLoading = false

    private let booking: any BookingServicing
    @ObservationIgnored private var owner: User?

    init(booking: any BookingServicing) {
        self.booking = booking
    }

    // MARK: Queries

    /// Codes ready to be shown / scanned, soonest expiry first.
    var activeCodes: [PromoCode] {
        codes.filter(\.isRedeemable).sorted { $0.expiresAt < $1.expiresAt }
    }

    /// Used, expired and cancelled codes, most recent first.
    var usedCodes: [PromoCode] {
        codes.filter { !$0.isRedeemable }
            .sorted { ($0.usedAt ?? $0.expiresAt) > ($1.usedAt ?? $1.expiresAt) }
    }

    /// Lifetime savings — the number marketing loves to show.
    var totalSavings: Decimal {
        codes.filter { $0.status != .cancelled }.reduce(0) { $0 + $1.savings }
    }

    // MARK: Loading

    /// Switches to the given member's wallet (or clears it on sign-out).
    func load(for user: User?) async {
        guard user?.id != owner?.id else { return }
        owner = user
        codes = []
        await refresh()
    }

    func refresh() async {
        guard let owner else { return }
        isLoading = true
        defer { isLoading = false }
        if let fresh = try? await booking.codes(for: owner), owner.id == self.owner?.id {
            codes = fresh
        }
    }

    // MARK: Mutations

    func add(_ code: PromoCode) {
        codes.removeAll { $0.id == code.id }
        codes.insert(code, at: 0)
    }

    /// The member confirms the venue accepted the code.
    func markUsed(_ code: PromoCode) async throws {
        guard let owner else { return }
        let updated = try await booking.markUsed(code, for: owner)
        if let index = codes.firstIndex(where: { $0.id == updated.id }) {
            codes[index] = updated
        }
    }
}
