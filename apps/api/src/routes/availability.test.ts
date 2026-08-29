import { afterAll, afterEach, beforeAll, expect, it } from 'vitest';
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
    await ctx.db.deleteFrom('blocked_period').where('reason', '=', 'test').execute();
});
afterAll(async () => {
    await app.close();
    await ctx.destroy();
});

const near = () => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + 3);
    // roll forward to a weekday
    while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString().slice(0, 10);
};

it('returns slots for a service across all artists', async () => {
    const res = await app.inject({
        method: 'GET',
        url: `/v1/availability?serviceTypeId=small-tattoo&from=${near()}&days=1`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.timezone).toBe('Europe/Berlin');
    expect(body.slots.length).toBeGreaterThan(0);
    expect(new Set(body.slots.map((s: { artistId: string }) => s.artistId))).toEqual(
        new Set(['mara', 'jon']),
    );
});

it('filters by artistId', async () => {
    const res = await app.inject({
        method: 'GET',
        url: `/v1/availability?serviceTypeId=small-tattoo&artistId=mara&from=${near()}&days=1`,
    });
    const body = res.json();
    expect(body.slots.every((s: { artistId: string }) => s.artistId === 'mara')).toBe(true);
});

it('404s on an unknown service type', async () => {
    const res = await app.inject({
        method: 'GET',
        url: `/v1/availability?serviceTypeId=nope&from=${near()}&days=1`,
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().code).toBe('SERVICE_TYPE_NOT_FOUND');
});

it('400s on a bad query', async () => {
    const res = await app.inject({
        method: 'GET',
        url: `/v1/availability?serviceTypeId=small-tattoo&from=not-a-date`,
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('VALIDATION_ERROR');
});

it('drops slots covered by a blocked period', async () => {
    const day = near();
    await ctx.db
        .insertInto('blocked_period')
        .values({
            artist_id: 'mara',
            resource_id: null,
            starts_at: `${day}T00:00:00Z`,
            ends_at: `${day}T23:59:00Z`,
            reason: 'test',
        })
        .execute();
    const res = await app.inject({
        method: 'GET',
        url: `/v1/availability?serviceTypeId=small-tattoo&artistId=mara&from=${day}&days=1`,
    });
    expect(res.json().slots).toHaveLength(0);
});
