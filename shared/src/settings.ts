/**
 * The settings registry. Every business number lives here with its default,
 * bounds and description. Values are stored in the `settings` table and every
 * change writes `settings_history`. Nothing in the code may hard-code these.
 */
import { formatOMR, formatPercent } from './money';

export type SettingType =
  | 'baisa'
  | 'bps'
  | 'int'
  | 'minutes'
  | 'hours'
  | 'days'
  | 'seconds'
  | 'tenths'
  | 'bool'
  | 'text'
  | 'time'
  | 'json'
  | 'enum';

export type SettingGroup = 'money' | 'timing' | 'technicians' | 'security' | 'content' | 'branding' | 'flags';

export interface SettingDef {
  key: string;
  type: SettingType;
  default: unknown;
  group: SettingGroup;
  ar: string;
  en: string;
  min?: number;
  max?: number;
  options?: readonly string[];
  /** can be used as {{key}} in legal texts and templates */
  legal?: boolean;
  /** only the owner role may change it */
  ownerOnly?: boolean;
}

const d = (def: SettingDef) => def;

export const SETTINGS = [
  // ---------------------------------------------------------------- money
  d({ key: 'visit_fee', type: 'baisa', default: 5000, min: 0, max: 100_000, group: 'money', legal: true, ar: 'رسم الزيارة', en: 'Visit fee' }),
  d({ key: 'commission_pct', type: 'bps', default: 1500, min: 0, max: 5000, group: 'money', legal: true, ar: 'عمولة طلبات السوق', en: 'Marketplace commission' }),
  d({ key: 'own_customer_commission_pct', type: 'bps', default: 500, min: 0, max: 5000, group: 'money', legal: true, ar: 'عمولة زبائن الفني (رابطه الخاص)', en: "Commission on the technician's own customers" }),
  d({ key: 'repeat_customer_commission_pct', type: 'bps', default: 500, min: 0, max: 5000, group: 'money', legal: true, ar: 'عمولة الزبون المتكرر', en: 'Repeat-customer commission' }),
  d({ key: 'visit_only_platform_share_pct', type: 'bps', default: 1000, min: 0, max: 5000, group: 'money', legal: true, ar: 'حصة المنصة من رسم الزيارة عند رفض العرض', en: 'Platform share of the visit fee when the quote is rejected' }),
  d({ key: 'payment_gateway_fee_pct', type: 'bps', default: 200, min: 0, max: 1000, group: 'money', ar: 'رسوم بوابة الدفع (تكلفة المنصة)', en: 'Payment gateway fee (platform cost)' }),
  d({ key: 'failed_repair_commission_pct', type: 'bps', default: 0, min: 0, max: 5000, group: 'money', legal: true, ar: 'العمولة عند فشل الإصلاح', en: 'Commission when the repair fails' }),
  d({ key: 'late_cancel_fee_pct', type: 'bps', default: 3000, min: 0, max: 10000, group: 'money', legal: true, ar: 'رسم الإلغاء المتأخر (من رسم الزيارة)', en: 'Late cancellation fee (of visit fee)' }),
  d({ key: 'on_the_way_cancel_fee_pct', type: 'bps', default: 10000, min: 0, max: 10000, group: 'money', legal: true, ar: 'رسم الإلغاء بعد انطلاق الفني', en: 'Cancellation fee once the technician is on the way' }),
  d({ key: 'vat_pct', type: 'bps', default: 0, min: 0, max: 2500, group: 'money', legal: true, ownerOnly: true, ar: 'ضريبة القيمة المضافة', en: 'VAT' }),
  d({ key: 'probation_max_quote', type: 'baisa', default: 100_000, min: 0, max: 10_000_000, group: 'money', ar: 'أعلى عرض سعر لفني تحت التجربة دون موافقة', en: 'Largest quote a probation technician can send without approval' }),

  // ---------------------------------------------------------------- timing
  d({ key: 'payment_expiry_minutes', type: 'minutes', default: 15, min: 5, max: 120, group: 'timing', ar: 'مهلة دفع رسم الزيارة', en: 'Time to pay the visit fee' }),
  d({ key: 'free_cancel_minutes', type: 'minutes', default: 10, min: 0, max: 120, group: 'timing', legal: true, ar: 'مدة الإلغاء المجاني', en: 'Free cancellation window' }),
  d({ key: 'technician_accept_timeout_minutes', type: 'minutes', default: 15, min: 1, max: 240, group: 'timing', ar: 'مهلة قبول الفني للطلب', en: 'Technician accept timeout' }),
  d({ key: 'dispatch_batch_size', type: 'int', default: 3, min: 1, max: 10, group: 'timing', ar: 'عدد الفنيين في كل دفعة', en: 'Technicians per dispatch batch' }),
  d({ key: 'arrival_geofence_meters', type: 'int', default: 300, min: 50, max: 5000, group: 'timing', ar: 'مسافة قبول «وصلت» (متر)', en: 'Arrival geofence (metres)' }),
  d({ key: 'arrival_grace_minutes', type: 'minutes', default: 20, min: 0, max: 240, group: 'timing', legal: true, ar: 'مهلة التأخر المسموحة للفني', en: 'Arrival grace' }),
  d({ key: 'customer_wait_minutes', type: 'minutes', default: 15, min: 5, max: 120, group: 'timing', legal: true, ar: 'مدة انتظار الفني للزبون', en: 'Technician waits for the customer' }),
  d({ key: 'quote_expiry_minutes', type: 'minutes', default: 60, min: 10, max: 1440, group: 'timing', ar: 'صلاحية عرض السعر', en: 'Quote validity' }),
  d({ key: 'repair_payment_timeout_minutes', type: 'minutes', default: 30, min: 5, max: 1440, group: 'timing', ar: 'مهلة دفع مبلغ الإصلاح بعد الموافقة', en: 'Time to pay after approving the quote' }),
  d({ key: 'auto_confirm_hours', type: 'hours', default: 24, min: 1, max: 168, group: 'timing', legal: true, ar: 'التأكيد التلقائي بعد', en: 'Auto-confirm after' }),
  d({ key: 'payout_delay_hours', type: 'hours', default: 48, min: 0, max: 720, group: 'timing', legal: true, ar: 'مدة الصرف بعد التأكيد', en: 'Payout delay after confirmation' }),
  d({ key: 'new_technician_payout_delay_hours', type: 'hours', default: 72, min: 0, max: 720, group: 'timing', legal: true, ar: 'مدة الصرف للطلبات الأولى', en: 'Payout delay for first jobs' }),
  d({ key: 'new_technician_payout_jobs', type: 'int', default: 3, min: 0, max: 50, group: 'timing', ar: 'عدد الطلبات الأولى بمدة صرف أطول', en: 'Jobs with the longer payout delay' }),
  d({ key: 'warranty_days', type: 'days', default: 14, min: 0, max: 365, group: 'timing', legal: true, ar: 'مدة الضمان', en: 'Warranty' }),
  d({ key: 'max_free_revisits', type: 'int', default: 1, min: 0, max: 5, group: 'timing', ar: 'عدد الزيارات المجانية في الضمان', en: 'Free warranty revisits' }),
  d({ key: 'dispute_sla_hours', type: 'hours', default: 48, min: 1, max: 720, group: 'timing', legal: true, ar: 'مدة الفصل في النزاع', en: 'Dispute decision target' }),
  d({ key: 'appeal_days', type: 'days', default: 5, min: 1, max: 60, group: 'timing', legal: true, ar: 'مهلة الاعتراض', en: 'Appeal window' }),
  d({ key: 'notice_days_before_terms_change', type: 'days', default: 7, min: 0, max: 90, group: 'timing', legal: true, ar: 'الإشعار قبل تعديل الشروط', en: 'Notice before terms change' }),
  d({ key: 'review_window_days', type: 'days', default: 7, min: 1, max: 60, group: 'timing', ar: 'مدة إتاحة التقييم', en: 'Review window' }),
  d({ key: 'technician_cancel_strike_hours', type: 'hours', default: 2, min: 0, max: 72, group: 'timing', ar: 'إلغاء الفني قبل الموعد بأقل من (مخالفة)', en: 'Technician cancel strike threshold' }),
  d({ key: 'booking_days_ahead', type: 'days', default: 7, min: 1, max: 60, group: 'timing', ar: 'أيام الحجز المتاحة مسبقاً', en: 'Days bookable ahead' }),
  d({ key: 'slot_length_minutes', type: 'minutes', default: 120, min: 30, max: 480, group: 'timing', ar: 'طول فترة الوصول', en: 'Arrival window length' }),
  d({ key: 'work_day_start', type: 'time', default: '08:00', group: 'timing', ar: 'بداية ساعات العمل', en: 'Working hours start' }),
  d({ key: 'work_day_end', type: 'time', default: '20:00', group: 'timing', ar: 'نهاية ساعات العمل', en: 'Working hours end' }),
  d({ key: 'weekend_slots_enabled', type: 'bool', default: false, group: 'timing', ar: 'فتح مواعيد الجمعة والسبت', en: 'Open Friday and Saturday slots' }),
  d({ key: 'quiet_hours_start', type: 'time', default: '22:00', group: 'timing', ar: 'بداية ساعات الهدوء', en: 'Quiet hours start' }),
  d({ key: 'quiet_hours_end', type: 'time', default: '07:00', group: 'timing', ar: 'نهاية ساعات الهدوء', en: 'Quiet hours end' }),

  // ---------------------------------------------------------------- technicians
  d({ key: 'probation_jobs', type: 'int', default: 5, min: 0, max: 50, group: 'technicians', ar: 'عدد طلبات فترة التجربة', en: 'Probation jobs' }),
  d({ key: 'strikes_for_suspension_review', type: 'int', default: 3, min: 1, max: 20, group: 'technicians', ar: 'عدد المخالفات للمراجعة', en: 'Strikes for suspension review' }),
  d({ key: 'strikes_window_days', type: 'days', default: 60, min: 1, max: 365, group: 'technicians', ar: 'مدة احتساب المخالفات', en: 'Strike window' }),
  d({ key: 'rating_review_threshold', type: 'tenths', default: 40, min: 10, max: 50, group: 'technicians', legal: true, ar: 'حد التقييم للمراجعة', en: 'Rating review threshold' }),
  d({ key: 'rating_review_min_jobs', type: 'int', default: 10, min: 1, max: 100, group: 'technicians', ar: 'عدد الطلبات قبل مراجعة التقييم', en: 'Jobs before rating review' }),
  d({ key: 'doc_min_days_before_expiry_at_signup', type: 'days', default: 30, min: 0, max: 365, group: 'technicians', ar: 'أقل صلاحية للمستندات عند التسجيل', en: 'Minimum document validity at sign-up' }),
  d({ key: 'doc_expiry_reminder_days', type: 'json', default: [30, 7], group: 'technicians', ar: 'تذكير انتهاء المستندات (أيام)', en: 'Document expiry reminders (days)' }),
  d({ key: 'reapply_after_days', type: 'days', default: 30, min: 0, max: 365, group: 'technicians', ar: 'إعادة التقديم بعد الرفض', en: 'Re-apply after rejection' }),
  d({ key: 'bank_change_lock_hours', type: 'hours', default: 48, min: 0, max: 720, group: 'technicians', ar: 'إيقاف الصرف بعد تغيير الحساب البنكي', en: 'Payout lock after bank change' }),
  d({ key: 'chat_flags_for_review', type: 'int', default: 3, min: 1, max: 50, group: 'technicians', ar: 'عدد البلاغات في المحادثة للمراجعة', en: 'Chat flags for review' }),
  d({ key: 'chat_flags_window_days', type: 'days', default: 30, min: 1, max: 365, group: 'technicians', ar: 'مدة احتساب بلاغات المحادثة', en: 'Chat flag window' }),
  d({ key: 'quiz_pass_pct', type: 'int', default: 80, min: 50, max: 100, group: 'technicians', ar: 'نسبة النجاح في الاختبار', en: 'Quiz pass mark' }),
  d({ key: 'work_photos_min', type: 'int', default: 3, min: 0, max: 10, group: 'technicians', ar: 'أقل عدد لصور الأعمال', en: 'Minimum work photos' }),
  d({ key: 'work_photos_max', type: 'int', default: 10, min: 1, max: 30, group: 'technicians', ar: 'أكثر عدد لصور الأعمال', en: 'Maximum work photos' }),
  d({ key: 'bio_max_chars', type: 'int', default: 300, min: 50, max: 2000, group: 'technicians', ar: 'طول النبذة', en: 'Bio length' }),
  d({ key: 'registration_allowlist', type: 'json', default: [], group: 'technicians', ownerOnly: true, ar: 'أرقام مسموح لها بالتسجيل قبل الفتح العام', en: 'Phones allowed to register before public launch' }),
  d({ key: 'banks', type: 'json', default: ['بنك مسقط', 'صحار الدولي', 'البنك الوطني العُماني', 'بنك ظفار', 'HSBC عُمان', 'البنك الأهلي', 'بنك عُمان العربي', 'بنك نزوى', 'ميثاق', 'العز الإسلامي', 'أخرى'], group: 'technicians', ar: 'قائمة البنوك', en: 'Banks' }),
  d({
    key: 'work_status_documents',
    type: 'json',
    default: {
      omani_self_employed: [],
      expat_labour_card: ['labour_card', 'residence_card'],
      company: ['commercial_registration'],
      _note: 'pending lawyer confirmation (D41)',
    },
    group: 'technicians',
    ownerOnly: true,
    ar: 'المستندات المطلوبة لكل وضع عمل (بانتظار المحامي)',
    en: 'Documents required per work status (pending lawyer)',
  }),

  // ---------------------------------------------------------------- security
  d({ key: 'otp_length', type: 'int', default: 6, min: 6, max: 8, group: 'security', ar: 'طول رمز التحقق', en: 'OTP length' }),
  d({ key: 'otp_ttl_minutes', type: 'minutes', default: 5, min: 1, max: 5, group: 'security', ar: 'صلاحية رمز التحقق', en: 'OTP lifetime' }),
  d({ key: 'otp_max_attempts', type: 'int', default: 5, min: 1, max: 5, group: 'security', ar: 'محاولات الرمز الخاطئ', en: 'Wrong OTP attempts' }),
  d({ key: 'otp_resend_seconds', type: 'seconds', default: 60, min: 60, max: 600, group: 'security', ar: 'إعادة الإرسال بعد', en: 'Resend after' }),
  d({ key: 'otp_lock_minutes', type: 'minutes', default: 15, min: 15, max: 1440, group: 'security', ar: 'مدة القفل الأولى', en: 'First lock duration' }),
  d({ key: 'lock_max_hours', type: 'hours', default: 24, min: 24, max: 168, group: 'security', ar: 'أقصى مدة قفل', en: 'Maximum lock' }),
  d({ key: 'admin_lock_attempts', type: 'int', default: 5, min: 3, max: 5, group: 'security', ownerOnly: true, ar: 'محاولات دخول الإدارة', en: 'Admin sign-in attempts' }),
  d({ key: 'admin_ip_lock_attempts', type: 'int', default: 20, min: 5, max: 20, group: 'security', ownerOnly: true, ar: 'محاولات من نفس العنوان', en: 'Attempts per IP' }),
  d({ key: 'sms_allowlist', type: 'json', default: [], group: 'security', ownerOnly: true, ar: 'أرقام الاختبار المسموح لها بالرسائل', en: 'Test numbers allowed to receive SMS' }),
  d({ key: 'retention_months_documents_after_closure', type: 'int', default: 24, min: 0, max: 240, group: 'security', legal: true, ownerOnly: true, ar: 'مدة الاحتفاظ بالمستندات بعد الإغلاق (أشهر) — بانتظار المحامي', en: 'Document retention after closure (months) — pending lawyer' }),

  // ---------------------------------------------------------------- content
  d({ key: 'review_sla_text', type: 'text', default: 'يوم إلى يومي عمل', group: 'content', legal: true, ar: 'مدة مراجعة الطلبات (نص)', en: 'Application review time (text)' }),
  d({ key: 'max_booking_media', type: 'int', default: 5, min: 0, max: 10, group: 'content', ar: 'عدد صور الحجز', en: 'Booking photos' }),
  d({ key: 'problem_text_max_chars', type: 'int', default: 500, min: 100, max: 2000, group: 'content', ar: 'طول وصف المشكلة', en: 'Problem description length' }),
  d({ key: 'booking_code_prefix', type: 'text', default: 'KT', group: 'content', ar: 'بادئة رمز الحجز', en: 'Booking code prefix' }),

  // ---------------------------------------------------------------- branding
  d({ key: 'app_name', type: 'text', default: 'كتف', group: 'branding', legal: true, ar: 'اسم التطبيق', en: 'App name (Arabic)' }),
  d({ key: 'app_name_en', type: 'text', default: 'Katf', group: 'branding', ar: 'اسم التطبيق بالإنجليزية', en: 'App name (English)' }),
  d({ key: 'company_name', type: 'text', default: '', group: 'branding', legal: true, ownerOnly: true, ar: 'اسم الشركة', en: 'Company name' }),
  d({ key: 'cr_number', type: 'text', default: '', group: 'branding', legal: true, ownerOnly: true, ar: 'رقم السجل التجاري', en: 'Commercial registration number' }),
  d({ key: 'company_address', type: 'text', default: '', group: 'branding', legal: true, ownerOnly: true, ar: 'عنوان الشركة', en: 'Company address' }),
  d({ key: 'contact_email', type: 'text', default: '', group: 'branding', legal: true, ar: 'بريد التواصل', en: 'Contact email' }),
  d({ key: 'contact_phone', type: 'text', default: '', group: 'branding', legal: true, ar: 'هاتف التواصل', en: 'Contact phone' }),
  d({ key: 'whatsapp_number', type: 'text', default: '', group: 'branding', ar: 'رقم واتساب (يُعرض كنص)', en: 'WhatsApp number (shown as text)' }),
  d({ key: 'jurisdiction', type: 'text', default: '', group: 'branding', legal: true, ownerOnly: true, ar: 'المحكمة المختصة', en: 'Jurisdiction' }),
  d({ key: 'social_links', type: 'json', default: {}, group: 'branding', ar: 'روابط التواصل الاجتماعي', en: 'Social links' }),

  // ---------------------------------------------------------------- flags
  d({ key: 'escrow_mode', type: 'enum', default: 'manual_payout', options: ['manual_payout', 'provider_split'], group: 'flags', ownerOnly: true, ar: 'طريقة حجز الأموال', en: 'Escrow mode' }),
  d({ key: 'marketplace_dispatch', type: 'bool', default: false, group: 'flags', ownerOnly: true, ar: 'توزيع الطلبات على الفنيين (السوق)', en: 'Marketplace dispatch' }),
  d({ key: 'live_location', type: 'bool', default: false, group: 'flags', ownerOnly: true, ar: 'الموقع المباشر', en: 'Live location' }),
  d({ key: 'whatsapp_api', type: 'bool', default: false, group: 'flags', ownerOnly: true, ar: 'واتساب للأعمال', en: 'WhatsApp Business API' }),
  d({ key: 'vat_invoices', type: 'bool', default: false, group: 'flags', ownerOnly: true, ar: 'فواتير الضريبة', en: 'VAT invoices' }),
  d({ key: 'legal_gate_cleared', type: 'bool', default: false, group: 'flags', ownerOnly: true, ar: 'البوابة القانونية مفتوحة (دفع حقيقي وتسجيل عام)', en: 'Legal gate cleared (live payments, public registration)' }),
  d({ key: 'maintenance_mode', type: 'bool', default: false, group: 'flags', ownerOnly: true, ar: 'وضع الصيانة', en: 'Maintenance mode' }),
] as const satisfies readonly SettingDef[];

export type SettingKey = (typeof SETTINGS)[number]['key'];
export const SETTINGS_BY_KEY: Record<string, SettingDef> = Object.fromEntries(SETTINGS.map((s) => [s.key, s]));

export type SettingValues = Record<SettingKey, unknown>;

export function defaultSettings(): Record<string, unknown> {
  return Object.fromEntries(SETTINGS.map((s) => [s.key, structuredClone(s.default)]));
}

/** Validate a proposed value; returns an error message key or null. */
export function validateSetting(key: string, value: unknown): string | null {
  const def = SETTINGS_BY_KEY[key];
  if (!def) return 'unknown_setting';
  switch (def.type) {
    case 'bool':
      return typeof value === 'boolean' ? null : 'must_be_boolean';
    case 'text':
      return typeof value === 'string' && value.length <= 2000 ? null : 'must_be_text';
    case 'time':
      return typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value) ? null : 'must_be_time';
    case 'enum':
      return typeof value === 'string' && (def.options ?? []).includes(value) ? null : 'invalid_option';
    case 'json':
      try {
        JSON.stringify(value);
        return null;
      } catch {
        return 'invalid_json';
      }
    default: {
      if (typeof value !== 'number' || !Number.isSafeInteger(value)) return 'must_be_integer';
      if (def.min != null && value < def.min) return 'below_minimum';
      if (def.max != null && value > def.max) return 'above_maximum';
      return null;
    }
  }
}

/** Render a setting value the way people read it in legal texts and UI. */
export function renderSettingValue(key: string, value: unknown): string {
  const def = SETTINGS_BY_KEY[key];
  if (!def) return String(value ?? '');
  switch (def.type) {
    case 'baisa':
      return formatOMR(value as number);
    case 'bps':
      return formatPercent(value as number);
    case 'tenths':
      return `${Math.floor((value as number) / 10)}.${(value as number) % 10}`;
    case 'bool':
      return value ? 'نعم' : 'لا';
    case 'json':
      return JSON.stringify(value);
    default:
      return String(value ?? '');
  }
}

/** Variables used in the legal drafts in UPPER_CASE map to branding settings. */
export const LEGAL_UPPERCASE_VARS: Record<string, string> = {
  APP_NAME: 'app_name',
  COMPANY_NAME: 'company_name',
  CR_NUMBER: 'cr_number',
  COMPANY_ADDRESS: 'company_address',
  CONTACT_EMAIL: 'contact_email',
  CONTACT_PHONE: 'contact_phone',
  JURISDICTION: 'jurisdiction',
};

/** Fill {{variables}} from settings. Unknown or empty variables stay visible as [NAME]. */
export function renderTemplate(body: string, values: Record<string, unknown>, extra: Record<string, string> = {}): string {
  return body.replace(/\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g, (_m, name: string) => {
    if (name in extra) return extra[name] ?? '';
    const key = LEGAL_UPPERCASE_VARS[name] ?? name;
    if (key === 'probation_max_quote_omr') return renderSettingValue('probation_max_quote', values['probation_max_quote']);
    if (key === 'review_sla') return renderSettingValue('review_sla_text', values['review_sla_text']);
    if (!(key in values)) return `[${name}]`;
    const v = renderSettingValue(key, values[key]);
    return v === '' ? `[${name}]` : v;
  });
}

/** Which setting keys a template uses (for the "documents out of date" warning). */
export function templateVariables(body: string): string[] {
  const out = new Set<string>();
  for (const m of body.matchAll(/\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g)) {
    const name = m[1]!;
    out.add(LEGAL_UPPERCASE_VARS[name] ?? name);
  }
  return [...out];
}
