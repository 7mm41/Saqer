//
//  BinReviewView.swift
//  CleanSpace
//
//  Review & Execute. Nothing here is destructive until the user taps the button
//  and confirms iOS's own system sheet. Every deletion outcome is surfaced
//  honestly — including "you cancelled".
//

import SwiftUI

struct BinReviewView: View {
    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss
    @State private var model: BinViewModel?

    private let columns = [GridItem(.adaptive(minimum: 96), spacing: 8)]

    var body: some View {
        NavigationStack {
            Group {
                if env.bin.isEmpty {
                    EmptyStateView(
                        systemImage: "trash",
                        title: "Bin is empty",
                        message: "Photos you mark for deletion during triage will collect here for review."
                    )
                } else {
                    content
                }
            }
            .navigationTitle("Review")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Close") { dismiss() }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    if !env.bin.isEmpty {
                        Button("Empty", role: .destructive) { env.bin.clearAll() }
                    }
                }
            }
            .onAppear {
                if model == nil {
                    model = BinViewModel(bin: env.bin, library: env.library)
                }
            }
            .overlay { resultOverlay }
        }
    }

    private var content: some View {
        VStack(spacing: 0) {
            ScrollView {
                LazyVGrid(columns: columns, spacing: 8) {
                    ForEach(env.bin.items, id: \.assetID) { record in
                        binCell(record)
                    }
                }
                .padding(12)
            }
            executeBar
        }
    }

    private func binCell(_ record: BinnedAssetRecord) -> some View {
        AsyncThumbnail(assetID: record.assetID,
                       targetSize: CGSize(width: 120, height: 120))
            .aspectRatio(1, contentMode: .fill)
            .frame(minHeight: 96)
            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            .overlay(alignment: .topTrailing) {
                Button {
                    withAnimation { env.bin.remove(record.assetID) }
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .font(.title3)
                        .foregroundStyle(.white, .black.opacity(0.5))
                        .padding(5)
                }
                .accessibilityLabel("Keep this photo")
            }
            .overlay(alignment: .bottomLeading) {
                Text(Format.bytes(record.byteSize))
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 5).padding(.vertical, 2)
                    .background(.black.opacity(0.45), in: Capsule())
                    .padding(5)
            }
    }

    private var executeBar: some View {
        VStack(spacing: 10) {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Ready to free up")
                        .font(.caption).foregroundStyle(.secondary)
                    Text(Format.bytes(env.bin.totalBytes))
                        .font(.title3.weight(.bold))
                        .contentTransition(.numericText())
                }
                Spacer()
                Text("\(env.bin.count) item\(env.bin.count == 1 ? "" : "s")")
                    .font(.subheadline).foregroundStyle(.secondary)
            }
            Button {
                Task { await model?.execute() }   // outcome handled by resultOverlay
            } label: {
                HStack {
                    if model?.isDeleting == true { ProgressView().tint(.white) }
                    Text(model?.isDeleting == true ? "Deleting…" : "Free Up Space")
                }
                .font(.headline)
                .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .tint(.red)
            .controlSize(.large)
            .disabled(model?.isDeleting == true)
            Text("iOS will ask you to confirm before anything is deleted.")
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
        .padding(16)
        .background(.bar)
    }

    @ViewBuilder
    private var resultOverlay: some View {
        if let state = model?.state {
            switch state {
            case .done(let freed, let count):
                ResultToast(icon: "checkmark.circle.fill", tint: .green,
                            title: "Freed \(Format.bytes(freed))",
                            message: "\(count) item\(count == 1 ? "" : "s") removed.") {
                    env.refreshStorage()
                    dismiss()
                }
            case .cancelled:
                ResultToast(icon: "hand.raised.fill", tint: .orange,
                            title: "Deletion cancelled",
                            message: "Your photos are untouched and still in the bin.") {
                    model?.resetState()
                }
            case .failed(let message):
                ResultToast(icon: "exclamationmark.triangle.fill", tint: .red,
                            title: "Couldn't delete", message: message) {
                    model?.resetState()
                }
            default:
                EmptyView()
            }
        }
    }
}

private struct ResultToast: View {
    let icon: String
    let tint: Color
    let title: String
    let message: String
    var onDismiss: () -> Void

    var body: some View {
        ZStack {
            Color.black.opacity(0.25).ignoresSafeArea()
            VStack(spacing: 12) {
                Image(systemName: icon).font(.system(size: 46)).foregroundStyle(tint)
                Text(title).font(.title3.weight(.bold))
                Text(message).font(.subheadline).foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                Button("OK", action: onDismiss)
                    .buttonStyle(.borderedProminent)
                    .controlSize(.large)
                    .padding(.top, 4)
            }
            .padding(28)
            .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 24))
            .padding(40)
        }
        .transition(.opacity)
    }
}
