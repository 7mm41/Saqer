import SwiftUI

/// The backdrop behind every screen: one plain colour (light grey, or near-black
/// in dark mode). Calm to look at, and it costs nothing to draw.
struct GlassBackground: View {
    var body: some View {
        Theme.Palette.background
            .ignoresSafeArea()
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }
}

extension View {
    /// Places the Sarena backdrop behind a full screen. The screen always takes
    /// the whole width and height first: a scroll view with little content would
    /// otherwise shrink to it, leaving the (black) navigation container showing
    /// at the sides.
    func sarenaScreenBackground() -> some View {
        frame(maxWidth: .infinity, maxHeight: .infinity)
            .background { GlassBackground() }
    }
}

#Preview {
    GlassBackground()
}
