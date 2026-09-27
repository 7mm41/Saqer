import Foundation
import Observation

enum HomeRoute: Hashable {
    case category(OfferCategory)
    case venue(Venue)
}

@Observable
@MainActor
final class HomeViewModel {
    enum LoadState: Equatable {
        case idle, loading, loaded, failed
    }

    private(set) var venues: [Venue] = []
    private(set) var state: LoadState = .idle
    var searchText = ""

    private let catalog: any CatalogServicing

    init(catalog: any CatalogServicing) {
        self.catalog = catalog
    }

    // MARK: Derived content

    var categories: [OfferCategory] { OfferCategory.allCases }

    /// Hero carousel: featured deals, the ones ending soonest first.
    var featured: [Venue] {
        venues.filter(\.isFeatured)
            .sorted { ($0.dealEndsAt ?? .distantFuture) < ($1.dealEndsAt ?? .distantFuture) }
    }

    /// "Biggest savings" rail.
    var topDeals: [Venue] {
        Array(venues.sorted { $0.maxDiscountPercent > $1.maxDiscountPercent }.prefix(4))
    }

    var isSearching: Bool {
        !searchText.trimmingCharacters(in: .whitespaces).isEmpty
    }

    var searchResults: [Venue] {
        let query = searchText.trimmingCharacters(in: .whitespaces)
        guard !query.isEmpty else { return [] }
        return venues.filter { $0.name.matches(query) || $0.area.matches(query) || $0.summary.matches(query) }
    }

    func venues(in category: OfferCategory) -> [Venue] {
        venues.filter { $0.category == category }
    }

    func maxDiscount(in category: OfferCategory) -> Int {
        venues(in: category).map(\.maxDiscountPercent).max() ?? 0
    }

    /// Categories with a single venue open it directly; others open a list.
    func route(for category: OfferCategory) -> HomeRoute {
        let matches = venues(in: category)
        if matches.count == 1, let only = matches.first { return .venue(only) }
        return .category(category)
    }

    // MARK: Loading

    func loadIfNeeded() async {
        guard state == .idle else { return }
        await load()
    }

    func load() async {
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
}
