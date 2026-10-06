import { ReturnView } from '../../../components/ReturnView';

export const metadata = { robots: { index: false } };

export default async function ReturnPage({ searchParams }: { searchParams: Promise<{ payment?: string; result?: string }> }) {
  const sp = await searchParams;
  return <ReturnView paymentId={sp.payment ?? null} result={sp.result ?? null} />;
}
