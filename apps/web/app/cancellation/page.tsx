import { LegalPage } from '../../components/LegalPage';
import { apiGet } from '../../lib/server-api';

export async function generateMetadata() {
  const d = await apiGet<{ title: string }>('/api/legal/cancellation_refund', 300);
  return { title: d?.title ?? '' };
}

export default function Page() {
  return <LegalPage type="cancellation_refund" />;
}
