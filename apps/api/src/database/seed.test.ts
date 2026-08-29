import { afterAll, beforeAll, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '../testing/db.js';

let ctx: TestDb;
beforeAll(async () => {
    ctx = await createTestDb();
});
afterAll(async () => {
    await ctx.destroy();
});

it('seeds reference data', async () => {
    const artists = await ctx.db.selectFrom('artist').selectAll().execute();
    const resources = await ctx.db.selectFrom('resource').selectAll().execute();
    const services = await ctx.db.selectFrom('service_type').selectAll().execute();
    const links = await ctx.db.selectFrom('artist_service').selectAll().execute();
    const rules = await ctx.db.selectFrom('availability_rule').selectAll().execute();
    const blocks = await ctx.db.selectFrom('blocked_period').selectAll().execute();

    expect(artists).toHaveLength(2);
    expect(resources).toHaveLength(3);
    expect(services.map((s) => s.id).sort()).toEqual(['consultation', 'day-session', 'small-tattoo']);
    expect(links).toHaveLength(6);
    expect(rules.length).toBeGreaterThanOrEqual(10); // 2 artists * 5 weekdays
    expect(blocks).toHaveLength(1);

    const small = services.find((s) => s.id === 'small-tattoo');
    expect(small).toMatchObject({
        duration_minutes: 120,
        pre_buffer_minutes: 15,
        deposit_tier: 'D50',
        deposit_cents: 5000,
    });
});
