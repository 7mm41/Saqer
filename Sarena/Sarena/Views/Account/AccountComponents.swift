import SwiftUI

/// Apple-Card-style floating glass membership card.
struct MemberCard: View {
    let user: User
    let isActiveMember: Bool
    @Environment(\.locale) private var locale

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.l) {
            HStack {
                Image("SarenaLogo")
                    .resizable()
                    .scaledToFit()
                    .frame(width: 34, height: 34)
                Text("Sarena")
                    .font(.system(.title3, design: .rounded, weight: .black))
                Spacer()
                if isActiveMember {
                    GlassBadge(text: "Member", systemImage: "crown.fill", tint: Theme.Palette.gold, prominent: true)
                } else {
                    GlassBadge(text: "Not a member yet", systemImage: "sparkles", tint: .white)
                }
            }

            HStack(spacing: Theme.Spacing.m) {
                Text(verbatim: user.initials)
                    .font(.sarena(.title3, weight: .heavy))
                    .foregroundStyle(.white)
                    .frame(width: 52, height: 52)
                    .background(Circle().fill(.white.opacity(0.25)))
                    .overlay(Circle().strokeBorder(.white.opacity(0.6), lineWidth: 1))
                VStack(alignment: .leading, spacing: 2) {
                    Text(verbatim: user.fullName)
                        .font(.sarena(.headline, weight: .bold))
                    Text(verbatim: user.email)
                        .font(.sarena(.caption))
                        .opacity(0.8)
                }
            }

            HStack(alignment: .bottom) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Member No.")
                        .font(.sarena(.caption2, weight: .semibold))
                        .opacity(0.75)
                    Text(verbatim: user.memberNumber)
                        .font(.system(.subheadline, design: .monospaced).weight(.bold))
                }
                Spacer()
                VStack(alignment: .trailing, spacing: 2) {
                    Text("Member since")
                        .font(.sarena(.caption2, weight: .semibold))
                        .opacity(0.75)
                    Text(verbatim: user.memberSince.shortDate(locale))
                        .font(.sarena(.subheadline, weight: .bold))
                }
            }
        }
        .foregroundStyle(.white)
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(Theme.Spacing.xl)
        .background {
            ZStack {
                RoundedRectangle(cornerRadius: Theme.Radius.hero, style: .continuous)
                    .fill(LinearGradient(colors: [Theme.Palette.glow, Theme.Palette.orange, Theme.Palette.ember, Theme.Palette.festivalPink],
                                         startPoint: .topLeading, endPoint: .bottomTrailing))
                    .opacity(0.85)
                // Holographic sheen
                RoundedRectangle(cornerRadius: Theme.Radius.hero, style: .continuous)
                    .fill(LinearGradient(colors: [.clear, .white.opacity(0.35), .clear], startPoint: .topLeading, endPoint: .bottomTrailing))
            }
        }
        .glassSurface(.tinted(Theme.Palette.orange, opacity: 0.2, cornerRadius: Theme.Radius.hero))
        .parallax(tilt: 8, shift: 4)
        .padding(.top, Theme.Spacing.s)
        .accessibilityElement(children: .combine)
    }
}

/// "توفير الأعضاء" — lifetime savings with ready / redeemed counts.
struct SavingsCard: View {
    let totalSavings: Decimal
    let readyCount: Int
    let redeemedCount: Int
    var onOpenWallet: (() -> Void)?

    @Environment(\.locale) private var locale

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.m) {
            HStack(alignment: .center) {
                Label("Member savings", systemImage: "chart.line.uptrend.xyaxis")
                    .font(.sarena(.subheadline, weight: .bold))
                    .foregroundStyle(.white.opacity(0.9))
                    .lineLimit(1)
                Spacer(minLength: Theme.Spacing.s)
                if let onOpenWallet {
                    Button(action: onOpenWallet) {
                        Label("View Wallet", systemImage: "wallet.pass.fill")
                            .font(.sarena(.caption, weight: .bold))
                            .foregroundStyle(.white)
                            .padding(.horizontal, Theme.Spacing.m)
                            .padding(.vertical, 6)
                            .background(Capsule().fill(.white.opacity(0.22)))
                            .overlay(Capsule().strokeBorder(.white.opacity(0.4), lineWidth: 1))
                    }
                    .buttonStyle(.glassPress)
                }
            }
            Text(verbatim: totalSavings.omr(locale))
                .font(.system(size: 42, weight: .heavy, design: .rounded))
                .foregroundStyle(.white)
                .lineLimit(1)
                .minimumScaleFactor(0.5)
                .contentTransition(.numericText())
                .frame(maxWidth: .infinity, alignment: .leading)
            Text("Total saved with Sarena")
                .font(.sarena(.subheadline, weight: .medium))
                .foregroundStyle(.white.opacity(0.85))
            // Pills keep their natural size; on very narrow screens they wrap as a whole.
            ViewThatFits(in: .horizontal) {
                HStack(spacing: Theme.Spacing.m) { statPills }
                VStack(alignment: .leading, spacing: Theme.Spacing.s) { statPills }
            }
        }
        // Explicit full width: the card must never shrink to its content.
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(Theme.Spacing.xl)
        .background {
            RoundedRectangle(cornerRadius: Theme.Radius.hero, style: .continuous)
                .fill(LinearGradient(colors: [Theme.Palette.orange, Theme.Palette.ember, Theme.Palette.festivalPink.opacity(0.8)],
                                     startPoint: .topLeading, endPoint: .bottomTrailing))
                .opacity(0.85)
        }
        .glassSurface(.tinted(Theme.Palette.orange, opacity: 0.2, cornerRadius: Theme.Radius.hero))
    }

    @ViewBuilder
    private var statPills: some View {
        StatPill(value: readyCount, title: "Ready to use", systemImage: "qrcode")
        StatPill(value: redeemedCount, title: "Redeemed", systemImage: "checkmark.seal.fill")
    }
}

struct StatPill: View {
    let value: Int
    let title: LocalizedStringKey
    let systemImage: String
    @Environment(\.locale) private var locale

    var body: some View {
        HStack(spacing: Theme.Spacing.s) {
            Image(systemName: systemImage)
            Text(verbatim: value.localizedNumber(locale))
                .fontWeight(.heavy)
                .contentTransition(.numericText(value: Double(value)))
            Text(title)
        }
        .font(.sarena(.caption, weight: .semibold))
        .foregroundStyle(.white)
        .lineLimit(1)
        .fixedSize()
        .padding(.horizontal, Theme.Spacing.m)
        .padding(.vertical, Theme.Spacing.s)
        .background(Capsule().fill(.white.opacity(0.2)))
        .overlay(Capsule().strokeBorder(.white.opacity(0.35), lineWidth: 1))
    }
}
