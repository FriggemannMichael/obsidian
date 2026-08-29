import sharp from 'sharp';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '../testing/db.js';
import { buildApp } from '../app.js';
import type { AppConfig } from '../config.js';

const config: AppConfig = {
    gridMinutes: 60, minLeadHours: 12, holdTtlHours: 48, maxAvailabilityDays: 31, adminApiToken: 'secret',
    workerIntervalSeconds: 60, rateLimitMax: 1000, uploadsDir: mkdtempSync(join(tmpdir(), 'up-route-')),
    maxUploadBytes: 4000, orphanUploadTtlHours: 24, uploadRateLimitMax: 1000, inquiryRateLimitMax: 1000,
};

let ctx: TestDb;
let app: ReturnType<typeof buildApp>;
beforeAll(async () => { ctx = await createTestDb(); app = buildApp({ db: ctx.db, config }); await app.ready(); });
afterAll(async () => { await app.close(); await ctx.destroy(); });

const pngBuf = () => sharp({ create: { width: 16, height: 16, channels: 3, background: '#abc' } }).png().toBuffer();

const multipart = (buf: Buffer, filename: string, type: string) => {
    const b = '----t';
    const head = `--${b}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${type}\r\n\r\n`;
    const tail = `\r\n--${b}--\r\n`;
    return {
        payload: Buffer.concat([Buffer.from(head), buf, Buffer.from(tail)]),
        headers: { 'content-type': `multipart/form-data; boundary=${b}` },
    };
};

it('rejects an upload without a client token', async () => {
    const { payload, headers } = multipart(await pngBuf(), 'a.png', 'image/png');
    const res = await app.inject({ method: 'POST', url: '/v1/uploads', payload, headers });
    expect(res.statusCode).toBe(400);
});

it('stores an image and serves it back only with the admin bearer', async () => {
    const { payload, headers } = multipart(await pngBuf(), 'a.png', 'image/png');
    const up = await app.inject({
        method: 'POST', url: '/v1/uploads',
        payload, headers: { ...headers, 'x-client-token': randomUUID() },
    });
    expect(up.statusCode).toBe(201);
    const { uploadId, url } = up.json();
    expect(url).toBe(`/v1/uploads/${uploadId}`);

    const noAuth = await app.inject({ method: 'GET', url });
    expect(noAuth.statusCode).toBe(404);

    const withAuth = await app.inject({ method: 'GET', url, headers: { authorization: 'Bearer secret' } });
    expect(withAuth.statusCode).toBe(200);
    expect(withAuth.headers['content-type']).toContain('image/png');
});

it('rejects a disallowed type and an oversize file', async () => {
    const bad = multipart(Buffer.from('hello'), 'a.txt', 'text/plain');
    const r1 = await app.inject({ method: 'POST', url: '/v1/uploads', payload: bad.payload, headers: { ...bad.headers, 'x-client-token': randomUUID() } });
    expect(r1.statusCode).toBe(400);
    expect(r1.json().code).toBe('UPLOAD_TYPE_NOT_ALLOWED');

    const bigPng = await sharp({
        create: { width: 400, height: 400, channels: 3, noise: { type: 'gaussian', mean: 128, sigma: 60 } },
    })
        .png()
        .toBuffer();
    const big = multipart(bigPng, 'big.png', 'image/png');
    const r2 = await app.inject({ method: 'POST', url: '/v1/uploads', payload: big.payload, headers: { ...big.headers, 'x-client-token': randomUUID() } });
    expect(r2.statusCode).toBe(400);
});

it('lists the seeded service types', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/service-types' });
    expect(res.statusCode).toBe(200);
    expect(res.json().items.map((i: { id: string }) => i.id).sort()).toEqual(['consultation', 'day-session', 'small-tattoo']);
});
