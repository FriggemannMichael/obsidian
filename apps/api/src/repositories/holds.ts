import type { Kysely, Selectable } from 'kysely';
import type { AppointmentBlockTable, BlockStatus, Database } from '../database/types.js';
import { InvalidStateError } from '../domain/status.js';

export type HoldBlockRow = Selectable<AppointmentBlockTable>;

export class SlotConflictError extends Error {
    constructor() {
        super('Slot conflict');
        this.name = 'SlotConflictError';
    }
}

export class HoldNotFoundError extends Error {
    constructor() {
        super('Hold not found');
        this.name = 'HoldNotFoundError';
    }
}

const BLOCKING_STATUSES = [
    'HELD',
    'PAYMENT_PENDING',
    'CONFIRMED',
] as const satisfies readonly BlockStatus[];

const isExclusionViolation = (e: unknown): boolean =>
    typeof e === 'object' && e !== null && (e as { code?: string }).code === '23P01';

export type InsertHold = {
    artistId: string;
    resourceId: string;
    serviceTypeId: string;
    customerId: string;
    sessionStart: Date;
    sessionEnd: Date;
    blockStart: Date;
    blockEnd: Date;
    depositCents: number;
    holdClientToken: string;
    idempotencyKey: string;
    expiresAt: Date;
};

export const upsertCustomer = async (
    trx: Kysely<Database>,
    c: {
        chaynsPersonId?: string;
        firstName: string;
        lastName: string;
        email: string;
        phone: string;
    },
): Promise<string> => {
    if (c.chaynsPersonId) {
        const existing = await trx
            .selectFrom('customer')
            .select('id')
            .where('chayns_person_id', '=', c.chaynsPersonId)
            .executeTakeFirst();
        if (existing) return existing.id;
    }
    const row = await trx
        .insertInto('customer')
        .values({
            chayns_person_id: c.chaynsPersonId ?? null,
            first_name: c.firstName,
            last_name: c.lastName,
            email: c.email,
            phone: c.phone,
        })
        .returning('id')
        .executeTakeFirstOrThrow();
    return row.id;
};

export const findFreeResourceId = async (
    trx: Kysely<Database>,
    p: { candidateResourceIds: string[]; blockStart: Date; blockEnd: Date },
): Promise<string | undefined> => {
    for (const id of [...p.candidateResourceIds].sort()) {
        const clash = await trx
            .selectFrom('appointment_block')
            .select('id')
            .where('resource_id', '=', id)
            .where('status', 'in', BLOCKING_STATUSES)
            .where('starts_at', '<', p.blockEnd)
            .where('ends_at', '>', p.blockStart)
            .executeTakeFirst();
        if (clash) continue;
        const blocked = await trx
            .selectFrom('blocked_period')
            .select('id')
            .where('resource_id', '=', id)
            .where('starts_at', '<', p.blockEnd)
            .where('ends_at', '>', p.blockStart)
            .executeTakeFirst();
        if (!blocked) return id;
    }
    return undefined;
};

export const insertHoldBlock = async (
    trx: Kysely<Database>,
    b: InsertHold,
): Promise<HoldBlockRow> => {
    try {
        return await trx
            .insertInto('appointment_block')
            .values({
                artist_id: b.artistId,
                resource_id: b.resourceId,
                service_type_id: b.serviceTypeId,
                customer_id: b.customerId,
                starts_at: b.blockStart,
                ends_at: b.blockEnd,
                session_starts_at: b.sessionStart,
                session_ends_at: b.sessionEnd,
                status: 'HELD',
                expires_at: b.expiresAt,
                hold_client_token: b.holdClientToken,
                idempotency_key: b.idempotencyKey,
                deposit_cents: b.depositCents,
            })
            .returningAll()
            .executeTakeFirstOrThrow();
    } catch (e) {
        if (isExclusionViolation(e)) throw new SlotConflictError();
        throw e;
    }
};

export const getBlockById = (exec: Kysely<Database>, id: string) =>
    exec.selectFrom('appointment_block').selectAll().where('id', '=', id).executeTakeFirst();

export const expireStaleHolds = async (trx: Kysely<Database>, now: Date) => {
    const rows = await trx
        .updateTable('appointment_block')
        .set({ status: 'EXPIRED', updated_at: now })
        .where('status', '=', 'HELD')
        .where('expires_at', '<', now)
        .returning(['id', 'artist_id', 'resource_id', 'customer_id', 'session_starts_at'])
        .execute();
    return rows.map((r) => ({
        id: r.id,
        artistId: r.artist_id,
        resourceId: r.resource_id,
        customerId: r.customer_id,
        startsAt: new Date(r.session_starts_at),
    }));
};

export const releaseHold = async (trx: Kysely<Database>, id: string, clientToken: string) => {
    const updated = await trx
        .updateTable('appointment_block')
        .set({ status: 'CANCELLED', updated_at: new Date() })
        .where('id', '=', id)
        .where('status', '=', 'HELD')
        .where('hold_client_token', '=', clientToken)
        .returningAll()
        .executeTakeFirst();
    if (!updated) throw new HoldNotFoundError();
    return updated;
};

export const confirmHoldBlock = async (
    trx: Kysely<Database>,
    id: string,
    deposit?: { amountCents: number; at: string; method: string },
): Promise<{ appointmentId: string }> => {
    const block = await getBlockById(trx, id);
    if (!block) throw new HoldNotFoundError();
    if (block.status !== 'HELD' && block.status !== 'PAYMENT_PENDING') {
        throw new InvalidStateError(block.status, 'CONFIRMED');
    }
    await trx
        .updateTable('appointment_block')
        .set({ status: 'CONFIRMED', expires_at: null, updated_at: new Date() })
        .where('id', '=', id)
        .execute();
    const appt = await trx
        .insertInto('appointment')
        .values({
            block_id: id,
            service_type_id: block.service_type_id,
            customer_status: 'BOOKED',
            deposit_received_cents: deposit?.amountCents ?? null,
            deposit_received_at: deposit?.at ?? null,
            deposit_method: deposit?.method ?? null,
        })
        .returning('id')
        .executeTakeFirstOrThrow();
    return { appointmentId: appt.id };
};

export const declineHoldBlock = async (trx: Kysely<Database>, id: string, reason: string) => {
    const block = await getBlockById(trx, id);
    if (!block) throw new HoldNotFoundError();
    if (block.status !== 'HELD' && block.status !== 'PAYMENT_PENDING') {
        throw new InvalidStateError(block.status, 'CANCELLED');
    }
    await trx
        .updateTable('appointment_block')
        .set({ status: 'CANCELLED', decline_reason: reason, updated_at: new Date() })
        .where('id', '=', id)
        .execute();
};
