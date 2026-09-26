//
//  QuizView.swift
//  ثقافة إسلامية
//
//  اختبار قصير ممتع في نهاية كل قسم، أسئلته مأخوذة من نص الكتاب.
//

import SwiftUI

struct QuizView: View {
    let chapter: Chapter

    @Environment(ProgressStore.self) private var progress
    @Environment(\.dismiss) private var dismiss
    @State private var model: QuizViewModel

    init(chapter: Chapter) {
        self.chapter = chapter
        _model = State(initialValue: QuizViewModel(questions: chapter.quiz))
    }

    private var colors: [Color] { chapter.colors.themeColors }

    var body: some View {
        ZStack {
            LiquidBackground(colors: colors + [.indigo, .mint])

            VStack(spacing: 20) {
                GlassProgressBar(progress: model.progress, colors: colors)
                    .padding(.top, 8)

                if model.isFinished {
                    result
                        .transition(.scale.combined(with: .opacity))
                } else {
                    questionCard
                        .id(model.index)
                        .transition(.asymmetric(insertion: .move(edge: .leading).combined(with: .opacity),
                                                removal: .move(edge: .trailing).combined(with: .opacity)))
                }
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 20)
            .frame(maxWidth: 700)
        }
        .navigationTitle(L10n.t("quiz.title"))
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(.hidden, for: .navigationBar)
        .sensoryFeedback(trigger: model.selectedOption) { _, newValue in
            guard newValue != nil else { return nil }
            return model.isCorrect ? .success : .error
        }
        .onChange(of: model.isFinished) { _, finished in
            if finished { progress.record(score: model.score, for: chapter) }
        }
    }

    private var questionCard: some View {
        let question = model.current
        return VStack(spacing: 16) {
            Text(L10n.t("quiz.questionOf", (model.index + 1).digits, model.questions.count.digits))
                .font(.caption.weight(.bold))
                .padding(.horizontal, 12).padding(.vertical, 6)
                .glassCapsule(tint: colors.first ?? .teal, interactive: false)

            Text(question.question)
                .font(.title2.weight(.bold))
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)

            VStack(spacing: 12) {
                ForEach(Array(question.options.enumerated()), id: \.offset) { index, option in
                    Button { model.select(index) } label: {
                        HStack {
                            Text(option)
                                .font(.headline)
                                .foregroundStyle(.primary)
                                .multilineTextAlignment(.leading)
                            Spacer()
                            if model.hasAnswered && index == question.answerIndex {
                                Image(systemName: "checkmark.circle.fill").foregroundStyle(.green)
                            } else if model.selectedOption == index {
                                Image(systemName: "xmark.circle.fill").foregroundStyle(.red)
                            }
                        }
                        .padding(16)
                        .glassCard(cornerRadius: 20, tint: optionTint(index, question), interactive: !model.hasAnswered, elevated: false)
                    }
                    .buttonStyle(PressableCardStyle())
                    .disabled(model.hasAnswered)
                }
            }

            if model.hasAnswered {
                VStack(spacing: 12) {
                    Label(model.isCorrect ? L10n.t("quiz.correct") : L10n.t("quiz.wrong"),
                          systemImage: model.isCorrect ? "hands.clap.fill" : "lightbulb.fill")
                        .font(.headline)
                        .foregroundStyle(model.isCorrect ? .green : .orange)
                    Text(question.explanation)
                        .font(.callout)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                    Button { model.next() } label: {
                        Text(model.index + 1 < model.questions.count ? L10n.t("quiz.next") : L10n.t("quiz.result"))
                    }
                    .buttonStyle(ProminentGlassButtonStyle(colors: colors))
                }
                .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .padding(22)
        .glassCard(cornerRadius: 32, tint: colors.first ?? .teal)
    }

    private func optionTint(_ index: Int, _ question: QuizQuestion) -> Color {
        guard model.hasAnswered else { return .white }
        if index == question.answerIndex { return .green }
        if index == model.selectedOption { return .red }
        return .white
    }

    private var result: some View {
        let total = model.questions.count
        let perfect = model.score == total
        return VStack(spacing: 18) {
            Image(systemName: perfect ? "trophy.fill" : "star.circle.fill")
                .font(.system(size: 90))
                .foregroundStyle(LinearGradient.diagonal([.yellow, .orange]))
                .symbolEffect(.bounce, value: model.isFinished)
            Text(perfect ? L10n.t("quiz.perfect") : L10n.t("quiz.goodTry"))
                .font(.largeTitle.weight(.heavy))
            Text(L10n.t("quiz.score", model.score.digits, total.digits))
                .font(.title2.weight(.semibold))
            HStack(spacing: 14) {
                Button { model.restart() } label: {
                    Label(L10n.t("quiz.retry"), systemImage: "arrow.counterclockwise").font(.headline)
                }
                .buttonStyle(GlassButtonStyle())
                Button { dismiss() } label: { Text(L10n.t("quiz.back")) }
                    .buttonStyle(ProminentGlassButtonStyle(colors: colors))
            }
        }
        .padding(30)
        .glassCard(cornerRadius: 36, tint: colors.first ?? .teal)
        .overlay { if perfect { ConfettiView() } }
    }
}
