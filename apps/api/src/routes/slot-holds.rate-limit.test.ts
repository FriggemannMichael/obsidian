import { afterAll, beforeAll, expect, it } from 'vitest';
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
    rateLimitMax: 3,
};

let ctx: TestDb;
let app: ReturnType<typeof buildApp>;
beforeAll(async () => {
    ctx = await createTestDb();
    app = buildApp({ db: ctx.db, config });
    await app.ready();
});
afterAll(async () => {
    await app.close();
    await ctx.destroy();
});

it('returns 429 after the configured number of requests per client token', async () => {
    const tok = randomUUID();
    const send = () =>
        app.inject({
            method: 'POST',
            url: '/v1/slot-holds',
            headers: { 'idempotency-key': randomUUID(), 'x-client-token': tok },
            payload: {
                serviceTypeId: 'small-tattoo',
                artistId: 'mara',
                startsAt: '2099-01-01T09:00:00.000Z',
                customer: { firstName: 'Ann', lastName: 'Roe', email: 'a@b.de', phone: '+49 111 222' },
            },
        });
    const codes: number[] = [];
    for (let i = 0; i < 5; i += 1) codes.push((await send()).statusCode);
    expect(codes.filter((c) => c === 429).length).toBeGreaterThanOrEqual(1);
    expect(codes.slice(0, 3).every((c) => c !== 429)).toBe(true);
});
