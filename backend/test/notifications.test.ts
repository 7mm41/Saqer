import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { apnsPayload } from '../src/lib/push.ts';
import { ADMIN, createTestApp, omanTime, type Json } from './support.ts';

let t: Awaited<ReturnType<typeof createTestApp>>;
let adminToken: string;
const text = (en: string, ar: string) => ({ en, ar });
const HOUR = 3_600_000;

before(async () => {
  t = await createTestApp();
  adminToken = await t.signIn(ADMIN.email, ADMIN.password);
});

after(async () => {
  await t.close();
});

async function memberWithDevice(token: string, options: { subscribe?: boolean; locale?: string } = {}) {
  const member = await t.register();
  const registered = await t.call('POST', '/v1/me/devices', {
    token: member.token, body: { token, platform: 'ios', locale: options.locale ?? 'ar-OM' },
  });
  assert.equal(registered.status, 200, JSON.stringify(registered.body));
  if (options.subscribe) {
    const plan = (await t.call('GET', '/v1/plans')).body.plans[0];
    await t.call('POST', '/v1/membership/subscribe', { token: member.token, body: { planId: plan.id } });
  }
  return member;
}

const deviceTokens = (index: number) => t.push.sent[index]!.devices.map((d) => d.token).sort();

describe('membership discount', () => {
  test('a running discount shows on the plan and is what members pay', async () => {
    const plan = (await t.call('GET', '/v1/admin/plans', { token: adminToken })).body.plans[0];
    const tooHigh = await t.call('PATCH', `/v1/admin/plans/${plan.id}`, { token: adminToken, body: { promoPriceBaisa: 15_000 } });
    assert.equal(tooHigh.status, 400);

    const endsAt = new Date(Date.now() + 5 * 86_400_000).toISOString();
    const updated = await t.call('PATCH', `/v1/admin/plans/${plan.id}`, {
      token: adminToken,
      body: { promoPriceBaisa: 12_000, promoLabel: text('National Day offer', 'عرض العيد الوطني'), promoStartsAt: null, promoEndsAt: endsAt },
    });
    assert.equal(updated.status, 200, JSON.stringify(updated.body));
    assert.equal(updated.body.plan.promoPriceBaisa, 12_000);

    const publicPlan = (await t.call('GET', '/v1/plans')).body.plans[0];
    assert.equal(publicPlan.priceBaisa, 15_000);
    assert.equal(publicPlan.promo.priceBaisa, 12_000);
    assert.equal(publicPlan.promo.label.ar, 'عرض العيد الوطني');

    const member = await t.register();
    await t.call('POST', '/v1/membership/subscribe', { token: member.token, body: { planId: plan.id } });
    const memberships = (await t.call('GET', '/v1/admin/memberships?status=active', { token: adminToken })).body.items;
    assert.equal(memberships.find((m: Json) => m.member.id === member.user.id).paidBaisa, 12_000);

    // The promo push goes out once, in waking hours.
    await t.app.notifier.tick(omanTime(10));
    await t.app.notifier.tick(omanTime(10, 5));
    assert.equal(t.push.titles().filter((title) => title.startsWith('National Day offer')).length, 1);
    const push = t.push.sent.find((s) => s.message.title.en.startsWith('National Day offer'))!;
    assert.match(push.message.body.en, /12 instead of .*15/);

    // Future discount: not shown yet.
    await t.call('PATCH', `/v1/admin/plans/${plan.id}`, {
      token: adminToken, body: { promoStartsAt: new Date(Date.now() + 86_400_000).toISOString(), promoEndsAt: endsAt },
    });
    assert.equal((await t.call('GET', '/v1/plans')).body.plans[0].promo, null);
    await t.call('PATCH', `/v1/admin/plans/${plan.id}`, { token: adminToken, body: { promoPriceBaisa: null } });
  });
});

describe('seasonal themes', () => {
  test('the active theme is served to the app and website', async () => {
    const empty = await t.call('GET', '/v1/app/config');
    assert.equal(empty.body.theme, null);

    const created = await t.call('POST', '/v1/admin/themes', {
      token: adminToken,
      body: {
        name: 'National Day 2026', logoUrl: 'https://sarena.test/uploads/nd.png', iconName: 'AppIcon-NationalDay',
        greeting: text('Happy National Day', 'عيد وطني سعيد'), accentColor: '#C8102E',
        startsAt: new Date(Date.now() - HOUR).toISOString(), endsAt: new Date(Date.now() + 3 * 86_400_000).toISOString(),
      },
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const config = await t.call('GET', '/v1/app/config');
    assert.equal(config.body.theme.iconName, 'AppIcon-NationalDay');
    assert.equal(config.body.theme.greeting.ar, 'عيد وطني سعيد');
    const cached = await t.call('GET', '/v1/app/config', { headers: { 'if-none-match': config.headers.etag as string } });
    assert.equal(cached.status, 304);

    const bad = await t.call('POST', '/v1/admin/themes', { token: adminToken, body: { name: 'Bad', accentColor: 'red' } });
    assert.equal(bad.status, 400);

    await t.call('PATCH', `/v1/admin/themes/${created.body.theme.id}`, { token: adminToken, body: { isEnabled: false } });
    assert.equal((await t.call('GET', '/v1/app/config')).body.theme, null);
    const list = await t.call('GET', '/v1/admin/themes', { token: adminToken });
    assert.equal(list.body.themes.length, 1);
    assert.deepEqual(list.body.icons, ['AppIcon-NationalDay', 'AppIcon-Ramadan', 'AppIcon-Eid']);
  });
});

describe('push notifications', () => {
  test('devices register and move to whoever signs in', async () => {
    const first = await memberWithDevice('a'.repeat(64));
    const second = await t.register();
    await t.call('POST', '/v1/me/devices', { token: second.token, body: { token: 'a'.repeat(64), platform: 'ios', locale: 'en-US' } });
    const devices = await t.app.notifier.devicesFor({ audience: 'user', userId: second.user.id });
    assert.equal(devices.length, 1);
    assert.equal(devices[0]!.locale, 'en');
    assert.equal((await t.app.notifier.devicesFor({ audience: 'user', userId: first.user.id })).length, 0);
    const removed = await t.call('DELETE', `/v1/me/devices/${'a'.repeat(64)}`, { token: second.token });
    assert.equal(removed.status, 200);
  });

  test('dashboard broadcasts reach the chosen audience', async () => {
    await memberWithDevice('m'.repeat(64), { subscribe: true });
    await memberWithDevice('n'.repeat(64));
    const members = await t.call('GET', '/v1/admin/notifications/audience?audience=members', { token: adminToken });
    assert.ok(members.body.devices >= 1);

    const sent = t.push.sent.length;
    const created = await t.call('POST', '/v1/admin/notifications', {
      token: adminToken,
      body: { title: text('Weekend deal', 'عرض نهاية الأسبوع'), body: text('Cinema for 2 OMR', 'السينما بريالين'), audience: 'non_members' },
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    await t.app.notifier.tick();
    assert.equal(t.push.sent.length, sent + 1);
    const tokens = deviceTokens(sent);
    assert.ok(tokens.includes('n'.repeat(64)));
    assert.ok(!tokens.includes('m'.repeat(64)));

    const history = await t.call('GET', '/v1/admin/notifications', { token: adminToken });
    const item = history.body.items.find((n: Json) => n.id === created.body.notification.id);
    assert.equal(item.status, 'sent');
    assert.equal(item.recipients, tokens.length);

    // Scheduled for later, then cancelled.
    const later = await t.call('POST', '/v1/admin/notifications', {
      token: adminToken,
      body: { title: text('Later', 'لاحقاً'), body: text('b', 'ب'), audience: 'all', scheduledFor: new Date(Date.now() + 86_400_000).toISOString() },
    });
    await t.app.notifier.tick();
    assert.ok(!t.push.titles().includes('Later'));
    const cancelled = await t.call('POST', `/v1/admin/notifications/${later.body.notification.id}/cancel`, { token: adminToken });
    assert.equal(cancelled.body.notification.status, 'cancelled');
  });

  test('new events are announced automatically after a short delay, unless unpublished', async () => {
    await memberWithDevice('e'.repeat(64));
    const venue = await t.call('POST', '/v1/admin/venues', {
      token: adminToken,
      body: {
        slug: 'ibri-camel-race', category: 'festivals',
        name: text('Ibri Camel Race', 'سباق الهجن في عبري'), area: text('Ibri', 'عبري'),
        summary: text('Race day with member seats.', 'يوم السباق بمقاعد للأعضاء.'),
        about: text('About', 'نبذة'), openingHours: text('All day', 'طوال اليوم'),
        latitude: 23.2, longitude: 56.5, eventStartsAt: omanTime(18, 0, 3).toISOString(),
      },
    });
    assert.equal(venue.status, 201, JSON.stringify(venue.body));
    const queued = (await t.call('GET', '/v1/admin/notifications?kind=new_event', { token: adminToken })).body.items;
    assert.equal(queued[0].status, 'scheduled');

    await t.app.notifier.tick(new Date(Date.parse(queued[0].scheduledFor) - 60_000));
    assert.ok(!t.push.titles().includes('New event: Ibri Camel Race'));
    await t.app.notifier.tick(new Date(Date.parse(queued[0].scheduledFor) + 1_000));
    assert.equal(t.push.titles().filter((title) => title === 'New event: Ibri Camel Race').length, 1);
    const push = t.push.sent.find((s) => s.message.title.en === 'New event: Ibri Camel Race')!;
    assert.equal(push.message.data?.venueId, venue.body.venue.id);

    // A draft published and unpublished before the push goes out is not announced.
    const draft = await t.call('POST', '/v1/admin/venues', {
      token: adminToken,
      body: {
        slug: 'draft-event', category: 'festivals', name: text('Draft', 'مسودة'), area: text('A', 'أ'),
        summary: text('S', 'ص'), about: text('A', 'أ'), openingHours: text('H', 'س'), latitude: 23, longitude: 58,
      },
    });
    await t.call('PATCH', `/v1/admin/venues/${draft.body.venue.id}`, { token: adminToken, body: { isPublished: false } });
    await t.app.notifier.tick(new Date(Date.now() + 2 * 86_400_000));
    assert.ok(!t.push.titles().includes('New on Sarena: Draft'));
    const cancelled = (await t.call('GET', '/v1/admin/notifications?status=cancelled', { token: adminToken })).body.items;
    assert.ok(cancelled.some((n: Json) => n.title.en === 'New on Sarena: Draft'));

    // History search: by title in either language, and automatic vs written.
    const byArabic = (await t.call('GET', `/v1/admin/notifications?q=${encodeURIComponent('الهجن')}`, { token: adminToken })).body;
    assert.equal(byArabic.total, 1);
    assert.equal(byArabic.items[0].title.en, 'New event: Ibri Camel Race');
    const automatic = (await t.call('GET', '/v1/admin/notifications?origin=automatic&q=camel', { token: adminToken })).body;
    assert.equal(automatic.total, 1);
    const written = (await t.call('GET', '/v1/admin/notifications?origin=written&q=camel', { token: adminToken })).body;
    assert.equal(written.total, 0);
  });

  test('"starts today" goes out on the event morning, once', async () => {
    await memberWithDevice('d'.repeat(64));
    await t.call('POST', '/v1/admin/venues', {
      token: adminToken,
      body: {
        slug: 'muscat-fireworks', category: 'festivals', name: text('Muscat Fireworks', 'ألعاب مسقط النارية'),
        area: text('Muscat', 'مسقط'), summary: text('S', 'ص'), about: text('A', 'أ'), openingHours: text('H', 'س'),
        latitude: 23.6, longitude: 58.5, eventStartsAt: omanTime(20).toISOString(),
      },
    });
    await t.app.notifier.tick(omanTime(7));
    assert.ok(!t.push.titles().includes('Muscat Fireworks starts today 🎉'));
    await t.app.notifier.tick(omanTime(8, 1));
    await t.app.notifier.tick(omanTime(9));
    assert.equal(t.push.titles().filter((title) => title === 'Muscat Fireworks starts today 🎉').length, 1);
    const push = t.push.sent.find((s) => s.message.title.en === 'Muscat Fireworks starts today 🎉')!;
    assert.match(push.message.body.ar, /تبدأ الساعة/);
  });

  test('members hear about their membership ending, unless they renewed', async () => {
    const ending = await memberWithDevice('x'.repeat(64));
    const renewed = await memberWithDevice('y'.repeat(64));
    const plan = (await t.call('GET', '/v1/admin/plans', { token: adminToken })).body.plans[0];
    await t.call('POST', `/v1/admin/members/${ending.user.id}/memberships`, { token: adminToken, body: { planId: plan.id, days: 3 } });
    await t.call('POST', `/v1/admin/members/${renewed.user.id}/memberships`, { token: adminToken, body: { planId: plan.id, days: 3 } });
    await t.call('POST', `/v1/admin/members/${renewed.user.id}/memberships`, { token: adminToken, body: { planId: plan.id } });

    const before = t.push.sent.length;
    await t.app.notifier.tick(omanTime(11));
    const expiring = t.push.sent.slice(before).filter((s) => s.message.title.en === 'Your membership ends soon');
    assert.equal(expiring.length, 1);
    assert.deepEqual(expiring[0]!.devices.map((d) => d.token), ['x'.repeat(64)]);
  });

  test('invalid tokens are removed after APNs rejects them', async () => {
    const member = await memberWithDevice('z'.repeat(64));
    t.push.invalid.add('z'.repeat(64));
    await t.call('POST', '/v1/admin/notifications', {
      token: adminToken, body: { title: text('Hi', 'مرحبا'), body: text('b', 'ب'), audience: 'user', userId: member.user.id },
    });
    await t.app.notifier.tick();
    assert.equal((await t.app.notifier.devicesFor({ audience: 'user', userId: member.user.id })).length, 0);
  });

  test('automatic pushes wait for the morning', () => {
    const settings = { morningHour: 8 };
    assert.deepEqual(t.app.notifier.withinWakingHours(omanTime(23, 30), settings), omanTime(8, 0, 1));
    assert.deepEqual(t.app.notifier.withinWakingHours(omanTime(3), settings), omanTime(8));
    assert.deepEqual(t.app.notifier.withinWakingHours(omanTime(12), settings), omanTime(12));
  });

  test('APNs payload is in the device language', () => {
    const payload = apnsPayload({ title: text('Hello', 'مرحبا'), body: text('Body', 'نص'), data: { venueId: 'v1' } }, 'ar');
    assert.deepEqual(payload, { aps: { alert: { title: 'مرحبا', body: 'نص' }, sound: 'default' }, venueId: 'v1' });
  });

  test('notification settings drive the app reminders', async () => {
    const updated = await t.call('PATCH', '/v1/admin/settings/notifications', {
      token: adminToken, body: { reminderHoursBefore: 6, morningHour: 9 },
    });
    assert.equal(updated.body.settings.reminderHoursBefore, 6);
    const config = await t.call('GET', '/v1/app/config');
    assert.deepEqual(config.body.reminders, { morningHour: 9, hoursBefore: 6, finalReminderMinutes: 60 });
    const invalid = await t.call('PATCH', '/v1/admin/settings/notifications', { token: adminToken, body: { morningHour: 2 } });
    assert.equal(invalid.status, 400);
    await t.call('PATCH', '/v1/admin/settings/notifications', { token: adminToken, body: { reminderHoursBefore: 5, morningHour: 8 } });
  });

  test('booked event codes carry the event start for on-phone reminders', async () => {
    const member = await t.register();
    const plan = (await t.call('GET', '/v1/plans')).body.plans[0];
    await t.call('POST', '/v1/membership/subscribe', { token: member.token, body: { planId: plan.id } });
    const venues = (await t.call('GET', '/v1/venues', { token: member.token })).body.venues;
    const event = venues.find((v: Json) => v.eventStartsAt && v.offers.length);
    assert.ok(event, 'an event with tickets');
    const booked = await t.call('POST', '/v1/bookings', { token: member.token, body: { offerId: event.offers[0].id, quantity: 1 } });
    assert.equal(booked.body.booking.eventStartsAt, event.eventStartsAt);
    const mine = await t.call('GET', '/v1/me/bookings', { token: member.token });
    assert.equal(mine.body.bookings[0].eventStartsAt, event.eventStartsAt);
  });
});
