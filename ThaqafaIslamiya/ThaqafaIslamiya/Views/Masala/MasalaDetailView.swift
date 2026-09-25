//
//  MasalaDetailView.swift
//  ثقافة إسلامية
//
//  القسم المستقل لكل مسألة: ملخّص للطفل، ثم نقاط الكتاب كبطاقات تظهر تباعًا،
//  وزر «تعلّمتها» مع احتفال، وربط بالدرس التفاعلي إن وُجد، ورقم الصفحة في الكتاب.
//

import SwiftUI

struct MasalaDetailView: View {
    let masala: Masala
    let chapter: Chapter

    @Environment(LibraryViewModel.self) private var library
    @Environment(ProgressStore.self) private var progress
    @Environment(AppRouter.self) private var router
    @Environment(SpeechReader.self) private var speech
    @Environment(\.horizontalSizeClass) private var sizeClass

    @State private var revealed = 0
    @State private var celebrate = false

    private var colors: [Color] { chapter.colors.themeColors }
    private var isLearned: Bool { progress.isLearned(masala) }

    var body: some View {
        ZStack {
            LiquidBackground(colors: colors + [.pink, .indigo])

            ScrollView {
                VStack(spacing: 18) {
                    hero

                    ForEach(Array(masala.points.enumerated()), id: \.offset) { index, point in
                        pointCard(index: index, text: point)
                            .opacity(index < revealed ? 1 : 0)
                            .offset(y: index < revealed ? 0 : 30)
                            .animation(.spring(response: 0.55, dampingFraction: 0.8).delay(0.15 + Double(index) * 0.12),
                                       value: revealed)
                    }

                    if let lessonId = masala.lessonId, let lesson = library.lesson(id: lessonId) {
                        Button { router.present(lesson) } label: {
                            Label("ابدأ درس «\(lesson.title)» التفاعلي", systemImage: "play.circle.fill")
                        }
                        .buttonStyle(ProminentGlassButtonStyle(colors: lesson.colors.themeColors))
                        .padding(.top, 4)
                    }

                    learnedButton
                        .padding(.top, 6)

                    Text("المصدر: \(library.book?.title ?? "تلقين الصبيان") — ص \(masala.page.arabicDigits)")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                        .padding(.top, 4)
                }
                .padding(.horizontal, sizeClass == .regular ? 40 : 18)
                .padding(.bottom, 40)
                .frame(maxWidth: 760)
                .frame(maxWidth: .infinity)
            }

            if celebrate {
                ConfettiView()
                    .transition(.opacity)
            }
        }
        .navigationTitle(masala.title)
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(.hidden, for: .navigationBar)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    speech.toggle(([masala.title] + masala.points).joined(separator: ". "))
                } label: {
                    Image(systemName: speech.isSpeaking ? "stop.circle.fill" : "speaker.wave.2.fill")
                }
                .accessibilityLabel("استمع للمسألة")
            }
        }
        .sensoryFeedback(.success, trigger: isLearned) { _, learned in learned }
        .onAppear(perform: revealPoints)
        .onDisappear { speech.stop() }
    }

    // MARK: - Parts

    private var hero: some View {
        VStack(spacing: 14) {
            IllustrationView(imageName: masala.imageName, symbol: masala.symbol, colors: colors, symbolSize: 56, bounceTrigger: revealed)
                .frame(width: 130, height: 130)

            Text(masala.title)
                .font(.title.weight(.heavy))
                .multilineTextAlignment(.center)

            Text(masala.summary)
                .font(.title3.weight(.medium))
                .multilineTextAlignment(.center)
                .foregroundStyle(.secondary)

            Text(chapter.title)
                .font(.caption.weight(.bold))
                .padding(.horizontal, 12)
                .padding(.vertical, 5)
                .glassCapsule(tint: colors.first ?? .teal, interactive: false)
        }
        .frame(maxWidth: .infinity)
        .padding(22)
        .glassCard(cornerRadius: 34, tint: colors.first ?? .teal)
        .padding(.top, 8)
    }

    private func pointCard(index: Int, text: String) -> some View {
        HStack(alignment: .top, spacing: 14) {
            Text((index + 1).arabicDigits)
                .font(.headline.weight(.heavy))
                .foregroundStyle(.white)
                .frame(width: 36, height: 36)
                .background(LinearGradient.diagonal(colors), in: Circle())

            Text(text)
                .font(.body.weight(.medium))
                .lineSpacing(6)
                .frame(maxWidth: .infinity, alignment: .leading)
                .multilineTextAlignment(.leading)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(16)
        .glassCard(cornerRadius: 24, tint: colors.first ?? .teal)
    }

    private var learnedButton: some View {
        Button {
            progress.toggleLearned(masala)
            if progress.isLearned(masala) {
                withAnimation { celebrate = true }
                DispatchQueue.main.asyncAfter(deadline: .now() + 1.8) {
                    withAnimation { celebrate = false }
                }
            }
        } label: {
            Label(isLearned ? "تعلّمتُها ✓" : "تعلّمتُ هذه المسألة",
                  systemImage: isLearned ? "star.fill" : "star")
                .font(.headline)
                .contentTransition(.symbolEffect(.replace))
        }
        .buttonStyle(GlassButtonStyle(tint: isLearned ? .yellow : .white))
    }

    /// تظهر نقاط المسألة تباعًا (التأخير لكل بطاقة مضبوط في `.animation` أعلاه).
    private func revealPoints() {
        guard revealed == 0 else { return }
        revealed = masala.points.count
    }
}
