//
//  View+Glass.swift
//  ثقافة إسلامية
//
//  ثيم «الزجاج العائم / السائل»:
//  - على iOS 26 وما بعده (عند البناء بـ Xcode 26): يستخدم Liquid Glass الأصلي `glassEffect`.
//  - على iOS 17–18: يستخدم `.ultraThinMaterial` مع حافة لامعة وظل ناعم ولمسة لونية.
//

import SwiftUI

// MARK: - Glass Background

struct GlassBackground: ViewModifier {
    var cornerRadius: CGFloat = 28
    var tint: Color = .white
    var interactive: Bool = false

    func body(content: Content) -> some View {
        let shape = RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
        #if compiler(>=6.2)
        if #available(iOS 26.0, *) {
            content
                .glassEffect(.regular.tint(tint.opacity(0.22)).interactive(interactive), in: shape)
        } else {
            materialGlass(content, shape: shape)
        }
        #else
        materialGlass(content, shape: shape)
        #endif
    }

    private func materialGlass(_ content: Content, shape: RoundedRectangle) -> some View {
        content
            .background(shape.fill(tint.opacity(0.14)))
            .background(.ultraThinMaterial, in: shape)
            .overlay(
                shape.strokeBorder(
                    LinearGradient(
                        colors: [.white.opacity(0.75), .white.opacity(0.15), .white.opacity(0.05), .white.opacity(0.4)],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    ),
                    lineWidth: 1.2
                )
            )
            .shadow(color: .black.opacity(0.12), radius: 20, x: 0, y: 12)
    }
}

extension View {
    /// يغلّف العنصر بطبقة زجاجية دائرية الحواف.
    func glassCard(cornerRadius: CGFloat = 28, tint: Color = .white, interactive: Bool = false) -> some View {
        modifier(GlassBackground(cornerRadius: cornerRadius, tint: tint, interactive: interactive))
    }

    /// زجاج على شكل كبسولة (للأزرار والشارات).
    func glassCapsule(tint: Color = .white, interactive: Bool = true) -> some View {
        modifier(GlassBackground(cornerRadius: 999, tint: tint, interactive: interactive))
    }
}

// MARK: - Button Styles

/// زر زجاجي مع ارتداد نابض عند اللمس.
struct GlassButtonStyle: ButtonStyle {
    var tint: Color = .white
    var cornerRadius: CGFloat = 22

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .padding(.horizontal, 20)
            .padding(.vertical, 14)
            .glassCard(cornerRadius: cornerRadius, tint: tint, interactive: true)
            .scaleEffect(configuration.isPressed ? 0.94 : 1)
            .animation(.spring(response: 0.3, dampingFraction: 0.6), value: configuration.isPressed)
    }
}

/// زر بارز ملوّن بتدرّج (للإجراء الرئيسي مثل «التالي»).
struct ProminentGlassButtonStyle: ButtonStyle {
    var colors: [Color]

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.headline)
            .foregroundStyle(.white)
            .padding(.horizontal, 26)
            .padding(.vertical, 15)
            .background(LinearGradient.diagonal(colors), in: Capsule())
            .overlay(Capsule().strokeBorder(.white.opacity(0.45), lineWidth: 1))
            .shadow(color: (colors.first ?? .teal).opacity(0.45), radius: 14, x: 0, y: 8)
            .scaleEffect(configuration.isPressed ? 0.94 : 1)
            .animation(.spring(response: 0.3, dampingFraction: 0.6), value: configuration.isPressed)
    }
}

/// بطاقة تنكمش قليلًا عند اللمس (لبطاقات الأقسام والمسائل).
struct PressableCardStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.96 : 1)
            .animation(.spring(response: 0.28, dampingFraction: 0.65), value: configuration.isPressed)
    }
}
