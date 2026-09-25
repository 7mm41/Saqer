//
//  ConfettiView.swift
//  ثقافة إسلامية
//
//  احتفال بسيط بنجوم وقطع ملوّنة متطايرة عند إتمام درس أو مسألة.
//

import SwiftUI

struct ConfettiView: View {
    var colors: [Color] = [.yellow, .pink, .teal, .indigo, .orange, .mint]
    var count: Int = 36

    @State private var launched = false

    var body: some View {
        GeometryReader { proxy in
            ZStack {
                ForEach(0..<count, id: \.self) { index in
                    piece(index)
                        .foregroundStyle(colors[index % colors.count])
                        .rotationEffect(.degrees(launched ? Double(index * 47 % 360) : 0))
                        .scaleEffect(launched ? 1 : 0.2)
                        .position(x: proxy.size.width / 2, y: proxy.size.height * 0.45)
                        .offset(offset(for: index, in: proxy.size))
                        .opacity(launched ? 0 : 1)
                }
            }
        }
        .allowsHitTesting(false)
        .onAppear {
            withAnimation(.easeOut(duration: 1.6)) { launched = true }
        }
        .accessibilityHidden(true)
    }

    @ViewBuilder
    private func piece(_ index: Int) -> some View {
        if index.isMultiple(of: 3) {
            Image(systemName: "star.fill").font(.system(size: 18))
        } else if index.isMultiple(of: 2) {
            Circle().frame(width: 10, height: 10)
        } else {
            RoundedRectangle(cornerRadius: 2).frame(width: 8, height: 14)
        }
    }

    private func offset(for index: Int, in size: CGSize) -> CGSize {
        guard launched else { return .zero }
        let angle = Double(index) / Double(count) * 2 * .pi
        let radius = Double(min(size.width, size.height)) * (0.35 + Double(index % 5) * 0.08)
        return CGSize(width: cos(angle) * radius, height: sin(angle) * radius + 120)
    }
}

#Preview {
    ConfettiView()
}
