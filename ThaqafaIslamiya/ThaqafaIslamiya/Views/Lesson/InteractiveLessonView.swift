//
//  InteractiveLessonView.swift
//  ثقافة إسلامية
//
//  الشاشة التفاعلية القابلة لإعادة الاستخدام لأي درس (الوضوء، الاغتسال، الصلاة، التيمم…):
//  - مجموعة بطاقات مكدّسة قابلة للسحب (Swipeable Cards).
//  - أزرار «التالي / السابق» مع حركات نابضة ناعمة.
//  - شريط تقدّم، وخط زمني جانبي للخطوات على الآيباد.
//  - شاشة احتفال عند الإتمام، وحفظ الإنجاز محليًا.
//
//  الاستخدام:
//      InteractiveLessonView(lesson: library.lesson(id: "wudu")!)
//

import SwiftUI

struct InteractiveLessonView: View {
    @State private var model: LessonViewModel

    @Environment(\.dismiss) private var dismiss
    @Environment(\.horizontalSizeClass) private var sizeClass
    @Environment(ProgressStore.self) private var progressStore
    @Environment(SpeechReader.self) private var speech

    init(lesson: InteractiveLesson) {
        _model = State(initialValue: LessonViewModel(lesson: lesson))
    }

    private var isWide: Bool { sizeClass == .regular }

    var body: some View {
        ZStack {
            LiquidBackground(colors: model.tint + [.pink, .mint])

            VStack(spacing: 18) {
                topBar

                if isWide {
                    HStack(alignment: .top, spacing: 28) {
                        StepsTimeline(model: model)
                            .frame(width: 300)
                        deckColumn
                            .frame(maxWidth: 620)
                    }
                    .frame(maxWidth: .infinity)
                } else {
                    deckColumn
                }
            }
            .padding(.horizontal, isWide ? 36 : 18)
            .padding(.vertical, 12)

            if model.isFinished {
                LessonCompletionView(
                    lesson: model.lesson,
                    onRestart: { model.restart() },
                    onClose: { dismiss() }
                )
                .transition(.opacity.combined(with: .scale(scale: 0.9)))
                .zIndex(10)
            }
        }
        .sensoryFeedback(.selection, trigger: model.currentIndex)
        .sensoryFeedback(.success, trigger: model.isFinished) { _, finished in finished }
        .onChange(of: model.isFinished) { _, finished in
            if finished { progressStore.markCompleted(model.lesson) }
        }
        .onChange(of: model.currentIndex) {
            speech.stop()
        }
        .onDisappear { speech.stop() }
    }

    // MARK: - Top bar

    private var topBar: some View {
        HStack(spacing: 14) {
            Button { dismiss() } label: {
                Image(systemName: "xmark")
                    .font(.headline.weight(.bold))
                    .frame(width: 44, height: 44)
                    .glassCapsule()
            }
            .buttonStyle(PressableCardStyle())
            .accessibilityLabel("إغلاق الدرس")

            VStack(alignment: .leading, spacing: 6) {
                HStack {
                    Label(model.lesson.title, systemImage: model.lesson.symbol)
                        .font(.headline)
                    Spacer()
                    Text("\((model.currentIndex + 1).arabicDigits) / \(model.steps.count.arabicDigits)")
                        .font(.subheadline.monospacedDigit().weight(.semibold))
                        .foregroundStyle(.secondary)
                        .contentTransition(.numericText())
                }
                GlassProgressBar(progress: model.progress, colors: model.tint)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
            .glassCard(cornerRadius: 22)
        }
    }

    // MARK: - Deck + controls

    private var deckColumn: some View {
        VStack(spacing: 16) {
            StepDeck(model: model)

            Text("اسحب البطاقة إلى اليمين للخطوة التالية 👉")
                .font(.footnote)
                .foregroundStyle(.secondary)
                .opacity(model.currentIndex == 0 ? 1 : 0)
                .animation(.easeInOut, value: model.currentIndex)

            controls
        }
    }

    private var controls: some View {
        HStack(spacing: 14) {
            Button { model.previous() } label: {
                Label("السابق", systemImage: "chevron.backward")
                    .font(.headline)
            }
            .buttonStyle(GlassButtonStyle())
            .disabled(model.isFirst)
            .opacity(model.isFirst ? 0.4 : 1)

            Spacer()

            Button { model.next() } label: {
                HStack(spacing: 8) {
                    Text(model.isLast ? "أتممتُ الدرس" : "التالي")
                    Image(systemName: model.isLast ? "checkmark.circle.fill" : "chevron.forward")
                        .contentTransition(.symbolEffect(.replace))
                }
            }
            .buttonStyle(ProminentGlassButtonStyle(colors: model.tint))
            .keyboardShortcut(.defaultAction)
        }
    }
}

// MARK: - Swipeable card deck

/// مكدّس البطاقات: البطاقة العليا تُسحب، وخلفها بطاقتان تظهران بعمق.
/// يعمل المكدّس داخل اتجاه LTR لضمان صحة حساب السحب، بينما محتوى البطاقة نفسه RTL.
struct StepDeck: View {
    let model: LessonViewModel
    @State private var dragX: CGFloat = 0

    var body: some View {
        GeometryReader { proxy in
            let upper = min(model.currentIndex + 3, model.steps.count)
            let visible = Array(model.currentIndex..<upper)

            ZStack {
                ForEach(visible.reversed(), id: \.self) { index in
                    let depth = index - model.currentIndex
                    StepCardView(
                        step: model.steps[index],
                        number: index + 1,
                        total: model.steps.count,
                        colors: model.tint,
                        model: model,
                        isActive: depth == 0
                    )
                    .environment(\.layoutDirection, .rightToLeft)
                    .frame(width: proxy.size.width, height: proxy.size.height)
                    .scaleEffect(1 - CGFloat(depth) * 0.06, anchor: .top)
                    .offset(y: CGFloat(depth) * 20)
                    .offset(x: depth == 0 ? dragX : 0)
                    .rotationEffect(.degrees(depth == 0 ? Double(dragX / 24) : 0), anchor: .bottom)
                    .opacity(depth == 0 ? 1 : 1 - Double(depth) * 0.25)
                    .blur(radius: CGFloat(depth) * 1.5)
                    .zIndex(Double(-index))
                    .allowsHitTesting(depth == 0)
                    .transition(
                        .asymmetric(
                            insertion: .opacity.combined(with: .scale(scale: 0.92)),
                            removal: .move(edge: .trailing).combined(with: .opacity)
                        )
                    )
                }
            }
            .simultaneousGesture(dragGesture(width: proxy.size.width))
        }
        .environment(\.layoutDirection, .leftToRight)
        .accessibilityElement(children: .contain)
        .accessibilityAction(named: "الخطوة التالية") { model.next() }
        .accessibilityAction(named: "الخطوة السابقة") { model.previous() }
    }

    private func dragGesture(width: CGFloat) -> some Gesture {
        DragGesture(minimumDistance: 18)
            .onChanged { value in
                // نتجاهل السحب العمودي (تمرير النص داخل البطاقة)
                guard abs(value.translation.width) > abs(value.translation.height) else { return }
                dragX = value.translation.width
            }
            .onEnded { value in
                let distance = value.translation.width
                let predicted = value.predictedEndTranslation.width
                let isHorizontal = abs(value.translation.width) > abs(value.translation.height)

                if isHorizontal && (distance > width * 0.25 || predicted > width * 0.7) {
                    // سحب إلى اليمين = الخطوة التالية (كتقليب صفحة كتاب عربي)
                    model.next()
                } else if isHorizontal && (distance < -width * 0.25 || predicted < -width * 0.7) {
                    model.previous()
                }
                withAnimation(.spring(response: 0.45, dampingFraction: 0.7)) { dragX = 0 }
            }
    }
}

// MARK: - iPad steps timeline

/// قائمة جانبية بالخطوات تظهر على الشاشات العريضة (الآيباد) للقفز لأي خطوة.
struct StepsTimeline: View {
    let model: LessonViewModel

    var body: some View {
        ScrollViewReader { reader in
            ScrollView {
                VStack(alignment: .leading, spacing: 6) {
                    Text("خطوات الدرس")
                        .font(.headline)
                        .padding(.bottom, 6)

                    ForEach(Array(model.steps.enumerated()), id: \.element.id) { index, step in
                        Button { model.go(to: index) } label: {
                            HStack(spacing: 12) {
                                ZStack {
                                    Circle()
                                        .fill(index <= model.currentIndex
                                              ? AnyShapeStyle(LinearGradient.diagonal(model.tint))
                                              : AnyShapeStyle(Color.white.opacity(0.35)))
                                        .frame(width: 32, height: 32)
                                    if index < model.currentIndex {
                                        Image(systemName: "checkmark").font(.caption.weight(.heavy)).foregroundStyle(.white)
                                    } else {
                                        Text((index + 1).arabicDigits)
                                            .font(.caption.weight(.bold))
                                            .foregroundStyle(index == model.currentIndex ? .white : .primary)
                                    }
                                }
                                Text(step.title)
                                    .font(.subheadline.weight(index == model.currentIndex ? .bold : .regular))
                                    .foregroundStyle(.primary)
                                    .multilineTextAlignment(.leading)
                                Spacer(minLength: 0)
                            }
                            .padding(.vertical, 6)
                            .padding(.horizontal, 10)
                            .background {
                                if index == model.currentIndex {
                                    RoundedRectangle(cornerRadius: 14, style: .continuous)
                                        .fill(.white.opacity(0.35))
                                }
                            }
                        }
                        .buttonStyle(.plain)
                        .id(index)
                    }
                }
                .padding(18)
            }
            .glassCard(cornerRadius: 30)
            .onChange(of: model.currentIndex) { _, newIndex in
                withAnimation { reader.scrollTo(newIndex, anchor: .center) }
            }
        }
    }
}

#Preview("الوضوء") {
    let library = LibraryViewModel()
    return Group {
        if let lesson = library.lesson(id: "wudu") {
            InteractiveLessonView(lesson: lesson)
        }
    }
    .environment(ProgressStore())
    .environment(SpeechReader())
    .environment(\.layoutDirection, .rightToLeft)
}
