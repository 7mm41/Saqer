//
//  LessonCard.swift
//  ثقافة إسلامية
//
//  بطاقة الدرس التفاعلي في الشريط الأفقي بالشاشة الرئيسية.
//

import SwiftUI

struct LessonCard: View {
    let lesson: InteractiveLesson
    var isCompleted: Bool
    var isWide: Bool = false

    private var colors: [Color] { lesson.colors.themeColors }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            ZStack(alignment: .topLeading) {
                IllustrationView(imageName: lesson.imageName, symbol: lesson.symbol, colors: [.white, .white.opacity(0.8)],
                                 symbolSize: 44, cornerRadius: 20)
                    .frame(maxWidth: .infinity)
                    .frame(height: isWide ? 150 : 120)

                if isCompleted {
                    Image(systemName: "checkmark.seal.fill")
                        .font(.title2)
                        .foregroundStyle(.white, .green)
                        .transition(.scale.combined(with: .opacity))
                }
            }

            Text(lesson.title)
                .font(.title3.weight(.heavy))
                .foregroundStyle(.white)

            Text(lesson.subtitle)
                .font(.caption.weight(.medium))
                .foregroundStyle(.white.opacity(0.9))
                .lineLimit(2)
                .multilineTextAlignment(.leading)

            HStack(spacing: 6) {
                Image(systemName: "rectangle.stack.fill")
                Text("\(lesson.steps.count.arabicDigits) خطوة")
                Spacer()
                Image(systemName: "play.circle.fill").font(.title2)
            }
            .font(.caption.weight(.bold))
            .foregroundStyle(.white)
        }
        .padding(16)
        .frame(width: isWide ? 250 : 190, height: isWide ? 290 : 250, alignment: .topLeading)
        .background(
            LinearGradient.diagonal(colors.map { $0.opacity(0.85) }),
            in: RoundedRectangle(cornerRadius: 30, style: .continuous)
        )
        .glassCard(cornerRadius: 30, tint: colors.first ?? .teal, interactive: true)
        .shadow(color: (colors.first ?? .teal).opacity(0.35), radius: 18, y: 10)
        .accessibilityElement(children: .combine)
        .accessibilityHint("ابدأ الدرس التفاعلي")
    }
}
