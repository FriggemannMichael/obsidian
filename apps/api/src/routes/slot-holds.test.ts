import { afterAll, afterEach, beforeAll, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createTestDb, type TestDb } from '../testing/db.js';
import { buildApp } from '../app.js';
import type { AppConfig } from '../config.js';

const config: AppConfig = {
    gridMinutes: 60,
    minLeadHours: 12,
    holdTtlHours: 48,
    maxAvailabilityDays: 31,
    adminApiToken: 'test',
    workerIntervalSeconds: 60,
    rateLimitMax: 1000,
};

let ctx: TestDb;
let app: ReturnType<typeof buildApp>;
beforeAll(async () => {
    ctx = await createTestDb();
    app = buildApp({ db: ctx.db, config });
    await app.ready();
});
afterEach(async () => {
    await ctx.db.deleteFrom('appointment').execute();
    await ctx.db.deleteFrom('appointment_block').execute();
    await ctx.db.deleteFrom('customer').execute();
    await ctx.db.deleteFrom('idempotency_key').execute();
    await ctx.db.deleteFrom('outbox_event').execute();
    await ctx.db.deleteFrom('audit_event').execute();
});
afterAll(async () => {
    await app.close();
    await ctx.destroy();
});

const firstSlot = async () => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + 3);
    while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() + 1);
    const from = d.toISOString().slice(0, 10);
    const res = await app.inject({
        method: 'GET',
        url: `/v1/availability?serviceTypeId=small-tattoo&artistId=mara&from=${from}&days=1`,
    });
    return res.json().slots[0] as { startsAt: string };
};

const body = (startsAt: string) => ({
    serviceTypeId: 'small-tattoo',
    artistId: 'mara',
    startsAt,
    customer: { firstName: 'Ann', lastName: 'Roe', email: 'a@b.de', phone: '+49 111 222' },
});

it('creates a hold (201)', async () => {
    const slot = await firstSlot();
    const res = await app.inject({
        method: 'POST',
        url: '/v1/slot-holds',
        headers: { 'idempotency-key': randomUUID(), 'x-client-token': randomUUID() },
        payload: body(slot.startsAt),
    });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ status: 'HELD', artistId: 'mara', depositCents: 5000 });
});

it('replays the same idempotency key', async () => {
    const slot = await firstSlot();
    const key = randomUUID();
    const tok = randomUUID();
    const a = await app.inject({
        method: 'POST',
        url: '/v1/slot-holds',
        headers: { 'idempotency-key': key, 'x-client-token': tok },
        payload: body(slot.startsAt),
    });
    const b = await app.inject({
        method: 'POST',
        url: '/v1/slot-holds',
        headers: { 'idempotency-key': key, 'x-client-token': tok },
        payload: body(slot.startsAt),
    });
    expect(b.statusCode).toBe(201);
    expect(b.json().holdId).toBe(a.json().holdId);
    const count = await ctx.db
        .selectFrom('appointment_block')
        .select(ctx.db.fn.countAll().as('n'))
        .executeTakeFirstOrThrow();
    expect(Number(count.n)).toBe(1);
});

it('rejects a reused key with a different body (409)', async () => {
    const slot = await firstSlot();
    const key = randomUUID();
    await app.inject({
        method: 'POST',
        url: '/v1/slot-holds',
        headers: { 'idempotency-key': key, 'x-client-token': randomUUID() },
        payload: body(slot.startsAt),
    });
    const res = await app.inject({
        method: 'POST',
        url: '/v1/slot-holds',
        headers: { 'idempotency-key': key, 'x-client-token': randomUUID() },
        payload: { ...body(slot.startsAt), artistId: 'jon' },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe('IDEMPOTENCY_KEY_REUSED');
});

it('409s when the slot is already held, with alternatives', async () => {
    const slot = await firstSlot();
    await app.inject({
        method: 'POST',
        url: '/v1/slot-holds',
        headers: { 'idempotency-key': randomUUID(), 'x-client-token': randomUUID() },
        payload: body(slot.startsAt),
    });
    // second station still free -> force conflict by also taking station-2 via a blocked period
    await ctx.db
        .insertInto('blocked_period')
        .values({
            artist_id: null,
            resource_id: 'station-2',
            starts_at: slot.startsAt,
            ends_at: new Date(new Date(slot.startsAt).getTime() + 6 * 3600_000),
            reason: 'test',
        })
        .execute();
    const res = await app.inject({
        method: 'POST',
        url: '/v1/slot-holds',
        headers: { 'idempotency-key': randomUUID(), 'x-client-token': randomUUID() },
        payload: body(slot.startsAt),
    });
    expect(res.statusCode).toBe(409);
    expect(['SLOT_CONFLICT', 'SLOT_NO_LONGER_AVAILABLE']).toContain(res.json().code);
    await ctx.db.deleteFrom('blocked_period').where('reason', '=', 'test').execute();
});

it('deletes a hold with the owning token', async () => {
    const slot = await firstSlot();
    const tok = randomUUID();
    const created = await app.inject({
        method: 'POST',
        url: '/v1/slot-holds',
        headers: { 'idempotency-key': randomUUID(), 'x-client-token': tok },
        payload: body(slot.startsAt),
    });
    const id = created.json().holdId;
    const wrong = await app.inject({
        method: 'DELETE',
        url: `/v1/slot-holds/${id}`,
        headers: { 'x-client-token': randomUUID() },
    });
    expect(wrong.statusCode).toBe(404);
    const ok = await app.inject({
        method: 'DELETE',
        url: `/v1/slot-holds/${id}`,
        headers: { 'x-client-token': tok },
    });
    expect(ok.statusCode).toBe(204);
});

it('400s without the required headers', async () => {
    const slot = await firstSlot();
    const res = await app.inject({ method: 'POST', url: '/v1/slot-holds', payload: body(slot.startsAt) });
    expect(res.statusCode).toBe(400);
});
