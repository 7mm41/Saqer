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
    @State private var confirmReset = false

    var body: some View {
        ZStack {
            LiquidBackground()

            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    if let book = library.book {
                        VStack(alignment: .leading, spacing: 10) {
                            Label("عن الكتاب", systemImage: "book.closed.fill")
                                .font(.title2.weight(.bold))
                            Text(book.title).font(.title3.weight(.heavy))
                            Text("تأليف: \(book.author)").foregroundStyle(.secondary)
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
                        Label("تقدّمي", systemImage: "chart.bar.fill")
                            .font(.title2.weight(.bold))
                        ForEach(library.chapters) { chapter in
                            HStack {
                                Text(chapter.title).font(.subheadline.weight(.semibold))
                                Spacer()
                                Text("\(progress.learnedCount(in: chapter).arabicDigits)/\(chapter.masail.count.arabicDigits)")
                                    .font(.caption.weight(.bold))
                                    .foregroundStyle(.secondary)
                            }
                            GlassProgressBar(progress: progress.progress(for: chapter),
                                             colors: chapter.colors.themeColors, height: 8)
                        }
                        Text("الدروس المكتملة: \(progress.completedLessons.count.arabicDigits) من \(library.lessons.count.arabicDigits)")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                            .padding(.top, 4)

                        Button(role: .destructive) { confirmReset = true } label: {
                            Label("البدء من جديد", systemImage: "arrow.counterclockwise")
                        }
                        .buttonStyle(GlassButtonStyle(tint: .red))
                        .padding(.top, 6)
                    }
                    .padding(22)
                    .glassCard(cornerRadius: 30, tint: .indigo)

                    Text("يعمل التطبيق دون إنترنت بالكامل، وكل المحتوى مأخوذ من الكتاب مع تبسيط يسير للأطفال.")
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
        .navigationTitle("عن التطبيق")
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(.hidden, for: .navigationBar)
        .confirmationDialog("هل تريد مسح كل التقدّم؟", isPresented: $confirmReset, titleVisibility: .visible) {
            Button("مسح التقدّم", role: .destructive) { progress.resetAll() }
            Button("إلغاء", role: .cancel) {}
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
