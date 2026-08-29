import { createHash } from 'node:crypto';
import type { Kysely } from 'kysely';
import type { Database } from '../database/types.js';

const canonical = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(canonical);
    if (v && typeof v === 'object') {
        return Object.fromEntries(
            Object.entries(v as Record<string, unknown>)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([k, val]) => [k, canonical(val)] as [string, unknown]),
        );
    }
    return v;
};

export const hashRequestBody = (body: unknown): string =>
    createHash('sha256').update(JSON.stringify(canonical(body))).digest('hex');

export const findIdempotencyRecord = async (exec: Kysely<Database>, key: string) => {
    const row = await exec
        .selectFrom('idempotency_key')
        .select(['request_hash', 'response_json', 'status_code'])
        .where('key', '=', key)
        .executeTakeFirst();
    if (!row) return undefined;
    return {
        requestHash: row.request_hash,
        responseJson:
            typeof row.response_json === 'string'
                ? JSON.parse(row.response_json)
                : row.response_json,
        statusCode: row.status_code,
    };
};

export const saveIdempotencyRecord = async (
    exec: Kysely<Database>,
    r: {
        key: string;
        route: string;
        requestHash: string;
        responseJson: unknown;
        statusCode: number;
        ttlHours?: number;
    },
) => {
    const expires = new Date(Date.now() + (r.ttlHours ?? 24) * 3_600_000);
    await exec
        .insertInto('idempotency_key')
        .values({
            key: r.key,
            route: r.route,
            request_hash: r.requestHash,
            response_json: JSON.stringify(r.responseJson),
            status_code: r.statusCode,
            expires_at: expires,
        })
        .execute();
};
