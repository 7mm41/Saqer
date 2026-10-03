/** Fixed option lists used by forms. Labels in Arabic (source of truth) and English. */

export interface Opt {
  id: string;
  ar: string;
  en: string;
}

const o = (id: string, ar: string, en: string): Opt => ({ id, ar, en });

export const BOOKING_PROBLEMS: Opt[] = [
  o('not_cooling', 'لا يبرّد', 'Not cooling'),
  o('water_leak', 'يسرّب ماء', 'Leaking water'),
  o('noise', 'صوت مزعج', 'Noisy'),
  o('not_working', 'لا يعمل', 'Not working'),
  o('cleaning', 'تنظيف دوري', 'Routine cleaning'),
  o('install', 'تركيب / فك', 'Install / remove'),
  o('other', 'أخرى', 'Other'),
];

export const AC_TYPES: Opt[] = [
  o('split', 'سبليت', 'Split'),
  o('window', 'شباك', 'Window'),
  o('cassette', 'كاسيت', 'Cassette'),
  o('central', 'مركزي / مخفي', 'Central / ducted'),
  o('portable', 'متنقّل', 'Portable'),
  o('unknown', 'لا أعرف', "I don't know"),
];

export const TECH_SERVICES: Opt[] = [
  o('cleaning', 'تنظيف وغسيل', 'Cleaning and washing'),
  o('gas', 'تعبئة غاز', 'Gas refill'),
  o('leak', 'إصلاح تسريب', 'Leak repair'),
  o('compressor', 'كمبروسر', 'Compressor'),
  o('board', 'لوحة إلكترونية', 'Control board'),
  o('install', 'تركيب وفك', 'Install and remove'),
  o('diagnosis', 'فحص وتشخيص', 'Inspection and diagnosis'),
  o('central', 'مكيّفات مركزية ومخفية', 'Central and ducted units'),
];

export const BRANDS: Opt[] = [
  'Gree', 'LG', 'Samsung', 'Daikin', 'Carrier', 'Midea', 'Panasonic', 'Mitsubishi', 'General', 'Hitachi', 'Toshiba', 'Haier', 'TCL', 'Super General', 'O General', 'Fujitsu',
].map((b) => o(b.toLowerCase().replace(/\s+/g, '_'), b, b));

export const EXPERIENCE_BANDS: Opt[] = [
  o('lt1', 'أقل من سنة', 'Under 1 year'),
  o('1-3', '1-3 سنوات', '1–3 years'),
  o('3-5', '3-5 سنوات', '3–5 years'),
  o('5-10', '5-10 سنوات', '5–10 years'),
  o('gt10', 'أكثر من 10 سنوات', 'Over 10 years'),
];

export const TOOLS: Opt[] = [
  o('gauge', 'جهاز قياس ضغط الغاز', 'Gas pressure gauge'),
  o('vacuum', 'مضخة تفريغ', 'Vacuum pump'),
  o('leak_detector', 'جهاز كشف تسريب', 'Leak detector'),
  o('ladder', 'سلّم', 'Ladder'),
];

export const WORK_STATUSES: Opt[] = [
  o('omani_self_employed', 'عُماني يعمل لحسابه', 'Omani, self-employed'),
  o('expat_labour_card', 'وافد بإقامة وبطاقة عمل سارية', 'Expat with a valid residence and labour card'),
  o('company', 'مؤسسة / شركة بسجل تجاري', 'Establishment / company with a commercial registration'),
];

export const DOCUMENT_TYPES: Opt[] = [
  o('civil_id_front', 'البطاقة المدنية (الوجه)', 'Civil ID (front)'),
  o('civil_id_back', 'البطاقة المدنية (الظهر)', 'Civil ID (back)'),
  o('residence_card', 'بطاقة الإقامة', 'Residence card'),
  o('labour_card', 'بطاقة العمل أو التصريح', 'Labour card or permit'),
  o('commercial_registration', 'السجل التجاري', 'Commercial registration'),
  o('selfie_with_id', 'صورة سيلفي مع البطاقة', 'Selfie holding the ID'),
  o('certification', 'شهادة', 'Certificate'),
  o('work_sample', 'صورة من الأعمال', 'Work photo'),
  o('bank_letter', 'خطاب أو كشف بنكي', 'Bank letter or statement'),
];

export const FAULT_TYPES: Opt[] = [
  o('not_cooling', 'لا يبرّد', 'Not cooling'),
  o('water_leak', 'تسريب ماء', 'Water leak'),
  o('noise', 'ضوضاء', 'Noise'),
  o('not_working', 'لا يعمل', 'Not working'),
  o('smell', 'رائحة', 'Smell'),
  o('cleaning', 'تنظيف دوري', 'Routine cleaning'),
  o('install', 'تركيب', 'Installation'),
  o('other', 'أخرى', 'Other'),
];

export const DISPUTE_REASONS: Opt[] = [
  o('not_fixed', 'لم يُصلَح العطل', 'The fault was not fixed'),
  o('returned', 'عاد العطل', 'The fault came back'),
  o('damage', 'ضرر في ممتلكاتي', 'Damage to my property'),
  o('conduct', 'سلوك غير لائق', 'Inappropriate behaviour'),
  o('price', 'السعر لا يطابق ما اتُّفق عليه', 'Price does not match what was agreed'),
  o('other', 'أخرى', 'Other'),
];

export const TECH_CANCEL_REASONS: Opt[] = [
  o('emergency', 'ظرف طارئ', 'Emergency'),
  o('vehicle', 'عطل في السيارة', 'Vehicle problem'),
  o('unsafe', 'الموقع غير آمن', 'Location is unsafe'),
  o('no_parts', 'لا تتوفر القطع اللازمة', 'Parts not available'),
  o('outside_skills', 'خارج تخصصي', 'Outside my skills'),
  o('other', 'أخرى', 'Other'),
];

export const DECLINE_REASONS: Opt[] = [
  o('busy', 'مشغول', 'Busy'),
  o('far', 'بعيد', 'Too far'),
  o('skills', 'خارج تخصصي', 'Outside my skills'),
  o('other', 'أخرى', 'Other'),
];

export const RATING_TAGS: Opt[] = [
  o('on_time', 'في الموعد', 'On time'),
  o('professional', 'محترف', 'Professional'),
  o('clean', 'نظيف', 'Clean'),
  o('fair_price', 'سعر عادل', 'Fair price'),
  o('clear', 'شرح واضح', 'Clear explanation'),
];

export const STRIKE_REASONS: Opt[] = [
  o('no_show', 'عدم الحضور', 'No-show'),
  o('late_cancel', 'إلغاء متأخر', 'Late cancellation'),
  o('late_arrival', 'تأخر عن الموعد', 'Late arrival'),
  o('off_platform', 'محاولة الدفع خارج المنصة', 'Off-platform payment'),
  o('conduct', 'سلوك', 'Conduct'),
  o('other', 'أخرى', 'Other'),
];

export const REJECT_REASONS: Opt[] = [
  o('documents_unclear', 'المستندات غير واضحة', 'Documents are unclear'),
  o('documents_expired', 'المستندات منتهية', 'Documents expired'),
  o('identity_mismatch', 'عدم تطابق الهوية', 'Identity does not match'),
  o('not_eligible', 'غير مخوّل بالعمل', 'Not eligible to work'),
  o('duplicate', 'حساب مكرر', 'Duplicate account'),
  o('other', 'أخرى', 'Other'),
];

export const WEEKDAYS: Opt[] = [
  o('sun', 'الأحد', 'Sunday'),
  o('mon', 'الاثنين', 'Monday'),
  o('tue', 'الثلاثاء', 'Tuesday'),
  o('wed', 'الأربعاء', 'Wednesday'),
  o('thu', 'الخميس', 'Thursday'),
  o('fri', 'الجمعة', 'Friday'),
  o('sat', 'السبت', 'Saturday'),
];

export function label(list: Opt[], id: string, locale: 'ar' | 'en'): string {
  return list.find((x) => x.id === id)?.[locale] ?? id;
}

/** Launch areas (§1). Neighbourhood centres are approximate and editable in admin. */
export const SEED_AREAS = [
  {
    governorate: 'مسقط',
    wilayat: 'seeb',
    nameAr: 'السيب',
    nameEn: 'Seeb',
    active: true,
    neighbourhoods: [
      { id: 'mabela', ar: 'المعبيلة', en: 'Al Mabelah', lat: 23.6195, lng: 58.1129 },
      { id: 'khoud', ar: 'الخوض', en: 'Al Khoudh', lat: 23.5869, lng: 58.1543 },
      { id: 'mawaleh', ar: 'الموالح', en: 'Al Mawaleh', lat: 23.6011, lng: 58.2093 },
      { id: 'hail', ar: 'الحيل', en: 'Al Hail', lat: 23.6278, lng: 58.2299 },
      { id: 'seeb_center', ar: 'السيب', en: 'Seeb', lat: 23.6703, lng: 58.1889 },
      { id: 'sur_hadid', ar: 'سور آل حديد', en: 'Sur Al Hadid', lat: 23.6522, lng: 58.1606 },
      { id: 'mazoon', ar: 'مدينة المعرفة / الحيل الجنوبية', en: 'Al Hail South', lat: 23.6072, lng: 58.2412 },
    ],
  },
  {
    governorate: 'مسقط',
    wilayat: 'bawshar',
    nameAr: 'بوشر',
    nameEn: 'Bawshar',
    active: true,
    neighbourhoods: [
      { id: 'ghubra', ar: 'الغبرة', en: 'Al Ghubrah', lat: 23.5958, lng: 58.4016 },
      { id: 'azaiba', ar: 'العذيبة', en: 'Al Azaiba', lat: 23.5937, lng: 58.3733 },
      { id: 'khuwair', ar: 'الخوير', en: 'Al Khuwair', lat: 23.5862, lng: 58.4294 },
      { id: 'ansab', ar: 'الأنصب', en: 'Al Ansab', lat: 23.5458, lng: 58.3687 },
      { id: 'bawshar_center', ar: 'بوشر', en: 'Bawshar', lat: 23.5662, lng: 58.4037 },
      { id: 'misfah', ar: 'المسفاة', en: 'Al Misfah', lat: 23.5276, lng: 58.4101 },
      { id: 'airport_heights', ar: 'مرتفعات المطار', en: 'Airport Heights', lat: 23.5794, lng: 58.3466 },
    ],
  },
  {
    governorate: 'مسقط',
    wilayat: 'muttrah',
    nameAr: 'مطرح',
    nameEn: 'Muttrah',
    active: false,
    neighbourhoods: [],
  },
  {
    governorate: 'مسقط',
    wilayat: 'amerat',
    nameAr: 'العامرات',
    nameEn: 'Al Amerat',
    active: false,
    neighbourhoods: [],
  },
  {
    governorate: 'مسقط',
    wilayat: 'muscat',
    nameAr: 'مسقط',
    nameEn: 'Muscat',
    active: false,
    neighbourhoods: [],
  },
  {
    governorate: 'مسقط',
    wilayat: 'qurayyat',
    nameAr: 'قريات',
    nameEn: 'Qurayyat',
    active: false,
    neighbourhoods: [],
  },
] as const;

/** Default radius around a neighbourhood centre for the coverage check (metres). */
export const NEIGHBOURHOOD_RADIUS_M = 4000;
