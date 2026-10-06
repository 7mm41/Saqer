/** Notification templates (§10). Arabic is the source of truth; English is a draft translation. */
export interface TemplateSeed {
  key: string;
  ar: string;
  en: string;
  urgent?: boolean;
  channels: string[];
}

export const TEMPLATES: TemplateSeed[] = [
  { key: 'app_received', channels: ['push', 'sms'], ar: 'وصلنا طلب انضمامك. نراجعه ونخبرك قريباً.', en: "We've received your application. We'll review it and let you know soon." },
  { key: 'needs_info', channels: ['push', 'sms'], ar: 'نحتاج منك تحديثاً بسيطاً لإكمال طلبك: {what}. افتح التطبيق للتفاصيل.', en: 'We need a small update to complete your application: {what}. Open the app for details.' },
  { key: 'approved', channels: ['push', 'sms'], ar: 'تم اعتماد حسابك. يمكنك الآن استقبال الطلبات. أهلاً بك في {app}.', en: 'Your account is approved. You can now receive requests. Welcome to {app}.' },
  { key: 'rejected', channels: ['push', 'sms'], ar: 'لم نتمكن من اعتماد طلبك الآن. السبب: {reason}. يمكنك التقديم مجدداً بعد {days} يوماً.', en: "We couldn't approve your application now. Reason: {reason}. You can apply again after {days} days." },
  { key: 'new_request', urgent: true, channels: ['push', 'sms'], ar: 'طلب جديد في {area}: {service} · {window}. المضمون لك: {visit_fee} ر.ع. اقبل خلال {minutes} دقيقة.', en: 'New request in {area}: {service} · {window}. Guaranteed to you: {visit_fee} OMR. Accept within {minutes} minutes.' },
  { key: 'request_expired_tech', channels: ['push'], ar: 'انتهى وقت الطلب وانتقل لفنّي آخر.', en: 'The request timed out and moved to another technician.' },
  { key: 'booking_confirmed', channels: ['push', 'sms'], ar: 'تم تأكيد حجزك {code}. نبحث لك عن فنّي وسنخبرك فور القبول.', en: "Your booking {code} is confirmed. We'll tell you as soon as a technician accepts." },
  { key: 'tech_accepted', channels: ['push', 'sms'], ar: 'قبل {name} طلبك {code}. موعد الوصول: {window}.', en: '{name} accepted your request {code}. Arrival: {window}.' },
  { key: 'on_the_way', channels: ['push', 'sms'], ar: '{name} في الطريق إليك.', en: '{name} is on the way.' },
  { key: 'arrived', urgent: true, channels: ['push', 'sms'], ar: 'وصل {name}. سيفحص الجهاز ويرسل لك السعر للموافقة.', en: '{name} has arrived. They will inspect the unit and send you the price to approve.' },
  { key: 'quote_ready', channels: ['push', 'sms'], ar: 'وصلك عرض السعر للطلب {code}. راجعه ووافق أو ارفض من الرابط: {link}', en: 'Your quote for {code} is ready. Review, approve or reject here: {link}' },
  { key: 'work_completed', channels: ['push', 'sms'], ar: 'انتهى العمل في الطلب {code}. تأكد أن كل شيء يعمل، ولديك {hours} ساعة للتأكيد أو الإبلاغ. {link}', en: 'Work on {code} is done. Check everything works; you have {hours} hours to confirm or report. {link}' },
  { key: 'confirm_reminder', channels: ['push', 'sms'], ar: 'تذكير: أكّد إنجاز الطلب {code} أو أبلغ عن مشكلة. {link}', en: 'Reminder: confirm {code} or report a problem. {link}' },
  { key: 'auto_confirmed', channels: ['push', 'sms'], ar: 'تم تأكيد الطلب {code} تلقائياً. شكراً لاستخدامك {app}.', en: '{code} was confirmed automatically. Thank you for using {app}.' },
  { key: 'payment_received', channels: ['push', 'sms'], ar: 'استلمنا دفعتك للطلب {code}.', en: 'We received your payment for {code}.' },
  { key: 'refund_issued', channels: ['push', 'sms'], ar: 'تم رد {amount} ر.ع للطلب {code}، وتصلك خلال أيام العمل حسب بنكك.', en: '{amount} OMR was refunded for {code}; it reaches you within your bank’s working days.' },
  { key: 'payout_sent', channels: ['push', 'sms'], ar: 'تم تحويل {amount} ر.ع إلى حسابك. المرجع {ref}.', en: '{amount} OMR was transferred to your account. Reference {ref}.' },
  { key: 'doc_expiring', channels: ['push', 'sms'], ar: 'مستند {doc} ينتهي بعد {days} يوماً. جدّده لتستمر في استقبال الطلبات.', en: 'Your {doc} expires in {days} days. Renew it to keep receiving requests.' },
  { key: 'dispute_opened', channels: ['push', 'sms'], ar: 'فتحنا بلاغاً على الطلب {code} وسنراجعه خلال {hours} ساعة.', en: "We opened a report on {code} and will review it within {hours} hours." },
  { key: 'dispute_decided', channels: ['push', 'sms'], ar: 'صدر القرار في بلاغ الطلب {code}. افتح التطبيق للتفاصيل.', en: 'A decision was made on the report for {code}. Open the app for details.' },
  { key: 'review_received', channels: ['push'], ar: 'حصلت على تقييم {stars} نجوم على الطلب {code}.', en: 'You received a {stars}-star rating on {code}.' },
  { key: 'terms_updated', channels: ['push', 'sms'], ar: 'حدّثنا {doc}. يرجى مراجعتها والموافقة قبل المتابعة.', en: 'We updated the {doc}. Please review and accept before continuing.' },
  { key: 'strike_issued', channels: ['push', 'sms'], ar: 'سُجّلت عليك مخالفة: {reason}. اطلع على التفاصيل أو اعترض خلال {days} أيام.', en: 'A strike was recorded: {reason}. See the details or appeal within {days} days.' },
  { key: 'booking_cancelled', channels: ['push', 'sms'], ar: 'أُلغي الطلب {code}. {detail}', en: '{code} was cancelled. {detail}' },
  { key: 'technician_late', channels: ['push', 'sms'], ar: 'تأخر الفني عن موعد الطلب {code}. يمكنك الإلغاء مجاناً من الرابط: {link}', en: 'The technician is late for {code}. You can cancel free here: {link}' },
  { key: 'quote_pending_approval', channels: ['push'], ar: 'عرضك للطلب {code} بانتظار موافقة الإدارة لأنه فوق حد فترة التجربة.', en: 'Your quote for {code} is waiting for admin approval because it is above the probation limit.' },
  { key: 'quote_decision', channels: ['push'], ar: 'ردّ الزبون على عرض الطلب {code}: {decision}.', en: 'The customer responded to the quote for {code}: {decision}.' },
  { key: 'job_confirmed_tech', channels: ['push'], ar: 'أكّد الزبون إنجاز الطلب {code}. يُصرف مستحقك في {date}.', en: 'The customer confirmed {code}. Your payout is due on {date}.' },
  { key: 'admin_alert', urgent: true, channels: ['push'], ar: 'تنبيه للإدارة: {what}', en: 'Admin alert: {what}' },
  { key: 'broadcast', channels: ['push', 'sms'], ar: '{body}', en: '{body}' },
];
