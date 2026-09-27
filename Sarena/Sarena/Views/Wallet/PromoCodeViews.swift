import SwiftUI

/// Ticket-shaped glass card for one promo code.
struct PromoCodeCard: View {
    let code: PromoCode
    let isCopied: Bool
    let onCopy: () -> Void
    let onShow: () -> Void

    @Environment(\.locale) private var locale
    /// Fixed section heights keep the ticket notches aligned with the perforation.
    @ScaledMetric(relativeTo: .headline) private var topHeight: CGFloat = 88
    @ScaledMetric(relativeTo: .headline) private var bottomHeight: CGFloat = 84

    var body: some View {
        VStack(spacing: 0) {
            header
                .frame(height: topHeight)
            Perforation()
                .padding(.horizontal, Theme.Spacing.xl)
            footer
                .frame(height: bottomHeight)
        }
        .padding(.horizontal, Theme.Spacing.l)
        .glassSurface(
            code.isRedeemable ? .card : .flat,
            in: TicketShape(notchPosition: topHeight / (topHeight + bottomHeight + 1))
        )
        .overlay(alignment: .topTrailing) {
            if !code.isRedeemable {
                UsedStamp(title: stampTitle)
                    .padding(.trailing, Theme.Spacing.xl)
                    .padding(.top, topHeight - 26)
            }
        }
        .saturation(code.isRedeemable ? 1 : 0.35)
        .accessibilityElement(children: .contain)
    }

    private var header: some View {
        HStack(spacing: Theme.Spacing.m) {
            GlassIconOrb(systemImage: code.category.symbol, colors: code.category.colors, size: 48)
            VStack(alignment: .leading, spacing: 4) {
                Text(verbatim: code.venueName(locale))
                    .font(.sarena(.headline, weight: .bold))
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
                HStack(spacing: 6) {
                    Text(code.tier.title)
                    Text(verbatim: "·")
                    Text(verbatim: "×" + code.quantity.localizedNumber(locale))
                }
                .font(.sarena(.caption, weight: .semibold))
                .foregroundStyle(.secondary)
            }
            Spacer(minLength: 0)
            if code.isRedeemable {
                GlassBadge(text: "Active", systemImage: "bolt.fill", tint: Theme.Palette.success)
            }
        }
    }

    private var footer: some View {
        HStack(spacing: Theme.Spacing.m) {
            VStack(alignment: .leading, spacing: 4) {
                Text(verbatim: code.code)
                    .font(.system(.title3, design: .monospaced).weight(.heavy))
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                    .textSelection(.enabled)
                Text(detailLine)
                    .font(.sarena(.caption))
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
            Spacer(minLength: 0)

            if code.isRedeemable {
                Button(action: onCopy) {
                    Image(systemName: isCopied ? "checkmark" : "doc.on.doc.fill")
                        .font(.body.weight(.bold))
                        .contentTransition(.symbolEffect(.replace))
                        .frame(width: 42, height: 42)
                        .glassSurface(.chip, in: Circle())
                }
                .buttonStyle(.plain)
                .foregroundStyle(isCopied ? Theme.Palette.success : Theme.Palette.orange)
                .accessibilityLabel(isCopied ? Text("Copied") : Text("Copy code"))
                .sensoryFeedback(.success, trigger: isCopied) { _, copied in copied }

                Button(action: onShow) {
                    Label("Show QR", systemImage: "qrcode")
                        .font(.sarena(.subheadline, weight: .bold))
                        .foregroundStyle(.white)
                        .padding(.horizontal, Theme.Spacing.l)
                        .frame(height: 42)
                        .background(Capsule().fill(Theme.brandGradient))
                        .shadow(color: Theme.Palette.orange.opacity(0.45), radius: 10, y: 5)
                }
                .buttonStyle(.glassPress)
            } else {
                VStack(alignment: .trailing, spacing: 2) {
                    Text("Saved")
                        .font(.sarena(.caption2, weight: .semibold))
                        .foregroundStyle(.secondary)
                    Text(verbatim: code.savings.omr(locale))
                        .font(.sarena(.subheadline, weight: .heavy))
                        .foregroundStyle(Theme.Palette.success)
                }
            }
        }
    }

    private var detailLine: LocalizedStringKey {
        if let usedAt = code.usedAt {
            return "Used on \(usedAt.shortDate(locale))"
        }
        if code.isExpired {
            return "Expired on \(code.expiresAt.shortDate(locale))"
        }
        return "Valid until \(code.expiresAt.shortDate(locale))"
    }

    private var stampTitle: LocalizedStringKey {
        code.isExpired ? "Expired" : "Used"
    }
}

private struct UsedStamp: View {
    let title: LocalizedStringKey

    var body: some View {
        Text(title)
            .font(.sarena(.caption, weight: .black))
            .textCase(.uppercase)
            .tracking(2)
            .foregroundStyle(Theme.Palette.danger)
            .padding(.horizontal, 12)
            .padding(.vertical, 5)
            .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(Theme.Palette.danger, lineWidth: 2))
            .rotationEffect(.degrees(-12))
            .opacity(0.85)
    }
}

/// Full-screen code for scanning at the venue.
struct PromoCodeSheet: View {
    let code: PromoCode
    let onMarkUsed: () -> Void

    @Environment(\.dismiss) private var dismiss
    @Environment(\.locale) private var locale
    @State private var isConfirmingUse = false

    var body: some View {
        ScrollView {
            VStack(spacing: Theme.Spacing.xl) {
                VStack(spacing: Theme.Spacing.xs) {
                    GlassIconOrb(systemImage: code.category.symbol, colors: code.category.colors, size: 56)
                    Text(verbatim: code.venueName(locale))
                        .font(.sarena(.title2, weight: .heavy))
                        .multilineTextAlignment(.center)
                    HStack(spacing: 6) {
                        Text(code.tier.title)
                        Text(verbatim: "·")
                        Text(verbatim: "×" + code.quantity.localizedNumber(locale))
                    }
                    .font(.sarena(.subheadline, weight: .semibold))
                    .foregroundStyle(.secondary)
                }
                .padding(.top, Theme.Spacing.xl)

                QRCodeTile(payload: code.qrPayload, size: 230)
                    .floatingGlass(amplitude: 4, tilt: 6)

                Text(verbatim: code.code)
                    .font(.system(.title, design: .monospaced).weight(.heavy))
                    .tracking(3)
                    .textSelection(.enabled)

                Text("Show this code at the entrance. Staff will scan it to apply your member price.")
                    .font(.sarena(.subheadline))
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)

                details

                VStack(spacing: Theme.Spacing.m) {
                    Button {
                        isConfirmingUse = true
                    } label: {
                        Label("Mark as Used", systemImage: "checkmark.seal.fill")
                    }
                    .buttonStyle(.sarenaGlass)

                    Button("Close") { dismiss() }
                        .buttonStyle(.sarenaProminent)
                }
            }
            .padding(.horizontal, Theme.Spacing.xl)
            .padding(.bottom, Theme.Spacing.xl)
        }
        .scrollIndicators(.hidden)
        .presentationDetents([.large])
        .presentationDragIndicator(.visible)
        .presentationCornerRadius(Theme.Radius.hero)
        .presentationBackground(.ultraThinMaterial)
        .confirmationDialog("Mark this code as used?", isPresented: $isConfirmingUse, titleVisibility: .visible) {
            Button("Mark as Used", role: .destructive) { onMarkUsed() }
        } message: {
            Text("Only do this once the venue has accepted the code. It will move to your history.")
        }
    }

    private var details: some View {
        VStack(spacing: Theme.Spacing.m) {
            detailRow("Paid", value: code.paidTotal.omr(locale))
            detailRow("Original price", value: code.originalTotal.omr(locale), struck: true)
            detailRow("You saved", value: code.savings.omr(locale), highlight: true)
            detailRow("Valid until", value: code.expiresAt.shortDate(locale))
        }
        .padding(Theme.Spacing.l)
        .glassSurface(.card)
    }

    private func detailRow(_ title: LocalizedStringKey, value: String, struck: Bool = false, highlight: Bool = false) -> some View {
        HStack {
            Text(title)
                .foregroundStyle(.secondary)
            Spacer()
            Text(verbatim: value)
                .fontWeight(.bold)
                .strikethrough(struck, color: .secondary)
                .foregroundStyle(highlight ? Theme.Palette.success : (struck ? Color.secondary : Color.primary))
        }
        .font(.sarena(.subheadline))
    }
}

#Preview {
    ZStack {
        GlassBackground()
        VStack(spacing: 20) {
            ForEach(PromoCode.welcomeSamples().prefix(2)) { code in
                PromoCodeCard(code: code, isCopied: false, onCopy: {}, onShow: {})
            }
        }
        .padding()
    }
}
