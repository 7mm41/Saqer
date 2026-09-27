import Foundation
import Observation

/// The member's promo codes, persisted per account on-device.
/// Booking adds codes here; the Wallet tab reads from here.
@Observable
@MainActor
final class WalletStore {
    private(set) var codes: [PromoCode] = []

    @ObservationIgnored private var ownerID: User.ID?
    private let directory: URL
    private let defaults: UserDefaults
    private let seedsWelcomeCodes: Bool

    init(
        directory: URL = .applicationSupportDirectory.appending(path: "Wallet", directoryHint: .isDirectory),
        defaults: UserDefaults = .standard,
        seedsWelcomeCodes: Bool = true
    ) {
        self.directory = directory
        self.defaults = defaults
        self.seedsWelcomeCodes = seedsWelcomeCodes
    }

    // MARK: Queries

    /// Codes ready to be shown / scanned, soonest expiry first.
    var activeCodes: [PromoCode] {
        codes.filter(\.isRedeemable).sorted { $0.expiresAt < $1.expiresAt }
    }

    /// Used and expired codes, most recent first.
    var usedCodes: [PromoCode] {
        codes.filter { !$0.isRedeemable }
            .sorted { ($0.usedAt ?? $0.expiresAt) > ($1.usedAt ?? $1.expiresAt) }
    }

    /// Lifetime savings — the number marketing loves to show.
    var totalSavings: Decimal {
        codes.reduce(0) { $0 + $1.savings }
    }

    // MARK: Mutations

    /// Switches to the given member's wallet (or clears it on sign-out).
    func load(for userID: User.ID?) {
        ownerID = userID
        guard let userID else {
            codes = []
            return
        }
        if let data = try? Data(contentsOf: fileURL(for: userID)),
           let stored = try? JSONDecoder().decode([PromoCode].self, from: data) {
            codes = stored
        } else {
            codes = []
        }

        let seedKey = "sarena.wallet.seeded.\(userID.uuidString)"
        if seedsWelcomeCodes, !defaults.bool(forKey: seedKey) {
            codes += PromoCode.welcomeSamples()
            defaults.set(true, forKey: seedKey)
            persist()
        }
    }

    func add(_ code: PromoCode) {
        codes.insert(code, at: 0)
        persist()
    }

    /// In production the venue's scanner redeems the code server-side and the
    /// app refreshes; the demo lets the member mark it as used.
    func markUsed(_ id: PromoCode.ID) {
        guard let index = codes.firstIndex(where: { $0.id == id }) else { return }
        codes[index].status = .used
        codes[index].usedAt = .now
        persist()
    }

    // MARK: Persistence

    private func fileURL(for userID: User.ID) -> URL {
        directory.appending(path: "wallet-\(userID.uuidString).json")
    }

    private func persist() {
        guard let ownerID else { return }
        do {
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
            let data = try JSONEncoder().encode(codes)
            try data.write(to: fileURL(for: ownerID), options: [.atomic, .completeFileProtection])
        } catch {
            assertionFailure("Wallet persistence failed: \(error)")
        }
    }
}
