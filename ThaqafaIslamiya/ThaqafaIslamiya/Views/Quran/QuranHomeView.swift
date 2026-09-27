//
//  QuranHomeView.swift
//  ثقافة إسلامية
//
//  تبويب «القرآن الكريم»: متابعة القراءة من حيث توقّفت، وتذكير سورة الكهف يوم الجمعة،
//  ووصول سريع للكهف والملك والبقرة ويس، وفهرس السور والأجزاء، والعلامات، واختيار القارئ.
//

import SwiftUI
import CoreText

struct QuranHomeView: View {
    @Environment(QuranStore.self) private var quran
    @Environment(QuranAudioPlayer.self) private var audio
    @Environment(QuranDownloads.self) private var downloads
    @Environment(AppRouter.self) private var router
    @Environment(AppSettings.self) private var settings
    @Environment(\.horizontalSizeClass) private var sizeClass

    enum Index: String, CaseIterable, Identifiable {
        case surahs, juz, bookmarks
        var id: String { rawValue }
        var title: String { L10n.t("quran.index.\(rawValue)") }
    }

    @State private var index: Index = .surahs
    @State private var query = ""
    @State private var showReciters = false

    private var isWide: Bool { sizeClass == .regular }
    private var arabicNames: Bool { settings.language == .arabic || settings.language == .persian }
    private let gold = [Color(red: 0.83, green: 0.64, blue: 0.3), Color(red: 0.55, green: 0.38, blue: 0.16)]

    var body: some View {
        ZStack {
            LiquidBackground(colors: [.green, .teal])

            ScrollView {
                LazyVStack(alignment: .leading, spacing: 20, pinnedViews: []) {
                    if quran.isLoaded {
                        continueCard
                        if Calendar.current.component(.weekday, from: .now) == 6 {
                            fridayCard
                        }
                        specialSection
                        qiblaCard
                        reciterRow
                        indexPicker
                        switch index {
                        case .surahs: surahList
                        case .juz: juzGrid
                        case .bookmarks: bookmarkList
                        }
                    } else {
                        ProgressView(L10n.t("quran.loading"))
                            .frame(maxWidth: .infinity, minHeight: 300)
                    }
                }
                .padding(.horizontal, isWide ? 40 : 18)
                .padding(.vertical, 12)
                .frame(maxWidth: 900)
                .frame(maxWidth: .infinity)
            }
            .scrollDismissesKeyboard(.immediately)
        }
        .navigationTitle(L10n.t("quran.title"))
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(.hidden, for: .navigationBar)
        .onAppear { quran.loadIfNeeded() }
        .sheet(isPresented: $showReciters) {
            ReciterPickerView()
                .presentationDetents([.medium, .large])
        }
    }

    // MARK: - Continue reading

    private var continueCard: some View {
        let page = quran.lastPage
        let surah = quran.surahs(onPage: page).first
        return Button { router.openMushaf(page: page) } label: {
            HStack(spacing: 16) {
                ZStack {
                    ProgressRing(progress: quran.khatmaProgress, colors: gold + [.green], lineWidth: 8)
                    VStack(spacing: 0) {
                        Text(L10n.t("common.percent", Int((quran.khatmaProgress * 100).rounded()).digits))
                            .font(.headline.weight(.heavy))
                        Text(L10n.t("quran.khatma")).font(.caption2).foregroundStyle(.secondary)
                    }
                }
                .frame(width: 78, height: 78)

                VStack(alignment: .leading, spacing: 6) {
                    Text(quran.lastReadDate == nil ? L10n.t("quran.start") : L10n.t("quran.continue"))
                        .font(.caption.weight(.heavy))
                        .foregroundStyle(gold[1])
                    if let surah {
                        Text(surahName(surah))
                            .font(.title2.weight(.heavy))
                            .foregroundStyle(.primary)
                    }
                    Text(L10n.t("quran.pageJuz", page.digits, quran.juz(forPage: page).digits))
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
                Spacer(minLength: 0)
                Image(systemName: "book.pages.fill")
                    .font(.system(size: 30))
                    .foregroundStyle(LinearGradient.diagonal(gold))
                    .flipsForRightToLeftLayoutDirection(true)
            }
            .padding(18)
            .glassCard(cornerRadius: 30, tint: .green, interactive: true)
        }
        .buttonStyle(PressableCardStyle())
    }

    private var fridayCard: some View {
        Button { router.openSurah(18, page: quran.surah(18)?.page ?? 293) } label: {
            HStack(spacing: 14) {
                Image(systemName: "sparkles")
                    .font(.title2)
                    .foregroundStyle(.white)
                    .frame(width: 48, height: 48)
                    .background(LinearGradient.diagonal([.indigo, .purple]), in: Circle())
                VStack(alignment: .leading, spacing: 3) {
                    Text(L10n.t("quran.friday.title")).font(.headline).foregroundStyle(.primary)
                    Text(L10n.t("quran.friday.body")).font(.caption).foregroundStyle(.secondary)
                }
                Spacer(minLength: 0)
                Image(systemName: "chevron.forward").foregroundStyle(.secondary)
            }
            .padding(16)
            .glassCard(cornerRadius: 24, tint: .indigo, interactive: true)
        }
        .buttonStyle(PressableCardStyle())
    }

    // MARK: - Special surahs

    private var specialSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            SectionHeader(title: L10n.t("quran.special"), symbol: "star.circle.fill")
            LazyVGrid(columns: [GridItem(.adaptive(minimum: isWide ? 190 : 150), spacing: 12)], spacing: 12) {
                ForEach(SpecialSurah.allCases) { special in
                    if let surah = quran.surah(special.rawValue) {
                        specialCard(special, surah)
                    }
                }
            }
        }
    }

    private func specialCard(_ special: SpecialSurah, _ surah: QuranSurah) -> some View {
        let colors = special.colors.themeColors
        return VStack(alignment: .leading, spacing: 10) {
            HStack {
                Image(systemName: special.symbol)
                    .font(.title3)
                    .foregroundStyle(.white)
                    .frame(width: 40, height: 40)
                    .background(LinearGradient.diagonal(colors), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                Spacer()
                Button {
                    audio.confinedSurah = surah.n
                    if let reciter = quran.reciter { audio.play(from: AyahRef(surah: surah.n, ayah: 1), reciter: reciter) }
                    router.openSurah(surah.n, page: surah.page)
                } label: {
                    Image(systemName: "play.circle.fill").font(.title2).foregroundStyle(colors.first ?? .teal)
                }
                .accessibilityLabel(L10n.t("quran.listen"))
            }
            Text(surah.ar)
                .font(.custom(QuranFont.name, size: 26))
                .foregroundStyle(.primary)
                .environment(\.layoutDirection, .rightToLeft)
            Text(L10n.t(special.noteKey))
                .font(.caption)
                .foregroundStyle(.secondary)
                .lineLimit(2)
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .glassCard(cornerRadius: 24, tint: colors.first ?? .teal, interactive: true, elevated: false)
        .contentShape(RoundedRectangle(cornerRadius: 24))
        .onTapGesture { router.openSurah(surah.n, page: surah.page) }
    }

    // MARK: - Qibla

    private var qiblaCard: some View {
        Button { router.showQibla = true } label: {
            HStack(spacing: 14) {
                Image(systemName: "location.north.circle.fill")
                    .font(.title2)
                    .foregroundStyle(.white)
                    .frame(width: 48, height: 48)
                    .background(LinearGradient.diagonal(gold), in: Circle())
                VStack(alignment: .leading, spacing: 3) {
                    Text(L10n.t("qibla.title")).font(.headline).foregroundStyle(.primary)
                    Text(L10n.t("qibla.subtitle")).font(.caption).foregroundStyle(.secondary)
                }
                Spacer(minLength: 0)
                Image(systemName: "chevron.forward").foregroundStyle(.secondary)
            }
            .padding(16)
            .glassCard(cornerRadius: 24, tint: .orange, interactive: true)
        }
        .buttonStyle(PressableCardStyle())
    }

    // MARK: - Reciter

    private var reciterRow: some View {
        Button { showReciters = true } label: {
            HStack(spacing: 12) {
                Image(systemName: "waveform.circle.fill")
                    .font(.title)
                    .foregroundStyle(LinearGradient.diagonal([.teal, .green]))
                VStack(alignment: .leading, spacing: 2) {
                    Text(L10n.t("quran.reciter")).font(.caption).foregroundStyle(.secondary)
                    Text(quran.reciter?.displayName(arabic: arabicNames) ?? "")
                        .font(.headline).foregroundStyle(.primary)
                }
                Spacer()
                if let reciter = quran.reciter {
                    Label(L10n.t("quran.offlineCount", downloads.offlineCount(reciter).digits,
                                 downloads.availableCount(reciter).digits), systemImage: "arrow.down.circle.fill")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.secondary)
                }
                Image(systemName: "chevron.up.chevron.down").font(.caption).foregroundStyle(.secondary)
            }
            .padding(14)
            .glassCard(cornerRadius: 22, tint: .teal, interactive: true, elevated: false)
        }
        .buttonStyle(PressableCardStyle())
    }

    // MARK: - Index

    private var indexPicker: some View {
        VStack(spacing: 12) {
            Picker("", selection: $index) {
                ForEach(Index.allCases) { Text($0.title).tag($0) }
            }
            .pickerStyle(.segmented)

            if index == .surahs {
                SearchField(text: $query, placeholder: L10n.t("quran.search"))
            }
        }
    }

    private var surahList: some View {
        LazyVStack(spacing: 10) {
            ForEach(quran.searchSurahs(query)) { surah in
                Button { router.openMushaf(page: surah.page) } label: { SurahRow(surah: surah, arabicNames: arabicNames) }
                    .buttonStyle(PressableCardStyle())
            }
        }
    }

    private var juzGrid: some View {
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 100), spacing: 12)], spacing: 12) {
            ForEach(quran.meta?.juz ?? [], id: \.juz) { juz in
                Button { router.openMushaf(page: juz.page) } label: {
                    VStack(spacing: 6) {
                        Text(juz.juz.digits)
                            .font(.title.weight(.heavy))
                            .foregroundStyle(LinearGradient.diagonal(gold))
                        Text(L10n.t("quran.juz")).font(.caption2.weight(.bold)).foregroundStyle(.secondary)
                        Text(quran.surah(juz.surah).map(surahName) ?? "")
                            .font(.caption)
                            .foregroundStyle(.primary)
                            .lineLimit(1)
                            .minimumScaleFactor(0.7)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 14)
                    .glassCard(cornerRadius: 20, tint: .green, interactive: true, elevated: false)
                }
                .buttonStyle(PressableCardStyle())
            }
        }
    }

    @ViewBuilder
    private var bookmarkList: some View {
        if quran.bookmarks.isEmpty {
            VStack(spacing: 10) {
                Image(systemName: "bookmark").font(.largeTitle).foregroundStyle(.secondary)
                Text(L10n.t("quran.noBookmarks")).font(.subheadline).foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
            }
            .frame(maxWidth: .infinity)
            .padding(30)
            .glassCard(cornerRadius: 24, elevated: false)
        } else {
            LazyVStack(spacing: 10) {
                ForEach(quran.bookmarks, id: \.self) { page in
                    Button { router.openMushaf(page: page) } label: {
                        HStack(spacing: 12) {
                            Image(systemName: "bookmark.fill").foregroundStyle(.orange)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(quran.surahs(onPage: page).map(surahName).joined(separator: " · "))
                                    .font(.headline).foregroundStyle(.primary)
                                Text(L10n.t("quran.pageJuz", page.digits, quran.juz(forPage: page).digits))
                                    .font(.caption).foregroundStyle(.secondary)
                            }
                            Spacer()
                            Image(systemName: "chevron.forward").foregroundStyle(.secondary)
                        }
                        .padding(14)
                        .glassCard(cornerRadius: 20, tint: .orange, interactive: true, elevated: false)
                    }
                    .buttonStyle(PressableCardStyle())
                }
            }
        }
    }

    private func surahName(_ surah: QuranSurah) -> String {
        arabicNames ? L10n.t("quran.surahName", surah.ar) : surah.en
    }
}

// MARK: - Surah row

struct SurahRow: View {
    let surah: QuranSurah
    var arabicNames: Bool

    var body: some View {
        HStack(spacing: 14) {
            ZStack {
                Image(systemName: "seal.fill")
                    .font(.system(size: 42))
                    .foregroundStyle(LinearGradient.diagonal([.teal, .green]))
                Text(surah.n.digits)
                    .font(.caption.weight(.heavy))
                    .foregroundStyle(.white)
            }
            VStack(alignment: .leading, spacing: 3) {
                Text(arabicNames ? surah.ar : surah.en)
                    .font(.headline)
                    .foregroundStyle(.primary)
                Text(L10n.t(surah.isMeccan ? "quran.meccan" : "quran.medinan") + " · " +
                     L10n.t("quran.ayahCount", surah.count.digits) +
                     (arabicNames ? "" : " · " + surah.meaning))
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
            Spacer(minLength: 6)
            Text(surah.ar)
                .font(.custom(QuranFont.name, size: 22))
                .foregroundStyle(.primary.opacity(0.85))
            Text(surah.page.digits)
                .font(.caption.monospacedDigit().weight(.semibold))
                .foregroundStyle(.secondary)
                .frame(minWidth: 28)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .glassCard(cornerRadius: 20, tint: .green, elevated: false)
        .accessibilityElement(children: .combine)
    }
}

/// خط المصحف (Amiri Quran، رخصة SIL OFL) يُسجَّل عند تشغيل التطبيق.
enum QuranFont {
    static let name = "AmiriQuran-Regular"

    static func register() {
        guard let url = Bundle.main.url(forResource: "AmiriQuran-Regular", withExtension: "ttf") else { return }
        CTFontManagerRegisterFontsForURL(url as CFURL, .process, nil)
    }
}
