import SwiftUI

/// Members' dashboard: savings, featured deals, the seven categories and top discounts.
struct HomeView: View {
    @Environment(\.services) private var services
    @Environment(SessionStore.self) private var session
    @Environment(WalletStore.self) private var wallet
    @Environment(\.locale) private var locale

    @State private var viewModel: HomeViewModel

    init(catalog: any CatalogServicing) {
        _viewModel = State(initialValue: HomeViewModel(catalog: catalog))
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: Theme.Spacing.xxl) {
                    header
                    searchField

                    if viewModel.isSearching {
                        searchResults
                    } else {
                        switch viewModel.state {
                        case .idle, .loading: loadingPlaceholder
                        case .failed: failureState
                        case .loaded: dashboard
                        }
                    }
                }
                .padding(.top, Theme.Spacing.s)
                .padding(.bottom, Theme.Spacing.xxl)
            }
            .scrollDismissesKeyboard(.immediately)
            .refreshable { await viewModel.load() }
            .sarenaScreenBackground()
            .toolbar(.hidden, for: .navigationBar)
            .navigationDestination(for: HomeRoute.self) { destination(for: $0) }
            .task { await viewModel.loadIfNeeded() }
        }
    }

    // MARK: Header

    private var header: some View {
        HStack(alignment: .center, spacing: Theme.Spacing.l) {
            VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
                Text("Hello, \(session.user?.firstName ?? "")")
                    .font(.sarena(.subheadline, weight: .semibold))
                    .foregroundStyle(.secondary)
                Text("Your member prices are live")
                    .font(.sarena(.title2, weight: .heavy))
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 0)
            SarenaLogoView(size: 58)
        }
        .padding(.horizontal, Theme.gutter)
    }

    private var searchField: some View {
        GlassTextField(
            title: "Search venues or areas",
            systemImage: "magnifyingglass",
            text: $viewModel.searchText,
            submitLabel: .search
        )
        .padding(.horizontal, Theme.gutter)
    }

    // MARK: Dashboard

    private var dashboard: some View {
        VStack(spacing: Theme.Spacing.xxl) {
            SavingsBanner(totalSavings: wallet.totalSavings)
                .padding(.horizontal, Theme.gutter)
            featuredCarousel
            categoriesGrid
            topDeals
        }
    }

    private var featuredCarousel: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.m) {
            SectionHeader(title: "Featured deals", subtitle: "Hand-picked. Ending soon.")
                .padding(.horizontal, Theme.gutter)

            ScrollView(.horizontal) {
                LazyHStack(spacing: Theme.Spacing.l) {
                    ForEach(viewModel.featured) { venue in
                        NavigationLink(value: HomeRoute.venue(venue)) {
                            FeaturedDealCard(venue: venue)
                        }
                        .buttonStyle(.glassPress)
                        .containerRelativeFrame(.horizontal) { width, _ in width * 0.86 }
                        .scrollTransition(axis: .horizontal) { content, phase in
                            content
                                .scaleEffect(phase.isIdentity ? 1 : 0.94)
                                .opacity(phase.isIdentity ? 1 : 0.8)
                        }
                    }
                }
                .scrollTargetLayout()
                .padding(.vertical, Theme.Spacing.xl)
            }
            .scrollIndicators(.hidden)
            .scrollTargetBehavior(.viewAligned)
            .contentMargins(.horizontal, Theme.gutter, for: .scrollContent)
            .scrollClipDisabled()
            .padding(.vertical, -Theme.Spacing.xl)
        }
    }

    private var categoriesGrid: some View {
        let columns = [GridItem(.flexible(), spacing: Theme.Spacing.l), GridItem(.flexible(), spacing: Theme.Spacing.l)]
        let categories = viewModel.categories
        let gridCategories = Array(categories.dropLast())

        return VStack(alignment: .leading, spacing: Theme.Spacing.m) {
            SectionHeader(title: "Explore", subtitle: "Seven destinations. One membership.")

            LazyVGrid(columns: columns, spacing: Theme.Spacing.l) {
                ForEach(gridCategories) { category in
                    NavigationLink(value: viewModel.route(for: category)) {
                        CategoryCard(category: category, maxDiscount: viewModel.maxDiscount(in: category))
                    }
                    .buttonStyle(.glassPress)
                }
            }

            // The festivals card spans the full width as a seasonal banner.
            if let festivals = categories.last {
                NavigationLink(value: viewModel.route(for: festivals)) {
                    CategoryCard(category: festivals, maxDiscount: viewModel.maxDiscount(in: festivals), isWide: true)
                }
                .buttonStyle(.glassPress)
            }
        }
        .padding(.horizontal, Theme.gutter)
    }

    private var topDeals: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.m) {
            SectionHeader(title: "Biggest savings", subtitle: "The deepest member discounts right now")
            ForEach(viewModel.topDeals) { venue in
                NavigationLink(value: HomeRoute.venue(venue)) {
                    VenueCard(venue: venue)
                }
                .buttonStyle(.glassPress)
            }
        }
        .padding(.horizontal, Theme.gutter)
    }

    // MARK: States

    @ViewBuilder
    private var searchResults: some View {
        let results = viewModel.searchResults
        if results.isEmpty {
            ContentUnavailableView.search(text: viewModel.searchText)
                .padding(.top, Theme.Spacing.xxl)
        } else {
            LazyVStack(spacing: Theme.Spacing.m) {
                ForEach(results) { venue in
                    NavigationLink(value: HomeRoute.venue(venue)) {
                        VenueCard(venue: venue)
                    }
                    .buttonStyle(.glassPress)
                }
            }
            .padding(.horizontal, Theme.gutter)
        }
    }

    private var loadingPlaceholder: some View {
        VStack(spacing: Theme.Spacing.l) {
            ShimmerPlaceholder(height: 110)
            ShimmerPlaceholder(height: 250, cornerRadius: Theme.Radius.hero)
            HStack(spacing: Theme.Spacing.l) {
                ShimmerPlaceholder(height: 164, cornerRadius: Theme.Radius.tile)
                ShimmerPlaceholder(height: 164, cornerRadius: Theme.Radius.tile)
            }
        }
        .padding(.horizontal, Theme.gutter)
    }

    private var failureState: some View {
        ContentUnavailableView {
            Label("Couldn't load offers", systemImage: "wifi.exclamationmark")
        } description: {
            Text("Check your connection and try again.")
        } actions: {
            Button("Try Again") { Task { await viewModel.load() } }
                .buttonStyle(.sarenaProminent)
                .frame(maxWidth: 220)
        }
        .padding(.top, Theme.Spacing.xxl)
    }

    // MARK: Navigation

    @ViewBuilder
    private func destination(for route: HomeRoute) -> some View {
        switch route {
        case .category(let category):
            CategoryVenuesView(category: category, venues: viewModel.venues(in: category))
        case .venue(let venue):
            VenueDetailView(
                viewModel: VenueDetailViewModel(venue: venue, booking: services.booking, session: session, wallet: wallet)
            )
        }
    }
}

#Preview {
    PreviewContainer {
        HomeView(catalog: AppServices.preview.catalog)
    }
}

#Preview("Arabic · Dark") {
    PreviewContainer {
        HomeView(catalog: AppServices.preview.catalog)
    }
    .appLanguage(.arabic)
    .preferredColorScheme(.dark)
}
