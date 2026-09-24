//
//  DashboardView.swift
//  CleanSpace
//
//  The overview: storage ring (or live scan), reclaimable summary, and the
//  actionable category cards. Entry point to triage and the trash bin.
//

import SwiftUI

struct DashboardView: View {
    @Environment(AppEnvironment.self) private var env
    @State private var showBin = false
    @State private var showPaywall = false

    private var scan: ScanEngine { env.scanEngine }
    private var totalReclaimable: Int64 {
        ScanCategory.allCases.reduce(0) { $0 + scan.result.reclaimableBytes(for: $1) }
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 22) {
                    header

                    if scan.progress.isRunning {
                        ScanProgressView(progress: scan.progress) { scan.cancel() }
                            .padding(.horizontal)
                    } else {
                        StorageRingView(storage: env.storage, reclaimable: totalReclaimable)
                        if !env.store.isPro { proBanner }
                        categorySection
                    }
                }
                .padding(.vertical, 8)
                .animation(.smooth, value: scan.progress.phase)
            }
            .background(Color(.systemGroupedBackground))
            .navigationTitle("CleanSpace")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { toolbarContent }
            .navigationDestination(for: ScanCategory.self) { category in
                TriageHostView(category: category)
            }
            .sheet(isPresented: $showBin) {
                BinReviewView()
            }
            .sheet(isPresented: $showPaywall) {
                PaywallView()
            }
            .onAppear {
                env.refreshStorage()
                if env.permissions.isAuthorized {
                    scan.startOrResume()   // start if idle, resume if paused
                }
            }
        }
    }

    // MARK: Header

    private var header: some View {
        VStack(spacing: 8) {
            if scan.progress.phase == .cancelled {
                Button { scan.resume() } label: {
                    Label("Resume scan", systemImage: "play.circle.fill")
                        .font(.subheadline.weight(.semibold))
                }
                .buttonStyle(.bordered)
                .tint(.indigo)
            }
        }
    }

    // MARK: Pro banner

    private var proBanner: some View {
        Button {
            showPaywall = true
        } label: {
            HStack(spacing: 14) {
                Image(systemName: "sparkles")
                    .font(.title2)
                    .foregroundStyle(.white)
                    .frame(width: 44, height: 44)
                    .background(
                        LinearGradient(colors: [.indigo, .purple],
                                       startPoint: .topLeading, endPoint: .bottomTrailing),
                        in: RoundedRectangle(cornerRadius: 12, style: .continuous)
                    )
                VStack(alignment: .leading, spacing: 2) {
                    Text("Go Pro — unlimited cleanups")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(.primary)
                    Text("Remove the \(StoreService.freeDeleteLimit)-photo limit · \(env.store.priceText)/mo")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Spacer()
                Image(systemName: "chevron.right")
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(.tertiary)
            }
            .padding(14)
            .background(Color(.secondarySystemGroupedBackground),
                        in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        }
        .buttonStyle(.plain)
        .padding(.horizontal)
    }

    // MARK: Categories

    @ViewBuilder
    private var categorySection: some View {
        if scan.progress.phase == .finished && scan.result.isEmpty {
            EmptyStateView(
                systemImage: "checkmark.seal",
                title: "You're all clean",
                message: "CleanSpace didn't find any obvious clutter. Great job keeping your library tidy!"
            )
            .frame(minHeight: 260)
        } else {
            VStack(spacing: 12) {
                ForEach(ScanCategory.allCases) { category in
                    let count = scan.result.count(for: category)
                    NavigationLink(value: category) {
                        CategoryCard(
                            category: category,
                            count: count,
                            reclaimable: scan.result.reclaimableBytes(for: category)
                        )
                    }
                    .buttonStyle(.plain)
                    .disabled(count == 0)
                }
            }
            .padding(.horizontal)
            .padding(.top, 4)
        }
    }

    // MARK: Toolbar

    @ToolbarContentBuilder
    private var toolbarContent: some ToolbarContent {
        ToolbarItem(placement: .topBarLeading) {
            Button {
                if !scan.progress.isRunning { scan.start() }
            } label: {
                Image(systemName: "arrow.clockwise")
            }
            .disabled(scan.progress.isRunning)
            .accessibilityLabel("Rescan")
        }
        ToolbarItem(placement: .topBarTrailing) {
            Button { showBin = true } label: {
                ZStack(alignment: .topTrailing) {
                    Image(systemName: "trash")
                    if env.bin.count > 0 {
                        Text("\(env.bin.count)")
                            .font(.system(size: 11, weight: .bold))
                            .foregroundStyle(.white)
                            .padding(4)
                            .background(.red, in: Circle())
                            .offset(x: 10, y: -10)
                    }
                }
            }
            .accessibilityLabel("Trash bin, \(env.bin.count) items")
        }
    }
}
