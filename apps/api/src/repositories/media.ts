// apps/api/src/repositories/media.ts
import type { Kysely, Selectable } from 'kysely';
import type { Database, MediaAssetTable } from '../database/types.js';

export type MediaAssetRow = Selectable<MediaAssetTable>;

export const insertMediaAsset = (
    exec: Kysely<Database>,
    a: {
        purpose: 'inquiry_reference';
        storageKey: string;
        contentType: string;
        originalFilename: string | null;
        byteSize: number;
        width: number | null;
        height: number | null;
        clientToken: string;
    },
): Promise<MediaAssetRow> =>
    exec
        .insertInto('media_asset')
        .values({
            purpose: a.purpose,
            inquiry_id: null,
            storage_key: a.storageKey,
            content_type: a.contentType,
            original_filename: a.originalFilename,
            byte_size: a.byteSize,
            width: a.width,
            height: a.height,
            client_token: a.clientToken,
        })
        .returningAll()
        .executeTakeFirstOrThrow();

export const getMediaAssetById = (exec: Kysely<Database>, id: string) =>
    exec.selectFrom('media_asset').selectAll().where('id', '=', id).executeTakeFirst();

export const linkMediaAssets = async (
    exec: Kysely<Database>,
    p: { ids: string[]; inquiryId: string; clientToken: string },
): Promise<string[]> => {
    if (p.ids.length === 0) return [];
    const rows = await exec
        .updateTable('media_asset')
        .set({ inquiry_id: p.inquiryId, linked_at: new Date() })
        .where('id', 'in', p.ids)
        .where('inquiry_id', 'is', null)
        .where('client_token', '=', p.clientToken)
        .returning('id')
        .execute();
    return rows.map((r) => r.id);
};

export const listOrphanMediaAssets = (exec: Kysely<Database>, olderThan: Date) =>
    exec
        .selectFrom('media_asset')
        .selectAll()
        .where('inquiry_id', 'is', null)
        .where('created_at', '<', olderThan)
        .execute();

export const deleteMediaAsset = async (exec: Kysely<Database>, id: string) => {
    await exec.deleteFrom('media_asset').where('id', '=', id).execute();
};
