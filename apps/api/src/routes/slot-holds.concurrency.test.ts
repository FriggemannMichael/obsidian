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
    rateLimitMax: 100000,
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

it('lets exactly one of 20 concurrent holds win the same slot', async () => {
    // one artist, one station -> only one hold can succeed for a given start
    await ctx.db.deleteFrom('resource').where('id', '=', 'station-2').execute();

    const d = new Date();
    d.setUTCDate(d.getUTCDate() + 3);
    while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() + 1);
    const from = d.toISOString().slice(0, 10);
    const avail = await app.inject({
        method: 'GET',
        url: `/v1/availability?serviceTypeId=small-tattoo&artistId=mara&from=${from}&days=1`,
    });
    const slot = avail.json().slots[0] as { startsAt: string };

    const attempts = Array.from({ length: 20 }, () =>
        app.inject({
            method: 'POST',
            url: '/v1/slot-holds',
            headers: { 'idempotency-key': randomUUID(), 'x-client-token': randomUUID() },
            payload: {
                serviceTypeId: 'small-tattoo',
                artistId: 'mara',
                startsAt: slot.startsAt,
                customer: { firstName: 'Ann', lastName: 'Roe', email: 'a@b.de', phone: '+49 111 222' },
            },
        }),
    );
    const results = await Promise.all(attempts);
    const created = results.filter((r) => r.statusCode === 201);
    const conflicts = results.filter((r) => r.statusCode === 409);

    expect(created).toHaveLength(1);
    expect(conflicts).toHaveLength(19);

    const blocks = await ctx.db
        .selectFrom('appointment_block')
        .select(ctx.db.fn.countAll().as('n'))
        .where('status', '=', 'HELD')
        .executeTakeFirstOrThrow();
    expect(Number(blocks.n)).toBe(1);
});
