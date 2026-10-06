import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { formatOMR, parseOMR } from '@katf/shared';
import { Button, Card, Checkbox, DataTable, Money, TextArea, TextField } from '@katf/ui';
import { Act, api, FormModal, Loaded, PageHead, Pill, post, ReasonField, useLoad } from '../components';
import { useAdmin } from '../App';
import { ApiError } from '../lib/api';

// ---------------------------------------------------------------- service catalog (§9.2 #11)
type Svc = { id?: string; nameAr: string; nameEn: string; descriptionAr?: string | null; descriptionEn?: string | null; durationMin?: number | null; priceGuideMin?: number | null; priceGuideMax?: number | null; active: boolean; sort?: number };

export function Catalog() {
  const { m, locale, can } = useAdmin();
  const s = useLoad(() => api<Svc[]>('/catalog'));
  const [edit, setEdit] = useState<Svc | null>(null);
  const owner = can([]);
  return (
    <>
      <PageHead title={m.catalog.title} onRefresh={s.reload} actions={owner && <Button size="sm" variant="primary" icon={<Plus size={16} aria-hidden />} onClick={() => setEdit({ nameAr: '', nameEn: '', active: true })}>{m.catalog.add}</Button>} />
      <Loaded state={s}>
        {(rows) => (
          <Card>
            <DataTable
              rows={rows}
              rowKey={(r) => r.id!}
              onRow={owner ? (r) => setEdit(r) : undefined}
              columns={[
                { key: 'name', label: m.common.name, render: (r) => <strong>{locale === 'en' ? r.nameEn : r.nameAr}</strong> },
                { key: 'active', label: m.common.status, render: (r) => <Pill status={r.active ? 'active' : 'expired'} label={r.active ? m.catalog.active : '—'} /> },
                { key: 'durationMin', label: m.catalog.duration, render: (r) => <span className="k-num">{r.durationMin ?? '—'}</span> },
                {
                  key: 'price',
                  label: `${m.catalog.priceMin} – ${m.catalog.priceMax}`,
                  render: (r) => (r.priceGuideMin != null ? <span className="k-row" style={{ gap: 4 }}><Money baisa={r.priceGuideMin} /> – <Money baisa={r.priceGuideMax} /></span> : '—'),
                },
                { key: 'sort', label: m.catalog.sort, render: (r) => <span className="k-num">{r.sort}</span> },
              ]}
            />
          </Card>
        )}
      </Loaded>
      {edit && <CatalogEdit svc={edit} onClose={() => setEdit(null)} onDone={s.reload} />}
    </>
  );
}

function CatalogEdit({ svc, onClose, onDone }: { svc: Svc; onClose: () => void; onDone: () => void }) {
  const { m } = useAdmin();
  const [v, setV] = useState({ ...svc, min: svc.priceGuideMin != null ? formatOMR(svc.priceGuideMin) : '', max: svc.priceGuideMax != null ? formatOMR(svc.priceGuideMax) : '', dur: svc.durationMin != null ? String(svc.durationMin) : '' });
  const [reason, setReason] = useState('');
  return (
    <FormModal
      open
      onClose={onClose}
      title={svc.id ? `${m.common.save}: ${svc.nameAr}` : m.catalog.add}
      submitLabel={m.common.save}
      onSubmit={async () => {
        const min = v.min.trim() ? parseOMR(v.min) : null;
        const max = v.max.trim() ? parseOMR(v.max) : null;
        if ((v.min.trim() && min == null) || (v.max.trim() && max == null)) throw new ApiError(400, 'invalid_price');
        await post('/catalog', {
          ...(svc.id ? { id: svc.id } : {}),
          nameAr: v.nameAr,
          nameEn: v.nameEn,
          descriptionAr: v.descriptionAr || null,
          descriptionEn: v.descriptionEn || null,
          durationMin: v.dur ? Number(v.dur) : null,
          priceGuideMin: min,
          priceGuideMax: max,
          active: v.active,
          ...(v.sort != null ? { sort: v.sort } : {}),
          reason,
        });
        onDone();
      }}
    >
      <div className="k-grid" style={{ '--min': '200px' } as React.CSSProperties}>
        <TextField label={m.catalog.nameAr} value={v.nameAr} onChange={(e) => setV({ ...v, nameAr: e.target.value })} maxLength={80} />
        <TextField label={m.catalog.nameEn} value={v.nameEn} onChange={(e) => setV({ ...v, nameEn: e.target.value })} maxLength={80} dir="ltr" />
      </div>
      <TextArea label={m.catalog.descAr} value={v.descriptionAr ?? ''} onChange={(e) => setV({ ...v, descriptionAr: e.target.value })} maxLength={500} />
      <TextArea label={m.catalog.descEn} value={v.descriptionEn ?? ''} onChange={(e) => setV({ ...v, descriptionEn: e.target.value })} maxLength={500} dir="ltr" />
      <div className="k-grid" style={{ '--min': '140px' } as React.CSSProperties}>
        <TextField label={m.catalog.duration} value={v.dur} onChange={(e) => setV({ ...v, dur: e.target.value.replace(/\D/g, '') })} inputMode="numeric" dir="ltr" />
        <TextField label={m.catalog.priceMin} value={v.min} onChange={(e) => setV({ ...v, min: e.target.value })} inputMode="decimal" dir="ltr" />
        <TextField label={m.catalog.priceMax} value={v.max} onChange={(e) => setV({ ...v, max: e.target.value })} inputMode="decimal" dir="ltr" />
      </div>
      <Checkbox checked={v.active} onChange={(x) => setV({ ...v, active: x })}>
        {m.catalog.active}
      </Checkbox>
      <ReasonField value={reason} onChange={setReason} />
    </FormModal>
  );
}

// ---------------------------------------------------------------- areas (§9.2 #12)
type Hood = { id: string; ar: string; en: string; lat: number; lng: number; radius?: number };

export function Areas() {
  const { m, locale, can } = useAdmin();
  const s = useLoad(() => api<any[]>('/areas'));
  const [edit, setEdit] = useState<any>(null);
  const owner = can([]);
  return (
    <>
      <PageHead title={m.areas.title} onRefresh={s.reload} />
      <Loaded state={s}>
        {(rows) => (
          <div className="k-grid" style={{ '--min': '300px' } as React.CSSProperties}>
            {rows.map((a) => (
              <Card
                key={a.wilayat}
                title={locale === 'en' ? a.nameEn : a.nameAr}
                actions={<Pill status={a.active ? 'active' : 'expired'} label={a.active ? m.areas.active : '—'} />}
              >
                <div className="k-stack" style={{ gap: 8 }}>
                  <span className="k-small">
                    {m.areas.waitlist}: <strong className="k-num">{a.waitlistCount}</strong>
                  </span>
                  <span className="k-small">
                    {m.bookings.visitFee}: {a.visitFeeOverride != null ? <Money baisa={a.visitFeeOverride} /> : '—'}
                  </span>
                  <span className="k-small k-muted">
                    {m.areas.neighbourhoods}: {a.neighbourhoods.map((n: Hood) => n[locale]).join('، ') || '—'}
                  </span>
                  {owner && (
                    <div className="a-actions">
                      <Act label={a.active ? m.areas.deactivate : m.areas.activate} run={(reason) => api(`/areas/${a.wilayat}`, { method: 'PATCH', json: { active: !a.active, reason } })} onDone={s.reload} variant={a.active ? 'secondary' : 'primary'} />
                      <Button size="sm" variant="quiet" onClick={() => setEdit(a)}>
                        {m.common.details}
                      </Button>
                    </div>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}
      </Loaded>
      {edit && <AreaEdit area={edit} onClose={() => setEdit(null)} onDone={s.reload} />}
    </>
  );
}

function AreaEdit({ area, onClose, onDone }: { area: any; onClose: () => void; onDone: () => void }) {
  const { m } = useAdmin();
  const [fee, setFee] = useState(area.visitFeeOverride != null ? formatOMR(area.visitFeeOverride) : '');
  const [hoods, setHoods] = useState<Hood[]>(area.neighbourhoods);
  const [reason, setReason] = useState('');
  const upd = (i: number, patch: Partial<Hood>) => setHoods(hoods.map((h, j) => (i === j ? { ...h, ...patch } : h)));
  return (
    <FormModal
      open
      onClose={onClose}
      title={area.nameAr}
      submitLabel={m.common.save}
      onSubmit={async () => {
        const v = fee.trim() ? parseOMR(fee) : null;
        if (fee.trim() && v == null) throw new ApiError(400, 'invalid_price');
        if (hoods.some((h) => !h.id.trim() || !h.ar.trim() || !Number.isFinite(h.lat) || !Number.isFinite(h.lng))) throw new ApiError(400, 'invalid_value');
        await api(`/areas/${area.wilayat}`, { method: 'PATCH', json: { visitFeeOverride: v, neighbourhoods: hoods, reason } });
        onDone();
      }}
    >
      <TextField label={m.areas.feeOverride} value={fee} onChange={(e) => setFee(e.target.value)} inputMode="decimal" dir="ltr" />
      <span className="k-label">{m.areas.neighbourhoods}</span>
      {hoods.map((h, i) => (
        <div key={i} className="k-card k-tight" style={{ background: 'var(--surface-2)' }}>
          <div className="k-grid" style={{ '--min': '120px', '--gap': '8px' } as React.CSSProperties}>
            <TextField label="id" value={h.id} onChange={(e) => upd(i, { id: e.target.value.replace(/[^a-z0-9_-]/g, '') })} dir="ltr" />
            <TextField label={m.catalog.nameAr} value={h.ar} onChange={(e) => upd(i, { ar: e.target.value })} />
            <TextField label={m.catalog.nameEn} value={h.en} onChange={(e) => upd(i, { en: e.target.value })} dir="ltr" />
            <TextField label="lat" value={String(h.lat)} onChange={(e) => upd(i, { lat: Number(e.target.value) })} inputMode="decimal" dir="ltr" />
            <TextField label="lng" value={String(h.lng)} onChange={(e) => upd(i, { lng: Number(e.target.value) })} inputMode="decimal" dir="ltr" />
            <TextField label={m.areas.radius} value={h.radius != null ? String(h.radius) : ''} onChange={(e) => upd(i, { radius: e.target.value ? Number(e.target.value.replace(/\D/g, '')) : undefined })} inputMode="numeric" dir="ltr" />
          </div>
          <Button size="sm" variant="quiet" icon={<Trash2 size={14} aria-hidden />} onClick={() => setHoods(hoods.filter((_, j) => j !== i))}>
            {m.common.remove}
          </Button>
        </div>
      ))}
      <Button size="sm" icon={<Plus size={14} aria-hidden />} onClick={() => setHoods([...hoods, { id: '', ar: '', en: '', lat: hoods[0]?.lat ?? 23.6, lng: hoods[0]?.lng ?? 58.4 }])}>
        {m.common.add}
      </Button>
      <ReasonField value={reason} onChange={setReason} />
    </FormModal>
  );
}
