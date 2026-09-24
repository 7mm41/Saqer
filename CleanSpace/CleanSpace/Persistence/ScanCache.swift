//
//  ScanCache.swift
//  CleanSpace
//
//  SwiftData models for persisting *pointers* only — never image data. We keep a
//  summary of the last scan (so the dashboard can render instantly on relaunch)
//  and the contents of the trash bin (so a review-in-progress survives a restart).
//  The photos themselves always remain in the system Photo Library.
//

import Foundation
import SwiftData

@Model
final class BinnedAssetRecord {
    /// PHAsset.localIdentifier
    @Attribute(.unique) var assetID: String
    var byteSize: Int64
    var categoryRaw: String
    var addedAt: Date

    init(assetID: String, byteSize: Int64, category: ScanCategory, addedAt: Date = .now) {
        self.assetID = assetID
        self.byteSize = byteSize
        self.categoryRaw = category.rawValue
        self.addedAt = addedAt
    }

    var category: ScanCategory { ScanCategory(rawValue: categoryRaw) ?? .similar }
}

@Model
final class ScanSummaryRecord {
    var scannedAt: Date
    var similarCount: Int
    var screenshotCount: Int
    var heavyVideoCount: Int
    var duplicateCount: Int
    var reclaimableBytes: Int64

    init(scannedAt: Date = .now, similarCount: Int = 0, screenshotCount: Int = 0,
         heavyVideoCount: Int = 0, duplicateCount: Int = 0, reclaimableBytes: Int64 = 0) {
        self.scannedAt = scannedAt
        self.similarCount = similarCount
        self.screenshotCount = screenshotCount
        self.heavyVideoCount = heavyVideoCount
        self.duplicateCount = duplicateCount
        self.reclaimableBytes = reclaimableBytes
    }
}

enum CacheSchema {
    @MainActor
    static func container() -> ModelContainer {
        let schema = Schema([BinnedAssetRecord.self, ScanSummaryRecord.self])
        let config = ModelConfiguration(schema: schema, isStoredInMemoryOnly: false)
        do {
            return try ModelContainer(for: schema, configurations: [config])
        } catch {
            // If the on-disk store is incompatible (e.g., after a schema change in
            // development), fall back to an in-memory store so the app still runs.
            let fallback = ModelConfiguration(schema: schema, isStoredInMemoryOnly: true)
            return try! ModelContainer(for: schema, configurations: [fallback])
        }
    }
}
