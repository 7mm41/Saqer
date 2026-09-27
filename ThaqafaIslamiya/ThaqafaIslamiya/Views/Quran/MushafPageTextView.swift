//
//  MushafPageTextView.swift
//  ثقافة إسلامية
//
//  صفحة المصحف المدني مرسومة نصًّا بخطوط مجمع الملك فهد (QCF): كل كلمة بخط صفحتها، فتطابق الطبعة
//  الورقية سطرًا بسطر، وتبقى حادّة بأي حجم. الصفحة ورقة كريمية متناسقة مع خلفية التطبيق:
//  علامات الآيات وأشرطة السور بالأخضر، وتظليل الآية التي تُتلى، والضغط المطوّل على آية يفتح تفسيرها.
//

import SwiftUI

struct MushafPageTextView: View {
    let page: Int
    let layout: MushafPage
    /// عرض السطر الكامل بوحدة em.
    var target: Double
    var basmala: [String]
    var night: Bool
    /// الآية التي تُتلى الآن (فهرس عام 0…6235).
    var highlighted: Int?
    var header: (surah: String, juz: String)
    /// إجراء على آية من قائمة الضغط المطوّل (فهرس الآية العام).
    var onAyahAction: (Int, MushafAyahAction) -> Void = { _, _ in }

    private static let lineCount = 15
    /// المسافة بين الأسطر بوحدة em (نسبة المصحف المطبوع).
    private static let linePitch: CGFloat = 1.52

    private var palette: MushafPalette { MushafPalette(night: night) }

    var body: some View {
        GeometryReader { proxy in
            let size = proxy.size
            let headerHeight: CGFloat = 26
            let footerHeight: CGFloat = 30
            let textHeight = max(size.height - headerHeight - footerHeight, 100)
            let fontSize = min(size.width / CGFloat(target),
                               textHeight / (CGFloat(Self.lineCount) * Self.linePitch))
            let rowHeight = page <= 2 ? fontSize * Self.linePitch * 1.12 : textHeight / CGFloat(Self.lineCount)

            VStack(spacing: 0) {
                pageHeader
                    .frame(height: headerHeight)
                Spacer(minLength: 0)
                VStack(spacing: 0) {
                    ForEach(Array(layout.lines.enumerated()), id: \.offset) { _, line in
                        row(line, fontSize: fontSize, rowHeight: rowHeight, width: size.width)
                            .frame(width: size.width, height: rowHeight)
                    }
                }
                .padding(.vertical, page <= 2 ? rowHeight * 0.6 : 0)
                .overlay {
                    if page <= 2 { centeredFrame }
                }
                Spacer(minLength: 0)
                pageNumber
                    .frame(height: footerHeight)
            }
        }
        .environment(\.layoutDirection, .rightToLeft)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(L10n.t("quran.pageLabel", page.digits))
    }

    // MARK: Lines

    @ViewBuilder
    private func row(_ line: MushafLine, fontSize: CGFloat, rowHeight: CGFloat, width: CGFloat) -> some View {
        switch line {
        case .words(let words, let scale):
            wordLine(words, font: QuranFonts.ensurePage(page), fontSize: fontSize, scale: scale)
        case .surahTitle(let surah):
            SurahTitleBand(surah: surah, palette: palette, height: rowHeight * 0.86)
                .frame(width: min(width, fontSize * CGFloat(target)))
        case .basmala:
            wordLine(basmala.map { MushafWord(code: $0) }, font: QuranFonts.ensurePage(1),
                     fontSize: fontSize * 1.25, scale: 1)
        }
    }

    private func wordLine(_ words: [MushafWord], font: String, fontSize: CGFloat, scale: Double) -> some View {
        HStack(spacing: 0) {
            ForEach(Array(words.enumerated()), id: \.offset) { _, word in
                let active = word.ayah >= 0 && word.ayah == highlighted
                Text(word.code)
                    .font(.custom(font, fixedSize: fontSize))
                    .foregroundStyle(word.isEnd ? palette.marker : palette.ink)
                    .fixedSize()
                    .background {
                        if active {
                            palette.highlight
                                .padding(.vertical, -fontSize * 0.05)
                        }
                    }
                    .contentShape(Rectangle())
                    .contextMenu {
                        if word.ayah >= 0 {
                            Button { onAyahAction(word.ayah, .tafsir) } label: {
                                Label(L10n.t("quran.tafsir"), systemImage: "text.book.closed")
                            }
                            Button { onAyahAction(word.ayah, .listen) } label: {
                                Label(L10n.t("quran.listenFromHere"), systemImage: "play.circle")
                            }
                        }
                    }
            }
        }
        .environment(\.layoutDirection, .rightToLeft)
        .scaleEffect(x: scale, y: 1)
        .animation(.easeInOut(duration: 0.3), value: highlighted)
    }

    // MARK: Decorations

    private var pageHeader: some View {
        HStack {
            Text(header.surah)
            Spacer()
            Text(header.juz)
        }
        .font(.caption.weight(.bold))
        .foregroundStyle(palette.marker.opacity(0.9))
        .padding(.horizontal, 6)
        .lineLimit(1)
    }

    private var pageNumber: some View {
        Text(page.arabicIndic)
            .font(.footnote.weight(.heavy).monospacedDigit())
            .foregroundStyle(palette.marker)
            .padding(.horizontal, 14)
            .padding(.vertical, 3)
            .background(Capsule().fill(palette.marker.opacity(0.1)))
            .overlay(Capsule().strokeBorder(palette.marker.opacity(0.35), lineWidth: 1))
    }

    /// إطار زخرفي لصفحتي الفاتحة وأول البقرة.
    private var centeredFrame: some View {
        RoundedRectangle(cornerRadius: 28, style: .continuous)
            .strokeBorder(palette.marker.opacity(0.35), style: StrokeStyle(lineWidth: 1.5, dash: [2, 5]))
            .allowsHitTesting(false)
    }
}

// MARK: - Surah title band

/// شريط اسم السورة: إطار أخضر مزخرف، والاسم بخط أسماء السور في منتصفه تمامًا (أفقيًا وعموديًا).
struct SurahTitleBand: View {
    let surah: Int
    let palette: MushafPalette
    let height: CGFloat

    var body: some View {
        let nameSize = height * 0.8
        ZStack {
            RoundedRectangle(cornerRadius: height * 0.3, style: .continuous)
                .fill(LinearGradient(colors: [palette.band.opacity(0.22), palette.band.opacity(0.1), palette.band.opacity(0.22)],
                                     startPoint: .leading, endPoint: .trailing))
            RoundedRectangle(cornerRadius: height * 0.3, style: .continuous)
                .strokeBorder(palette.band.opacity(0.75), lineWidth: 1.4)
            RoundedRectangle(cornerRadius: height * 0.22, style: .continuous)
                .strokeBorder(palette.band.opacity(0.35), lineWidth: 0.8)
                .padding(height * 0.1)

            HStack {
                ornament
                Spacer()
                ornament
            }
            .padding(.horizontal, height * 0.28)

            // «سورة» على اليمين ثم اسمها — محارف خاصة (اتجاهها يسار ← يمين) فتُرتَّب صراحة
            HStack(spacing: nameSize * 0.25) {
                Text(QuranFonts.surahWordGlyph)
                Text(QuranFonts.surahNameGlyph(surah))
            }
            .font(.custom(QuranFonts.surahNames, fixedSize: nameSize))
            .foregroundStyle(palette.bandInk)
            .fixedSize()
            .environment(\.layoutDirection, .rightToLeft)
            // صندوق الخط (صاعد ٨٤٠ / نازل ١٨٣) متوازن حول الرسم، فالتوسيط يضع الاسم في منتصف الشريط
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .center)
        }
        .frame(height: height)
        .onAppear { QuranFonts.ensureSurahNames() }
    }

    private var ornament: some View {
        Image(systemName: "seal.fill")
            .font(.system(size: height * 0.34))
            .foregroundStyle(palette.band.opacity(0.7))
    }
}

/// إجراءات الضغط المطوّل على آية.
enum MushafAyahAction {
    case tafsir, listen
}

// MARK: - Palette

struct MushafPalette {
    let night: Bool

    var paper: Color { night ? Color(red: 0.07, green: 0.09, blue: 0.08) : Color(red: 0.995, green: 0.975, blue: 0.93) }
    var ink: Color { night ? Color(red: 0.93, green: 0.91, blue: 0.85) : Color(red: 0.1, green: 0.09, blue: 0.07) }
    var marker: Color { night ? Color(red: 0.45, green: 0.85, blue: 0.6) : Color(red: 0.05, green: 0.47, blue: 0.3) }
    var band: Color { night ? Color(red: 0.35, green: 0.75, blue: 0.5) : Color(red: 0.1, green: 0.5, blue: 0.32) }
    var bandInk: Color { night ? Color(red: 0.85, green: 0.95, blue: 0.88) : Color(red: 0.04, green: 0.3, blue: 0.18) }
    var highlight: Color { night ? Color(red: 0.3, green: 0.75, blue: 0.5).opacity(0.28) : Color(red: 0.95, green: 0.78, blue: 0.3).opacity(0.35) }
}
