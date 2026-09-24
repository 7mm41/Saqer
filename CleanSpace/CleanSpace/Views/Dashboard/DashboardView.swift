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
            .onAppear {
                env.refreshStorage()
                if scan.progress.phase == .idle && env.permissions.isAuthorized {
                    scan.start()
                }
            }
        }
    }

    // MARK: Header

    private var header: some View {
        VStack(spacing: 6) {
            if scan.progress.phase == .cancelled {
                Label("Scan paused", systemImage: "pause.circle")
                    .font(.subheadline).foregroundStyle(.orange)
            }
        }
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
