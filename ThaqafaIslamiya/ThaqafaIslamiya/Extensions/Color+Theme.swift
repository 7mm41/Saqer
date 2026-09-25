//
//  Color+Theme.swift
//  ثقافة إسلامية
//
//  لوحة ألوان التطبيق وتحويل أسماء الألوان الموجودة في ملف البيانات إلى ألوان SwiftUI.
//

import SwiftUI

extension Color {
    /// يحوّل اسم اللون الوارد في `TalqeenData.json` إلى لون SwiftUI.
    static func theme(_ name: String) -> Color {
        switch name {
        case "mint": return .mint
        case "teal": return .teal
        case "cyan": return .cyan
        case "blue": return .blue
        case "indigo": return .indigo
        case "purple": return .purple
        case "pink": return .pink
        case "red": return .red
        case "orange": return .orange
        case "yellow": return .yellow
        case "green": return .green
        case "brown": return .brown
        default: return .accentColor
        }
    }

    /// ألوان الخلفية الحيوية للشاشة الرئيسية.
    static let liquidPalette: [Color] = [.teal, .indigo, .pink, .mint]
}

extension Array where Element == String {
    /// ألوان التدرّج لقسم أو درس.
    var themeColors: [Color] {
        let colors = map(Color.theme)
        return colors.isEmpty ? [.teal, .indigo] : colors
    }

    /// اللون الأساسي (الأول) للتدرّج.
    var primaryThemeColor: Color { themeColors.first ?? .teal }
}

extension LinearGradient {
    /// تدرّج قُطري من مجموعة ألوان.
    static func diagonal(_ colors: [Color]) -> LinearGradient {
        LinearGradient(colors: colors, startPoint: .topLeading, endPoint: .bottomTrailing)
    }
}
