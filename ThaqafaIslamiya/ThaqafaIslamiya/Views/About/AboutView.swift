//
//  AboutView.swift
//  ثقافة إسلامية
//
//  عن الكتاب ومؤلفه، وملخّص تقدّم الطفل، مع إمكانية البدء من جديد.
//

import SwiftUI

struct AboutView: View {
    @Environment(LibraryViewModel.self) private var library
    @Environment(ProgressStore.self) private var progress
    @Environment(AppSettings.self) private var settings
    @State private var confirmReset = false

    var body: some View {
        ZStack {
            LiquidBackground()

            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    if let book = library.book {
                        VStack(alignment: .leading, spacing: 10) {
                            Label(L10n.t("about.book"), systemImage: "book.closed.fill")
                                .font(.title2.weight(.bold))
                            Text(book.title).font(.title3.weight(.heavy))
                            Text(L10n.t("about.author", book.author)).foregroundStyle(.secondary)
                            Text(book.about).lineSpacing(5)
                            Divider()
                            ForEach(book.structure, id: \.self) { item in
                                Label(item, systemImage: "circle.fill")
                                    .labelStyle(BulletLabelStyle())
                            }
                        }
                        .padding(22)
                        .glassCard(cornerRadius: 30, tint: .teal)
                    }

                    VStack(alignment: .leading, spacing: 12) {
                        Label(L10n.t("home.myProgress"), systemImage: "chart.bar.fill")
                            .font(.title2.weight(.bold))
                        ForEach(library.chapters) { chapter in
                            HStack {
                                Text(chapter.title).font(.subheadline.weight(.semibold))
                                Spacer()
                                Text("\(progress.learnedCount(in: chapter).digits)/\(chapter.masail.count.digits)")
                                    .font(.caption.weight(.bold))
                                    .foregroundStyle(.secondary)
                            }
                            GlassProgressBar(progress: progress.progress(for: chapter),
                                             colors: chapter.colors.themeColors, height: 8)
                        }
                        Text(L10n.t("about.lessonsDone", progress.completedLessons.count.digits, library.lessons.count.digits))
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                            .padding(.top, 4)

                        Button(role: .destructive) { confirmReset = true } label: {
                            Label(L10n.t("about.reset"), systemImage: "arrow.counterclockwise")
                        }
                        .buttonStyle(GlassButtonStyle(tint: .red))
                        .padding(.top, 6)
                    }
                    .padding(22)
                    .glassCard(cornerRadius: 30, tint: .indigo)

                    Text(settings.language == .arabic ? L10n.t("about.offline") : L10n.t("about.offline") + "\n" + L10n.t("about.translationNote"))
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                        .frame(maxWidth: .infinity)
                        .multilineTextAlignment(.center)
                }
                .padding(18)
                .frame(maxWidth: 760)
                .frame(maxWidth: .infinity)
            }
        }
        .navigationTitle(L10n.t("about.title"))
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(.hidden, for: .navigationBar)
        .confirmationDialog(L10n.t("about.resetConfirm"), isPresented: $confirmReset, titleVisibility: .visible) {
            Button(L10n.t("about.resetAction"), role: .destructive) { progress.resetAll() }
            Button(L10n.t("common.cancel"), role: .cancel) {}
        }
    }
}

private struct BulletLabelStyle: LabelStyle {
    func makeBody(configuration: Configuration) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 10) {
            configuration.icon
                .font(.system(size: 7))
                .foregroundStyle(.teal)
            configuration.title
                .font(.callout)
        }
    }
}
