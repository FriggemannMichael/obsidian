import { afterAll, afterEach, beforeAll, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '../testing/db.js';
import { InquiryInvalidStateError } from '../domain/inquiry-status.js';
import {
    acceptInquiry, declineInquiry, getInquiryDetail, InquiryNotFoundError,
    listInquiriesForStudio, needsInfoInquiry,
} from './admin-inquiry-service.js';
import { insertInquiry, insertInquiryRegions } from '../repositories/inquiries.js';

let ctx: TestDb;
beforeAll(async () => { ctx = await createTestDb(); });
afterEach(async () => {
    await ctx.db.deleteFrom('inquiry').execute();
    await ctx.db.deleteFrom('customer').execute();
    await ctx.db.deleteFrom('outbox_event').execute();
    await ctx.db.deleteFrom('audit_event').execute();
});
afterAll(async () => { await ctx.destroy(); });

const seed = async () => {
    const cid = (await ctx.db.insertInto('customer').values({ first_name: 'Ann', last_name: 'Roe', email: 'a@b.de', phone: '1' }).returning('id').executeTakeFirstOrThrow()).id;
    const inq = await insertInquiry(ctx.db, {
        serviceTypeId: 'small-tattoo', preferredArtistId: null, preferredStartsAt: null, sizeCm: 10,
        description: 'x', customerId: cid, clientToken: 'tok', acceptedTermsAt: '2026-08-29T10:00:00Z',
    });
    await insertInquiryRegions(ctx.db, inq.id, ['front.chest']);
    return inq.id;
};

it('detail bumps NEW to IN_REVIEW', async () => {
    const id = await seed();
    const d = await getInquiryDetail(ctx.db, id);
    expect(d.status).toBe('IN_REVIEW');
    expect(d.bodyRegions).toEqual(['front.chest']);
    const audit = await ctx.db.selectFrom('audit_event').selectAll().where('action', '=', 'inquiry.reviewed').execute();
    expect(audit).toHaveLength(1);
});

it('accepts from IN_REVIEW and writes an outbox event', async () => {
    const id = await seed();
    await getInquiryDetail(ctx.db, id);
    await acceptInquiry(ctx.db, id, { studioNote: 'passt' });
    const row = await ctx.db.selectFrom('inquiry').selectAll().where('id', '=', id).executeTakeFirstOrThrow();
    expect(row.status).toBe('ACCEPTED');
    expect(row.studio_note).toBe('passt');
    expect(await ctx.db.selectFrom('outbox_event').selectAll().where('type', '=', 'inquiry.accepted').execute()).toHaveLength(1);
});

it('declines from NEW and needs-info from IN_REVIEW; rejects a bad transition', async () => {
    const id = await seed();
    await declineInquiry(ctx.db, id, 'Motiv passt nicht');
    const row = await ctx.db.selectFrom('inquiry').selectAll().where('id', '=', id).executeTakeFirstOrThrow();
    expect(row.status).toBe('DECLINED');
    await expect(acceptInquiry(ctx.db, id, {})).rejects.toBeInstanceOf(InquiryInvalidStateError);

    const id2 = await seed();
    await getInquiryDetail(ctx.db, id2);
    await needsInfoInquiry(ctx.db, id2, 'Bitte Referenzfoto nachreichen');
    expect((await ctx.db.selectFrom('inquiry').selectAll().where('id', '=', id2).executeTakeFirstOrThrow()).needs_info_message).toBe('Bitte Referenzfoto nachreichen');
});

it('throws for an unknown id', async () => {
    await expect(getInquiryDetail(ctx.db, '00000000-0000-0000-0000-000000000000')).rejects.toBeInstanceOf(InquiryNotFoundError);
});

it('lists items with counts', async () => {
    const id = await seed();
    const items = await listInquiriesForStudio(ctx.db, { limit: 50 });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ id, regionCount: 1, imageCount: 0, serviceTypeName: 'Kleines Tattoo', customerName: 'Ann Roe' });
});
