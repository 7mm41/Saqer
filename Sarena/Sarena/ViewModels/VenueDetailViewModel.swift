import Foundation
import Observation

@Observable
@MainActor
final class VenueDetailViewModel {
    let venue: Venue
    var quantity = 1
    let quantityRange = 1...10

    private(set) var isBooking = false
    /// Set after a successful booking — drives the confirmation sheet.
    var confirmedCode: PromoCode?
    var error: BookingError?

    private let booking: any BookingServicing
    private let session: SessionStore
    private let wallet: WalletStore
    private let subscription: SubscriptionStore

    init(venue: Venue, booking: any BookingServicing, session: SessionStore, wallet: WalletStore, subscription: SubscriptionStore) {
        self.venue = venue
        self.booking = booking
        self.session = session
        self.wallet = wallet
        self.subscription = subscription
    }

    /// The member's package — packages are chosen in the Subscription tab.
    var plan: MembershipPlan { subscription.plan }

    /// The offer included in the member's package at this venue.
    var ticket: TicketOption? { venue.ticket(for: plan) }

    /// Shown as an upsell when another package gets a bigger discount here.
    var betterPlan: MembershipPlan? {
        guard let current = ticket else { return nil }
        return venue.tickets
            .filter { $0.tier != plan && $0.discountPercent > current.discountPercent }
            .max { $0.discountPercent < $1.discountPercent }?
            .tier
    }

    var total: Decimal {
        (ticket?.memberPrice ?? 0) * Decimal(quantity)
    }

    var originalTotal: Decimal {
        (ticket?.originalPrice ?? 0) * Decimal(quantity)
    }

    var savings: Decimal { originalTotal - total }

    var canBook: Bool { ticket != nil && !isBooking && session.user != nil }

    func book() async {
        guard canBook, let ticket, let user = session.user else { return }
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
