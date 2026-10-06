/** Admin panel copy. Arabic is the source of truth; English mirrors it key for key. */
export const ar = {
  app: { title: 'لوحة الإدارة', skip: 'انتقل إلى المحتوى', lang: 'English', theme: 'تبديل المظهر', menu: 'القائمة', signOut: 'تسجيل الخروج', demo: 'بيانات تجريبية — ليست حقيقية', gateClosed: 'البوابة القانونية مغلقة: لا دفع حقيقي ولا تسجيل عام ولا رسائل للعامة.', gateOpen: 'البوابة القانونية مفتوحة.', gateShort: 'البوابة مغلقة' },
  nav: {
    overview: 'نظرة عامة', applications: 'طلبات الانضمام', technicians: 'الفنيون', customers: 'الزبائن', bookings: 'الحجوزات', dispatch: 'التوزيع', disputes: 'النزاعات',
    payments: 'المدفوعات', payouts: 'الصرف للفنيين', reports: 'التقارير والدفتر', catalog: 'الخدمات', areas: 'المناطق', legal: 'الوثائق القانونية', messaging: 'الرسائل',
    reviews: 'التقييمات', support: 'الدعم', settings: 'الإعدادات', staff: 'الموظفون', security: 'الأمان والسجل',
    groups: { work: 'العمل اليومي', money: 'المال', setup: 'الإعداد', control: 'التحكم' },
  },
  roles: { owner: 'المالك', verifier: 'مراجع الطلبات', support: 'الدعم', finance: 'المالية' },
  common: {
    reason: 'السبب', search: 'بحث', all: 'الكل', status: 'الحالة', name: 'الاسم', date: 'التاريخ', amount: 'المبلغ', actions: 'إجراءات', open: 'فتح', details: 'التفاصيل',
    refresh: 'تحديث', page: 'صفحة {n}', prev: 'السابق', next: 'التالي', total: '{n} نتيجة', none: '—', yes: 'نعم', no: 'لا', save: 'حفظ', cancel: 'إلغاء', confirm: 'تأكيد',
    reveal: 'إظهار', revealTitle: 'إظهار بيان محمي', revealBody: 'سيُسجَّل إظهار هذا البيان باسمك مع السبب.', copy: 'نسخ', copied: 'تم النسخ', download: 'تنزيل', csv: 'تصدير CSV',
    done: 'تم', saved: 'تم الحفظ', noAccess: 'ليس لدورك صلاحية على هذه الصفحة.', loadFailed: 'تعذّر التحميل.', back: 'رجوع', note: 'ملاحظة', notes: 'ملاحظات داخلية', addNote: 'إضافة ملاحظة',
    hours: '{n} ساعة', overdue: 'متأخر {n} ساعة', dueIn: 'خلال {n} ساعة', moneyConfirm: 'إجراء مالي: ستُطلب منك مراجعة ثانية قبل التنفيذ.', phone: 'الهاتف', add: 'إضافة', remove: 'إزالة', reviewTwice: 'إجراء مهم: ستُطلب منك مراجعة ثانية قبل التنفيذ.', area: 'المنطقة', code: 'الرمز', technician: 'الفني', customer: 'الزبون',
  },
  signIn: {
    title: 'دخول الإدارة', email: 'البريد الإلكتروني', password: 'كلمة المرور', submit: 'دخول', totp: 'رمز تطبيق المصادقة', totpHint: 'الرمز المكوّن من 6 أرقام في تطبيق المصادقة',
    useRecovery: 'استخدم رمز استرداد', useTotp: 'استخدم تطبيق المصادقة', recovery: 'رمز الاسترداد', enrollTitle: 'فعّل التحقق بخطوتين', enrollBody: 'امسح الرمز بتطبيق مصادقة (مثل Google Authenticator أو 1Password) ثم أدخل الرمز الذي يظهر.',
    secret: 'أو أدخل هذا المفتاح يدوياً', codesTitle: 'رموز الاسترداد', codesBody: 'احفظ هذه الرموز في مكان آمن. كل رمز يُستخدم مرة واحدة إذا فقدت هاتفك. لن تظهر مرة أخرى.', codesSaved: 'حفظتُ الرموز — متابعة',
    sessionLost: 'انتهت الجلسة. سجّل الدخول مجدداً.',
  },
  overview: {
    title: 'نظرة عامة', today: 'اليوم', bookings: 'حجوزات اليوم', gmv: 'المدفوع اليوم', refunds: 'المسترد اليوم', commission: 'العمولة حتى الآن', applications: 'طلبات بانتظار المراجعة', oldest: 'أقدمها منذ {n} ساعة',
    payoutsDue: 'صرف مستحق', payoutsDueBody: '{n} فني', disputes: 'نزاعات مفتوحة', docsExpiring: 'مستندات تنتهي خلال 30 يوماً', failedPayments: 'دفعات فاشلة', needsAdmin: 'حجوزات تحتاج تدخلاً',
    outOfDate: 'وثائق تحتاج تحديثاً بعد تغيير الإعدادات', byStatus: 'حجوزات اليوم حسب الحالة',
    experiment: 'لوحة التجربة', experimentBody: 'هل النموذج يعمل؟ أرقام حقيقية من الحجوزات المدفوعة فقط.', paidServices: 'خدمات مدفوعة', target: 'الهدف {n}', repeat: 'فنيون لهم زبائن متكررون', margin: 'متوسط صافي المنصة لكل خدمة',
    payoutHours: 'متوسط الساعات من التأكيد إلى الصرف', disputeRate: 'نسبة النزاعات', flaggedChats: 'محادثات مُعلَّمة',
  },
  applications: {
    title: 'طلبات الانضمام', empty: 'لا طلبات بانتظار المراجعة', waiting: 'ينتظر منذ', workStatus: 'وضع العمل', submitted: 'قُدّم في',
    checklist: 'قائمة التحقق', check: {
      identity_matches: 'الاسم والرقم المدني يطابقان البطاقة', selfie_matches: 'الصورة الشخصية تطابق صورة البطاقة', documents_valid: 'المستندات سارية وواضحة', work_permission: 'وضع العمل موثّق بمستند',
      bank_name_matches: 'اسم صاحب الحساب البنكي يطابق الاسم', references_called: 'تم التواصل مع المعرّفين', work_photos_real: 'صور الأعمال حقيقية', no_duplicates: 'لا حسابات مكررة',
    },
    decide: 'القرار', approve: 'اعتماد (فترة تجربة)', needsInfo: 'طلب معلومات', reject: 'رفض', inReview: 'بدء المراجعة', approveBody: 'سيبدأ الفني فترة التجربة ويُنشأ رابطه الخاص.',
    needsInfoBody: 'اكتب للفني بوضوح ما الذي ينقص. ستصله الرسالة كما هي.', rejectBody: 'اكتب سبب الرفض. سيصل للفني كما هو.', checklistIncomplete: 'أكمل قائمة التحقق قبل الاعتماد.',
  },
  tech: {
    title: 'الفنيون', profile: 'الملف', documents: 'المستندات', jobs: 'المهام', strikes: 'المخالفات', reviews: 'التقييمات', payouts: 'المستحقات', edits: 'طلبات تعديل الملف', consents: 'الموافقات', history: 'السجل', quiz: 'الاختبار',
    identity: 'الهوية (مخفية)', acTypes: 'أنواع المكيّفات', schedule: 'أيام وساعات العمل', nameEn: 'الاسم بالإنجليزية', nationality: 'الجنسية', bank: 'الحساب البنكي', bankVerified: 'موثّق', bankUnverified: 'غير موثّق', holderMismatch: 'اسم صاحب الحساب لا يطابق', bankLocked: 'مقفل حتى {date}', duplicates: 'حسابات بنفس الهاتف',
    rating: 'التقييم', jobsDone: 'مهام منجزة', commission: 'العمولة الخاصة', commissionDefault: 'حسب الإعدادات', probation: 'متبقٍ من التجربة: {n}', slug: 'الرابط', services: 'الخدمات', areas: 'المناطق',
    view: 'عرض', viewDoc: 'فتح المستند', viewDocBody: 'فتح مستند هوية يُسجَّل باسمك.', approveDoc: 'قبول', rejectDoc: 'رفض', expires: 'ينتهي', workPhotos: 'صور الأعمال',
    act: {
      suspend: 'إيقاف', unsuspend: 'رفع الإيقاف', ban: 'حظر نهائي', pause: 'إيقاف مؤقت', unpause: 'استئناف', commission: 'تغيير العمولة', add_strike: 'إضافة مخالفة', remove_strike: 'إزالة المخالفة',
      reset_device: 'تسجيل الخروج من كل الأجهزة', message: 'إرسال رسالة', approve_edit: 'قبول التعديل', reject_edit: 'رفض التعديل', verify_bank: 'توثيق الحساب البنكي', note: 'ملاحظة داخلية', hold: 'إيقاف الصرف', release: 'استئناف الصرف',
    },
    banBody: 'الحظر نهائي ويمنع الهاتف والرقم المدني والآيبان من التسجيل مجدداً.', commissionValue: 'العمولة % (فارغ = حسب الإعدادات)', strikeReason: 'نوع المخالفة', messageText: 'نص الرسالة',
    appeal: 'اعتراض', appealAccept: 'قبول الاعتراض', appealReject: 'رفض الاعتراض', fields: { phone: 'الهاتف', email: 'البريد', full_name: 'الاسم الكامل', civil_id: 'الرقم المدني', dob: 'تاريخ الميلاد', cr_number: 'السجل التجاري', iban: 'الآيبان', holder: 'اسم صاحب الحساب', references: 'المعرّفون', emergency: 'جهة الطوارئ' },
    statuses: { draft: 'مسودة', submitted: 'مقدَّم', in_review: 'قيد المراجعة', needs_info: 'بانتظار معلومات', approved_probation: 'فترة تجربة', active: 'نشط', paused: 'موقوف مؤقتاً', suspended: 'موقوف', banned: 'محظور', rejected: 'مرفوض', deleted: 'محذوف' },
  },
  customers: { title: 'الزبائن', bookings: 'الحجوزات', refunds: 'استردادات', joined: 'انضم', block: 'حظر', unblock: 'رفع الحظر', anonymise: 'إخفاء الهوية (حذف)', anonymiseBody: 'يُخفي البيانات الشخصية نهائياً مع إبقاء السجلات المالية.', statuses: { active: 'نشط', blocked: 'محظور', deleted: 'محذوف' } },
  bookings: {
    title: 'الحجوزات', needsAdmin: 'تحتاج تدخلاً', units: 'الوحدات', entryMode: 'طريقة الحجز', addressNo: 'الطريق / المبنى / الشقة', landmark: 'معلم قريب', receipt: 'الإيصال', total: 'الإجمالي', revisit: 'زيارة ضمان', entry: { direct_link: 'رابط الفني', marketplace: 'السوق' }, window: 'الموعد', visitFee: 'رسم الزيارة', quote: 'العرض', created: 'أُنشئ',
    timeline: 'المسار', money: 'المال', ledger: 'القيود', payments: 'المدفوعات', refunds: 'الاستردادات', quotes: 'عروض السعر', evidence: 'الأدلة', chat: 'المحادثة', calls: 'المكالمات', events: 'الأحداث', policy: 'السياسة المطبّقة وقت الحجز',
    cancel: 'إلغاء الحجز', cancelFee: 'رسم الإلغاء % من رسم الزيارة (اختياري)', noShow: 'تسجيل غياب الفني', assign: 'تعيين فني', extend: 'تمديد مهلة', extendKind: { auto_confirm: 'التأكيد التلقائي', quote_expiry: 'صلاحية العرض', accept_timeout: 'مهلة القبول' }, minutes: 'دقائق',
    clearFlag: 'إزالة علامة التدخل', releaseQuote: 'اعتماد عرض فني التجربة', blockQuote: 'رفض العرض', resend: 'إعادة إرسال رسالة', revisitFailed: 'تسجيل فشل الإصلاح بعد الضمان', openDispute: 'فتح نزاع', partEvidence: 'إيصال القطعة مقبول', partNoEvidence: 'بلا إيصال مقبول',
    address: 'العنوان (يظهر للفني بعد القبول فقط)', problem: 'المشكلة', media: 'صور الزبون', arrival: 'الوصول', diagnosis: 'التشخيص', completion: 'الإنجاز', before: 'قبل', after: 'بعد', parts: 'القطع', commission: 'العمولة', techNet: 'صافي الفني', platformNet: 'صافي المنصة', refundTotal: 'إجمالي المسترد',
  },
  dispatch: { title: 'التوزيع اليدوي', body: 'طلبات السوق التي لم يقبلها أحد. اختر فنياً من المنطقة.', empty: 'لا طلبات تنتظر التوزيع', candidates: 'فنيون في المنطقة', available: 'متاح', unavailable: 'غير متاح', waitlist: 'قوائم الانتظار حسب المنطقة', active: 'مفعّلة', inactive: 'غير مفعّلة' },
  disputes: {
    title: 'النزاعات', sla: 'موعد القرار', reasonCode: 'السبب', opened: 'فُتح', evidence: 'الأدلة', decide: 'القرار', preview: 'معاينة المال قبل القرار', captured: 'المدفوع فعلياً', refund: 'استرداد للزبون', technician: 'للفني', platform: 'للمنصة',
    options: { technician_full: 'لصالح الفني بالكامل', customer_full: 'استرداد كامل للزبون', labor_only: 'استرداد أجرة العمل فقط', split: 'تقسيم يدوي', repair_failed: 'فشل الإصلاح (المادة D54)' },
    markReview: 'بدء المراجعة', note: 'نص القرار (يصل للطرفين)', mustMatch: 'المجموع يجب أن يساوي {total}', appeal: 'اعتراض — يقرره موظف آخر', statuses: { open: 'مفتوح', under_review: 'قيد المراجعة', decided: 'تقرر', appealed: 'معترض عليه', closed: 'مغلق' },
  },
  payments: {
    title: 'المدفوعات', provider: 'المزوّد', ref: 'المرجع', kind: 'النوع', sync: 'مزامنة الحالة', refunds: 'الاستردادات', retry: 'إعادة المحاولة', reconcile: 'المطابقة مع تقرير المزوّد', reconcileBody: 'الصق سطور التقرير بالشكل: المرجع,المبلغ بالبيسة — سطر لكل عملية.',
    run: 'مطابقة', matched: 'مطابقة: {n}', mismatched: 'غير مطابقة', missing: 'عندنا وليست في التقرير', ours: 'عندنا', theirs: 'في التقرير', statuses: { pending: 'بانتظار', paid: 'مدفوع', failed: 'فشل', expired: 'منتهي', refunded: 'مسترد', partially_refunded: 'مسترد جزئياً', cancelled: 'ملغى', done: 'تم' },
  },
  payouts: {
    title: 'الصرف للفنيين', due: 'مستحق الآن', empty: 'لا مبالغ مستحقة', blocked: { no_bank: 'لا حساب بنكي', bank_locked: 'الحساب البنكي تغيّر مؤخراً', bank_unverified: 'الحساب غير موثّق', negative_balance: 'رصيد سالب' },
    createBatch: 'إنشاء دفعة صرف', createBody: 'تُجمع كل المبالغ غير الموقوفة في دفعة واحدة وملف CSV للبنك.', batches: 'الدفعات', csv: 'ملف البنك', markPaid: 'تسجيل الدفع', bankRef: 'مرجع التحويل البنكي', failed: 'تسجيل فشل التحويل',
    adjust: 'تسوية يدوية', adjustBody: 'مبلغ موجب يضاف للفني، وسالب يخصم. بالريال العماني.', technicianId: 'الفني', hold: 'إيقاف/استئناف الصرف', statement: 'كشف شهري', statuses: { open: 'مفتوحة', paid: 'مدفوعة', pending: 'بانتظار', failed: 'فشل' },
  },
  reports: { title: 'التقارير والدفتر', from: 'من', to: 'إلى', balanced: 'الدفتر متوازن', unbalanced: 'الدفتر غير متوازن!', byAccount: 'حسب الحساب', debit: 'مدين', credit: 'دائن', byDay: 'حسب اليوم', commissionByType: 'العمولة حسب النوع', balances: 'الأرصدة الحالية', held: 'محتجز للفنيين', payable: 'مستحق للفنيين', revenue: 'إيراد المنصة', ledgerCsv: 'تنزيل الدفتر كاملاً CSV', vat: 'فواتير الضريبة: {on}' },
  catalog: { title: 'الخدمات', add: 'إضافة خدمة', nameAr: 'الاسم بالعربية', nameEn: 'الاسم بالإنجليزية', descAr: 'الوصف بالعربية', descEn: 'الوصف بالإنجليزية', duration: 'المدة (دقيقة)', priceMin: 'أقل سعر استرشادي', priceMax: 'أعلى سعر استرشادي', active: 'مفعّلة', sort: 'الترتيب' },
  areas: { title: 'المناطق', active: 'مفعّلة', feeOverride: 'رسم زيارة خاص (فارغ = الافتراضي)', neighbourhoods: 'الأحياء', waitlist: 'في قائمة الانتظار', activate: 'تفعيل', deactivate: 'إيقاف', radius: 'نصف القطر (م)' },
  legal: {
    title: 'الوثائق القانونية', lawyer: 'مراجعة المحامي', statuses: { editing: 'قيد التحرير', published: 'منشورة', superseded: 'استُبدلت' }, draft: 'مسودة — بانتظار المحامي', approved: 'معتمدة من المحامي', version: 'الإصدار', effective: 'تسري من', publish: 'نشر إصدار جديد', type: 'الوثيقة', language: 'اللغة', body: 'النص', titleField: 'العنوان', changeSummary: 'ملخص التغييرات',
    reaccept: 'يتطلب موافقة جديدة من المستخدمين', lawyerApproved: 'وافق المحامي على هذا النص', lawyerWarn: 'لا تعلّم هذا إلا بعد موافقة المحامي كتابياً. النصوص الحالية مسودات.', variables: 'متغيرات يمكن استخدامها', outOfDate: 'تغيّرت إعدادات مذكورة في هذه الوثائق — انشر إصداراً جديداً',
    consents: 'تقرير الموافقات', consentsCsv: 'تنزيل CSV', accepted: 'وافق في', withdrawn: 'سُحبت',
  },
  messaging: { title: 'الرسائل', templates: 'قوالب الرسائل', bodyAr: 'النص بالعربية', bodyEn: 'النص بالإنجليزية', test: 'إرسال تجربة لي', broadcast: 'رسالة جماعية', segment: 'الفئة', segments: { all_technicians: 'كل الفنيين', technicians_wilayat: 'فنيو ولاية', customers_open: 'زبائن لديهم حجوزات مفتوحة' }, wilayat: 'الولاية', history: 'الرسائل الجماعية السابقة', recipients: '{n} مستلم', noPrivate: 'لا تضع رقماً أو عنواناً أو آيباناً في الرسائل.' },
  reviews: { title: 'التقييمات', stars: 'النجوم', text: 'النص', hide: 'إخفاء', unhide: 'إظهار', hidden: 'مخفي', reply: 'رد الفني' },
  support: { title: 'الدعم', subject: 'الموضوع', reply: 'رد', send: 'إرسال الرد', close: 'إغلاق التذكرة', flagged: 'رسائل مُعلَّمة في المحادثات', flaggedReason: 'سبب التعليم', messages: 'الرسائل', statuses: { open: 'مفتوحة', answered: 'تم الرد', closed: 'مغلقة' } },
  settings: {
    title: 'الإعدادات', body: 'كل رقم في التطبيق يأتي من هنا. كل تغيير يُسجَّل مع السبب ويظهر في السجل.', groups: { money: 'المال', timing: 'المواعيد والمهل', technicians: 'الفنيون', security: 'الأمان', content: 'المحتوى', branding: 'الهوية والشركة', flags: 'المفاتيح' },
    default: 'الافتراضي', oldValue: 'القيمة السابقة', history: 'آخر التغييرات', change: 'تغيير', newValue: 'القيمة الجديدة', ownerOnly: 'للمالك فقط', legalVar: 'مذكور في الوثائق القانونية', gateWarn: 'فتح البوابة القانونية يفعّل الدفع الحقيقي والتسجيل العام. لا يُفتح إلا بعد اعتماد المحامي لكل الوثائق.', jsonHint: 'صيغة JSON',
  },
  staff: { title: 'الموظفون', add: 'إضافة موظف', email: 'البريد', role: 'الدور', tempPassword: 'كلمة مرور مؤقتة (12 خانة على الأقل)', active: 'فعّال', disabled: 'معطّل', lastSignIn: 'آخر دخول', totp: 'التحقق بخطوتين', resetTotp: 'إعادة ضبط التحقق بخطوتين', disable: 'تعطيل', enable: 'تفعيل', newPassword: 'كلمة مرور جديدة', setPassword: 'تعيين كلمة مرور', locked: 'مقفل' },
  security: {
    title: 'الأمان والسجل', sessions: 'الجلسات النشطة', device: 'الجهاز', lastUsed: 'آخر استخدام', end: 'إنهاء الجلسة', signIns: 'سجل الدخول', success: 'ناجح', failed: 'فاشل', blocked: 'هويات محظورة', addBlocked: 'حظر هوية', kind: 'النوع', value: 'القيمة',
    kinds: { phone: 'هاتف', civil_id: 'رقم مدني', iban: 'آيبان' }, unblock: 'رفع الحظر', audit: 'سجل التدقيق', chainOk: 'سلسلة السجل سليمة ({n} سطر)', chainBroken: 'سلسلة السجل مكسورة عند السطر {n}!', actor: 'المنفّذ', action: 'الإجراء', entity: 'الكيان',
    waitlist: 'قائمة الانتظار', you: 'أنت',
  },
};

type Shape<T> = { [K in keyof T]: T[K] extends string ? string : T[K] extends readonly string[] ? readonly string[] : Shape<T[K]> };

export const en: Shape<typeof ar> = {
  app: { title: 'Admin', skip: 'Skip to content', lang: 'العربية', theme: 'Switch theme', menu: 'Menu', signOut: 'Sign out', demo: 'Demo data — not real', gateClosed: 'Legal gate closed: no live payments, no public registration, no public messages.', gateOpen: 'Legal gate open.', gateShort: 'Gate closed' },
  nav: {
    overview: 'Overview', applications: 'Applications', technicians: 'Technicians', customers: 'Customers', bookings: 'Bookings', dispatch: 'Dispatch', disputes: 'Disputes',
    payments: 'Payments', payouts: 'Payouts', reports: 'Reports & ledger', catalog: 'Services', areas: 'Areas', legal: 'Legal documents', messaging: 'Messaging',
    reviews: 'Reviews', support: 'Support', settings: 'Settings', staff: 'Staff', security: 'Security & audit',
    groups: { work: 'Daily work', money: 'Money', setup: 'Setup', control: 'Control' },
  },
  roles: { owner: 'Owner', verifier: 'Verifier', support: 'Support', finance: 'Finance' },
  common: {
    reason: 'Reason', search: 'Search', all: 'All', status: 'Status', name: 'Name', date: 'Date', amount: 'Amount', actions: 'Actions', open: 'Open', details: 'Details',
    refresh: 'Refresh', page: 'Page {n}', prev: 'Previous', next: 'Next', total: '{n} results', none: '—', yes: 'Yes', no: 'No', save: 'Save', cancel: 'Cancel', confirm: 'Confirm',
    reveal: 'Reveal', revealTitle: 'Reveal protected data', revealBody: 'Revealing this is logged under your name with the reason.', copy: 'Copy', copied: 'Copied', download: 'Download', csv: 'Export CSV',
    done: 'Done', saved: 'Saved', noAccess: "Your role doesn't have access to this page.", loadFailed: "Couldn't load.", back: 'Back', note: 'Note', notes: 'Internal notes', addNote: 'Add note',
    hours: '{n} h', overdue: '{n} h overdue', dueIn: 'due in {n} h', moneyConfirm: 'Money action: you will be asked to review it a second time.', phone: 'Phone', add: 'Add', remove: 'Remove', reviewTwice: 'Important action: you will be asked to review it a second time.', area: 'Area', code: 'Code', technician: 'Technician', customer: 'Customer',
  },
  signIn: {
    title: 'Admin sign-in', email: 'Email', password: 'Password', submit: 'Sign in', totp: 'Authenticator code', totpHint: 'The 6-digit code in your authenticator app',
    useRecovery: 'Use a recovery code', useTotp: 'Use the authenticator app', recovery: 'Recovery code', enrollTitle: 'Turn on two-step verification', enrollBody: 'Scan the code with an authenticator app (such as Google Authenticator or 1Password), then enter the code it shows.',
    secret: 'Or enter this key by hand', codesTitle: 'Recovery codes', codesBody: 'Keep these codes somewhere safe. Each works once if you lose your phone. They will not be shown again.', codesSaved: "I've saved them — continue",
    sessionLost: 'Your session ended. Please sign in again.',
  },
  overview: {
    title: 'Overview', today: 'Today', bookings: "Today's bookings", gmv: 'Paid today', refunds: 'Refunded today', commission: 'Commission to date', applications: 'Applications waiting', oldest: 'Oldest waiting {n} h',
    payoutsDue: 'Payouts due', payoutsDueBody: '{n} technicians', disputes: 'Open disputes', docsExpiring: 'Documents expiring within 30 days', failedPayments: 'Failed payments', needsAdmin: 'Bookings needing attention',
    outOfDate: 'Documents to update after settings changes', byStatus: "Today's bookings by status",
    experiment: 'Experiment panel', experimentBody: 'Is the model working? Real numbers from paid bookings only.', paidServices: 'Paid services', target: 'Target {n}', repeat: 'Technicians with repeat customers', margin: 'Average platform net per service',
    payoutHours: 'Average hours from confirmation to payout', disputeRate: 'Dispute rate', flaggedChats: 'Flagged chats',
  },
  applications: {
    title: 'Applications', empty: 'No applications waiting', waiting: 'Waiting', workStatus: 'Work status', submitted: 'Submitted',
    checklist: 'Checklist', check: {
      identity_matches: 'Name and civil number match the card', selfie_matches: 'Selfie matches the card photo', documents_valid: 'Documents are valid and readable', work_permission: 'Work status backed by a document',
      bank_name_matches: 'Bank account holder matches the name', references_called: 'References contacted', work_photos_real: 'Work photos look genuine', no_duplicates: 'No duplicate accounts',
    },
    decide: 'Decision', approve: 'Approve (probation)', needsInfo: 'Ask for information', reject: 'Reject', inReview: 'Start review', approveBody: 'The technician starts probation and gets a personal booking link.',
    needsInfoBody: 'Tell the technician clearly what is missing. They receive this text as written.', rejectBody: 'Write the reason. The technician receives it as written.', checklistIncomplete: 'Complete the checklist before approving.',
  },
  tech: {
    title: 'Technicians', profile: 'Profile', documents: 'Documents', jobs: 'Jobs', strikes: 'Strikes', reviews: 'Reviews', payouts: 'Payables', edits: 'Profile edit requests', consents: 'Consents', history: 'History', quiz: 'Quiz',
    identity: 'Identity (masked)', acTypes: 'AC types', schedule: 'Working days and hours', nameEn: 'Name in English', nationality: 'Nationality', bank: 'Bank account', bankVerified: 'Verified', bankUnverified: 'Not verified', holderMismatch: 'Holder name does not match', bankLocked: 'Locked until {date}', duplicates: 'Accounts with the same phone',
    rating: 'Rating', jobsDone: 'Jobs done', commission: 'Custom commission', commissionDefault: 'From settings', probation: 'Probation jobs left: {n}', slug: 'Link', services: 'Services', areas: 'Areas',
    view: 'View', viewDoc: 'Open document', viewDocBody: 'Opening an identity document is logged under your name.', approveDoc: 'Approve', rejectDoc: 'Reject', expires: 'Expires', workPhotos: 'Work photos',
    act: {
      suspend: 'Suspend', unsuspend: 'Lift suspension', ban: 'Ban permanently', pause: 'Pause', unpause: 'Resume', commission: 'Change commission', add_strike: 'Add strike', remove_strike: 'Remove strike',
      reset_device: 'Sign out of all devices', message: 'Send a message', approve_edit: 'Approve edit', reject_edit: 'Reject edit', verify_bank: 'Verify bank account', note: 'Internal note', hold: 'Hold payouts', release: 'Release payouts',
    },
    banBody: 'A ban is permanent and blocks the phone, civil number and IBAN from registering again.', commissionValue: 'Commission % (empty = from settings)', strikeReason: 'Strike type', messageText: 'Message text',
    appeal: 'Appeal', appealAccept: 'Accept appeal', appealReject: 'Reject appeal', fields: { phone: 'Phone', email: 'Email', full_name: 'Full name', civil_id: 'Civil number', dob: 'Date of birth', cr_number: 'CR number', iban: 'IBAN', holder: 'Account holder', references: 'References', emergency: 'Emergency contact' },
    statuses: { draft: 'Draft', submitted: 'Submitted', in_review: 'In review', needs_info: 'Needs info', approved_probation: 'Probation', active: 'Active', paused: 'Paused', suspended: 'Suspended', banned: 'Banned', rejected: 'Rejected', deleted: 'Deleted' },
  },
  customers: { title: 'Customers', bookings: 'Bookings', refunds: 'Refunds', joined: 'Joined', block: 'Block', unblock: 'Unblock', anonymise: 'Anonymise (delete)', anonymiseBody: 'Permanently removes personal data and keeps the financial records.', statuses: { active: 'Active', blocked: 'Blocked', deleted: 'Deleted' } },
  bookings: {
    title: 'Bookings', needsAdmin: 'Needs attention', units: 'Units', entryMode: 'Booked via', addressNo: 'Way / building / flat', landmark: 'Landmark', receipt: 'Receipt', total: 'Total', revisit: 'Warranty revisit', entry: { direct_link: 'Technician link', marketplace: 'Marketplace' }, window: 'Window', visitFee: 'Visit fee', quote: 'Quote', created: 'Created',
    timeline: 'Timeline', money: 'Money', ledger: 'Ledger', payments: 'Payments', refunds: 'Refunds', quotes: 'Quotes', evidence: 'Evidence', chat: 'Chat', calls: 'Calls', events: 'Events', policy: 'Policy applied at booking time',
    cancel: 'Cancel booking', cancelFee: 'Cancellation fee % of the visit fee (optional)', noShow: 'Record technician no-show', assign: 'Assign technician', extend: 'Extend a timer', extendKind: { auto_confirm: 'Auto-confirm', quote_expiry: 'Quote expiry', accept_timeout: 'Accept timeout' }, minutes: 'Minutes',
    clearFlag: 'Clear attention flag', releaseQuote: 'Release probation quote', blockQuote: 'Reject quote', resend: 'Resend a message', revisitFailed: 'Record failed repair after warranty', openDispute: 'Open a dispute', partEvidence: 'Part receipt accepted', partNoEvidence: 'No accepted receipt',
    address: 'Address (shown to the technician only after acceptance)', problem: 'Problem', media: "Customer's photos", arrival: 'Arrival', diagnosis: 'Diagnosis', completion: 'Completion', before: 'Before', after: 'After', parts: 'Parts', commission: 'Commission', techNet: 'Technician net', platformNet: 'Platform net', refundTotal: 'Total refunded',
  },
  dispatch: { title: 'Manual dispatch', body: 'Marketplace requests nobody accepted. Choose a technician from the area.', empty: 'No requests waiting for dispatch', candidates: 'Technicians in the area', available: 'Available', unavailable: 'Unavailable', waitlist: 'Waitlists by area', active: 'Active', inactive: 'Inactive' },
  disputes: {
    title: 'Disputes', sla: 'Decision due', reasonCode: 'Reason', opened: 'Opened', evidence: 'Evidence', decide: 'Decision', preview: 'Money preview before deciding', captured: 'Actually paid', refund: 'Refund to customer', technician: 'To technician', platform: 'To platform',
    options: { technician_full: 'Fully for the technician', customer_full: 'Full refund to the customer', labor_only: 'Refund labour only', split: 'Manual split', repair_failed: 'Repair failed (D54)' },
    markReview: 'Start review', note: 'Decision text (sent to both sides)', mustMatch: 'The total must equal {total}', appeal: 'Appeal — decided by another staff member', statuses: { open: 'Open', under_review: 'Under review', decided: 'Decided', appealed: 'Appealed', closed: 'Closed' },
  },
  payments: {
    title: 'Payments', provider: 'Provider', ref: 'Reference', kind: 'Kind', sync: 'Sync status', refunds: 'Refunds', retry: 'Retry', reconcile: "Reconcile with the provider's report", reconcileBody: 'Paste report lines as: reference,amount in baisa — one line per transaction.',
    run: 'Reconcile', matched: 'Matched: {n}', mismatched: 'Mismatched', missing: 'Ours but not in the report', ours: 'Ours', theirs: 'Report', statuses: { pending: 'Pending', paid: 'Paid', failed: 'Failed', expired: 'Expired', refunded: 'Refunded', partially_refunded: 'Partly refunded', cancelled: 'Cancelled', done: 'Done' },
  },
  payouts: {
    title: 'Payouts', due: 'Due now', empty: 'Nothing due', blocked: { no_bank: 'No bank account', bank_locked: 'Bank account changed recently', bank_unverified: 'Bank account not verified', negative_balance: 'Negative balance' },
    createBatch: 'Create payout batch', createBody: 'All amounts not on hold go into one batch and one CSV file for the bank.', batches: 'Batches', csv: 'Bank file', markPaid: 'Mark as paid', bankRef: 'Bank transfer reference', failed: 'Record failed transfer',
    adjust: 'Manual adjustment', adjustBody: 'A positive amount is added for the technician, a negative one is deducted. In OMR.', technicianId: 'Technician', hold: 'Hold / release payouts', statement: 'Monthly statement', statuses: { open: 'Open', paid: 'Paid', pending: 'Pending', failed: 'Failed' },
  },
  reports: { title: 'Reports & ledger', from: 'From', to: 'To', balanced: 'Ledger balanced', unbalanced: 'Ledger NOT balanced!', byAccount: 'By account', debit: 'Debit', credit: 'Credit', byDay: 'By day', commissionByType: 'Commission by type', balances: 'Current balances', held: 'Held for technicians', payable: 'Payable to technicians', revenue: 'Platform revenue', ledgerCsv: 'Download the full ledger (CSV)', vat: 'VAT invoices: {on}' },
  catalog: { title: 'Services', add: 'Add service', nameAr: 'Name (Arabic)', nameEn: 'Name (English)', descAr: 'Description (Arabic)', descEn: 'Description (English)', duration: 'Duration (minutes)', priceMin: 'Lowest guide price', priceMax: 'Highest guide price', active: 'Active', sort: 'Order' },
  areas: { title: 'Areas', active: 'Active', feeOverride: 'Area visit fee (empty = default)', neighbourhoods: 'Neighbourhoods', waitlist: 'On the waitlist', activate: 'Activate', deactivate: 'Deactivate', radius: 'Radius (m)' },
  legal: {
    title: 'Legal documents', lawyer: 'Lawyer review', statuses: { editing: 'Editing', published: 'Published', superseded: 'Superseded' }, draft: 'Draft — awaiting the lawyer', approved: 'Approved by the lawyer', version: 'Version', effective: 'Effective', publish: 'Publish a new version', type: 'Document', language: 'Language', body: 'Text', titleField: 'Title', changeSummary: 'Summary of changes',
    reaccept: 'Users must accept again', lawyerApproved: 'The lawyer approved this text', lawyerWarn: 'Only tick this after written approval from the lawyer. The current texts are drafts.', variables: 'Variables you can use', outOfDate: 'Settings used in these documents changed — publish a new version',
    consents: 'Consent report', consentsCsv: 'Download CSV', accepted: 'Accepted', withdrawn: 'Withdrawn',
  },
  messaging: { title: 'Messaging', templates: 'Message templates', bodyAr: 'Text (Arabic)', bodyEn: 'Text (English)', test: 'Send me a test', broadcast: 'Broadcast', segment: 'Audience', segments: { all_technicians: 'All technicians', technicians_wilayat: 'Technicians in a wilayat', customers_open: 'Customers with open bookings' }, wilayat: 'Wilayat', history: 'Past broadcasts', recipients: '{n} recipients', noPrivate: "Don't put a phone number, address or IBAN in messages." },
  reviews: { title: 'Reviews', stars: 'Stars', text: 'Text', hide: 'Hide', unhide: 'Show', hidden: 'Hidden', reply: "Technician's reply" },
  support: { title: 'Support', subject: 'Subject', reply: 'Reply', send: 'Send reply', close: 'Close ticket', flagged: 'Flagged chat messages', flaggedReason: 'Flag reason', messages: 'Messages', statuses: { open: 'Open', answered: 'Answered', closed: 'Closed' } },
  settings: {
    title: 'Settings', body: 'Every number in the app comes from here. Every change is logged with its reason.', groups: { money: 'Money', timing: 'Timing', technicians: 'Technicians', security: 'Security', content: 'Content', branding: 'Brand & company', flags: 'Switches' },
    default: 'Default', oldValue: 'Previous value', history: 'Recent changes', change: 'Change', newValue: 'New value', ownerOnly: 'Owner only', legalVar: 'Used in legal documents', gateWarn: 'Opening the legal gate turns on live payments and public registration. Only open it once the lawyer has approved every document.', jsonHint: 'JSON format',
  },
  staff: { title: 'Staff', add: 'Add staff', email: 'Email', role: 'Role', tempPassword: 'Temporary password (12+ characters)', active: 'Active', disabled: 'Disabled', lastSignIn: 'Last sign-in', totp: 'Two-step verification', resetTotp: 'Reset two-step verification', disable: 'Disable', enable: 'Enable', newPassword: 'New password', setPassword: 'Set password', locked: 'Locked' },
  security: {
    title: 'Security & audit', sessions: 'Active sessions', device: 'Device', lastUsed: 'Last used', end: 'End session', signIns: 'Sign-in history', success: 'Success', failed: 'Failed', blocked: 'Blocked identities', addBlocked: 'Block an identity', kind: 'Kind', value: 'Value',
    kinds: { phone: 'Phone', civil_id: 'Civil number', iban: 'IBAN' }, unblock: 'Unblock', audit: 'Audit log', chainOk: 'Audit chain intact ({n} rows)', chainBroken: 'Audit chain BROKEN at row {n}!', actor: 'Actor', action: 'Action', entity: 'Entity',
    waitlist: 'Waitlist', you: 'You',
  },
};

export type AdminMessages = typeof ar;
