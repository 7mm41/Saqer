import { TrackLookup } from '../../components/TrackLookup';
import { getMessages } from '../../lib/i18n';

export async function generateMetadata() {
  const { m } = await getMessages();
  return { title: m.track.title };
}

export default function Page() {
  return <TrackLookup />;
}
