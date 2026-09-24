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
                        toolsSection
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

    // MARK: Tools (contacts, etc.)

    private var toolsSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("More Tools")
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(.secondary)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 4)
            NavigationLink {
                ContactsCleanupView()
            } label: {
                HStack(spacing: 16) {
                    ZStack {
                        RoundedRectangle(cornerRadius: 14, style: .continuous)
                            .fill(Color.teal.opacity(0.16))
                        Image(systemName: "person.2.slash")
                            .font(.title2).foregroundStyle(.teal)
                    }
                    .frame(width: 52, height: 52)
                    VStack(alignment: .leading, spacing: 3) {
                        Text("Clean Duplicate Contacts").font(.headline)
                        Text("Find contacts that share a phone number")
                            .font(.caption).foregroundStyle(.secondary).lineLimit(1)
                    }
                    Spacer()
                    Image(systemName: "chevron.right")
                        .font(.footnote.weight(.semibold)).foregroundStyle(.tertiary)
                }
                .padding(14)
                .background(Color(.secondarySystemGroupedBackground),
                            in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal)
        .padding(.top, 8)
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
