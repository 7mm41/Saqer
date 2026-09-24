//
//  ScanEngine.swift
//  CleanSpace
//
//  Orchestrates a full library scan: fetch → analyze (feature prints) → cluster.
//  It is @MainActor/@Observable so views bind directly to `progress` and
//  `result`, while all heavy lifting is dispatched to background tasks and the
//  `SimilarityEngine` actor. The scan is fully cancellable and pauses itself when
//  the app is backgrounded.
//

import Foundation
import Photos
import Observation
#if canImport(UIKit)
import UIKit
#endif

@MainActor
@Observable
final class ScanEngine {

    // Bound by the UI.
    private(set) var progress = ScanProgress()
    private(set) var result = ScanResult()

    // Tuning.
    private let windowSeconds: TimeInterval = 20 * 60   // cluster window
    private let heavyVideoMinBytes: Int64 = 50 * 1_024 * 1_024
    private let screenshotAgeDays = 30

    private let library: PhotoLibraryService
    private let similarity: SimilarityEngine
    private var task: Task<Void, Never>?

    init(library: PhotoLibraryService = PhotoLibraryService()) {
        self.library = library
        self.similarity = SimilarityEngine(library: library)
        observeBackgrounding()
    }

    // No deinit cleanup needed: ScanEngine lives for the app's lifetime and the
    // observer captures `self` weakly, so there is no retain cycle or dangling
    // callback to tear down.

    // MARK: - Public control

    /// Starts a fresh scan (clears any prior results and cached prints).
    func start() {
        guard !progress.isRunning else { return }
        result = ScanResult()
        progress = ScanProgress(phase: .fetching)
        startTask(resuming: false)
    }

    /// Continues a scan that was paused (e.g., by backgrounding) — it keeps the
    /// feature prints already computed and picks up where it left off instead of
    /// restarting from zero. Safe to call when nothing is paused (no-op).
    func resume() {
        guard !progress.isRunning else { return }
        guard progress.phase == .cancelled else { return }
        progress.phase = .fetching
        startTask(resuming: true)
    }

    /// Resumes a paused scan, or starts a new one if none is in progress.
    func startOrResume() {
        if progress.phase == .cancelled { resume() }
        else if progress.phase == .idle { start() }
    }

    private func startTask(resuming: Bool) {
        task?.cancel()
        task = Task { [weak self] in
            await self?.run(resuming: resuming)
        }
    }

    /// Pauses an in-progress scan, keeping computed prints so it can resume.
    func cancel() {
        task?.cancel()
        task = nil
        if progress.isRunning {
            progress.phase = .cancelled
        }
    }

    // MARK: - Backgrounding

    private func observeBackgrounding() {
        #if canImport(UIKit)
        NotificationCenter.default.addObserver(
            forName: UIApplication.didEnterBackgroundNotification,
            object: nil, queue: .main
        ) { [weak self] _ in
            // Vision work can't reliably continue in the background; pause cleanly
            // so the user can resume when they return. Hop to the main actor
            // instead of assuming isolation, which is robust regardless of the
            // delivery thread.
            Task { @MainActor in self?.cancel() }
        }
        #endif
    }

    // MARK: - Pipeline

    private func run(resuming: Bool) async {
        // 1. Fetch — off the main actor.
        let photos = await Task.detached(priority: .userInitiated) { [library] in
            library.fetchPhotosChronologically()
        }.value

        if Task.isCancelled { progress.phase = .cancelled; return }

        // Screenshots & heavy videos are independent, cheap category passes that
        // run concurrently with the Vision analysis below.
        let screenshotsTask = Task.detached(priority: .utility) { [library, screenshotAgeDays] in
            library.fetchScreenshots(olderThan: screenshotAgeDays)
        }
        let videosTask = Task.detached(priority: .utility) { [library, heavyVideoMinBytes] in
            library.fetchHeavyVideos(minBytes: heavyVideoMinBytes)
        }

        progress.phase = .analyzing

        // 2. Separate exact bursts (free) from the Vision-analysis pool.
        let (burstGroups, singles) = splitBursts(photos)
        let ids = singles.map(\.id)
        let dates = singles.map(\.creationDate)
        progress.total = ids.count

        // 3. Feature-print the pool CONCURRENTLY across cores (the expensive part).
        //    On resume we KEEP the cached prints and only compute what's missing.
        if !resuming { await similarity.reset() }
        let concurrency = min(6, max(2, ProcessInfo.processInfo.activeProcessorCount))
        await similarity.computeFeaturePrints(for: ids, concurrency: concurrency) { [weak self] done in
            self?.progress.processed = done
        }

        if Task.isCancelled { progress.phase = .cancelled; return }

        // 4. Cluster + classify in a single actor pass over the cached prints.
        progress.phase = .grouping
        let clusters = await similarity.clusterSimilar(
            ids: ids, dates: dates, windowSeconds: windowSeconds, thresholds: SimilarityEngine.Thresholds()
        )

        // Reset the running tallies — clusters are recomputed fresh each pass.
        progress.similarFound = 0
        progress.reclaimableBytes = 0
        var similarGroups: [SimilarGroup] = []
        var duplicateGroups: [SimilarGroup] = burstGroups
        for cluster in clusters {
            var items = cluster.indices.map { singles[$0] }
            resolveSizes(&items)
            let group = SimilarGroup(items: items, suggestedKeepID: heroID(of: items))
            if cluster.isDuplicate {
                duplicateGroups.append(group)
            } else {
                similarGroups.append(group)
            }
            progress.similarFound += group.count - 1
            progress.reclaimableBytes += group.reclaimableBytes
        }

        // 5. Publish.
        let screenshots = await screenshotsTask.value
        let videos = await videosTask.value
        result = ScanResult(
            similarGroups: similarGroups.sorted { $0.reclaimableBytes > $1.reclaimableBytes },
            duplicateGroups: duplicateGroups.sorted { $0.reclaimableBytes > $1.reclaimableBytes },
            screenshots: screenshots,
            heavyVideos: videos,
            scannedAt: .now
        )
        progress.phase = .finished
        HapticsManager.shared.success()
    }

    // MARK: - Helpers

    /// Groups shots sharing a burstIdentifier; returns the multi-photo burst
    /// groups and the leftover singles for Vision analysis.
    private func splitBursts(_ photos: [MediaItem]) -> (bursts: [SimilarGroup], singles: [MediaItem]) {
        var byBurst: [String: [MediaItem]] = [:]
        var singles: [MediaItem] = []
        for p in photos {
            if let bid = p.burstIdentifier {
                byBurst[bid, default: []].append(p)
            } else {
                singles.append(p)
            }
        }
        var groups: [SimilarGroup] = []
        for (_, var members) in byBurst where members.count >= 2 {
            resolveSizes(&members)
            groups.append(SimilarGroup(items: members.sorted { ($0.creationDate ?? .distantPast) < ($1.creationDate ?? .distantPast) },
                                       suggestedKeepID: heroID(of: members)))
        }
        // Bursts of one collapse back to singles.
        for (_, members) in byBurst where members.count < 2 { singles.append(contentsOf: members) }
        return (groups, singles.sorted { ($0.creationDate ?? .distantPast) < ($1.creationDate ?? .distantPast) })
    }

    private func resolveSizes(_ items: inout [MediaItem]) {
        for i in items.indices where items[i].byteSize == 0 {
            if let asset = library.asset(for: items[i].id) {
                items[i].byteSize = library.fileSize(for: asset)
            }
        }
    }

    /// The "best" photo to keep: highest resolution, then largest file.
    private func heroID(of items: [MediaItem]) -> String? {
        items.max {
            ($0.pixelCount, $0.byteSize) < ($1.pixelCount, $1.byteSize)
        }?.id
    }
}
