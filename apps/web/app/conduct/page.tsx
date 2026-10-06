import { LegalPage } from '../../components/LegalPage';
import { apiGet } from '../../lib/server-api';

export async function generateMetadata() {
  const d = await apiGet<{ title: string }>('/api/legal/code_of_conduct', 300);
  return { title: d?.title ?? '' };
}

export default function Page() {
  return <LegalPage type="code_of_conduct" />;
}
