import SwiftUI

/// Big carousel card: artwork, info panel, countdown and discount.
struct FeaturedDealCard: View {
    let venue: Venue
    @Environment(\.locale) private var locale

    var body: some View {
        ZStack(alignment: .bottom) {
            VenueArtwork(category: venue.category, symbolSize: 70, imageURL: venue.imageURL)

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
                .strokeBorder(Color.primary.opacity(0.06), lineWidth: 1)
        }
        .contentShape(RoundedRectangle(cornerRadius: Theme.Radius.hero, style: .continuous))
    }
}

/// Category tile on the dashboard grid (or a wide seasonal banner).
struct CategoryCard: View {
    let category: OfferCategory
    let maxDiscount: Int
    var isWide = false
    /// No venues yet: shows "Soon" instead of a discount.
    var isEmpty = false

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
        .glassSurface(.tile)
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
        if isEmpty {
            Text("Soon")
                .font(.sarena(.caption, weight: .bold))
                .foregroundStyle(.secondary)
                .padding(.horizontal, 9)
                .padding(.vertical, 5)
                .background(Capsule().fill(Color.secondary.opacity(0.14)))
        } else if maxDiscount > 0 {
            Text(verbatim: "−" + maxDiscount.localizedPercent(locale))
                .font(.sarena(.caption, weight: .heavy))
                .foregroundStyle(Theme.Palette.accentText)
                .padding(.horizontal, 9)
                .padding(.vertical, 5)
                .background(Capsule().fill(Theme.Palette.orangeSoft))
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
            VenueArtwork(category: venue.category, symbolSize: 28, imageURL: venue.imageURL)
                .frame(width: 84, height: 84)
                .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
                .overlay(alignment: .bottom) {
                    Text(verbatim: "−" + venue.maxDiscountPercent.localizedPercent(locale))
                        .font(.sarena(.caption2, weight: .heavy))
                        .foregroundStyle(.white)
                        .padding(.horizontal, 7)
                        .padding(.vertical, 3)
                        .background(Capsule().fill(Theme.Palette.orangeFill))
                        .padding(.bottom, 6)
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

/// Lifetime savings (or the membership promise for new members) on a white card.
struct SavingsBanner: View {
    let totalSavings: Decimal
    @Environment(\.locale) private var locale

    var body: some View {
        HStack(spacing: Theme.Spacing.l) {
            GlassIconOrb(systemImage: totalSavings > 0 ? "chart.line.uptrend.xyaxis" : "crown.fill",
                         colors: [Theme.Palette.orange], size: 52)

            VStack(alignment: .leading, spacing: 2) {
                if totalSavings > 0 {
                    Text("You've saved")
                        .font(.sarena(.caption, weight: .semibold))
                        .foregroundStyle(.secondary)
                    Text(verbatim: totalSavings.omr(locale))
                        .font(.sarena(.title2, weight: .heavy))
                        .foregroundStyle(Theme.Palette.accentText)
                        .contentTransition(.numericText())
                    Text("with your Sarena membership")
                        .font(.sarena(.caption))
                        .foregroundStyle(.secondary)
                } else {
                    Text("Members save up to \(50.localizedPercent(locale)) every day")
                        .font(.sarena(.headline, weight: .bold))
                        .foregroundStyle(.primary)
                    Text("Book your first deal to start saving.")
                        .font(.sarena(.caption))
                        .foregroundStyle(.secondary)
                }
            }
            Spacer(minLength: 0)
            Image(systemName: "chevron.forward")
                .font(.footnote.weight(.bold))
                .foregroundStyle(.tertiary)
        }
        .padding(Theme.Spacing.l)
        .glassSurface(.card)
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
                    VStack(alignment: .leading, spacing: 4) {
                        Text(category.title)
                            .font(.sarena(.title2, weight: .heavy))
                        Text(category.tagline)
                            .font(.sarena(.subheadline))
                            .foregroundStyle(.secondary)
                    }
                }
                .padding(.bottom, Theme.Spacing.s)

                if venues.isEmpty {
                    // A category can be empty until the first partner joins.
                    VStack(spacing: Theme.Spacing.m) {
                        Image(systemName: "clock.badge.checkmark")
                            .font(.system(size: 34, weight: .semibold))
                            .foregroundStyle(Theme.Palette.orange)
                        Text("Coming soon")
                            .font(.sarena(.headline, weight: .bold))
                        Text("New places in this category are on the way. We'll let you know when they arrive.")
                            .font(.sarena(.subheadline))
                            .foregroundStyle(.secondary)
                            .multilineTextAlignment(.center)
                    }
                    .padding(Theme.Spacing.xl)
                    .frame(maxWidth: .infinity)
                    .glassSurface(.card)
                    .accessibilityElement(children: .combine)
                }

                ForEach(venues) { venue in
                    NavigationLink(value: HomeRoute.venue(venue)) {
                        VenueCard(venue: venue)
                    }
                    .buttonStyle(.glassPress)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, Theme.gutter)
            .padding(.vertical, Theme.Spacing.l)
        }
        .sarenaScreenBackground()
        .navigationTitle(category.title)
        .navigationBarTitleDisplayMode(.inline)
        .sarenaNavigationBar()
    }
}
