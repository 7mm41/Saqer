import { TrackingView } from '../../../components/TrackingView';

export const metadata = { robots: { index: false } };

export default async function TrackPage({ params, searchParams }: { params: Promise<{ code: string }>; searchParams: Promise<{ t?: string }> }) {
  const { code } = await params;
  const { t } = await searchParams;
  return <TrackingView code={code} token={t ?? null} />;
}
