//
//  ProgressRing.swift
//  ثقافة إسلامية
//

import SwiftUI

struct ProgressRing: View {
    var progress: Double
    var colors: [Color] = [.teal, .indigo]
    var lineWidth: CGFloat = 8

    var body: some View {
        ZStack {
            Circle()
                .stroke(.white.opacity(0.35), lineWidth: lineWidth)
            Circle()
                .trim(from: 0, to: max(0.001, progress))
                .stroke(
                    AngularGradient(colors: colors + [colors.first ?? .teal], center: .center),
                    style: StrokeStyle(lineWidth: lineWidth, lineCap: .round)
                )
                .rotationEffect(.degrees(-90))
                .animation(.spring(response: 0.8, dampingFraction: 0.8), value: progress)
        }
    }
}

/// شريط تقدّم زجاجي أفقي.
struct GlassProgressBar: View {
    var progress: Double
    var colors: [Color]
    var height: CGFloat = 10

    var body: some View {
        GeometryReader { proxy in
            ZStack(alignment: .leading) {
                Capsule().fill(.white.opacity(0.3))
                Capsule()
                    .fill(LinearGradient(colors: colors, startPoint: .leading, endPoint: .trailing))
                    .frame(width: max(height, proxy.size.width * progress))
            }
        }
        .frame(height: height)
        .animation(.spring(response: 0.6, dampingFraction: 0.8), value: progress)
    }
}

#Preview {
    VStack(spacing: 30) {
        ProgressRing(progress: 0.65).frame(width: 80, height: 80)
        GlassProgressBar(progress: 0.4, colors: [.teal, .indigo])
    }
    .padding()
}
