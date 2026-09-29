// Sarena website. Everything the dashboard controls — the seasonal logo and
// greeting, the membership price and discount, store and contact links — is
// read live from the API, so changes appear here without editing this site.

const STRINGS = {
  brand: ['Sarena', 'سرينا'],
  navExperiences: ['Experiences', 'التجارب'],
  navHow: ['How it works', 'كيف تعمل'],
  navPricing: ['Pricing', 'السعر'],
  navPartners: ['Partners', 'للشركاء'],
  navFaq: ['FAQ', 'الأسئلة'],
  langSwitch: ['العربية', 'English'],
  heroPill: ['Members only · all over Oman', 'للأعضاء فقط · في كل عُمان'],
  heroTitle: ["Oman's best experiences<br><span class=\"grad\">at member prices</span>", 'أفضل تجارب عُمان<br><span class="grad">بأسعار الأعضاء</span>'],
  heroLead: [
    'One yearly membership unlocks exclusive prices at cinemas, jet skis, Oman Shooting Club, the Automobile Association, Ibri Arena, gaming arcades and Oman’s festivals. Book in the app, show your code at the door.',
    'اشتراك سنوي واحد يفتح لك أسعاراً حصرية في السينما والجيت سكي ونادي الرماية والسيارات وساحة عبري وصالات الألعاب ومهرجانات عُمان. احجز من التطبيق واعرض الكود عند المدخل.',
  ],
  appStoreSmall: ['Download on the', 'حمّله من'],
  googlePlaySmall: ['Get it on', 'احصل عليه من'],
  soon: ['Soon', 'قريباً'],
  priceNote: ['One membership', 'اشتراك واحد فقط'],
  perYear: ['a year', 'سنوياً'],
  perYearSlash: ['/ year', '/ سنوياً'],
  youSaved: ['Saved this month', 'وفّرت هذا الشهر'],
  catTitle: ['Seven experiences. One membership.', 'سبع تجارب. عضوية واحدة.'],
  catSub: ['Hand-picked venues and events in Muscat, Ibri and all over Oman — with new ones added all the time.', 'أماكن وفعاليات مختارة في مسقط وعبري وكل عُمان، تُضاف باستمرار.'],
  howTitle: ['How Sarena works', 'كيف تعمل سرينا'],
  step1Title: ['Join once', 'اشترك مرة واحدة'],
  step1Text: ['One yearly membership unlocks every member price, all year.', 'عضوية سنوية واحدة تفتح لك كل أسعار الأعضاء طوال السنة.'],
  step2Title: ['Book at member prices', 'احجز بسعر الأعضاء'],
  step2Text: ['Pick your ticket and see the original price struck through next to yours.', 'اختر التذكرة، وشاهد السعر الأصلي مشطوباً وسعرك الحصري بجانبه.'],
  step3Title: ['Show your code, enjoy', 'اعرض الكود واستمتع'],
  step3Text: ['Your QR code lands in your Wallet instantly — and we remind you before the event so you never miss it.', 'يصلك كود QR في المحفظة فوراً، ونذكّرك قبل موعد الفعالية حتى لا تفوتك.'],
  priceTitle: ['One price. A whole year.', 'سعر واحد. سنة كاملة.'],
  planName: ['Sarena Annual Membership', 'عضوية سرينا السنوية'],
  perk1: ['Member prices at every Sarena venue and event', 'أسعار الأعضاء في كل أماكن وفعاليات سرينا'],
  perk2: ['Instant booking codes, no printing or queues', 'أكواد حجز فورية بلا طباعة ولا طوابير'],
  perk3: ['Early access to festivals and new venues', 'وصول مبكر للمهرجانات والأماكن الجديدة'],
  getApp: ['Get the app', 'حمّل التطبيق'],
  monthly: ['That’s just {price} a month', 'أي ما يعادل {price} شهرياً فقط'],
  until: ['until {date}', 'حتى {date}'],
  partnerTitle: ['Own a venue or run an event?', 'صاحب مكان أو فعالية؟'],
  partnerText: ['Join Sarena and fill empty seats with members ready to book. No upfront fees, and every member shows a code you check at the door.', 'انضم إلى سرينا واملأ مقاعدك الفارغة بأعضاء جاهزين للحجز. بلا رسوم مقدّمة، وكل عضو يعرض كوداً تتحقق منه عند المدخل.'],
  contactWhatsapp: ['Chat on WhatsApp', 'تواصل عبر واتساب'],
  contactEmail: ['Email us', 'راسلنا'],
  faqTitle: ['Questions', 'أسئلة شائعة'],
  q1: ['How much is the membership?', 'كم سعر الاشتراك؟'],
  a1: ['One yearly membership, covering every venue and event all year.', 'اشتراك سنوي واحد فقط، يغطي كل الأماكن والفعاليات طوال السنة.'],
  q2: ['How do I use my discount?', 'كيف أستخدم الخصم؟'],
  a2: ['Book in the app and a QR code lands in your Wallet. Show it at the entrance and the member price is applied.', 'احجز من التطبيق، ويصلك كود QR في المحفظة. اعرضه عند المدخل ويُطبّق سعر الأعضاء مباشرة.'],
  q3: ['Does it renew automatically?', 'هل يتجدد الاشتراك تلقائياً؟'],
  a3: ['No. We remind you a week before it ends, and renewing adds a year to your current end date — you never lose a day.', 'لا. نذكّرك قبل انتهاء عضويتك بأسبوع، والتجديد يضيف سنة إلى تاريخ انتهائك الحالي فلا تخسر أي يوم.'],
  q4: ['Will I hear about new events?', 'هل سأعرف بالفعاليات الجديدة؟'],
  a4: ['Yes. The app notifies you when a new event or discount arrives, and reminds you on the morning of events you booked.', 'نعم، يرسل لك التطبيق إشعاراً عند إضافة فعالية جديدة أو خصم، ويذكّرك صباح يوم الفعالية التي حجزتها.'],
  q5: ['Is there an Android app?', 'هل التطبيق متوفر على أندرويد؟'],
  a5: ['Sarena is on iPhone, and the Android app is coming soon.', 'التطبيق متوفر على iPhone، ونسخة أندرويد قادمة قريباً.'],
  privacy: ['Privacy policy', 'سياسة الخصوصية'],
  madeIn: ['Made in Oman 🇴🇲', 'صُنع في عُمان 🇴🇲'],
};

const CATEGORIES = [
  { emoji: '🎬', colors: ['#FF5A5F', '#C2185B'], title: ['Cinema', 'السينما'], text: ['Blockbusters for less', 'أحدث الأفلام بأقل سعر'] },
  { emoji: '🌊', colors: ['#3DD6F5', '#1565C0'], title: ['Jet Ski', 'جيت سكي'], text: ['Ride the Muscat coast', 'انطلق على ساحل مسقط'] },
  { emoji: '🎯', colors: ['#9CCC65', '#2E7D32'], title: ['Oman Shooting Club', 'نادي عمان للرماية'], text: ['Precision, supervised', 'دقة بإشراف احترافي'] },
  { emoji: '🏎️', colors: ['#FFB05C', '#E45A00'], title: ['Oman Automobile Association', 'الجمعية العمانية للسيارات'], text: ['Track days & karting', 'أيام الحلبة والكارتينج'] },
  { emoji: '🏟️', colors: ['#FFD54F', '#F57F17'], title: ['Ibri Arena', 'ساحة عبري'], text: ['Live shows & stunts', 'عروض حية ومهارات'] },
  { emoji: '🎮', colors: ['#B388FF', '#5E35B1'], title: ['Video Game Arcades', 'صالات الألعاب'], text: ['Play more, pay less', 'العب أكثر وادفع أقل'] },
  { emoji: '🎆', colors: ['#FF80AB', '#FF2F7D'], title: ['Oman Festivals', 'مهرجانات عُمان'], text: ['Ibri & Muscat Nights', 'عبري وليالي مسقط'] },
];

let lang = (() => {
  const fromQuery = new URLSearchParams(location.search).get('lang');
  if (fromQuery === 'en' || fromQuery === 'ar') return fromQuery;
  try { return localStorage.getItem('sarena.lang') || 'ar'; } catch { return 'ar'; }
})();
let state = { config: null, plan: null };

const i = (key) => STRINGS[key]?.[lang === 'ar' ? 1 : 0] ?? '';
const pick = (text) => (text ? (lang === 'ar' ? text.ar || text.en : text.en || text.ar) : '');
const locale = () => (lang === 'ar' ? 'ar-OM' : 'en-GB');
const omr = (baisa) => new Intl.NumberFormat(locale(), { style: 'currency', currency: 'OMR', minimumFractionDigits: 0, maximumFractionDigits: 3 }).format(baisa / 1000);
const date = (iso) => new Intl.DateTimeFormat(locale(), { day: 'numeric', month: 'long' }).format(new Date(iso));

function applyLanguage() {
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  document.title = lang === 'ar' ? 'سرينا · Sarena — أفضل تجارب عُمان بأسعار الأعضاء' : "Sarena · سرينا — Oman's best experiences at member prices";
  for (const node of document.querySelectorAll('[data-i18n]')) {
    const value = i(node.dataset.i18n);
    if (value.includes('<')) node.innerHTML = value; else node.textContent = value;
  }
  document.querySelectorAll('.step-no').forEach((node, index) => { node.textContent = (index + 1).toLocaleString(locale()); });
  document.querySelectorAll('[data-omr]').forEach((node) => { node.textContent = omr(Number(node.dataset.omr)); });
  renderCategories();
  render();
}

function renderCategories() {
  const container = document.getElementById('cats');
  container.replaceChildren(...CATEGORIES.map((category) => {
    const card = document.createElement('article');
    card.className = 'cat';
    card.style.background = `linear-gradient(135deg, ${category.colors[0]}, ${category.colors[1]})`;
    const emoji = document.createElement('span');
    emoji.className = 'emoji';
    emoji.textContent = category.emoji;
    const title = document.createElement('h3');
    title.textContent = category.title[lang === 'ar' ? 1 : 0];
    const text = document.createElement('p');
    text.textContent = category.text[lang === 'ar' ? 1 : 0];
    card.append(emoji, title, text);
    return card;
  }));
}

/** Applies what the dashboard controls. */
function render() {
  const { config, plan } = state;
  const theme = config?.theme;

  // Seasonal logo, greeting and accent.
  for (const img of document.querySelectorAll('[data-theme-logo]')) img.src = theme?.logoUrl || 'assets/logo.png';
  const season = document.getElementById('season');
  const greeting = pick(theme?.greeting);
  season.hidden = !greeting;
  document.getElementById('season-greeting').textContent = greeting;
  if (theme?.accentColor) document.documentElement.style.setProperty('--accent', theme.accentColor);
  else document.documentElement.style.removeProperty('--accent');

  // Price and discount.
  if (plan) {
    const price = plan.promo?.priceBaisa ?? plan.priceBaisa;
    document.querySelectorAll('[data-price]').forEach((node) => { node.textContent = omr(price); });
    document.getElementById('plan-name').textContent = pick(plan.name);
    const old = document.getElementById('plan-old');
    old.hidden = !plan.promo;
    old.textContent = omr(plan.priceBaisa);
    const promo = document.getElementById('plan-promo');
    promo.hidden = !plan.promo;
    if (plan.promo) {
      promo.textContent = `🎁 ${pick(plan.promo.label)}${plan.promo.endsAt ? ` · ${i('until').replace('{date}', date(plan.promo.endsAt))}` : ''}`;
    }
    document.getElementById('plan-monthly').textContent = i('monthly').replace('{price}', omr(Math.round((price * 30) / plan.durationDays)));
    if (plan.perks?.length) {
      const list = document.getElementById('plan-perks');
      list.replaceChildren(...plan.perks.map((perk) => Object.assign(document.createElement('li'), { textContent: pick(perk) })));
    }
  }

  // Store and contact links.
  const links = config?.links ?? {};
  const appStore = document.getElementById('app-store');
  appStore.href = links.appStoreUrl || '#pricing';
  const play = document.getElementById('google-play');
  const hasPlay = Boolean(links.googlePlayUrl);
  play.href = hasPlay ? links.googlePlayUrl : '#faq';
  play.classList.toggle('disabled', !hasPlay);
  document.getElementById('google-soon').hidden = hasPlay;
  const whatsapp = document.getElementById('whatsapp');
  whatsapp.href = links.whatsapp ? `https://wa.me/${links.whatsapp.replace(/\D/g, '')}` : '#partners';
  const email = document.getElementById('email');
  email.href = links.email ? `mailto:${links.email}` : '#partners';
}

async function refresh() {
  try {
    const [config, plans] = await Promise.all([
      fetch('/v1/app/config').then((r) => (r.ok ? r.json() : null)),
      fetch('/v1/plans').then((r) => (r.ok ? r.json() : null)),
    ]);
    state = { config, plan: plans?.plans?.[0] ?? null };
    render();
  } catch {
    // Offline or API down: the page keeps its built-in content.
  }
}

document.getElementById('lang-toggle').addEventListener('click', () => {
  lang = lang === 'ar' ? 'en' : 'ar';
  try { localStorage.setItem('sarena.lang', lang); } catch { /* ignore */ }
  applyLanguage();
});
document.getElementById('year').textContent = String(new Date().getFullYear());

applyLanguage();
void refresh();

// Dashboard changes (a new seasonal look, a price or discount) appear at once:
// the server pushes them over the public live stream; a slow poll covers
// networks that block it.
if (location.protocol !== 'file:' && 'EventSource' in window) {
  const stream = new EventSource('/v1/live/public');
  for (const name of ['config', 'plans']) stream.addEventListener(name, () => void refresh());
  // Reconnected after a drop: something may have changed meanwhile.
  let connectedBefore = false;
  stream.addEventListener('ready', () => { if (connectedBefore) void refresh(); connectedBefore = true; });
}
setInterval(() => { if (document.visibilityState === 'visible') void refresh(); }, 5 * 60_000);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') void refresh(); });
