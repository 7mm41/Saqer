//
//  LiquidBackground.swift
//  ثقافة إسلامية
//
//  خلفية متدرّجة حيوية بفقاعات لونية ضبابية تتحرّك ببطء — أساس ثيم الزجاج السائل.
//

import SwiftUI

struct LiquidBackground: View {
    var colors: [Color] = Color.liquidPalette

    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var animate = false

    var body: some View {
        GeometryReader { proxy in
            let size = proxy.size
            let side = max(size.width, size.height)

            ZStack {
                // طبقة الأساس
                LinearGradient(
                    colors: baseColors,
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )

                // فقاعات لونية عائمة
                ForEach(Array(colors.prefix(4).enumerated()), id: \.offset) { index, color in
                    Circle()
                        .fill(color.opacity(colorScheme == .dark ? 0.55 : 0.6))
                        .frame(width: side * 0.7, height: side * 0.7)
                        .blur(radius: side * 0.12)
                        .offset(blobOffset(index: index, size: size))
                        .scaleEffect(animate ? 1.15 : 0.9)
                }

                // لمعان خفيف
                LinearGradient(
                    colors: [.white.opacity(colorScheme == .dark ? 0.03 : 0.25), .clear],
                    startPoint: .top,
                    endPoint: .center
                )
            }
            .frame(width: size.width, height: size.height)
        }
        .ignoresSafeArea()
        .onAppear {
            guard !reduceMotion else { return }
            withAnimation(.easeInOut(duration: 9).repeatForever(autoreverses: true)) {
                animate = true
            }
        }
        .accessibilityHidden(true)
    }

    private var baseColors: [Color] {
        colorScheme == .dark
            ? [Color(red: 0.05, green: 0.07, blue: 0.16), Color(red: 0.08, green: 0.04, blue: 0.14)]
            : [Color(red: 0.93, green: 0.97, blue: 1.0), Color(red: 1.0, green: 0.95, blue: 0.97)]
    }

    private func blobOffset(index: Int, size: CGSize) -> CGSize {
        let w = size.width, h = size.height
        let positions: [(CGFloat, CGFloat, CGFloat, CGFloat)] = [
            (-0.35, -0.3, -0.2, -0.38),
            (0.4, -0.1, 0.3, 0.05),
            (-0.25, 0.35, -0.4, 0.25),
            (0.35, 0.45, 0.2, 0.3)
        ]
        let p = positions[index % positions.count]
        return CGSize(
            width: w * (animate ? p.2 : p.0),
            height: h * (animate ? p.3 : p.1)
        )
    }
}

#Preview {
    LiquidBackground()
}
