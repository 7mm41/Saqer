//
//  MushafReaderView.swift
//  ثقافة إسلامية
//
//  قارئ المصحف: صفحات المصحف المدني (طبعة مجمع الملك فهد) بملء الشاشة.
//  - التنقّل بالسحب من اليسار إلى اليمين كتقليب المصحف، ويُحفظ موضع القراءة تلقائيًا في كل صفحة.
//  - «استمع» يبدأ القارئ من أول آية في الصفحة الحالية، والمصحف يتابع التلاوة صفحة بصفحة.
//  - التفسير والترجمة لآيات الصفحة، والعلامات، والوضع الليلي للصفحات.
//

import SwiftUI
import UIKit

struct MushafReaderView: View {
    let startPage: Int

    @Environment(QuranStore.self) private var quran
    @Environment(QuranAudioPlayer.self) private var audio
    @Environment(AppSettings.self) private var settings
    @Environment(\.dismiss) private var dismiss

    @State private var page: Int?
    @State private var chrome = true
    @State private var showTafsir = false
    @State private var showReciters = false

    private var current: Int { page ?? startPage }
    private var arabicNames: Bool { settings.language == .arabic || settings.language == .persian }

    var body: some View {
        ZStack {
            (quran.nightPages ? Color.black : Color(red: 0.99, green: 0.98, blue: 0.95))
                .ignoresSafeArea()

            pager

            VStack(spacing: 0) {
                if chrome {
                    topBar
                        .transition(.move(edge: .top).combined(with: .opacity))
                }
                Spacer()
                if let notice = audio.notice {
                    noticeBanner(notice)
                }
                if chrome || audio.isActive {
                    playerBar
                        .transition(.move(edge: .bottom).combined(with: .opacity))
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 6)
        }
        .statusBarHidden(!chrome)
        .onAppear {
            quran.loadIfNeeded()
            page = startPage
            quran.saveLastPage(startPage)
        }
        .onChange(of: page) { _, newPage in
            if let newPage { quran.saveLastPage(newPage) }
        }
        .onChange(of: audio.current) { _, ref in
            // متابعة التلاوة: الانتقال إلى صفحة الآية التي تُتلى
            guard quran.followRecitation, let ref else { return }
            let target = quran.page(of: ref)
            if target != current {
                withAnimation(.easeInOut(duration: 0.35)) { page = target }
            }
        }
        .sheet(isPresented: $showTafsir) {
            PageTafsirView(page: current)
                .presentationDetents([.medium, .large])
                .presentationBackground(.regularMaterial)
        }
        .sheet(isPresented: $showReciters) {
            ReciterPickerView()
                .presentationDetents([.medium, .large])
        }
    }

    // MARK: - Pager

    private var pager: some View {
        ScrollView(.horizontal) {
            LazyHStack(spacing: 0) {
                ForEach(1...QuranStore.pageCount, id: \.self) { p in
                    MushafPageView(page: p, night: quran.nightPages)
                        .containerRelativeFrame(.horizontal)
                        .id(p)
                }
            }
            .scrollTargetLayout()
        }
        .scrollTargetBehavior(.paging)
        .scrollIndicators(.hidden)
        .scrollPosition(id: $page)
        // المصحف يُقلَّب من اليمين إلى اليسار: السحب من اليسار إلى اليمين يعرض الصفحة التالية
        .environment(\.layoutDirection, .rightToLeft)
        .ignoresSafeArea(edges: .bottom)
        .onTapGesture {
            withAnimation(.easeInOut(duration: 0.25)) { chrome.toggle() }
        }
    }

    // MARK: - Top bar

    private var topBar: some View {
        let surahs = quran.surahs(onPage: current)
        @Bindable var store = quran
        return HStack(spacing: 10) {
            Button { audio.stop(); dismiss() } label: {
                Image(systemName: "xmark").font(.headline.weight(.bold)).frame(width: 42, height: 42).glassCircle()
            }
            .buttonStyle(PressableCardStyle())
            .accessibilityLabel(L10n.t("common.close"))

            VStack(spacing: 2) {
                Text(surahs.map { arabicNames ? L10n.t("quran.surahName", $0.ar) : $0.en }.joined(separator: " · "))
                    .font(.headline)
                    .lineLimit(1)
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
                Toggle(isOn: $store.nightPages) { Label(L10n.t("quran.nightPages"), systemImage: "moon.fill") }
                Toggle(isOn: $store.followRecitation) { Label(L10n.t("quran.follow"), systemImage: "arrow.left.arrow.right") }
                Button { showReciters = true } label: { Label(L10n.t("quran.reciter"), systemImage: "person.wave.2.fill") }
            } label: {
                Image(systemName: quran.isBookmarked(current) ? "bookmark.fill" : "ellipsis")
                    .font(.headline.weight(.bold))
                    .foregroundStyle(quran.isBookmarked(current) ? Color.orange : Color.primary)
                    .frame(width: 42, height: 42)
                    .glassCircle()
            }
        }
    }

    // MARK: - Player

    private var playerBar: some View {
        let playingHere = audio.current.map { quran.page(of: $0) == current } ?? false
        return GlassGroup(spacing: 12) {
            HStack(spacing: 12) {
                Button { showTafsir = true } label: {
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
                        } else if let first = quran.firstAyah(onPage: current), let reciter = quran.reciter {
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

// MARK: - Page image

/// صفحة المصحف (صورة WebP مدمجة) تُحمَّل في الخلفية مع ذاكرة مؤقتة.
struct MushafPageView: View {
    let page: Int
    var night: Bool

    @State private var image: UIImage?

    var body: some View {
        ZStack {
            if let image {
                Image(uiImage: image)
                    .resizable()
                    .interpolation(.high)
                    .scaledToFit()
                    .modifier(NightPage(active: night))
                    .padding(.horizontal, 4)
                    .accessibilityLabel(L10n.t("quran.pageLabel", page.digits))
            } else {
                ProgressView()
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .task(id: page) {
            image = await MushafImages.shared.image(page)
            MushafImages.shared.prefetch(around: page)
        }
    }
}

private struct NightPage: ViewModifier {
    let active: Bool
    func body(content: Content) -> some View {
        if active {
            content.colorInvert().hueRotation(.degrees(180)).brightness(-0.04)
        } else {
            content
        }
    }
}

/// ذاكرة مؤقتة لصور الصفحات (تُفكّ في الخلفية لتقليب سلس).
final class MushafImages: @unchecked Sendable {
    static let shared = MushafImages()
    private let cache = NSCache<NSNumber, UIImage>()

    init() { cache.countLimit = 14 }

    func image(_ page: Int) async -> UIImage? {
        if let cached = cache.object(forKey: page as NSNumber) { return cached }
        let loaded = await Task.detached(priority: .userInitiated) { () -> UIImage? in
            guard let path = Bundle.main.path(forResource: String(format: "mushaf_%03d", page), ofType: "webp"),
                  let image = UIImage(contentsOfFile: path) else { return nil }
            return image.preparingForDisplay() ?? image
        }.value
        if let loaded { cache.setObject(loaded, forKey: page as NSNumber) }
        return loaded
    }

    func prefetch(around page: Int) {
        for p in [page + 1, page - 1, page + 2] where (1...QuranStore.pageCount).contains(p) {
            if cache.object(forKey: p as NSNumber) == nil {
                Task.detached(priority: .utility) { _ = await self.image(p) }
            }
        }
    }
}
