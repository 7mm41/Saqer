import SwiftUI

/// The member's card: name, member number and whether they're a member.
struct MemberCard: View {
    let user: User
    let isActiveMember: Bool
    @Environment(\.locale) private var locale

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.l) {
            HStack(spacing: Theme.Spacing.s) {
                BrandMark()
                    .frame(width: 30, height: 30)
                Text("Sarena")
                    .font(.sarena(.headline, weight: .heavy))
                Spacer(minLength: Theme.Spacing.s)
                if isActiveMember {
                    GlassBadge(text: "Member", systemImage: "crown.fill")
                } else {
                    GlassBadge(text: "Not a member yet", systemImage: "sparkles", tint: Theme.Palette.steel)
                }
            }

            HStack(spacing: Theme.Spacing.m) {
                Text(verbatim: user.initials)
                    .font(.sarena(.title3, weight: .heavy))
                    .foregroundStyle(Theme.Palette.accentText)
                    .frame(width: 52, height: 52)
                    .background(Circle().fill(Theme.Palette.orangeSoft))
                VStack(alignment: .leading, spacing: 2) {
                    Text(verbatim: user.fullName)
                        .font(.sarena(.headline, weight: .bold))
                    Text(verbatim: user.email)
                        .font(.sarena(.caption))
                        .foregroundStyle(.secondary)
                }
            }

            Divider()

            HStack(alignment: .bottom) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Member No.")
                        .font(.sarena(.caption2, weight: .semibold))
                        .foregroundStyle(.secondary)
                    Text(verbatim: user.memberNumber)
                        .font(.system(.subheadline, design: .monospaced).weight(.bold))
                }
                Spacer()
                VStack(alignment: .trailing, spacing: 2) {
                    Text("Member since")
                        .font(.sarena(.caption2, weight: .semibold))
                        .foregroundStyle(.secondary)
                    Text(verbatim: user.memberSince.shortDate(locale))
                        .font(.sarena(.subheadline, weight: .bold))
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(Theme.Spacing.xl)
        .glassSurface(.card)
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
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                Spacer(minLength: Theme.Spacing.s)
                if let onOpenWallet {
                    Button(action: onOpenWallet) {
                        Label("View Wallet", systemImage: "wallet.pass.fill")
                            .font(.sarena(.caption, weight: .bold))
                            .foregroundStyle(Theme.Palette.accentText)
                            .padding(.horizontal, Theme.Spacing.m)
                            .padding(.vertical, 6)
                            .background(Capsule().fill(Theme.Palette.orangeSoft))
                    }
                    .buttonStyle(.glassPress)
                }
            }
            Text(verbatim: totalSavings.omr(locale))
                .font(.system(size: 40, weight: .heavy, design: .rounded))
                .foregroundStyle(Theme.Palette.accentText)
                .lineLimit(1)
                .minimumScaleFactor(0.5)
                .contentTransition(.numericText())
                .frame(maxWidth: .infinity, alignment: .leading)
            Text("Total saved with Sarena")
                .font(.sarena(.subheadline, weight: .medium))
                .foregroundStyle(.secondary)
            // Pills keep their natural size; on very narrow screens they wrap as a whole.
            ViewThatFits(in: .horizontal) {
                HStack(spacing: Theme.Spacing.m) { statPills }
                VStack(alignment: .leading, spacing: Theme.Spacing.s) { statPills }
            }
        }
        // Explicit full width: the card must never shrink to its content.
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(Theme.Spacing.xl)
        .glassSurface(.card)
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
                .foregroundStyle(Theme.Palette.accentText)
            Text(verbatim: value.localizedNumber(locale))
                .fontWeight(.heavy)
                .contentTransition(.numericText(value: Double(value)))
            Text(title)
        }
        .font(.sarena(.caption, weight: .semibold))
        .foregroundStyle(.primary)
        .lineLimit(1)
        .fixedSize()
        .padding(.horizontal, Theme.Spacing.m)
        .padding(.vertical, Theme.Spacing.s)
        .background(Capsule().fill(Color.primary.opacity(0.06)))
    }
}
