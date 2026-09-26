//
//  LiquidBackground.swift
//  ثقافة إسلامية
//
//  خلفية «سائلة» ملوّنة خلف الزجاج:
//  - iOS 18+: تدرّج شبكي (MeshGradient) ينساب مرة واحدة عند الظهور ثم يثبت.
//  - iOS 17: بقع لونية ضبابية مرسومة مرة واحدة (drawingGroup).
//  الخلفية ثابتة بعد الظهور عمدًا: الحركة المستمرة خلف الزجاج تجبر النظام على إعادة حساب
//  التمويه في كل إطار، وكانت هي سبب التأخير الخفيف في التمرير.
//

import SwiftUI

struct LiquidBackground: View {
    var colors: [Color] = Color.liquidPalette

    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var settled = false

    var body: some View {
        content
            .ignoresSafeArea()
            .allowsHitTesting(false)
            .accessibilityHidden(true)
            .onAppear {
                guard !settled else { return }
                if reduceMotion { settled = true; return }
                withAnimation(.easeOut(duration: 2.4)) { settled = true }
            }
    }

    @ViewBuilder
    private var content: some View {
        #if compiler(>=6.0)
        if #available(iOS 18.0, *) {
            mesh
        } else {
            blobs
        }
        #else
        blobs
        #endif
    }

    private var palette: [Color] {
        let base = colors.isEmpty ? Color.liquidPalette : colors
        return (0..<4).map { base[$0 % base.count] }
    }

    private var paper: Color {
        colorScheme == .dark ? Color(red: 0.05, green: 0.06, blue: 0.13) : Color(red: 0.95, green: 0.97, blue: 1.0)
    }

    // MARK: Mesh (iOS 18+)

    #if compiler(>=6.0)
    @available(iOS 18.0, *)
    private var mesh: some View {
        let c = palette
        let strength = colorScheme == .dark ? 0.55 : 0.5
        let s: Float = settled ? 1 : 0
        let center = SIMD2<Float>(0.44 + 0.12 * s, 0.55 - 0.1 * s)
        return MeshGradient(
            width: 3, height: 3,
            points: [
                [0, 0], [0.5, 0], [1, 0],
                [0, 0.5], center, [1, 0.5],
                [0, 1], [0.5, 1], [1, 1]
            ],
            colors: [
                c[0].opacity(strength), paper, c[1].opacity(strength),
                paper, c[2].opacity(strength * 0.55), paper,
                c[3].opacity(strength), paper, c[0].opacity(strength * 0.8)
            ],
            smoothsColors: true
        )
        .background(paper)
    }
    #endif

    // MARK: Blobs (iOS 17)

    private var blobs: some View {
        GeometryReader { proxy in
            let size = proxy.size
            let side = max(size.width, size.height)
            ZStack {
                paper
                ForEach(0..<4, id: \.self) { index in
                    Circle()
                        .fill(palette[index].opacity(colorScheme == .dark ? 0.5 : 0.45))
                        .frame(width: side * 0.7, height: side * 0.7)
                        .offset(blobOffset(index: index, size: size))
                }
                .blur(radius: side * 0.12)
            }
            .frame(width: size.width, height: size.height)
            .drawingGroup()
        }
    }

    private func blobOffset(index: Int, size: CGSize) -> CGSize {
        let positions: [(CGFloat, CGFloat)] = [(-0.35, -0.32), (0.4, -0.08), (-0.3, 0.35), (0.35, 0.45)]
        let p = positions[index % positions.count]
        let drift: CGFloat = settled ? 1 : 0.85
        return CGSize(width: size.width * p.0 * drift, height: size.height * p.1 * drift)
    }
}

#Preview {
    LiquidBackground()
}
