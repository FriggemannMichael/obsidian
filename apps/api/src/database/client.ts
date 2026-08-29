import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';
import type { Database } from './types.js';

export const createDatabase = (connectionString: string) =>
    new Kysely<Database>({
        dialect: new PostgresDialect({
            pool: new Pool({
                connectionString,
                max: 10,
            }),
        }),
    });
