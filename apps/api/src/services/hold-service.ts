import { DateTime } from 'luxon';
import type { Kysely } from 'kysely';
import type { SlotHoldRequest } from '@tattoo-studio/contracts';
import type { AppConfig } from '../config.js';
import type { Database } from '../database/types.js';
import { getAvailability } from './availability-service.js';
import { applyBuffers } from '../domain/time.js';
import { getServiceType } from '../repositories/reference.js';
import {
    findIdempotencyRecord,
    hashRequestBody,
    saveIdempotencyRecord,
} from '../repositories/idempotency.js';
import { enqueueOutbox } from '../repositories/outbox.js';
import { recordAudit } from '../repositories/audit.js';
import { upsertCustomer } from '../repositories/customer.js';
import {
    HoldNotFoundError,
    SlotConflictError,
    expireStaleHolds,
    findFreeResourceId,
    insertHoldBlock,
    releaseHold,
} from '../repositories/holds.js';

class SlotUnavailable extends Error {
    constructor(
        readonly code: 'SLOT_CONFLICT' | 'SLOT_NO_LONGER_AVAILABLE',
        readonly humanMessage: string,
    ) {
        super(code);
    }
}

export const createHold = async (
    db: Kysely<Database>,
    config: AppConfig,
    input: { idempotencyKey: string; clientToken: string; body: SlotHoldRequest },
): Promise<{ statusCode: number; payload: unknown }> => {
    const requestHash = hashRequestBody(input.body);
    const route = 'POST /v1/slot-holds';
    const fromDate = DateTime.fromISO(new Date(input.body.startsAt).toISOString())
        .setZone('Europe/Berlin')
        .toISODate()!;
    try {
        return await db.transaction().execute(async (trx) => {
            const now = new Date();
            for (const exp of await expireStaleHolds(trx, now)) {
                await recordAudit(trx, {
                    actor: 'worker',
                    action: 'hold.expired',
                    entityType: 'appointment_block',
                    entityId: exp.id,
                });
                await enqueueOutbox(trx, {
                    type: 'slot_hold.expired',
                    payload: { holdId: exp.id, artistId: exp.artistId },
                });
            }

            const replay = await findIdempotencyRecord(trx, input.idempotencyKey);
            if (replay) {
                if (replay.requestHash !== requestHash) {
                    return {
                        statusCode: 409,
                        payload: {
                            code: 'IDEMPOTENCY_KEY_REUSED',
                            message: 'Idempotency-Key bereits mit anderem Inhalt verwendet.',
                        },
                    };
                }
                return { statusCode: replay.statusCode, payload: replay.responseJson };
            }

            const startIso = new Date(input.body.startsAt).toISOString();
            const availability = await getAvailability(trx, config, {
                serviceTypeId: input.body.serviceTypeId,
                artistId: input.body.artistId,
                from: fromDate,
                days: 1,
            });
            if (!availability.slots.some((s) => new Date(s.startsAt).toISOString() === startIso)) {
                throw new SlotUnavailable('SLOT_NO_LONGER_AVAILABLE', 'Der Slot ist nicht mehr verfügbar.');
            }

            const st = await getServiceType(trx, input.body.serviceTypeId);
            if (!st) throw new SlotUnavailable('SLOT_NO_LONGER_AVAILABLE', 'Der Slot ist nicht mehr verfügbar.');
            const sessionStart = new Date(startIso);
            const sessionEnd = new Date(sessionStart.getTime() + st.duration_minutes * 60_000);
            const { blockStart, blockEnd } = applyBuffers(
                sessionStart,
                sessionEnd,
                st.pre_buffer_minutes,
                st.post_buffer_minutes,
            );

            const kind = st.id === 'consultation' ? ('consult' as const) : ('station' as const);
            const resources = await trx
                .selectFrom('resource')
                .select('id')
                .where('kind', '=', kind)
                .where('active', '=', true)
                .execute();
            const resourceId = await findFreeResourceId(trx, {
                candidateResourceIds: resources.map((r) => r.id),
                blockStart,
                blockEnd,
            });
            if (!resourceId) {
                throw new SlotUnavailable('SLOT_CONFLICT', 'Kein freier Arbeitsplatz für diesen Slot.');
            }

            const customerId = await upsertCustomer(trx, {
                chaynsPersonId: input.body.chaynsPersonId,
                ...input.body.customer,
            });

            let block;
            try {
                block = await insertHoldBlock(trx, {
                    artistId: input.body.artistId,
                    resourceId,
                    serviceTypeId: st.id,
                    customerId,
                    sessionStart,
                    sessionEnd,
                    blockStart,
                    blockEnd,
                    depositCents: st.deposit_cents,
                    holdClientToken: input.clientToken,
                    idempotencyKey: input.idempotencyKey,
                    expiresAt: new Date(now.getTime() + config.holdTtlHours * 3_600_000),
                });
            } catch (e) {
                if (e instanceof SlotConflictError) {
                    throw new SlotUnavailable('SLOT_CONFLICT', 'Slot wurde soeben vergeben.');
                }
                throw e;
            }

            const payload = {
                holdId: block.id,
                status: 'HELD' as const,
                expiresAt: new Date(block.expires_at as Date).toISOString(),
                artistId: block.artist_id,
                startsAt: new Date(block.session_starts_at).toISOString(),
                endsAt: new Date(block.session_ends_at).toISOString(),
                depositCents: block.deposit_cents,
            };
            const actor = input.body.chaynsPersonId
                ? `chayns:${input.body.chaynsPersonId}`
                : `anon:${input.clientToken.slice(0, 8)}`;
            await recordAudit(trx, {
                actor,
                action: 'hold.created',
                entityType: 'appointment_block',
                entityId: block.id,
                after: payload,
            });
            await enqueueOutbox(trx, {
                type: 'slot_hold.created',
                payload: { ...payload, customer: input.body.customer },
            });
            await saveIdempotencyRecord(trx, {
                key: input.idempotencyKey,
                route,
                requestHash,
                responseJson: payload,
                statusCode: 201,
                ttlHours: 24,
            });

            return { statusCode: 201, payload };
        });
    } catch (e) {
        if (e instanceof SlotUnavailable) {
            const fresh = await getAvailability(db, config, {
                serviceTypeId: input.body.serviceTypeId,
                artistId: input.body.artistId,
                from: fromDate,
                days: 1,
            }).catch(() => ({ slots: [] as unknown[] }));
            return {
                statusCode: 409,
                payload: {
                    code: e.code,
                    message: e.humanMessage,
                    alternativeSlots: fresh.slots.slice(0, 10),
                },
            };
        }
        throw e;
    }
};

export const releaseHoldById = async (
    db: Kysely<Database>,
    input: { id: string; clientToken: string },
) => {
    await db.transaction().execute(async (trx) => {
        const released = await releaseHold(trx, input.id, input.clientToken); // wirft HoldNotFoundError
        await recordAudit(trx, {
            actor: `anon:${input.clientToken.slice(0, 8)}`,
            action: 'hold.released',
            entityType: 'appointment_block',
            entityId: released.id,
        });
        await enqueueOutbox(trx, { type: 'slot_hold.released', payload: { holdId: released.id } });
    });
};

export { HoldNotFoundError };
