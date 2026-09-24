//
//  AppEnvironment.swift
//  CleanSpace
//
//  A single composition root injected through the SwiftUI environment. Holds the
//  long-lived services so views and view models share one instance of each.
//

import Foundation
import SwiftData
import Observation

@MainActor
@Observable
final class AppEnvironment {
    let preferences: Preferences
    let permissions: PermissionsManager
    let scanEngine: ScanEngine
    let bin: BinStore
    let library: PhotoLibraryService
    let store: StoreService

    /// Filled in after the first scan / storage read; drives the dashboard ring.
    var storage = StorageInfo()

    init(modelContext: ModelContext) {
        let library = PhotoLibraryService()
        self.library = library
        self.preferences = Preferences()
        self.permissions = PermissionsManager()
        self.scanEngine = ScanEngine(library: library)
        self.bin = BinStore(context: modelContext)
        self.store = StoreService()
    }

    /// Reads device capacity immediately, then fills in the media total in the
    /// background (it's an O(n) pass over the library).
    func refreshStorage() {
        let capacity = StorageService.deviceCapacity()
        storage.totalBytes = capacity.total
        storage.freeBytes = capacity.free

        Task.detached(priority: .utility) { [library] in
            let media = library.totalMediaBytes()
            await MainActor.run { self.storage.mediaBytes = media }
        }
    }
}
