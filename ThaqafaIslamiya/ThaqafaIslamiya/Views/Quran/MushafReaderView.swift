//
//  MushafReaderView.swift
//  ثقافة إسلامية
//
//  قارئ المصحف: صفحات المصحف المدني مرسومة نصًّا بخطوط مجمع الملك فهد على ورقة متناسقة مع خلفية التطبيق.
//  - التنقّل بالسحب من اليسار إلى اليمين كتقليب المصحف، ويُحفظ موضع القراءة تلقائيًا في كل صفحة.
//  - «استمع» يبدأ القارئ من أول آية في الصفحة الحالية، مع تظليل الآية التي تُتلى ومتابعة الصفحات.
//  - وضع السورة الواحدة (الكهف، الملك…): التقليب محصور في صفحات السورة، والتلاوة تتوقف عند نهايتها.
//  - الضغط المطوّل على آية يفتح تفسيرها وترجمتها، مع العلامات والوضع الليلي.
//

import SwiftUI
import UIKit

struct MushafReaderView: View {
    let launch: AppRouter.MushafLaunch

    @Environment(QuranStore.self) private var quran
    @Environment(QuranAudioPlayer.self) private var audio
    @Environment(AppSettings.self) private var settings
    @Environment(AppRouter.self) private var router

    @State private var page: Int?
    @State private var chrome = true
    @State private var tafsir: TafsirTarget?
    @State private var showReciters = false

    init(launch: AppRouter.MushafLaunch) {
        self.launch = launch
        _page = State(initialValue: launch.page)
    }

    private var current: Int { page ?? launch.page }
    private var arabicNames: Bool { settings.language == .arabic || settings.language == .persian }
    private var confined: QuranSurah? { launch.surah.flatMap(quran.surah) }

    /// الصفحات المتاحة: المصحف كله، أو صفحات السورة وحدها.
    private var range: ClosedRange<Int> {
        guard let n = launch.surah, quran.isLoaded else { return 1...QuranStore.pageCount }
        return quran.pageRange(ofSurah: n)
    }

    var body: some View {
        ZStack {
            background

            if quran.isLoaded, let layout = quran.layout {
                pager(layout)
                    .transition(.opacity)
            } else {
                ProgressView(L10n.t("quran.loading"))
            }

            VStack(spacing: 0) {
                if chrome {
                    topBar
                        .transition(.move(edge: .top).combined(with: .opacity))
                }
                Spacer()
                if let notice = audio.notice {
                    noticeBanner(notice)
                }
                if let surah = confined, current == range.upperBound || audio.completedSurah == surah.n {
                    completionBanner(surah)
                        .transition(.move(edge: .bottom).combined(with: .opacity))
                }
                if chrome || audio.isActive {
                    playerBar
                        .transition(.move(edge: .bottom).combined(with: .opacity))
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 6)
            .animation(.spring(response: 0.4, dampingFraction: 0.85), value: current == range.upperBound)
        }
        .animation(.easeInOut(duration: 0.3), value: quran.layout != nil)
        .statusBarHidden(!chrome)
        .onAppear {
            quran.loadIfNeeded()
            quran.loadLayoutIfNeeded()
            audio.confinedSurah = launch.surah
            if launch.surah == nil { quran.saveLastPage(launch.page) }
        }
        .onDisappear {
            if audio.confinedSurah == launch.surah { audio.confinedSurah = nil }
        }
        .onChange(of: page) { _, newPage in
            guard let newPage else { return }
            // وضع السورة الواحدة لا يغيّر موضع الختمة
            if launch.surah == nil { quran.saveLastPage(newPage) }
            prefetchFonts(around: newPage)
        }
        .onChange(of: audio.current) { _, ref in
            // متابعة التلاوة: الانتقال إلى صفحة الآية التي تُتلى
            guard quran.followRecitation, let ref else { return }
            let target = quran.page(of: ref)
            if target != current, range.contains(target) {
                withAnimation(.easeInOut(duration: 0.35)) { page = target }
            }
        }
        .sheet(item: $tafsir) { target in
            PageTafsirView(page: target.page, focus: target.ayah)
                .presentationDetents([.medium, .large])
                .presentationBackground(.regularMaterial)
        }
        .sheet(isPresented: $showReciters) {
            ReciterPickerView()
                .presentationDetents([.medium, .large])
        }
    }

    private func close() {
        audio.stop()
        audio.confinedSurah = nil
        router.closeMushaf()
    }

    // MARK: - Background

    private var background: some View {
        ZStack {
            LiquidBackground(colors: [.green, .teal])
            if quran.nightPages {
                Color.black.opacity(0.82).ignoresSafeArea()
            }
        }
    }

    // MARK: - Pager

    /// التقليب يمينًا كالمصحف: الصفحات مرتبة تنازليًا في شريط يسار ← يمين، فالسحب من اليسار إلى اليمين
    /// يعرض الصفحة التالية. (شريط يمين ← يسار مع scrollPosition كان يُبلغ عن الصفحة المجاورة.)
    private func pager(_ layout: MushafLayout) -> some View {
        let pages = Array(range.reversed())
        return GeometryReader { proxy in
            // مساحة ثابتة للشريطين العلوي والسفلي: الصفحة لا تقفز عند إظهارهما أو إخفائهما
            let top = proxy.safeAreaInsets.top + 58
            let bottom = proxy.safeAreaInsets.bottom + 86
            ScrollViewReader { reader in
                ScrollView(.horizontal) {
                    LazyHStack(spacing: 0) {
                        ForEach(pages, id: \.self) { p in
                            sheet(p, layout: layout)
                                .padding(.top, top)
                                .padding(.bottom, bottom)
                                .padding(.horizontal, 8)
                                .containerRelativeFrame([.horizontal, .vertical])
                                .id(p)
                        }
                    }
                    .scrollTargetLayout()
                }
                .scrollTargetBehavior(.paging)
                .scrollIndicators(.hidden)
                .scrollPosition(id: $page)
                .environment(\.layoutDirection, .leftToRight)
                .ignoresSafeArea()
                .onAppear {
                    let start = min(max(launch.page, range.lowerBound), range.upperBound)
                    page = start
                    reader.scrollTo(start)
                    prefetchFonts(around: start)
                }
            }
        }
        .onTapGesture {
            withAnimation(.easeInOut(duration: 0.25)) { chrome.toggle() }
        }
    }

    private func sheet(_ p: Int, layout: MushafLayout) -> some View {
        MushafPageTextView(
            page: p,
            layout: layout.pages[p - 1],
            target: layout.target,
            basmala: quran.basmalaCodes,
            night: quran.nightPages,
            highlighted: audio.current.map(quran.globalIndex),
            header: pageHeader(p),
            onAyahAction: { g, action in
                let ref = quran.ref(forGlobal: g)
                switch action {
                case .tafsir:
                    tafsir = TafsirTarget(page: p, ayah: ref)
                case .listen:
                    if let reciter = quran.reciter { audio.play(from: ref, reciter: reciter) }
                }
            }
        )
    }

    /// ترويسة الصفحة كما في المصحف المطبوع: اسم السورة والجزء.
    private func pageHeader(_ p: Int) -> (surah: String, juz: String) {
        let name = quran.surahs(onPage: p).first.map { "سورة " + $0.ar } ?? ""
        return (name, "الجزء " + quran.juz(forPage: p).arabicIndic)
    }

    /// تجهيز خطوط الصفحة وجاراتها في الخلفية لتقليب سلس.
    private func prefetchFonts(around p: Int) {
        let neighbours = [p - 1, p + 1, p - 2, p + 2].filter { (1...QuranStore.pageCount).contains($0) }
        Task.detached(priority: .utility) {
            for n in [p] + neighbours { QuranFonts.preload(page: n) }
        }
    }

    // MARK: - Top bar

    private var topBar: some View {
        let surahs = quran.surahs(onPage: current)
        @Bindable var store = quran
        return HStack(spacing: 10) {
            Button(action: close) {
                Image(systemName: "xmark")
                    .font(.headline.weight(.bold))
                    .foregroundStyle(.primary)
                    .frame(width: 44, height: 44)
                    .glassCircle(interactive: false)
                    .contentShape(Circle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(L10n.t("common.close"))

            VStack(spacing: 2) {
                if let surah = confined {
                    Text(L10n.t("quran.confined", arabicNames ? L10n.t("quran.surahName", surah.ar) : surah.en))
                        .font(.headline)
                        .lineLimit(1)
                } else {
                    Text(surahs.map { arabicNames ? L10n.t("quran.surahName", $0.ar) : $0.en }.joined(separator: " · "))
                        .font(.headline)
                        .lineLimit(1)
                }
                Text(L10n.t("quran.pageJuz", current.digits, quran.juz(forPage: current).digits))
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .contentTransition(.numericText())
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 6)
            .glassCapsule(interactive: false)

            Menu {
                Button {
                    quran.toggleBookmark(current)
                } label: {
                    Label(quran.isBookmarked(current) ? L10n.t("quran.removeBookmark") : L10n.t("quran.addBookmark"),
                          systemImage: quran.isBookmarked(current) ? "bookmark.slash" : "bookmark")
                }
                Button { tafsir = TafsirTarget(page: current, ayah: nil) } label: {
                    Label(L10n.t("quran.tafsir"), systemImage: "text.book.closed")
                }
                Toggle(isOn: $store.nightPages) { Label(L10n.t("quran.nightPages"), systemImage: "moon.fill") }
                Toggle(isOn: $store.followRecitation) { Label(L10n.t("quran.follow"), systemImage: "arrow.left.arrow.right") }
                Button { showReciters = true } label: { Label(L10n.t("quran.reciter"), systemImage: "person.wave.2.fill") }
                Text(L10n.t("quran.pressHint"))
            } label: {
                Image(systemName: quran.isBookmarked(current) ? "bookmark.fill" : "ellipsis")
                    .font(.headline.weight(.bold))
                    .foregroundStyle(quran.isBookmarked(current) ? Color.orange : Color.primary)
                    .frame(width: 44, height: 44)
                    .glassCircle()
            }
        }
    }

    // MARK: - Player

    private var playerBar: some View {
        let playingHere = audio.current.map { quran.page(of: $0) == current } ?? false
        return GlassGroup(spacing: 12) {
            HStack(spacing: 12) {
                Button { tafsir = TafsirTarget(page: current, ayah: audio.current) } label: {
                    Image(systemName: "text.book.closed.fill").font(.title3).frame(width: 46, height: 46).glassCircle(tint: .green)
                }
                .buttonStyle(PressableCardStyle())
                .accessibilityLabel(L10n.t("quran.tafsir"))

                HStack(spacing: 14) {
                    if audio.isActive {
                        Button { audio.step(-1) } label: { Image(systemName: "backward.fill") }
                            .flipsForRightToLeftLayoutDirection(true)
                    }
                    Button {
                        if audio.isActive && playingHere {
                            audio.togglePause()
                        } else if let first = firstAyahToPlay(), let reciter = quran.reciter {
                            audio.play(from: first, reciter: reciter)
                        }
                    } label: {
                        ZStack {
                            if audio.isLoading {
                                ProgressView().tint(.white)
                            } else {
                                Image(systemName: audio.isPlaying && playingHere ? "pause.fill" : "play.fill")
                                    .contentTransition(.symbolEffect(.replace))
                            }
                        }
                        .font(.title2)
                        .foregroundStyle(.white)
                        .frame(width: 54, height: 54)
                        .background(LinearGradient.diagonal([.teal, .green]), in: Circle())
                    }
                    .accessibilityLabel(L10n.t("quran.listenPage"))
                    if audio.isActive {
                        Button { audio.step(1) } label: { Image(systemName: "forward.fill") }
                            .flipsForRightToLeftLayoutDirection(true)
                    }
                }
                .font(.title3)
                .foregroundStyle(.primary)

                VStack(alignment: .leading, spacing: 2) {
                    if let ref = audio.current, let s = quran.surah(ref.surah) {
                        Text(L10n.t("quran.nowPlaying", arabicNames ? s.ar : s.en, ref.ayah.digits))
                            .font(.subheadline.weight(.bold))
                            .lineLimit(1)
                            .contentTransition(.numericText())
                    } else {
                        Text(L10n.t("quran.listenPage")).font(.subheadline.weight(.bold))
                    }
                    Button { showReciters = true } label: {
                        Text((audio.activeReciter ?? quran.reciter)?.displayName(arabic: arabicNames) ?? "")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                    }
                    .buttonStyle(.plain)
                }
                .frame(maxWidth: .infinity, alignment: .leading)

                if audio.isActive {
                    Button { audio.stop() } label: {
                        Image(systemName: "stop.fill").font(.body).frame(width: 40, height: 40).glassCircle()
                    }
                    .buttonStyle(PressableCardStyle())
                }
            }
            .padding(10)
            .glassCard(cornerRadius: 34, tint: .green, elevated: false)
        }
    }

    /// أول آية تُتلى في الصفحة — في وضع السورة الواحدة لا تبدأ قبل أول السورة (صفحة الكهف تبدأ بآخر الإسراء).
    private func firstAyahToPlay() -> AyahRef? {
        guard let first = quran.firstAyah(onPage: current) else { return nil }
        if let n = launch.surah, first.surah != n {
            return AyahRef(surah: n, ayah: 1)
        }
        return first
    }

    // MARK: - Banners

    private func completionBanner(_ surah: QuranSurah) -> some View {
        HStack(spacing: 12) {
            Image(systemName: "checkmark.seal.fill")
                .font(.title2)
                .foregroundStyle(LinearGradient.diagonal([.green, .teal]))
                .symbolEffect(.bounce, value: audio.completedSurah)
            Text(L10n.t("quran.confined.done", arabicNames ? L10n.t("quran.surahName", surah.ar) : surah.en))
                .font(.subheadline.weight(.bold))
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 0)
            Button {
                audio.stop()
                withAnimation(.easeInOut(duration: 0.4)) { page = range.lowerBound }
            } label: {
                Text(L10n.t("quran.confined.restart"))
                    .font(.caption.weight(.heavy))
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                    .glassCapsule(tint: .green)
            }
            .buttonStyle(.plain)
        }
        .padding(12)
        .glassCard(cornerRadius: 22, tint: .green, elevated: false)
        .padding(.bottom, 8)
    }

    private func noticeBanner(_ text: String) -> some View {
        HStack(spacing: 10) {
            Image(systemName: "info.circle.fill").foregroundStyle(.orange)
            Text(text).font(.caption.weight(.semibold)).fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 0)
            Button { audio.notice = nil } label: { Image(systemName: "xmark").font(.caption.weight(.bold)) }
        }
        .padding(12)
        .glassCard(cornerRadius: 18, tint: .orange, elevated: false)
        .padding(.bottom, 8)
    }
}

/// هدف التفسير: صفحة، وآية اختيارية يُمرَّر إليها.
struct TafsirTarget: Identifiable, Hashable {
    let page: Int
    let ayah: AyahRef?
    var id: String { "\(page)-\(ayah.map { "\($0.surah):\($0.ayah)" } ?? "")" }
}
