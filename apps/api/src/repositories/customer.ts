import type { Kysely } from 'kysely';
import type { Database } from '../database/types.js';

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
