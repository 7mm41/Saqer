//
//  StorageService.swift
//  CleanSpace
//
//  Reads device volume capacity via URLResourceValues. `volumeAvailableCapacity
//  ForImportantUsage` is Apple's recommended "space you can actually reclaim"
//  figure and matches what Settings → General → iPhone Storage reports far more
//  closely than the raw free-capacity key.
//

import Foundation

enum StorageService {

    static func deviceCapacity() -> (total: Int64, free: Int64) {
        let url = URL(fileURLWithPath: NSHomeDirectory())
        var total: Int64 = 0
        var free: Int64 = 0
        do {
            let values = try url.resourceValues(forKeys: [
                .volumeTotalCapacityKey,
                .volumeAvailableCapacityForImportantUsageKey
            ])
            if let t = values.volumeTotalCapacity { total = Int64(t) }
            if let f = values.volumeAvailableCapacityForImportantUsage { free = f }
        } catch {
            // Fall back to the classic FileManager API if resource values fail.
            if let attrs = try? FileManager.default.attributesOfFileSystem(forPath: NSHomeDirectory()) {
                total = (attrs[.systemSize] as? NSNumber)?.int64Value ?? 0
                free = (attrs[.systemFreeSize] as? NSNumber)?.int64Value ?? 0
            }
        }
        return (total, free)
    }
}
