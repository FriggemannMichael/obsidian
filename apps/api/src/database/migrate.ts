import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Pool } from 'pg';

const defaultDir = fileURLToPath(new URL('../../migrations/', import.meta.url));

/**
 * Legt `schema_migration` an und führt alle noch nicht angewandten `*.sql`
 * in Dateinamen-Reihenfolge in je einer Transaktion aus. Gibt die in diesem
 * Lauf angewandten Dateinamen zurück; idempotent.
 */
export const runMigrations = async (
    connectionString: string,
    migrationsDir: string = defaultDir,
): Promise<string[]> => {
    const pool = new Pool({ connectionString, max: 1 });
    const applied: string[] = [];
    try {
        const client = await pool.connect();
        try {
            await client.query(`
                CREATE TABLE IF NOT EXISTS schema_migration (
                    filename text PRIMARY KEY,
                    executed_at timestamptz NOT NULL DEFAULT now()
                )
            `);
            const files = (await readdir(migrationsDir))
                .filter((file) => file.endsWith('.sql'))
                .sort();
            for (const filename of files) {
                const done = await client.query(
                    'SELECT 1 FROM schema_migration WHERE filename = $1',
                    [filename],
                );
                if (done.rowCount) continue;
                const sql = await readFile(join(migrationsDir, filename), 'utf8');
                await client.query('BEGIN');
                try {
                    await client.query(sql);
                    await client.query('INSERT INTO schema_migration (filename) VALUES ($1)', [
                        filename,
                    ]);
                    await client.query('COMMIT');
                    applied.push(filename);
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
    return applied;
};

const invokedPath = process.argv[1];
const isCli = invokedPath !== undefined && import.meta.url === pathToFileURL(invokedPath).href;
if (isCli) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
        throw new Error('DATABASE_URL muss für Datenbankmigrationen gesetzt sein.');
    }
    const applied = await runMigrations(connectionString);
    if (applied.length === 0) {
        console.info('Keine ausstehenden Migrationen.');
    }
    for (const filename of applied) {
        console.info(`Migration ausgeführt: ${filename}`);
    }
}
