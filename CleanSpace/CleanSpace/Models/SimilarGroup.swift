//
//  SimilarGroup.swift
//  CleanSpace
//
//  A cluster of visually-similar photos discovered by the scan engine, plus the
//  per-group triage state (which items the user chose to keep vs. bin).
//

import Foundation

struct SimilarGroup: Identifiable, Hashable, Sendable {
    let id: UUID
    /// Items ordered by capture time (oldest → newest) within the group.
    var items: [MediaItem]
    /// localIdentifier of the item the auto-select heuristic considers the "hero".
    var suggestedKeepID: String?

    init(id: UUID = UUID(), items: [MediaItem], suggestedKeepID: String? = nil) {
        self.id = id
        self.items = items
        self.suggestedKeepID = suggestedKeepID
    }

    var count: Int { items.count }

    /// Bytes reclaimable if every item except the suggested "keep" were removed.
    var reclaimableBytes: Int64 {
        let keepID = suggestedKeepID ?? items.first?.id
        return items.filter { $0.id != keepID }.reduce(0) { $0 + $1.byteSize }
    }

    var totalBytes: Int64 { items.reduce(0) { $0 + $1.byteSize } }
}
