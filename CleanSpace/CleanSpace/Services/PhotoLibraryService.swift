//
//  PhotoLibraryService.swift
//  CleanSpace
//
//  All raw PhotoKit access lives here. Methods return Sendable value types
//  (`MediaItem`) rather than PHAsset so results can cross concurrency domains
//  freely. PHAssets are re-resolved from their stable localIdentifiers whenever
//  we actually need to render a thumbnail or delete.
//

import Foundation
import Photos

/// PhotoKit's fetch/image/resource managers are internally thread-safe, so this
/// type is safe to touch from background tasks.
final class PhotoLibraryService: @unchecked Sendable {

    // MARK: Fetching

    /// All images and videos, newest first. Video sizes are resolved eagerly
    /// (there are far fewer of them); photo sizes are resolved lazily by the
    /// scan engine to keep this call fast.
    func fetchAllMedia() -> [MediaItem] {
        let options = PHFetchOptions()
        options.sortDescriptors = [NSSortDescriptor(key: "creationDate", ascending: false)]
        options.includeHiddenAssets = false
        let result = PHAsset.fetchAssets(with: options)

        var items: [MediaItem] = []
        items.reserveCapacity(result.count)
        result.enumerateObjects { asset, _, _ in
            items.append(MediaItem(asset: asset))
        }
        return items
    }

    /// Images only, oldest → newest. The scan engine walks in this order so that
    /// temporally-adjacent shots (which are the most likely look-alikes) sit next
    /// to each other and clustering stays close to linear.
    func fetchPhotosChronologically() -> [MediaItem] {
        let options = PHFetchOptions()
        options.sortDescriptors = [NSSortDescriptor(key: "creationDate", ascending: true)]
        options.predicate = NSPredicate(format: "mediaType == %d", PHAssetMediaType.image.rawValue)
        options.includeHiddenAssets = false
        let result = PHAsset.fetchAssets(with: options)

        var items: [MediaItem] = []
        items.reserveCapacity(result.count)
        result.enumerateObjects { asset, _, _ in
            items.append(MediaItem(asset: asset))
        }
        return items
    }

    func fetchScreenshots(olderThan days: Int) -> [MediaItem] {
        let cutoff = Calendar.current.date(byAdding: .day, value: -days, to: .now) ?? .now
        let options = PHFetchOptions()
        options.sortDescriptors = [NSSortDescriptor(key: "creationDate", ascending: false)]
        // photoScreenshot is bit-flagged in mediaSubtypes.
        options.predicate = NSPredicate(
            format: "mediaSubtype & %d != 0 AND creationDate < %@",
            PHAssetMediaSubtype.photoScreenshot.rawValue, cutoff as NSDate
        )
        let result = PHAsset.fetchAssets(with: options)

        var items: [MediaItem] = []
        result.enumerateObjects { asset, _, _ in
            var item = MediaItem(asset: asset)
            item.byteSize = self.fileSize(for: asset)
            items.append(item)
        }
        return items
    }

    func fetchHeavyVideos(minBytes: Int64) -> [MediaItem] {
        let options = PHFetchOptions()
        options.sortDescriptors = [NSSortDescriptor(key: "creationDate", ascending: false)]
        options.predicate = NSPredicate(format: "mediaType == %d", PHAssetMediaType.video.rawValue)
        let result = PHAsset.fetchAssets(with: options)

        var items: [MediaItem] = []
        result.enumerateObjects { asset, _, _ in
            var item = MediaItem(asset: asset)
            item.byteSize = self.fileSize(for: asset)
            if item.byteSize >= minBytes { items.append(item) }
        }
        return items.sorted { $0.byteSize > $1.byteSize }
    }

    /// Best-effort total bytes used by all photos + videos. O(n) over the
    /// library and can take a moment on very large collections, so callers run it
    /// off the main actor and update the UI when it resolves.
    func totalMediaBytes(isCancelled: () -> Bool = { false }) -> Int64 {
        let result = PHAsset.fetchAssets(with: nil)
        var total: Int64 = 0
        var stop = false
        result.enumerateObjects { asset, _, stopPtr in
            if isCancelled() { stop = true; stopPtr.pointee = true; return }
            total += self.fileSize(for: asset)
        }
        _ = stop
        return total
    }

    // MARK: Resolving

    func asset(for id: String) -> PHAsset? {
        PHAsset.fetchAssets(withLocalIdentifiers: [id], options: nil).firstObject
    }

    func assets(for ids: [String]) -> [PHAsset] {
        guard !ids.isEmpty else { return [] }
        let result = PHAsset.fetchAssets(withLocalIdentifiers: ids, options: nil)
        var assets: [PHAsset] = []
        result.enumerateObjects { asset, _, _ in assets.append(asset) }
        return assets
    }

    // MARK: File size

    /// Sums the byte size of an asset's underlying resources. `fileSize` is an
    /// undocumented-but-stable PHAssetResource KVC key used throughout the
    /// ecosystem; we fall back to a pixel-based estimate if it's unavailable.
    func fileSize(for asset: PHAsset) -> Int64 {
        let resources = PHAssetResource.assetResources(for: asset)
        var total: Int64 = 0
        for resource in resources {
            if let size = resource.value(forKey: "fileSize") as? Int64 {
                total += size
            } else if let size = resource.value(forKey: "fileSize") as? Int {
                total += Int64(size)
            }
        }
        if total > 0 { return total }
        // Estimate: ~ pixels * bytes-per-pixel heuristic (photos ≈ 0.25 B/px JPEG).
        let pixels = Int64(asset.pixelWidth) * Int64(asset.pixelHeight)
        return asset.mediaType == .video
            ? Int64(asset.duration * 3_500_000) // ~3.5 MB/s rough HEVC estimate
            : max(50_000, pixels / 4)
    }

    // MARK: Deletion

    /// Requests deletion of the given assets. iOS *always* shows its own system
    /// confirmation sheet; if the user taps "Cancel" this throws
    /// `PHPhotosError.userCancelled`, which callers handle without treating it as
    /// a real failure.
    func delete(ids: [String]) async throws {
        let assets = assets(for: ids)
        guard !assets.isEmpty else { return }
        try await PHPhotoLibrary.shared().performChanges {
            PHAssetChangeRequest.deleteAssets(assets as NSArray)
        }
    }
}
