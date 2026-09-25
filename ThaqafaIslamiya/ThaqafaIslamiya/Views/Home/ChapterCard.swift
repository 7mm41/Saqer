//
//  ChapterCard.swift
//  ثقافة إسلامية
//
//  بطاقة قسم زجاجية في شبكة الشاشة الرئيسية.
//

import SwiftUI

struct ChapterCard: View {
    let chapter: Chapter
    let progress: Double

    private var colors: [Color] { chapter.colors.themeColors }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top) {
                IllustrationView(imageName: chapter.imageName, symbol: chapter.symbol, colors: colors, symbolSize: 28)
                    .frame(width: 58, height: 58)
                Spacer()
                ProgressRing(progress: progress, colors: colors, lineWidth: 5)
                    .frame(width: 30, height: 30)
                    .overlay {
                        if progress >= 1 {
                            Image(systemName: "checkmark")
                                .font(.caption.weight(.heavy))
                                .foregroundStyle(colors.first ?? .teal)
                        }
                    }
            }

            Text(chapter.title)
                .font(.headline)
                .foregroundStyle(.primary)
                .lineLimit(2)
                .multilineTextAlignment(.leading)

            Text(chapter.subtitle)
                .font(.caption)
                .foregroundStyle(.secondary)
                .lineLimit(2)
                .multilineTextAlignment(.leading)

            Spacer(minLength: 0)

            Label("\(chapter.masail.count.arabicDigits) مسألة", systemImage: "list.bullet.rectangle.fill")
                .font(.caption.weight(.semibold))
                .foregroundStyle(colors.first ?? .teal)
        }
        .padding(16)
        .frame(maxWidth: .infinity, minHeight: 190, alignment: .topLeading)
        .background(alignment: .topTrailing) {
            // وهج لوني خلف الزجاج
            Circle()
                .fill(LinearGradient.diagonal(colors))
                .frame(width: 120, height: 120)
                .blur(radius: 40)
                .opacity(0.55)
                .offset(x: 30, y: -30)
        }
        .glassCard(cornerRadius: 26, tint: colors.first ?? .teal)
        .contentShape(RoundedRectangle(cornerRadius: 26, style: .continuous))
        .accessibilityElement(children: .combine)
        .accessibilityHint("افتح القسم")
    }
}
