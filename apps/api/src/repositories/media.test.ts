// apps/api/src/repositories/media.test.ts
import { afterAll, afterEach, beforeAll, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '../testing/db.js';
import {
    deleteMediaAsset, getMediaAssetById, insertMediaAsset, linkMediaAssets, listOrphanMediaAssets,
} from './media.js';

let ctx: TestDb;
beforeAll(async () => { ctx = await createTestDb(); });
afterEach(async () => {
    await ctx.db.deleteFrom('media_asset').execute();
    await ctx.db.deleteFrom('inquiry').execute();
    await ctx.db.deleteFrom('customer').execute();
});
afterAll(async () => { await ctx.destroy(); });

const asset = (over = {}) => ({
    purpose: 'inquiry_reference' as const, storageKey: '2026/08/a.jpg', contentType: 'image/jpeg',
    originalFilename: 'a.jpg', byteSize: 100, width: 800, height: 600, clientToken: 'tok', ...over,
});

const seedInquiry = async () => {
    const c = await ctx.db.insertInto('customer')
        .values({ first_name: 'F', last_name: 'L', email: 'e@x.de', phone: '1' })
        .returning('id').executeTakeFirstOrThrow();
    return ctx.db.insertInto('inquiry').values({
        service_type_id: 'small-tattoo', customer_id: c.id, status: 'NEW',
        client_token: 'tok', accepted_terms_at: '2026-08-29T10:00:00Z',
    }).returning('id').executeTakeFirstOrThrow();
};

it('inserts and reads an asset', async () => {
    const row = await insertMediaAsset(ctx.db, asset());
    const back = await getMediaAssetById(ctx.db, row.id);
    expect(back?.storage_key).toBe('2026/08/a.jpg');
    expect(back?.inquiry_id).toBeNull();
});

it('links only unlinked assets owned by the client token', async () => {
    const mine = await insertMediaAsset(ctx.db, asset());
    const foreign = await insertMediaAsset(ctx.db, asset({ clientToken: 'other' }));
    const inq = await seedInquiry();
    const linked = await linkMediaAssets(ctx.db, { ids: [mine.id, foreign.id], inquiryId: inq.id, clientToken: 'tok' });
    expect(linked).toEqual([mine.id]);
    expect((await getMediaAssetById(ctx.db, mine.id))?.inquiry_id).toBe(inq.id);
    expect((await getMediaAssetById(ctx.db, foreign.id))?.inquiry_id).toBeNull();
});

it('lists and deletes orphans older than a cutoff', async () => {
    await insertMediaAsset(ctx.db, asset());
    await ctx.db.updateTable('media_asset').set({ created_at: new Date('2020-01-01T00:00:00Z') }).execute();
    const fresh = await insertMediaAsset(ctx.db, asset({ storageKey: '2026/08/b.jpg' }));
    const orphans = await listOrphanMediaAssets(ctx.db, new Date('2021-01-01T00:00:00Z'));
    expect(orphans).toHaveLength(1);
    await deleteMediaAsset(ctx.db, orphans[0]!.id);
    expect(await ctx.db.selectFrom('media_asset').selectAll().execute()).toHaveLength(1);
    expect((await getMediaAssetById(ctx.db, fresh.id))).toBeDefined();
});
