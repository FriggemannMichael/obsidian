// apps/api/src/services/upload-service.ts
import sharp from 'sharp';
import type { Kysely } from 'kysely';
import type { Database } from '../database/types.js';
import type { UploadsStorage } from '../plugins/uploads-storage.js';
import { insertMediaAsset } from '../repositories/media.js';

const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']);
const HEIF = new Set(['image/heic', 'image/heif']);

export class UploadRejected extends Error {
    constructor(
        readonly code: 'UPLOAD_TOO_LARGE' | 'UPLOAD_TYPE_NOT_ALLOWED',
        message: string,
    ) {
        super(message);
        this.name = 'UploadRejected';
    }
}

export const heifSupported = (): boolean => Boolean(sharp.format.heif?.input?.buffer);

const extFor = (contentType: string): string =>
    contentType === 'image/jpeg' ? 'jpg' : contentType === 'image/png' ? 'png' : 'webp';

export const storeUpload = async (
    deps: { db: Kysely<Database>; storage: UploadsStorage; maxBytes: number },
    input: { clientToken: string; filename: string | null; declaredMime: string; data: Buffer },
): Promise<{
    id: string;
    storageKey: string;
    contentType: string;
    width: number | null;
    height: number | null;
    byteSize: number;
}> => {
    if (input.data.length > deps.maxBytes) {
        throw new UploadRejected('UPLOAD_TOO_LARGE', 'Bild überschreitet die zulässige Größe.');
    }
    if (!ALLOWED.has(input.declaredMime)) {
        throw new UploadRejected('UPLOAD_TYPE_NOT_ALLOWED', 'Dateityp nicht erlaubt.');
    }
    const isHeif = HEIF.has(input.declaredMime);
    if (isHeif && !heifSupported()) {
        throw new UploadRejected(
            'UPLOAD_TYPE_NOT_ALLOWED',
            'HEIC wird nicht unterstützt — bitte als JPEG hochladen.',
        );
    }

    const pipeline = sharp(input.data).rotate();
    const contentType = isHeif ? 'image/jpeg' : input.declaredMime;
    const out = isHeif ? await pipeline.jpeg({ quality: 82 }).toBuffer() : await pipeline.toBuffer();
    const meta = await sharp(out).metadata();

    const storageKey = deps.storage.keyFor(extFor(contentType));
    await deps.storage.write(storageKey, out);

    const row = await insertMediaAsset(deps.db, {
        purpose: 'inquiry_reference',
        storageKey,
        contentType,
        originalFilename: input.filename,
        byteSize: out.length,
        width: meta.width ?? null,
        height: meta.height ?? null,
        clientToken: input.clientToken,
    });

    return {
        id: row.id,
        storageKey,
        contentType,
        width: meta.width ?? null,
        height: meta.height ?? null,
        byteSize: out.length,
    };
};
