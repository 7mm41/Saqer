import { AccountView } from '../../components/AccountView';
import { getMessages } from '../../lib/i18n';

export async function generateMetadata() {
  const { m } = await getMessages();
  return { title: m.account.title, robots: { index: false } };
}

export default function Page() {
  return <AccountView />;
}
