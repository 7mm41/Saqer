import Foundation
import Observation

@Observable
@MainActor
final class VenueDetailViewModel {
    let venue: Venue
    var selectedTicketID: TicketOption.ID?
    var quantity = 1
    let quantityRange = 1...10

    private(set) var isBooking = false
    /// Set after a successful booking — drives the confirmation sheet.
    var confirmedCode: PromoCode?
    var error: BookingError?

    private let booking: any BookingServicing
    private let session: SessionStore
    private let wallet: WalletStore

    init(venue: Venue, booking: any BookingServicing, session: SessionStore, wallet: WalletStore) {
        self.venue = venue
        self.booking = booking
        self.session = session
        self.wallet = wallet
        // Pre-select the biggest saving: the strongest reason to tap "Book Now".
        selectedTicketID = venue.tickets.max { $0.discountPercent < $1.discountPercent }?.id
    }

    var selectedTicket: TicketOption? {
        venue.tickets.first { $0.id == selectedTicketID }
    }

    var total: Decimal {
        (selectedTicket?.memberPrice ?? 0) * Decimal(quantity)
    }

    var originalTotal: Decimal {
        (selectedTicket?.originalPrice ?? 0) * Decimal(quantity)
    }

    var savings: Decimal { originalTotal - total }

    var canBook: Bool { selectedTicket != nil && !isBooking && session.user != nil }

    func select(_ ticket: TicketOption) {
        selectedTicketID = ticket.id
    }

    func book() async {
        guard canBook, let ticket = selectedTicket, let user = session.user else { return }
        isBooking = true
        error = nil
        defer { isBooking = false }
        do {
            let code = try await booking.book(venue: venue, ticket: ticket, quantity: quantity, for: user)
            wallet.add(code)
            confirmedCode = code
        } catch let bookingError as BookingError {
            error = bookingError
        } catch {
            self.error = .network
        }
    }
}
