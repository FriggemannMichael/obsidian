import { afterAll, afterEach, beforeAll, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '../testing/db.js';

let ctx: TestDb;
beforeAll(async () => { ctx = await createTestDb(); });
afterEach(async () => {
    await ctx.db.deleteFrom('media_asset').execute();
    await ctx.db.deleteFrom('inquiry').execute();
    await ctx.db.deleteFrom('customer').execute();
});
afterAll(async () => { await ctx.destroy(); });

const seedCustomer = () =>
    ctx.db.insertInto('customer')
        .values({ first_name: 'F', last_name: 'L', email: 'e@x.de', phone: '123456' })
        .returning('id').executeTakeFirstOrThrow();

it('dropped the legacy booking_request table', async () => {
    const { rows } = await ctx.db.executeQuery({
        sql: `SELECT to_regclass('public.booking_request') AS t`, parameters: [],
    } as never);
    expect((rows[0] as { t: string | null }).t).toBeNull();
});

it('cascades regions and media when an inquiry is deleted', async () => {
    const c = await seedCustomer();
    const inq = await ctx.db.insertInto('inquiry').values({
        service_type_id: 'small-tattoo', customer_id: c.id, status: 'NEW',
        client_token: 'tok', accepted_terms_at: '2026-08-29T10:00:00Z',
    }).returning('id').executeTakeFirstOrThrow();
    await ctx.db.insertInto('inquiry_region')
        .values({ inquiry_id: inq.id, region_code: 'front.upper_arm.left' }).execute();
    await ctx.db.insertInto('media_asset').values({
        purpose: 'inquiry_reference', inquiry_id: inq.id, storage_key: '2026/08/a.jpg',
        content_type: 'image/jpeg', byte_size: 10, client_token: 'tok',
    }).execute();

    await ctx.db.deleteFrom('inquiry').where('id', '=', inq.id).execute();

    expect(await ctx.db.selectFrom('inquiry_region').selectAll().execute()).toHaveLength(0);
    expect(await ctx.db.selectFrom('media_asset').selectAll().execute()).toHaveLength(0);
});

it('rejects an unknown status and a non-positive size', async () => {
    const c = await seedCustomer();
    await expect(
        ctx.db.insertInto('inquiry').values({
            service_type_id: 'small-tattoo', customer_id: c.id, status: 'BOGUS' as never,
            client_token: 't', accepted_terms_at: '2026-08-29T10:00:00Z',
        }).execute(),
    ).rejects.toThrow();
    await expect(
        ctx.db.insertInto('inquiry').values({
            service_type_id: 'small-tattoo', customer_id: c.id, status: 'NEW', size_cm: 0,
            client_token: 't', accepted_terms_at: '2026-08-29T10:00:00Z',
        }).execute(),
    ).rejects.toThrow();
});
