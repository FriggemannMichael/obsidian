// apps/api/src/jobs/purge-orphan-uploads.ts
import type { Kysely } from 'kysely';
import type { Database } from '../database/types.js';
import type { UploadsStorage } from '../plugins/uploads-storage.js';
import { deleteMediaAsset, listOrphanMediaAssets } from '../repositories/media.js';

export const runPurgeOrphanUploadsJob = async (
    deps: { db: Kysely<Database>; storage: UploadsStorage; ttlHours: number },
    now: Date = new Date(),
): Promise<{ purged: number }> => {
    const cutoff = new Date(now.getTime() - deps.ttlHours * 3_600_000);
    const orphans = await listOrphanMediaAssets(deps.db, cutoff);
    for (const asset of orphans) {
        await deps.storage.remove(asset.storage_key);
        await deleteMediaAsset(deps.db, asset.id);
    }
    return { purged: orphans.length };
};
