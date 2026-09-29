import SwiftUI

// MARK: - Buttons
//
// Named `Sarena…` on purpose: iOS 26 ships its own `.glass` / `.glassProminent`
// button styles and prefixed names keep this code compiling on every SDK.

struct SarenaButtonStyle: ButtonStyle {
    enum Kind { case prominent, glass, destructive }

    var kind: Kind = .prominent
    @Environment(\.isEnabled) private var isEnabled

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.sarena(.headline, weight: .bold))
            .foregroundStyle(foreground)
            .frame(maxWidth: .infinity, minHeight: 54)
            .padding(.horizontal, Theme.Spacing.xl)
            .background { capsule }
            .contentShape(Capsule())
            .scaleEffect(configuration.isPressed ? 0.98 : 1)
            .opacity(isEnabled ? (configuration.isPressed ? 0.85 : 1) : 0.5)
            .animation(.easeOut(duration: 0.15), value: configuration.isPressed)
    }

    /// Flat fills, no glow: one solid orange for the main action, a white card
    /// for the others.
    @ViewBuilder
    private var capsule: some View {
        switch kind {
        case .prominent:
            Capsule().fill(Theme.Palette.orangeFill)
        case .glass:
            Capsule()
                .fill(Theme.Palette.card)
                .overlay(Capsule().strokeBorder(Color.primary.opacity(0.08), lineWidth: 1))
        case .destructive:
            Capsule().fill(Theme.Palette.danger.opacity(0.10))
        }
    }

    private var foreground: Color {
        switch kind {
        case .prominent: .white
        case .glass: .primary
        case .destructive: Theme.Palette.danger
        }
    }
}

extension ButtonStyle where Self == SarenaButtonStyle {
    static var sarenaProminent: SarenaButtonStyle { SarenaButtonStyle(kind: .prominent) }
    static var sarenaGlass: SarenaButtonStyle { SarenaButtonStyle(kind: .glass) }
    static var sarenaDestructive: SarenaButtonStyle { SarenaButtonStyle(kind: .destructive) }
}

// MARK: - Text field

struct GlassTextField: View {
    let title: LocalizedStringKey
    let systemImage: String
    @Binding var text: String
    /// Fixed text before the input, e.g. a "+968" country code.
    var prefix: String?
    var isSecure = false
    var keyboard: UIKeyboardType = .default
    var contentType: UITextContentType?
    var capitalization: TextInputAutocapitalization = .never
    var submitLabel: SubmitLabel = .next
    var onSubmit: () -> Void = {}

    @State private var isRevealed = false
    @FocusState private var isFocused: Bool

    var body: some View {
        HStack(spacing: Theme.Spacing.m) {
            Image(systemName: systemImage)
                .font(.body.weight(.semibold))
                .foregroundStyle(isFocused ? Theme.Palette.orange : .secondary)
                .frame(width: 24)

            if let prefix {
                Text(verbatim: prefix)
                    .font(.sarena(.body, weight: .semibold))
                    .foregroundStyle(.secondary)
                    .environment(\.layoutDirection, .leftToRight)
            }

            Group {
                if isSecure && !isRevealed {
                    SecureField(title, text: $text)
                } else {
                    TextField(title, text: $text)
                }
            }
            .focused($isFocused)
            .font(.sarena(.body, weight: .medium))
            .keyboardType(keyboard)
            .textContentType(contentType)
            .textInputAutocapitalization(capitalization)
            .autocorrectionDisabled()
            .submitLabel(submitLabel)
            .onSubmit(onSubmit)

            if isSecure {
                Button {
                    isRevealed.toggle()
                } label: {
                    Image(systemName: isRevealed ? "eye.slash.fill" : "eye.fill")
                        .foregroundStyle(.secondary)
                }
                .buttonStyle(.plain)
                .accessibilityLabel(isRevealed ? Text("Hide password") : Text("Show password"))
            }
        }
        .padding(.horizontal, Theme.Spacing.l)
        .frame(height: 56)
        .glassSurface(.field)
        .overlay {
            RoundedRectangle(cornerRadius: Theme.Radius.field, style: .continuous)
                .strokeBorder(Theme.Palette.orange.opacity(isFocused ? 0.9 : 0), lineWidth: 1.5)
        }
        .animation(.easeOut(duration: 0.2), value: isFocused)
    }
}

// MARK: - Segmented control

/// A segmented control with a sliding orange selection.
struct GlassSegmentedControl<Option: Hashable & Identifiable>: View {
    let options: [Option]
    @Binding var selection: Option
    let title: (Option) -> LocalizedStringKey
    var count: (Option) -> Int? = { _ in nil }

    @Namespace private var namespace

    var body: some View {
        HStack(spacing: Theme.Spacing.xs) {
            ForEach(options) { option in
                let isSelected = option == selection
                Button {
                    withAnimation(.spring(response: 0.38, dampingFraction: 0.78)) { selection = option }
                } label: {
                    HStack(spacing: Theme.Spacing.s) {
                        Text(title(option))
                        if let value = count(option) {
                            Text(value, format: .number)
                                .font(.sarena(.caption, weight: .bold))
                                .padding(.horizontal, 8)
                                .padding(.vertical, 2)
                                .background(Capsule().fill(isSelected ? .white.opacity(0.25) : Color.primary.opacity(0.08)))
                        }
                    }
                    .font(.sarena(.subheadline, weight: .bold))
                    .foregroundStyle(isSelected ? Color.white : Color.primary)
                    .frame(maxWidth: .infinity, minHeight: 44)
                    .background {
                        if isSelected {
                            Capsule()
                                .fill(Theme.Palette.orangeFill)
                                .matchedGeometryEffect(id: "jewel", in: namespace)
                        }
                    }
                    .contentShape(Capsule())
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(isSelected ? .isSelected : [])
            }
        }
        .padding(5)
        .glassSurface(.chip, in: Capsule())
        .sensoryFeedback(.selection, trigger: selection)
    }
}

// MARK: - Small pieces

/// Capsule badge — discounts, "Members only", scarcity labels, package names.
struct GlassBadge: View {
    private let label: Text
    var systemImage: String?
    var tint: Color = Theme.Palette.orange
    var prominent = false

    init(text: LocalizedStringKey, systemImage: String? = nil, tint: Color = Theme.Palette.orange, prominent: Bool = false) {
        self.label = Text(text)
        self.systemImage = systemImage
        self.tint = tint
        self.prominent = prominent
    }

    /// Non-localised text, e.g. "👑 الذهبية".
    init(verbatim: String, systemImage: String? = nil, tint: Color = Theme.Palette.orange, prominent: Bool = false) {
        self.label = Text(verbatim: verbatim)
        self.systemImage = systemImage
        self.tint = tint
        self.prominent = prominent
    }

    var body: some View {
        HStack(spacing: 5) {
            if let systemImage { Image(systemName: systemImage) }
            label
        }
        .font(.sarena(.caption, weight: .bold))
        .foregroundStyle(textColor)
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
        .background { Capsule().fill(fillColor) }
    }

    /// `.white` marks a badge on a photo or artwork: a solid card-coloured chip
    /// with dark text, readable on any picture.
    private var isChip: Bool { tint == .white }

    private var textColor: Color {
        if isChip { return .primary }
        if prominent { return .white }
        // Orange words are darkened (lightened in dark mode) so they stay readable.
        return tint == Theme.Palette.orange ? Theme.Palette.accentText : tint
    }

    /// Solid for "prominent", otherwise a soft wash of the colour behind the text.
    private var fillColor: Color {
        if isChip { return Theme.Palette.card }
        if prominent { return tint == Theme.Palette.orange ? Theme.Palette.orangeFill : tint }
        return tint.opacity(0.12)
    }
}

struct SectionHeader: View {
    let title: LocalizedStringKey
    var subtitle: LocalizedStringKey?

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title)
                .font(.sarena(.title3, weight: .bold))
            if let subtitle {
                Text(subtitle)
                    .font(.sarena(.subheadline))
                    .foregroundStyle(.secondary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityAddTraits(.isHeader)
    }
}

/// A soft circle holding an SF Symbol — used for category icons. The symbol
/// takes the last colour (Sarena orange) on a light wash of it.
struct GlassIconOrb: View {
    let systemImage: String
    var colors: [Color]
    var size: CGFloat = 52

    private var tint: Color { colors.last ?? Theme.Palette.orange }

    var body: some View {
        ZStack {
            Circle().fill(tint.opacity(0.12))
            Image(systemName: systemImage)
                .font(.system(size: size * 0.42, weight: .semibold))
                .foregroundStyle(tint == Theme.Palette.orange ? Theme.Palette.accentText : tint)
        }
        .frame(width: size, height: size)
    }
}
