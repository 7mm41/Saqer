import { MessageCircle, Mail } from 'lucide-react';
import { getMessages } from '../../lib/i18n';
import { getConfig } from '../../lib/server-api';
import { PageHead } from '../../components/Blocks';
import { ContactForm } from '../../components/ContactForm';

export async function generateMetadata() {
  const { m } = await getMessages();
  return { title: m.contact.title };
}

export default async function ContactPage() {
  const { m } = await getMessages();
  const s = (await getConfig()).settings;
  return (
    <div className="k-container k-narrow k-stack" style={{ gap: 20 }}>
      <PageHead title={m.contact.title} />
      <section className="k-card k-stack" style={{ gap: 10 }}>
        {s.whatsapp_number ? (
          <p className="k-row">
            <MessageCircle aria-hidden /> {m.contact.whatsapp}: <span className="k-num">{String(s.whatsapp_number)}</span>
          </p>
        ) : null}
        {s.contact_email ? (
          <p className="k-row">
            <Mail aria-hidden /> {m.contact.email}: <span className="k-ltr">{String(s.contact_email)}</span>
          </p>
        ) : null}
      </section>
      <section className="k-card k-stack">
        <h2>{m.contact.formTitle}</h2>
        <ContactForm />
      </section>
    </div>
  );
}
