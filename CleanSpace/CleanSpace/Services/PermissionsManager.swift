//
//  PermissionsManager.swift
//  CleanSpace
//
//  Owns the PhotoKit authorization state. We request `.readWrite` because the
//  app must be able to delete assets; limited/denied states are handled in the UI
//  with a persistent "Access Required" screen.
//

import Foundation
import Photos
import Observation

@MainActor
@Observable
final class PermissionsManager {
    private(set) var status: PHAuthorizationStatus

    init() {
        status = PHPhotoLibrary.authorizationStatus(for: .readWrite)
    }

    var isAuthorized: Bool { status == .authorized }
    /// Limited access means we can read a subset but cannot reliably delete or
    /// scan the whole library — we treat it as needing an upgrade.
    var isLimited: Bool { status == .limited }
    var isDeniedOrRestricted: Bool { status == .denied || status == .restricted }

    func refresh() {
        status = PHPhotoLibrary.authorizationStatus(for: .readWrite)
    }

    /// Presents the system prompt if we haven't asked yet; otherwise returns the
    /// current status. Safe to call repeatedly.
    @discardableResult
    func request() async -> PHAuthorizationStatus {
        let current = PHPhotoLibrary.authorizationStatus(for: .readWrite)
        guard current == .notDetermined else {
            status = current
            return current
        }
        let granted = await withCheckedContinuation { (continuation: CheckedContinuation<PHAuthorizationStatus, Never>) in
            PHPhotoLibrary.requestAuthorization(for: .readWrite) { newStatus in
                continuation.resume(returning: newStatus)
            }
        }
        status = granted
        return granted
    }

    /// Deep-links to the app's Settings page so the user can change access.
    func openSettings() {
        #if canImport(UIKit)
        guard let url = URL(string: UIApplication.openSettingsURLString) else { return }
        UIApplication.shared.open(url)
        #endif
    }
}

#if canImport(UIKit)
import UIKit
#endif
