//
//  View+Haptics.swift
//  ثقافة إسلامية
//
//  اهتزاز خفيف يحترم إعداد «الاهتزاز» في الإعدادات.
//

import SwiftUI

extension View {
    /// اهتزاز عند تغيّر القيمة (إن كان مفعّلًا في الإعدادات).
    func appHaptic<T: Equatable>(_ feedback: SensoryFeedback, trigger: T,
                                 when condition: @escaping (T, T) -> Bool = { _, _ in true }) -> some View {
        modifier(AppHaptic(trigger: trigger) { old, new in condition(old, new) ? feedback : nil })
    }

    /// اهتزاز يُحدَّد نوعه حسب القيمة الجديدة (مثل نجاح/خطأ).
    func appHaptic<T: Equatable>(trigger: T, _ feedback: @escaping (T, T) -> SensoryFeedback?) -> some View {
        modifier(AppHaptic(trigger: trigger, feedback: feedback))
    }
}

private struct AppHaptic<T: Equatable>: ViewModifier {
    let trigger: T
    let feedback: (T, T) -> SensoryFeedback?
    @Environment(AppSettings.self) private var settings: AppSettings?

    func body(content: Content) -> some View {
        content.sensoryFeedback(trigger: trigger) { old, new in
            (settings?.haptics ?? true) ? feedback(old, new) : nil
        }
    }
}
