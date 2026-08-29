import type { Kysely } from 'kysely';
import type { Database } from '../database/types.js';

export const enqueueOutbox = async (
    exec: Kysely<Database>,
    e: { type: string; payload: unknown },
) => {
    await exec
        .insertInto('outbox_event')
        .values({ type: e.type, payload: JSON.stringify(e.payload) })
        .execute();
};

export const listPendingOutbox = async (exec: Kysely<Database>, limit: number) => {
    const rows = await exec
        .selectFrom('outbox_event')
        .select(['id', 'type', 'payload'])
        .where('status', '=', 'PENDING')
        .orderBy('created_at', 'asc')
        .limit(limit)
        .execute();
    return rows.map((r) => ({
        id: r.id,
        type: r.type,
        payload: typeof r.payload === 'string' ? JSON.parse(r.payload) : r.payload,
    }));
};
