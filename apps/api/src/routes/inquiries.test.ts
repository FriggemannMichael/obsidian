import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '../testing/db.js';
import { buildApp } from '../app.js';
import type { AppConfig } from '../config.js';

const config: AppConfig = {
    gridMinutes: 60, minLeadHours: 12, holdTtlHours: 48, maxAvailabilityDays: 31, adminApiToken: 'secret',
    workerIntervalSeconds: 60, rateLimitMax: 1000, uploadsDir: mkdtempSync(join(tmpdir(), 'inq-')),
    maxUploadBytes: 200000, orphanUploadTtlHours: 24, uploadRateLimitMax: 1000, inquiryRateLimitMax: 1000,
};

let ctx: TestDb;
let app: ReturnType<typeof buildApp>;
beforeAll(async () => { ctx = await createTestDb(); app = buildApp({ db: ctx.db, config }); await app.ready(); });
afterEach(async () => {
    await ctx.db.deleteFrom('media_asset').execute();
    await ctx.db.deleteFrom('inquiry').execute();
    await ctx.db.deleteFrom('customer').execute();
    await ctx.db.deleteFrom('idempotency_key').execute();
    await ctx.db.deleteFrom('outbox_event').execute();
    await ctx.db.deleteFrom('audit_event').execute();
});
afterAll(async () => { await app.close(); await ctx.destroy(); });

const uploadOne = async (tok: string) => {
    const buf = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#123' } }).png().toBuffer();
    const b = '--x';
    const payload = Buffer.concat([
        Buffer.from(`--${b}\r\nContent-Disposition: form-data; name="file"; filename="a.png"\r\nContent-Type: image/png\r\n\r\n`),
        buf, Buffer.from(`\r\n--${b}--\r\n`),
    ]);
    const res = await app.inject({
        method: 'POST', url: '/v1/uploads', payload,
        headers: { 'content-type': `multipart/form-data; boundary=${b}`, 'x-client-token': tok },
    });
    return res.json().uploadId as string;
};

const body = (over = {}) => ({
    serviceTypeId: 'small-tattoo', bodyRegions: ['front.upper_arm.left'], sizeCm: 12,
    description: 'florales Motiv am Unterarm', customer: { firstName: 'Ann', lastName: 'Roe', email: 'a@b.de', phone: '+49 111 222' },
    acceptsTerms: true, ...over,
});

it('creates an inquiry with regions and links the uploaded image', async () => {
    const tok = randomUUID();
    const imgId = await uploadOne(tok);
    const res = await app.inject({
        method: 'POST', url: '/v1/inquiries',
        headers: { 'idempotency-key': randomUUID(), 'x-client-token': tok },
        payload: body({ referenceImageIds: [imgId] }),
    });
    expect(res.statusCode).toBe(201);
    const { inquiryId, status, reference } = res.json();
    expect(status).toBe('NEW');
    expect(reference).toHaveLength(8);
    const regions = await ctx.db.selectFrom('inquiry_region').selectAll().where('inquiry_id', '=', inquiryId).execute();
    expect(regions).toHaveLength(1);
    const img = await ctx.db.selectFrom('media_asset').selectAll().where('id', '=', imgId).executeTakeFirstOrThrow();
    expect(img.inquiry_id).toBe(inquiryId);
    const outbox = await ctx.db.selectFrom('outbox_event').selectAll().where('type', '=', 'inquiry.created').execute();
    expect(outbox).toHaveLength(1);
});

it('replays the same idempotency key', async () => {
    const tok = randomUUID();
    const key = randomUUID();
    const a = await app.inject({ method: 'POST', url: '/v1/inquiries', headers: { 'idempotency-key': key, 'x-client-token': tok }, payload: body() });
    const b = await app.inject({ method: 'POST', url: '/v1/inquiries', headers: { 'idempotency-key': key, 'x-client-token': tok }, payload: body() });
    expect(b.statusCode).toBe(201);
    expect(b.json().inquiryId).toBe(a.json().inquiryId);
    const count = await ctx.db.selectFrom('inquiry').select(ctx.db.fn.countAll().as('n')).executeTakeFirstOrThrow();
    expect(Number(count.n)).toBe(1);
});

it('400s on empty regions and missing headers, 404 on unknown service type', async () => {
    const tok = randomUUID();
    expect((await app.inject({ method: 'POST', url: '/v1/inquiries', headers: { 'idempotency-key': randomUUID(), 'x-client-token': tok }, payload: body({ bodyRegions: [] }) })).statusCode).toBe(400);
    expect((await app.inject({ method: 'POST', url: '/v1/inquiries', payload: body() })).statusCode).toBe(400);
    const r = await app.inject({ method: 'POST', url: '/v1/inquiries', headers: { 'idempotency-key': randomUUID(), 'x-client-token': tok }, payload: body({ serviceTypeId: 'nope' }) });
    expect(r.statusCode).toBe(404);
    expect(r.json().code).toBe('SERVICE_TYPE_NOT_FOUND');
});

it('ignores foreign reference image ids', async () => {
    const mine = randomUUID();
    const other = randomUUID();
    const foreignImg = await uploadOne(other);
    const res = await app.inject({
        method: 'POST', url: '/v1/inquiries',
        headers: { 'idempotency-key': randomUUID(), 'x-client-token': mine },
        payload: body({ referenceImageIds: [foreignImg] }),
    });
    expect(res.statusCode).toBe(201);
    const img = await ctx.db.selectFrom('media_asset').selectAll().where('id', '=', foreignImg).executeTakeFirstOrThrow();
    expect(img.inquiry_id).toBeNull();
});
