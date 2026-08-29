import { afterAll, afterEach, beforeAll, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '../testing/db.js';
import {
    getActiveArtistsForService,
    getActiveResources,
    getAvailabilityRules,
    getBlockingBlocks,
    getServiceType,
} from './reference.js';

let ctx: TestDb;
beforeAll(async () => {
    ctx = await createTestDb();
});
afterEach(async () => {
    await ctx.db.deleteFrom('appointment_block').execute();
});
afterAll(async () => {
    await ctx.destroy();
});

it('reads a seeded service type', async () => {
    const st = await getServiceType(ctx.db, 'small-tattoo');
    expect(st).toMatchObject({ duration_minutes: 120, pre_buffer_minutes: 15 });
});

it('lists artists offering a service', async () => {
    const artists = await getActiveArtistsForService(ctx.db, 'small-tattoo');
    expect(artists.map((a) => a.id).sort()).toEqual(['jon', 'mara']);
});

it('lists station resources', async () => {
    const res = await getActiveResources(ctx.db, 'station');
    expect(res).toHaveLength(2);
});

it('reads availability rules for a window', async () => {
    const rules = await getAvailabilityRules(ctx.db, ['mara'], '2026-09-01', '2026-09-08');
    expect(rules.length).toBe(5);
});

it('reads only blocking-status blocks intersecting the window', async () => {
    const c = await ctx.db
        .insertInto('customer')
        .values({ first_name: 'F', last_name: 'L', email: 'e@x.de', phone: '123456' })
        .returning('id')
        .executeTakeFirstOrThrow();
    const common = {
        artist_id: 'mara',
        resource_id: 'station-1',
        service_type_id: 'small-tattoo',
        customer_id: c.id,
        session_starts_at: '2026-09-01T08:00:00Z',
        session_ends_at: '2026-09-01T10:00:00Z',
        deposit_cents: 0,
    };
    await ctx.db
        .insertInto('appointment_block')
        .values([
            {
                ...common,
                starts_at: '2026-09-01T08:00:00Z',
                ends_at: '2026-09-01T10:00:00Z',
                status: 'CONFIRMED',
            },
            {
                ...common,
                resource_id: 'station-2',
                starts_at: '2026-09-01T12:00:00Z',
                ends_at: '2026-09-01T14:00:00Z',
                status: 'EXPIRED',
            },
        ])
        .execute();

    const blocks = await getBlockingBlocks(
        ctx.db,
        ['mara'],
        new Date('2026-09-01T00:00:00Z'),
        new Date('2026-09-02T00:00:00Z'),
    );
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.resource_id).toBe('station-1');
});
