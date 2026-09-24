//
//  StorageInfo.swift
//  CleanSpace
//
//  Device volume capacity plus the portion attributable to the photo library.
//

import Foundation

struct StorageInfo: Equatable, Sendable {
    var totalBytes: Int64 = 0
    var freeBytes: Int64 = 0
    /// Bytes occupied by the user's photos and videos (best-effort estimate).
    var mediaBytes: Int64 = 0

    var usedBytes: Int64 { max(0, totalBytes - freeBytes) }

    var usedFraction: Double {
        guard totalBytes > 0 else { return 0 }
        return min(1, Double(usedBytes) / Double(totalBytes))
    }

    var mediaFraction: Double {
        guard totalBytes > 0 else { return 0 }
        return min(1, Double(mediaBytes) / Double(totalBytes))
    }
}
