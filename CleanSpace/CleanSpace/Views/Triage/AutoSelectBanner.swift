//
//  AutoSelectBanner.swift
//  CleanSpace
//

import SwiftUI

struct AutoSelectBanner: View {
    let othersCount: Int
    let reclaimable: Int64
    var onApply: () -> Void

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: "wand.and.stars")
                .font(.title3)
                .foregroundStyle(.indigo)
            VStack(alignment: .leading, spacing: 2) {
                Text("Smart pick ready")
                    .font(.subheadline.weight(.semibold))
                Text("Keep the best shot, bin \(othersCount) other\(othersCount == 1 ? "" : "s") · \(Format.bytes(reclaimable))")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer()
            Button("Apply", action: onApply)
                .font(.subheadline.weight(.bold))
                .buttonStyle(.borderedProminent)
                .controlSize(.small)
        }
        .padding(12)
        .background(.indigo.opacity(0.10), in: RoundedRectangle(cornerRadius: 16))
        .padding(.horizontal)
    }
}
