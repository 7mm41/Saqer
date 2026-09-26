//
//  ChapterView.swift
//  ثقافة إسلامية
//
//  شاشة القسم: رأس زجاجي بالتقدّم، الدروس التفاعلية المرتبطة، قائمة المسائل (لكل مسألة قسم مستقل)، ثم الاختبار.
//

import SwiftUI

struct ChapterView: View {
    let chapter: Chapter

    @Environment(LibraryViewModel.self) private var library
    @Environment(ProgressStore.self) private var progress
    @Environment(AppRouter.self) private var router
    @Environment(\.horizontalSizeClass) private var sizeClass

    @State private var appeared = false

    private var colors: [Color] { chapter.colors.themeColors }
    private var isWide: Bool { sizeClass == .regular }

    var body: some View {
        ZStack {
            LiquidBackground(colors: colors + [.indigo, .pink])

            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    header

                    let lessons = library.lessons(for: chapter)
                    if !lessons.isEmpty {
                        SectionHeader(title: L10n.t("chapter.learnInteractive"), symbol: "hand.tap.fill")
                        LazyVGrid(columns: [GridItem(.adaptive(minimum: isWide ? 260 : 150), spacing: 14)], spacing: 14) {
                            ForEach(lessons) { lesson in
                                Button { router.present(lesson) } label: {
                                    lessonButtonLabel(lesson)
                                }
                                .buttonStyle(PressableCardStyle())
                            }
                        }
                    }

                    SectionHeader(title: L10n.t("chapter.masail"), subtitle: L10n.t("chapter.masailSubtitle"), symbol: "list.bullet.rectangle.fill")

                    LazyVGrid(columns: [GridItem(.adaptive(minimum: isWide ? 420 : 300), spacing: 14)], spacing: 12) {
                        ForEach(Array(chapter.masail.enumerated()), id: \.element.id) { index, masala in
                            Button { router.open(.masala(id: masala.id)) } label: {
                                MasalaRow(masala: masala,
                                          number: index + 1,
                                          colors: colors,
                                          isLearned: progress.isLearned(masala))
                            }
                            .buttonStyle(PressableCardStyle())
                            .offset(x: appeared ? 0 : 60)
                            .opacity(appeared ? 1 : 0)
                            .animation(.spring(response: 0.55, dampingFraction: 0.8).delay(Double(min(index, 12)) * 0.04), value: appeared)
                        }
                    }

                    if !chapter.quiz.isEmpty {
                        quizButton
                    }
                }
                .padding(.horizontal, isWide ? 40 : 18)
                .padding(.bottom, 30)
                .frame(maxWidth: 1000)
                .frame(maxWidth: .infinity)
            }
        }
        .navigationTitle(chapter.title)
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(.hidden, for: .navigationBar)
        .onAppear { appeared = true }
    }

    private var header: some View {
        HStack(spacing: 18) {
            IllustrationView(imageName: chapter.imageName, symbol: chapter.symbol, colors: colors, symbolSize: 40, playsVideo: false)
                .frame(width: 96, height: 96)

            VStack(alignment: .leading, spacing: 8) {
                Text(chapter.part)
                    .font(.caption.weight(.bold))
                    .foregroundStyle(colors.first ?? .teal)
                Text(chapter.title)
                    .font(.title.weight(.heavy))
                Text(chapter.subtitle)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)

                HStack(spacing: 10) {
                    GlassProgressBar(progress: progress.progress(for: chapter), colors: colors, height: 8)
                    Text("\(progress.learnedCount(in: chapter).digits)/\(chapter.masail.count.digits)")
                        .font(.caption.weight(.bold))
                        .foregroundStyle(.secondary)
                }
            }
        }
        .padding(20)
        .glassCard(cornerRadius: 32, tint: colors.first ?? .teal)
        .padding(.top, 8)
    }

    private func lessonButtonLabel(_ lesson: InteractiveLesson) -> some View {
        let lessonColors = lesson.colors.themeColors
        return HStack(spacing: 12) {
            Image(systemName: lesson.symbol)
                .font(.title2)
                .foregroundStyle(.white)
                .frame(width: 48, height: 48)
                .background(LinearGradient.diagonal(lessonColors), in: Circle())
            VStack(alignment: .leading, spacing: 2) {
                Text(lesson.title).font(.headline).foregroundStyle(.primary)
                Text(L10n.t("lesson.stepsCount", lesson.steps.count.digits)).font(.caption).foregroundStyle(.secondary)
            }
            Spacer(minLength: 0)
            Image(systemName: progress.isCompleted(lesson) ? "checkmark.seal.fill" : "play.fill")
                .foregroundStyle(progress.isCompleted(lesson) ? Color.green : (lessonColors.first ?? .teal))
        }
        .padding(14)
        .glassCard(cornerRadius: 22, tint: lessonColors.first ?? .teal, interactive: true)
    }

    private var quizButton: some View {
        Button { router.open(.quiz(chapterId: chapter.id)) } label: {
            HStack(spacing: 14) {
                Image(systemName: "gamecontroller.fill")
                    .font(.title)
                    .foregroundStyle(LinearGradient.diagonal(colors))
                VStack(alignment: .leading, spacing: 4) {
                    Text(L10n.t("quiz.title"))
                        .font(.title3.weight(.bold))
                        .foregroundStyle(.primary)
                    if let best = progress.bestScore(for: chapter) {
                        Text(L10n.t("quiz.best", best.digits, chapter.quiz.count.digits))
                            .font(.caption).foregroundStyle(.secondary)
                    } else {
                        Text(L10n.t("quiz.count", chapter.quiz.count.digits))
                            .font(.caption).foregroundStyle(.secondary)
                    }
                }
                Spacer()
                Image(systemName: "chevron.forward").foregroundStyle(.secondary)
            }
            .padding(18)
            .glassCard(cornerRadius: 26, tint: colors.last ?? .indigo, interactive: true)
        }
        .buttonStyle(PressableCardStyle())
        .padding(.top, 6)
    }
}
