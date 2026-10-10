//
//  PrayerWidget.swift
//  ثقافة إسلامية — الأداة
//
//  أداة الصلاة القادمة لشاشة القفل (مستطيلة ودائرية وسطر فوق الساعة) والشاشة الرئيسية (صغيرة ومتوسطة):
//  اسم الصلاة ووقتها، والوقت المتبقي للأذان بعدّ حيّ — وبعد الأذان «مضى على الأذان» نصف ساعة.
//  الضغط عليها يفتح مواقيت الصلاة في التطبيق.
//

import SwiftUI
import WidgetKit

struct PrayerWidget: Widget {
    private var language: AppLanguage { PrayerSnapshot.load()?.language ?? .deviceDefault }

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "PrayerWidget", provider: PrayerProvider()) { entry in
            PrayerWidgetView(entry: entry)
        }
        .configurationDisplayName(Text(L10n.t("prayer.next", in: language)))
        .description(Text(L10n.t("widget.description", in: language)))
        .supportedFamilies([.accessoryRectangular, .accessoryCircular, .accessoryInline, .systemSmall, .systemMedium])
    }
}

struct PrayerWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: PrayerEntry

    private let gold = Color(red: 0.93, green: 0.76, blue: 0.42)

    var body: some View {
        content
            .environment(\.locale, entry.language.locale)
            .environment(\.layoutDirection, entry.language.isRightToLeft ? .rightToLeft : .leftToRight)
            .widgetURL(AppLink.prayer)
            .containerBackground(for: .widget) { background }
    }

    @ViewBuilder
    private var background: some View {
        switch family {
        case .systemSmall, .systemMedium:
            LinearGradient(colors: [Color(red: 0.03, green: 0.33, blue: 0.37), Color(red: 0.12, green: 0.11, blue: 0.35)],
                           startPoint: .topLeading, endPoint: .bottomTrailing)
        default:
            Color.clear
        }
    }

    @ViewBuilder
    private var content: some View {
        if let status = entry.status {
            switch family {
            case .accessoryRectangular: rectangular(status)
            case .accessoryCircular: circular(status.next)
            case .accessoryInline: inline(status.next)
            case .systemMedium: medium(status)
            default: small(status)
            }
        } else {
            noLocation
        }
    }

    // MARK: Lock screen

    /// مثل «الظهر ١٢:٠٧ م / متبقٍ على الأذان / ٠١:٢٣:٤٥».
    private func rectangular(_ status: PrayerEntry.Status) -> some View {
        let shown = shownMoment(status)
        return VStack(spacing: 0) {
            Text("\(title(shown.prayer)) \(clock(shown.time))")
                .font(.headline)
                .widgetAccentable()
            Text(t(status.showsElapsed ? "widget.sinceAdhan" : "widget.untilAdhan"))
                .font(.caption)
                .opacity(0.85)
            Text(shown.time, style: .timer)
                .font(.title2.weight(.semibold))
                .monospacedDigit()
        }
        .lineLimit(1)
        .minimumScaleFactor(0.6)
        .multilineTextAlignment(.center)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private func circular(_ next: PrayerMoment) -> some View {
        ZStack {
            AccessoryWidgetBackground()
            VStack(spacing: 0) {
                Image(systemName: next.prayer.symbol)
                    .font(.system(size: 13, weight: .semibold))
                    .widgetAccentable()
                Text(title(next.prayer))
                    .font(.system(size: 11, weight: .bold))
                Text(shortClock(next.time))
                    .font(.system(size: 13, weight: .semibold))
                    .monospacedDigit()
            }
            .lineLimit(1)
            .minimumScaleFactor(0.5)
            .padding(5)
        }
    }

    private func inline(_ next: PrayerMoment) -> some View {
        Label("\(title(next.prayer)) \(clock(next.time))", systemImage: next.prayer.symbol)
    }

    // MARK: Home screen

    private func small(_ status: PrayerEntry.Status) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(entry.place ?? t("prayer.title"))
                .font(.caption2.weight(.semibold))
                .opacity(0.7)
            Spacer(minLength: 0)
            highlight(status)
        }
        .lineLimit(1)
        .minimumScaleFactor(0.7)
        .foregroundStyle(.white)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    }

    private func medium(_ status: PrayerEntry.Status) -> some View {
        HStack(spacing: 14) {
            small(status)
            VStack(spacing: 3) {
                ForEach(status.day, id: \.self) { moment in
                    let isNext = moment == status.next
                    HStack(spacing: 6) {
                        Image(systemName: moment.prayer.symbol)
                            .font(.caption2)
                            .frame(width: 16)
                        Text(title(moment.prayer))
                        Spacer(minLength: 4)
                        Text(shortClock(moment.time)).monospacedDigit()
                    }
                    .font(.caption.weight(isNext ? .heavy : .medium))
                    .foregroundStyle(isNext ? AnyShapeStyle(gold) : AnyShapeStyle(Color.white.opacity(0.9)))
                    .padding(.horizontal, 8)
                    .padding(.vertical, 3)
                    .background(isNext ? AnyShapeStyle(Color.white.opacity(0.14)) : AnyShapeStyle(Color.clear), in: Capsule())
                    .widgetAccentable(isNext)
                }
            }
            .lineLimit(1)
            .minimumScaleFactor(0.7)
            .frame(maxWidth: .infinity)
        }
    }

    /// الصلاة القادمة (أو التي أُذّن لها قبل قليل) ووقتها والعدّ الحيّ.
    private func highlight(_ status: PrayerEntry.Status) -> some View {
        let shown = shownMoment(status)
        return VStack(alignment: .leading, spacing: 2) {
            Label(title(shown.prayer), systemImage: shown.prayer.symbol)
                .font(.title3.weight(.heavy))
            Text(clock(shown.time))
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(gold)
                .widgetAccentable()
            Text(t(status.showsElapsed ? "widget.sinceAdhan" : "widget.untilAdhan"))
                .font(.caption2)
                .opacity(0.75)
            Text(shown.time, style: .timer)
                .font(.title2.weight(.bold))
                .monospacedDigit()
        }
    }

    private var noLocation: some View {
        VStack(spacing: 4) {
            Image(systemName: "location.fill")
                .font(family == .accessoryCircular ? .body : .title3)
                .widgetAccentable()
            if family != .accessoryCircular {
                Text(t("widget.openApp"))
                    .font(.caption)
                    .multilineTextAlignment(.center)
                    .minimumScaleFactor(0.6)
            }
        }
        .foregroundStyle(family.isHomeScreen ? AnyShapeStyle(Color.white) : AnyShapeStyle(HierarchicalShapeStyle.primary))
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    // MARK: Text

    private func shownMoment(_ status: PrayerEntry.Status) -> PrayerMoment {
        status.showsElapsed ? (status.previous ?? status.next) : status.next
    }

    private func t(_ key: String) -> String { L10n.t(key, in: entry.language) }
    private func title(_ prayer: Prayer) -> String { L10n.t("prayer.\(prayer.rawValue)", in: entry.language) }

    private func clock(_ date: Date) -> String {
        date.formatted(.dateTime.hour().minute().locale(entry.language.locale))
    }

    /// الوقت دون «ص/م» (للمساحات الضيقة).
    private func shortClock(_ date: Date) -> String {
        date.formatted(.dateTime.hour(.defaultDigits(amPM: .omitted)).minute().locale(entry.language.locale))
    }
}

private extension WidgetFamily {
    var isHomeScreen: Bool { self == .systemSmall || self == .systemMedium }
}
