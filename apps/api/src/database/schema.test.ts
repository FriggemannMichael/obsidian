import { afterAll, afterEach, beforeAll, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '../testing/db.js';

let ctx: TestDb;
beforeAll(async () => {
    ctx = await createTestDb();
});
afterEach(async () => {
    await ctx.truncateAll();
});
afterAll(async () => {
    await ctx.destroy();
});

const seedArtistResourceService = async (db: TestDb['db']) => {
    await db
        .insertInto('artist')
        .values({ id: 'a1', display_name: 'A1', bio: '', timezone: 'Europe/Berlin', active: true })
        .execute();
    await db
        .insertInto('resource')
        .values({ id: 'r1', name: 'R1', kind: 'station', active: true })
        .execute();
    await db
        .insertInto('service_type')
        .values({
            id: 's1',
            name: 'S1',
            description: '',
            duration_minutes: 60,
            pre_buffer_minutes: 0,
            post_buffer_minutes: 0,
            booking_mode: 'request',
            deposit_tier: 'NONE',
            deposit_cents: 0,
            active: true,
        })
        .execute();
    await db
        .insertInto('customer')
        .values({ first_name: 'F', last_name: 'L', email: 'e@x.de', phone: '123456' })
        .execute();
};

const block = (over: Record<string, unknown>) => ({
    artist_id: 'a1',
    resource_id: 'r1',
    service_type_id: 's1',
    starts_at: '2026-09-01T08:00:00Z',
    ends_at: '2026-09-01T10:00:00Z',
    session_starts_at: '2026-09-01T08:00:00Z',
    session_ends_at: '2026-09-01T10:00:00Z',
    status: 'HELD',
    deposit_cents: 0,
    ...over,
});

it('rejects overlapping HELD blocks for the same artist', async () => {
    await seedArtistResourceService(ctx.db);
    const c = await ctx.db.selectFrom('customer').select('id').executeTakeFirstOrThrow();
    await ctx.db.insertInto('appointment_block').values(block({ customer_id: c.id })).execute();
    await expect(
        ctx.db
            .insertInto('appointment_block')
            .values(
                block({
                    customer_id: c.id,
                    resource_id: 'r1',
                    starts_at: '2026-09-01T09:00:00Z',
                    ends_at: '2026-09-01T11:00:00Z',
                }),
            )
            .execute(),
    ).rejects.toThrow(/exclusion|overlap|23P01|conflicting key/i);
});

it('allows a block that starts exactly when the previous ends', async () => {
    await seedArtistResourceService(ctx.db);
    const c = await ctx.db.selectFrom('customer').select('id').executeTakeFirstOrThrow();
    await ctx.db.insertInto('appointment_block').values(block({ customer_id: c.id })).execute();
    await expect(
        ctx.db
            .insertInto('appointment_block')
            .values(
                block({
                    customer_id: c.id,
                    starts_at: '2026-09-01T10:00:00Z',
                    ends_at: '2026-09-01T12:00:00Z',
                    session_starts_at: '2026-09-01T10:00:00Z',
                    session_ends_at: '2026-09-01T12:00:00Z',
                }),
            )
            .execute(),
    ).resolves.not.toThrow();
});

it('ignores non-blocking status in the exclusion', async () => {
    await seedArtistResourceService(ctx.db);
    const c = await ctx.db.selectFrom('customer').select('id').executeTakeFirstOrThrow();
    await ctx.db
        .insertInto('appointment_block')
        .values(block({ customer_id: c.id, status: 'EXPIRED' }))
        .execute();
    await expect(
        ctx.db.insertInto('appointment_block').values(block({ customer_id: c.id })).execute(),
    ).resolves.not.toThrow();
});
