// apps/api/src/jobs/purge-orphan-uploads.test.ts
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '../testing/db.js';
import { createUploadsStorage } from '../plugins/uploads-storage.js';
import { insertMediaAsset, linkMediaAssets } from '../repositories/media.js';
import { insertInquiry } from '../repositories/inquiries.js';
import { runPurgeOrphanUploadsJob } from './purge-orphan-uploads.js';

let ctx: TestDb;
const storage = createUploadsStorage(mkdtempSync(join(tmpdir(), 'purge-')));
beforeAll(async () => { ctx = await createTestDb(); });
afterEach(async () => {
    await ctx.db.deleteFrom('media_asset').execute();
    await ctx.db.deleteFrom('inquiry').execute();
    await ctx.db.deleteFrom('customer').execute();
});
afterAll(async () => { await ctx.destroy(); });

const writeAsset = async (over = {}) => {
    const key = storage.keyFor('jpg');
    await storage.write(key, Buffer.from('img'));
    return insertMediaAsset(ctx.db, {
        purpose: 'inquiry_reference', storageKey: key, contentType: 'image/jpeg',
        originalFilename: null, byteSize: 3, width: null, height: null, clientToken: 'tok', ...over,
    });
};

it('removes aged orphans (row + file), keeps fresh and linked assets', async () => {
    const old = await writeAsset();
    await ctx.db.updateTable('media_asset').set({ created_at: new Date('2020-01-01T00:00:00Z') }).where('id', '=', old.id).execute();
    const fresh = await writeAsset();

    const cid = (await ctx.db.insertInto('customer').values({ first_name: 'F', last_name: 'L', email: 'e@x.de', phone: '1' }).returning('id').executeTakeFirstOrThrow()).id;
    const inq = await insertInquiry(ctx.db, {
        serviceTypeId: 'small-tattoo', preferredArtistId: null, preferredStartsAt: null, sizeCm: null,
        description: '', customerId: cid, clientToken: 'tok', acceptedTermsAt: '2026-08-29T10:00:00Z',
    });
    const linked = await writeAsset();
    await ctx.db.updateTable('media_asset').set({ created_at: new Date('2020-01-01T00:00:00Z') }).where('id', '=', linked.id).execute();
    await linkMediaAssets(ctx.db, { ids: [linked.id], inquiryId: inq.id, clientToken: 'tok' });

    const { purged } = await runPurgeOrphanUploadsJob({ db: ctx.db, storage, ttlHours: 24 });
    expect(purged).toBe(1);
    expect(await storage.stat(old.storage_key)).toBeUndefined();
    expect(await storage.stat(fresh.storage_key)).toBeDefined();
    expect(await ctx.db.selectFrom('media_asset').select('id').where('id', '=', linked.id).executeTakeFirst()).toBeDefined();
});
