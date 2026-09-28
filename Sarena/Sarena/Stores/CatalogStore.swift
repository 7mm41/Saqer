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
            venues = try await catalog.fetchVenues()
            state = .loaded
        } catch is CancellationError {
            if venues.isEmpty { state = .idle }
        } catch {
            state = venues.isEmpty ? .failed : .loaded
        }
    }

    /// Members-only data: cleared on sign-out.
    func reset() {
        venues = []
        state = .idle
    }
}
