import { useEffect, useState, type FormEvent } from 'react';
import { fromOMR, get, patch, toOMR, type Localized, type Plan } from '../api';
import { useI18n } from '../i18n';
import { useLive } from '../live';
import { DateTimeField, Field, Loading, LocalizedField, LocalizedLinesField, PageHead, useErrorText, useLoad, useToast } from '../ui';

type Draft = {
  name: Localized; description: Localized; price: string; durationDays: string; perks: Localized[];
  promoPrice: string; promoLabel: Localized; promoStartsAt: string | null; promoEndsAt: string | null;
};

const toDraft = (plan: Plan): Draft => ({
  name: plan.name, description: plan.description, price: toOMR(plan.priceBaisa), durationDays: String(plan.durationDays),
  perks: plan.perks, promoPrice: plan.promoPriceBaisa === null ? '' : toOMR(plan.promoPriceBaisa),
  promoLabel: plan.promoLabel ?? { en: 'National Day offer', ar: 'عرض العيد الوطني' },
  promoStartsAt: plan.promoStartsAt, promoEndsAt: plan.promoEndsAt,
});

export function PlanPage() {
  const { t, L, money, date } = useI18n();
  const toast = useToast();
  const errorText = useErrorText();
  const { data, reload } = useLoad(() => get<{ plans: Plan[] }>('admin/plans'), []);
  useLive(['plans'], () => void reload());
  const plan = data?.plans[0];
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (plan && !draft) setDraft(toDraft(plan)); }, [plan, draft]);
  if (!plan || !draft) return <Loading />;
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft({ ...draft, [key]: value });

  const save = async (event: FormEvent, removePromo = false) => {
    event.preventDefault();
    setBusy(true);
    try {
      const hasPromo = !removePromo && draft.promoPrice.trim() !== '';
      const { plan: saved } = await patch<{ plan: Plan }>(`admin/plans/${plan.id}`, {
        name: draft.name, description: draft.description, priceBaisa: fromOMR(draft.price), durationDays: Number(draft.durationDays),
        perks: draft.perks,
        promoPriceBaisa: hasPromo ? fromOMR(draft.promoPrice) : null,
        promoLabel: hasPromo ? draft.promoLabel : null,
        promoStartsAt: hasPromo ? draft.promoStartsAt : null,
        promoEndsAt: hasPromo ? draft.promoEndsAt : null,
      });
      setDraft(toDraft(saved));
      toast(t('saved'));
      void reload();
    } catch (error) {
      toast(errorText(error), true);
    } finally {
      setBusy(false);
    }
  };

  const price = fromOMR(draft.price || '0');
  const promoPrice = draft.promoPrice.trim() ? fromOMR(draft.promoPrice) : null;
  const now = Date.now();
  const promoState = plan.promo ? 'running'
    : plan.promoPriceBaisa !== null && plan.promoStartsAt && Date.parse(plan.promoStartsAt) > now ? 'scheduled' : null;

  return (
    <>
      <PageHead title={t('plan')} hint={t('planHint')} />
      <div className="grid two">
        <form className="glass card stack" onSubmit={(event) => void save(event)}>
          <LocalizedField label={t('name')} value={draft.name} onChange={(value) => set('name', value)} />
          <LocalizedField label={t('description')} value={draft.description} onChange={(value) => set('description', value)} />
          <div className="pair">
            <Field label={t('price')}><input className="input num ltr" inputMode="decimal" required value={draft.price} onChange={(e) => set('price', e.target.value)} /></Field>
            <Field label={t('duration')}><input className="input num ltr" type="number" min={1} required value={draft.durationDays} onChange={(e) => set('durationDays', e.target.value)} /></Field>
          </div>
          <LocalizedLinesField label={t('perks')} value={draft.perks} onChange={(value) => set('perks', value)} />

          <div className="glass card stack" style={{ marginTop: 6 }}>
            <div className="row between">
              <h3>🎁 {t('discount')}</h3>
              {promoState === 'running' && <span className="badge green">{t('discountRunning')}</span>}
              {promoState === 'scheduled' && <span className="badge orange">{t('discountScheduled')}</span>}
            </div>
            <p className="muted small">{t('discountHint')}</p>
            <Field label={t('discountPrice')}><input className="input num ltr" inputMode="decimal" value={draft.promoPrice} onChange={(e) => set('promoPrice', e.target.value)} /></Field>
            <LocalizedField label={t('discountLabel')} value={draft.promoLabel} required={false} onChange={(value) => set('promoLabel', value)} />
            <div className="pair">
              <DateTimeField label={t('discountStarts')} value={draft.promoStartsAt} onChange={(value) => set('promoStartsAt', value)} />
              <DateTimeField label={t('discountEnds')} value={draft.promoEndsAt} onChange={(value) => set('promoEndsAt', value)} />
            </div>
            {plan.promoPriceBaisa !== null && (
              <div><button type="button" className="btn small ghost" disabled={busy} onClick={(event) => void save(event, true)}>{t('removeDiscount')}</button></div>
            )}
          </div>
          <div className="row"><button className="btn primary" disabled={busy}>{busy ? t('loading') : t('save')}</button></div>
        </form>

        <section className="stack">
          <h3 className="muted">{t('appPreview')}</h3>
          {/* Mirrors the app's membership card. */}
          <div className="glass tinted card stack" style={{ borderRadius: 32 }}>
            <div className="row">
              <span style={{ fontSize: 30, width: 60, height: 60, borderRadius: '50%', display: 'grid', placeItems: 'center', background: 'rgba(255,255,255,.25)', border: '1px solid rgba(255,255,255,.6)' }}>👑</span>
              <h2>{L(draft.name)}</h2>
            </div>
            {promoPrice !== null && (
              <span className="badge" style={{ background: 'rgba(255,255,255,.28)', color: '#fff', borderColor: 'rgba(255,255,255,.5)', alignSelf: 'flex-start' }}>
                🎁 {L(draft.promoLabel)}{draft.promoEndsAt ? ` · ${t('until')} ${date(draft.promoEndsAt)}` : ''}
              </span>
            )}
            <div>
              {promoPrice !== null && <div className="num" style={{ textDecoration: 'line-through', opacity: .75, fontWeight: 700 }}>{money(price)}</div>}
              <div className="num" style={{ fontSize: 40, fontWeight: 900 }}>{money(promoPrice ?? price)} <span style={{ fontSize: 16, opacity: .85 }}>{t('perYear')}</span></div>
              <div className="muted">{L(draft.description)}</div>
            </div>
            <div className="stack" style={{ gap: 6 }}>
              {draft.perks.map((perk, index) => <div key={index}>✓ {L(perk)}</div>)}
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
