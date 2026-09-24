//
//  BinStore.swift
//  CleanSpace
//
//  The "trash bin" — the safety net between triage and real deletion. Backed by
//  SwiftData so a review survives relaunch. Holds only asset identifiers and
//  sizes; nothing is deleted from the Photo Library until the user confirms on
//  the Review screen.
//

import Foundation
import SwiftData
import Observation

@MainActor
@Observable
final class BinStore {
    private let context: ModelContext
    private(set) var items: [BinnedAssetRecord] = []

    init(context: ModelContext) {
        self.context = context
        reload()
    }

    var count: Int { items.count }
    var totalBytes: Int64 { items.reduce(0) { $0 + $1.byteSize } }
    var isEmpty: Bool { items.isEmpty }

    func contains(_ assetID: String) -> Bool {
        items.contains { $0.assetID == assetID }
    }

    func add(_ item: MediaItem, category: ScanCategory) {
        guard !contains(item.id) else { return }
        let record = BinnedAssetRecord(assetID: item.id, byteSize: item.byteSize, category: category)
        context.insert(record)
        saveAndReload()
    }

    func remove(_ assetID: String) {
        for record in items where record.assetID == assetID {
            context.delete(record)
        }
        saveAndReload()
    }

    func toggle(_ item: MediaItem, category: ScanCategory) {
        if contains(item.id) { remove(item.id) }
        else { add(item, category: category) }
    }

    /// Clears records for assets that were successfully deleted from the library.
    func clear(ids: [String]) {
        let set = Set(ids)
        for record in items where set.contains(record.assetID) {
            context.delete(record)
        }
        saveAndReload()
    }

    func clearAll() {
        for record in items { context.delete(record) }
        saveAndReload()
    }

    // MARK: - Persistence

    private func reload() {
        let descriptor = FetchDescriptor<BinnedAssetRecord>(
            sortBy: [SortDescriptor(\.addedAt, order: .reverse)]
        )
        items = (try? context.fetch(descriptor)) ?? []
    }

    private func saveAndReload() {
        try? context.save()
        reload()
    }
}
