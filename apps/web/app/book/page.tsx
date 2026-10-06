import { getMessages } from '../../lib/i18n';
import { apiGet, getAreas } from '../../lib/server-api';
import { BookingFlow } from '../../components/BookingFlow';

export async function generateMetadata() {
  const { m } = await getMessages();
  return { title: m.book.title, robots: { index: true } };
}

export default async function BookPage({ searchParams }: { searchParams: Promise<{ t?: string; repeat?: string }> }) {
  const sp = await searchParams;
  const areas = await getAreas();
  let techName: string | null = null;
  let slug: string | null = null;
  if (sp.t) {
    const t = await apiGet<{ name: string; bookable: boolean }>(`/api/technicians/${encodeURIComponent(sp.t)}`, 30);
    if (t?.bookable) {
      techName = t.name;
      slug = sp.t;
    }
  }
  return <BookingFlow areas={areas} techSlug={slug} techName={techName} repeatOf={sp.repeat ?? null} />;
}
