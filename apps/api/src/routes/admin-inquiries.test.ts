import { randomUUID } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '../testing/db.js';
import { buildApp } from '../app.js';
import type { AppConfig } from '../config.js';
import { insertInquiry, insertInquiryRegions } from '../repositories/inquiries.js';

const config: AppConfig = {
    gridMinutes: 60, minLeadHours: 12, holdTtlHours: 48, maxAvailabilityDays: 31, adminApiToken: 'secret',
    workerIntervalSeconds: 60, rateLimitMax: 1000, uploadsDir: mkdtempSync(join(tmpdir(), 'adm-inq-')),
    maxUploadBytes: 4000, orphanUploadTtlHours: 24, uploadRateLimitMax: 1000, inquiryRateLimitMax: 1000,
};

let ctx: TestDb;
let app: ReturnType<typeof buildApp>;
beforeAll(async () => { ctx = await createTestDb(); app = buildApp({ db: ctx.db, config }); await app.ready(); });
afterEach(async () => {
    await ctx.db.deleteFrom('inquiry').execute();
    await ctx.db.deleteFrom('customer').execute();
    await ctx.db.deleteFrom('outbox_event').execute();
    await ctx.db.deleteFrom('audit_event').execute();
});
afterAll(async () => { await app.close(); await ctx.destroy(); });

const bearer = { authorization: 'Bearer secret' };
const seed = async () => {
    const cid = (await ctx.db.insertInto('customer').values({ first_name: 'Ann', last_name: 'Roe', email: 'a@b.de', phone: '1' }).returning('id').executeTakeFirstOrThrow()).id;
    const inq = await insertInquiry(ctx.db, {
        serviceTypeId: 'small-tattoo', preferredArtistId: null, preferredStartsAt: null, sizeCm: 10,
        description: 'x', customerId: cid, clientToken: 't', acceptedTermsAt: '2026-08-29T10:00:00Z',
    });
    await insertInquiryRegions(ctx.db, inq.id, ['front.chest']);
    return inq.id;
};

it('401s without the admin token', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/admin/inquiries' });
    expect(res.statusCode).toBe(401);
});

it('lists, filters, shows detail and confirms', async () => {
    const id = await seed();
    const list = await app.inject({ method: 'GET', url: '/v1/admin/inquiries?status=NEW', headers: bearer });
    expect(list.statusCode).toBe(200);
    expect(list.json()).toHaveLength(1);

    const detail = await app.inject({ method: 'GET', url: `/v1/admin/inquiries/${id}`, headers: bearer });
    expect(detail.json().status).toBe('IN_REVIEW');
    expect(detail.json().bodyRegions).toEqual(['front.chest']);

    const accept = await app.inject({ method: 'POST', url: `/v1/admin/inquiries/${id}/accept`, headers: bearer, payload: { studioNote: 'ok' } });
    expect(accept.statusCode).toBe(200);

    const again = await app.inject({ method: 'POST', url: `/v1/admin/inquiries/${id}/decline`, headers: bearer, payload: { reason: 'x' } });
    expect(again.statusCode).toBe(409);
    expect(again.json().code).toBe('INVALID_STATE');
});

it('404s on an unknown id and 400s on a bad body', async () => {
    expect((await app.inject({ method: 'GET', url: `/v1/admin/inquiries/${randomUUID()}`, headers: bearer })).statusCode).toBe(404);
    const id = await seed();
    expect((await app.inject({ method: 'POST', url: `/v1/admin/inquiries/${id}/needs-info`, headers: bearer, payload: {} })).statusCode).toBe(400);
});
