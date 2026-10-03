/** Production seed (§16): default settings rows are implicit; catalog, areas, legal drafts, templates. No accounts. */
import { eq } from 'drizzle-orm';
import { SEED_AREAS } from '@katf/shared';
import type { Ctx } from './ctx';
import { areas, serviceCatalog } from './db/schema';
import { newId } from './lib/ids';
import { seedLegalDrafts } from './services/legal';
import { seedTemplates } from './services/notifications';

const CATALOG = [
  { nameAr: 'فحص وتشخيص', nameEn: 'Inspection and diagnosis', durationMin: 30 },
  { nameAr: 'تنظيف وغسيل', nameEn: 'Cleaning and washing', durationMin: 60 },
  { nameAr: 'تعبئة غاز', nameEn: 'Gas refill', durationMin: 45 },
  { nameAr: 'إصلاح تسريب', nameEn: 'Leak repair', durationMin: 90 },
  { nameAr: 'كمبروسر', nameEn: 'Compressor', durationMin: 180 },
  { nameAr: 'لوحة إلكترونية', nameEn: 'Control board', durationMin: 90 },
  { nameAr: 'تركيب وفك', nameEn: 'Install and remove', durationMin: 120 },
  { nameAr: 'مكيّفات مركزية ومخفية', nameEn: 'Central and ducted units', durationMin: 120 },
];

export async function seedProduction(ctx: Ctx) {
  const existingAreas = await ctx.db.select({ w: areas.wilayat }).from(areas);
  let sort = 0;
  for (const a of SEED_AREAS) {
    sort++;
    if (existingAreas.some((x) => x.w === a.wilayat)) continue;
    await ctx.db.insert(areas).values({
      wilayat: a.wilayat,
      governorate: a.governorate,
      nameAr: a.nameAr,
      nameEn: a.nameEn,
      active: a.active,
      neighbourhoods: a.neighbourhoods.map((n) => ({ ...n })),
      sort,
    });
  }
  const cat = await ctx.db.select({ id: serviceCatalog.id }).from(serviceCatalog).limit(1);
  if (!cat.length) {
    // price-guide bands are left empty: the owner enters real numbers in admin (no invented prices)
    let i = 0;
    for (const c of CATALOG) await ctx.db.insert(serviceCatalog).values({ id: newId(), ...c, sort: i++, active: true });
  }
  await seedLegalDrafts(ctx);
  await seedTemplates(ctx.db);
  void eq;
}
