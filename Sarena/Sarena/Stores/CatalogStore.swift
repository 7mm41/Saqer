import Foundation
import Observation

/// Shared venue catalogue. Loaded during the launch splash (for signed-in
/// members) so Home opens already filled instead of flashing placeholders.
@Observable
@MainActor
final class CatalogStore {
    enum LoadState: Equatable {
        case idle, loading, loaded, failed
    }

    private(set) var venues: [Venue] = []
    private(set) var state: LoadState = .idle

    private let catalog: any CatalogServicing

    init(catalog: any CatalogServicing) {
        self.catalog = catalog
    }

    /// Loads once; concurrent callers simply wait for the state to change.
    func loadIfNeeded() async {
        guard state == .idle || state == .failed else { return }
        await reload()
    }

    func reload() async {
        if venues.isEmpty { state = .loading }
        do {
            let fresh = try await catalog.fetchVenues()
            // Unchanged catalogues (ETag hits) don't re-render Home.
            if fresh != venues { venues = fresh }
            state = .loaded
        } catch is CancellationError {
            if venues.isEmpty { state = .idle }
        } catch {
            state = venues.isEmpty ? .failed : .loaded
        }
    }

    func venue(id: Venue.ID) -> Venue? {
        venues.first { $0.id == id }
    }

    /// Live scarcity counter: patches one ticket option in place.
    func updateRemaining(offerID: TicketOption.ID, remaining: Int?) {
        for venueIndex in venues.indices {
            if let ticketIndex = venues[venueIndex].tickets.firstIndex(where: { $0.id == offerID }) {
                venues[venueIndex].tickets[ticketIndex].remaining = remaining
                return
            }
        }
    }

    /// Members-only data: cleared on sign-out.
    func reset() {
        venues = []
        state = .idle
    }
}
