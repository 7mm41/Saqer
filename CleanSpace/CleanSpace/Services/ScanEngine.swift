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
    private let batchSize = 50
    private let windowSeconds: TimeInterval = 20 * 60   // cluster window
    private let heavyVideoMinBytes: Int64 = 50 * 1_024 * 1_024
    private let screenshotAgeDays = 30

    private let library: PhotoLibraryService
    private let similarity: SimilarityEngine
    private var task: Task<Void, Never>?
    private var backgroundObserver: NSObjectProtocol?

    init(library: PhotoLibraryService = PhotoLibraryService()) {
        self.library = library
        self.similarity = SimilarityEngine(library: library)
        observeBackgrounding()
    }

    deinit {
        if let backgroundObserver {
            NotificationCenter.default.removeObserver(backgroundObserver)
        }
    }

    // MARK: - Public control

    func start() {
        guard !progress.isRunning else { return }
        task?.cancel()
        result = ScanResult()
        progress = ScanProgress(phase: .fetching)
        task = Task { [weak self] in
            await self?.run()
        }
    }

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
        backgroundObserver = NotificationCenter.default.addObserver(
            forName: UIApplication.didEnterBackgroundNotification,
            object: nil, queue: .main
        ) { [weak self] _ in
            // Vision work can't reliably continue in the background; pause cleanly
            // so the user can resume when they return.
            MainActor.assumeIsolated { self?.cancel() }
        }
        #endif
    }

    // MARK: - Pipeline

    private func run() async {
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
        progress.total = photos.count

        // 2. Separate exact bursts (free) from the Vision-analysis pool.
        let (burstGroups, singles) = splitBursts(photos)

        // 3. Feature-print + cluster the remaining photos in batches.
        await similarity.reset()
        var openGroups: [WorkingGroup] = []
        var finished: [WorkingGroup] = []

        var index = 0
        while index < singles.count {
            if Task.isCancelled { progress.phase = .cancelled; return }
            let end = min(index + batchSize, singles.count)
            for i in index..<end {
                let item = singles[i]
                let ok = await similarity.computeFeaturePrint(for: item.id)
                progress.processed = i + 1
                guard ok, let date = item.creationDate else {
                    // Un-analyzable photo becomes its own singleton (ignored later).
                    continue
                }
                // Close groups that fall outside the time window.
                let stillOpen = openGroups.filter {
                    guard let repDate = $0.representativeDate else { return true }
                    return abs(repDate.timeIntervalSince(date)) <= windowSeconds
                }
                finished.append(contentsOf: openGroups.filter { g in !stillOpen.contains { $0.id == g.id } })
                openGroups = stillOpen

                // Find the closest open group under the "similar" threshold.
                var bestGroupIndex: Int? = nil
                var bestDistance = Float.greatestFiniteMagnitude
                let thresholds = SimilarityEngine.Thresholds()
                for (gi, group) in openGroups.enumerated() {
                    if let d = await similarity.distance(group.representativeID, item.id),
                       d <= thresholds.similar, d < bestDistance {
                        bestDistance = d
                        bestGroupIndex = gi
                    }
                }
                if let gi = bestGroupIndex {
                    openGroups[gi].items.append(item)
                } else {
                    openGroups.append(WorkingGroup(representativeID: item.id,
                                                   representativeDate: date,
                                                   items: [item]))
                }
            }
            index = end
            await Task.yield()   // let the UI breathe between batches
        }
        finished.append(contentsOf: openGroups)

        if Task.isCancelled { progress.phase = .cancelled; return }

        // 4. Classify clusters, resolve sizes, pick heroes.
        progress.phase = .grouping
        var similarGroups: [SimilarGroup] = []
        var duplicateGroups: [SimilarGroup] = burstGroups

        for working in finished where working.items.count >= 2 {
            var items = working.items
            resolveSizes(&items)
            let heroID = heroID(of: items)
            let maxDistance = await maxDistanceFromRepresentative(working)
            let group = SimilarGroup(items: items, suggestedKeepID: heroID)
            if let maxDistance, maxDistance < SimilarityEngine.Thresholds().duplicate {
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

    private struct WorkingGroup: Identifiable {
        let id = UUID()
        let representativeID: String
        let representativeDate: Date?
        var items: [MediaItem]
    }

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

    private func maxDistanceFromRepresentative(_ group: WorkingGroup) async -> Float? {
        var maxD: Float = 0
        var found = false
        for item in group.items where item.id != group.representativeID {
            if let d = await similarity.distance(group.representativeID, item.id) {
                maxD = max(maxD, d); found = true
            }
        }
        return found ? maxD : nil
    }
}
