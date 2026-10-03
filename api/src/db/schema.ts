/**
 * Database schema (§4 plus the additions in D31-style notes in docs/data-model.md).
 * Columns ending in `_enc` hold AES-256-GCM ciphertext; `_index` columns hold HMAC blind indexes.
 * Money columns are integer baisa. Percentages are integer basis points.
 */
import {
  bigserial,
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });
const created = () => ts('created_at').notNull().defaultNow();
const updated = () => ts('updated_at').notNull().defaultNow();
const id = () => text('id').primaryKey();

// ---------------------------------------------------------------- people

export const users = pgTable(
  'users',
  {
    id: id(),
    role: text('role').notNull(), // customer | technician | admin
    phoneEnc: text('phone_enc'),
    phoneIndex: text('phone_index'),
    emailEnc: text('email_enc'),
    emailIndex: text('email_index'),
    displayName: text('display_name'),
    locale: text('locale').notNull().default('ar'),
    status: text('status').notNull().default('active'), // active | blocked | deleted
    marketingConsent: boolean('marketing_consent').notNull().default(false),
    lastLoginAt: ts('last_login_at'),
    lastLoginIpHash: text('last_login_ip_hash'),
    notes: text('notes'),
    createdAt: created(),
    updatedAt: updated(),
    deletedAt: ts('deleted_at'),
  },
  (t) => [
    uniqueIndex('users_phone_role').on(t.phoneIndex, t.role),
    uniqueIndex('users_email_role').on(t.emailIndex, t.role),
  ],
);

export const adminAccounts = pgTable('admin_accounts', {
  userId: text('user_id').primaryKey().references(() => users.id),
  passwordHash: text('password_hash').notNull(),
  totpSecretEnc: text('totp_secret_enc'),
  totpEnabled: boolean('totp_enabled').notNull().default(false),
  recoveryCodes: jsonb('recovery_codes').$type<string[]>().notNull().default([]),
  role: text('role').notNull(), // owner | verifier | support | finance
  lastSignInAt: ts('last_sign_in_at'),
  lastSignInDevice: text('last_sign_in_device'),
  failedAttempts: integer('failed_attempts').notNull().default(0),
  lockedUntil: ts('locked_until'),
  lockLevel: integer('lock_level').notNull().default(0),
  active: boolean('active').notNull().default(true),
  createdAt: created(),
  updatedAt: updated(),
});

export const technicians = pgTable(
  'technicians',
  {
    userId: text('user_id').primaryKey().references(() => users.id),
    status: text('status').notNull().default('draft'),
    wizardStep: integer('wizard_step').notNull().default(1),
    draft: jsonb('draft').$type<Record<string, unknown>>().notNull().default({}),
    fullNameArEnc: text('full_name_ar_enc'),
    fullNameEn: text('full_name_en'),
    publicName: text('public_name'),
    dobEnc: text('dob_enc'),
    nationality: text('nationality'),
    civilIdEnc: text('civil_id_enc'),
    civilIdIndex: text('civil_id_index'),
    workStatus: text('work_status'),
    crNumberEnc: text('cr_number_enc'),
    photoFileId: text('photo_file_id'),
    bio: text('bio'),
    experienceBand: text('experience_band'),
    ownVehicle: boolean('own_vehicle'),
    tools: jsonb('tools').$type<string[]>().notNull().default([]),
    teamSize: text('team_size'),
    services: jsonb('services').$type<string[]>().notNull().default([]),
    acTypes: jsonb('ac_types').$type<string[]>().notNull().default([]),
    brands: jsonb('brands').$type<string[]>().notNull().default([]),
    areas: jsonb('areas').$type<{ wilayat: string; neighbourhoods: string[] }[]>().notNull().default([]),
    maxDistanceKm: integer('max_distance_km'),
    workingDays: jsonb('working_days').$type<number[]>().notNull().default([0, 1, 2, 3, 4]),
    workingHours: jsonb('working_hours').$type<{ from: string; to: string }>().notNull().default({ from: '08:00', to: '20:00' }),
    maxJobsPerDay: integer('max_jobs_per_day').notNull().default(4),
    vacationUntil: ts('vacation_until'),
    available: boolean('available').notNull().default(true),
    bookingSlug: text('booking_slug'),
    commissionOverrideBps: integer('commission_override_bps'),
    probationJobsLeft: integer('probation_jobs_left').notNull().default(0),
    ratingSum: integer('rating_sum').notNull().default(0),
    ratingCount: integer('rating_count').notNull().default(0),
    jobsCompleted: integer('jobs_completed').notNull().default(0),
    strikesCount: integer('strikes_count').notNull().default(0),
    referencesEnc: text('references_enc'),
    emergencyContactEnc: text('emergency_contact_enc'),
    workPhotoIds: jsonb('work_photo_ids').$type<string[]>().notNull().default([]),
    quizPassedAt: ts('quiz_passed_at'),
    applicationSubmittedAt: ts('application_submitted_at'),
    reviewedBy: text('reviewed_by'),
    reviewedAt: ts('reviewed_at'),
    rejectReason: text('reject_reason'),
    needsInfo: jsonb('needs_info').$type<string[]>(),
    needsInfoMessage: text('needs_info_message'),
    approvedAt: ts('approved_at'),
    pausedReason: text('paused_reason'),
    verifierChecklist: jsonb('verifier_checklist').$type<Record<string, boolean>>().notNull().default({}),
    internalNotes: text('internal_notes'),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [uniqueIndex('technicians_slug').on(t.bookingSlug), uniqueIndex('technicians_civil').on(t.civilIdIndex)],
);

export const technicianDocuments = pgTable('technician_documents', {
  id: id(),
  technicianId: text('technician_id').notNull().references(() => technicians.userId),
  type: text('type').notNull(),
  fileId: text('file_id').notNull(),
  expiresAt: text('expires_at'), // YYYY-MM-DD
  status: text('status').notNull().default('pending'),
  reviewedBy: text('reviewed_by'),
  rejectReason: text('reject_reason'),
  remindersSent: jsonb('reminders_sent').$type<number[]>().notNull().default([]),
  createdAt: created(),
  updatedAt: updated(),
});

export const technicianBank = pgTable(
  'technician_bank',
  {
    technicianId: text('technician_id').primaryKey().references(() => technicians.userId),
    bankName: text('bank_name').notNull(),
    ibanEnc: text('iban_enc').notNull(),
    ibanIndex: text('iban_index').notNull(),
    holderEnc: text('holder_enc').notNull(),
    letterFileId: text('letter_file_id'),
    nameMismatch: boolean('name_mismatch').notNull().default(false),
    verifiedAt: ts('verified_at'),
    lockedUntil: ts('locked_until'),
    history: jsonb('history').$type<{ at: string; bankName: string; ibanLast4: string }[]>().notNull().default([]),
    updatedAt: updated(),
  },
  (t) => [uniqueIndex('bank_iban').on(t.ibanIndex)],
);

export const blockedIdentities = pgTable('blocked_identities', {
  id: id(),
  kind: text('kind').notNull(), // phone | civil_id | iban | device
  indexValue: text('index_value').notNull(),
  // the blocked value itself, encrypted, so the index can be recomputed when DATA_KEY rotates
  valueEnc: text('value_enc'),
  reason: text('reason').notNull(),
  createdBy: text('created_by'),
  createdAt: created(),
});

export const quizAttempts = pgTable('quiz_attempts', {
  id: id(),
  technicianId: text('technician_id').notNull(),
  score: integer('score').notNull(),
  passed: boolean('passed').notNull(),
  wrongTopics: jsonb('wrong_topics').$type<string[]>().notNull().default([]),
  createdAt: created(),
});

export const profileEditRequests = pgTable('profile_edit_requests', {
  id: id(),
  technicianId: text('technician_id').notNull(),
  changes: jsonb('changes').$type<Record<string, unknown>>().notNull(),
  status: text('status').notNull().default('pending'),
  reviewedBy: text('reviewed_by'),
  createdAt: created(),
});

// ---------------------------------------------------------------- files

export const files = pgTable('files', {
  id: id(),
  ownerUserId: text('owner_user_id'),
  purpose: text('purpose').notNull(),
  kind: text('kind').notNull(), // image | video | signature
  mime: text('mime').notNull(),
  size: integer('size').notNull(),
  sha256: text('sha256').notNull(),
  storageKey: text('storage_key').notNull(),
  sensitive: boolean('sensitive').notNull().default(false),
  public: boolean('public').notNull().default(false),
  captureMetaEnc: text('capture_meta_enc'),
  createdAt: created(),
});

// ---------------------------------------------------------------- legal

export const legalDocuments = pgTable('legal_documents', {
  id: id(),
  type: text('type').notNull(),
  language: text('language').notNull(),
  version: text('version').notNull(),
  title: text('title').notNull(),
  body: text('body').notNull(),
  renderedBody: text('rendered_body'),
  isDraft: boolean('is_draft').notNull().default(true),
  status: text('status').notNull().default('editing'), // editing | published | superseded
  publishedAt: ts('published_at'),
  effectiveAt: ts('effective_at'),
  requiresReacceptance: boolean('requires_reacceptance').notNull().default(false),
  changeSummary: text('change_summary'),
  publishedBy: text('published_by'),
  settingsSnapshot: jsonb('settings_snapshot').$type<Record<string, unknown>>(),
  createdAt: created(),
});

export const consents = pgTable('consents', {
  id: id(),
  userId: text('user_id').notNull(),
  legalDocumentId: text('legal_document_id').notNull(),
  docType: text('doc_type').notNull(),
  version: text('version').notNull(),
  acceptedAt: ts('accepted_at').notNull().defaultNow(),
  ipHash: text('ip_hash'),
  userAgent: text('user_agent'),
  locale: text('locale').notNull(),
  textSha256: text('text_sha256').notNull(),
  signatureName: text('signature_name'),
  signatureFileId: text('signature_file_id'),
  context: text('context').notNull(), // registration | booking | re-acceptance | marketing
  bookingId: text('booking_id'),
  withdrawnAt: ts('withdrawn_at'),
});

// ---------------------------------------------------------------- catalog and areas

export const serviceCatalog = pgTable('service_catalog', {
  id: id(),
  category: text('category').notNull().default('ac'),
  nameAr: text('name_ar').notNull(),
  nameEn: text('name_en').notNull(),
  descriptionAr: text('description_ar'),
  descriptionEn: text('description_en'),
  durationMin: integer('duration_min'),
  priceGuideMin: integer('price_guide_min'),
  priceGuideMax: integer('price_guide_max'),
  active: boolean('active').notNull().default(true),
  sort: integer('sort').notNull().default(0),
  updatedAt: updated(),
});

export interface Neighbourhood {
  id: string;
  ar: string;
  en: string;
  lat: number;
  lng: number;
  radius?: number;
}

export const areas = pgTable('areas', {
  wilayat: text('wilayat').primaryKey(),
  governorate: text('governorate').notNull(),
  nameAr: text('name_ar').notNull(),
  nameEn: text('name_en').notNull(),
  active: boolean('active').notNull().default(false),
  visitFeeOverride: integer('visit_fee_override'),
  waitlistCount: integer('waitlist_count').notNull().default(0),
  neighbourhoods: jsonb('neighbourhoods').$type<Neighbourhood[]>().notNull().default([]),
  sort: integer('sort').notNull().default(0),
  updatedAt: updated(),
});

export const waitlistEntries = pgTable('waitlist_entries', {
  id: id(),
  wilayat: text('wilayat').notNull(),
  phoneEnc: text('phone_enc').notNull(),
  phoneIndex: text('phone_index').notNull(),
  createdAt: created(),
});

export const addresses = pgTable('addresses', {
  id: id(),
  userId: text('user_id').notNull(),
  label: text('label'),
  wilayat: text('wilayat').notNull(),
  neighbourhood: text('neighbourhood').notNull(),
  wayNo: text('way_no'),
  buildingNo: text('building_no'),
  flatNo: text('flat_no'),
  landmark: text('landmark'),
  lat: doublePrecision('lat').notNull(),
  lng: doublePrecision('lng').notNull(),
  notesEnc: text('notes_enc'),
  createdAt: created(),
});

// ---------------------------------------------------------------- bookings

export interface BookingAddress {
  wilayat: string;
  neighbourhood: string;
  wayNo?: string | null;
  buildingNo?: string | null;
  flatNo?: string | null;
  landmark?: string | null;
  notesEnc?: string | null;
}

export const bookings = pgTable(
  'bookings',
  {
    id: id(),
    code: text('code').notNull(),
    customerId: text('customer_id').notNull(),
    technicianId: text('technician_id'),
    entryMode: text('entry_mode').notNull(), // direct_link | marketplace | repeat
    parentBookingId: text('parent_booking_id'),
    isRevisit: boolean('is_revisit').notNull().default(false),
    problem: text('problem').notNull(),
    units: jsonb('units').$type<{ type: string; brand?: string; count: number }[]>().notNull(),
    problemText: text('problem_text'),
    problemMedia: jsonb('problem_media').$type<string[]>().notNull().default([]),
    urgency: text('urgency').notNull().default('day'),
    address: jsonb('address').$type<BookingAddress>().notNull(),
    wilayat: text('wilayat').notNull(),
    neighbourhood: text('neighbourhood').notNull(),
    lat: doublePrecision('lat').notNull(),
    lng: doublePrecision('lng').notNull(),
    windowStart: ts('window_start').notNull(),
    windowEnd: ts('window_end').notNull(),
    status: text('status').notNull(),
    version: integer('version').notNull().default(0),
    visitFee: integer('visit_fee').notNull(),
    quoteTotal: integer('quote_total'),
    laborTotal: integer('labor_total'),
    partsTotal: integer('parts_total'),
    commissionBps: integer('commission_bps').notNull(),
    commissionReason: text('commission_reason').notNull(),
    commissionAmount: integer('commission_amount'),
    technicianNet: integer('technician_net'),
    gatewayFee: integer('gateway_fee'),
    platformNet: integer('platform_net'),
    refundTotal: integer('refund_total').notNull().default(0),
    settingsSnapshot: jsonb('settings_snapshot').$type<Record<string, unknown>>().notNull(),
    cancelReason: text('cancel_reason'),
    cancelledBy: text('cancelled_by'),
    etaMinutes: integer('eta_minutes'),
    arrival: jsonb('arrival').$type<{ lat?: number; lng?: number; distance?: number; photoFileId?: string; override?: boolean; simulated?: boolean }>(),
    diagnosis: jsonb('diagnosis').$type<{ faults: string[]; notes?: string; photos: string[]; durationMin?: number }>(),
    completion: jsonb('completion').$type<{ before: string[]; after: string[]; notes?: string; parts: { label: string; receiptFileId?: string }[] }>(),
    timeline: jsonb('timeline').$type<Record<string, string>>().notNull().default({}),
    trackingTokenHash: text('tracking_token_hash'),
    acceptDeadline: ts('accept_deadline'),
    payoutDueAt: ts('payout_due_at'),
    needsAdmin: text('needs_admin'),
    adminNotes: text('admin_notes'),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [
    uniqueIndex('bookings_code').on(t.code),
    index('bookings_customer').on(t.customerId),
    index('bookings_technician').on(t.technicianId),
    index('bookings_status').on(t.status),
  ],
);

export const bookingEvents = pgTable(
  'booking_events',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    bookingId: text('booking_id').notNull(),
    type: text('type').notNull(),
    actorId: text('actor_id'),
    actorRole: text('actor_role').notNull(),
    fromStatus: text('from_status'),
    toStatus: text('to_status'),
    lat: doublePrecision('lat'),
    lng: doublePrecision('lng'),
    mediaFileId: text('media_file_id'),
    note: text('note'),
    data: jsonb('data').$type<Record<string, unknown>>(),
    createdAt: created(),
  },
  (t) => [index('booking_events_booking').on(t.bookingId)],
);

export const bookingOffers = pgTable('booking_offers', {
  id: id(),
  bookingId: text('booking_id').notNull(),
  technicianId: text('technician_id').notNull(),
  batch: integer('batch').notNull().default(1),
  status: text('status').notNull().default('offered'), // offered | accepted | declined | expired | withdrawn
  declineReason: text('decline_reason'),
  offeredAt: ts('offered_at').notNull().defaultNow(),
  respondedAt: ts('responded_at'),
  expiresAt: ts('expires_at').notNull(),
});

export const quotes = pgTable('quotes', {
  id: id(),
  bookingId: text('booking_id').notNull(),
  version: integer('version').notNull(),
  items: jsonb('items').$type<{ kind: 'labor' | 'part' | 'other'; label: string; qty: number; unitPrice: number; evidenced?: boolean; outOfBand?: boolean }[]>().notNull(),
  total: integer('total').notNull(),
  laborTotal: integer('labor_total').notNull(),
  partsTotal: integer('parts_total').notNull(),
  validUntil: ts('valid_until'),
  status: text('status').notNull(), // pending_admin | sent | approved | rejected | expired | superseded
  needsAdminApproval: boolean('needs_admin_approval').notNull().default(false),
  outOfBand: boolean('out_of_band').notNull().default(false),
  releasedAt: ts('released_at'),
  createdAt: created(),
});

export const callLogs = pgTable('call_logs', {
  id: id(),
  bookingId: text('booking_id').notNull(),
  callerRole: text('caller_role').notNull(),
  callerId: text('caller_id').notNull(),
  createdAt: created(),
});

export const messages = pgTable('messages', {
  id: id(),
  bookingId: text('booking_id').notNull(),
  senderId: text('sender_id').notNull(),
  senderRole: text('sender_role').notNull(),
  body: text('body').notNull(),
  flaggedReason: text('flagged_reason'),
  createdAt: created(),
});

// ---------------------------------------------------------------- money

export const payments = pgTable('payments', {
  id: id(),
  bookingId: text('booking_id').notNull(),
  kind: text('kind').notNull(), // visit_fee | repair | revisit
  provider: text('provider').notNull(),
  providerRef: text('provider_ref'),
  providerPaymentId: text('provider_payment_id'),
  amount: integer('amount').notNull(),
  status: text('status').notNull().default('pending'),
  checkoutUrl: text('checkout_url'),
  refundedAmount: integer('refunded_amount').notNull().default(0),
  paidAt: ts('paid_at'),
  createdAt: created(),
  updatedAt: updated(),
});

export const refunds = pgTable('refunds', {
  id: id(),
  bookingId: text('booking_id').notNull(),
  paymentId: text('payment_id').notNull(),
  amount: integer('amount').notNull(),
  reasonCode: text('reason_code').notNull(),
  decidedBy: text('decided_by'),
  providerRef: text('provider_ref'),
  status: text('status').notNull().default('pending'),
  createdAt: created(),
});

export const ledgerTransactions = pgTable(
  'ledger_transactions',
  {
    id: id(),
    bookingId: text('booking_id'),
    technicianId: text('technician_id'),
    kind: text('kind').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    memo: text('memo'),
    createdBy: text('created_by'),
    createdAt: created(),
  },
  (t) => [uniqueIndex('ledger_tx_idem').on(t.idempotencyKey)],
);

export const ledgerEntries = pgTable(
  'ledger_entries',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    transactionId: text('transaction_id').notNull(),
    bookingId: text('booking_id'),
    technicianId: text('technician_id'),
    account: text('account').notNull(),
    debit: integer('debit').notNull().default(0),
    credit: integer('credit').notNull().default(0),
    createdAt: created(),
  },
  (t) => [index('ledger_entries_booking').on(t.bookingId), index('ledger_entries_tech').on(t.technicianId)],
);

export const payableItems = pgTable('payable_items', {
  id: id(),
  technicianId: text('technician_id').notNull(),
  bookingId: text('booking_id'),
  adjustmentId: text('adjustment_id'),
  amount: integer('amount').notNull(),
  dueAt: ts('due_at').notNull(),
  status: text('status').notNull().default('scheduled'), // scheduled | held | in_batch | paid
  holdReason: text('hold_reason'),
  payoutId: text('payout_id'),
  createdAt: created(),
});

export const payoutBatches = pgTable('payout_batches', {
  id: id(),
  status: text('status').notNull().default('open'), // open | paid | cancelled
  total: integer('total').notNull().default(0),
  createdBy: text('created_by').notNull(),
  bankReference: text('bank_reference'),
  paidAt: ts('paid_at'),
  paidBy: text('paid_by'),
  createdAt: created(),
});

export const payouts = pgTable('payouts', {
  id: id(),
  technicianId: text('technician_id').notNull(),
  batchId: text('batch_id').notNull(),
  amount: integer('amount').notNull(),
  status: text('status').notNull().default('in_batch'), // in_batch | paid | failed
  bankReference: text('bank_reference'),
  paidAt: ts('paid_at'),
  paidBy: text('paid_by'),
  items: jsonb('items').$type<string[]>().notNull().default([]),
  createdAt: created(),
});

export const adjustments = pgTable('adjustments', {
  id: id(),
  technicianId: text('technician_id').notNull(),
  amount: integer('amount').notNull(),
  reason: text('reason').notNull(),
  createdBy: text('created_by').notNull(),
  createdAt: created(),
});

// ---------------------------------------------------------------- trust

export const disputes = pgTable('disputes', {
  id: id(),
  bookingId: text('booking_id').notNull(),
  openedBy: text('opened_by').notNull(),
  reasonCode: text('reason_code').notNull(),
  description: text('description'),
  evidence: jsonb('evidence').$type<string[]>().notNull().default([]),
  status: text('status').notNull().default('open'), // open | under_review | decided | appealed | closed
  decision: text('decision'),
  decisionAmounts: jsonb('decision_amounts').$type<Record<string, number>>(),
  decisionNote: text('decision_note'),
  decidedBy: text('decided_by'),
  decidedAt: ts('decided_at'),
  slaDueAt: ts('sla_due_at').notNull(),
  appealUsed: boolean('appeal_used').notNull().default(false),
  appealText: text('appeal_text'),
  appealBy: text('appeal_by'),
  secondReviewer: text('second_reviewer'),
  createdAt: created(),
});

export const reviews = pgTable(
  'reviews',
  {
    id: id(),
    bookingId: text('booking_id').notNull(),
    technicianId: text('technician_id').notNull(),
    customerId: text('customer_id').notNull(),
    direction: text('direction').notNull(),
    rating: integer('rating').notNull(),
    tags: jsonb('tags').$type<string[]>().notNull().default([]),
    comment: text('comment'),
    visibility: text('visibility').notNull().default('public'),
    moderationStatus: text('moderation_status').notNull().default('visible'),
    hiddenReason: text('hidden_reason'),
    reply: text('reply'),
    createdAt: created(),
  },
  (t) => [uniqueIndex('reviews_booking_dir').on(t.bookingId, t.direction)],
);

export const strikes = pgTable('strikes', {
  id: id(),
  technicianId: text('technician_id').notNull(),
  reasonCode: text('reason_code').notNull(),
  bookingId: text('booking_id'),
  note: text('note'),
  expiresAt: ts('expires_at').notNull(),
  appealStatus: text('appeal_status'), // null | pending | accepted | rejected
  appealText: text('appeal_text'),
  createdBy: text('created_by'),
  removedAt: ts('removed_at'),
  removedReason: text('removed_reason'),
  createdAt: created(),
});

export const supportTickets = pgTable('support_tickets', {
  id: id(),
  userId: text('user_id').notNull(),
  userRole: text('user_role').notNull(),
  bookingId: text('booking_id'),
  subject: text('subject').notNull(),
  status: text('status').notNull().default('open'),
  assignee: text('assignee'),
  messages: jsonb('messages').$type<{ by: string; role: string; body: string; at: string }[]>().notNull().default([]),
  createdAt: created(),
  updatedAt: updated(),
});

// ---------------------------------------------------------------- notifications

export const notifications = pgTable(
  'notifications',
  {
    id: id(),
    userId: text('user_id').notNull(),
    channel: text('channel').notNull(), // push | sms | whatsapp | email | inapp
    templateKey: text('template_key').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
    link: text('link'),
    status: text('status').notNull().default('queued'), // queued | sent | failed | skipped
    error: text('error'),
    sendAfter: ts('send_after'),
    sentAt: ts('sent_at'),
    readAt: ts('read_at'),
    createdAt: created(),
  },
  (t) => [index('notifications_user').on(t.userId)],
);

export const notificationTemplates = pgTable('notification_templates', {
  key: text('key').primaryKey(),
  bodyAr: text('body_ar').notNull(),
  bodyEn: text('body_en').notNull(),
  urgent: boolean('urgent').notNull().default(false),
  channels: jsonb('channels').$type<string[]>().notNull().default(['push', 'sms']),
  updatedBy: text('updated_by'),
  updatedAt: updated(),
});

export const pushSubscriptions = pgTable('push_subscriptions', {
  id: id(),
  userId: text('user_id').notNull(),
  kind: text('kind').notNull(), // webpush | apns
  endpoint: text('endpoint').notNull(),
  keys: jsonb('keys').$type<Record<string, string>>(),
  deviceId: text('device_id'),
  createdAt: created(),
});

export const broadcasts = pgTable('broadcasts', {
  id: id(),
  segment: text('segment').notNull(),
  bodyAr: text('body_ar').notNull(),
  bodyEn: text('body_en').notNull(),
  sentCount: integer('sent_count').notNull().default(0),
  createdBy: text('created_by').notNull(),
  createdAt: created(),
});

// ---------------------------------------------------------------- platform

export const settings = pgTable('settings', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull(),
  updatedBy: text('updated_by'),
  updatedAt: updated(),
});

export const settingsHistory = pgTable('settings_history', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  key: text('key').notNull(),
  oldValue: jsonb('old_value'),
  newValue: jsonb('new_value'),
  changedBy: text('changed_by'),
  reason: text('reason'),
  createdAt: created(),
});

export const auditLog = pgTable('audit_log', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  actorId: text('actor_id'),
  actorRole: text('actor_role').notNull(),
  action: text('action').notNull(),
  entity: text('entity').notNull(),
  entityId: text('entity_id'),
  reason: text('reason'),
  beforeHash: text('before_hash'),
  afterHash: text('after_hash'),
  ipHash: text('ip_hash'),
  data: jsonb('data').$type<Record<string, unknown>>(),
  prevHash: text('prev_hash').notNull(),
  rowHash: text('row_hash').notNull(),
  createdAt: created(),
});

export const attempts = pgTable('attempts', {
  key: text('key').primaryKey(),
  count: integer('count').notNull().default(0),
  lockLevel: integer('lock_level').notNull().default(0),
  lockedUntil: ts('locked_until'),
  windowStartedAt: ts('window_started_at').notNull().defaultNow(),
});

export const otpChallenges = pgTable('otp_challenges', {
  id: id(),
  phoneIndex: text('phone_index').notNull(),
  purpose: text('purpose').notNull(),
  codeHash: text('code_hash').notNull(),
  attempts: integer('attempts').notNull().default(0),
  expiresAt: ts('expires_at').notNull(),
  consumedAt: ts('consumed_at'),
  createdAt: created(),
});

export const sessions = pgTable(
  'sessions',
  {
    id: id(),
    userId: text('user_id').notNull(),
    kind: text('kind').notNull(), // user | admin
    familyId: text('family_id').notNull(),
    refreshHash: text('refresh_hash').notNull(),
    deviceId: text('device_id').notNull(),
    deviceLabel: text('device_label'),
    ipHash: text('ip_hash'),
    city: text('city'),
    createdAt: created(),
    lastUsedAt: ts('last_used_at').notNull().defaultNow(),
    expiresAt: ts('expires_at').notNull(),
    revokedAt: ts('revoked_at'),
    revokedReason: text('revoked_reason'),
  },
  (t) => [uniqueIndex('sessions_refresh').on(t.refreshHash), index('sessions_user').on(t.userId)],
);

export const signInHistory = pgTable('sign_in_history', {
  id: id(),
  userId: text('user_id'),
  emailIndex: text('email_index'),
  success: boolean('success').notNull(),
  reason: text('reason'),
  ipHash: text('ip_hash'),
  device: text('device'),
  createdAt: created(),
});

export const scheduledJobs = pgTable(
  'scheduled_jobs',
  {
    id: id(),
    kind: text('kind').notNull(),
    entityId: text('entity_id').notNull(),
    dedupeKey: text('dedupe_key').notNull(),
    dueAt: ts('due_at').notNull(),
    status: text('status').notNull().default('pending'), // pending | running | done | failed | cancelled
    attempts: integer('attempts').notNull().default(0),
    lastError: text('last_error'),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
    lockedAt: ts('locked_at'),
    createdAt: created(),
  },
  (t) => [uniqueIndex('jobs_dedupe').on(t.dedupeKey), index('jobs_due').on(t.status, t.dueAt)],
);

export const webhookEvents = pgTable(
  'webhook_events',
  {
    id: id(),
    provider: text('provider').notNull(),
    eventId: text('event_id').notNull(),
    payloadHash: text('payload_hash').notNull(),
    processedAt: ts('processed_at'),
    createdAt: created(),
  },
  (t) => [uniqueIndex('webhook_provider_event').on(t.provider, t.eventId)],
);

export const adminNotes = pgTable(
  'admin_notes',
  {
    entity: text('entity').notNull(),
    entityId: text('entity_id').notNull(),
    id: text('id').notNull(),
    authorId: text('author_id').notNull(),
    body: text('body').notNull(),
    createdAt: created(),
  },
  (t) => [primaryKey({ columns: [t.entity, t.entityId, t.id] })],
);
