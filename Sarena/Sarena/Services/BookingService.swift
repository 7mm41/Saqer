import Foundation
import SwiftUI

protocol BookingServicing: Sendable {
    /// Reserves `quantity` tickets at the member price and returns the code to show at the venue.
    func book(venue: Venue, ticket: TicketOption, quantity: Int, for user: User) async throws -> PromoCode
    /// The member's codes, newest first.
    func codes(for user: User) async throws -> [PromoCode]
    /// The member confirms the venue accepted the code (staff can also redeem it from the dashboard).
    func markUsed(_ code: PromoCode, for user: User) async throws -> PromoCode
}

enum BookingError: Error, Equatable {
    case membershipRequired
    case soldOut
    case unavailable
    case network

    var message: LocalizedStringKey {
        switch self {
        case .membershipRequired: "Member prices need an active Sarena membership."
        case .soldOut: "This ticket just sold out at the member price. Please pick another option."
        case .unavailable: "This offer is no longer available."
        case .network: "Booking failed. You have not been charged — please try again."
        }
    }
}

/// On-device stand-in for the booking API: codes are generated locally and
/// kept per member in Application Support.
actor MockBookingService: BookingServicing {
    private let latency: Duration
    /// Codes stay valid for 30 days.
    private let validity: TimeInterval = 30 * 86_400
    private let directory: URL
    private let defaults: UserDefaults
    private let seedsWelcomeCodes: Bool

    init(
        latency: Duration = .milliseconds(1_100),
        directory: URL = .applicationSupportDirectory.appending(path: "Wallet", directoryHint: .isDirectory),
        defaults: UserDefaults = .standard,
        seedsWelcomeCodes: Bool = true
    ) {
        self.latency = latency
        self.directory = directory
        self.defaults = defaults
        self.seedsWelcomeCodes = seedsWelcomeCodes
    }

    func book(venue: Venue, ticket: TicketOption, quantity: Int, for user: User) async throws -> PromoCode {
        try await Task.sleep(for: latency)
        if let remaining = ticket.remaining, remaining < quantity {
            throw BookingError.soldOut
        }
        let now = Date.now
        let code = PromoCode(
            id: UUID().uuidString,
            code: Self.makeCode(),
            venueID: venue.id,
            venueName: venue.name,
            category: venue.category,
            offerTitle: ticket.title,
            quantity: quantity,
            paidTotal: ticket.memberPrice * Decimal(quantity),
            originalTotal: ticket.originalPrice * Decimal(quantity),
            purchasedAt: now,
            expiresAt: now.addingTimeInterval(validity),
            status: .active
        )
        save([code] + load(for: user), for: user)
        return code
    }

    func codes(for user: User) async throws -> [PromoCode] {
        var codes = load(for: user)
        let seedKey = "sarena.wallet.seeded.\(user.id.uuidString)"
        if seedsWelcomeCodes, !defaults.bool(forKey: seedKey) {
            codes += PromoCode.welcomeSamples()
            defaults.set(true, forKey: seedKey)
            save(codes, for: user)
        }
        return codes
    }

    func markUsed(_ code: PromoCode, for user: User) async throws -> PromoCode {
        var codes = load(for: user)
        guard let index = codes.firstIndex(where: { $0.id == code.id }), codes[index].status == .active else {
            throw BookingError.unavailable
        }
        codes[index].status = .used
        codes[index].usedAt = .now
        save(codes, for: user)
        return codes[index]
    }

    // MARK: Persistence

    private func fileURL(for user: User) -> URL {
        directory.appending(path: "codes-\(user.id.uuidString).json")
    }

    private func load(for user: User) -> [PromoCode] {
        guard let data = try? Data(contentsOf: fileURL(for: user)) else { return [] }
        return (try? JSONDecoder().decode([PromoCode].self, from: data)) ?? []
    }

    private func save(_ codes: [PromoCode], for user: User) {
        do {
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
            let data = try JSONEncoder().encode(codes)
            #if os(iOS)
            try data.write(to: fileURL(for: user), options: [.atomic, .completeFileProtection])
            #else
            try data.write(to: fileURL(for: user), options: [.atomic])
            #endif
        } catch {
            assertionFailure("Wallet persistence failed: \(error)")
        }
    }

    /// `SRN-XXXX-XXXX` without look-alike characters (0/O, 1/I).
    static func makeCode() -> String {
        let alphabet = Array("ABCDEFGHJKLMNPQRSTUVWXYZ23456789")
        let block = { String((0..<4).map { _ in alphabet.randomElement()! }) }
        return "SRN-\(block())-\(block())"
    }
}
