'use client';
import { formatDay, formatTime, muscatDate } from '@katf/shared';

export interface Slot {
  start: number;
  end: number;
  technicians: number;
}

export function SlotPicker({ slots, value, onChange, locale, onlyToday }: { slots: Slot[]; value: { start: number; end: number } | null; onChange: (s: Slot) => void; locale: 'ar' | 'en'; onlyToday?: boolean }) {
  const today = muscatDate(Date.now());
  const days = new Map<string, Slot[]>();
  for (const s of slots) {
    const d = muscatDate(s.start);
    if (onlyToday && d !== today) continue;
    days.set(d, [...(days.get(d) ?? []), s]);
  }
  return (
    <div className="k-stack" style={{ gap: 18 }}>
      {[...days.entries()].map(([d, list]) => (
        <fieldset key={d} className="slot-day" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="k-strong" style={{ marginBottom: 8 }}>
            {formatDay(list[0]!.start, locale)}
          </legend>
          <div className="slots">
            {list.map((s) => (
              <label key={s.start} className="k-radio-card" style={{ justifyContent: 'center', minHeight: 52 }}>
                <input type="radio" name="slot" checked={value?.start === s.start} onChange={() => onChange(s)} />
                <span className="k-num">
                  {formatTime(s.start, locale)} – {formatTime(s.end, locale)}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      ))}
    </div>
  );
}
