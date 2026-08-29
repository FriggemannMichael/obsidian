import { afterAll, afterEach, beforeAll, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '../testing/db.js';
import { runExpireHoldsJob } from './expire-holds.js';

let ctx: TestDb;
beforeAll(async () => {
    ctx = await createTestDb();
});
afterEach(async () => {
    await ctx.db.deleteFrom('appointment_block').execute();
    await ctx.db.deleteFrom('customer').execute();
    await ctx.db.deleteFrom('audit_event').execute();
    await ctx.db.deleteFrom('outbox_event').execute();
});
afterAll(async () => {
    await ctx.destroy();
});

// `day` variiert das (nicht überschneidende) Zeitfenster, damit mehrere
// HELD-Blöcke die GiST-Exclusion-Constraint nicht verletzen.
const insertHold = async (expiresAt: Date, day = '2026-09-01') => {
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
            starts_at: `${day}T08:00:00Z`,
            ends_at: `${day}T10:30:00Z`,
            session_starts_at: `${day}T08:15:00Z`,
            session_ends_at: `${day}T10:15:00Z`,
            status: 'HELD',
            expires_at: expiresAt,
            hold_client_token: 'tok',
            deposit_cents: 5000,
        })
        .returning('id')
        .executeTakeFirstOrThrow();
};

it('expires only past-due holds and emits audit + outbox rows', async () => {
    await insertHold(new Date(Date.now() - 60_000), '2026-09-01');
    await insertHold(new Date(Date.now() + 3_600_000), '2026-09-02');

    const { expired } = await runExpireHoldsJob(ctx.db);
    expect(expired).toBe(1);

    const statuses = (
        await ctx.db.selectFrom('appointment_block').select('status').execute()
    )
        .map((r) => r.status)
        .sort();
    expect(statuses).toEqual(['EXPIRED', 'HELD']);
    expect(
        await ctx.db
            .selectFrom('outbox_event')
            .select('type')
            .where('type', '=', 'slot_hold.expired')
            .execute(),
    ).toHaveLength(1);
    expect(
        await ctx.db
            .selectFrom('audit_event')
            .select('action')
            .where('action', '=', 'hold.expired')
            .execute(),
    ).toHaveLength(1);
});

it('is a no-op when nothing is due', async () => {
    await insertHold(new Date(Date.now() + 3_600_000));
    expect((await runExpireHoldsJob(ctx.db)).expired).toBe(0);
});
