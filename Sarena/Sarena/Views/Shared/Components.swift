import SwiftUI

/// Placeholder hero art per category: a dark grey field with the category
/// symbol in an orange disc. Venue photos (from the dashboard) cover it.
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
                                .overlay {
                                    // Keeps white badges and titles legible on bright photos.
                                    LinearGradient(colors: [.black.opacity(0.25), .clear, .black.opacity(0.35)],
                                                   startPoint: .top, endPoint: .bottom)
                                }
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
            LinearGradient(colors: [Color(hex: 0x3A3A3F), Theme.Palette.graphite], startPoint: .topLeading, endPoint: .bottomTrailing)
            Circle()
                .fill(.white.opacity(0.05))
                .frame(width: symbolSize * 2.6, height: symbolSize * 2.6)
                .offset(x: symbolSize * 1.2, y: -symbolSize * 0.9)
            Circle()
                .fill(Theme.brandGradient)
                .frame(width: symbolSize * 1.7, height: symbolSize * 1.7)
                .shadow(color: Theme.Palette.orange.opacity(0.35), radius: 14, y: 6)
            Image(systemName: category.symbol)
                .font(.system(size: symbolSize, weight: .semibold))
                .foregroundStyle(.white)
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
                .foregroundStyle(Theme.brandGradient)
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
            .foregroundStyle(onArtwork ? Color.white : Theme.Palette.danger)
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .glassSurface(
                .tinted(onArtwork ? .black : Theme.Palette.danger, opacity: onArtwork ? 0.22 : 0.14, cornerRadius: 99, shadow: .none),
                in: Capsule()
            )
        }
    }
}

/// Floating glass medallion announcing the headline discount.
/// Solid gradient (no material), so its device-motion parallax stays cheap.
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
        .background {
            ZStack {
                Circle().fill(Theme.brandGradient)
                Circle()
                    .fill(LinearGradient(colors: [.white.opacity(0.5), .clear], startPoint: .top, endPoint: .center))
                    .padding(size * 0.05)
            }
            .shadow(color: Theme.Palette.orange.opacity(0.5), radius: 16, y: 10)
        }
        .overlay(Circle().strokeBorder(.white.opacity(0.7), lineWidth: 1.5))
        .parallax(tilt: 12, shift: 6)
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
        .overlay(RoundedRectangle(cornerRadius: 28, style: .continuous).strokeBorder(Theme.brandGradient, lineWidth: 2))
        .shadow(color: Theme.Palette.orange.opacity(0.35), radius: 26, y: 14)
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
