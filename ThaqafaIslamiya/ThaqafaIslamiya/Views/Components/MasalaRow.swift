//
//  MasalaRow.swift
//  ثقافة إسلامية
//
//  صف زجاجي لمسألة واحدة (يُستخدم في القسم وفي نتائج البحث).
//

import SwiftUI

struct MasalaRow: View {
    let masala: Masala
    var number: Int? = nil
    var caption: String? = nil
    var colors: [Color]
    var isLearned: Bool

    var body: some View {
        HStack(spacing: 14) {
            ZStack {
                Circle()
                    .fill(LinearGradient.diagonal(colors))
                    .frame(width: 46, height: 46)
                if let number {
                    Text(number.digits)
                        .font(.headline.weight(.heavy))
                        .foregroundStyle(.white)
                } else {
                    Image(systemName: masala.symbol)
                        .foregroundStyle(.white)
                }
            }

            VStack(alignment: .leading, spacing: 4) {
                Text(masala.title)
                    .font(.headline)
                    .foregroundStyle(.primary)
                    .multilineTextAlignment(.leading)
                Text(caption ?? masala.summary)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)
            }

            Spacer(minLength: 4)

            if masala.lessonId != nil {
                Image(systemName: "play.rectangle.fill")
                    .foregroundStyle(colors.first ?? .teal)
                    .accessibilityLabel(L10n.t("masala.hasLesson"))
            }

            Image(systemName: isLearned ? "checkmark.circle.fill" : "chevron.forward")
                .font(isLearned ? .title3 : .footnote.weight(.bold))
                .foregroundStyle(isLearned ? AnyShapeStyle(Color.green) : AnyShapeStyle(.secondary))
                .contentTransition(.symbolEffect(.replace))
        }
        .padding(14)
        .glassCard(cornerRadius: 22, tint: colors.first ?? .teal, elevated: false)
        .accessibilityElement(children: .combine)
        .accessibilityValue(isLearned ? L10n.t("masala.learnedA11y") : "")
    }
}
