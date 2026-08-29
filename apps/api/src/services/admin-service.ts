import type { Kysely } from 'kysely';
import type { HoldConfirmRequest } from '@tattoo-studio/contracts';
import type { BlockStatus, Database } from '../database/types.js';
import { confirmHoldBlock, declineHoldBlock } from '../repositories/holds.js';
import { recordAudit } from '../repositories/audit.js';
import { enqueueOutbox } from '../repositories/outbox.js';

export const confirmHold = async (
    db: Kysely<Database>,
    id: string,
    deposit?: HoldConfirmRequest['depositReceived'],
) =>
    db.transaction().execute(async (trx) => {
        const { appointmentId } = await confirmHoldBlock(trx, id, deposit);
        await recordAudit(trx, {
            actor: 'studio',
            action: 'appointment.confirmed',
            entityType: 'appointment_block',
            entityId: id,
            after: { status: 'CONFIRMED', appointmentId },
        });
        await enqueueOutbox(trx, {
            type: 'appointment.confirmed',
            payload: { blockId: id, appointmentId },
        });
        return { appointmentId, blockId: id };
    });

export const declineHold = async (db: Kysely<Database>, id: string, reason: string) =>
    db.transaction().execute(async (trx) => {
        await declineHoldBlock(trx, id, reason);
        await recordAudit(trx, {
            actor: 'studio',
            action: 'appointment.declined',
            entityType: 'appointment_block',
            entityId: id,
            after: { status: 'CANCELLED', reason },
        });
        await enqueueOutbox(trx, {
            type: 'appointment.declined',
            payload: { blockId: id, reason },
        });
    });

export const listHolds = async (db: Kysely<Database>, q: { status?: string; limit: number }) => {
    let query = db
        .selectFrom('appointment_block as b')
        .innerJoin('customer as c', 'c.id', 'b.customer_id')
        .select([
            'b.id as id',
            'b.artist_id as artistId',
            'b.service_type_id as serviceTypeId',
            'b.session_starts_at as sessionStartsAt',
            'b.status as status',
            'b.expires_at as expiresAt',
            'c.first_name as firstName',
            'c.last_name as lastName',
        ])
        .orderBy('b.created_at', 'desc')
        .limit(q.limit);
    if (q.status) query = query.where('b.status', '=', q.status as BlockStatus);
    const rows = await query.execute();
    return rows.map((r) => ({
        id: r.id,
        artistId: r.artistId,
        serviceTypeId: r.serviceTypeId,
        sessionStartsAt: new Date(r.sessionStartsAt).toISOString(),
        status: r.status,
        expiresAt: r.expiresAt ? new Date(r.expiresAt).toISOString() : null,
        customerName: `${r.firstName} ${r.lastName}`,
    }));
};
