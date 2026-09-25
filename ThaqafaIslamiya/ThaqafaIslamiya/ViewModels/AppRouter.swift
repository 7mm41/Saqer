//
//  AppRouter.swift
//  ثقافة إسلامية
//
//  يدير مسار التنقّل وعرض الدرس التفاعلي بملء الشاشة من أي مكان في التطبيق.
//

import SwiftUI
import Observation

@Observable
final class AppRouter {
    var path: [Route] = []
    /// الدرس المعروض حاليًا بملء الشاشة.
    var presentedLesson: InteractiveLesson?

    func open(_ route: Route) { path.append(route) }
    func present(_ lesson: InteractiveLesson) { presentedLesson = lesson }
    func popToRoot() { path.removeAll() }
}
