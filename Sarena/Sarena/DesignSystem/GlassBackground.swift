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

    /// A solid title bar in the screen colour: the title never sits on top of
    /// cards scrolled underneath it.
    func sarenaNavigationBar() -> some View {
        toolbarBackground(Theme.Palette.background, for: .navigationBar)
            .toolbarBackground(.visible, for: .navigationBar)
    }

    /// For screens without a title bar: the status bar (clock, battery) gets
    /// the screen colour, so content scrolled up doesn't show behind it.
    func sarenaStatusBarBackdrop() -> some View {
        safeAreaInset(edge: .top, spacing: 0) {
            Color.clear
                .frame(height: 0)
                .background(Theme.Palette.background)
        }
    }
}

#Preview {
    GlassBackground()
}
