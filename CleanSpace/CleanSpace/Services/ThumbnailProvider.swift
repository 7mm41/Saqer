//
//  ThumbnailProvider.swift
//  CleanSpace
//
//  Loads downscaled thumbnails for the grid and triage UI. We never pull
//  full-resolution images into memory — every request is bounded by `targetSize`
//  and results are memory-cached (and evicted automatically under pressure).
//

import Foundation
import Photos
#if canImport(UIKit)
import UIKit
typealias PlatformImage = UIImage
#endif

actor ThumbnailProvider {
    static let shared = ThumbnailProvider()

    private let manager = PHCachingImageManager()
    private let cache = NSCache<NSString, PlatformImage>()
    private let library = PhotoLibraryService()

    init() {
        cache.countLimit = 400
    }

    private func key(_ id: String, _ size: CGSize) -> NSString {
        "\(id)@\(Int(size.width))x\(Int(size.height))" as NSString
    }

    func thumbnail(for id: String, targetSize: CGSize) async -> PlatformImage? {
        let cacheKey = key(id, targetSize)
        if let cached = cache.object(forKey: cacheKey) { return cached }
        guard let asset = library.asset(for: id) else { return nil }

        let options = PHImageRequestOptions()
        options.deliveryMode = .highQualityFormat   // single callback, no flicker
        options.resizeMode = .fast
        options.isNetworkAccessAllowed = false       // 100% on-device, never iCloud
        options.isSynchronous = false

        let scale = await MainActor.run { UIScreen.main.scale }
        let pixelSize = CGSize(width: targetSize.width * scale,
                               height: targetSize.height * scale)

        let image: PlatformImage? = await withCheckedContinuation { continuation in
            manager.requestImage(
                for: asset,
                targetSize: pixelSize,
                contentMode: .aspectFill,
                options: options
            ) { image, _ in
                continuation.resume(returning: image)
            }
        }
        if let image { cache.setObject(image, forKey: cacheKey) }
        return image
    }

    /// Warms the cache for assets about to appear (called as triage advances).
    func startCaching(ids: [String], targetSize: CGSize) {
        let assets = library.assets(for: ids)
        guard !assets.isEmpty else { return }
        let options = PHImageRequestOptions()
        options.deliveryMode = .highQualityFormat
        options.resizeMode = .fast
        options.isNetworkAccessAllowed = false
        manager.startCachingImages(for: assets, targetSize: targetSize,
                                    contentMode: .aspectFill, options: options)
    }

    func stopCachingAll() {
        manager.stopCachingImagesForAllAssets()
    }
}
