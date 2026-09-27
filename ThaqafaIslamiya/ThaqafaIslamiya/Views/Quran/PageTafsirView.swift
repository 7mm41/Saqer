//
//  PageTafsirView.swift
//  ثقافة إسلامية
//
//  آيات الصفحة الحالية بالرسم العثماني، مع التفسير الميسّر (مجمع الملك فهد) والترجمة بلغة التطبيق،
//  وزر للاستماع من أي آية.
//

import SwiftUI

struct PageTafsirView: View {
    let page: Int

    @Environment(QuranStore.self) private var quran
    @Environment(QuranAudioPlayer.self) private var audio
    @Environment(AppSettings.self) private var settings
    @State private var showTafsir = true

    private var arabic: Bool { settings.language == .arabic }

    var body: some View {
        NavigationStack {
            ScrollViewReader { reader in
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 14) {
                        ForEach(quran.ayahs(onPage: page), id: \.self) { ref in
                            if ref.ayah == 1, let s = quran.surah(ref.surah) {
                                surahHeader(s)
                            }
                            ayahCard(ref)
                                .id(ref)
                        }
                    }
                    .padding(16)
                }
                .onAppear {
                    if let current = audio.current, quran.page(of: current) == page {
                        reader.scrollTo(current, anchor: .center)
                    }
                }
            }
            .navigationTitle(L10n.t("quran.tafsirTitle", page.digits))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                if !arabic {
                    ToolbarItem(placement: .topBarTrailing) {
                        Toggle(isOn: $showTafsir) { Text(L10n.t("quran.showTafsir")) }
                            .toggleStyle(.button)
                            .font(.caption.weight(.bold))
                    }
                }
            }
        }
    }

    private func surahHeader(_ surah: QuranSurah) -> some View {
        VStack(spacing: 6) {
            Text(L10n.t("quran.surahName", surah.ar))
                .font(.custom(QuranFont.name, size: 28))
            if surah.n != 1 && surah.n != 9, let basmala = quran.meta?.basmala {
                Text(basmala).font(.custom(QuranFont.name, size: 22)).foregroundStyle(.secondary)
            }
        }
        .environment(\.layoutDirection, .rightToLeft)
        .frame(maxWidth: .infinity)
        .padding(.vertical, 12)
        .background(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .fill(LinearGradient(colors: [Color.green.opacity(0.15), Color.teal.opacity(0.08)], startPoint: .leading, endPoint: .trailing))
        )
        .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).strokeBorder(Color.green.opacity(0.35), lineWidth: 1))
    }

    private func ayahCard(_ ref: AyahRef) -> some View {
        let playing = audio.current == ref
        return VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text(L10n.t("quran.ayahNumber", ref.ayah.digits))
                    .font(.caption.weight(.heavy))
                    .padding(.horizontal, 10).padding(.vertical, 4)
                    .glassCapsule(tint: .green, interactive: false)
                if quran.isSajda(ref) {
                    Label(L10n.t("quran.sajda"), systemImage: "arrow.down.to.line")
                        .font(.caption2.weight(.bold)).foregroundStyle(.orange)
                }
                Spacer()
                Button {
                    if let reciter = quran.reciter { audio.play(from: ref, reciter: reciter) }
                } label: {
                    Image(systemName: playing ? "speaker.wave.2.fill" : "play.circle.fill")
                        .font(.title3)
                        .foregroundStyle(.green)
                        .symbolEffect(.variableColor.iterative, isActive: playing && audio.isPlaying)
                }
                .accessibilityLabel(L10n.t("quran.listenFromHere"))
            }

            Text(quran.text(ref) + " \u{FD3F}" + ref.ayah.arabicIndic + "\u{FD3E}")
                .font(.custom(QuranFont.name, size: 25))
                .lineSpacing(12)
                .frame(maxWidth: .infinity, alignment: .leading)
                .environment(\.layoutDirection, .rightToLeft)
                .fixedSize(horizontal: false, vertical: true)

            if let translation = quran.translation(ref, language: settings.language) {
                Text(translation)
                    .font(.callout)
                    .fixedSize(horizontal: false, vertical: true)
            }

            if arabic || showTafsir {
                VStack(alignment: .leading, spacing: 4) {
                    Text(L10n.t("quran.tafsirName"))
                        .font(.caption2.weight(.heavy))
                        .foregroundStyle(.green)
                    Text(quran.tafsir(ref))
                        .font(.callout)
                        .foregroundStyle(.secondary)
                        .lineSpacing(4)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .environment(\.layoutDirection, .rightToLeft)
            }
        }
        .padding(14)
        .glassCard(cornerRadius: 22, tint: playing ? .green : .white, elevated: false)
        .animation(.easeInOut(duration: 0.25), value: playing)
    }
}

extension Int {
    /// الرقم بالأرقام العربية الهندية دائمًا (لأرقام الآيات في النص القرآني).
    var arabicIndic: String {
        let digits = ["٠", "١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩"]
        return String(self).map { digits[Int(String($0)) ?? 0] }.joined()
    }
}
