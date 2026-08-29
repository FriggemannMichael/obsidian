import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { Pool, type PoolClient } from 'pg';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
    throw new Error('DATABASE_URL muss für Datenbankmigrationen gesetzt sein.');
}

const migrationsDirectory = fileURLToPath(new URL('../../migrations/', import.meta.url));
const pool = new Pool({ connectionString, max: 1 });

const ensureMigrationTable = (client: PoolClient) =>
    client.query(`
        CREATE TABLE IF NOT EXISTS schema_migration (
            filename text PRIMARY KEY,
            executed_at timestamptz NOT NULL DEFAULT now()
        )
    `);

try {
    const client = await pool.connect();

    try {
        await ensureMigrationTable(client);

        const files = (await readdir(migrationsDirectory))
            .filter((file) => file.endsWith('.sql'))
            .sort();

        for (const filename of files) {
            const alreadyExecuted = await client.query(
                'SELECT 1 FROM schema_migration WHERE filename = $1',
                [filename],
            );

            if (alreadyExecuted.rowCount) {
                console.info(`Migration bereits ausgeführt: ${filename}`);
                continue;
            }

            const sql = await readFile(new URL(`../../migrations/${filename}`, import.meta.url), 'utf8');

            await client.query('BEGIN');
            try {
                await client.query(sql);
                await client.query('INSERT INTO schema_migration (filename) VALUES ($1)', [filename]);
                await client.query('COMMIT');
                console.info(`Migration ausgeführt: ${filename}`);
            } catch (error) {
                await client.query('ROLLBACK');
                throw error;
            }
        }
    } finally {
        client.release();
    }
} finally {
    await pool.end();
}
