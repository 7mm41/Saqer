import SwiftUI

/// The dashboard's seasonal theme on Home: its greeting and banner, and a
/// one-tap offer to put the seasonal icon on the home screen (or to switch
/// back once the season is over). Apple requires icon changes to come from a
/// tap, so the app offers instead of switching by itself.
struct SeasonalBanner: View {
    let theme: SeasonalTheme?
    let suggestion: AppConfigStore.IconSuggestion?
    let isApplying: Bool
    let onApply: () -> Void
    let onDismiss: () -> Void

    @Environment(\.locale) private var locale

    private var accent: Color {
        theme?.accentColor.flatMap(Color.init(hexString:)) ?? Theme.Palette.orange
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            if let url = theme?.bannerURL {
                AsyncImage(url: url) { phase in
                    if let image = phase.image {
                        image.resizable().scaledToFill()
                    } else {
                        LinearGradient(colors: [accent.opacity(0.6), accent.opacity(0.25)], startPoint: .topLeading, endPoint: .bottomTrailing)
                    }
                }
                .frame(height: 130)
                .frame(maxWidth: .infinity)
                .clipped()
            }

            VStack(alignment: .leading, spacing: Theme.Spacing.m) {
                if let greeting = theme?.greeting {
                    HStack(spacing: Theme.Spacing.m) {
                        BrandMark()
                            .frame(width: 40, height: 40)
                        Text(verbatim: greeting(locale))
                            .font(.sarena(.title3, weight: .heavy))
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                if let suggestion {
                    iconOffer(suggestion)
                }
            }
            .padding(Theme.Spacing.l)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.card, style: .continuous))
        .glassSurface(.tinted(accent, opacity: 0.18, cornerRadius: Theme.Radius.card))
        .animation(.smooth, value: suggestion)
    }

    @ViewBuilder
    private func iconOffer(_ suggestion: AppConfigStore.IconSuggestion) -> some View {
        let (icon, title, action): (AppIcon, LocalizedStringKey, LocalizedStringKey) = switch suggestion {
        case .apply(let icon): (icon, "Get the \(Text(icon.title)) icon on your home screen", "Apply")
        case .restore: (.classic, "The season is over. Switch back to the classic icon?", "Switch back")
        }
        HStack(spacing: Theme.Spacing.m) {
            Image(icon.previewImageName)
                .resizable()
                .scaledToFit()
                .frame(width: 52, height: 52)
                .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(.white.opacity(0.6), lineWidth: 1))
                .shadow(color: accent.opacity(0.35), radius: 8, y: 4)
            Text(title)
                .font(.sarena(.subheadline, weight: .semibold))
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 0)
        }
        HStack(spacing: Theme.Spacing.m) {
            Button(action: onApply) {
                if isApplying {
                    ProgressView().tint(.white)
                } else {
                    Text(action)
                }
            }
            .buttonStyle(.sarenaProminent)
            .disabled(isApplying)
            Button("Not now", action: onDismiss)
                .buttonStyle(.sarenaGlass)
        }
    }
}

extension Color {
    /// `#RRGGBB` from the dashboard.
    init?(hexString: String) {
        let digits = hexString.trimmingCharacters(in: .whitespaces).replacingOccurrences(of: "#", with: "")
        guard digits.count == 6, let value = UInt32(digits, radix: 16) else { return nil }
        self.init(hex: value)
    }
}
