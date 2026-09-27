//
//  ReciterPickerView.swift
//  ثقافة إسلامية
//
//  اختيار القارئ، وتحميل تلاوته كاملة للاستماع دون إنترنت، أو حذف التحميلات.
//  سور الكهف والملك والفاتحة ويس والرحمن والواقعة وجزء عمّ بصوت هزاع البلوشي، والبقرة بصوت العفاسي، مدمجة في التطبيق.
//

import SwiftUI

struct ReciterPickerView: View {
    @Environment(QuranStore.self) private var quran
    @Environment(QuranDownloads.self) private var downloads
    @Environment(QuranAudioPlayer.self) private var audio
    @Environment(AppSettings.self) private var settings
    @Environment(\.dismiss) private var dismiss

    @State private var confirmDelete: QuranReciter?

    private var arabicNames: Bool { settings.language == .arabic || settings.language == .persian }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    ForEach(quran.reciters) { reciter in
                        row(reciter)
                    }
                } footer: {
                    Text(L10n.t("quran.offlineFooter"))
                }
            }
            .navigationTitle(L10n.t("quran.reciters"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button(L10n.t("common.done")) { dismiss() }.fontWeight(.bold)
                }
            }
            .confirmationDialog(L10n.t("quran.deleteConfirm"), isPresented: Binding(
                get: { confirmDelete != nil }, set: { if !$0 { confirmDelete = nil } }), titleVisibility: .visible) {
                Button(L10n.t("quran.delete"), role: .destructive) {
                    if let r = confirmDelete { downloads.deleteDownloads(r) }
                }
                Button(L10n.t("common.cancel"), role: .cancel) {}
            }
        }
    }

    private func row(_ reciter: QuranReciter) -> some View {
        let selected = quran.reciterKey == reciter.key
        let offline = downloads.offlineCount(reciter)
        let total = downloads.availableCount(reciter)
        let bulk = downloads.bulkReciter == reciter.key
        return HStack(spacing: 12) {
            Button {
                withAnimation { quran.reciterKey = reciter.key }
                if let current = audio.current, audio.isPlaying { audio.play(from: current, reciter: reciter) }
            } label: {
                HStack(spacing: 12) {
                    Image(systemName: selected ? "checkmark.circle.fill" : "circle")
                        .font(.title3)
                        .foregroundStyle(selected ? Color.green : Color.secondary)
                    VStack(alignment: .leading, spacing: 3) {
                        Text(reciter.displayName(arabic: arabicNames))
                            .font(.headline)
                            .foregroundStyle(.primary)
                        if bulk {
                            ProgressView(value: Double(downloads.bulkDone), total: Double(max(downloads.bulkTotal, 1)))
                                .tint(.green)
                        }
                        Text(L10n.t("quran.offlineCount", offline.digits, total.digits)
                             + (reciter.missing.isEmpty ? "" : " · " + L10n.t("quran.partial", total.digits)))
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
            }
            .buttonStyle(.plain)

            Spacer()

            if bulk {
                Button { downloads.cancelAll() } label: { Image(systemName: "xmark.circle.fill").foregroundStyle(.secondary) }
                    .buttonStyle(.borderless)
            } else if offline < total {
                Button { downloads.downloadAll(reciter) } label: {
                    Image(systemName: "icloud.and.arrow.down").font(.title3)
                }
                .buttonStyle(.borderless)
                .accessibilityLabel(L10n.t("quran.downloadAll"))
            } else {
                Image(systemName: "checkmark.icloud.fill").foregroundStyle(.green)
            }
        }
        .padding(.vertical, 4)
        .swipeActions {
            if downloads.downloadedBytes(reciter) > 0 {
                Button(role: .destructive) { confirmDelete = reciter } label: {
                    Label(L10n.t("quran.delete"), systemImage: "trash")
                }
            }
        }
    }
}
