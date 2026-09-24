//
//  CategoryCard.swift
//  CleanSpace
//

import SwiftUI

struct CategoryCard: View {
    let category: ScanCategory
    let count: Int
    let reclaimable: Int64

    var body: some View {
        HStack(spacing: 16) {
            ZStack {
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .fill(category.tint.opacity(0.16))
                Image(systemName: category.systemImage)
                    .font(.title2)
                    .foregroundStyle(category.tint)
            }
            .frame(width: 52, height: 52)

            VStack(alignment: .leading, spacing: 3) {
                Text(category.title).font(.headline)
                Text(category.subtitle)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }

            Spacer()

            VStack(alignment: .trailing, spacing: 3) {
                Text("\(count)")
                    .font(.title3.weight(.bold))
                    .monospacedDigit()
                if reclaimable > 0 {
                    Text(Format.bytes(reclaimable))
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(category.tint)
                }
            }
            Image(systemName: "chevron.right")
                .font(.footnote.weight(.semibold))
                .foregroundStyle(.tertiary)
        }
        .padding(14)
        .background(Color(.secondarySystemGroupedBackground),
                    in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .opacity(count == 0 ? 0.55 : 1)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(category.title), \(count) items, \(Format.bytes(reclaimable)) reclaimable")
    }
}
