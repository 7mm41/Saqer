//
//  ScanProgress.swift
//  CleanSpace
//
//  Live state published by the scan engine and rendered by the progress UI.
//

import Foundation

enum ScanPhase: Equatable, Sendable {
    case idle
    case fetching
    case analyzing          // computing feature prints
    case grouping           // clustering similar photos
    case finished
    case cancelled
    case failed(String)

    var label: String {
        switch self {
        case .idle:       return "Ready"
        case .fetching:   return "Reading your library…"
        case .analyzing:  return "Analyzing photos…"
        case .grouping:   return "Finding look-alikes…"
        case .finished:   return "Done"
        case .cancelled:  return "Paused"
        case .failed:     return "Something went wrong"
        }
    }
}

struct ScanProgress: Equatable, Sendable {
    var phase: ScanPhase = .idle
    var processed: Int = 0
    var total: Int = 0
    var similarFound: Int = 0
    var reclaimableBytes: Int64 = 0

    var fraction: Double {
        guard total > 0 else { return 0 }
        return min(1, Double(processed) / Double(total))
    }

    var isRunning: Bool {
        switch phase {
        case .fetching, .analyzing, .grouping: return true
        default: return false
        }
    }
}
