//
//  PrayerTimesView.swift
//  ثقافة إسلامية
//
//  شاشة مواقيت الصلاة: الصلاة القادمة مع عدّ تنازلي حيّ، والتاريخ الهجري، ومواقيت اليوم مع جرس الأذان لكل صلاة،
//  وطريقة الحساب ومذهب العصر وصوت التنبيه، والاستماع إلى الأذان — بتصميم زجاجي ولمسات إسلامية.
//

import SwiftUI
import UIKit

struct PrayerTimesView: View {
    @Environment(PrayerStore.self) private var prayers
    @Environment(AppRouter.self) private var router
    @Environment(AppSettings.self) private var settings
    @Environment(\.scenePhase) private var scenePhase

    private let gold = [Color(red: 0.86, green: 0.68, blue: 0.32), Color(red: 0.6, green: 0.42, blue: 0.16)]

    var body: some View {
        ZStack {
            LiquidBackground(colors: [.teal, .indigo])

            ScrollView {
                VStack(spacing: 18) {
                    header
                    if prayers.hasLocation {
                        TimelineView(.periodic(from: .now, by: 1)) { context in
                            VStack(spacing: 18) {
                                nextCard(now: context.date)
                                timesList(now: context.date)
                            }
                            .onChange(of: Calendar.current.component(.day, from: context.date)) {
                                prayers.refreshIfNeeded(now: context.date)
                            }
                        }
                        if prayers.notificationsDenied { deniedCard }
                        optionsCard
                        Text(L10n.t("prayer.footer"))
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .multilineTextAlignment(.center)
                            .padding(.horizontal, 12)
                    } else {
                        locationCard
                    }
                }
                .padding(.horizontal, 18)
                .padding(.bottom, 30)
                .frame(maxWidth: 640)
                .frame(maxWidth: .infinity)
            }
        }
        .onAppear {
            prayers.refreshIfNeeded()
            if !prayers.hasLocation { prayers.locate() }
        }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { prayers.refreshIfNeeded() }
        }
    }

    // MARK: Header

    private var header: some View {
        HStack(spacing: 10) {
            Button { prayers.stopAdhan(); router.showPrayerTimes = false } label: {
                Image(systemName: "xmark")
                    .font(.headline.weight(.bold))
                    .foregroundStyle(.primary)
                    .frame(width: 44, height: 44)
                    .glassCircle(interactive: false)
                    .contentShape(Circle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(L10n.t("common.close"))

            VStack(spacing: 2) {
                Text(L10n.t("prayer.title")).font(.title3.weight(.heavy))
                Button { prayers.locate() } label: {
                    HStack(spacing: 4) {
                        if prayers.isLocating {
                            ProgressView().controlSize(.mini)
                        } else {
                            Image(systemName: "location.fill").font(.caption2)
                        }
                        Text(placeText).font(.caption).lineLimit(1)
                    }
                    .foregroundStyle(.secondary)
                }
                .buttonStyle(.plain)
                .accessibilityLabel(L10n.t("prayer.locate"))
            }
            .frame(maxWidth: .infinity)

            Button { prayers.locate() } label: {
                Image(systemName: "location.circle.fill")
                    .font(.title3)
                    .foregroundStyle(.primary)
                    .frame(width: 44, height: 44)
                    .glassCircle(interactive: false)
                    .contentShape(Circle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(L10n.t("prayer.locate"))
        }
        .padding(.top, 8)
    }

    private var placeText: String {
        if let name = prayers.placeName { return name }
        if let lat = prayers.latitude, let lng = prayers.longitude {
            return L10n.t("prayer.coordinates", String(format: "%.2f", lat), String(format: "%.2f", lng))
        }
        return L10n.t("prayer.noLocationShort")
    }

    // MARK: Next prayer

    private func nextCard(now: Date) -> some View {
        let next = prayers.next(after: now)
        let current = prayers.current(at: now)
        let progress: Double = {
            guard let next, let start = current?.time ?? prayers.today?.time(.fajr) else { return 0 }
            let total = next.time.timeIntervalSince(start)
            return total > 0 ? min(max(now.timeIntervalSince(start) / total, 0), 1) : 0
        }()
        return VStack(spacing: 14) {
            HStack {
                Text(hijriDate(now))
                Spacer()
                Text(now.formatted(.dateTime.weekday(.wide).day().month(.wide).locale(settings.language.locale)))
            }
            .font(.caption.weight(.semibold))
            .foregroundStyle(.secondary)

            ZStack {
                IslamicRosette()
                    .stroke(gold[0].opacity(0.22), lineWidth: 1)
                    .frame(width: 190, height: 190)
                Circle()
                    .stroke(Color.primary.opacity(0.08), lineWidth: 10)
                    .frame(width: 176, height: 176)
                Circle()
                    .trim(from: 0, to: progress)
                    .stroke(LinearGradient(colors: [.teal, gold[0]], startPoint: .top, endPoint: .bottom),
                            style: StrokeStyle(lineWidth: 10, lineCap: .round))
                    .rotationEffect(.degrees(-90))
                    .frame(width: 176, height: 176)
                    .environment(\.layoutDirection, .leftToRight)
                VStack(spacing: 4) {
                    if let next {
                        Text(L10n.t("prayer.next")).font(.caption.weight(.bold)).foregroundStyle(.secondary)
                        Label(next.prayer.title, systemImage: next.prayer.symbol)
                            .font(.title2.weight(.heavy))
                        Text(clock(next.time))
                            .font(.headline.monospacedDigit())
                            .foregroundStyle(gold[0])
                        Text(countdown(to: next.time, from: now))
                            .font(.system(size: 22, weight: .heavy, design: .rounded).monospacedDigit())
                            .contentTransition(.numericText())
                    }
                }
            }
            .frame(height: 200)

            if prayers.isPlayingAdhan {
                Button { prayers.stopAdhan() } label: {
                    Label(L10n.t("prayer.stopAdhan"), systemImage: "stop.fill")
                        .font(.subheadline.weight(.bold))
                        .padding(.horizontal, 18).padding(.vertical, 10)
                        .glassCapsule(tint: .orange, interactive: false)
                }
                .buttonStyle(PressableCardStyle())
            }
        }
        .padding(18)
        .glassCard(cornerRadius: 30, tint: .teal)
    }

    // MARK: Times

    private func timesList(now: Date) -> some View {
        let next = prayers.next(after: now)?.prayer
        return VStack(spacing: 10) {
            ForEach(Prayer.allCases) { prayer in
                let isNext = prayer == next
                HStack(spacing: 14) {
                    ZStack {
                        Octagram()
                            .fill(isNext ? AnyShapeStyle(LinearGradient.diagonal(gold)) : AnyShapeStyle(Color.primary.opacity(0.08)))
                        Image(systemName: prayer.symbol)
                            .font(.system(size: 15, weight: .semibold))
                            .foregroundStyle(isNext ? Color.white : Color.primary)
                    }
                    .frame(width: 40, height: 40)

                    Text(prayer.title)
                        .font(.headline)
                        .foregroundStyle(prayer.hasAdhan ? Color.primary : Color.secondary)
                    Spacer()
                    Text(prayers.today?.time(prayer).map(clock) ?? "—")
                        .font(.title3.weight(.bold).monospacedDigit())
                        .foregroundStyle(isNext ? gold[0] : Color.primary)

                    if prayer.hasAdhan {
                        Button {
                            UIImpactFeedbackGenerator(style: .light).impactOccurred()
                            prayers.setAlert(prayer, on: !prayers.isAlertOn(prayer))
                        } label: {
                            Image(systemName: prayers.isAlertOn(prayer) ? "bell.fill" : "bell.slash")
                                .font(.body.weight(.semibold))
                                .foregroundStyle(prayers.isAlertOn(prayer) ? Color.teal : Color.secondary)
                                .frame(width: 40, height: 40)
                                .contentShape(Rectangle())
                                .contentTransition(.symbolEffect(.replace))
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel(L10n.t("prayer.adhanAlert"))
                    } else {
                        Color.clear.frame(width: 40, height: 40)
                    }
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 8)
                .glassCard(cornerRadius: 22, tint: isNext ? .orange : .white, elevated: false)
                .overlay {
                    if isNext {
                        RoundedRectangle(cornerRadius: 22, style: .continuous)
                            .strokeBorder(LinearGradient.diagonal(gold), lineWidth: 1.5)
                    }
                }
            }
        }
    }

    // MARK: Options

    private var optionsCard: some View {
        @Bindable var store = prayers
        return VStack(alignment: .leading, spacing: 14) {
            HStack {
                Label(L10n.t("prayer.methodTitle"), systemImage: "globe.asia.australia.fill")
                    .font(.subheadline.weight(.semibold))
                Spacer()
                Picker("", selection: $store.method) {
                    ForEach(PrayerMethod.allCases) { Text($0.title).tag($0) }
                }
                .pickerStyle(.menu)
                .tint(.teal)
            }

            VStack(alignment: .leading, spacing: 8) {
                Label(L10n.t("prayer.asrTitle"), systemImage: "sun.min.fill").font(.subheadline.weight(.semibold))
                Picker("", selection: $store.asrSchool) {
                    ForEach(AsrSchool.allCases) { Text($0.title).tag($0) }
                }
                .pickerStyle(.segmented)
            }

            VStack(alignment: .leading, spacing: 8) {
                Label(L10n.t("prayer.soundTitle"), systemImage: "speaker.wave.2.fill").font(.subheadline.weight(.semibold))
                Picker("", selection: $store.alertSound) {
                    ForEach(PrayerStore.AlertSound.allCases) { Text($0.title).tag($0) }
                }
                .pickerStyle(.segmented)
            }

            Button { prayers.toggleAdhan() } label: {
                Label(L10n.t(prayers.isPlayingAdhan ? "prayer.stopAdhan" : "prayer.playAdhan"),
                      systemImage: prayers.isPlayingAdhan ? "stop.circle.fill" : "play.circle.fill")
                    .font(.headline)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
                    .foregroundStyle(.white)
                    .background(LinearGradient.diagonal([.teal, .green]), in: Capsule())
            }
            .buttonStyle(PressableCardStyle())
        }
        .padding(18)
        .glassCard(cornerRadius: 28, tint: .teal, elevated: false)
    }

    private var deniedCard: some View {
        HStack(spacing: 12) {
            Image(systemName: "bell.slash.fill").foregroundStyle(.orange)
            Text(L10n.t("prayer.notificationsDenied")).font(.caption.weight(.semibold))
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 0)
            Button(L10n.t("qibla.openSettings")) {
                if let url = URL(string: UIApplication.openSettingsURLString) { UIApplication.shared.open(url) }
            }
            .font(.caption.weight(.bold))
        }
        .padding(14)
        .glassCard(cornerRadius: 20, tint: .orange, elevated: false)
    }

    private var locationCard: some View {
        VStack(spacing: 16) {
            ZStack {
                Octagram().fill(LinearGradient.diagonal(gold)).frame(width: 84, height: 84)
                Image(systemName: prayers.locationDenied ? "location.slash.fill" : "location.fill")
                    .font(.system(size: 32, weight: .semibold))
                    .foregroundStyle(.white)
            }
            Text(L10n.t(prayers.locationDenied ? "qibla.denied" : "prayer.noLocation"))
                .font(.subheadline)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
            if prayers.locationDenied {
                Button(L10n.t("qibla.openSettings")) {
                    if let url = URL(string: UIApplication.openSettingsURLString) { UIApplication.shared.open(url) }
                }
                .font(.headline)
            } else {
                Button { prayers.locate() } label: {
                    HStack(spacing: 8) {
                        if prayers.isLocating { ProgressView().tint(.white) }
                        Text(L10n.t(prayers.isLocating ? "qibla.locating" : "prayer.locate"))
                    }
                    .font(.headline)
                    .foregroundStyle(.white)
                    .padding(.horizontal, 26).padding(.vertical, 12)
                    .background(LinearGradient.diagonal([.teal, .green]), in: Capsule())
                }
                .buttonStyle(PressableCardStyle())
            }
        }
        .padding(26)
        .frame(maxWidth: .infinity)
        .glassCard(cornerRadius: 30, tint: .teal)
        .padding(.top, 40)
    }

    // MARK: Formatting

    private func clock(_ date: Date) -> String {
        date.formatted(.dateTime.hour().minute().locale(settings.language.locale))
    }

    private func countdown(to date: Date, from now: Date) -> String {
        let seconds = max(0, Int(date.timeIntervalSince(now)))
        let h = seconds / 3600, m = (seconds % 3600) / 60, s = seconds % 60
        let text = String(format: "%02d:%02d:%02d", h, m, s)
        return L10n.t("prayer.remaining", localizedDigits(text))
    }

    private func localizedDigits(_ text: String) -> String {
        text.map { ch -> String in
            if let d = ch.wholeNumberValue { return d.digits }
            return String(ch)
        }.joined()
    }

    private func hijriDate(_ date: Date) -> String {
        var calendar = Calendar(identifier: .islamicUmmAlQura)
        calendar.locale = settings.language.locale
        let style = Date.FormatStyle(date: .long, time: .omitted, locale: settings.language.locale, calendar: calendar)
        return date.formatted(style)
    }
}

// MARK: - Compact card (الرئيسية)

/// بطاقة الصلاة القادمة في الشاشة الرئيسية: الاسم والوقت والعدّ التنازلي — تفتح شاشة المواقيت.
struct NextPrayerCard: View {
    @Environment(PrayerStore.self) private var prayers
    @Environment(AppRouter.self) private var router
    @Environment(AppSettings.self) private var settings

    var body: some View {
        Button { router.showPrayerTimes = true } label: {
            TimelineView(.periodic(from: .now, by: 30)) { context in
                HStack(spacing: 14) {
                    ZStack {
                        Octagram()
                            .fill(LinearGradient.diagonal([Color(red: 0.86, green: 0.68, blue: 0.32), Color(red: 0.6, green: 0.42, blue: 0.16)]))
                        Image(systemName: prayers.next(after: context.date)?.prayer.symbol ?? "location.fill")
                            .font(.system(size: 18, weight: .semibold))
                            .foregroundStyle(.white)
                    }
                    .frame(width: 50, height: 50)

                    VStack(alignment: .leading, spacing: 3) {
                        Text(L10n.t("prayer.title")).font(.caption.weight(.bold)).foregroundStyle(.secondary)
                        if let next = prayers.next(after: context.date) {
                            Text("\(next.prayer.title) · \(next.time.formatted(.dateTime.hour().minute().locale(settings.language.locale)))")
                                .font(.headline)
                                .foregroundStyle(.primary)
                            Text(relative(next.time, now: context.date))
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        } else {
                            Text(L10n.t("prayer.noLocationShort")).font(.headline).foregroundStyle(.primary)
                        }
                    }
                    Spacer(minLength: 0)
                    Image(systemName: "chevron.forward").foregroundStyle(.secondary)
                }
                .padding(16)
                .glassCard(cornerRadius: 26, tint: .orange, elevated: false)
            }
        }
        .buttonStyle(PressableCardStyle())
        .onAppear { prayers.refreshIfNeeded() }
    }

    private func relative(_ date: Date, now: Date) -> String {
        let minutes = max(0, Int(date.timeIntervalSince(now) / 60))
        let h = minutes / 60, m = minutes % 60
        return h > 0 ? L10n.t("prayer.inHoursMinutes", h.digits, m.digits) : L10n.t("prayer.inMinutes", m.digits)
    }
}
