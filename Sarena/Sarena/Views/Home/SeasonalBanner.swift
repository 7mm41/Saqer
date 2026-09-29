import SwiftUI

/// The look running now (set in the dashboard): its greeting and banner on Home.
struct SeasonalBanner: View {
    let theme: SeasonalTheme?

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
                        accent.opacity(0.12)
                    }
                }
                .frame(height: 130)
                .frame(maxWidth: .infinity)
                .clipped()
            }

            if let greeting = theme?.greeting {
                HStack(spacing: Theme.Spacing.m) {
                    BrandMark()
                        .frame(width: 40, height: 40)
                    Text(verbatim: greeting(locale))
                        .font(.sarena(.title3, weight: .heavy))
                        .fixedSize(horizontal: false, vertical: true)
                }
                .padding(Theme.Spacing.l)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.card, style: .continuous))
        .glassSurface(.card)
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
