//
//  BinViewModel.swift
//  CleanSpace
//
//  Owns the "Review & Execute" step. Requests the system deletion prompt and
//  handles every outcome — success, user-cancelled, and real errors — without
//  ever pretending an item was removed when it wasn't.
//

import Foundation
import Photos
import Observation

@MainActor
@Observable
final class BinViewModel {
    enum State: Equatable {
        case idle
        case deleting
        case done(freed: Int64, count: Int)
        case cancelled
        case failed(String)
    }

    private let bin: BinStore
    private let library: PhotoLibraryService
    private let store: StoreService
    private(set) var state: State = .idle

    init(bin: BinStore, library: PhotoLibraryService, store: StoreService) {
        self.bin = bin
        self.library = library
        self.store = store
    }

    var isDeleting: Bool { state == .deleting }

    /// Requests deletion of everything in the bin. iOS shows its own confirmation
    /// sheet; on cancel we keep the bin intact so the user can try again.
    func execute() async {
        let records = bin.items
        guard !records.isEmpty else { return }
        let ids = records.map(\.assetID)
        let bytes = records.reduce(0) { $0 + $1.byteSize }
        state = .deleting

        do {
            try await library.delete(ids: ids)
            bin.clear(ids: ids)
            store.recordFreeDeletions(ids.count)   // counts against the free quota (no-op for Pro)
            state = .done(freed: bytes, count: ids.count)
            HapticsManager.shared.success()
        } catch let error as PHPhotosError where error.code == .userCancelled {
            state = .cancelled
            HapticsManager.shared.warning()
        } catch {
            state = .failed(error.localizedDescription)
            HapticsManager.shared.warning()
        }
    }

    func resetState() { state = .idle }
}
