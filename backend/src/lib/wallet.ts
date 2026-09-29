import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import forge from 'node-forge';
import type { Booking, Localized, Membership, Plan, User, Venue } from '../db/schema.ts';
import { zip } from './zip.ts';

/**
 * Apple Wallet passes (.pkpass): the membership card and every booking code,
 * each with a QR the venue scans in the control panel's "Redeem codes" page.
 *
 * A pass is a zip of pass.json, images and translations, a manifest of their
 * SHA-1 hashes, and a detached PKCS #7 signature of that manifest made with
 * the Pass Type ID certificate (from developer.apple.com) and Apple's WWDR
 * intermediate certificate. Without them the feature stays off: the app hides
 * "Add to Apple Wallet" and the endpoints answer 503.
 */

export type WalletSettings = {
  passTypeId: string;
  teamId: string;
  organization: string;
  /** The Pass Type ID certificate and its private key, exported from Keychain as .p12. */
  certFile: string;
  certPassword: string;
  /** Apple WWDR intermediate certificate (.cer or .pem, G4). */
  wwdrFile: string;
};

export type WalletSigner = {
  passTypeId: string;
  teamId: string;
  organization: string;
  sign: (manifest: Buffer) => Buffer;
};

/** Loads the signing identity, or returns null when the settings are incomplete. Throws on a bad certificate. */
export function createWalletSigner(settings: WalletSettings): WalletSigner | null {
  if (!settings.passTypeId || !settings.teamId || !settings.certFile || !settings.wwdrFile) return null;
  const p12 = forge.pkcs12.pkcs12FromAsn1(
    forge.asn1.fromDer(readFileSync(settings.certFile).toString('binary')),
    settings.certPassword,
  );
  const bag = (type: string) => p12.getBags({ bagType: oid(type) })[oid(type)]?.[0];
  const certificate = bag('certBag')?.cert;
  const key = (bag('pkcs8ShroudedKeyBag') ?? bag('keyBag'))?.key;
  if (!certificate || !key) throw new Error('The Wallet .p12 file must contain the Pass Type ID certificate and its private key.');
  const wwdr = readCertificate(readFileSync(settings.wwdrFile));
  return {
    passTypeId: settings.passTypeId,
    teamId: settings.teamId,
    organization: settings.organization,
    sign: (manifest) => signManifest(manifest, certificate, key, wwdr),
  };
}

/** A signer from PEM strings (tests, or keys kept in a secret store). */
export function walletSignerFromPem(options: {
  passTypeId: string; teamId: string; organization: string; certificatePem: string; keyPem: string; wwdrPem: string;
}): WalletSigner {
  const certificate = forge.pki.certificateFromPem(options.certificatePem);
  const key = forge.pki.privateKeyFromPem(options.keyPem);
  const wwdr = forge.pki.certificateFromPem(options.wwdrPem);
  return { ...options, sign: (manifest) => signManifest(manifest, certificate, key, wwdr) };
}

/** forge's OID table is a plain record: these names always exist. */
const oid = (name: string) => forge.pki.oids[name]!;

function readCertificate(data: Buffer) {
  const text = data.toString('utf8');
  if (text.includes('-----BEGIN CERTIFICATE-----')) return forge.pki.certificateFromPem(text);
  return forge.pki.certificateFromAsn1(forge.asn1.fromDer(data.toString('binary')));
}

function signManifest(manifest: Buffer, certificate: forge.pki.Certificate, key: forge.pki.PrivateKey, wwdr: forge.pki.Certificate) {
  const signed = forge.pkcs7.createSignedData();
  signed.content = forge.util.createBuffer(manifest.toString('binary'));
  signed.addCertificate(certificate);
  signed.addCertificate(wwdr);
  signed.addSigner({
    key: key as forge.pki.rsa.PrivateKey,
    certificate,
    digestAlgorithm: oid('sha256'),
    authenticatedAttributes: [
      { type: oid('contentType'), value: oid('data') },
      { type: oid('messageDigest') },
      { type: oid('signingTime'), value: new Date() as unknown as string },
    ],
  });
  signed.sign({ detached: true });
  return Buffer.from(forge.asn1.toDer(signed.toAsn1()).getBytes(), 'binary');
}

// ---------------------------------------------------------------- building

type Lang = 'ar' | 'en';
type Strings = Record<string, [en: string, ar: string]>;

/** Labels, translated by Wallet itself (en.lproj / ar.lproj). */
const LABELS: Strings = {
  MEMBER: ['Member', 'العضو'],
  MEMBER_NO: ['Member no.', 'رقم العضوية'],
  STATUS: ['Membership', 'العضوية'],
  ACTIVE: ['Active', 'فعّالة'],
  INACTIVE: ['Not active', 'غير فعّالة'],
  VALID_UNTIL: ['Valid until', 'صالحة حتى'],
  VENUE: ['Venue', 'المكان'],
  TICKET: ['Ticket', 'التذكرة'],
  QTY: ['Qty', 'العدد'],
  CODE: ['Code', 'الكود'],
  MEMBER_PRICE: ['Member price', 'سعر الأعضاء'],
  WAS: ['Was', 'بدلاً من'],
  STARTS: ['Starts', 'يبدأ'],
  EXPIRES: ['Use by', 'صالح حتى'],
  HOW: ['At the venue', 'عند المدخل'],
  HOW_MEMBER: ['Show this QR at any Sarena partner. Staff scan it to confirm your membership is active.',
    'اعرض رمز QR هذا عند أي شريك لسرينا، ويمسحه الموظف للتأكد من أن عضويتك فعّالة.'],
  HOW_CODE: ['Show this QR at the entrance. Staff scan it once to apply the member price.',
    'اعرض رمز QR هذا عند المدخل، ويمسحه الموظف مرة واحدة لتطبيق سعر الأعضاء.'],
  SUPPORT: ['Help', 'المساعدة'],
  SUPPORT_TEXT: ['Open the Sarena app › Settings › Contact us.', 'افتح تطبيق سرينا › الإعدادات › تواصل معنا.'],
};

/** The same calm look as the app: Sarena orange with white text. */
const LOOK = {
  backgroundColor: 'rgb(255, 121, 0)',
  foregroundColor: 'rgb(255, 255, 255)',
  labelColor: 'rgb(255, 232, 211)',
};

let images: Record<string, Buffer> | null = null;
function passImages() {
  if (!images) {
    const folder = resolve(import.meta.dirname, '../../assets/wallet');
    images = Object.fromEntries(readdirSync(folder).filter((f) => f.endsWith('.png')).map((f) => [f, readFileSync(resolve(folder, f))]));
  }
  return images;
}

const escapeStrings = (value: string) => value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');

/** Zips and signs a pass. `pass` is pass.json without the identity keys. */
export function buildPass(signer: WalletSigner, pass: Record<string, unknown>): Buffer {
  const files: Record<string, Buffer> = {
    'pass.json': Buffer.from(JSON.stringify({
      formatVersion: 1,
      passTypeIdentifier: signer.passTypeId,
      teamIdentifier: signer.teamId,
      organizationName: signer.organization,
      ...LOOK,
      ...pass,
    })),
    ...passImages(),
  };
  for (const [index, lang] of (['en', 'ar'] as const).entries()) {
    const lines = Object.entries(LABELS).map(([key, texts]) => `"${key}" = "${escapeStrings(texts[index]!)}";`);
    files[`${lang}.lproj/pass.strings`] = Buffer.from(lines.join('\n') + '\n', 'utf8');
  }
  const manifest = Buffer.from(JSON.stringify(Object.fromEntries(
    Object.entries(files).map(([name, data]) => [name, createHash('sha1').update(data).digest('hex')]),
  )));
  return zip({ ...files, 'manifest.json': manifest, signature: signer.sign(manifest) });
}

const pick = (text: Localized, lang: Lang) => (lang === 'ar' ? text.ar || text.en : text.en || text.ar);
const omr = (baisa: number) => `${(baisa / 1000).toFixed(3)} OMR`;

/** The membership card: the member, their number, and a QR that proves the membership. */
export function membershipPass(options: {
  user: User; membership: { membership: Membership; plan: Plan } | null; qr: string; lang: Lang; now?: Date;
}) {
  const { user, membership, qr, lang } = options;
  const now = options.now ?? new Date();
  const active = membership !== null && membership.membership.status === 'active' && membership.membership.expiresAt > now;
  return {
    serialNumber: `membership-${user.id}`,
    description: lang === 'ar' ? 'بطاقة عضوية سرينا' : 'Sarena membership card',
    logoText: lang === 'ar' ? 'سرينا' : 'Sarena',
    generic: {
      primaryFields: [{ key: 'member', label: 'MEMBER', value: user.fullName }],
      secondaryFields: [
        { key: 'number', label: 'MEMBER_NO', value: user.memberNumber },
        { key: 'status', label: 'STATUS', value: active ? 'ACTIVE' : 'INACTIVE' },
      ],
      auxiliaryFields: active
        ? [{ key: 'until', label: 'VALID_UNTIL', value: membership!.membership.expiresAt.toISOString(), dateStyle: 'PKDateStyleMedium' }]
        : [],
      backFields: [
        { key: 'how', label: 'HOW', value: 'HOW_MEMBER' },
        { key: 'support', label: 'SUPPORT', value: 'SUPPORT_TEXT' },
      ],
    },
    barcodes: [{ format: 'PKBarcodeFormatQR', message: qr, messageEncoding: 'iso-8859-1', altText: user.memberNumber }],
    barcode: { format: 'PKBarcodeFormatQR', message: qr, messageEncoding: 'iso-8859-1', altText: user.memberNumber },
    ...(active ? { expirationDate: membership!.membership.expiresAt.toISOString() } : {}),
  };
}

/** A booking code: an event ticket (events) or a coupon (venues), shown on the lock screen near the venue. */
export function bookingPass(options: { booking: Booking; venue: Venue | null; lang: Lang }) {
  const { booking, venue, lang } = options;
  const qr = `sarena://redeem?code=${booking.code}`;
  const isEvent = Boolean(venue?.eventStartsAt);
  const fields = {
    primaryFields: [{ key: 'venue', label: 'VENUE', value: pick(booking.venueName, lang) }],
    secondaryFields: [
      { key: 'ticket', label: 'TICKET', value: pick(booking.offerTitle, lang) },
      { key: 'qty', label: 'QTY', value: booking.quantity },
    ],
    auxiliaryFields: [
      { key: 'code', label: 'CODE', value: booking.code },
      isEvent
        ? { key: 'starts', label: 'STARTS', value: venue!.eventStartsAt!.toISOString(), dateStyle: 'PKDateStyleMedium', timeStyle: 'PKDateStyleShort' }
        : { key: 'price', label: 'MEMBER_PRICE', value: omr(booking.paidTotalBaisa) },
    ],
    backFields: [
      { key: 'how', label: 'HOW', value: 'HOW_CODE' },
      { key: 'paid', label: 'MEMBER_PRICE', value: omr(booking.paidTotalBaisa) },
      { key: 'was', label: 'WAS', value: omr(booking.originalTotalBaisa) },
      { key: 'expires', label: 'EXPIRES', value: booking.expiresAt.toISOString(), dateStyle: 'PKDateStyleMedium' },
      { key: 'support', label: 'SUPPORT', value: 'SUPPORT_TEXT' },
    ],
  };
  return {
    serialNumber: `booking-${booking.id}`,
    description: pick(booking.venueName, lang),
    logoText: lang === 'ar' ? 'سرينا' : 'Sarena',
    ...(isEvent ? { eventTicket: fields } : { coupon: fields }),
    barcodes: [{ format: 'PKBarcodeFormatQR', message: qr, messageEncoding: 'iso-8859-1', altText: booking.code }],
    barcode: { format: 'PKBarcodeFormatQR', message: qr, messageEncoding: 'iso-8859-1', altText: booking.code },
    expirationDate: booking.expiresAt.toISOString(),
    voided: booking.status !== 'active',
    ...(isEvent ? { relevantDate: venue!.eventStartsAt!.toISOString() } : {}),
    ...(venue ? { locations: [{ latitude: venue.latitude, longitude: venue.longitude }] } : {}),
  };
}

// ---------------------------------------------------------------- membership QR

/**
 * The membership card's QR: `sarena://member?n=<member number>&s=<signature>`.
 * The signature (HMAC of the account id) stops anyone printing a card for a
 * number they guessed; the membership itself is always checked live.
 */
export function memberQr(secret: string, user: Pick<User, 'id' | 'memberNumber'>) {
  return `sarena://member?n=${encodeURIComponent(user.memberNumber)}&s=${memberSignature(secret, user.id)}`;
}

export function parseMemberQr(text: string): { memberNumber: string; signature: string } | null {
  const match = /sarena:\/\/member\?n=([^&\s]+)&s=([A-Za-z0-9_-]+)/.exec(text.trim());
  if (!match) return null;
  return { memberNumber: decodeURIComponent(match[1]!).toUpperCase(), signature: match[2]! };
}

export function checkMemberSignature(secret: string, userId: string, signature: string) {
  const expected = Buffer.from(memberSignature(secret, userId));
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

function memberSignature(secret: string, userId: string) {
  return createHmac('sha256', secret).update(`sarena-member:${userId}`).digest('base64url').slice(0, 22);
}
