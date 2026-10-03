import { ReceiptView } from '../../../../components/ReceiptView';

export const metadata = { robots: { index: false } };

export default async function ReceiptPage({ params, searchParams }: { params: Promise<{ code: string }>; searchParams: Promise<{ t?: string }> }) {
  const { code } = await params;
  const { t } = await searchParams;
  return <ReceiptView code={code} token={t ?? null} />;
}
