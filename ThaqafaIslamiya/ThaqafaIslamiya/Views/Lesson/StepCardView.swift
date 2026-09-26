//
//  StepCardView.swift
//  ثقافة إسلامية
//
//  بطاقة خطوة واحدة: رسم متحرك ثلاثي الأبعاد، عنوان ونص قصير مع زر استماع بصوت طبيعي،
//  عدّاد تكرار تفاعلي، فقاعة الدعاء (بالعربية مع معناه في الترجمات)، و«من الكتاب» لمزيد من التفصيل.
//

import SwiftUI

struct StepCardView: View {
    let step: LessonStep
    let number: Int
    let total: Int
    let colors: [Color]
    let model: LessonViewModel
    var isActive: Bool = true

    @Environment(VoicePlayer.self) private var voice
    @Environment(AppSettings.self) private var settings

    @State private var showDetail = false
    @State private var bounce = 0
    @State private var appeared = false

    private var tint: Color { colors.first ?? .teal }

    var body: some View {
        VStack(spacing: 14) {
            header

            // مساحة الصورة التوضيحية (تُستبدل تلقائيًا بالصورة المضافة إلى Assets باسم step.image)
            // رسم متحرك لشخص يؤدي الحركة (Assets/Animations/<step.image>.mp4)
            IllustrationView(
                imageName: step.image,
                symbol: step.symbol,
                colors: colors,
                symbolSize: 78,
                bounceTrigger: bounce,
                // البطاقات الخلفية في المكدّس تعرض صورة ثابتة فقط؛ الفيديو يعمل للبطاقة النشطة وحدها
                playsVideo: isActive
            )
            .frame(maxWidth: .infinity)
            .frame(minHeight: 160, maxHeight: 320)
            .scaleEffect(appeared ? 1 : 0.7)
            .onTapGesture { bounce += 1 }

            ScrollView {
                VStack(spacing: 14) {
                    Text(step.title)
                        .font(.title.weight(.heavy))
                        .foregroundStyle(LinearGradient.diagonal(colors))
                        .multilineTextAlignment(.center)

                    Text(step.text)
                        .font(.title3.weight(.medium))
                        .multilineTextAlignment(.center)
                        .fixedSize(horizontal: false, vertical: true)

                    if let count = step.repeatCount {
                        RepeatCounterView(step: step, count: count, colors: colors, model: model)
                    }

                    if let dua = step.dua {
                        DuaBubble(step: step, text: dua, meaning: step.duaMeaning, tint: tint)
                    }

                    if let detail = step.detail {
                        detailSection(detail)
                    }
                }
                .frame(maxWidth: .infinity)
                .padding(.bottom, 8)
            }
            .scrollBounceBehavior(.basedOnSize)
            .scrollIndicators(.hidden)
        }
        .padding(20)
        .glassCard(cornerRadius: 36, tint: tint, elevated: isActive)
        .onAppear {
            guard isActive else { return }
            withAnimation(.spring(response: 0.6, dampingFraction: 0.6)) { appeared = true }
            bounce += 1
        }
        .onChange(of: isActive) { _, active in
            if active {
                withAnimation(.spring(response: 0.6, dampingFraction: 0.6)) { appeared = true }
                bounce += 1
            }
        }
    }

    private var header: some View {
        HStack {
            Text(L10n.t("step.of", number.digits, total.digits))
                .font(.caption.weight(.bold))
                .padding(.horizontal, 12)
                .padding(.vertical, 6)
                .glassCapsule(tint: tint, interactive: false)

            Spacer()

            if step.repeatCount != nil && model.isRepeatComplete(for: step) {
                Label(L10n.t("step.wellDone"), systemImage: "star.fill")
                    .font(.caption.weight(.bold))
                    .foregroundStyle(.yellow)
                    .transition(.scale.combined(with: .opacity))
            }

            narrationButton
        }
    }

    /// زر قراءة الخطوة بصوت طبيعي (مقطع مدمج بلغة الواجهة).
    private var narrationButton: some View {
        let clip = step.narrationClip(for: settings.language)
        let playing = voice.isPlaying(clip)
        return Button {
            voice.toggle(clip: clip, text: step.narrationText, language: settings.language)
        } label: {
            Image(systemName: playing ? "stop.fill" : "speaker.wave.2.fill")
                .font(.subheadline.weight(.bold))
                .foregroundStyle(tint)
                .symbolEffect(.variableColor.iterative, isActive: playing)
                .contentTransition(.symbolEffect(.replace))
                .frame(width: 38, height: 38)
                .glassCircle(tint: tint)
        }
        .buttonStyle(PressableCardStyle())
        .accessibilityLabel(playing ? L10n.t("audio.stop") : L10n.t("step.listen"))
    }

    private func detailSection(_ detail: String) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Button {
                withAnimation(.spring(response: 0.4, dampingFraction: 0.8)) { showDetail.toggle() }
            } label: {
                HStack {
                    Label(L10n.t("step.fromBook"), systemImage: "book.closed.fill")
                        .font(.subheadline.weight(.semibold))
                    Spacer()
                    Image(systemName: "chevron.down")
                        .rotationEffect(.degrees(showDetail ? 180 : 0))
                }
                .foregroundStyle(tint)
            }
            .buttonStyle(.plain)

            if showDetail {
                Text(detail)
                    .font(.callout)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                    .transition(.opacity.combined(with: .move(edge: .top)))
            }
        }
        .padding(14)
        .glassCard(cornerRadius: 18, tint: .white, elevated: false)
    }
}

// MARK: - Repeat counter

/// قطرات يلمسها الطفل بعدد مرات التكرار (مثال: «اغسل وجهك ثلاثًا»).
struct RepeatCounterView: View {
    let step: LessonStep
    let count: Int
    let colors: [Color]
    let model: LessonViewModel

    var body: some View {
        let taps = model.taps(for: step)

        VStack(spacing: 10) {
            Text(taps >= count ? L10n.t("repeat.done", count.digits) : L10n.t("repeat.progress", taps.digits, count.digits))
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(.secondary)
                .contentTransition(.numericText())

            HStack(spacing: 18) {
                ForEach(0..<count, id: \.self) { index in
                    let filled = index < taps
                    Button {
                        model.registerTap(for: step)
                    } label: {
                        Image(systemName: filled ? "drop.fill" : "drop")
                            .font(.system(size: 34, weight: .semibold))
                            .foregroundStyle(filled
                                             ? AnyShapeStyle(LinearGradient.diagonal(colors))
                                             : AnyShapeStyle(Color.secondary))
                            .scaleEffect(filled ? 1.15 : 1)
                            .frame(width: 58, height: 58)
                            .glassCapsule(tint: filled ? (colors.first ?? .teal) : .white)
                    }
                    .buttonStyle(PressableCardStyle())
                    .disabled(filled || index != taps)
                    .symbolEffect(.bounce, value: filled)
                    .accessibilityLabel(L10n.t("repeat.time", (index + 1).digits))
                }
            }
        }
        .sensoryFeedback(.impact(flexibility: .soft), trigger: taps)
        .padding(.vertical, 6)
    }
}

// MARK: - Dua bubble

/// فقاعة زجاجية للدعاء أو الذكر بالعربية (كما في الكتاب) مع معناه بلغة الواجهة، وزر استماع بصوت طبيعي مشكول.
struct DuaBubble: View {
    let step: LessonStep
    let text: String
    var meaning: String? = nil
    var tint: Color = .teal

    @Environment(VoicePlayer.self) private var voice

    var body: some View {
        let playing = voice.isPlaying(step.duaClip)

        VStack(spacing: 10) {
            HStack {
                Label(L10n.t("dua.say"), systemImage: "quote.opening")
                    .font(.caption.weight(.bold))
                    .foregroundStyle(tint)
                Spacer()
                Button {
                    voice.toggle(clip: step.duaClip, text: text, language: .arabic)
                } label: {
                    Image(systemName: playing ? "stop.circle.fill" : "speaker.wave.2.circle.fill")
                        .font(.title2)
                        .foregroundStyle(tint)
                        .symbolEffect(.variableColor.iterative, isActive: playing)
                        .contentTransition(.symbolEffect(.replace))
                }
                .buttonStyle(.plain)
                .accessibilityLabel(playing ? L10n.t("audio.stop") : L10n.t("dua.listen"))
            }

            // نص الدعاء عربي دائمًا ومن اليمين إلى اليسار مهما كانت لغة الواجهة
            Text("«\(text)»")
                .font(.title3.weight(.semibold))
                .multilineTextAlignment(.center)
                .lineSpacing(6)
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity)
                .environment(\.layoutDirection, .rightToLeft)
                .environment(\.locale, AppLanguage.arabic.locale)

            if let meaning, !meaning.isEmpty {
                VStack(spacing: 4) {
                    Text(L10n.t("dua.meaning"))
                        .font(.caption2.weight(.bold))
                        .foregroundStyle(tint)
                    Text(meaning)
                        .font(.callout)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .frame(maxWidth: .infinity)
            }
        }
        .padding(16)
        .background(
            RoundedRectangle(cornerRadius: 22, style: .continuous)
                .fill(tint.opacity(0.12))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 22, style: .continuous)
                .strokeBorder(tint.opacity(0.35), style: StrokeStyle(lineWidth: 1.5, dash: [6, 5]))
        )
    }
}
