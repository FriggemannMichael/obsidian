import { afterAll, afterEach, beforeAll, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '../testing/db.js';
import { upsertCustomer } from './customer.js';

let ctx: TestDb;
beforeAll(async () => { ctx = await createTestDb(); });
afterEach(async () => { await ctx.db.deleteFrom('customer').execute(); });
afterAll(async () => { await ctx.destroy(); });

it('returns the same id for the same chayns person', async () => {
    const a = await upsertCustomer(ctx.db, { chaynsPersonId: 'p1', firstName: 'A', lastName: 'B', email: 'a@b.de', phone: '123456' });
    const b = await upsertCustomer(ctx.db, { chaynsPersonId: 'p1', firstName: 'A', lastName: 'B', email: 'a@b.de', phone: '123456' });
    expect(a).toBe(b);
});

it('creates a fresh customer without a chayns person id', async () => {
    const a = await upsertCustomer(ctx.db, { firstName: 'A', lastName: 'B', email: 'a@b.de', phone: '1' });
    const b = await upsertCustomer(ctx.db, { firstName: 'C', lastName: 'D', email: 'c@d.de', phone: '2' });
    expect(a).not.toBe(b);
});
