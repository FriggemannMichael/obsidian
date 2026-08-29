// apps/api/src/repositories/inquiries.test.ts
import { afterAll, afterEach, beforeAll, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '../testing/db.js';
import { getInquiryById, insertInquiry, insertInquiryRegions, listInquiries, transitionInquiry } from './inquiries.js';
import { insertMediaAsset, linkMediaAssets } from './media.js';

let ctx: TestDb;
beforeAll(async () => { ctx = await createTestDb(); });
afterEach(async () => {
    await ctx.db.deleteFrom('media_asset').execute();
    await ctx.db.deleteFrom('inquiry').execute();
    await ctx.db.deleteFrom('customer').execute();
});
afterAll(async () => { await ctx.destroy(); });

const seedCustomerId = async () =>
    (await ctx.db.insertInto('customer').values({ first_name: 'Ann', last_name: 'Roe', email: 'a@b.de', phone: '1' })
        .returning('id').executeTakeFirstOrThrow()).id;

const base = (customerId: string) => ({
    serviceTypeId: 'small-tattoo', preferredArtistId: 'mara' as string | null,
    preferredStartsAt: null, sizeCm: 12, description: 'florales Motiv', customerId,
    clientToken: 'tok', acceptedTermsAt: '2026-08-29T10:00:00Z',
});

it('creates an inquiry with regions and reads it back with images', async () => {
    const cid = await seedCustomerId();
    const inq = await insertInquiry(ctx.db, base(cid));
    expect(inq.status).toBe('NEW');
    await insertInquiryRegions(ctx.db, inq.id, ['front.upper_arm.left', 'front.forearm.left']);
    const img = await insertMediaAsset(ctx.db, {
        purpose: 'inquiry_reference', storageKey: '2026/08/a.jpg', contentType: 'image/jpeg',
        originalFilename: null, byteSize: 10, width: null, height: null, clientToken: 'tok',
    });
    await linkMediaAssets(ctx.db, { ids: [img.id], inquiryId: inq.id, clientToken: 'tok' });

    const back = await getInquiryById(ctx.db, inq.id);
    expect(back?.regions.sort()).toEqual(['front.forearm.left', 'front.upper_arm.left']);
    expect(back?.images).toHaveLength(1);
});

it('lists inquiries with counts and a status filter', async () => {
    const cid = await seedCustomerId();
    const a = await insertInquiry(ctx.db, base(cid));
    await insertInquiryRegions(ctx.db, a.id, ['front.chest']);
    const b = await insertInquiry(ctx.db, base(cid));
    await transitionInquiry(ctx.db, b.id, 'DECLINED', { declineReason: 'nein' });

    const all = await listInquiries(ctx.db, { limit: 50 });
    expect(all).toHaveLength(2);
    const declined = await listInquiries(ctx.db, { status: 'DECLINED', limit: 50 });
    expect(declined).toHaveLength(1);
    const listed = all.find((r) => r.id === a.id)!;
    expect(listed.regionCount).toBe(1);
    expect(listed.serviceTypeName).toBe('Kleines Tattoo');
    expect(listed.customerName).toBe('Ann Roe');
});
