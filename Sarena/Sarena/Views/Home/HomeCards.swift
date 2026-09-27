import SwiftUI

/// Big carousel card: artwork, floating glass info panel, countdown and discount.
struct FeaturedDealCard: View {
    let venue: Venue
    @Environment(\.locale) private var locale

    var body: some View {
        ZStack(alignment: .bottom) {
            VenueArtwork(category: venue.category, symbolSize: 70)

            VStack {
                HStack(alignment: .top) {
                    GlassBadge(text: "Save \(venue.maxDiscountPercent.localizedPercent(locale))", systemImage: "tag.fill", prominent: true)
                    Spacer()
                    if let endsAt = venue.dealEndsAt {
                        DealCountdown(endsAt: endsAt)
                    }
                }
                Spacer()
            }
            .padding(Theme.Spacing.l)

            // Floating glass info panel
            HStack(alignment: .bottom, spacing: Theme.Spacing.m) {
                VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
                    Text(venue.name(locale))
                        .font(.sarena(.headline, weight: .bold))
                        .lineLimit(1)
                    Text(venue.summary(locale))
                        .font(.sarena(.caption))
                        .foregroundStyle(.secondary)
                        .lineLimit(2)
                    RatingView(rating: venue.rating, reviewCount: venue.reviewCount)
                }
                Spacer(minLength: 0)
                if let member = venue.startingPrice, let original = venue.startingOriginalPrice {
                    VStack(alignment: .trailing, spacing: 2) {
                        Text("From")
                            .font(.sarena(.caption2, weight: .semibold))
                            .foregroundStyle(.secondary)
                        PriceStack(original: original, member: member, alignment: .trailing)
                    }
                }
            }
            .padding(Theme.Spacing.l)
            .glassSurface(.tile)
            .padding(Theme.Spacing.m)
        }
        .frame(height: 280)
        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.hero, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: Theme.Radius.hero, style: .continuous)
                .strokeBorder(LinearGradient(colors: [.white.opacity(0.7), .white.opacity(0.1)], startPoint: .top, endPoint: .bottom), lineWidth: 1)
        }
        .shadow(color: venue.category.accent.opacity(0.45), radius: 26, y: 16)
        .floatingGlass(amplitude: 4, tilt: 4, period: 3.4)
        .contentShape(RoundedRectangle(cornerRadius: Theme.Radius.hero, style: .continuous))
    }
}

/// Category tile on the dashboard grid (or a wide seasonal banner).
struct CategoryCard: View {
    let category: OfferCategory
    let maxDiscount: Int
    var isWide = false
    var floatPeriod: Double = 3

    @Environment(\.locale) private var locale

    var body: some View {
        Group {
            if isWide {
                HStack(spacing: Theme.Spacing.l) {
                    GlassIconOrb(systemImage: category.symbol, colors: category.colors, size: 60)
                    titles
                    Spacer(minLength: 0)
                    discountBadge
                }
                .frame(height: 104)
            } else {
                VStack(alignment: .leading, spacing: Theme.Spacing.s) {
                    HStack(alignment: .top) {
                        GlassIconOrb(systemImage: category.symbol, colors: category.colors, size: 50)
                        Spacer(minLength: 0)
                        discountBadge
                    }
                    Spacer(minLength: 0)
                    titles
                }
                .frame(height: 168)
            }
        }
        .padding(Theme.Spacing.l)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background {
            // Colour bleeding through the glass from the corner.
            Circle()
                .fill(category.accent.opacity(0.45))
                .frame(width: 150, height: 150)
                .blur(radius: 40)
                .offset(x: 70, y: -60)
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topTrailing)
                .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.tile, style: .continuous))
        }
        .glassSurface(.tile)
        .floatingGlass(amplitude: 4, tilt: 6, period: floatPeriod)
        .contentShape(RoundedRectangle(cornerRadius: Theme.Radius.tile, style: .continuous))
    }

    private var titles: some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(category.title)
                .font(.sarena(.headline, weight: .bold))
                .foregroundStyle(.primary)
                .lineLimit(2)
                .minimumScaleFactor(0.85)
                .fixedSize(horizontal: false, vertical: true)
            Text(category.tagline)
                .font(.sarena(.caption, weight: .medium))
                .foregroundStyle(.secondary)
                .lineLimit(1)
        }
        .multilineTextAlignment(.leading)
    }

    @ViewBuilder
    private var discountBadge: some View {
        if maxDiscount > 0 {
            Text(verbatim: "−" + maxDiscount.localizedPercent(locale))
                .font(.sarena(.caption, weight: .heavy))
                .foregroundStyle(.white)
                .padding(.horizontal, 9)
                .padding(.vertical, 5)
                .background(Capsule().fill(category.accent.gradient))
                .shadow(color: category.accent.opacity(0.5), radius: 8, y: 4)
                .accessibilityLabel(Text("Up to \(maxDiscount.localizedPercent(locale)) off"))
        }
    }
}

/// Compact venue row used in lists and search results.
struct VenueCard: View {
    let venue: Venue
    @Environment(\.locale) private var locale

    var body: some View {
        HStack(spacing: Theme.Spacing.m) {
            VenueArtwork(category: venue.category, symbolSize: 28)
                .frame(width: 84, height: 84)
                .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
                .overlay(alignment: .bottom) {
                    Text(verbatim: "−" + venue.maxDiscountPercent.localizedPercent(locale))
                        .font(.sarena(.caption2, weight: .heavy))
                        .foregroundStyle(.white)
                        .padding(.horizontal, 7)
                        .padding(.vertical, 3)
                        .background(Capsule().fill(Theme.brandGradient))
                        .offset(y: 8)
                }

            VStack(alignment: .leading, spacing: 4) {
                Text(venue.name(locale))
                    .font(.sarena(.headline, weight: .bold))
                    .lineLimit(1)
                Label(venue.area(locale), systemImage: "mappin.and.ellipse")
                    .font(.sarena(.caption))
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                RatingView(rating: venue.rating, reviewCount: venue.reviewCount)
            }

            Spacer(minLength: 0)

            if let member = venue.startingPrice, let original = venue.startingOriginalPrice {
                PriceStack(original: original, member: member, alignment: .trailing)
            }
        }
        .padding(Theme.Spacing.m)
        .glassSurface(.tile)
        .contentShape(RoundedRectangle(cornerRadius: Theme.Radius.tile, style: .continuous))
    }
}

/// Marketing banner: lifetime savings (or the membership promise for new members).
struct SavingsBanner: View {
    let totalSavings: Decimal
    @Environment(\.locale) private var locale

    var body: some View {
        HStack(spacing: Theme.Spacing.l) {
            ZStack {
                Circle().fill(.white.opacity(0.25))
                Image(systemName: totalSavings > 0 ? "chart.line.uptrend.xyaxis" : "crown.fill")
                    .font(.title2.weight(.bold))
                    .foregroundStyle(.white)
            }
            .frame(width: 54, height: 54)

            VStack(alignment: .leading, spacing: 2) {
                if totalSavings > 0 {
                    Text("You've saved")
                        .font(.sarena(.caption, weight: .semibold))
                        .foregroundStyle(.white.opacity(0.85))
                    Text(verbatim: totalSavings.omr(locale))
                        .font(.sarena(.title2, weight: .heavy))
                        .foregroundStyle(.white)
                        .contentTransition(.numericText())
                    Text("with your Sarena membership")
                        .font(.sarena(.caption))
                        .foregroundStyle(.white.opacity(0.85))
                } else {
                    Text("Members save up to \(50.localizedPercent(locale)) every day")
                        .font(.sarena(.headline, weight: .bold))
                        .foregroundStyle(.white)
                    Text("Book your first deal to start saving.")
                        .font(.sarena(.caption))
                        .foregroundStyle(.white.opacity(0.85))
                }
            }
            Spacer(minLength: 0)
        }
        .padding(Theme.Spacing.l)
        .background {
            RoundedRectangle(cornerRadius: Theme.Radius.card, style: .continuous)
                .fill(LinearGradient(colors: [Theme.Palette.orange, Theme.Palette.festivalPink.opacity(0.85)], startPoint: .topLeading, endPoint: .bottomTrailing))
                .opacity(0.75)
        }
        .glassSurface(.tinted(Theme.Palette.orange, opacity: 0.2))
        .floatingGlass(amplitude: 3, tilt: 5, period: 3.8)
    }
}

/// Venues of one category (when it has more than one).
struct CategoryVenuesView: View {
    let category: OfferCategory
    let venues: [Venue]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Theme.Spacing.l) {
                HStack(spacing: Theme.Spacing.l) {
                    GlassIconOrb(systemImage: category.symbol, colors: category.colors, size: 64)
                        .floatingGlass(amplitude: 5, tilt: 10)
                    VStack(alignment: .leading, spacing: 4) {
                        Text(category.title)
                            .font(.sarena(.title2, weight: .heavy))
                        Text(category.tagline)
                            .font(.sarena(.subheadline))
                            .foregroundStyle(.secondary)
                    }
                }
                .padding(.bottom, Theme.Spacing.s)

                ForEach(venues) { venue in
                    NavigationLink(value: HomeRoute.venue(venue)) {
                        VenueCard(venue: venue)
                    }
                    .buttonStyle(.glassPress)
                }
            }
            .padding(.horizontal, Theme.gutter)
            .padding(.vertical, Theme.Spacing.l)
        }
        .sarenaScreenBackground()
        .navigationTitle(category.title)
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(.hidden, for: .navigationBar)
    }
}
