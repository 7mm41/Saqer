import SwiftUI

/// Placeholder hero art per category: a light grey field with the category
/// symbol on a soft orange disc. Venue photos (from the dashboard) cover it.
struct VenueArtwork: View {
    let category: OfferCategory
    var symbolSize: CGFloat = 72
    /// Photo uploaded from the dashboard. The artwork shows while it loads,
    /// and stays if there is none or it fails.
    var imageURL: URL? = nil

    var body: some View {
        artwork
            .overlay {
                if let imageURL {
                    AsyncImage(url: imageURL, transaction: Transaction(animation: .easeOut(duration: 0.25))) { phase in
                        if let image = phase.image {
                            image
                                .resizable()
                                .scaledToFill()
                                .transition(.opacity)
                        }
                    }
                }
            }
            .clipped()
            .accessibilityHidden(true)
    }

    private var artwork: some View {
        ZStack {
            Theme.Palette.artwork
            Circle()
                .fill(Theme.Palette.orangeSoft)
                .frame(width: symbolSize * 1.7, height: symbolSize * 1.7)
            Image(systemName: category.symbol)
                .font(.system(size: symbolSize * 0.8, weight: .semibold))
                .foregroundStyle(Theme.Palette.accentText)
        }
    }
}

/// Original price (struck through) above the exclusive member price.
struct PriceStack: View {
    let original: Decimal
    let member: Decimal
    var alignment: HorizontalAlignment = .leading
    var prominent = false

    @Environment(\.locale) private var locale

    var body: some View {
        VStack(alignment: alignment, spacing: 1) {
            Text(original.omr(locale))
                .font(.sarena(prominent ? .subheadline : .caption, weight: .semibold))
                .strikethrough(true, color: .secondary)
                .foregroundStyle(.secondary)
            Text(member.omr(locale))
                .font(.sarena(prominent ? .title2 : .headline, weight: .heavy))
                .foregroundStyle(Theme.Palette.accentText)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Text("Was \(original.omr(locale)), member price \(member.omr(locale))"))
    }
}

struct RatingView: View {
    let rating: Double
    let reviewCount: Int
    @Environment(\.locale) private var locale

    var body: some View {
        HStack(spacing: 4) {
            Image(systemName: "star.fill")
                .foregroundStyle(Theme.Palette.orange)
            Text(verbatim: rating.rating(locale))
                .fontWeight(.bold)
            Text(verbatim: "(\(reviewCount.localizedNumber(locale)))")
                .foregroundStyle(.secondary)
        }
        .font(.sarena(.caption))
        .accessibilityElement(children: .combine)
    }
}

/// Live "Ends in 12:04:33" marketing countdown.
struct DealCountdown: View {
    let endsAt: Date
    var onArtwork = true

    var body: some View {
        if endsAt > .now {
            HStack(spacing: 5) {
                Image(systemName: "timer")
                Text("Ends in")
                Text(timerInterval: Date.now...endsAt, countsDown: true)
                    .monospacedDigit()
            }
            .font(.sarena(.caption, weight: .bold))
            // On a photo: a solid chip with dark text, readable on any picture.
            .foregroundStyle(onArtwork ? Color.primary : Theme.Palette.danger)
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .background(Capsule().fill(onArtwork ? Theme.Palette.card : Theme.Palette.danger.opacity(0.10)))
        }
    }
}

/// A solid orange disc announcing the headline discount.
struct DiscountMedallion: View {
    let percent: Int
    var size: CGFloat = 96
    @Environment(\.locale) private var locale

    var body: some View {
        VStack(spacing: 0) {
            Text("Save up to")
                .font(.sarena(.caption2, weight: .bold))
                .textCase(.uppercase)
            Text(verbatim: percent.localizedPercent(locale))
                .font(.system(size: size * 0.3, weight: .black, design: .rounded))
                .minimumScaleFactor(0.6)
        }
        .foregroundStyle(.white)
        .padding(size * 0.12)
        .frame(width: size, height: size)
        .background(Circle().fill(Theme.Palette.orangeFill))
        .accessibilityElement(children: .combine)
    }
}

/// Wrapping row layout for highlight chips.
struct FlowLayout: Layout {
    var spacing: CGFloat = 8

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let maxWidth = proposal.width ?? .infinity
        var origin = CGPoint.zero
        var rowHeight: CGFloat = 0
        var widest: CGFloat = 0
        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if origin.x > 0, origin.x + size.width > maxWidth {
                origin.x = 0
                origin.y += rowHeight + spacing
                rowHeight = 0
            }
            origin.x += size.width + spacing
            widest = max(widest, origin.x - spacing)
            rowHeight = max(rowHeight, size.height)
        }
        return CGSize(width: min(widest, maxWidth), height: origin.y + rowHeight)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var origin = CGPoint(x: bounds.minX, y: bounds.minY)
        var rowHeight: CGFloat = 0
        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if origin.x > bounds.minX, origin.x + size.width > bounds.maxX {
                origin.x = bounds.minX
                origin.y += rowHeight + spacing
                rowHeight = 0
            }
            subview.place(at: origin, proposal: ProposedViewSize(size))
            origin.x += size.width + spacing
            rowHeight = max(rowHeight, size.height)
        }
    }
}

/// QR code on a white glass tile (QR scanners need contrast).
struct QRCodeTile: View {
    private let image: UIImage?
    var size: CGFloat

    init(payload: String, size: CGFloat = 220) {
        self.image = QRCodeGenerator.image(for: payload)
        self.size = size
    }

    var body: some View {
        Group {
            if let image {
                Image(uiImage: image)
                    .interpolation(.none)
                    .resizable()
                    .scaledToFit()
            } else {
                Image(systemName: "qrcode")
                    .resizable()
                    .scaledToFit()
                    .foregroundStyle(.secondary)
            }
        }
        .frame(width: size, height: size)
        .padding(size * 0.08)
        .background(RoundedRectangle(cornerRadius: 28, style: .continuous).fill(.white))
        .overlay(RoundedRectangle(cornerRadius: 28, style: .continuous).strokeBorder(Color.black.opacity(0.08), lineWidth: 1))
        .shadow(color: .black.opacity(0.06), radius: 8, y: 3)
        .accessibilityLabel(Text("QR code"))
    }
}

/// Glass capsule stepper with animated digits.
struct QuantityStepper: View {
    @Binding var value: Int
    let range: ClosedRange<Int>
    @Environment(\.locale) private var locale

    var body: some View {
        HStack(spacing: Theme.Spacing.m) {
            stepButton("minus", enabled: value > range.lowerBound) { value -= 1 }
            Text(verbatim: value.localizedNumber(locale))
                .font(.sarena(.title3, weight: .heavy))
                .contentTransition(.numericText(value: Double(value)))
                .frame(minWidth: 28)
            stepButton("plus", enabled: value < range.upperBound) { value += 1 }
        }
        .padding(6)
        .glassSurface(.chip, in: Capsule())
        .sensoryFeedback(.increase, trigger: value)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Text("Quantity"))
        .accessibilityValue(Text(verbatim: value.localizedNumber(locale)))
        .accessibilityAdjustableAction { direction in
            switch direction {
            case .increment where value < range.upperBound: value += 1
            case .decrement where value > range.lowerBound: value -= 1
            default: break
            }
        }
    }

    private func stepButton(_ symbol: String, enabled: Bool, action: @escaping () -> Void) -> some View {
        Button {
            withAnimation(.snappy) { action() }
        } label: {
            Image(systemName: symbol)
                .font(.body.weight(.bold))
                .frame(width: 36, height: 36)
                .background(Circle().fill(enabled ? AnyShapeStyle(Theme.brandGradient) : AnyShapeStyle(.quaternary)))
                .foregroundStyle(.white)
        }
        .buttonStyle(.plain)
        .disabled(!enabled)
    }
}
