import { afterAll, beforeAll, expect, it } from 'vitest';
import { createTestDb, type TestDb } from './db.js';

let ctx: TestDb;
beforeAll(async () => {
    ctx = await createTestDb();
});
afterAll(async () => {
    await ctx.destroy();
});

it('provides a migrated database', async () => {
    const { rows } = await ctx.db.executeQuery({
        sql: `SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = 'public'`,
        parameters: [],
    } as never);
    expect((rows[0] as { n: number }).n).toBeGreaterThan(5);
});

it('truncateAll clears data tables', async () => {
    await ctx.db
        .insertInto('artist')
        .values({
            id: 'x',
            display_name: 'X',
            bio: '',
            timezone: 'Europe/Berlin',
            active: true,
        })
        .execute();
    await ctx.truncateAll();
    const after = await ctx.db.selectFrom('artist').selectAll().execute();
    expect(after).toHaveLength(0);
});
