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
    adminApiToken: 'secret-token',
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
    await ctx.db.deleteFrom('outbox_event').execute();
    await ctx.db.deleteFrom('audit_event').execute();
});
afterAll(async () => {
    await app.close();
    await ctx.destroy();
});

const seedHold = async () => {
    const c = await ctx.db
        .insertInto('customer')
        .values({ first_name: 'F', last_name: 'L', email: 'e@x.de', phone: '123456' })
        .returning('id')
        .executeTakeFirstOrThrow();
    return ctx.db
        .insertInto('appointment_block')
        .values({
            artist_id: 'mara',
            resource_id: 'station-1',
            service_type_id: 'small-tattoo',
            customer_id: c.id,
            starts_at: '2026-12-01T08:00:00Z',
            ends_at: '2026-12-01T10:30:00Z',
            session_starts_at: '2026-12-01T08:15:00Z',
            session_ends_at: '2026-12-01T10:15:00Z',
            status: 'HELD',
            expires_at: new Date(Date.now() + 3_600_000),
            hold_client_token: 'tok',
            deposit_cents: 5000,
        })
        .returning('id')
        .executeTakeFirstOrThrow();
};

it('rejects requests without the admin token', async () => {
    const { id } = await seedHold();
    const res = await app.inject({ method: 'POST', url: `/v1/admin/holds/${id}/confirm`, payload: {} });
    expect(res.statusCode).toBe(401);
    expect(res.json().code).toBe('UNAUTHORIZED');
});

it('confirms a hold and records an appointment + outbox event', async () => {
    const { id } = await seedHold();
    const res = await app.inject({
        method: 'POST',
        url: `/v1/admin/holds/${id}/confirm`,
        headers: { authorization: 'Bearer secret-token' },
        payload: {
            depositReceived: {
                amountCents: 5000,
                at: '2026-11-30T09:00:00.000Z',
                method: 'bank_transfer',
            },
        },
    });
    expect(res.statusCode).toBe(200);
    const block = await ctx.db
        .selectFrom('appointment_block')
        .selectAll()
        .where('id', '=', id)
        .executeTakeFirstOrThrow();
    expect(block.status).toBe('CONFIRMED');
    expect(block.expires_at).toBeNull();
    const appt = await ctx.db
        .selectFrom('appointment')
        .selectAll()
        .where('block_id', '=', id)
        .executeTakeFirstOrThrow();
    expect(appt.deposit_received_cents).toBe(5000);
    const outbox = await ctx.db
        .selectFrom('outbox_event')
        .selectAll()
        .where('type', '=', 'appointment.confirmed')
        .execute();
    expect(outbox).toHaveLength(1);
});

it('409s when confirming an already-cancelled hold', async () => {
    const { id } = await seedHold();
    await ctx.db
        .updateTable('appointment_block')
        .set({ status: 'CANCELLED' })
        .where('id', '=', id)
        .execute();
    const res = await app.inject({
        method: 'POST',
        url: `/v1/admin/holds/${id}/confirm`,
        headers: { authorization: 'Bearer secret-token' },
        payload: {},
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe('INVALID_STATE');
});

it('declines a hold with a reason', async () => {
    const { id } = await seedHold();
    const res = await app.inject({
        method: 'POST',
        url: `/v1/admin/holds/${id}/decline`,
        headers: { authorization: 'Bearer secret-token' },
        payload: { reason: 'Motiv passt nicht' },
    });
    expect(res.statusCode).toBe(200);
    const block = await ctx.db
        .selectFrom('appointment_block')
        .selectAll()
        .where('id', '=', id)
        .executeTakeFirstOrThrow();
    expect(block.status).toBe('CANCELLED');
    expect(block.decline_reason).toBe('Motiv passt nicht');
});

it('lists holds by status', async () => {
    await seedHold();
    const res = await app.inject({
        method: 'GET',
        url: '/v1/admin/holds?status=HELD&limit=10',
        headers: { authorization: 'Bearer secret-token' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toHaveLength(1);
});

it('404s on an unknown hold id', async () => {
    const res = await app.inject({
        method: 'POST',
        url: `/v1/admin/holds/${randomUUID()}/confirm`,
        headers: { authorization: 'Bearer secret-token' },
        payload: {},
    });
    expect(res.statusCode).toBe(404);
});
