//
//  TriageViewModel.swift
//  CleanSpace
//
//  Drives the swipe-to-triage flow for one category. Walks group-by-group; within
//  a group each photo is a card the user keeps or bins. Decisions are written
//  straight to the BinStore so nothing is lost if the app is interrupted.
//

import Foundation
import Observation

@MainActor
@Observable
final class TriageViewModel {
    let category: ScanCategory
    private(set) var groups: [SimilarGroup]
    private let bin: BinStore
    private let preferences: Preferences

    private(set) var groupIndex: Int = 0
    /// IDs in the current group the user has already decided on.
    private(set) var decided: Set<String> = []

    init(category: ScanCategory, groups: [SimilarGroup], bin: BinStore, preferences: Preferences) {
        self.category = category
        self.groups = groups.filter { !$0.items.isEmpty }
        self.bin = bin
        self.preferences = preferences
    }

    // MARK: Derived state

    var currentGroup: SimilarGroup? {
        groups.indices.contains(groupIndex) ? groups[groupIndex] : nil
    }

    var isFinished: Bool { groupIndex >= groups.count }

    var totalGroups: Int { groups.count }

    /// Cards not yet decided in the current group, top of the stack last.
    var remainingCards: [MediaItem] {
        guard let group = currentGroup else { return [] }
        return group.items.filter { !decided.contains($0.id) }
    }

    var suggestedKeepID: String? { currentGroup?.suggestedKeepID }

    func isBinned(_ id: String) -> Bool { bin.contains(id) }

    // MARK: Decisions

    func keep(_ item: MediaItem) {
        // Keeping a photo simply means "don't bin it"; undo a prior bin if needed.
        if bin.contains(item.id) { bin.remove(item.id) }
        decided.insert(item.id)
        if preferences.hapticsEnabled { HapticsManager.shared.keep() }
        advanceIfGroupComplete()
    }

    func bin(_ item: MediaItem) {
        bin.add(item, category: category)
        decided.insert(item.id)
        if preferences.hapticsEnabled { HapticsManager.shared.markForDeletion() }
        advanceIfGroupComplete()
    }

    /// Undo the last decision by re-showing a card (used by an on-screen "undo").
    func undo(_ item: MediaItem) {
        bin.remove(item.id)
        decided.remove(item.id)
    }

    /// Auto-select: keep the suggested hero, bin the rest of the current group.
    func autoSelectCurrentGroup() {
        guard let group = currentGroup else { return }
        let keepID = group.suggestedKeepID ?? group.items.first?.id
        for item in group.items {
            if item.id == keepID {
                if bin.contains(item.id) { bin.remove(item.id) }
            } else {
                bin.add(item, category: category)
            }
            decided.insert(item.id)
        }
        if preferences.hapticsEnabled { HapticsManager.shared.success() }
        nextGroup()
    }

    func skipGroup() {
        // Keep everything in this group.
        if let group = currentGroup {
            for item in group.items where bin.contains(item.id) { bin.remove(item.id) }
        }
        nextGroup()
    }

    // MARK: Navigation

    private func advanceIfGroupComplete() {
        if remainingCards.isEmpty { nextGroup() }
    }

    private func nextGroup() {
        groupIndex += 1
        decided.removeAll(keepingCapacity: true)
    }
}
