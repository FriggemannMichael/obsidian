import { randomUUID } from 'node:crypto';
import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';
import type { Database } from '../database/types.js';
import { runMigrations } from '../database/migrate.js';

const baseUrl =
    process.env.TEST_DATABASE_URL ??
    'postgresql://tattoo:tattoo-local@localhost:5432/tattoo_studio_test';
const swapDb = (url: string, name: string) => url.replace(/\/[^/?]+(\?|$)/, `/${name}$1`);

export type TestDb = {
    db: Kysely<Database>;
    connectionString: string;
    truncateAll(): Promise<void>;
    destroy(): Promise<void>;
};

export const createTestDb = async (
    name = `ts_test_${randomUUID().slice(0, 8)}`,
): Promise<TestDb> => {
    const adminPool = new Pool({ connectionString: swapDb(baseUrl, 'postgres') });
    await adminPool.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
    await adminPool.query(`CREATE DATABASE ${name}`);
    await adminPool.end();

    const connectionString = swapDb(baseUrl, name);
    await runMigrations(connectionString);

    const pool = new Pool({ connectionString, max: 4 });
    const db = new Kysely<Database>({ dialect: new PostgresDialect({ pool }) });

    const truncateAll = async () => {
        const { rows } = await pool.query<{ tablename: string }>(
            `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> 'schema_migration'`,
        );
        if (rows.length === 0) return;
        const list = rows.map((r) => `"${r.tablename}"`).join(', ');
        await pool.query(`TRUNCATE ${list} RESTART IDENTITY CASCADE`);
    };

    const destroy = async () => {
        await db.destroy();
        const admin = new Pool({ connectionString: swapDb(baseUrl, 'postgres') });
        await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
        await admin.end();
    };

    return { db, connectionString, truncateAll, destroy };
};
