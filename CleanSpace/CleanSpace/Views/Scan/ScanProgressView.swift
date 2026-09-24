//
//  ScanProgressView.swift
//  CleanSpace
//
//  Circular scan indicator with live statistics. Shown inline on the dashboard
//  while a scan runs.
//

import SwiftUI

struct ScanProgressView: View {
    let progress: ScanProgress
    var onCancel: () -> Void

    var body: some View {
        VStack(spacing: 18) {
            ZStack {
                Circle().stroke(Color(.systemGray5), lineWidth: 12)
                Circle()
                    .trim(from: 0, to: progress.fraction)
                    .stroke(
                        AngularGradient(colors: [.indigo, .purple, .indigo],
                                        center: .center),
                        style: .init(lineWidth: 12, lineCap: .round)
                    )
                    .rotationEffect(.degrees(-90))
                    .animation(.easeInOut, value: progress.fraction)
                VStack(spacing: 2) {
                    Text("\(Int(progress.fraction * 100))%")
                        .font(.system(size: 30, weight: .bold, design: .rounded))
                        .contentTransition(.numericText())
                    Text(progress.phase.label)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            .frame(width: 170, height: 170)

            HStack(spacing: 26) {
                stat(value: "\(progress.processed)/\(progress.total)", label: "Scanned")
                stat(value: "\(progress.similarFound)", label: "Look-alikes")
                stat(value: Format.bytes(progress.reclaimableBytes), label: "Reclaimable")
            }

            Button(role: .cancel, action: onCancel) {
                Label("Pause Scan", systemImage: "pause.fill")
            }
            .buttonStyle(.bordered)
            .controlSize(.regular)
        }
        .padding(.vertical, 10)
    }

    private func stat(value: String, label: String) -> some View {
        VStack(spacing: 3) {
            Text(value).font(.headline).monospacedDigit()
            Text(label).font(.caption2).foregroundStyle(.secondary)
        }
    }
}
