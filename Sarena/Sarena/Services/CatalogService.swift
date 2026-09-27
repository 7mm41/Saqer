import Foundation

protocol CatalogServicing: Sendable {
    /// All venues with their member-only ticket prices.
    /// The real endpoint must require an authenticated session.
    func fetchVenues() async throws -> [Venue]
}

struct MockCatalogService: CatalogServicing {
    var latency: Duration = .milliseconds(600)

    func fetchVenues() async throws -> [Venue] {
        try await Task.sleep(for: latency)
        return Venue.samples
    }
}
