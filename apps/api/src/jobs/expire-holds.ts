import type { Kysely } from 'kysely';
import type { Database } from '../database/types.js';
import { expireStaleHolds } from '../repositories/holds.js';
import { recordAudit } from '../repositories/audit.js';
import { enqueueOutbox } from '../repositories/outbox.js';

export const runExpireHoldsJob = async (db: Kysely<Database>, now: Date = new Date()) =>
    db.transaction().execute(async (trx) => {
        const expired = await expireStaleHolds(trx, now);
        for (const e of expired) {
            await recordAudit(trx, {
                actor: 'worker',
                action: 'hold.expired',
                entityType: 'appointment_block',
                entityId: e.id,
                after: { status: 'EXPIRED' },
            });
            await enqueueOutbox(trx, {
                type: 'slot_hold.expired',
                payload: { holdId: e.id, artistId: e.artistId, resourceId: e.resourceId },
            });
        }
        return { expired: expired.length };
    });
