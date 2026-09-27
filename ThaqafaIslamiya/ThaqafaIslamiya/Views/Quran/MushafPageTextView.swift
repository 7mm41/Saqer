//
//  MushafPageTextView.swift
//  ثقافة إسلامية
//
//  صفحة المصحف المدني مرسومة نصًّا بخطوط مجمع الملك فهد (QCF): كل كلمة بخط صفحتها، فتطابق الطبعة
//  الورقية سطرًا بسطر، وتبقى حادّة بأي حجم.
//  التصميم: ورقة عائمة داخل إطار زجاجي، بزخرفة إسلامية (نجمة ثمانية في الأركان، إطار مزدوج ذهبي وأخضر،
//  شريط السورة على شكل خرطوش، رقم الصفحة داخل نجمة) — نهارًا ورقة كريمية، وليلًا ورقة زمرّدية داكنة بحبر فاتح.
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
        IslamicPageFrame(palette: palette) {
            GeometryReader { proxy in
                let size = proxy.size
                let headerHeight: CGFloat = 30
                let footerHeight: CGFloat = 36
                let textHeight = max(size.height - headerHeight - footerHeight, 100)
                let fontSize = min(size.width / CGFloat(target),
                                   textHeight / (CGFloat(Self.lineCount) * Self.linePitch))
                let rowHeight = page <= 2 ? fontSize * Self.linePitch * 1.12 : textHeight / CGFloat(Self.lineCount)

                VStack(spacing: 0) {
                    pageHeader
                        .frame(height: headerHeight, alignment: .top)
                    Spacer(minLength: 0)
                    VStack(spacing: 0) {
                        ForEach(Array(layout.lines.enumerated()), id: \.offset) { _, line in
                            row(line, fontSize: fontSize, rowHeight: rowHeight, width: size.width)
                                .frame(width: size.width, height: rowHeight)
                        }
                    }
                    .padding(.vertical, page <= 2 ? rowHeight * 0.6 : 0)
                    .background {
                        if page <= 2 { openingFrame }
                    }
                    Spacer(minLength: 0)
                    pageNumber
                        .frame(height: footerHeight, alignment: .bottom)
                }
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
            if let face = QuranFonts.pageFace(page) {
                wordLine(words, face: face, fontSize: fontSize, scale: scale)
            } else {
                missingFont
            }
        case .surahTitle(let surah):
            SurahTitleBand(surah: surah, palette: palette, height: rowHeight * 0.84)
                .frame(width: min(width, fontSize * CGFloat(target)))
        case .basmala:
            if let face = QuranFonts.pageFace(1) {
                wordLine(basmala.map { MushafWord(code: $0) }, face: face, fontSize: fontSize * 1.25, scale: 1)
            }
        }
    }

    /// لا يُفترض أن يظهر: ملف خط الصفحة غير موجود في التطبيق.
    private var missingFont: some View {
        Label(L10n.t("quran.fontMissing"), systemImage: "exclamationmark.triangle.fill")
            .font(.caption.weight(.bold))
            .foregroundStyle(.orange)
    }

    private func wordLine(_ words: [MushafWord], face: QuranFace, fontSize: CGFloat, scale: Double) -> some View {
        HStack(spacing: 0) {
            ForEach(Array(words.enumerated()), id: \.offset) { _, word in
                let active = word.ayah >= 0 && word.ayah == highlighted
                GlyphRunView(run: face.run(word.code), face: face, size: fontSize,
                             color: word.isEnd ? palette.marker : palette.ink)
                    .background {
                        if active {
                            RoundedRectangle(cornerRadius: fontSize * 0.18, style: .continuous)
                                .fill(palette.highlight)
                                .padding(.vertical, -fontSize * 0.04)
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
        HStack(spacing: 8) {
            headerChip(header.surah)
            Spacer(minLength: 0)
            headerChip(header.juz)
        }
    }

    private func headerChip(_ text: String) -> some View {
        HStack(spacing: 5) {
            Octagram()
                .fill(palette.gold)
                .frame(width: 8, height: 8)
            Text(text)
                .font(.caption.weight(.bold))
                .foregroundStyle(palette.marker)
                .lineLimit(1)
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 4)
        .background(Capsule().fill(palette.marker.opacity(night ? 0.16 : 0.08)))
        .overlay(Capsule().strokeBorder(palette.gold.opacity(0.45), lineWidth: 0.8))
    }

    /// رقم الصفحة داخل نجمة ثمانية (ربع الحزب).
    private var pageNumber: some View {
        ZStack {
            Octagram()
                .fill(LinearGradient(colors: [palette.marker.opacity(night ? 0.3 : 0.14), palette.marker.opacity(night ? 0.12 : 0.05)],
                                     startPoint: .top, endPoint: .bottom))
            Octagram()
                .stroke(palette.gold.opacity(0.8), lineWidth: 1)
            Text(page.arabicIndic)
                .font(.system(size: 12, weight: .heavy, design: .rounded))
                .foregroundStyle(palette.marker)
                .minimumScaleFactor(0.6)
                .padding(6)
        }
        .frame(width: 36, height: 36)
    }

    /// إطار زخرفي لصفحتي الفاتحة وأول البقرة.
    private var openingFrame: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 34, style: .continuous)
                .fill(palette.marker.opacity(night ? 0.08 : 0.04))
            RoundedRectangle(cornerRadius: 34, style: .continuous)
                .strokeBorder(palette.gold.opacity(0.7), lineWidth: 1.4)
            RoundedRectangle(cornerRadius: 28, style: .continuous)
                .strokeBorder(palette.marker.opacity(0.35), style: StrokeStyle(lineWidth: 1, dash: [1.5, 4]))
                .padding(6)
        }
        .allowsHitTesting(false)
    }
}

/// إجراءات الضغط المطوّل على آية.
enum MushafAyahAction {
    case tafsir, listen
}

// MARK: - Page frame

/// ورقة المصحف العائمة: إطار زجاجي خارجي، ثم ورقة بإطار مزدوج (ذهبي وأخضر) ونجمة ثمانية في كل ركن.
struct IslamicPageFrame<Content: View>: View {
    let palette: MushafPalette
    @ViewBuilder var content: Content

    var body: some View {
        content
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
            .background {
                ZStack {
                    RoundedRectangle(cornerRadius: 24, style: .continuous)
                        .fill(palette.paperGradient)
                    RoundedRectangle(cornerRadius: 24, style: .continuous)
                        .strokeBorder(palette.gold.opacity(0.75), lineWidth: 1.2)
                    RoundedRectangle(cornerRadius: 19, style: .continuous)
                        .strokeBorder(palette.marker.opacity(0.35), lineWidth: 0.8)
                        .padding(5)
                    cornerStars
                }
            }
            .padding(7)
            .glassCard(cornerRadius: 31, tint: palette.night ? .teal : .green, elevated: true)
    }

    private var cornerStars: some View {
        GeometryReader { proxy in
            let s: CGFloat = 13
            let inset: CGFloat = 11
            ForEach(0..<4, id: \.self) { i in
                Octagram()
                    .fill(palette.gold)
                    .overlay(Octagram().stroke(palette.marker.opacity(0.5), lineWidth: 0.6))
                    .frame(width: s, height: s)
                    .position(x: i % 2 == 0 ? inset : proxy.size.width - inset,
                              y: i < 2 ? inset : proxy.size.height - inset)
            }
        }
        .allowsHitTesting(false)
    }
}

// MARK: - Surah title band

/// شريط اسم السورة على شكل خرطوش مدبّب الطرفين بتدرّج زمرّدي وحافة ذهبية، ونجمة ثمانية في كل طرف،
/// والاسم بخط أسماء السور في منتصفه تمامًا (أفقيًا وعموديًا).
struct SurahTitleBand: View {
    let surah: Int
    let palette: MushafPalette
    let height: CGFloat

    var body: some View {
        let nameSize = height * 0.8
        ZStack {
            Cartouche()
                .fill(LinearGradient(colors: palette.bandColors, startPoint: .top, endPoint: .bottom))
            Cartouche()
                .stroke(palette.gold, lineWidth: 1.4)
            Cartouche()
                .stroke(palette.gold.opacity(0.45), lineWidth: 0.7)
                .padding(height * 0.12)

            HStack {
                star
                Spacer()
                star
            }
            .padding(.horizontal, height * 0.62)

            // «سورة» على اليمين ثم اسمها — تُرسم أشكالها مباشرة من خط أسماء السور وتُرتَّب صراحة
            if let face = QuranFonts.surahNamesFace {
                HStack(spacing: nameSize * 0.25) {
                    GlyphRunView(run: face.run(QuranFonts.surahWordGlyph), face: face, size: nameSize, color: palette.bandInk)
                    GlyphRunView(run: face.run(QuranFonts.surahNameGlyph(surah)), face: face, size: nameSize, color: palette.bandInk)
                }
                .environment(\.layoutDirection, .rightToLeft)
                // صندوق الخط (صاعد ٨٤٠ / نازل ١٨٣) متوازن حول الرسم، فالتوسيط يضع الاسم في منتصف الشريط
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .center)
            }
        }
        .frame(height: height)
    }

    private var star: some View {
        Octagram()
            .fill(palette.gold)
            .frame(width: height * 0.36, height: height * 0.36)
    }
}

// MARK: - Glyph drawing

/// كلمة من خط المصحف مرسومة من شكلها مباشرة: العرض = عرض الكلمة، والارتفاع = صندوق سطر الخط.
struct GlyphRunView: View {
    let run: GlyphRun
    let face: QuranFace
    let size: CGFloat
    let color: Color

    var body: some View {
        GlyphShape(run: run, ascent: face.ascent)
            .fill(color)
            .frame(width: run.advance * size, height: (face.ascent + face.descent) * size)
            // الشكل مرسوم بترتيبه الصحيح؛ لا يُعكس في واجهة يمين ← يسار
            .environment(\.layoutDirection, .leftToRight)
    }
}

private struct GlyphShape: Shape {
    let run: GlyphRun
    let ascent: CGFloat

    func path(in rect: CGRect) -> Path {
        let scale = run.advance > 0 ? rect.width / run.advance : 0
        let transform = CGAffineTransform(a: scale, b: 0, c: 0, d: scale, tx: rect.minX, ty: rect.minY + ascent * scale)
        return Path(run.path).applying(transform)
    }
}

// MARK: - Islamic shapes

/// نجمة ثمانية (مربعان متداخلان بزاوية ٤٥°) — رمز ربع الحزب في المصاحف.
struct Octagram: Shape {
    func path(in rect: CGRect) -> Path {
        let c = CGPoint(x: rect.midX, y: rect.midY)
        let r = min(rect.width, rect.height) / 2
        let inner = r * cos(.pi / 4) / cos(.pi / 8)
        var path = Path()
        for i in 0..<16 {
            let angle = Double(i) * .pi / 8 - .pi / 2
            let radius = i.isMultiple(of: 2) ? r : inner
            let point = CGPoint(x: c.x + radius * cos(angle), y: c.y + radius * sin(angle))
            if i == 0 { path.move(to: point) } else { path.addLine(to: point) }
        }
        path.closeSubpath()
        return path
    }
}

/// خرطوش مدبّب الطرفين (إطار اسم السورة في المصاحف).
struct Cartouche: Shape {
    func path(in rect: CGRect) -> Path {
        let h = rect.height, w = rect.width
        let inset = min(h * 0.55, w / 4)
        let mid = rect.minY + h / 2
        var p = Path()
        p.move(to: CGPoint(x: rect.minX, y: mid))
        p.addQuadCurve(to: CGPoint(x: rect.minX + inset, y: rect.minY), control: CGPoint(x: rect.minX + inset * 0.15, y: rect.minY))
        p.addLine(to: CGPoint(x: rect.maxX - inset, y: rect.minY))
        p.addQuadCurve(to: CGPoint(x: rect.maxX, y: mid), control: CGPoint(x: rect.maxX - inset * 0.15, y: rect.minY))
        p.addQuadCurve(to: CGPoint(x: rect.maxX - inset, y: rect.maxY), control: CGPoint(x: rect.maxX - inset * 0.15, y: rect.maxY))
        p.addLine(to: CGPoint(x: rect.minX + inset, y: rect.maxY))
        p.addQuadCurve(to: CGPoint(x: rect.minX, y: mid), control: CGPoint(x: rect.minX + inset * 0.15, y: rect.maxY))
        p.closeSubpath()
        return p
    }
}

// MARK: - Palette

struct MushafPalette {
    let night: Bool

    var paperGradient: LinearGradient {
        night
            ? LinearGradient(colors: [Color(red: 0.06, green: 0.12, blue: 0.1), Color(red: 0.03, green: 0.07, blue: 0.06)],
                             startPoint: .top, endPoint: .bottom)
            : LinearGradient(colors: [Color(red: 1.0, green: 0.985, blue: 0.945), Color(red: 0.98, green: 0.955, blue: 0.9)],
                             startPoint: .top, endPoint: .bottom)
    }
    var ink: Color { night ? Color(red: 0.94, green: 0.92, blue: 0.86) : Color(red: 0.1, green: 0.09, blue: 0.07) }
    var marker: Color { night ? Color(red: 0.5, green: 0.87, blue: 0.66) : Color(red: 0.04, green: 0.45, blue: 0.29) }
    var gold: Color { night ? Color(red: 0.86, green: 0.72, blue: 0.42) : Color(red: 0.76, green: 0.58, blue: 0.24) }
    var bandColors: [Color] {
        night
            ? [Color(red: 0.1, green: 0.32, blue: 0.23), Color(red: 0.05, green: 0.2, blue: 0.14)]
            : [Color(red: 0.12, green: 0.5, blue: 0.34), Color(red: 0.05, green: 0.36, blue: 0.24)]
    }
    var bandInk: Color { Color(red: 1.0, green: 0.93, blue: 0.76) }
    var highlight: Color { night ? Color(red: 0.3, green: 0.75, blue: 0.5).opacity(0.3) : Color(red: 0.95, green: 0.78, blue: 0.3).opacity(0.38) }
}
