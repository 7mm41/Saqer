import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { get, type Booking, type Page, type User, type Venue } from './api';
import { useI18n, type StringKey } from './i18n';
import { CATEGORY_ICONS, Icon, type IconName } from './icons';
import { NAV_ITEMS, useNav, type Intent, type Route } from './nav';
import { CATEGORY_META, StatusBadge, fold, initials } from './ui';

type Result = {
  key: string;
  group: StringKey;
  title: string;
  subtitle?: string;
  icon?: IconName;
  avatar?: string;
  color?: string;
  status?: string;
  go: () => void;
};

/**
 * Global search (Ctrl/⌘ K): pages, venues and events, members and booking
 * codes in one list, opened from the top bar.
 */
export function CommandPalette({ open, onClose, isStaff }: { open: boolean; onClose: () => void; isStaff: boolean }) {
  // Mounted only while open, so every search starts empty.
  return open ? <Palette onClose={onClose} isStaff={isStaff} /> : null;
}

function Palette({ onClose, isStaff }: { onClose: () => void; isStaff: boolean }) {
  const { t, L, date } = useI18n();
  const { navigate } = useNav();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [members, setMembers] = useState<(User & { membership: unknown })[]>([]);
  const [codes, setCodes] = useState<Booking[]>([]);
  const list = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isStaff) get<{ venues: Venue[] }>('admin/venues').then((r) => setVenues(r.venues)).catch(() => {});
  }, [isStaff]);

  // Members and codes are searched on the server (a short pause after typing).
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setMembers([]); setCodes([]); return; }
    const timer = setTimeout(() => {
      if (!isStaff) {
        get<Page<User & { membership: unknown }>>(`admin/members?pageSize=5&q=${encodeURIComponent(q)}`)
          .then((r) => setMembers(r.items)).catch(() => {});
      }
      get<Page<Booking>>(`admin/bookings?pageSize=5&q=${encodeURIComponent(q)}`)
        .then((r) => setCodes(r.items)).catch(() => {});
    }, 180);
    return () => clearTimeout(timer);
  }, [query, isStaff]);

  const go = (route: Route, intent?: Intent) => () => { onClose(); navigate(route, intent); };

  const results = useMemo<Result[]>(() => {
    const q = fold(query.trim());
    const pages: Result[] = NAV_ITEMS
      .filter((item) => !isStaff || item.staff)
      .filter((item) => !q || fold(t(item.label)).includes(q) || fold(t(item.hint)).includes(q))
      .map((item) => ({ key: `page-${item.route}`, group: 'searchPages', title: t(item.label), subtitle: t(item.hint), icon: item.icon, go: go(item.route) }));
    if (!q) return pages;
    const venueResults: Result[] = venues
      .filter((venue) => [venue.name.en, venue.name.ar, venue.area.en, venue.area.ar, venue.slug].some((field) => fold(field).includes(q)))
      .slice(0, 5)
      .map((venue) => ({
        key: `venue-${venue.id}`, group: 'searchVenues', title: L(venue.name), subtitle: L(venue.area),
        icon: CATEGORY_ICONS[venue.category], color: CATEGORY_META[venue.category].colors[1],
        go: go('venues', { venueId: venue.id }),
      }));
    const memberResults: Result[] = members.map((member) => ({
      key: `member-${member.id}`, group: 'searchGroupMembers', title: member.fullName,
      subtitle: [member.memberNumber, member.phone ? `+968 ${member.phone}` : member.email].join(' · '),
      avatar: initials(member.fullName), go: go('members', { memberId: member.id }),
    }));
    const codeResults: Result[] = codes.map((booking) => ({
      key: `code-${booking.id}`, group: 'searchCodes', title: booking.code,
      subtitle: `${booking.member?.fullName ?? ''} · ${L(booking.venueName)} · ${date(booking.purchasedAt)}`,
      icon: 'ticket', status: booking.status, go: go('redeem', { code: booking.code }),
    }));
    return [...pages, ...venueResults, ...memberResults, ...codeResults];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, venues, members, codes, isStaff, t, L, date]);

  useEffect(() => { setActive(0); }, [query]);
  useEffect(() => {
    list.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const onKey = (event: KeyboardEvent) => {
    if (event.key === 'ArrowDown') { event.preventDefault(); setActive((i) => Math.min(results.length - 1, i + 1)); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); setActive((i) => Math.max(0, i - 1)); }
    else if (event.key === 'Enter') { event.preventDefault(); results[active]?.go(); }
    else if (event.key === 'Escape') { event.preventDefault(); onClose(); }
  };

  let lastGroup: StringKey | null = null;
  return (
    <div className="palette-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="palette" role="dialog" aria-modal="true" aria-label={t('search')}>
        <div className="palette-input">
          <Icon name="search" size={20} />
          <input autoFocus value={query} placeholder={t('searchAll')} onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onKey} aria-controls="palette-results" aria-activedescendant={results[active] ? `pr-${active}` : undefined}
            role="combobox" aria-expanded="true" aria-autocomplete="list" spellCheck={false} />
          <button type="button" className="icon-btn" aria-label={t('close')} onClick={onClose}><Icon name="close" size={16} /></button>
        </div>
        <div className="palette-results" id="palette-results" role="listbox" ref={list}>
          {results.length === 0 && (
            <div className="palette-empty">{query.trim().length < 2 ? t('searchHint') : t('searchNoResults', { q: query.trim() })}</div>
          )}
          {results.map((result, index) => {
            const header = result.group !== lastGroup ? <div className="palette-group">{t(result.group)}</div> : null;
            lastGroup = result.group;
            return (
              <div key={result.key}>
                {header}
                <button type="button" id={`pr-${index}`} data-index={index} role="option" aria-selected={index === active}
                  className={`palette-item${index === active ? ' on' : ''}`} onMouseMove={() => setActive(index)} onClick={result.go}>
                  {result.avatar
                    ? <span className="avatar small">{result.avatar}</span>
                    : <span className="palette-icon" style={result.color ? { color: result.color } : undefined}><Icon name={result.icon ?? 'arrow'} size={18} /></span>}
                  <span className="palette-text">
                    <strong className={result.group === 'searchCodes' ? 'ltr num' : undefined}>{result.title}</strong>
                    {result.subtitle && <span className="muted small">{result.subtitle}</span>}
                  </span>
                  {result.status && <StatusBadge status={result.status} />}
                  <Icon name="enter" size={15} className="palette-enter" />
                </button>
              </div>
            );
          })}
        </div>
        <div className="palette-foot muted small">{t('searchKeys')}</div>
      </div>
    </div>
  );
}
