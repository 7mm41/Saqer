import MapKit
import SwiftUI

/// Place details & booking: description, map, ticket tiers with original vs
/// member price, quantity and a floating "Book Now" bar.
struct VenueDetailView: View {
    @State private var viewModel: VenueDetailViewModel
    @State private var isAboutExpanded = false

    @Environment(\.locale) private var locale
    @Environment(\.openURL) private var openURL
    @Environment(AppRouter.self) private var router: AppRouter?

    init(viewModel: VenueDetailViewModel) {
        _viewModel = State(initialValue: viewModel)
    }

    private var venue: Venue { viewModel.venue }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Theme.Spacing.xl) {
                hero
                titleBlock
                aboutCard
                highlights
                locationCard
                packagePriceSection
                quantityCard
            }
            .padding(.bottom, Theme.Spacing.xl)
        }
        .scrollIndicators(.hidden)
        .sarenaScreenBackground()
        .safeAreaInset(edge: .bottom) { bookingBar }
        .navigationTitle(venue.name(locale))
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(.hidden, for: .navigationBar)
        .sheet(item: $viewModel.confirmedCode) { code in
            BookingConfirmationView(code: code) {
                router?.selectedTab = .wallet
            }
        }
        .alert("Booking failed", isPresented: isShowingError, presenting: viewModel.error) { _ in
            Button("OK", role: .cancel) {}
        } message: { error in
            Text(error.message)
        }
        .sensoryFeedback(.success, trigger: viewModel.confirmedCode)
    }

    private var isShowingError: Binding<Bool> {
        Binding(
            get: { viewModel.error != nil },
            set: { if !$0 { viewModel.error = nil } }
        )
    }

    // MARK: Hero

    private var hero: some View {
        ZStack(alignment: .topLeading) {
            VenueArtwork(category: venue.category, symbolSize: 92)
            VStack(alignment: .leading) {
                HStack {
                    GlassBadge(text: venue.category.title, systemImage: venue.category.symbol, tint: .white)
                    Spacer()
                    GlassBadge(text: "Members only", systemImage: "lock.open.fill", tint: .white)
                }
                Spacer()
                if let endsAt = venue.dealEndsAt {
                    DealCountdown(endsAt: endsAt)
                }
            }
            .padding(Theme.Spacing.l)
        }
        .frame(height: 270)
        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.hero, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: Theme.Radius.hero, style: .continuous)
                .strokeBorder(LinearGradient(colors: [.white.opacity(0.7), .white.opacity(0.1)], startPoint: .top, endPoint: .bottom), lineWidth: 1)
        }
        .shadow(color: venue.category.accent.opacity(0.45), radius: 24, y: 14)
        .overlay(alignment: .bottomTrailing) {
            DiscountMedallion(percent: venue.maxDiscountPercent)
                .padding(.trailing, Theme.Spacing.l)
                .offset(y: 40)
        }
        .padding(.horizontal, Theme.gutter)
        .padding(.top, Theme.Spacing.s)
    }

    private var titleBlock: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.s) {
            Text(venue.name(locale))
                .font(.sarena(.largeTitle, weight: .heavy))
                .fixedSize(horizontal: false, vertical: true)
                .padding(.trailing, 96) // room for the medallion
            Label(venue.area(locale), systemImage: "mappin.and.ellipse")
                .font(.sarena(.subheadline, weight: .medium))
                .foregroundStyle(.secondary)
            HStack(spacing: Theme.Spacing.l) {
                RatingView(rating: venue.rating, reviewCount: venue.reviewCount)
                Label(venue.openingHours(locale), systemImage: "clock.fill")
                    .font(.sarena(.caption))
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
        }
        .padding(.horizontal, Theme.gutter)
        .padding(.top, Theme.Spacing.s)
    }

    // MARK: About

    private var aboutCard: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.m) {
            Text("About")
                .font(.sarena(.headline, weight: .bold))
            Text(venue.about(locale))
                .font(.sarena(.body))
                .foregroundStyle(.secondary)
                .lineLimit(isAboutExpanded ? nil : 4)
                .fixedSize(horizontal: false, vertical: true)
            Button {
                withAnimation(.snappy) { isAboutExpanded.toggle() }
            } label: {
                if isAboutExpanded {
                    Text("Show less")
                } else {
                    Text("Read more")
                }
            }
            .font(.sarena(.subheadline, weight: .bold))
            .foregroundStyle(Theme.Palette.orange)
        }
        .padding(Theme.Spacing.xl)
        .frame(maxWidth: .infinity, alignment: .leading)
        .glassSurface(.card)
        .padding(.horizontal, Theme.gutter)
    }

    private var highlights: some View {
        FlowLayout(spacing: Theme.Spacing.s) {
            ForEach(venue.highlights, id: \.self) { highlight in
                Label(highlight(locale), systemImage: "checkmark.seal.fill")
                    .font(.sarena(.caption, weight: .semibold))
                    .padding(.horizontal, Theme.Spacing.m)
                    .padding(.vertical, Theme.Spacing.s)
                    .glassSurface(.chip, in: Capsule())
            }
        }
        .padding(.horizontal, Theme.gutter)
    }

    // MARK: Map

    private var locationCard: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.m) {
            HStack {
                Text("Location")
                    .font(.sarena(.headline, weight: .bold))
                Spacer()
                Button(action: openInMaps) {
                    Label("Directions", systemImage: "arrow.triangle.turn.up.right.diamond.fill")
                        .font(.sarena(.subheadline, weight: .bold))
                }
                .foregroundStyle(Theme.Palette.orange)
            }

            Map(
                initialPosition: .region(MKCoordinateRegion(center: venue.coordinate, latitudinalMeters: 1_800, longitudinalMeters: 1_800)),
                interactionModes: []
            ) {
                Marker(venue.name(locale), systemImage: venue.category.symbol, coordinate: venue.coordinate)
                    .tint(Theme.Palette.orange)
            }
            // Flat, non-interactive map: 3D "realistic" terrain keeps the GPU busy.
            .mapStyle(.standard(elevation: .flat, pointsOfInterest: .excludingAll))
            .frame(height: 210)
            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.tile, style: .continuous))
            .overlay(alignment: .bottomLeading) {
                Label(venue.area(locale), systemImage: "mappin.circle.fill")
                    .font(.sarena(.caption, weight: .semibold))
                    .padding(.horizontal, Theme.Spacing.m)
                    .padding(.vertical, Theme.Spacing.s)
                    .glassSurface(.chip, in: Capsule())
                    .padding(Theme.Spacing.m)
            }
            .onTapGesture(perform: openInMaps)
            .accessibilityAddTraits(.isButton)
            .accessibilityLabel(Text("Open \(venue.name(locale)) in Maps"))
        }
        .padding(Theme.Spacing.l)
        .glassSurface(.card)
        .padding(.horizontal, Theme.gutter)
    }

    private func openInMaps() {
        var components = URLComponents(string: "https://maps.apple.com/")
        components?.queryItems = [
            URLQueryItem(name: "ll", value: "\(venue.latitude),\(venue.longitude)"),
            URLQueryItem(name: "q", value: venue.name(locale)),
        ]
        if let url = components?.url { openURL(url) }
    }

    // MARK: Your package price

    /// Packages live in the Subscription tab; here the member simply sees the
    /// offer included in their own package.
    private var packagePriceSection: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.m) {
            SectionHeader(title: "Your price", subtitle: "Exclusive member price with your package")
            if let ticket = viewModel.ticket {
                PlanOfferCard(ticket: ticket)
            }
            packageRow
        }
        .padding(.horizontal, Theme.gutter)
        .padding(.top, Theme.Spacing.s)
    }

    private var packageRow: some View {
        HStack(spacing: Theme.Spacing.m) {
            VStack(alignment: .leading, spacing: 2) {
                Text("Your package")
                    .font(.sarena(.caption, weight: .semibold))
                    .foregroundStyle(.secondary)
                Text(verbatim: viewModel.plan.label(locale))
                    .font(.sarena(.headline, weight: .bold))
                if let better = viewModel.betterPlan {
                    Text("Save more here with \(better.label(locale))")
                        .font(.sarena(.caption, weight: .bold))
                        .foregroundStyle(Theme.Palette.success)
                }
            }
            Spacer(minLength: Theme.Spacing.s)
            Button {
                router?.selectedTab = .subscription
            } label: {
                Label("Change package", systemImage: "arrow.left.arrow.right")
                    .font(.sarena(.subheadline, weight: .bold))
            }
            .foregroundStyle(Theme.Palette.orange)
        }
        .padding(Theme.Spacing.l)
        .frame(maxWidth: .infinity, alignment: .leading)
        .glassSurface(.card)
    }

    private var quantityCard: some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text("Quantity")
                    .font(.sarena(.headline, weight: .bold))
                Text("Up to 10 per booking")
                    .font(.sarena(.caption))
                    .foregroundStyle(.secondary)
            }
            Spacer()
            QuantityStepper(value: $viewModel.quantity, range: viewModel.quantityRange)
        }
        .padding(Theme.Spacing.l)
        .glassSurface(.card)
        .padding(.horizontal, Theme.gutter)
    }

    // MARK: Booking bar

    private var bookingBar: some View {
        HStack(spacing: Theme.Spacing.l) {
            VStack(alignment: .leading, spacing: 1) {
                Text(verbatim: viewModel.originalTotal.omr(locale))
                    .font(.sarena(.caption, weight: .semibold))
                    .strikethrough(true, color: .secondary)
                    .foregroundStyle(.secondary)
                Text(verbatim: viewModel.total.omr(locale))
                    .font(.sarena(.title3, weight: .heavy))
                    .contentTransition(.numericText())
                if viewModel.savings > 0 {
                    Text("You save \(viewModel.savings.omr(locale))")
                        .font(.sarena(.caption2, weight: .bold))
                        .foregroundStyle(Theme.Palette.success)
                }
            }
            .animation(.snappy, value: viewModel.total)

            Button {
                Task { await viewModel.book() }
            } label: {
                if viewModel.isBooking {
                    ProgressView().tint(.white)
                } else {
                    Label("Book Now", systemImage: "bolt.fill")
                }
            }
            .buttonStyle(.sarenaProminent)
            .disabled(!viewModel.canBook)
        }
        .padding(.horizontal, Theme.Spacing.xl)
        .padding(.vertical, Theme.Spacing.m)
        .glassSurface(.bar)
        .padding(.horizontal, Theme.Spacing.m)
        .padding(.bottom, Theme.Spacing.xs)
    }
}

/// The offer included in the member's package: perks, original price struck
/// through, the member price and scarcity.
struct PlanOfferCard: View {
    let ticket: TicketOption

    @Environment(\.locale) private var locale

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.m) {
            HStack(alignment: .top, spacing: Theme.Spacing.m) {
                Text(verbatim: ticket.tier.emoji)
                    .font(.system(size: 24))
                    .frame(width: 46, height: 46)
                    .background(Circle().fill(ticket.tier.tint.opacity(0.22)))
                    .overlay(Circle().strokeBorder(.white.opacity(0.6), lineWidth: 1))
                VStack(alignment: .leading, spacing: 4) {
                    Text(verbatim: ticket.tier.name(locale))
                        .font(.sarena(.headline, weight: .bold))
                    ForEach(ticket.perks, id: \.self) { perk in
                        Label(perk(locale), systemImage: "checkmark")
                            .font(.sarena(.caption))
                            .foregroundStyle(.secondary)
                    }
                }
                Spacer(minLength: 0)
                GlassBadge(text: "Included", systemImage: "checkmark.seal.fill", tint: ticket.tier.tint)
            }

            HStack(alignment: .bottom) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Original price")
                        .font(.sarena(.caption2, weight: .semibold))
                        .foregroundStyle(.secondary)
                    Text(verbatim: ticket.originalPrice.omr(locale))
                        .font(.sarena(.subheadline, weight: .semibold))
                        .strikethrough(true, color: Theme.Palette.danger)
                        .foregroundStyle(.secondary)
                }
                Spacer()
                VStack(alignment: .trailing, spacing: 2) {
                    Text("Member price")
                        .font(.sarena(.caption2, weight: .bold))
                        .foregroundStyle(Theme.Palette.orange)
                    Text(verbatim: ticket.memberPrice.omr(locale))
                        .font(.sarena(.title2, weight: .heavy))
                        .foregroundStyle(Theme.brandGradient)
                }
            }

            HStack(spacing: Theme.Spacing.s) {
                GlassBadge(text: "Save \(ticket.savings.omr(locale))", systemImage: "arrow.down.circle.fill", tint: Theme.Palette.success)
                GlassBadge(text: "−\(ticket.discountPercent.localizedPercent(locale))", tint: Theme.Palette.orange)
                Spacer(minLength: 0)
                if ticket.isLowStock, let remaining = ticket.remaining {
                    GlassBadge(text: "Only \(remaining) left", systemImage: "flame.fill", tint: Theme.Palette.danger)
                }
            }
        }
        .padding(Theme.Spacing.l)
        .glassSurface(.tinted(ticket.tier.tint, opacity: 0.2, cornerRadius: Theme.Radius.tile, shadow: .floating))
        .overlay {
            RoundedRectangle(cornerRadius: Theme.Radius.tile, style: .continuous)
                .strokeBorder(Theme.brandGradient, lineWidth: 1.5)
        }
        .accessibilityElement(children: .combine)
    }
}

#Preview {
    PreviewContainer {
        NavigationStack {
            VenueDetailViewPreview()
        }
    }
}

private struct VenueDetailViewPreview: View {
    @Environment(SessionStore.self) private var session
    @Environment(WalletStore.self) private var wallet
    @Environment(SubscriptionStore.self) private var subscription

    var body: some View {
        VenueDetailView(viewModel: VenueDetailViewModel(
            venue: Venue.samples[0],
            booking: AppServices.preview.booking,
            session: session,
            wallet: wallet,
            subscription: subscription
        ))
    }
}
