import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Localized } from './api';

export type Lang = 'ar' | 'en';

// [English, Arabic]
const STRINGS = {
  appName: ['Sarena Admin', 'لوحة تحكم سرينا'],
  tagline: ['Control panel', 'لوحة التحكم'],
  overview: ['Overview', 'نظرة عامة'],
  members: ['Members', 'الأعضاء'],
  memberships: ['Memberships', 'الاشتراكات'],
  venues: ['Venues & events', 'الأماكن والفعاليات'],
  plan: ['Membership & discounts', 'العضوية والخصومات'],
  themes: ['Seasonal looks', 'المظهر الموسمي'],
  notifications: ['Notifications', 'الإشعارات'],
  redeem: ['Redeem codes', 'استخدام الأكواد'],
  signOut: ['Sign out', 'تسجيل الخروج'],
  live: ['Live', 'مباشر'],
  offline: ['Reconnecting…', 'جارٍ إعادة الاتصال…'],
  language: ['العربية', 'English'],
  signIn: ['Sign in', 'تسجيل الدخول'],
  signInHint: ['For Sarena admins and venue staff.', 'لمشرفي سرينا وموظفي الأماكن.'],
  email: ['Email', 'البريد الإلكتروني'],
  password: ['Password', 'كلمة المرور'],
  wrongLogin: ['The email or password is incorrect.', 'البريد الإلكتروني أو كلمة المرور غير صحيحة.'],
  membersOnlyApp: ['This account is a member account. Use the Sarena app.', 'هذا حساب عضو. استخدم تطبيق سرينا.'],
  networkError: ["Couldn't reach the server.", 'تعذّر الاتصال بالخادم.'],
  saved: ['Saved', 'تم الحفظ'],
  save: ['Save', 'حفظ'],
  cancel: ['Cancel', 'إلغاء'],
  delete: ['Delete', 'حذف'],
  edit: ['Edit', 'تعديل'],
  add: ['Add', 'إضافة'],
  close: ['Close', 'إغلاق'],
  search: ['Search', 'بحث'],
  all: ['All', 'الكل'],
  active: ['Active', 'فعّال'],
  expired: ['Expired', 'منتهٍ'],
  cancelled: ['Cancelled', 'ملغى'],
  suspended: ['Suspended', 'موقوف'],
  used: ['Used', 'مستخدم'],
  yes: ['Yes', 'نعم'],
  no: ['No', 'لا'],
  previous: ['Previous', 'السابق'],
  next: ['Next', 'التالي'],
  confirmDelete: ['Delete this permanently?', 'هل تريد الحذف نهائياً؟'],
  english: ['English', 'الإنجليزية'],
  arabic: ['Arabic', 'العربية'],
  omr: ['OMR', 'ر.ع.'],
  none: ['None', 'لا يوجد'],
  loading: ['Loading…', 'جارٍ التحميل…'],
  empty: ['Nothing here yet.', 'لا يوجد شيء بعد.'],
  // Overview
  welcome: ['Welcome back', 'أهلاً بعودتك'],
  overviewHint: ['Everything updates live as members join, book and redeem.', 'كل شيء يتحدث مباشرة عند انضمام الأعضاء والحجز والاستخدام.'],
  totalMembers: ['Members', 'الأعضاء'],
  activeMemberships: ['Active memberships', 'العضويات الفعّالة'],
  revenue30: ['Revenue · 30 days', 'الإيرادات · ٣٠ يوماً'],
  revenueTotal: ['Total revenue', 'إجمالي الإيرادات'],
  bookings30: ['Bookings · 30 days', 'الحجوزات · ٣٠ يوماً'],
  redemptions30: ['Redeemed · 30 days', 'المستخدمة · ٣٠ يوماً'],
  memberSavings: ['Saved by members', 'ما وفّره الأعضاء'],
  endingSoon: ['Ending in 30 days', 'تنتهي خلال ٣٠ يوماً'],
  pushDevices: ['Phones with notifications', 'هواتف مفعّل بها الإشعارات'],
  signups30: ['New members · last 30 days', 'الأعضاء الجدد · آخر ٣٠ يوماً'],
  topVenues: ['Top venues · 30 days', 'الأماكن الأكثر حجزاً · ٣٠ يوماً'],
  pushNotConfigured: ['Push notifications are not connected yet: add your Apple (APNs) key on the server. Notifications are recorded but not delivered.', 'الإشعارات غير مربوطة بعد: أضف مفتاح Apple (APNs) في الخادم. تُسجَّل الإشعارات لكنها لا تُرسل.'],
  // Members
  membersHint: ['Search, grant memberships, suspend accounts or give staff access.', 'ابحث، امنح العضويات، أوقف الحسابات أو امنح صلاحية الموظفين.'],
  searchMembers: ['Name, email, phone or member no.', 'الاسم أو البريد أو الهاتف أو رقم العضوية'],
  member: ['Member', 'العضو'],
  phone: ['Phone', 'الهاتف'],
  joined: ['Joined', 'انضم'],
  membership: ['Membership', 'العضوية'],
  status: ['Status', 'الحالة'],
  role: ['Role', 'الصلاحية'],
  roleMember: ['Member', 'عضو'],
  roleStaff: ['Venue staff', 'موظف مكان'],
  roleAdmin: ['Admin', 'مشرف'],
  noMembership: ['No membership', 'بدون عضوية'],
  until: ['until', 'حتى'],
  grantMembership: ['Grant membership', 'منح عضوية'],
  grantHint: ['A gift, a partner deal or a cash sale. Renewals add to the current end date.', 'هدية أو عرض شريك أو بيع نقدي. التجديد يُضاف إلى تاريخ الانتهاء الحالي.'],
  days: ['Days', 'الأيام'],
  amountPaid: ['Amount paid (OMR)', 'المبلغ المدفوع (ر.ع.)'],
  suspend: ['Suspend', 'إيقاف'],
  reactivate: ['Reactivate', 'إعادة التفعيل'],
  suspendConfirm: ['Suspend this account? They are signed out everywhere.', 'إيقاف هذا الحساب؟ سيتم تسجيل خروجه من كل الأجهزة.'],
  history: ['Membership history', 'سجل العضويات'],
  codes: ['Codes', 'الأكواد'],
  cancelMembership: ['Cancel membership', 'إلغاء العضوية'],
  notifyMember: ['Send a notification', 'إرسال إشعار'],
  // Memberships
  membershipsHint: ['Every membership sold, granted or renewed.', 'كل العضويات المباعة أو الممنوحة أو المجددة.'],
  source: ['Source', 'المصدر'],
  paid: ['Paid', 'المدفوع'],
  starts: ['Starts', 'تبدأ'],
  ends: ['Ends', 'تنتهي'],
  // Venues
  venuesHint: ['Add venues and events with photos, ticket options and member prices. Changes appear in the app instantly.', 'أضف الأماكن والفعاليات مع الصور وخيارات التذاكر وأسعار الأعضاء. تظهر التغييرات في التطبيق فوراً.'],
  newVenue: ['New venue or event', 'مكان أو فعالية جديدة'],
  published: ['Published', 'منشور'],
  draft: ['Draft', 'مسودة'],
  featured: ['Featured', 'مميز'],
  event: ['Event', 'فعالية'],
  category: ['Category', 'الفئة'],
  name: ['Name', 'الاسم'],
  area: ['Area', 'المنطقة'],
  summary: ['One-line pitch', 'وصف مختصر'],
  about: ['Description', 'الوصف'],
  highlights: ['Highlights (one per line)', 'المميزات (سطر لكل ميزة)'],
  openingHours: ['Opening hours', 'أوقات العمل'],
  latitude: ['Latitude', 'خط العرض'],
  longitude: ['Longitude', 'خط الطول'],
  rating: ['Rating', 'التقييم'],
  reviewCount: ['Reviews', 'عدد التقييمات'],
  photo: ['Photo', 'الصورة'],
  uploadPhoto: ['Upload photo', 'رفع صورة'],
  removePhoto: ['Remove', 'إزالة'],
  uploading: ['Uploading…', 'جارٍ الرفع…'],
  linkName: ['Link name (English letters)', 'اسم الرابط (أحرف إنجليزية)'],
  eventStarts: ['Event starts', 'بداية الفعالية'],
  eventEnds: ['Event ends', 'نهاية الفعالية'],
  dealEnds: ['Member price countdown ends', 'نهاية العدّاد التنازلي للعرض'],
  sortOrder: ['Order', 'الترتيب'],
  tickets: ['Ticket options', 'خيارات التذاكر'],
  ticketsHint: ['Each option has an original price (shown struck through) and the member price.', 'لكل خيار سعر أصلي (يظهر مشطوباً) وسعر الأعضاء.'],
  addTicket: ['Add ticket option', 'إضافة خيار تذكرة'],
  ticketTitle: ['Title', 'العنوان'],
  originalPrice: ['Original (OMR)', 'السعر الأصلي (ر.ع.)'],
  memberPrice: ['Member (OMR)', 'سعر الأعضاء (ر.ع.)'],
  remaining: ['Left (empty = unlimited)', 'المتبقي (فارغ = غير محدود)'],
  perks: ['Perks (one per line)', 'المزايا (سطر لكل ميزة)'],
  onSale: ['On sale', 'متاح'],
  saveVenueFirst: ['Save the venue first, then add its ticket options.', 'احفظ المكان أولاً ثم أضف خيارات التذاكر.'],
  announceHint: ['Publishing announces it to members automatically a few minutes later.', 'عند النشر يُعلَن تلقائياً للأعضاء بعد دقائق.'],
  fromPrice: ['from', 'ابتداءً من'],
  // Plan
  planHint: ['Sarena sells one annual membership. Change its price, perks or run a limited-time discount.', 'تبيع سرينا عضوية سنوية واحدة. غيّر سعرها أو مزاياها أو فعّل خصماً لفترة محدودة.'],
  price: ['Price (OMR)', 'السعر (ر.ع.)'],
  duration: ['Length (days)', 'المدة (أيام)'],
  description: ['Description', 'الوصف'],
  discount: ['Discount', 'الخصم'],
  discountHint: ['e.g. National Day: 12 OMR instead of 15. Members are notified automatically when it starts.', 'مثال: العيد الوطني ١٢ ريالاً بدلاً من ١٥. يُبلَّغ الأعضاء تلقائياً عند بدايته.'],
  discountPrice: ['Discounted price (OMR)', 'السعر بعد الخصم (ر.ع.)'],
  discountLabel: ['Offer name', 'اسم العرض'],
  discountStarts: ['Starts (empty = now)', 'يبدأ (فارغ = الآن)'],
  discountEnds: ['Ends (empty = until removed)', 'ينتهي (فارغ = حتى الإزالة)'],
  discountRunning: ['Running now', 'يعمل الآن'],
  discountScheduled: ['Scheduled', 'مجدول'],
  removeDiscount: ['Remove discount', 'إزالة الخصم'],
  perYear: ['/ year', '/ سنوياً'],
  appPreview: ['In the app', 'في التطبيق'],
  // Themes
  themesHint: ['Change the logo inside the app and on the website for National Day, Ramadan, Eid and more. The app offers members the matching home-screen icon.', 'غيّر شعار التطبيق والموقع في العيد الوطني ورمضان والعيد وغيرها. ويعرض التطبيق على الأعضاء أيقونة الشاشة الرئيسية المناسبة.'],
  newTheme: ['New seasonal look', 'مظهر موسمي جديد'],
  themeName: ['Name (for you)', 'الاسم (للوحة فقط)'],
  logo: ['Logo inside the app', 'الشعار داخل التطبيق'],
  banner: ['Home banner (optional)', 'بانر الرئيسية (اختياري)'],
  greeting: ['Greeting', 'التهنئة'],
  accent: ['Accent colour', 'اللون المميز'],
  homeIcon: ['Home-screen icon', 'أيقونة الشاشة الرئيسية'],
  homeIconHint: ['Apple lets apps switch only to icons built into the app, after the member taps. Sarena includes these; new designs need an app update.', 'تسمح Apple بالتبديل فقط إلى أيقونات مضمّنة في التطبيق وبعد موافقة العضو. سرينا تتضمن هذه الأيقونات، والتصاميم الجديدة تحتاج تحديثاً للتطبيق.'],
  noIcon: ['Keep the icon', 'بدون تغيير'],
  iconNationalDay: ['National Day', 'العيد الوطني'],
  iconRamadan: ['Ramadan', 'رمضان'],
  iconEid: ['Eid', 'العيد'],
  from: ['From', 'من'],
  to: ['To', 'إلى'],
  enabled: ['Enabled', 'مفعّل'],
  liveNow: ['Live now', 'يعمل الآن'],
  upcoming: ['Upcoming', 'قادم'],
  ended: ['Ended', 'انتهى'],
  off: ['Off', 'متوقف'],
  // Notifications
  notificationsHint: ['Automatic notifications go out by themselves. You can also write one now or schedule it.', 'الإشعارات التلقائية تُرسَل من تلقاء نفسها، ويمكنك أيضاً كتابة إشعار الآن أو جدولته.'],
  compose: ['New notification', 'إشعار جديد'],
  title: ['Title', 'العنوان'],
  message: ['Message', 'النص'],
  audience: ['Send to', 'إرسال إلى'],
  audienceAll: ['Everyone', 'الجميع'],
  audienceMembers: ['Members', 'الأعضاء المشتركون'],
  audienceNonMembers: ['Not subscribed', 'غير المشتركين'],
  audienceUser: ['One member', 'عضو واحد'],
  reach: ['Reaches {n} phones', 'يصل إلى {n} هاتف'],
  sendAt: ['Send at (empty = now)', 'وقت الإرسال (فارغ = الآن)'],
  linkVenue: ['Opens (optional)', 'يفتح (اختياري)'],
  send: ['Send', 'إرسال'],
  schedule: ['Schedule', 'جدولة'],
  sentTo: ['{n} phones', '{n} هاتف'],
  automatic: ['Automatic notifications', 'الإشعارات التلقائية'],
  ruleNewEvents: ['New venues and events', 'الأماكن والفعاليات الجديدة'],
  ruleEventDay: ['"Starts today" on the event morning', '"تبدأ اليوم" صباح يوم الفعالية'],
  rulePromos: ['Membership discount starts', 'بدء خصم العضوية'],
  ruleExpiry: ['Membership ending (7 days before) and ended', 'قرب انتهاء العضوية (قبل ٧ أيام) وانتهاؤها'],
  newEventDelay: ['Wait before announcing (minutes)', 'الانتظار قبل الإعلان (دقائق)'],
  morningHour: ['Morning hour', 'ساعة الصباح'],
  reminders: ['Reminders for booked events (on the phone)', 'تذكيرات الفعاليات المحجوزة (على الهاتف)'],
  remindersHint: ['The phone reminds the member on the event morning, and always at least this many hours before it starts, plus a last nudge.', 'يذكّر الهاتف العضو صباح يوم الفعالية، وقبل البداية بعدد الساعات هذا على الأقل، ثم تذكير أخير.'],
  hoursBefore: ['At least (hours before)', 'على الأقل (ساعات قبل)'],
  finalMinutes: ['Last nudge (minutes before, 0 = off)', 'آخر تذكير (دقائق قبل، 0 = إيقاف)'],
  historyTitle: ['History', 'السجل'],
  kind_broadcast: ['Written', 'مكتوب'],
  kind_new_event: ['New event', 'فعالية جديدة'],
  kind_event_day: ['Event day', 'يوم الفعالية'],
  kind_plan_promo: ['Discount', 'خصم'],
  kind_membership_expiring: ['Ending soon', 'تنتهي قريباً'],
  kind_membership_expired: ['Ended', 'انتهت'],
  status_scheduled: ['Scheduled', 'مجدول'],
  status_sending: ['Sending', 'قيد الإرسال'],
  status_sent: ['Sent', 'أُرسل'],
  status_cancelled: ['Cancelled', 'ملغى'],
  status_failed: ['Failed', 'فشل'],
  // Redeem
  redeemHint: ["Type or scan the member's code at the entrance.", 'اكتب أو امسح كود العضو عند المدخل.'],
  scan: ['Scan QR', 'مسح QR'],
  stopScan: ['Stop camera', 'إيقاف الكاميرا'],
  redeemAction: ['Redeem', 'تأكيد الاستخدام'],
  redeemed: ['Redeemed — member price applied', 'تم الاستخدام — طُبّق سعر الأعضاء'],
  alreadyUsed: ['This code was already used.', 'هذا الكود مستخدم مسبقاً.'],
  codeExpired: ['This code has expired.', 'انتهت صلاحية هذا الكود.'],
  codeNotFound: ['No booking has this code.', 'لا يوجد حجز بهذا الكود.'],
  recentRedemptions: ['Recent codes', 'آخر الأكواد'],
  quantity: ['Qty', 'العدد'],
  // Demo mode
  demoBadge: ['Demo · no server', 'نسخة تجريبية · بدون خادم'],
  demoHint: ['Sample data, saved on this device only. Every change works — try adding an event, a discount or a seasonal look.', 'بيانات تجريبية محفوظة على هذا الجهاز فقط. كل التعديلات تعمل — جرّب إضافة فعالية أو خصم أو مظهر موسمي.'],
  demoLive: ['Simulated live activity', 'نشاط مباشر تجريبي'],
  tryDemo: ['Try without a server', 'تجربة بدون خادم'],
  enterDemo: ['Open the demo', 'دخول النسخة التجريبية'],
  resetDemo: ['Reset sample data', 'إعادة البيانات التجريبية'],
  resetDemoConfirm: ['Erase your changes and start again with fresh sample data?', 'حذف تعديلاتك والبدء من جديد ببيانات تجريبية جديدة؟'],
  exitDemo: ['Back to the real dashboard', 'العودة إلى اللوحة الحقيقية'],
  demoCodes: ['Codes to try', 'أكواد للتجربة'],
} satisfies Record<string, [string, string]>;

export type StringKey = keyof typeof STRINGS;

type I18n = {
  lang: Lang;
  dir: 'rtl' | 'ltr';
  setLang: (lang: Lang) => void;
  t: (key: StringKey, vars?: Record<string, string | number>) => string;
  /** Picks the right side of bilingual content. */
  L: (text: Localized | null | undefined) => string;
  date: (iso: string | null | undefined) => string;
  dateTime: (iso: string | null | undefined) => string;
  money: (baisa: number) => string;
  number: (value: number) => string;
};

const Context = createContext<I18n | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    try { return (localStorage.getItem('sarena.admin.lang') as Lang) || 'ar'; } catch { return 'ar'; }
  });
  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    try { localStorage.setItem('sarena.admin.lang', next); } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  }, [lang]);

  const value = useMemo<I18n>(() => {
    const locale = lang === 'ar' ? 'ar-OM' : 'en-GB';
    const dateFormat = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' });
    const dateTimeFormat = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
    const moneyFormat = new Intl.NumberFormat(locale, { style: 'currency', currency: 'OMR', minimumFractionDigits: 0, maximumFractionDigits: 3 });
    const numberFormat = new Intl.NumberFormat(locale);
    return {
      lang,
      dir: lang === 'ar' ? 'rtl' : 'ltr',
      setLang,
      t: (key, vars) => {
        let text = STRINGS[key][lang === 'ar' ? 1 : 0];
        if (vars) for (const [name, v] of Object.entries(vars)) text = text.replace(`{${name}}`, String(v));
        return text;
      },
      L: (text) => (text ? (lang === 'ar' ? text.ar || text.en : text.en || text.ar) : ''),
      date: (iso) => (iso ? dateFormat.format(new Date(iso)) : '—'),
      dateTime: (iso) => (iso ? dateTimeFormat.format(new Date(iso)) : '—'),
      money: (baisa) => moneyFormat.format(baisa / 1000),
      number: (value) => numberFormat.format(value),
    };
  }, [lang, setLang]);

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useI18n() {
  const value = useContext(Context);
  if (!value) throw new Error('useI18n outside I18nProvider');
  return value;
}
