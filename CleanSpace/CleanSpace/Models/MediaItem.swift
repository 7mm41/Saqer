//
//  MediaItem.swift
//  CleanSpace
//
//  A lightweight, value-type view over a PHAsset. We deliberately keep only the
//  stable `localIdentifier` and cheap metadata here so large collections can be
//  held in memory and moved between concurrency domains without carrying the
//  reference-type PHAsset (which is not Sendable). The real PHAsset is resolved
//  on demand via `PhotoLibraryService` when we need to render or delete it.
//

import Foundation
import Photos

struct MediaItem: Identifiable, Hashable, Sendable {
    /// PHAsset.localIdentifier — stable across launches, safe to persist.
    let id: String
    let mediaType: PHAssetMediaType
    let isScreenshot: Bool
    let pixelWidth: Int
    let pixelHeight: Int
    let creationDate: Date?
    let duration: TimeInterval
    /// Non-nil when the shot belongs to a burst sequence — an exact, free signal
    /// for grouping without any Vision work.
    let burstIdentifier: String?
    /// Byte size on disk. Resolved lazily and may be 0 until computed.
    var byteSize: Int64

    var pixelCount: Int { pixelWidth * pixelHeight }

    var isVideo: Bool { mediaType == .video }
    var aspectRatio: Double {
        guard pixelHeight > 0 else { return 1 }
        return Double(pixelWidth) / Double(pixelHeight)
    }

    init(asset: PHAsset, byteSize: Int64 = 0) {
        self.id = asset.localIdentifier
        self.mediaType = asset.mediaType
        self.isScreenshot = asset.mediaSubtypes.contains(.photoScreenshot)
        self.pixelWidth = asset.pixelWidth
        self.pixelHeight = asset.pixelHeight
        self.creationDate = asset.creationDate
        self.duration = asset.duration
        self.burstIdentifier = asset.burstIdentifier
        self.byteSize = byteSize
    }

    static func == (lhs: MediaItem, rhs: MediaItem) -> Bool { lhs.id == rhs.id }
    func hash(into hasher: inout Hasher) { hasher.combine(id) }
}
