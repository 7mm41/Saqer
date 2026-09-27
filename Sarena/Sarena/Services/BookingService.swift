import Foundation
import SwiftUI

protocol BookingServicing: Sendable {
    /// Reserves `quantity` tickets at the member price and returns the code to show at the venue.
    func book(venue: Venue, ticket: TicketOption, quantity: Int, for user: User) async throws -> PromoCode
}

enum BookingError: Error, Equatable {
    case soldOut
    case network

    var message: LocalizedStringKey {
        switch self {
        case .soldOut: "This ticket just sold out at the member price. Please pick another option."
        case .network: "Booking failed. You have not been charged — please try again."
        }
    }
}

struct MockBookingService: BookingServicing {
    var latency: Duration = .milliseconds(1_100)
    /// Codes stay valid for 30 days.
    var validity: TimeInterval = 30 * 86_400

    func book(venue: Venue, ticket: TicketOption, quantity: Int, for user: User) async throws -> PromoCode {
        try await Task.sleep(for: latency)
        if let remaining = ticket.remaining, remaining < quantity {
            throw BookingError.soldOut
        }
        let now = Date.now
        return PromoCode(
            id: UUID(),
            code: Self.makeCode(),
            venueID: venue.id,
            venueName: venue.name,
            category: venue.category,
            tier: ticket.tier,
            quantity: quantity,
            paidTotal: ticket.memberPrice * Decimal(quantity),
            originalTotal: ticket.originalPrice * Decimal(quantity),
            purchasedAt: now,
            expiresAt: now.addingTimeInterval(validity),
            status: .active
        )
    }

    /// `SRN-XXXX-XXXX` without look-alike characters (0/O, 1/I).
    static func makeCode() -> String {
        let alphabet = Array("ABCDEFGHJKLMNPQRSTUVWXYZ23456789")
        let block = { String((0..<4).map { _ in alphabet.randomElement()! }) }
        return "SRN-\(block())-\(block())"
    }
}
