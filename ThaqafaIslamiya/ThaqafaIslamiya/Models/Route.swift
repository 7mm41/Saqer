//
//  Route.swift
//  ثقافة إسلامية
//
//  وجهات التنقّل داخل التطبيق (تعتمد على المعرّفات فقط لتبقى خفيفة وقابلة للمقارنة).
//

import Foundation

enum Route: Hashable {
    case chapter(id: String)
    case masala(id: String)
    case quiz(chapterId: String)
    case about
}
