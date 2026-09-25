//
//  IllustrationView.swift
//  ثقافة إسلامية
//
//  يعرض الصورة التوضيحية من Assets.xcassets إن وُجدت، وإلا يعرض رمز SF Symbol متحرّكًا بدلًا منها.
//  بهذا يعمل التطبيق فورًا، وتظهر الصور تلقائيًا بمجرد إضافتها بالاسم الصحيح.
//

import SwiftUI
import UIKit

struct IllustrationView: View {
    let imageName: String
    let symbol: String
    var colors: [Color] = [.teal, .indigo]
    var symbolSize: CGFloat = 72
    /// تغيّر هذه القيمة يُشغّل حركة ارتداد الرمز.
    var bounceTrigger: Int = 0

    var body: some View {
        if UIImage(named: imageName) != nil {
            Image(imageName)
                .resizable()
                .scaledToFit()
                .accessibilityHidden(true)
        } else {
            ZStack {
                Circle()
                    .fill(LinearGradient.diagonal(colors.map { $0.opacity(0.35) }))
                    .overlay(Circle().strokeBorder(.white.opacity(0.5), lineWidth: 1.5))
                    .blur(radius: 0.5)
                Image(systemName: symbol)
                    .font(.system(size: symbolSize, weight: .semibold))
                    .symbolRenderingMode(.hierarchical)
                    .foregroundStyle(LinearGradient.diagonal(colors))
                    .symbolEffect(.bounce, value: bounceTrigger)
                    .shadow(color: (colors.first ?? .teal).opacity(0.4), radius: 12, y: 6)
            }
            .aspectRatio(1, contentMode: .fit)
            .accessibilityHidden(true)
        }
    }
}

#Preview {
    IllustrationView(imageName: "wudu_05", symbol: "drop.fill")
        .frame(width: 200)
        .padding()
}
