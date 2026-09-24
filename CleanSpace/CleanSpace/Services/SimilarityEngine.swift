//
//  SimilarityEngine.swift
//  CleanSpace
//
//  Wraps Vision's `VNGenerateImageFeaturePrintRequest`. Feature prints are
//  reference types and not Sendable, so they never leave this actor — callers
//  address photos by localIdentifier and ask the actor for distances. Work is
//  serialized here, which is exactly what we want on older devices: one Vision
//  request in flight at a time keeps the memory ceiling low.
//
//  Distance guide (empirical, tune on-device):
//    ~0.0        identical / re-saved copy
//    < 0.12      duplicate or burst frame
//    < 0.35      visually "similar" (same scene, small changes)
//    > 0.6       unrelated
//  NOTE: The PRD's "distance < 10" refers to a different metric; Vision feature-
//  print distances live on the ~0…1.5 scale above.
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

    private let library: PhotoLibraryService
    private let manager = PHImageManager.default()
    private let analysisSize = CGSize(width: 256, height: 256)
    private var prints: [String: VNFeaturePrintObservation] = [:]

    init(library: PhotoLibraryService) {
        self.library = library
    }

    func reset() {
        prints.removeAll(keepingCapacity: false)
    }

    /// Computes and caches the feature print for one asset. Returns false if the
    /// image couldn't be loaded or Vision produced no observation.
    @discardableResult
    func computeFeaturePrint(for id: String) async -> Bool {
        if prints[id] != nil { return true }
        guard let cgImage = await loadCGImage(id: id) else { return false }
        guard let observation = generateFeaturePrint(cgImage) else { return false }
        prints[id] = observation
        return true
    }

    /// Distance between two previously-computed prints; nil if either is missing.
    func distance(_ a: String, _ b: String) -> Float? {
        guard let pa = prints[a], let pb = prints[b] else { return nil }
        var value = Float(0)
        do {
            try pa.computeDistance(&value, to: pb)
            return value
        } catch {
            return nil
        }
    }

    func hasFeaturePrint(for id: String) -> Bool { prints[id] != nil }

    // MARK: - Vision

    private func generateFeaturePrint(_ cgImage: CGImage) -> VNFeaturePrintObservation? {
        let request = VNGenerateImageFeaturePrintRequest()
        request.imageCropAndScaleOption = .centerCrop
        let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
        do {
            try handler.perform([request])
            return request.results?.first as? VNFeaturePrintObservation
        } catch {
            return nil
        }
    }

    // MARK: - Image loading (bounded, on-device only)

    private func loadCGImage(id: String) async -> CGImage? {
        guard let asset = library.asset(for: id) else { return nil }
        let options = PHImageRequestOptions()
        options.deliveryMode = .highQualityFormat
        options.resizeMode = .exact
        options.isNetworkAccessAllowed = false
        options.isSynchronous = false

        let image: UIImage? = await withCheckedContinuation { continuation in
            manager.requestImage(
                for: asset,
                targetSize: analysisSize,
                contentMode: .aspectFit,
                options: options
            ) { image, _ in
                continuation.resume(returning: image)
            }
        }
        return image?.cgImage
    }
}
