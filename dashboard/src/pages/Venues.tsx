import { useState, type FormEvent } from 'react';
import { CATEGORIES, del, fromOMR, get, patch, post, toOMR, type Category, type Localized, type Offer, type Venue } from '../api';
import { useI18n } from '../i18n';
import { useLive } from '../live';
import {
  CATEGORY_META, DateTimeField, Empty, Field, ImageUpload, Loading, LocalizedField, LocalizedLinesField, Modal, PageHead,
  Toggle, categoryGradient, useConfirm, useErrorText, useLoad, useToast,
} from '../ui';

const blank = (): Localized => ({ en: '', ar: '' });

type VenueDraft = Omit<Venue, 'id' | 'offers'> & { id?: string; offers: Offer[] };

const newVenue = (): VenueDraft => ({
  slug: '', category: 'festivals', name: blank(), area: blank(), summary: blank(), about: blank(), highlights: [],
  openingHours: blank(), latitude: 23.588, longitude: 58.3829, rating: 4.8, reviewCount: 0, imageUrl: null,
  isFeatured: false, isPublished: true, dealEndsAt: null, eventStartsAt: null, eventEndsAt: null, offers: [],
});

export function VenuesPage() {
  const { t, L, money, date, number } = useI18n();
  const { data, reload } = useLoad(() => get<{ venues: Venue[] }>('admin/venues'), []);
  useLive(['catalog'], () => void reload());
  const [editing, setEditing] = useState<VenueDraft | null>(null);
  const [filter, setFilter] = useState<Category | ''>('');

  const venues = (data?.venues ?? []).filter((venue) => !filter || venue.category === filter);

  return (
    <>
      <PageHead title={t('venues')} hint={t('venuesHint')}>
        <button className="btn primary" onClick={() => setEditing(newVenue())}>＋ {t('newVenue')}</button>
      </PageHead>
      <div className="row">
        <button className={`btn small${filter === '' ? ' primary' : ''}`} onClick={() => setFilter('')}>{t('all')}</button>
        {CATEGORIES.map((category) => (
          <button key={category} className={`btn small${filter === category ? ' primary' : ''}`} onClick={() => setFilter(category)}>
            {CATEGORY_META[category].emoji} {L(CATEGORY_META[category].label)}
          </button>
        ))}
      </div>
      {!data ? <Loading /> : venues.length === 0 ? <div className="glass"><Empty /></div> : (
        <div className="grid cards">
          {venues.map((venue) => {
            const cheapest = [...venue.offers].sort((a, b) => a.memberPriceBaisa - b.memberPriceBaisa)[0];
            return (
              <button key={venue.id} type="button" className="glass venue-card" style={{ textAlign: 'start', cursor: 'pointer', font: 'inherit', color: 'inherit' }}
                onClick={() => setEditing({ ...venue })}>
                <div className="venue-art" style={{ background: categoryGradient(venue.category) }}>
                  <span aria-hidden>{CATEGORY_META[venue.category].emoji}</span>
                  {venue.imageUrl && <img src={venue.imageUrl} alt="" loading="lazy" />}
                  <div className="badges">
                    <span className={`badge ${venue.isPublished ? 'green' : ''}`} style={{ background: 'rgba(255,255,255,.85)' }}>
                      {venue.isPublished ? t('published') : t('draft')}
                    </span>
                    {venue.isFeatured && <span className="badge gold" style={{ background: 'rgba(255,255,255,.85)' }}>★ {t('featured')}</span>}
                  </div>
                </div>
                <div className="venue-body">
                  <h3>{L(venue.name)}</h3>
                  <span className="muted small">{L(venue.area)}</span>
                  {venue.eventStartsAt && <span className="badge orange">📅 {date(venue.eventStartsAt)}{venue.eventEndsAt ? ` – ${date(venue.eventEndsAt)}` : ''}</span>}
                  {cheapest && (
                    <div className="row small">
                      <span className="muted">{t('fromPrice')}</span>
                      <span className="price-old num">{money(cheapest.originalPriceBaisa)}</span>
                      <span className="price-new num">{money(cheapest.memberPriceBaisa)}</span>
                      <span className="muted">· {number(venue.offers.length)} 🎟️</span>
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
      {editing && <VenueEditor initial={editing} onClose={() => setEditing(null)} onSaved={() => void reload()} />}
    </>
  );
}

function VenueEditor({ initial, onClose, onSaved }: { initial: VenueDraft; onClose: () => void; onSaved: () => void }) {
  const { t, L } = useI18n();
  const toast = useToast();
  const errorText = useErrorText();
  const [venue, setVenue] = useState<VenueDraft>(initial);
  const [busy, setBusy] = useState(false);
  const confirmAction = useConfirm();
  const set = <K extends keyof VenueDraft>(key: K, value: VenueDraft[K]) => setVenue((current) => ({ ...current, [key]: value }));

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    const { id, offers: _offers, ...body } = venue;
    void _offers;
    try {
      const result = id
        ? await patch<{ venue: Venue }>(`admin/venues/${id}`, body)
        : await post<{ venue: Venue }>('admin/venues', body);
      setVenue({ ...result.venue });
      toast(t('saved'));
      onSaved();
    } catch (error) {
      toast(errorText(error), true);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!venue.id || !(await confirmAction(t('confirmDelete'), { action: t('delete') }))) return;
    try {
      await del(`admin/venues/${venue.id}`);
      onSaved();
      onClose();
    } catch (error) {
      toast(errorText(error), true);
    }
  };

  return (
    <Modal title={venue.id ? L(venue.name) || t('edit') : t('newVenue')} onClose={onClose}>
      <form className="stack" onSubmit={(event) => void save(event)}>
        <div className="row">
          <Toggle label={t('published')} checked={venue.isPublished} onChange={(value) => set('isPublished', value)} />
          <Toggle label={t('featured')} checked={venue.isFeatured} onChange={(value) => set('isFeatured', value)} />
        </div>
        {!venue.id && <p className="muted small">📣 {t('announceHint')}</p>}
        <div className="pair">
          <Field label={t('category')}>
            <select className="select" value={venue.category} onChange={(event) => set('category', event.target.value as Category)}>
              {CATEGORIES.map((category) => <option key={category} value={category}>{CATEGORY_META[category].emoji} {L(CATEGORY_META[category].label)}</option>)}
            </select>
          </Field>
          <Field label={t('linkName')}>
            <input className="input ltr" dir="ltr" required pattern="[a-z0-9\-]{3,60}" placeholder="muscat-nights-2026" value={venue.slug}
              onChange={(event) => set('slug', event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))} />
          </Field>
        </div>
        <LocalizedField label={t('name')} value={venue.name} onChange={(value) => set('name', value)} />
        <LocalizedField label={t('area')} value={venue.area} onChange={(value) => set('area', value)} />
        <LocalizedField label={t('summary')} value={venue.summary} onChange={(value) => set('summary', value)} />
        <LocalizedField label={t('about')} multiline value={venue.about} onChange={(value) => set('about', value)} />
        <LocalizedLinesField label={t('highlights')} value={venue.highlights} onChange={(value) => set('highlights', value)} />
        <LocalizedField label={t('openingHours')} value={venue.openingHours} onChange={(value) => set('openingHours', value)} />
        <ImageUpload label={t('photo')} value={venue.imageUrl} onChange={(url) => set('imageUrl', url)} />
        <div className="triple">
          <DateTimeField label={t('eventStarts')} value={venue.eventStartsAt} onChange={(value) => set('eventStartsAt', value)} />
          <DateTimeField label={t('eventEnds')} value={venue.eventEndsAt} onChange={(value) => set('eventEndsAt', value)} />
          <DateTimeField label={t('dealEnds')} value={venue.dealEndsAt} onChange={(value) => set('dealEndsAt', value)} />
        </div>
        <div className="triple">
          <Field label={t('latitude')}><input className="input num ltr" type="number" step="any" required value={venue.latitude} onChange={(e) => set('latitude', Number(e.target.value))} /></Field>
          <Field label={t('longitude')}><input className="input num ltr" type="number" step="any" required value={venue.longitude} onChange={(e) => set('longitude', Number(e.target.value))} /></Field>
          <Field label={t('rating')}><input className="input num ltr" type="number" step="0.1" min={0} max={5} value={venue.rating} onChange={(e) => set('rating', Number(e.target.value))} /></Field>
        </div>
        <div className="row between">
          <div className="row">
            <button className="btn primary" disabled={busy}>{busy ? t('loading') : t('save')}</button>
            <button type="button" className="btn" onClick={onClose}>{t('close')}</button>
          </div>
          {venue.id && <button type="button" className="btn danger small" onClick={() => void remove()}>{t('delete')}</button>}
        </div>
      </form>

      <div className="stack" style={{ marginTop: 26 }}>
        <div>
          <h2>🎟️ {t('tickets')}</h2>
          <p className="muted small" style={{ marginTop: 4 }}>{t('ticketsHint')}</p>
        </div>
        {venue.id
          ? <OffersEditor venueID={venue.id} offers={venue.offers} onChange={(offers) => set('offers', offers)} />
          : <p className="muted">{t('saveVenueFirst')}</p>}
      </div>
    </Modal>
  );
}

type OfferDraft = { id?: string; key: string; title: Localized; perks: Localized[]; original: string; member: string; remaining: string; isActive: boolean };

const toDraft = (offer: Offer): OfferDraft => ({
  id: offer.id, key: offer.id, title: offer.title, perks: offer.perks, original: toOMR(offer.originalPriceBaisa),
  member: toOMR(offer.memberPriceBaisa), remaining: offer.remaining === null ? '' : String(offer.remaining), isActive: offer.isActive,
});

function OffersEditor({ venueID, offers, onChange }: { venueID: string; offers: Offer[]; onChange: (offers: Offer[]) => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const errorText = useErrorText();
  const [drafts, setDrafts] = useState<OfferDraft[]>(offers.map(toDraft));
  const confirmAction = useConfirm();
  const [busy, setBusy] = useState<string | null>(null);

  const update = (key: string, patchValue: Partial<OfferDraft>) =>
    setDrafts((all) => all.map((draft) => (draft.key === key ? { ...draft, ...patchValue } : draft)));

  const save = async (draft: OfferDraft) => {
    setBusy(draft.key);
    const body = {
      title: draft.title, perks: draft.perks, originalPriceBaisa: fromOMR(draft.original), memberPriceBaisa: fromOMR(draft.member),
      remaining: draft.remaining.trim() === '' ? null : Number(draft.remaining), isActive: draft.isActive,
    };
    try {
      const { offer } = draft.id
        ? await patch<{ offer: Offer }>(`admin/offers/${draft.id}`, body)
        : await post<{ offer: Offer }>(`admin/venues/${venueID}/offers`, body);
      const next = drafts.map((item) => (item.key === draft.key ? toDraft(offer) : item));
      setDrafts(next);
      onChange(next.filter((item) => item.id).map((item) => ({
        id: item.id!, title: item.title, perks: item.perks, originalPriceBaisa: fromOMR(item.original),
        memberPriceBaisa: fromOMR(item.member), remaining: item.remaining === '' ? null : Number(item.remaining), isActive: item.isActive,
      })));
      toast(t('saved'));
    } catch (error) {
      toast(errorText(error), true);
    } finally {
      setBusy(null);
    }
  };

  const remove = async (draft: OfferDraft) => {
    if (draft.id) {
      if (!(await confirmAction(t('confirmDelete'), { action: t('delete') }))) return;
      try { await del(`admin/offers/${draft.id}`); } catch (error) { toast(errorText(error), true); return; }
    }
    setDrafts((all) => all.filter((item) => item.key !== draft.key));
  };

  return (
    <div className="stack">
      {drafts.map((draft) => {
        const original = fromOMR(draft.original || '0');
        const member = fromOMR(draft.member || '0');
        const off = original > 0 ? Math.round((1 - member / original) * 100) : 0;
        return (
          <div key={draft.key} className="stack glass card" style={{ gap: 12 }}>
            <LocalizedField label={t('ticketTitle')} value={draft.title} onChange={(title) => update(draft.key, { title })} />
            <LocalizedLinesField label={t('perks')} value={draft.perks} onChange={(perks) => update(draft.key, { perks })} />
            <div className="triple">
              <Field label={t('originalPrice')}><input className="input num ltr" inputMode="decimal" value={draft.original} onChange={(e) => update(draft.key, { original: e.target.value })} /></Field>
              <Field label={t('memberPrice')} hint={off > 0 ? `−${off}%` : undefined}><input className="input num ltr" inputMode="decimal" value={draft.member} onChange={(e) => update(draft.key, { member: e.target.value })} /></Field>
              <Field label={t('remaining')}><input className="input num ltr" inputMode="numeric" value={draft.remaining} onChange={(e) => update(draft.key, { remaining: e.target.value.replace(/\D/g, '') })} /></Field>
            </div>
            <div className="row between">
              <Toggle label={t('onSale')} checked={draft.isActive} onChange={(isActive) => update(draft.key, { isActive })} />
              <div className="row">
                <button type="button" className="btn primary small" disabled={busy === draft.key} onClick={() => void save(draft)}>{t('save')}</button>
                <button type="button" className="btn small ghost" onClick={() => void remove(draft)}>{t('delete')}</button>
              </div>
            </div>
          </div>
        );
      })}
      <div>
        <button type="button" className="btn" onClick={() => setDrafts((all) => [...all, {
          key: `new-${Date.now()}`, title: blank(), perks: [], original: '', member: '', remaining: '', isActive: true,
        }])}>＋ {t('addTicket')}</button>
      </div>
    </div>
  );
}
