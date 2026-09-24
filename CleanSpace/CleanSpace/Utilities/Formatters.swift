//
//  Formatters.swift
//  CleanSpace
//

import Foundation

enum Format {
    private static let byteFormatter: ByteCountFormatter = {
        let f = ByteCountFormatter()
        f.allowedUnits = [.useKB, .useMB, .useGB]
        f.countStyle = .file
        f.zeroPadsFractionDigits = false
        return f
    }()

    static func bytes(_ value: Int64) -> String {
        byteFormatter.string(fromByteCount: max(0, value))
    }

    static func duration(_ seconds: TimeInterval) -> String {
        let s = Int(seconds.rounded())
        let m = s / 60
        let r = s % 60
        return String(format: "%d:%02d", m, r)
    }

    static func relativeDate(_ date: Date?) -> String {
        guard let date else { return "Unknown date" }
        let f = RelativeDateTimeFormatter()
        f.unitsStyle = .abbreviated
        return f.localizedString(for: date, relativeTo: .now)
    }
}
