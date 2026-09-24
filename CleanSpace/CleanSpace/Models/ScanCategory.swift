//
//  ScanCategory.swift
//  CleanSpace
//
//  The actionable buckets surfaced on the dashboard, and the full result set the
//  scan engine produces for them.
//

import Foundation
import SwiftUI

enum ScanCategory: String, CaseIterable, Identifiable, Sendable {
    case similar
    case screenshots
    case heavyVideos
    case duplicates

    var id: String { rawValue }

    var title: String {
        switch self {
        case .similar:      return "Similar Photos"
        case .screenshots:  return "Old Screenshots"
        case .heavyVideos:  return "Heavy Videos"
        case .duplicates:   return "Duplicates & Bursts"
        }
    }

    var subtitle: String {
        switch self {
        case .similar:      return "Photos that look almost the same"
        case .screenshots:  return "Screenshots older than 30 days"
        case .heavyVideos:  return "Videos larger than 50 MB"
        case .duplicates:   return "Exact copies and burst shots"
        }
    }

    var systemImage: String {
        switch self {
        case .similar:      return "square.stack.3d.up"
        case .screenshots:  return "camera.viewfinder"
        case .heavyVideos:  return "film.stack"
        case .duplicates:   return "doc.on.doc"
        }
    }

    var tint: Color {
        switch self {
        case .similar:      return .indigo
        case .screenshots:  return .teal
        case .heavyVideos:  return .orange
        case .duplicates:   return .pink
        }
    }
}

/// Immutable snapshot of everything a completed scan found.
struct ScanResult: Sendable {
    var similarGroups: [SimilarGroup] = []
    var duplicateGroups: [SimilarGroup] = []
    var screenshots: [MediaItem] = []
    var heavyVideos: [MediaItem] = []
    var scannedAt: Date = .now

    func items(for category: ScanCategory) -> [MediaItem] {
        switch category {
        case .similar:      return similarGroups.flatMap(\.items)
        case .duplicates:   return duplicateGroups.flatMap(\.items)
        case .screenshots:  return screenshots
        case .heavyVideos:  return heavyVideos
        }
    }

    func groups(for category: ScanCategory) -> [SimilarGroup] {
        switch category {
        case .similar:    return similarGroups
        case .duplicates: return duplicateGroups
        case .screenshots:
            return screenshots.isEmpty ? [] : [SimilarGroup(items: screenshots)]
        case .heavyVideos:
            return heavyVideos.isEmpty ? [] : [SimilarGroup(items: heavyVideos)]
        }
    }

    /// Potential savings shown on each dashboard card.
    func reclaimableBytes(for category: ScanCategory) -> Int64 {
        switch category {
        case .similar:      return similarGroups.reduce(0) { $0 + $1.reclaimableBytes }
        case .duplicates:   return duplicateGroups.reduce(0) { $0 + $1.reclaimableBytes }
        case .screenshots:  return screenshots.reduce(0) { $0 + $1.byteSize }
        case .heavyVideos:  return heavyVideos.reduce(0) { $0 + $1.byteSize }
        }
    }

    func count(for category: ScanCategory) -> Int {
        switch category {
        case .similar:      return similarGroups.reduce(0) { $0 + $1.count }
        case .duplicates:   return duplicateGroups.reduce(0) { $0 + $1.count }
        case .screenshots:  return screenshots.count
        case .heavyVideos:  return heavyVideos.count
        }
    }

    var isEmpty: Bool {
        similarGroups.isEmpty && duplicateGroups.isEmpty && screenshots.isEmpty && heavyVideos.isEmpty
    }
}
