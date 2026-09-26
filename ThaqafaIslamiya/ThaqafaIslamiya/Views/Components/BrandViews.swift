//
//  BrandViews.swift
//  ثقافة إسلامية
//
//  هوية التطبيق والمطوّر (صقر ستور): شعار التطبيق، شارة صقر ستور، تذييل «تم تطويره بواسطة»، وشاشة البداية.
//

import SwiftUI

/// شعار التطبيق (صورة الأيقونة الحالية) بحواف iOS المستديرة ولمعة زجاجية.
struct AppMark: View {
    var size: CGFloat = 84
    var imageName: String = AppIconChoice.classic.previewImage

    var body: some View {
        Image(imageName)
            .resizable()
            .scaledToFill()
            .frame(width: size, height: size)
            .clipShape(RoundedRectangle(cornerRadius: size * 0.225, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: size * 0.225, style: .continuous)
                    .strokeBorder(LinearGradient(colors: [.white.opacity(0.8), .white.opacity(0.1)],
                                                 startPoint: .topLeading, endPoint: .bottomTrailing), lineWidth: 1.2)
            }
            .shadow(color: .black.opacity(0.18), radius: size * 0.12, y: size * 0.06)
            .accessibilityHidden(true)
    }
}

/// شارة صقر ستور: رمز الصقر داخل دائرة متدرّجة + الاسم بالعربية واللاتينية.
struct SaqerStoreBadge: View {
    var compact = false

    var body: some View {
        HStack(spacing: 10) {
            ZStack {
                Circle()
                    .fill(LinearGradient(colors: [Color(red: 0.95, green: 0.72, blue: 0.3), Color(red: 0.78, green: 0.42, blue: 0.16)],
                                         startPoint: .topLeading, endPoint: .bottomTrailing))
                Image(systemName: "bird.fill")
                    .font(.system(size: compact ? 13 : 18, weight: .bold))
                    .foregroundStyle(.white)
                    .scaleEffect(x: -1)
            }
            .frame(width: compact ? 28 : 40, height: compact ? 28 : 40)
            .overlay(Circle().strokeBorder(.white.opacity(0.6), lineWidth: 1))

            VStack(alignment: .leading, spacing: 0) {
                Text(AppInfo.developerArabic)
                    .font((compact ? Font.caption : .headline).weight(.heavy))
                Text(AppInfo.developerLatin.uppercased())
                    .font(.system(size: compact ? 8 : 10, weight: .bold, design: .rounded))
                    .tracking(2)
                    .foregroundStyle(.secondary)
            }
        }
        .accessibilityElement(children: .combine)
    }
}

/// «تم تطويره بواسطة صقر ستور © ٢٠٢٦».
struct DeveloperFooter: View {
    var body: some View {
        VStack(spacing: 8) {
            SaqerStoreBadge(compact: true)
            Text(L10n.t("brand.developedBy", AppInfo.developerArabic, AppInfo.copyrightYear.digits))
                .font(.caption2)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 8)
    }
}

/// شاشة البداية: شعار التطبيق يظهر بنبضة ناعمة ثم يختفي.
struct SplashView: View {
    @State private var appear = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        ZStack {
            LiquidBackground()
            Rectangle().fill(.ultraThinMaterial).ignoresSafeArea()

            VStack(spacing: 18) {
                AppMark(size: 118)
                    .scaleEffect(appear ? 1 : 0.7)
                    .opacity(appear ? 1 : 0)
                Text(L10n.t("app.name"))
                    .font(.system(size: 34, weight: .heavy, design: .rounded))
                    .foregroundStyle(LinearGradient.diagonal([.teal, .indigo]))
                    .opacity(appear ? 1 : 0)
                    .offset(y: appear ? 0 : 12)
                Text(L10n.t("brand.tagline"))
                    .font(.subheadline.weight(.medium))
                    .foregroundStyle(.secondary)
                    .opacity(appear ? 1 : 0)
            }

            VStack {
                Spacer()
                SaqerStoreBadge(compact: true)
                    .opacity(appear ? 1 : 0)
                    .padding(.bottom, 36)
            }
        }
        .onAppear {
            withAnimation(reduceMotion ? .none : .spring(response: 0.7, dampingFraction: 0.7)) { appear = true }
        }
        .accessibilityElement(children: .combine)
    }
}

#Preview {
    SplashView()
}
