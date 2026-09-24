//
//  StorageRingView.swift
//  CleanSpace
//
//  The prominent storage ring: total capacity, used space, and the slice
//  attributable to media, with free space called out in the center.
//

import SwiftUI

struct StorageRingView: View {
    let storage: StorageInfo
    var reclaimable: Int64 = 0

    @State private var animate = false

    private var usedFraction: Double { animate ? storage.usedFraction : 0 }
    private var mediaFraction: Double { animate ? storage.mediaFraction : 0 }

    var body: some View {
        ZStack {
            Circle()
                .stroke(Color(.systemGray5), lineWidth: 22)

            // Used (everything on the device).
            Circle()
                .trim(from: 0, to: usedFraction)
                .stroke(Color(.systemGray2), style: .init(lineWidth: 22, lineCap: .round))
                .rotationEffect(.degrees(-90))

            // Media portion, drawn on top so it reads as a highlighted slice.
            Circle()
                .trim(from: 0, to: mediaFraction)
                .stroke(
                    LinearGradient(colors: [.indigo, .purple],
                                   startPoint: .topLeading, endPoint: .bottomTrailing),
                    style: .init(lineWidth: 22, lineCap: .round)
                )
                .rotationEffect(.degrees(-90))
                .shadow(color: .indigo.opacity(0.35), radius: 6, y: 2)

            VStack(spacing: 2) {
                Text(Format.bytes(storage.freeBytes))
                    .font(.system(size: 34, weight: .bold, design: .rounded))
                    .contentTransition(.numericText())
                Text("free of \(Format.bytes(storage.totalBytes))")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                if reclaimable > 0 {
                    Text("↓ \(Format.bytes(reclaimable)) to save")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.indigo)
                        .padding(.top, 4)
                }
            }
        }
        .frame(width: 220, height: 220)
        .padding(.vertical, 6)
        .onAppear {
            withAnimation(.easeOut(duration: 0.9)) { animate = true }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Storage")
        .accessibilityValue("\(Format.bytes(storage.freeBytes)) free of \(Format.bytes(storage.totalBytes)). Media uses \(Format.bytes(storage.mediaBytes)).")
    }
}
