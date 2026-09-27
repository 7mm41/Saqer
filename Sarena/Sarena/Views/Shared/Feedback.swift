import SwiftUI

/// Inline error panel in red-tinted glass.
struct ErrorBanner: View {
    let message: LocalizedStringKey

    var body: some View {
        Label {
            Text(message)
                .fixedSize(horizontal: false, vertical: true)
        } icon: {
            Image(systemName: "exclamationmark.triangle.fill")
        }
        .font(.sarena(.footnote, weight: .semibold))
        .foregroundStyle(Theme.Palette.danger)
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(Theme.Spacing.m)
        .glassSurface(.tinted(Theme.Palette.danger, opacity: 0.14, cornerRadius: Theme.Radius.chip, shadow: .none))
        .transition(.move(edge: .top).combined(with: .opacity))
    }
}

/// Small validation hint under a text field.
struct FieldHint: View {
    let text: LocalizedStringKey

    var body: some View {
        Label(text, systemImage: "info.circle.fill")
            .font(.sarena(.caption, weight: .medium))
            .foregroundStyle(Theme.Palette.danger)
            .padding(.horizontal, Theme.Spacing.s)
            .frame(maxWidth: .infinity, alignment: .leading)
            .transition(.opacity)
    }
}

/// Glass checkbox for consent toggles.
struct GlassCheckboxToggleStyle: ToggleStyle {
    func makeBody(configuration: Configuration) -> some View {
        Button {
            configuration.isOn.toggle()
        } label: {
            HStack(alignment: .top, spacing: Theme.Spacing.m) {
                ZStack {
                    RoundedRectangle(cornerRadius: 7, style: .continuous)
                        .fill(configuration.isOn ? AnyShapeStyle(Theme.brandGradient) : AnyShapeStyle(.ultraThinMaterial))
                    RoundedRectangle(cornerRadius: 7, style: .continuous)
                        .strokeBorder(.white.opacity(0.5), lineWidth: 1)
                    if configuration.isOn {
                        Image(systemName: "checkmark")
                            .font(.caption.weight(.heavy))
                            .foregroundStyle(.white)
                    }
                }
                .frame(width: 24, height: 24)

                configuration.label
                    .font(.sarena(.footnote, weight: .medium))
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.leading)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .buttonStyle(.plain)
        .sensoryFeedback(.selection, trigger: configuration.isOn)
        .accessibilityAddTraits(configuration.isOn ? .isSelected : [])
    }
}

/// Animated placeholder used while content loads.
struct ShimmerPlaceholder: View {
    var height: CGFloat
    var cornerRadius: CGFloat = Theme.Radius.card

    var body: some View {
        RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
            .fill(.white.opacity(0.3))
            .frame(height: height)
            .phaseAnimator([0.45, 0.9]) { view, opacity in
                view.opacity(opacity)
            } animation: { _ in
                .easeInOut(duration: 0.9)
            }
            .accessibilityHidden(true)
    }
}
