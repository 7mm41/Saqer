//
//  TriageView.swift
//  CleanSpace
//
//  The interaction engine. Presents each similar-group as a swipeable card stack,
//  offers a one-tap "smart pick", and hands off to the bin when the category is
//  fully triaged.
//

import SwiftUI

struct TriageHostView: View {
    @Environment(AppEnvironment.self) private var env
    let category: ScanCategory
    @State private var model: TriageViewModel?

    var body: some View {
        Group {
            if let model {
                TriageView(model: model)
            } else {
                LoadingView(label: "Preparing…")
            }
        }
        .onAppear {
            if model == nil {
                model = TriageViewModel(
                    category: category,
                    groups: env.scanEngine.result.groups(for: category),
                    bin: env.bin,
                    preferences: env.preferences
                )
            }
        }
    }
}

struct TriageView: View {
    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss
    let model: TriageViewModel

    @State private var showBin = false

    var body: some View {
        VStack(spacing: 0) {
            if model.isFinished {
                completion
            } else {
                progressBar
                banner
                cardStack
                controls
            }
        }
        .navigationTitle(model.category.title)
        .navigationBarTitleDisplayMode(.inline)
        .background(Color(.systemGroupedBackground))
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button { showBin = true } label: {
                    Label("\(env.bin.count)", systemImage: "trash")
                        .font(.subheadline.weight(.semibold))
                }
            }
        }
        .sheet(isPresented: $showBin) { BinReviewView() }
    }

    // MARK: Progress

    private var progressBar: some View {
        VStack(spacing: 6) {
            HStack {
                Text("Group \(min(model.groupIndex + 1, model.totalGroups)) of \(model.totalGroups)")
                    .font(.footnote.weight(.medium))
                Spacer()
                if let group = model.currentGroup {
                    Text("\(group.count) photos")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
            }
            ProgressView(value: Double(model.groupIndex), total: Double(max(1, model.totalGroups)))
                .tint(.indigo)
        }
        .padding(.horizontal)
        .padding(.top, 8)
    }

    // MARK: Smart pick

    @ViewBuilder
    private var banner: some View {
        if env.preferences.autoSelectEnabled,
           let group = model.currentGroup,
           group.count > 1,
           model.suggestedKeepID != nil {
            AutoSelectBanner(
                othersCount: group.count - 1,
                reclaimable: group.reclaimableBytes,
                onApply: { withAnimation(.smooth) { model.autoSelectCurrentGroup() } }
            )
            .padding(.top, 10)
        }
    }

    // MARK: Cards

    private var cardStack: some View {
        let cards = model.remainingCards
        return ZStack {
            if cards.isEmpty {
                LoadingView(label: "Loading group…")
            } else {
                ForEach(Array(cards.prefix(3).enumerated()).reversed(), id: \.element.id) { index, item in
                    SwipeCardView(
                        item: item,
                        isSuggestedKeep: item.id == model.suggestedKeepID,
                        isTop: index == 0,
                        onDecision: { keep in decide(item, keep: keep) }
                    )
                    .scaleEffect(1 - CGFloat(index) * 0.04)
                    .offset(y: CGFloat(index) * 12)
                    .allowsHitTesting(index == 0)
                    .zIndex(Double(3 - index))
                    .transition(.asymmetric(
                        insertion: .opacity,
                        removal: .scale(scale: 0.9).combined(with: .opacity))
                    )
                }
            }
        }
        .padding(.horizontal, 24)
        .padding(.vertical, 16)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    // MARK: Controls

    private var controls: some View {
        HStack(spacing: 40) {
            circleButton(system: "trash.fill", tint: .red, label: "Delete") {
                if let top = model.remainingCards.first { decide(top, keep: false) }
            }
            circleButton(system: "arrow.uturn.backward", tint: .secondary, label: "Skip", size: 52) {
                withAnimation(.smooth) { model.skipGroup() }
            }
            circleButton(system: "checkmark", tint: .green, label: "Keep") {
                if let top = model.remainingCards.first { decide(top, keep: true) }
            }
        }
        .padding(.bottom, 20)
        .padding(.top, 6)
    }

    private func circleButton(system: String, tint: Color, label: String,
                              size: CGFloat = 66, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            VStack(spacing: 6) {
                Image(systemName: system)
                    .font(.system(size: size * 0.4, weight: .bold))
                    .foregroundStyle(tint)
                    .frame(width: size, height: size)
                    .background(Color(.secondarySystemGroupedBackground), in: Circle())
                    .overlay(Circle().stroke(tint.opacity(0.3), lineWidth: 1))
                Text(label).font(.caption2).foregroundStyle(.secondary)
            }
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
    }

    private func decide(_ item: MediaItem, keep: Bool) {
        withAnimation(.smooth) {
            keep ? model.keep(item) : model.bin(item)
        }
    }

    // MARK: Completion

    private var completion: some View {
        VStack(spacing: 18) {
            Spacer()
            Image(systemName: "checkmark.circle.fill")
                .font(.system(size: 64))
                .foregroundStyle(.green)
            Text("Category triaged")
                .font(.title2.weight(.bold))
            Text(env.bin.count > 0
                 ? "\(env.bin.count) photo\(env.bin.count == 1 ? "" : "s") are waiting in the bin — \(Format.bytes(env.bin.totalBytes)) ready to free."
                 : "You kept everything in this category.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 40)
            Spacer()
            VStack(spacing: 12) {
                if env.bin.count > 0 {
                    Button {
                        showBin = true
                    } label: {
                        Label("Review Bin", systemImage: "trash")
                            .font(.headline).frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                    .controlSize(.large)
                }
                Button("Back to Dashboard") { dismiss() }
                    .buttonStyle(.bordered)
                    .controlSize(.large)
            }
            .padding(.horizontal, 28)
            .padding(.bottom, 34)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}
