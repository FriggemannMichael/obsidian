// apps/api/src/services/upload-service.test.ts
import sharp from 'sharp';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '../testing/db.js';
import { createUploadsStorage } from '../plugins/uploads-storage.js';
import { heifSupported, storeUpload, UploadRejected } from './upload-service.js';

let ctx: TestDb;
let storage = createUploadsStorage(mkdtempSync(join(tmpdir(), 'up-svc-')));
beforeAll(async () => {
    ctx = await createTestDb();
});
afterEach(async () => {
    await ctx.db.deleteFrom('media_asset').execute();
});
afterAll(async () => {
    await ctx.destroy();
});

const png = async () =>
    sharp({ create: { width: 20, height: 12, channels: 3, background: '#345' } }).png().toBuffer();
const heic = async () =>
    sharp({ create: { width: 24, height: 16, channels: 3, background: '#a1b2c3' } })
        .heif({ compression: 'av1' })
        .toBuffer();
const deps = () => ({ db: ctx.db, storage, maxBytes: 10_000 });

it('stores a png and records dimensions', async () => {
    const out = await storeUpload(deps(), {
        clientToken: 'tok',
        filename: 'a.png',
        declaredMime: 'image/png',
        data: await png(),
    });
    expect(out.contentType).toBe('image/png');
    expect(out).toMatchObject({ width: 20, height: 12 });
    const row = await ctx.db
        .selectFrom('media_asset')
        .selectAll()
        .where('id', '=', out.id)
        .executeTakeFirstOrThrow();
    expect(row.client_token).toBe('tok');
    expect((await storage.stat(row.storage_key))?.size).toBe(out.byteSize);
});

it('rejects an oversize file', async () => {
    await expect(
        storeUpload(
            { ...deps(), maxBytes: 10 },
            { clientToken: 't', filename: null, declaredMime: 'image/png', data: await png() },
        ),
    ).rejects.toMatchObject({ code: 'UPLOAD_TOO_LARGE' });
});

it('rejects a disallowed type', async () => {
    await expect(
        storeUpload(deps(), {
            clientToken: 't',
            filename: 'a.txt',
            declaredMime: 'text/plain',
            data: Buffer.from('x'),
        }),
    ).rejects.toBeInstanceOf(UploadRejected);
});

const heicIt = heifSupported() ? it : it.skip;
heicIt('converts a HEIC upload to jpeg and records a media_asset row', async () => {
    const out = await storeUpload(deps(), {
        clientToken: 'heic-tok',
        filename: 'photo.heic',
        declaredMime: 'image/heic',
        data: await heic(),
    });
    expect(out.contentType).toBe('image/jpeg');
    expect(out.storageKey).toMatch(/\.jpg$/);
    const row = await ctx.db
        .selectFrom('media_asset')
        .selectAll()
        .where('id', '=', out.id)
        .executeTakeFirstOrThrow();
    expect(row.content_type).toBe('image/jpeg');
    expect(row.client_token).toBe('heic-tok');
    expect((await storage.stat(row.storage_key))?.size).toBe(out.byteSize);
});
