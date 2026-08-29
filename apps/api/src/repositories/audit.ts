import type { Kysely } from 'kysely';
import type { Database } from '../database/types.js';

export const recordAudit = async (
    exec: Kysely<Database>,
    e: {
        actor: string;
        action: string;
        entityType: string;
        entityId: string;
        before?: unknown;
        after?: unknown;
    },
) => {
    await exec
        .insertInto('audit_event')
        .values({
            actor: e.actor,
            action: e.action,
            entity_type: e.entityType,
            entity_id: e.entityId,
            before: e.before === undefined ? null : JSON.stringify(e.before),
            after: e.after === undefined ? null : JSON.stringify(e.after),
        })
        .execute();
};
