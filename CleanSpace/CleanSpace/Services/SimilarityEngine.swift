//
//  SimilarityEngine.swift
//  CleanSpace
//
//  Wraps Vision's `VNGenerateImageFeaturePrintRequest`. Feature prints are
//  reference types; they are immutable once produced, so we move them between
//  tasks inside a small @unchecked Sendable box and cache them on the actor.
//
//  PERFORMANCE: feature-print generation (image decode + Vision) is the whole
//  cost of a scan, so it now runs CONCURRENTLY across cores with bounded
//  in-flight work (≈ processor count). Clustering then runs in a single actor
//  call over the cached prints — no per-comparison actor hops. Together this
//  roughly halves wall-clock scan time on multi-core devices versus the old
//  one-at-a-time pipeline.
//
//  Distance guide (empirical, tune on-device):
//    < 0.12  duplicate / burst frame     < 0.35  visually "similar"     > 0.6 unrelated
//

import Foundation
import Photos
import Vision
#if canImport(UIKit)
import UIKit
#endif

actor SimilarityEngine {

    struct Thresholds {
        var similar: Float = 0.35
        var duplicate: Float = 0.12
    }

    /// Immutable feature print, safe to hand between tasks.
    struct FeaturePrintBox: @unchecked Sendable {
        let observation: VNFeaturePrintObservation
    }

    /// One discovered cluster, expressed as indices into the input array.
    struct Cluster: Sendable {
        var indices: [Int]
        var isDuplicate: Bool
    }

    private let library: PhotoLibraryService
    private let analysisSize = CGSize(width: 256, height: 256)
    private var prints: [String: VNFeaturePrintObservation] = [:]

    init(library: PhotoLibraryService) {
        self.library = library
    }

    func reset() {
        prints.removeAll(keepingCapacity: false)
    }

    func hasFeaturePrint(for id: String) -> Bool { prints[id] != nil }

    // MARK: - Parallel feature-print computation

    /// Computes feature prints for `ids` concurrently, keeping at most
    /// `concurrency` requests in flight. `onProgress` (main-actor) is called with
    /// the running completed count. Honors cancellation of the calling task.
    func computeFeaturePrints(
        for ids: [String],
        concurrency: Int,
        onProgress: @escaping @MainActor (Int) -> Void
    ) async {
        // Resume-friendly: only compute prints we don't already have. Already
        // cached ones count as done immediately, so a resumed scan continues from
        // where it paused instead of starting over.
        let missing = ids.filter { prints[$0] == nil }
        var completed = ids.count - missing.count
        await onProgress(completed)
        guard !missing.isEmpty else { return }

        let lib = library
        let size = analysisSize
        let limit = max(1, concurrency)
        var next = 0

        await withTaskGroup(of: (String, FeaturePrintBox?).self) { group in
            // Prime the pipeline.
            while next < missing.count && next < limit {
                let id = missing[next]; next += 1
                group.addTask { (id, await Self.makeFeaturePrint(id: id, library: lib, targetSize: size)) }
            }
            while let (id, box) = await group.next() {
                if let box { prints[id] = box.observation }
                completed += 1
                await onProgress(completed)

                if Task.isCancelled {
                    group.cancelAll()
                    continue   // drain remaining without scheduling more
                }
                if next < missing.count {
                    let nextID = missing[next]; next += 1
                    group.addTask { (nextID, await Self.makeFeaturePrint(id: nextID, library: lib, targetSize: size)) }
                }
            }
        }
    }

    // MARK: - Clustering (single actor call, no per-comparison hops)

    /// Sliding-window clustering over already-computed prints. `ids`/`dates` are
    /// ordered (oldest→newest). Returns clusters of size ≥ 2 with a duplicate flag.
    func clusterSimilar(
        ids: [String],
        dates: [Date?],
        windowSeconds: Double,
        thresholds: Thresholds
    ) -> [Cluster] {
        struct Open { let repIndex: Int; let repID: String; let repDate: Date?; var members: [Int] }
        var open: [Open] = []
        var finished: [Open] = []

        for i in ids.indices {
            let id = ids[i]
            guard prints[id] != nil else { continue }
            let date = dates[i]

            if let date {
                var stillOpen: [Open] = []
                stillOpen.reserveCapacity(open.count)
                for g in open {
                    if let rd = g.repDate, abs(rd.timeIntervalSince(date)) > windowSeconds {
                        finished.append(g)
                    } else {
                        stillOpen.append(g)
                    }
                }
                open = stillOpen
            }

            var best = -1
            var bestD = Float.greatestFiniteMagnitude
            for (gi, g) in open.enumerated() {
                if let d = distanceBetween(g.repID, id), d <= thresholds.similar, d < bestD {
                    bestD = d; best = gi
                }
            }
            if best >= 0 {
                open[best].members.append(i)
            } else {
                open.append(Open(repIndex: i, repID: id, repDate: date, members: [i]))
            }
        }
        finished.append(contentsOf: open)

        var clusters: [Cluster] = []
        for g in finished where g.members.count >= 2 {
            var maxD: Float = 0
            for m in g.members where m != g.repIndex {
                if let d = distanceBetween(g.repID, ids[m]) { maxD = max(maxD, d) }
            }
            clusters.append(Cluster(indices: g.members, isDuplicate: maxD < thresholds.duplicate))
        }
        return clusters
    }

    /// Distance between two cached prints (nil if either is missing).
    func distance(_ a: String, _ b: String) -> Float? { distanceBetween(a, b) }

    private func distanceBetween(_ a: String, _ b: String) -> Float? {
        guard let pa = prints[a], let pb = prints[b] else { return nil }
        var value = Float(0)
        do { try pa.computeDistance(&value, to: pb); return value }
        catch { return nil }
    }

    // MARK: - Vision + image loading (nonisolated, run in parallel)

    nonisolated static func makeFeaturePrint(
        id: String, library: PhotoLibraryService, targetSize: CGSize
    ) async -> FeaturePrintBox? {
        if Task.isCancelled { return nil }
        guard let cgImage = await loadCGImage(id: id, library: library, targetSize: targetSize) else { return nil }
        // Run the blocking Vision request on a GCD queue so it never starves the
        // Swift cooperative thread pool (which the actor + continuations share).
        return await withCheckedContinuation { (continuation: CheckedContinuation<FeaturePrintBox?, Never>) in
            DispatchQueue.global(qos: .userInitiated).async {
                let request = VNGenerateImageFeaturePrintRequest()
                request.imageCropAndScaleOption = .centerCrop
                let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
                do {
                    try handler.perform([request])
                    let obs = request.results?.first as? VNFeaturePrintObservation
                    continuation.resume(returning: obs.map { FeaturePrintBox(observation: $0) })
                } catch {
                    continuation.resume(returning: nil)
                }
            }
        }
    }

    private nonisolated static func loadCGImage(
        id: String, library: PhotoLibraryService, targetSize: CGSize
    ) async -> CGImage? {
        guard let asset = library.asset(for: id) else { return nil }
        let options = PHImageRequestOptions()
        // .fastFormat returns the best LOCAL representation in a single callback —
        // it never blocks on iCloud (which, with network disabled, could hang a
        // .highQualityFormat request forever) and is plenty for 256px prints.
        options.deliveryMode = .fastFormat
        options.resizeMode = .fast
        options.isNetworkAccessAllowed = false
        options.isSynchronous = false

        let image: UIImage? = await withCheckedContinuation { continuation in
            PHImageManager.default().requestImage(
                for: asset,
                targetSize: targetSize,
                contentMode: .aspectFit,
                options: options
            ) { image, _ in
                continuation.resume(returning: image)
            }
        }
        return image?.cgImage
    }
}
