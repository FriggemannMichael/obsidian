import { afterAll, beforeAll, expect, it } from 'vitest';
import { Pool } from 'pg';
import { runMigrations } from './migrate.js';

const admin =
    process.env.TEST_DATABASE_URL ??
    'postgresql://tattoo:tattoo-local@localhost:5432/tattoo_studio_test';
const dbName = 'migrate_test_' + Date.now();
const target = admin.replace(/\/[^/]+$/, `/${dbName}`);

beforeAll(async () => {
    const pool = new Pool({ connectionString: admin.replace(/\/[^/]+$/, '/postgres') });
    await pool.query(`CREATE DATABASE ${dbName}`);
    await pool.end();
});

afterAll(async () => {
    const pool = new Pool({ connectionString: admin.replace(/\/[^/]+$/, '/postgres') });
    await pool.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
    await pool.end();
});

it('applies all migrations once and is idempotent on a second run', async () => {
    const first = await runMigrations(target);
    expect(first.length).toBeGreaterThan(0);
    const second = await runMigrations(target);
    expect(second).toEqual([]);
});
