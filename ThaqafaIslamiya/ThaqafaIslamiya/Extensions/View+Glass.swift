//
//  View+Glass.swift
//  ثقافة إسلامية
//
//  ثيم «الزجاج السائل» (Liquid Glass):
//  - على iOS 26 وما بعده (عند البناء بـ Xcode 26): Liquid Glass الأصلي `glassEffect` داخل `GlassEffectContainer`
//    فتندمج العناصر الزجاجية المتجاورة وتتموّج عند اللمس.
//  - على iOS 17–18: طبقات خفيفة تحاكيه: مادة `ultraThinMaterial` + لون خفيف + لمعة علوية (specular)
//    + حافة ضوئية متدرّجة + ظل ناعم على الخلفية فقط (لا على النص) للحفاظ على سلاسة التمرير.
//

import SwiftUI

// MARK: - Glass Background

struct GlassBackground<S: InsettableShape>: ViewModifier {
    var shape: S
    var tint: Color = .white
    var interactive: Bool = false
    var elevated: Bool = true

    @Environment(\.colorScheme) private var colorScheme

    func body(content: Content) -> some View {
        #if compiler(>=6.2)
        if #available(iOS 26.0, *) {
            content
                .glassEffect(.regular.tint(tint.opacity(tint == .white ? 0 : 0.2)).interactive(interactive), in: shape)
        } else {
            materialGlass(content)
        }
        #else
        materialGlass(content)
        #endif
    }

    private func materialGlass(_ content: Content) -> some View {
        let dark = colorScheme == .dark
        return content
            .background {
                ZStack {
                    shape.fill(.ultraThinMaterial)
                    // لون خفيف متدرّج يمنح الزجاج روح القسم
                    shape.fill(
                        LinearGradient(colors: [tint.opacity(dark ? 0.20 : 0.16), tint.opacity(0.04)],
                                       startPoint: .topLeading, endPoint: .bottomTrailing)
                    )
                    // لمعة علوية (specular) كأن الضوء يسقط على سطح سائل
                    shape.fill(
                        LinearGradient(colors: [.white.opacity(dark ? 0.10 : 0.38), .white.opacity(0)],
                                       startPoint: .top, endPoint: UnitPoint(x: 0.5, y: 0.45))
                    )
                }
                .shadow(color: .black.opacity(elevated ? (dark ? 0.35 : 0.08) : 0), radius: 14, x: 0, y: 8)
            }
            .overlay {
                // حافة ضوئية: لامعة أعلى اليمين وخافتة في الوسط كانكسار الضوء على الزجاج
                shape.strokeBorder(
                    LinearGradient(
                        colors: [.white.opacity(dark ? 0.45 : 0.9), .white.opacity(dark ? 0.06 : 0.18),
                                 .white.opacity(dark ? 0.04 : 0.1), .white.opacity(dark ? 0.25 : 0.55)],
                        startPoint: .topLeading, endPoint: .bottomTrailing
                    ),
                    lineWidth: 1
                )
            }
    }
}

extension View {
    /// يغلّف العنصر بطبقة زجاجية دائرية الحواف.
    func glassCard(cornerRadius: CGFloat = 28, tint: Color = .white, interactive: Bool = false,
                   elevated: Bool = true) -> some View {
        modifier(GlassBackground(shape: RoundedRectangle(cornerRadius: cornerRadius, style: .continuous),
                                 tint: tint, interactive: interactive, elevated: elevated))
    }

    /// زجاج على شكل كبسولة (للأزرار والشارات).
    func glassCapsule(tint: Color = .white, interactive: Bool = true) -> some View {
        modifier(GlassBackground(shape: Capsule(), tint: tint, interactive: interactive, elevated: false))
    }

    /// زجاج دائري (لأزرار الأيقونات).
    func glassCircle(tint: Color = .white, interactive: Bool = true) -> some View {
        modifier(GlassBackground(shape: Circle(), tint: tint, interactive: interactive, elevated: false))
    }
}

// MARK: - Glass container

/// يجمع العناصر الزجاجية المتجاورة لتندمج وتتحوّل معًا على iOS 26 (`GlassEffectContainer`)،
/// ويعرض المحتوى كما هو على الإصدارات الأقدم.
struct GlassGroup<Content: View>: View {
    var spacing: CGFloat = 16
    @ViewBuilder var content: Content

    var body: some View {
        #if compiler(>=6.2)
        if #available(iOS 26.0, *) {
            GlassEffectContainer(spacing: spacing) { content }
        } else {
            content
        }
        #else
        content
        #endif
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
            .glassCard(cornerRadius: cornerRadius, tint: tint, interactive: true, elevated: false)
            .scaleEffect(configuration.isPressed ? 0.95 : 1)
            .animation(.spring(response: 0.28, dampingFraction: 0.6), value: configuration.isPressed)
    }
}

/// زر بارز ملوّن (للإجراء الرئيسي مثل «التالي»): تدرّج لوني + لمعة زجاجية سائلة.
struct ProminentGlassButtonStyle: ButtonStyle {
    var colors: [Color]

    func makeBody(configuration: Configuration) -> some View {
        let tint = colors.first ?? .teal
        return configuration.label
            .font(.headline)
            .foregroundStyle(.white)
            .padding(.horizontal, 26)
            .padding(.vertical, 15)
            .background {
                ZStack {
                    Capsule().fill(LinearGradient.diagonal(colors))
                    Capsule().fill(
                        LinearGradient(colors: [.white.opacity(0.45), .white.opacity(0)],
                                       startPoint: .top, endPoint: .center)
                    )
                    .padding(2)
                }
                .shadow(color: tint.opacity(configuration.isPressed ? 0.2 : 0.4), radius: 12, x: 0, y: 6)
            }
            .overlay(Capsule().strokeBorder(.white.opacity(0.55), lineWidth: 1))
            .scaleEffect(configuration.isPressed ? 0.95 : 1)
            .animation(.spring(response: 0.28, dampingFraction: 0.6), value: configuration.isPressed)
    }
}

/// بطاقة تنكمش قليلًا عند اللمس (لبطاقات الأقسام والمسائل).
struct PressableCardStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.97 : 1)
            .animation(.spring(response: 0.25, dampingFraction: 0.65), value: configuration.isPressed)
    }
}
