import Foundation
import Observation

@Observable
@MainActor
final class VenueDetailViewModel {
    var quantity = 1
    let quantityRange = 1...10
    /// Chosen ticket option; defaults to the cheapest.
    var selectedTicketID: TicketOption.ID?

    private(set) var isBooking = false
    /// Set after a successful booking — drives the confirmation sheet.
    var confirmedCode: PromoCode?
    var error: BookingError?

    private let snapshot: Venue
    private let booking: any BookingServicing
    private let session: SessionStore
    private let wallet: WalletStore
    private let membership: MembershipStore
    private let catalog: CatalogStore?

    init(
        venue: Venue,
        booking: any BookingServicing,
        session: SessionStore,
        wallet: WalletStore,
        membership: MembershipStore,
        catalog: CatalogStore? = nil
    ) {
        self.snapshot = venue
        self.booking = booking
        self.session = session
        self.wallet = wallet
        self.membership = membership
        self.catalog = catalog
        self.selectedTicketID = venue.defaultTicket?.id
    }

    /// The live version: dashboard edits (prices, photos, new tickets) appear
    /// while the screen is open.
    var venue: Venue { catalog?.venue(id: snapshot.id) ?? snapshot }

    /// False once the venue was unpublished or removed from the dashboard.
    var isAvailable: Bool {
        guard let catalog, catalog.state == .loaded else { return true }
        return catalog.venue(id: snapshot.id) != nil
    }

    var tickets: [TicketOption] { venue.tickets }

    var ticket: TicketOption? {
        tickets.first { $0.id == selectedTicketID } ?? venue.defaultTicket
    }

    func select(_ ticket: TicketOption) {
        guard !ticket.isSoldOut else { return }
        selectedTicketID = ticket.id
        if let remaining = ticket.remaining {
            quantity = min(quantity, max(remaining, 1))
        }
    }

    // MARK: Totals

    var total: Decimal {
        (ticket?.memberPrice ?? 0) * Decimal(quantity)
    }

    var originalTotal: Decimal {
        (ticket?.originalPrice ?? 0) * Decimal(quantity)
    }

    var savings: Decimal { originalTotal - total }

    // MARK: Membership

    var plan: MembershipPlan { membership.plan }

    /// Member prices need an active membership; until then the booking bar
    /// offers the membership instead.
    var needsMembership: Bool { membership.state == .loaded && !membership.isActive }

    var isCheckingMembership: Bool { membership.state == .loading || membership.state == .idle }

    // MARK: Booking

    var canBook: Bool {
        guard let ticket, !ticket.isSoldOut, isAvailable, !isBooking, session.user != nil else { return false }
        return membership.isActive
    }

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
            if bookingError == .membershipRequired {
                await membership.refresh()
            } else if bookingError == .soldOut || bookingError == .unavailable {
                await catalog?.reload()
            }
        } catch {
            self.error = .network
        }
    }
}
