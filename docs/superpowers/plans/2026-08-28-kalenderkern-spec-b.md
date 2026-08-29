# Kalenderkern & Verfügbarkeit (Spec B) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Einen transaktionalen Buchungskern bauen — Kalendermodell, Verfügbarkeits-Engine über mehrere Artists/Ressourcen, atomare Slot-Holds mit DB-Constraint gegen Doppelbuchung, Studio-Confirm-Endpoint und Hold-Ablauf-Worker.

**Architecture:** Fastify-API (`buildApp()`-Factory) mit reiner Domain-Schicht (`src/domain/`, keine I/O), Repository-Schicht (`src/repositories/`, Kysely) und dünner Service-Schicht dazwischen. PostgreSQL ist Source of Truth; zwei GiST-Exclusion-Constraints auf `appointment_block` verhindern Überschneidungen unabhängig vom Anwendungscode. Der Worker läuft als zweiter Entrypoint im selben `apps/api`-Codebestand.

**Tech Stack:** Node 24, TypeScript (ESM/`NodeNext`), Fastify 5, Kysely + `pg`, Zod 4 (`@tattoo-studio/contracts`), Luxon (Zeitzonen/DST), Vitest, `@fastify/rate-limit`, PostgreSQL 18 (`btree_gist`).

**Spec:** `docs/superpowers/specs/2026-08-28-kalenderkern-spec-b-design.md`

## Global Constraints

- Node `>=24`; npm-Workspaces (`apps/*`, `packages/*`).
- `@tattoo-studio/contracts` **muss vor** API/Worker gebaut werden (`npm run build --workspace @tattoo-studio/contracts`); es wird als kompiliertes `dist/` konsumiert.
- ESM `NodeNext`: relative Importe brauchen `.js`-Endung auch in `.ts`-Dateien.
- `tsconfig.base.json`: `strict` + `noUncheckedIndexedAccess` überall.
- Alle Zeitpunkte `timestamptz` in **UTC** speichern; lokale Zeiten in Artist-Zeitzone (`Europe/Berlin`); Intervalle halboffen `[start, end)`.
- Statusänderung + `audit_event` + `outbox_event` immer in **derselben** DB-Transaktion.
- Konfliktschutz kommt aus der Exclusion-Constraint, **nicht** aus dem Isolationslevel (`READ COMMITTED`).
- `chaynsPersonId` ist in Spec B eine **unbestätigte** Angabe — nie autorisierungsrelevant.
- Prettier (web-Konvention, gilt auch hier): 4-Space-Tabs, Single Quotes, `printWidth` 100.
- Fehlerantworten folgen `apiErrorSchema` (`{ code, message, issues? }`); Fehlercodes aus Spec §9.
- Env-Defaults: `GRID_MINUTES=15`, `MIN_LEAD_HOURS=12`, `HOLD_TTL_HOURS=48`, `MAX_AVAILABILITY_DAYS=31`, `WORKER_INTERVAL_SECONDS=60`.

## Voraussetzungen

- **Git:** Das Verzeichnis ist noch kein Git-Repo. Vor Task 1 `git init` mit der konfigurierten Nutzeridentität ausführen. Commit-Messages ohne AI-Trailer (siehe `~/CLAUDE.md`).
- **Test-Datenbank:** Tasks mit DB-Integrationstests brauchen eine laufende PostgreSQL-Instanz. `npm run db:up` startet sie (compose.yaml). Env `TEST_DATABASE_URL` (Default in der Test-Harness: `postgresql://tattoo:tattoo-local@localhost:5432/tattoo_studio_test`).

## Abweichungen von der Spec

- **Spec §13** listet `apps/worker/` als eigenen Workspace. Dieser Plan realisiert den Worker als zweiten Entrypoint in `apps/api` (`src/worker.ts`) — das setzt „gleicher Codebestand, getrennte Prozesse" (Konzept §6.5) ohne Cross-Workspace-Importe um. Später extrahierbar.
- **Spec §1.3 / §13:** Die alte `booking_request`-Tabelle bleibt als Legacy-Tabelle im neuen Schema erhalten (ein `-- Legacy: abgelöst durch Spec C`-Kommentar), damit der bestehende `/api/v1/booking-requests`-Postgres-Pfad nicht bricht. Die alte synthetische `src/availability.ts` und die `/api/v1/*`-Routen bleiben unangetastet; die neue Engine liegt unter `/v1/*`.

## Dateistruktur

**Neu:**

| Datei | Verantwortung |
|---|---|
| `apps/api/src/config.ts` | Env → typisierte `AppConfig` (Zod) |
| `apps/api/src/testing/db.ts` | Test-DB anlegen/migrieren/truncaten |
| `apps/api/src/domain/time.ts` | Lokalzeit→UTC, Puffer-Mathematik, `[start,end)`-Overlap, Tagesiteration |
| `apps/api/src/domain/slot-id.ts` | opake Slot-ID encode/decode |
| `apps/api/src/domain/status.ts` | erlaubte Statusübergänge `appointment_block` |
| `apps/api/src/domain/availability.ts` | reine Verfügbarkeits-Engine |
| `apps/api/src/repositories/reference.ts` | Lesen: service_type, artist, resource, rules, blocked_periods, blocking blocks |
| `apps/api/src/repositories/idempotency.ts` | Idempotency-Key-Speicher + Body-Hash |
| `apps/api/src/repositories/outbox.ts` | `outbox_event` schreiben/lesen |
| `apps/api/src/repositories/audit.ts` | `audit_event` schreiben (append-only) |
| `apps/api/src/repositories/holds.ts` | Hold-/Block-/Appointment-Transaktionsprimitive |
| `apps/api/src/services/availability-service.ts` | Repo-Load → Domain-Engine → Contract-Mapping |
| `apps/api/src/services/hold-service.ts` | orchestriert die Hold-Transaktion (Spec §4.2) |
| `apps/api/src/services/admin-service.ts` | confirm/decline/list |
| `apps/api/src/routes/availability.ts` | `GET /v1/availability` |
| `apps/api/src/routes/slot-holds.ts` | `POST /v1/slot-holds`, `DELETE /v1/slot-holds/{id}` |
| `apps/api/src/routes/admin-holds.ts` | `POST /v1/admin/holds/{id}/confirm\|decline`, `GET /v1/admin/holds` |
| `apps/api/src/plugins/admin-auth.ts` | Bearer-Token-Prüfung für `/v1/admin/*` |
| `apps/api/src/plugins/rate-limit.ts` | `@fastify/rate-limit`-Konfiguration |
| `apps/api/src/worker.ts` | Worker-Entrypoint (Intervall-Loop) |
| `apps/api/src/jobs/expire-holds.ts` | Job: abgelaufene Holds → `EXPIRED` |
| `apps/api/migrations/002_seed_reference_data.sql` | Seed-Daten |
| `packages/contracts/src/service-type.ts` | `serviceTypeSchema` (erweitert) |
| `packages/contracts/src/artist.ts` | `artistSchema` |
| `packages/contracts/src/availability.ts` | Query/Slot/Response-Schemas |
| `packages/contracts/src/slot-hold.ts` | Request/Response-Schemas |
| `packages/contracts/src/admin.ts` | confirm/decline-Request-Schemas |
| `packages/contracts/src/errors.ts` | `apiErrorSchema` + Fehlercode-Enum |

**Geändert:**

| Datei | Änderung |
|---|---|
| `apps/api/migrations/001_initial_booking.sql` | Inhalt komplett durch Schema aus Spec §2 ersetzen (+ Legacy-`booking_request`) |
| `apps/api/src/database/types.ts` | alle neuen Kysely-Tabellentypen |
| `apps/api/src/database/migrate.ts` | Migrationslauf als importierbare Funktion `runMigrations()` extrahieren |
| `apps/api/src/app.ts` | neue Plugins + Routen registrieren, `config` durchreichen |
| `apps/api/src/server.ts` | `loadConfig()` und an `buildApp()` übergeben |
| `apps/api/package.json` | Scripts `worker`, `start:worker`; Dep `@fastify/rate-limit` |
| `packages/contracts/src/index.ts` | neue Schemas re-exportieren |
| `package.json` (root) | `dev` um Worker erweitern |
| `.env.example` | neue Env-Variablen |
| `CLAUDE.md` | Worker-Kommandos, neues Datenmodell, Engine-Hinweis |

---

### Task 1: Config-Modul

**Files:**
- Create: `apps/api/src/config.ts`
- Test: `apps/api/src/config.test.ts`
- Modify: `.env.example`

**Interfaces:**
- Produces:
  - `type AppConfig = { gridMinutes: number; minLeadHours: number; holdTtlHours: number; maxAvailabilityDays: number; adminApiToken: string; workerIntervalSeconds: number; rateLimitMax: number }`
  - `loadConfig(env?: NodeJS.ProcessEnv): AppConfig` — wirft `Error` bei fehlendem `ADMIN_API_TOKEN` oder unplausiblen Zahlen.

- [ ] **Step 1: Failing test**

```ts
// apps/api/src/config.test.ts
import { describe, expect, it } from 'vitest';
import { loadConfig } from './config.js';

const base = { ADMIN_API_TOKEN: 'test-token' };

describe('loadConfig', () => {
    it('applies documented defaults', () => {
        const c = loadConfig(base);
        expect(c).toMatchObject({
            gridMinutes: 15,
            minLeadHours: 12,
            holdTtlHours: 48,
            maxAvailabilityDays: 31,
            workerIntervalSeconds: 60,
            adminApiToken: 'test-token',
        });
    });

    it('parses overrides from env', () => {
        const c = loadConfig({ ...base, GRID_MINUTES: '30', HOLD_TTL_HOURS: '24' });
        expect(c.gridMinutes).toBe(30);
        expect(c.holdTtlHours).toBe(24);
    });

    it('throws when ADMIN_API_TOKEN is missing', () => {
        expect(() => loadConfig({})).toThrow(/ADMIN_API_TOKEN/);
    });

    it('rejects non-positive numbers', () => {
        expect(() => loadConfig({ ...base, GRID_MINUTES: '0' })).toThrow();
    });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npm test --workspace @tattoo-studio/api -- config`
Expected: FAIL (`loadConfig` not found).

- [ ] **Step 3: Implement**

```ts
// apps/api/src/config.ts
import { z } from 'zod';

const intFromEnv = (fallback: number) =>
    z
        .string()
        .optional()
        .transform((v) => (v === undefined ? fallback : Number(v)))
        .pipe(z.number().int().positive());

const schema = z.object({
    GRID_MINUTES: intFromEnv(15),
    MIN_LEAD_HOURS: intFromEnv(12),
    HOLD_TTL_HOURS: intFromEnv(48),
    MAX_AVAILABILITY_DAYS: intFromEnv(31),
    WORKER_INTERVAL_SECONDS: intFromEnv(60),
    RATE_LIMIT_MAX: intFromEnv(10),
    ADMIN_API_TOKEN: z.string().min(1, 'ADMIN_API_TOKEN is required'),
});

export type AppConfig = {
    gridMinutes: number;
    minLeadHours: number;
    holdTtlHours: number;
    maxAvailabilityDays: number;
    adminApiToken: string;
    workerIntervalSeconds: number;
    rateLimitMax: number;
};

export const loadConfig = (env: NodeJS.ProcessEnv = process.env): AppConfig => {
    const parsed = schema.parse(env);
    return {
        gridMinutes: parsed.GRID_MINUTES,
        minLeadHours: parsed.MIN_LEAD_HOURS,
        holdTtlHours: parsed.HOLD_TTL_HOURS,
        maxAvailabilityDays: parsed.MAX_AVAILABILITY_DAYS,
        adminApiToken: parsed.ADMIN_API_TOKEN,
        workerIntervalSeconds: parsed.WORKER_INTERVAL_SECONDS,
        rateLimitMax: parsed.RATE_LIMIT_MAX,
    };
};
```

- [ ] **Step 4: Run test, verify it passes**

Run: `npm test --workspace @tattoo-studio/api -- config`
Expected: PASS.

- [ ] **Step 5: Update `.env.example`**

```
DATABASE_URL=postgresql://tattoo:tattoo-local@localhost:5432/tattoo_studio
TEST_DATABASE_URL=postgresql://tattoo:tattoo-local@localhost:5432/tattoo_studio_test
HOST=0.0.0.0
PORT=3000
ADMIN_API_TOKEN=change-me-local
GRID_MINUTES=15
MIN_LEAD_HOURS=12
HOLD_TTL_HOURS=48
MAX_AVAILABILITY_DAYS=31
WORKER_INTERVAL_SECONDS=60
RATE_LIMIT_MAX=10
```

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/config.ts apps/api/src/config.test.ts .env.example
git commit -m "feat(api): typed app config from environment"
```

---

### Task 2: Migrationslauf als importierbare Funktion

**Files:**
- Modify: `apps/api/src/database/migrate.ts`
- Test: `apps/api/src/database/migrate.test.ts`

**Interfaces:**
- Consumes: nichts.
- Produces:
  - `runMigrations(connectionString: string, migrationsDir?: string): Promise<string[]>` — legt `schema_migration` an, führt neue `*.sql` in Dateinamen-Reihenfolge in je einer Transaktion aus, gibt die in diesem Lauf angewandten Dateinamen zurück. Idempotent.
  - Default `migrationsDir` = `<dieses Modul>/../../migrations/`.

- [ ] **Step 1: Failing test**

```ts
// apps/api/src/database/migrate.test.ts
import { afterAll, beforeAll, expect, it } from 'vitest';
import { Pool } from 'pg';
import { runMigrations } from './migrate.js';

const admin = process.env.TEST_DATABASE_URL ?? 'postgresql://tattoo:tattoo-local@localhost:5432/tattoo_studio_test';
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
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npm run db:up && npm test --workspace @tattoo-studio/api -- migrate`
Expected: FAIL (`runMigrations` not exported).

- [ ] **Step 3: Refactor `migrate.ts`**

Den Top-Level-Skriptinhalt in eine exportierte Funktion umziehen; der CLI-Aufruf bleibt am Dateiende erhalten.

```ts
// apps/api/src/database/migrate.ts
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';

const defaultDir = fileURLToPath(new URL('../../migrations/', import.meta.url));

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
            const files = (await readdir(migrationsDir)).filter((f) => f.endsWith('.sql')).sort();
            for (const filename of files) {
                const done = await client.query('SELECT 1 FROM schema_migration WHERE filename = $1', [filename]);
                if (done.rowCount) continue;
                const sql = await readFile(new URL(`file://${migrationsDir}${filename}`), 'utf8');
                await client.query('BEGIN');
                try {
                    await client.query(sql);
                    await client.query('INSERT INTO schema_migration (filename) VALUES ($1)', [filename]);
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

const isCli = fileURLToPath(import.meta.url) === process.argv[1];
if (isCli) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error('DATABASE_URL muss für Datenbankmigrationen gesetzt sein.');
    const applied = await runMigrations(connectionString);
    for (const f of applied) console.info(`Migration ausgeführt: ${f}`);
}
```

- [ ] **Step 4: Run test, verify it passes**

Run: `npm test --workspace @tattoo-studio/api -- migrate`
Expected: PASS.

- [ ] **Step 5: Verify CLI still works**

Run: `$env:DATABASE_URL='postgresql://tattoo:tattoo-local@localhost:5432/tattoo_studio'; npm run db:migrate`
Expected: läuft ohne Fehler durch (Migrationen ggf. schon angewandt).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/database/migrate.ts apps/api/src/database/migrate.test.ts
git commit -m "refactor(api): expose runMigrations() for reuse in tests"
```

---

### Task 3: Test-DB-Harness

**Files:**
- Create: `apps/api/src/testing/db.ts`
- Test: `apps/api/src/testing/db.test.ts`

**Interfaces:**
- Consumes: `runMigrations` (Task 2), `Database` (Kysely-Typ — bis Task 4 nur `any`; nach Task 4 echt typisiert).
- Produces:
  - `type TestDb = { db: Kysely<Database>; connectionString: string; truncateAll(): Promise<void>; destroy(): Promise<void> }`
  - `createTestDb(name?: string): Promise<TestDb>` — legt eine frische Datenbank an (Name: `name ?? 'ts_test_' + randomUUID().slice(0,8)`), migriert sie, liefert eine Kysely-Instanz. `truncateAll()` leert alle Tabellen außer `schema_migration` (`TRUNCATE ... RESTART IDENTITY CASCADE`). `destroy()` schließt Pool und droppt die DB.
  - Basis-Connection aus `process.env.TEST_DATABASE_URL ?? 'postgresql://tattoo:tattoo-local@localhost:5432/tattoo_studio_test'`.

- [ ] **Step 1: Failing test**

```ts
// apps/api/src/testing/db.test.ts
import { afterAll, beforeAll, expect, it } from 'vitest';
import { createTestDb, type TestDb } from './db.js';

let ctx: TestDb;
beforeAll(async () => { ctx = await createTestDb(); });
afterAll(async () => { await ctx.destroy(); });

it('provides a migrated database', async () => {
    const { rows } = await ctx.db.executeQuery({
        sql: `SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = 'public'`,
        parameters: [],
    } as never);
    expect((rows[0] as { n: number }).n).toBeGreaterThan(5);
});

it('truncateAll clears data tables', async () => {
    await ctx.db.insertInto('artist').values({ id: 'x', display_name: 'X', bio: '', timezone: 'Europe/Berlin', active: true }).execute();
    await ctx.truncateAll();
    const after = await ctx.db.selectFrom('artist').selectAll().execute();
    expect(after).toHaveLength(0);
});
```

> Hinweis: Der zweite Test grünt erst, wenn Task 4/5 `artist` samt Seed liefern. Bis dahin diesen `it` mit `it.skip` markieren und in Task 5 aktivieren.

- [ ] **Step 2: Run test, verify it fails**

Run: `npm test --workspace @tattoo-studio/api -- testing/db`
Expected: FAIL (`createTestDb` not found).

- [ ] **Step 3: Implement**

```ts
// apps/api/src/testing/db.ts
import { randomUUID } from 'node:crypto';
import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';
import type { Database } from '../database/types.js';
import { runMigrations } from '../database/migrate.js';

const baseUrl =
    process.env.TEST_DATABASE_URL ?? 'postgresql://tattoo:tattoo-local@localhost:5432/tattoo_studio_test';
const swapDb = (url: string, name: string) => url.replace(/\/[^/?]+(\?|$)/, `/${name}$1`);

export type TestDb = {
    db: Kysely<Database>;
    connectionString: string;
    truncateAll(): Promise<void>;
    destroy(): Promise<void>;
};

export const createTestDb = async (name = `ts_test_${randomUUID().slice(0, 8)}`): Promise<TestDb> => {
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
```

- [ ] **Step 4: Run test, verify it passes**

Run: `npm test --workspace @tattoo-studio/api -- testing/db`
Expected: PASS (erster `it`; zweiter ggf. `skip`).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/testing/db.ts apps/api/src/testing/db.test.ts
git commit -m "test(api): per-run isolated postgres test harness"
```

---

### Task 4: Neues Kalenderschema + Kysely-Typen

**Files:**
- Modify: `apps/api/migrations/001_initial_booking.sql` (Inhalt vollständig ersetzen)
- Modify: `apps/api/src/database/types.ts` (vollständig ersetzen)
- Test: `apps/api/src/database/schema.test.ts`

**Interfaces:**
- Produces: Kysely-`Database`-Interface mit Tabellen `service_type`, `artist`, `resource`, `artist_service`, `availability_rule`, `blocked_period`, `customer`, `appointment_block`, `appointment`, `idempotency_key`, `outbox_event`, `audit_event`, `booking_request` (legacy).
- Spaltendefinitionen exakt nach Spec §2.

- [ ] **Step 1: Failing test**

```ts
// apps/api/src/database/schema.test.ts
import { afterAll, afterEach, beforeAll, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '../testing/db.js';

let ctx: TestDb;
beforeAll(async () => { ctx = await createTestDb(); });
afterEach(async () => { await ctx.truncateAll(); });
afterAll(async () => { await ctx.destroy(); });

const seedArtistResourceService = async (db: TestDb['db']) => {
    await db.insertInto('artist').values({ id: 'a1', display_name: 'A1', bio: '', timezone: 'Europe/Berlin', active: true }).execute();
    await db.insertInto('resource').values({ id: 'r1', name: 'R1', kind: 'station', active: true }).execute();
    await db.insertInto('service_type').values({
        id: 's1', name: 'S1', description: '', duration_minutes: 60, pre_buffer_minutes: 0,
        post_buffer_minutes: 0, booking_mode: 'request', deposit_tier: 'NONE', deposit_cents: 0, active: true,
    }).execute();
    await db.insertInto('customer').values({ first_name: 'F', last_name: 'L', email: 'e@x.de', phone: '123456' }).execute();
};

const block = (over: Record<string, unknown>) => ({
    artist_id: 'a1', resource_id: 'r1', service_type_id: 's1',
    starts_at: '2026-09-01T08:00:00Z', ends_at: '2026-09-01T10:00:00Z',
    session_starts_at: '2026-09-01T08:00:00Z', session_ends_at: '2026-09-01T10:00:00Z',
    status: 'HELD', deposit_cents: 0, ...over,
});

it('rejects overlapping HELD blocks for the same artist', async () => {
    await seedArtistResourceService(ctx.db);
    const c = await ctx.db.selectFrom('customer').select('id').executeTakeFirstOrThrow();
    await ctx.db.insertInto('appointment_block').values(block({ customer_id: c.id })).execute();
    await expect(
        ctx.db.insertInto('appointment_block').values(block({
            customer_id: c.id, resource_id: 'r1',
            starts_at: '2026-09-01T09:00:00Z', ends_at: '2026-09-01T11:00:00Z',
        })).execute(),
    ).rejects.toThrow(/exclusion|overlap|23P01|conflicting key/i);
});

it('allows a block that starts exactly when the previous ends', async () => {
    await seedArtistResourceService(ctx.db);
    const c = await ctx.db.selectFrom('customer').select('id').executeTakeFirstOrThrow();
    await ctx.db.insertInto('appointment_block').values(block({ customer_id: c.id })).execute();
    await expect(
        ctx.db.insertInto('appointment_block').values(block({
            customer_id: c.id,
            starts_at: '2026-09-01T10:00:00Z', ends_at: '2026-09-01T12:00:00Z',
            session_starts_at: '2026-09-01T10:00:00Z', session_ends_at: '2026-09-01T12:00:00Z',
        })).execute(),
    ).resolves.not.toThrow();
});

it('ignores non-blocking status in the exclusion', async () => {
    await seedArtistResourceService(ctx.db);
    const c = await ctx.db.selectFrom('customer').select('id').executeTakeFirstOrThrow();
    await ctx.db.insertInto('appointment_block').values(block({ customer_id: c.id, status: 'EXPIRED' })).execute();
    await expect(
        ctx.db.insertInto('appointment_block').values(block({ customer_id: c.id })).execute(),
    ).resolves.not.toThrow();
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npm test --workspace @tattoo-studio/api -- database/schema`
Expected: FAIL (Tabellen/Spalten fehlen).

- [ ] **Step 3: Schema schreiben**

Ersetze den **gesamten** Inhalt von `apps/api/migrations/001_initial_booking.sql` durch das Schema aus Spec §2. Kernpunkte, die exakt so umzusetzen sind:

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE service_type (
    id text PRIMARY KEY,
    name text NOT NULL,
    description text NOT NULL DEFAULT '',
    duration_minutes integer NOT NULL CHECK (duration_minutes > 0),
    pre_buffer_minutes integer NOT NULL DEFAULT 0 CHECK (pre_buffer_minutes >= 0),
    post_buffer_minutes integer NOT NULL DEFAULT 0 CHECK (post_buffer_minutes >= 0),
    booking_mode text NOT NULL DEFAULT 'request' CHECK (booking_mode IN ('request','direct')),
    deposit_tier text NOT NULL DEFAULT 'NONE' CHECK (deposit_tier IN ('NONE','D50','D100','D150')),
    deposit_cents integer NOT NULL DEFAULT 0 CHECK (deposit_cents >= 0),
    active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE artist (
    id text PRIMARY KEY,
    display_name text NOT NULL,
    bio text NOT NULL DEFAULT '',
    timezone text NOT NULL DEFAULT 'Europe/Berlin',
    active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE resource (
    id text PRIMARY KEY,
    name text NOT NULL,
    kind text NOT NULL CHECK (kind IN ('station','consult')),
    active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE artist_service (
    artist_id text NOT NULL REFERENCES artist(id),
    service_type_id text NOT NULL REFERENCES service_type(id),
    PRIMARY KEY (artist_id, service_type_id)
);

CREATE TABLE availability_rule (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    artist_id text NOT NULL REFERENCES artist(id),
    weekday integer NOT NULL CHECK (weekday BETWEEN 1 AND 7),
    start_local time NOT NULL,
    end_local time NOT NULL,
    valid_from date NOT NULL,
    valid_to date,
    created_at timestamptz NOT NULL DEFAULT now(),
    CHECK (end_local > start_local)
);

CREATE TABLE blocked_period (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    artist_id text REFERENCES artist(id),
    resource_id text REFERENCES resource(id),
    starts_at timestamptz NOT NULL,
    ends_at timestamptz NOT NULL,
    reason text NOT NULL DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT now(),
    CHECK (ends_at > starts_at),
    CHECK (num_nonnulls(artist_id, resource_id) >= 1)
);

CREATE TABLE customer (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    chayns_person_id text UNIQUE,
    first_name text NOT NULL,
    last_name text NOT NULL,
    email text NOT NULL,
    phone text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE appointment_block (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    artist_id text NOT NULL REFERENCES artist(id),
    resource_id text NOT NULL REFERENCES resource(id),
    service_type_id text NOT NULL REFERENCES service_type(id),
    customer_id uuid NOT NULL REFERENCES customer(id),
    starts_at timestamptz NOT NULL,
    ends_at timestamptz NOT NULL,
    session_starts_at timestamptz NOT NULL,
    session_ends_at timestamptz NOT NULL,
    status text NOT NULL CHECK (status IN ('HELD','PAYMENT_PENDING','CONFIRMED','COMPLETED','EXPIRED','CANCELLED')),
    expires_at timestamptz,
    hold_client_token text,
    idempotency_key text,
    deposit_cents integer NOT NULL DEFAULT 0 CHECK (deposit_cents >= 0),
    decline_reason text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK (ends_at > starts_at)
);

ALTER TABLE appointment_block
  ADD CONSTRAINT appointment_block_artist_no_overlap
  EXCLUDE USING gist (artist_id WITH =, tstzrange(starts_at, ends_at, '[)') WITH &&)
  WHERE (status IN ('HELD','PAYMENT_PENDING','CONFIRMED'));

ALTER TABLE appointment_block
  ADD CONSTRAINT appointment_block_resource_no_overlap
  EXCLUDE USING gist (resource_id WITH =, tstzrange(starts_at, ends_at, '[)') WITH &&)
  WHERE (status IN ('HELD','PAYMENT_PENDING','CONFIRMED'));

CREATE INDEX appointment_block_expiry_idx ON appointment_block (status, expires_at);
CREATE INDEX appointment_block_client_token_idx ON appointment_block (hold_client_token) WHERE hold_client_token IS NOT NULL;
CREATE INDEX appointment_block_artist_start_idx ON appointment_block (artist_id, starts_at);

CREATE TABLE appointment (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    block_id uuid NOT NULL UNIQUE REFERENCES appointment_block(id),
    service_type_id text NOT NULL REFERENCES service_type(id),
    customer_status text NOT NULL DEFAULT 'BOOKED'
        CHECK (customer_status IN ('BOOKED','CHECKED_IN','DONE','NO_SHOW')),
    deposit_received_cents integer CHECK (deposit_received_cents >= 0),
    deposit_received_at timestamptz,
    deposit_method text,
    notes text,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE idempotency_key (
    key text PRIMARY KEY,
    route text NOT NULL,
    request_hash text NOT NULL,
    response_json jsonb NOT NULL,
    status_code integer NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL
);

CREATE TABLE outbox_event (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    type text NOT NULL,
    payload jsonb NOT NULL,
    status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','SENT','FAILED')),
    attempts integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    sent_at timestamptz
);
CREATE INDEX outbox_event_pending_idx ON outbox_event (created_at) WHERE status = 'PENDING';

CREATE TABLE audit_event (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    actor text NOT NULL,
    action text NOT NULL,
    entity_type text NOT NULL,
    entity_id text NOT NULL,
    before jsonb,
    after jsonb,
    at timestamptz NOT NULL DEFAULT now()
);

-- Legacy: abgelöst durch Spec C (Anfrage-Wizard). Hält den alten
-- /api/v1/booking-requests-Postgres-Pfad funktionsfähig.
CREATE TABLE booking_request (
    id uuid PRIMARY KEY,
    service_type_id text NOT NULL REFERENCES service_type(id),
    slot_id text NOT NULL,
    requested_starts_at timestamptz NOT NULL,
    requested_ends_at timestamptz NOT NULL,
    customer_first_name text NOT NULL,
    customer_last_name text NOT NULL,
    customer_email text NOT NULL,
    customer_phone text NOT NULL,
    tattoo_idea text NOT NULL,
    chayns_person_id text,
    status text NOT NULL DEFAULT 'submitted',
    accepted_terms_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CHECK (requested_ends_at > requested_starts_at)
);
```

> `gen_random_uuid()` ist in PostgreSQL 18 im Core (kein `pgcrypto` nötig).

- [ ] **Step 4: Kysely-Typen schreiben**

Ersetze `apps/api/src/database/types.ts` vollständig:

```ts
import type { ColumnType, Generated } from 'kysely';

type Ts = ColumnType<Date, Date | string, Date | string>;
type TsDefault = ColumnType<Date, Date | string | undefined, Date | string>;

export interface ServiceTypeTable {
    id: string;
    name: string;
    description: ColumnType<string, string | undefined, string>;
    duration_minutes: number;
    pre_buffer_minutes: ColumnType<number, number | undefined, number>;
    post_buffer_minutes: ColumnType<number, number | undefined, number>;
    booking_mode: ColumnType<'request' | 'direct', 'request' | 'direct' | undefined, 'request' | 'direct'>;
    deposit_tier: ColumnType<'NONE' | 'D50' | 'D100' | 'D150', 'NONE' | 'D50' | 'D100' | 'D150' | undefined, string>;
    deposit_cents: ColumnType<number, number | undefined, number>;
    active: ColumnType<boolean, boolean | undefined, boolean>;
    created_at: TsDefault;
}

export interface ArtistTable {
    id: string;
    display_name: string;
    bio: ColumnType<string, string | undefined, string>;
    timezone: ColumnType<string, string | undefined, string>;
    active: ColumnType<boolean, boolean | undefined, boolean>;
    created_at: TsDefault;
}

export interface ResourceTable {
    id: string;
    name: string;
    kind: 'station' | 'consult';
    active: ColumnType<boolean, boolean | undefined, boolean>;
    created_at: TsDefault;
}

export interface ArtistServiceTable {
    artist_id: string;
    service_type_id: string;
}

export interface AvailabilityRuleTable {
    id: Generated<string>;
    artist_id: string;
    weekday: number;
    start_local: string;
    end_local: string;
    valid_from: ColumnType<string, string, string>;
    valid_to: ColumnType<string | null, string | null, string | null>;
    created_at: TsDefault;
}

export interface BlockedPeriodTable {
    id: Generated<string>;
    artist_id: string | null;
    resource_id: string | null;
    starts_at: Ts;
    ends_at: Ts;
    reason: ColumnType<string, string | undefined, string>;
    created_at: TsDefault;
}

export interface CustomerTable {
    id: Generated<string>;
    chayns_person_id: string | null;
    first_name: string;
    last_name: string;
    email: string;
    phone: string;
    created_at: TsDefault;
}

export type BlockStatus =
    | 'HELD' | 'PAYMENT_PENDING' | 'CONFIRMED' | 'COMPLETED' | 'EXPIRED' | 'CANCELLED';

export interface AppointmentBlockTable {
    id: Generated<string>;
    artist_id: string;
    resource_id: string;
    service_type_id: string;
    customer_id: string;
    starts_at: Ts;
    ends_at: Ts;
    session_starts_at: Ts;
    session_ends_at: Ts;
    status: BlockStatus;
    expires_at: ColumnType<Date | null, Date | string | null, Date | string | null>;
    hold_client_token: string | null;
    idempotency_key: string | null;
    deposit_cents: ColumnType<number, number | undefined, number>;
    decline_reason: string | null;
    created_at: TsDefault;
    updated_at: TsDefault;
}

export interface AppointmentTable {
    id: Generated<string>;
    block_id: string;
    service_type_id: string;
    customer_status: ColumnType<'BOOKED' | 'CHECKED_IN' | 'DONE' | 'NO_SHOW', string | undefined, string>;
    deposit_received_cents: number | null;
    deposit_received_at: ColumnType<Date | null, Date | string | null, Date | string | null>;
    deposit_method: string | null;
    notes: string | null;
    created_at: TsDefault;
}

export interface IdempotencyKeyTable {
    key: string;
    route: string;
    request_hash: string;
    response_json: ColumnType<unknown, string, string>;
    status_code: number;
    created_at: TsDefault;
    expires_at: Ts;
}

export interface OutboxEventTable {
    id: Generated<string>;
    type: string;
    payload: ColumnType<unknown, string, string>;
    status: ColumnType<'PENDING' | 'SENT' | 'FAILED', string | undefined, string>;
    attempts: ColumnType<number, number | undefined, number>;
    created_at: TsDefault;
    sent_at: ColumnType<Date | null, Date | string | null, Date | string | null>;
}

export interface AuditEventTable {
    id: Generated<string>;
    actor: string;
    action: string;
    entity_type: string;
    entity_id: string;
    before: ColumnType<unknown, string | null, string | null>;
    after: ColumnType<unknown, string | null, string | null>;
    at: TsDefault;
}

export interface BookingRequestTable {
    id: string;
    service_type_id: string;
    slot_id: string;
    requested_starts_at: Ts;
    requested_ends_at: Ts;
    customer_first_name: string;
    customer_last_name: string;
    customer_email: string;
    customer_phone: string;
    tattoo_idea: string;
    chayns_person_id: string | null;
    status: ColumnType<string, string | undefined, string>;
    accepted_terms_at: Ts;
    created_at: TsDefault;
}

export interface Database {
    service_type: ServiceTypeTable;
    artist: ArtistTable;
    resource: ResourceTable;
    artist_service: ArtistServiceTable;
    availability_rule: AvailabilityRuleTable;
    blocked_period: BlockedPeriodTable;
    customer: CustomerTable;
    appointment_block: AppointmentBlockTable;
    appointment: AppointmentTable;
    idempotency_key: IdempotencyKeyTable;
    outbox_event: OutboxEventTable;
    audit_event: AuditEventTable;
    booking_request: BookingRequestTable;
}
```

- [ ] **Step 5: Alte `repository.ts` an Legacy-Schema anpassen**

`PostgresBookingRequestRepository.create` in `apps/api/src/repository.ts` referenziert `booking_request` weiterhin — Spaltennamen sind unverändert, sollte kompilieren. `npm run check-types --workspace @tattoo-studio/api` ausführen und ggf. Typkonflikte (neue `Database`-Form) beheben.

- [ ] **Step 6: Run tests**

Run: `npm test --workspace @tattoo-studio/api -- database/schema`
Expected: PASS (alle 3 `it`).

Run: `npm test --workspace @tattoo-studio/api`
Expected: bestehende `app.test.ts` weiterhin grün.

- [ ] **Step 7: Commit**

```bash
git add apps/api/migrations/001_initial_booking.sql apps/api/src/database/types.ts apps/api/src/database/schema.test.ts apps/api/src/repository.ts
git commit -m "feat(api): coherent calendar schema with GiST exclusion constraints"
```

---

### Task 5: Seed-Migration

**Files:**
- Create: `apps/api/migrations/002_seed_reference_data.sql`
- Test: `apps/api/src/database/seed.test.ts`

**Interfaces:**
- Consumes: Schema aus Task 4.
- Produces: Referenzdaten laut Spec §8 (2 Artists, 3 Ressourcen, 3 Service-Typen, 6 `artist_service`, Mo–Fr-Regeln je Artist, 1 `blocked_period`).

- [ ] **Step 1: Failing test**

```ts
// apps/api/src/database/seed.test.ts
import { afterAll, beforeAll, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '../testing/db.js';

let ctx: TestDb;
beforeAll(async () => { ctx = await createTestDb(); });
afterAll(async () => { await ctx.destroy(); });

it('seeds reference data', async () => {
    const artists = await ctx.db.selectFrom('artist').selectAll().execute();
    const resources = await ctx.db.selectFrom('resource').selectAll().execute();
    const services = await ctx.db.selectFrom('service_type').selectAll().execute();
    const links = await ctx.db.selectFrom('artist_service').selectAll().execute();
    const rules = await ctx.db.selectFrom('availability_rule').selectAll().execute();
    const blocks = await ctx.db.selectFrom('blocked_period').selectAll().execute();

    expect(artists).toHaveLength(2);
    expect(resources).toHaveLength(3);
    expect(services.map((s) => s.id).sort()).toEqual(['consultation', 'day-session', 'small-tattoo']);
    expect(links).toHaveLength(6);
    expect(rules.length).toBeGreaterThanOrEqual(10); // 2 artists * 5 weekdays
    expect(blocks).toHaveLength(1);

    const small = services.find((s) => s.id === 'small-tattoo');
    expect(small).toMatchObject({ duration_minutes: 120, pre_buffer_minutes: 15, deposit_tier: 'D50', deposit_cents: 5000 });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npm test --workspace @tattoo-studio/api -- database/seed`
Expected: FAIL (leere Tabellen).

- [ ] **Step 3: Seed schreiben**

```sql
-- apps/api/migrations/002_seed_reference_data.sql
INSERT INTO service_type (id, name, description, duration_minutes, pre_buffer_minutes, post_buffer_minutes, booking_mode, deposit_tier, deposit_cents) VALUES
  ('consultation', 'Tattoo-Beratung', 'Idee, Körperstelle, Stil, Machbarkeit und Preisrahmen klären.', 30, 0, 0, 'request', 'NONE', 0),
  ('small-tattoo', 'Kleines Tattoo', 'Abgestimmte, kleinere Motive mit bis zu zwei Stunden Studiozeit.', 120, 15, 15, 'request', 'D50', 5000),
  ('day-session', 'Tagessitzung', 'Längerer Termin für größere oder aufwendige Tattoo-Projekte.', 360, 30, 30, 'request', 'D150', 15000)
ON CONFLICT (id) DO NOTHING;

INSERT INTO artist (id, display_name, bio) VALUES
  ('mara', 'Mara', 'Fineline und floral.'),
  ('jon', 'Jon', 'Blackwork und Lettering.')
ON CONFLICT (id) DO NOTHING;

INSERT INTO resource (id, name, kind) VALUES
  ('station-1', 'Arbeitsplatz 1', 'station'),
  ('station-2', 'Arbeitsplatz 2', 'station'),
  ('consult-1', 'Beratungsecke', 'consult')
ON CONFLICT (id) DO NOTHING;

INSERT INTO artist_service (artist_id, service_type_id)
SELECT a.id, s.id FROM artist a CROSS JOIN service_type s
ON CONFLICT DO NOTHING;

INSERT INTO availability_rule (artist_id, weekday, start_local, end_local, valid_from)
SELECT a.id, d.wd, TIME '10:00', TIME '18:00', CURRENT_DATE
FROM artist a CROSS JOIN (VALUES (1),(2),(3),(4),(5)) AS d(wd)
ON CONFLICT DO NOTHING;

INSERT INTO blocked_period (artist_id, resource_id, starts_at, ends_at, reason)
SELECT 'jon', NULL, (CURRENT_DATE + INTERVAL '14 days'), (CURRENT_DATE + INTERVAL '21 days'), 'Urlaub'
WHERE NOT EXISTS (SELECT 1 FROM blocked_period WHERE artist_id = 'jon' AND reason = 'Urlaub');
```

- [ ] **Step 4: Run test, verify it passes**

Run: `npm test --workspace @tattoo-studio/api -- database/seed`
Expected: PASS.

- [ ] **Step 5: Zuvor übersprungenen Harness-Test aktivieren**

In `apps/api/src/testing/db.test.ts` das `it.skip` (`truncateAll clears data tables`) auf `it` zurücksetzen und laufen lassen.

Run: `npm test --workspace @tattoo-studio/api -- testing/db`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/migrations/002_seed_reference_data.sql apps/api/src/database/seed.test.ts apps/api/src/testing/db.test.ts
git commit -m "feat(api): seed placeholder artists, resources, services, availability rules"
```

---

### Task 6: Contracts — neue Zod-Schemas

**Files:**
- Create: `packages/contracts/src/errors.ts`, `service-type.ts`, `artist.ts`, `availability.ts`, `slot-hold.ts`, `admin.ts`
- Modify: `packages/contracts/src/index.ts`
- Test: `packages/contracts/src/spec-b.test.ts`

**Interfaces:**
- Produces (alle als `z.infer`-Typen exportiert):
  - `serviceTypeSchema` → `{ id, name, description, durationMinutes, preBufferMinutes, postBufferMinutes, bookingMode: 'request'|'direct', depositTier: 'NONE'|'D50'|'D100'|'D150', depositCents }`
  - `artistSchema` → `{ id, displayName, bio, timezone }`
  - `availabilityQuerySchema` → `{ serviceTypeId: string, artistId: string, from: string(YYYY-MM-DD), days: number(1..31, default 14) }` (`artistId` Default `'any'`)
  - `availabilitySlotSchema` → `{ id, artistId, artistName, startsAt, endsAt, durationMinutes, depositCents }`
  - `availabilityResponseSchema` → `{ timezone: 'Europe/Berlin', serviceType, slots[] }`
  - `slotHoldRequestSchema` → `{ serviceTypeId, artistId, startsAt, customer: { firstName, lastName, email, phone }, chaynsPersonId? }`
  - `slotHoldResponseSchema` → `{ holdId, status: 'HELD', expiresAt, artistId, startsAt, endsAt, depositCents }`
  - `holdConfirmRequestSchema` → `{ depositReceived?: { amountCents, at, method } }`
  - `holdDeclineRequestSchema` → `{ reason: string(min 1) }`
  - `apiErrorSchema`, `apiErrorCodeSchema` (Enum aller Codes aus Spec §9)

- [ ] **Step 1: Failing test**

```ts
// packages/contracts/src/spec-b.test.ts
import { describe, expect, it } from 'vitest';
import {
    availabilityQuerySchema,
    slotHoldRequestSchema,
    holdConfirmRequestSchema,
    apiErrorSchema,
} from './index.js';

describe('spec B contracts', () => {
    it('defaults availability query fields', () => {
        const q = availabilityQuerySchema.parse({ serviceTypeId: 'small-tattoo', from: '2026-09-01' });
        expect(q).toMatchObject({ artistId: 'any', days: 14 });
    });

    it('rejects days over 31', () => {
        expect(() => availabilityQuerySchema.parse({ serviceTypeId: 's', from: '2026-09-01', days: 40 })).toThrow();
    });

    it('validates a slot hold request', () => {
        const body = {
            serviceTypeId: 'small-tattoo',
            artistId: 'mara',
            startsAt: '2026-09-01T08:00:00.000Z',
            customer: { firstName: 'Ann', lastName: 'Roe', email: 'a@b.de', phone: '+49 111 222' },
        };
        expect(slotHoldRequestSchema.parse(body)).toMatchObject({ artistId: 'mara' });
    });

    it('rejects a slot hold request with a bad email', () => {
        expect(() =>
            slotHoldRequestSchema.parse({
                serviceTypeId: 's', artistId: 'a', startsAt: '2026-09-01T08:00:00.000Z',
                customer: { firstName: 'Ann', lastName: 'Roe', email: 'nope', phone: '123456' },
            }),
        ).toThrow();
    });

    it('accepts an empty confirm body', () => {
        expect(holdConfirmRequestSchema.parse({})).toEqual({});
    });

    it('describes an api error', () => {
        expect(apiErrorSchema.parse({ code: 'SLOT_CONFLICT', message: 'x' }).code).toBe('SLOT_CONFLICT');
    });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npm test --workspace @tattoo-studio/contracts`
Expected: FAIL (Exports fehlen).

- [ ] **Step 3: Schemas schreiben**

```ts
// packages/contracts/src/errors.ts
import { z } from 'zod';

export const apiErrorCodeSchema = z.enum([
    'VALIDATION_ERROR', 'UNAUTHORIZED', 'SERVICE_TYPE_NOT_FOUND', 'ARTIST_NOT_FOUND',
    'HOLD_NOT_FOUND', 'SLOT_CONFLICT', 'SLOT_NO_LONGER_AVAILABLE', 'IDEMPOTENCY_KEY_REUSED',
    'INVALID_STATE', 'RATE_LIMITED',
]);

export const apiErrorSchema = z.object({
    code: apiErrorCodeSchema.or(z.string()),
    message: z.string(),
    issues: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
    alternativeSlots: z.array(z.unknown()).optional(),
});

export type ApiErrorCode = z.infer<typeof apiErrorCodeSchema>;
export type ApiError = z.infer<typeof apiErrorSchema>;
```

```ts
// packages/contracts/src/service-type.ts
import { z } from 'zod';

export const depositTierSchema = z.enum(['NONE', 'D50', 'D100', 'D150']);

export const serviceTypeSchema = z.object({
    id: z.string(),
    name: z.string(),
    description: z.string(),
    durationMinutes: z.number().int().positive(),
    preBufferMinutes: z.number().int().nonnegative(),
    postBufferMinutes: z.number().int().nonnegative(),
    bookingMode: z.enum(['request', 'direct']),
    depositTier: depositTierSchema,
    depositCents: z.number().int().nonnegative(),
});

export type ServiceType = z.infer<typeof serviceTypeSchema>;
```

```ts
// packages/contracts/src/artist.ts
import { z } from 'zod';

export const artistSchema = z.object({
    id: z.string(),
    displayName: z.string(),
    bio: z.string(),
    timezone: z.string(),
});

export type Artist = z.infer<typeof artistSchema>;
```

```ts
// packages/contracts/src/availability.ts
import { z } from 'zod';
import { serviceTypeSchema } from './service-type.js';

export const availabilityQuerySchema = z.object({
    serviceTypeId: z.string().min(1),
    artistId: z.string().min(1).default('any'),
    from: z.iso.date(),
    days: z.coerce.number().int().min(1).max(31).default(14),
});

export const availabilitySlotSchema = z.object({
    id: z.string(),
    artistId: z.string(),
    artistName: z.string(),
    startsAt: z.iso.datetime({ offset: true }),
    endsAt: z.iso.datetime({ offset: true }),
    durationMinutes: z.number().int().positive(),
    depositCents: z.number().int().nonnegative(),
});

export const availabilityResponseSchema = z.object({
    timezone: z.literal('Europe/Berlin'),
    serviceType: serviceTypeSchema,
    slots: z.array(availabilitySlotSchema),
});

export type AvailabilityQuery = z.infer<typeof availabilityQuerySchema>;
export type AvailabilitySlot = z.infer<typeof availabilitySlotSchema>;
export type AvailabilityResponse = z.infer<typeof availabilityResponseSchema>;
```

```ts
// packages/contracts/src/slot-hold.ts
import { z } from 'zod';

export const holdCustomerSchema = z.object({
    firstName: z.string().trim().min(2).max(80),
    lastName: z.string().trim().min(2).max(80),
    email: z.email(),
    phone: z.string().trim().min(6).max(40),
});

export const slotHoldRequestSchema = z.object({
    serviceTypeId: z.string().min(1),
    artistId: z.string().min(1),
    startsAt: z.iso.datetime({ offset: true }),
    customer: holdCustomerSchema,
    chaynsPersonId: z.string().min(1).optional(),
});

export const slotHoldResponseSchema = z.object({
    holdId: z.uuid(),
    status: z.literal('HELD'),
    expiresAt: z.iso.datetime({ offset: true }),
    artistId: z.string(),
    startsAt: z.iso.datetime({ offset: true }),
    endsAt: z.iso.datetime({ offset: true }),
    depositCents: z.number().int().nonnegative(),
});

export type SlotHoldRequest = z.infer<typeof slotHoldRequestSchema>;
export type SlotHoldResponse = z.infer<typeof slotHoldResponseSchema>;
```

```ts
// packages/contracts/src/admin.ts
import { z } from 'zod';

export const holdConfirmRequestSchema = z.object({
    depositReceived: z
        .object({
            amountCents: z.number().int().nonnegative(),
            at: z.iso.datetime({ offset: true }),
            method: z.string().min(1).max(40),
        })
        .optional(),
});

export const holdDeclineRequestSchema = z.object({
    reason: z.string().trim().min(1).max(500),
});

export type HoldConfirmRequest = z.infer<typeof holdConfirmRequestSchema>;
export type HoldDeclineRequest = z.infer<typeof holdDeclineRequestSchema>;
```

- [ ] **Step 4: `index.ts` erweitern**

Am Ende von `packages/contracts/src/index.ts` ergänzen (bestehende Exporte unverändert lassen):

```ts
export * from './errors.js';
export * from './service-type.js';
export * from './artist.js';
export * from './availability.js';
export * from './slot-hold.js';
export * from './admin.js';
```

> Falls Namenskollisionen mit den Alt-Schemas auftreten (`serviceTypeSchema`, `availabilityQuerySchema`, `availabilitySlotSchema`, `availabilityResponseSchema` existieren bereits in `index.ts`): die **alten** Definitionen aus `index.ts` entfernen — die neuen ersetzen sie. `createBookingRequestSchema`/`bookingRequestSchema` bleiben.

- [ ] **Step 5: Build + Test**

Run: `npm run build --workspace @tattoo-studio/contracts && npm test --workspace @tattoo-studio/contracts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/contracts/src
git commit -m "feat(contracts): schemas for availability, slot holds and admin confirm"
```

---

### Task 7: Domain — Zeit- und Intervall-Helfer

**Files:**
- Create: `apps/api/src/domain/time.ts`
- Test: `apps/api/src/domain/time.test.ts`

**Interfaces:**
- Consumes: `luxon` (bereits Dependency).
- Produces:
  - `localWindowToUtc(date: string /*YYYY-MM-DD*/, start: string /*HH:mm*/, end: string /*HH:mm*/, tz: string): { start: Date; end: Date }`
  - `applyBuffers(sessionStart: Date, sessionEnd: Date, preMin: number, postMin: number): { blockStart: Date; blockEnd: Date }`
  - `intervalsOverlap(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean` — halboffen `[start, end)`
  - `eachDate(from: string /*YYYY-MM-DD*/, days: number): string[]` — Kalendertage als `YYYY-MM-DD`
  - `isoWeekday(date: string, tz: string): number` — 1..7

- [ ] **Step 1: Failing test**

```ts
// apps/api/src/domain/time.test.ts
import { describe, expect, it } from 'vitest';
import { applyBuffers, eachDate, intervalsOverlap, isoWeekday, localWindowToUtc } from './time.js';

describe('localWindowToUtc', () => {
    it('converts Berlin winter time (UTC+1)', () => {
        const { start, end } = localWindowToUtc('2026-01-15', '10:00', '18:00', 'Europe/Berlin');
        expect(start.toISOString()).toBe('2026-01-15T09:00:00.000Z');
        expect(end.toISOString()).toBe('2026-01-15T17:00:00.000Z');
    });

    it('converts Berlin summer time (UTC+2)', () => {
        const { start } = localWindowToUtc('2026-07-15', '10:00', '18:00', 'Europe/Berlin');
        expect(start.toISOString()).toBe('2026-07-15T08:00:00.000Z');
    });

    it('handles the spring-forward day without producing a non-existent local time', () => {
        // 2026-03-29: clocks jump 02:00 -> 03:00 in Berlin
        const { start } = localWindowToUtc('2026-03-29', '10:00', '18:00', 'Europe/Berlin');
        expect(start.toISOString()).toBe('2026-03-29T08:00:00.000Z');
    });

    it('handles the fall-back day', () => {
        // 2026-10-25: clocks fall 03:00 -> 02:00 in Berlin
        const { start } = localWindowToUtc('2026-10-25', '10:00', '18:00', 'Europe/Berlin');
        expect(start.toISOString()).toBe('2026-10-25T09:00:00.000Z');
    });
});

describe('applyBuffers', () => {
    it('extends the block by pre and post buffers', () => {
        const s = new Date('2026-09-01T08:00:00Z');
        const e = new Date('2026-09-01T10:00:00Z');
        const { blockStart, blockEnd } = applyBuffers(s, e, 15, 30);
        expect(blockStart.toISOString()).toBe('2026-09-01T07:45:00.000Z');
        expect(blockEnd.toISOString()).toBe('2026-09-01T10:30:00.000Z');
    });
});

describe('intervalsOverlap', () => {
    const d = (s: string) => new Date(s);
    it('treats touching intervals as non-overlapping', () => {
        expect(intervalsOverlap(d('2026-09-01T08:00Z'), d('2026-09-01T10:00Z'), d('2026-09-01T10:00Z'), d('2026-09-01T12:00Z'))).toBe(false);
    });
    it('detects a real overlap', () => {
        expect(intervalsOverlap(d('2026-09-01T08:00Z'), d('2026-09-01T10:00Z'), d('2026-09-01T09:00Z'), d('2026-09-01T11:00Z'))).toBe(true);
    });
});

describe('eachDate', () => {
    it('lists calendar days', () => {
        expect(eachDate('2026-02-27', 3)).toEqual(['2026-02-27', '2026-02-28', '2026-03-01']);
    });
});

describe('isoWeekday', () => {
    it('returns 1 for Monday', () => {
        expect(isoWeekday('2026-08-31', 'Europe/Berlin')).toBe(1);
    });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npm test --workspace @tattoo-studio/api -- domain/time`
Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
// apps/api/src/domain/time.ts
import { DateTime } from 'luxon';

export const localWindowToUtc = (date: string, start: string, end: string, tz: string) => {
    const toUtc = (hm: string) => {
        const [h, m] = hm.split(':').map(Number);
        const dt = DateTime.fromISO(date, { zone: tz }).set({
            hour: h,
            minute: m,
            second: 0,
            millisecond: 0,
        });
        return dt.toUTC().toJSDate();
    };
    return { start: toUtc(start), end: toUtc(end) };
};

export const applyBuffers = (
    sessionStart: Date,
    sessionEnd: Date,
    preMin: number,
    postMin: number,
) => ({
    blockStart: new Date(sessionStart.getTime() - preMin * 60_000),
    blockEnd: new Date(sessionEnd.getTime() + postMin * 60_000),
});

export const intervalsOverlap = (aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) =>
    aStart.getTime() < bEnd.getTime() && bStart.getTime() < aEnd.getTime();

export const eachDate = (from: string, days: number): string[] => {
    const base = DateTime.fromISO(from, { zone: 'utc' });
    return Array.from({ length: days }, (_, i) => base.plus({ days: i }).toISODate() as string);
};

export const isoWeekday = (date: string, tz: string): number =>
    DateTime.fromISO(date, { zone: tz }).weekday;
```

- [ ] **Step 4: Run test, verify it passes**

Run: `npm test --workspace @tattoo-studio/api -- domain/time`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/domain/time.ts apps/api/src/domain/time.test.ts
git commit -m "feat(api): timezone-safe interval and buffer helpers"
```

---

### Task 8: Domain — opake Slot-ID

**Files:**
- Create: `apps/api/src/domain/slot-id.ts`
- Test: `apps/api/src/domain/slot-id.test.ts`

**Interfaces:**
- Produces:
  - `type SlotParts = { artistId: string; serviceTypeId: string; startsAt: string /*ISO UTC*/ }`
  - `encodeSlotId(p: SlotParts): string` — base64url von `artistId|serviceTypeId|startsAt`
  - `decodeSlotId(id: string): SlotParts` — wirft `InvalidSlotIdError` bei Fehlformat
  - `class InvalidSlotIdError extends Error`

- [ ] **Step 1: Failing test**

```ts
// apps/api/src/domain/slot-id.test.ts
import { describe, expect, it } from 'vitest';
import { decodeSlotId, encodeSlotId, InvalidSlotIdError } from './slot-id.js';

describe('slot id', () => {
    const parts = { artistId: 'mara', serviceTypeId: 'small-tattoo', startsAt: '2026-09-01T08:00:00.000Z' };

    it('round-trips', () => {
        expect(decodeSlotId(encodeSlotId(parts))).toEqual(parts);
    });

    it('produces url-safe output', () => {
        expect(encodeSlotId(parts)).toMatch(/^[A-Za-z0-9_-]+$/);
    });

    it('rejects garbage', () => {
        expect(() => decodeSlotId('not-valid')).toThrow(InvalidSlotIdError);
    });

    it('rejects a token with too few parts', () => {
        expect(() => decodeSlotId(Buffer.from('a|b', 'utf8').toString('base64url'))).toThrow(InvalidSlotIdError);
    });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npm test --workspace @tattoo-studio/api -- domain/slot-id`
Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
// apps/api/src/domain/slot-id.ts
export type SlotParts = { artistId: string; serviceTypeId: string; startsAt: string };

export class InvalidSlotIdError extends Error {
    constructor(id: string) {
        super(`Invalid slot id: ${id}`);
        this.name = 'InvalidSlotIdError';
    }
}

export const encodeSlotId = (p: SlotParts): string =>
    Buffer.from(`${p.artistId}|${p.serviceTypeId}|${p.startsAt}`, 'utf8').toString('base64url');

export const decodeSlotId = (id: string): SlotParts => {
    let decoded: string;
    try {
        decoded = Buffer.from(id, 'base64url').toString('utf8');
    } catch {
        throw new InvalidSlotIdError(id);
    }
    const parts = decoded.split('|');
    if (parts.length !== 3 || parts.some((s) => s.length === 0)) throw new InvalidSlotIdError(id);
    const [artistId, serviceTypeId, startsAt] = parts as [string, string, string];
    if (Number.isNaN(Date.parse(startsAt))) throw new InvalidSlotIdError(id);
    return { artistId, serviceTypeId, startsAt };
};
```

- [ ] **Step 4: Run test, verify it passes**

Run: `npm test --workspace @tattoo-studio/api -- domain/slot-id`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/domain/slot-id.ts apps/api/src/domain/slot-id.test.ts
git commit -m "feat(api): opaque slot identifier encode/decode"
```

---

### Task 9: Domain — Statusübergänge

**Files:**
- Create: `apps/api/src/domain/status.ts`
- Test: `apps/api/src/domain/status.test.ts`

**Interfaces:**
- Consumes: `BlockStatus` aus `../database/types.js`.
- Produces:
  - `ALLOWED_TRANSITIONS: Record<BlockStatus, readonly BlockStatus[]>`
  - `canTransition(from: BlockStatus, to: BlockStatus): boolean`
  - `assertTransition(from: BlockStatus, to: BlockStatus): void` — wirft `InvalidStateError`
  - `class InvalidStateError extends Error` (mit `.from`, `.to`)

- [ ] **Step 1: Failing test**

```ts
// apps/api/src/domain/status.test.ts
import { describe, expect, it } from 'vitest';
import { assertTransition, canTransition, InvalidStateError } from './status.js';

describe('block status transitions', () => {
    it('allows the hold lifecycle', () => {
        expect(canTransition('HELD', 'EXPIRED')).toBe(true);
        expect(canTransition('HELD', 'CANCELLED')).toBe(true);
        expect(canTransition('HELD', 'CONFIRMED')).toBe(true);
        expect(canTransition('PAYMENT_PENDING', 'CONFIRMED')).toBe(true);
        expect(canTransition('CONFIRMED', 'COMPLETED')).toBe(true);
    });

    it('forbids resurrecting a terminal state', () => {
        expect(canTransition('CANCELLED', 'CONFIRMED')).toBe(false);
        expect(canTransition('EXPIRED', 'HELD')).toBe(false);
        expect(canTransition('COMPLETED', 'CONFIRMED')).toBe(false);
    });

    it('assertTransition throws with context', () => {
        try {
            assertTransition('EXPIRED', 'CONFIRMED');
            throw new Error('should have thrown');
        } catch (e) {
            expect(e).toBeInstanceOf(InvalidStateError);
            expect((e as InvalidStateError).from).toBe('EXPIRED');
        }
    });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npm test --workspace @tattoo-studio/api -- domain/status`
Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
// apps/api/src/domain/status.ts
import type { BlockStatus } from '../database/types.js';

export const ALLOWED_TRANSITIONS: Record<BlockStatus, readonly BlockStatus[]> = {
    HELD: ['PAYMENT_PENDING', 'CONFIRMED', 'EXPIRED', 'CANCELLED'],
    PAYMENT_PENDING: ['CONFIRMED', 'EXPIRED', 'CANCELLED'],
    CONFIRMED: ['COMPLETED', 'CANCELLED'],
    COMPLETED: [],
    EXPIRED: [],
    CANCELLED: [],
};

export class InvalidStateError extends Error {
    readonly from: BlockStatus;
    readonly to: BlockStatus;
    constructor(from: BlockStatus, to: BlockStatus) {
        super(`Cannot transition appointment_block from ${from} to ${to}`);
        this.name = 'InvalidStateError';
        this.from = from;
        this.to = to;
    }
}

export const canTransition = (from: BlockStatus, to: BlockStatus): boolean =>
    ALLOWED_TRANSITIONS[from].includes(to);

export const assertTransition = (from: BlockStatus, to: BlockStatus): void => {
    if (!canTransition(from, to)) throw new InvalidStateError(from, to);
};
```

- [ ] **Step 4: Run test, verify it passes**

Run: `npm test --workspace @tattoo-studio/api -- domain/status`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/domain/status.ts apps/api/src/domain/status.test.ts
git commit -m "feat(api): appointment block status transition guard"
```

---

### Task 10: Domain — Verfügbarkeits-Engine

**Files:**
- Create: `apps/api/src/domain/availability.ts`
- Test: `apps/api/src/domain/availability.test.ts`

**Interfaces:**
- Consumes: `localWindowToUtc`, `applyBuffers`, `intervalsOverlap`, `eachDate`, `isoWeekday` (Task 7).
- Produces:

```ts
export type EngineServiceType = {
    id: string;
    durationMinutes: number;
    preBufferMinutes: number;
    postBufferMinutes: number;
    bookingMode: 'request' | 'direct';
};
export type EngineArtist = { id: string; timezone: string };
export type EngineRule = { artistId: string; weekday: number; startLocal: string; endLocal: string; validFrom: string; validTo: string | null };
export type EngineBlocked = { artistId: string | null; resourceId: string | null; startsAt: Date; endsAt: Date };
export type EngineBlock = { artistId: string; resourceId: string; startsAt: Date; endsAt: Date };
export type EngineResource = { id: string; kind: 'station' | 'consult' };

export type EngineInput = {
    serviceType: EngineServiceType;
    artists: EngineArtist[];
    rules: EngineRule[];
    blockedPeriods: EngineBlocked[];
    existingBlocks: EngineBlock[];
    resources: EngineResource[];
    from: string;   // YYYY-MM-DD
    days: number;
    now: Date;
    config: { gridMinutes: number; minLeadHours: number };
};

export type EngineSlot = { artistId: string; startsAt: Date; endsAt: Date };

export function computeSlots(input: EngineInput): EngineSlot[];
```

- Regeln:
  - Ressourcen-Kind: `serviceType.id === 'consultation'` → `'consult'`, sonst `'station'`.
  - `startsAt`/`endsAt` im `EngineSlot` sind **Sitzungszeiten** (ohne Puffer).
  - Ein Kandidat ist gültig, wenn: (a) `[sessionStart-pre, sessionEnd+post)` vollständig in einem Regelfenster liegt, (b) nicht mit `blockedPeriods` des Artists kollidiert, (c) nicht mit `existingBlocks` des Artists kollidiert, (d) mindestens eine Ressource des passenden Kinds frei ist (nicht in `existingBlocks` mit dieser `resourceId`, nicht in ressourcenweiter `blockedPeriods`), (e) `sessionStart >= now + minLeadHours`.
  - Sortierung: `startsAt` asc, dann `artistId` asc.

- [ ] **Step 1: Failing test**

```ts
// apps/api/src/domain/availability.test.ts
import { describe, expect, it } from 'vitest';
import { computeSlots, type EngineInput } from './availability.js';

const baseInput = (over: Partial<EngineInput> = {}): EngineInput => ({
    serviceType: { id: 'small-tattoo', durationMinutes: 120, preBufferMinutes: 15, postBufferMinutes: 15, bookingMode: 'request' },
    artists: [{ id: 'mara', timezone: 'Europe/Berlin' }],
    rules: [{ artistId: 'mara', weekday: 2, startLocal: '10:00', endLocal: '18:00', validFrom: '2026-01-01', validTo: null }],
    blockedPeriods: [],
    existingBlocks: [],
    resources: [{ id: 'station-1', kind: 'station' }, { id: 'station-2', kind: 'station' }],
    from: '2026-09-01', // Tuesday
    days: 1,
    now: new Date('2026-08-01T00:00:00Z'),
    config: { gridMinutes: 60, minLeadHours: 12 },
    ...over,
});

describe('computeSlots', () => {
    it('places grid starts inside the rule window, respecting buffers', () => {
        const slots = computeSlots(baseInput());
        // window 10:00-18:00 local = 08:00-16:00Z; need 15+120+15 = 150 min block.
        // first session start where block fits: 10:15 local (block 10:00) ... on a 60-min grid: 11:00,12:00,13:00,14:00,15:00 local? check post: 15:00+120+15=17:15<=18:00 ok; 16:00 -> 18:15 no.
        const localHours = slots.map((s) => new Date(s.startsAt).toISOString());
        expect(slots.length).toBeGreaterThan(0);
        expect(new Date(slots[0]!.startsAt).toISOString()).toBe('2026-09-01T09:00:00.000Z'); // 11:00 local
        expect(localHours).not.toContain('2026-09-01T14:00:00.000Z'); // 16:00 local would overflow
    });

    it('excludes a day with no matching rule weekday', () => {
        const slots = computeSlots(baseInput({ from: '2026-09-02', days: 1 })); // Wednesday, no rule
        expect(slots).toHaveLength(0);
    });

    it('subtracts an artist-wide blocked period', () => {
        const slots = computeSlots(baseInput({
            blockedPeriods: [{ artistId: 'mara', resourceId: null, startsAt: new Date('2026-09-01T00:00:00Z'), endsAt: new Date('2026-09-02T00:00:00Z') }],
        }));
        expect(slots).toHaveLength(0);
    });

    it('subtracts an existing blocking appointment block for the artist', () => {
        const slots = computeSlots(baseInput({
            existingBlocks: [{ artistId: 'mara', resourceId: 'station-1', startsAt: new Date('2026-09-01T08:00:00Z'), endsAt: new Date('2026-09-01T16:00:00Z') }],
        }));
        // station-1 fully blocked all day but station-2 is still free -> slots remain
        expect(slots.length).toBeGreaterThan(0);
    });

    it('returns nothing when every resource is taken', () => {
        const slots = computeSlots(baseInput({
            existingBlocks: [
                { artistId: 'other', resourceId: 'station-1', startsAt: new Date('2026-09-01T00:00:00Z'), endsAt: new Date('2026-09-02T00:00:00Z') },
                { artistId: 'other2', resourceId: 'station-2', startsAt: new Date('2026-09-01T00:00:00Z'), endsAt: new Date('2026-09-02T00:00:00Z') },
            ],
        }));
        expect(slots).toHaveLength(0);
    });

    it('honours the minimum lead time', () => {
        const slots = computeSlots(baseInput({ now: new Date('2026-09-01T06:00:00Z') })); // 6h before window
        expect(slots).toHaveLength(0); // 12h lead not met for any 2026-09-01 slot
    });

    it('merges and sorts slots from multiple artists', () => {
        const slots = computeSlots(baseInput({
            artists: [{ id: 'mara', timezone: 'Europe/Berlin' }, { id: 'jon', timezone: 'Europe/Berlin' }],
            rules: [
                { artistId: 'mara', weekday: 2, startLocal: '10:00', endLocal: '18:00', validFrom: '2026-01-01', validTo: null },
                { artistId: 'jon', weekday: 2, startLocal: '10:00', endLocal: '18:00', validFrom: '2026-01-01', validTo: null },
            ],
        }));
        const times = slots.map((s) => s.startsAt.getTime());
        expect(times).toEqual([...times].sort((a, b) => a - b));
        expect(new Set(slots.map((s) => s.artistId))).toEqual(new Set(['mara', 'jon']));
    });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npm test --workspace @tattoo-studio/api -- domain/availability`
Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
// apps/api/src/domain/availability.ts
import { applyBuffers, eachDate, intervalsOverlap, isoWeekday, localWindowToUtc } from './time.js';

// ... (Typen wie im Interfaces-Block oben)

const neededKind = (serviceTypeId: string): 'station' | 'consult' =>
    serviceTypeId === 'consultation' ? 'consult' : 'station';

const withinWindow = (s: Date, e: Date, wStart: Date, wEnd: Date) =>
    s.getTime() >= wStart.getTime() && e.getTime() <= wEnd.getTime();

export function computeSlots(input: EngineInput): EngineSlot[] {
    const { serviceType: st, config } = input;
    const kind = neededKind(st.id);
    const candidateResources = input.resources.filter((r) => r.kind === kind);
    const earliest = new Date(input.now.getTime() + config.minLeadHours * 3_600_000);
    const durationMs = st.durationMinutes * 60_000;
    const gridMs = config.gridMinutes * 60_000;
    const dates = eachDate(input.from, input.days);
    const out: EngineSlot[] = [];

    for (const artist of input.artists) {
        const artistRules = input.rules.filter((r) => r.artistId === artist.id);
        const artistBlocked = input.blockedPeriods.filter(
            (b) => b.artistId === artist.id || (b.artistId === null && b.resourceId !== null),
        );
        const artistBlocks = input.existingBlocks.filter((b) => b.artistId === artist.id);

        for (const date of dates) {
            const wd = isoWeekday(date, artist.timezone);
            for (const rule of artistRules) {
                if (rule.weekday !== wd) continue;
                if (date < rule.validFrom) continue;
                if (rule.validTo !== null && date >= rule.validTo) continue;

                const { start: wStart, end: wEnd } = localWindowToUtc(
                    date,
                    rule.startLocal,
                    rule.endLocal,
                    artist.timezone,
                );

                for (let t = wStart.getTime(); ; t += gridMs) {
                    const sessionStart = new Date(t);
                    const sessionEnd = new Date(t + durationMs);
                    const { blockStart, blockEnd } = applyBuffers(
                        sessionStart,
                        sessionEnd,
                        st.preBufferMinutes,
                        st.postBufferMinutes,
                    );
                    if (blockEnd.getTime() > wEnd.getTime()) break;
                    if (sessionStart.getTime() < earliest.getTime()) continue;

                    const artistBusy = artistBlocks.some((b) =>
                        intervalsOverlap(blockStart, blockEnd, b.startsAt, b.endsAt),
                    );
                    if (artistBusy) continue;

                    const artistBlockedHit = input.blockedPeriods.some(
                        (b) =>
                            b.artistId === artist.id &&
                            b.resourceId === null &&
                            intervalsOverlap(blockStart, blockEnd, b.startsAt, b.endsAt),
                    );
                    if (artistBlockedHit) continue;

                    const hasFreeResource = candidateResources.some((res) => {
                        const takenByBlock = input.existingBlocks.some(
                            (b) =>
                                b.resourceId === res.id &&
                                intervalsOverlap(blockStart, blockEnd, b.startsAt, b.endsAt),
                        );
                        const takenByBlocked = input.blockedPeriods.some(
                            (b) =>
                                b.resourceId === res.id &&
                                intervalsOverlap(blockStart, blockEnd, b.startsAt, b.endsAt),
                        );
                        return !takenByBlock && !takenByBlocked;
                    });
                    if (!hasFreeResource) continue;

                    out.push({ artistId: artist.id, startsAt: sessionStart, endsAt: sessionEnd });
                }
            }
        }
    }

    return out.sort(
        (a, b) => a.startsAt.getTime() - b.startsAt.getTime() || a.artistId.localeCompare(b.artistId),
    );
}
```

> `artistBlocked` (unbenutzte Zwischenvariable) im finalen Code entfernen — der Filter erfolgt inline. Die Engine ist bewusst O(days · rules · gridSlots · resources); bei den MVP-Größen unkritisch.

- [ ] **Step 4: Run test, verify it passes**

Run: `npm test --workspace @tattoo-studio/api -- domain/availability`
Expected: PASS. Falls die erste Assertion (`09:00:00.000Z`) nicht stimmt, die Grid-Erwartung im Test an die tatsächliche Fenster-/Puffer-Arithmetik anpassen — die **Regel** (Block muss ganz ins Fenster passen, Sitzungszeit ausgegeben) ist maßgeblich, nicht die exemplarische Uhrzeit.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/domain/availability.ts apps/api/src/domain/availability.test.ts
git commit -m "feat(api): pure availability engine over rules, blocks and resources"
```

---

### Task 11: Referenzdaten-Repository

**Files:**
- Create: `apps/api/src/repositories/reference.ts`
- Test: `apps/api/src/repositories/reference.test.ts`

**Interfaces:**
- Consumes: `Kysely<Database>`.
- Produces (alle nehmen `db: Kysely<Database>` als erstes Argument):
  - `getServiceType(db, id: string): Promise<ServiceTypeRow | undefined>` — `ServiceTypeRow` = alle Spalten von `service_type`
  - `getActiveArtistsForService(db, serviceTypeId: string): Promise<ArtistRow[]>` — Artists mit `active = true` ∧ `artist_service`-Eintrag
  - `getActiveResources(db, kind: 'station' | 'consult'): Promise<ResourceRow[]>`
  - `getAvailabilityRules(db, artistIds: string[], fromDate: string, toDate: string): Promise<AvailabilityRuleRow[]>` — Regeln, deren `[valid_from, valid_to)` das Fenster schneidet
  - `getBlockedPeriods(db, artistIds: string[], resourceIds: string[], from: Date, to: Date): Promise<BlockedPeriodRow[]>`
  - `getBlockingBlocks(db, artistIds: string[], from: Date, to: Date): Promise<BlockingBlockRow[]>` — `status IN ('HELD','PAYMENT_PENDING','CONFIRMED')`, `[starts_at, ends_at)` schneidet Fenster; Felder `artist_id, resource_id, starts_at, ends_at`

- [ ] **Step 1: Failing test**

```ts
// apps/api/src/repositories/reference.test.ts
import { afterAll, afterEach, beforeAll, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '../testing/db.js';
import {
    getActiveArtistsForService,
    getActiveResources,
    getAvailabilityRules,
    getBlockingBlocks,
    getServiceType,
} from './reference.js';

let ctx: TestDb;
beforeAll(async () => { ctx = await createTestDb(); });
afterEach(async () => {
    await ctx.db.deleteFrom('appointment_block').execute();
});
afterAll(async () => { await ctx.destroy(); });

it('reads a seeded service type', async () => {
    const st = await getServiceType(ctx.db, 'small-tattoo');
    expect(st).toMatchObject({ duration_minutes: 120, pre_buffer_minutes: 15 });
});

it('lists artists offering a service', async () => {
    const artists = await getActiveArtistsForService(ctx.db, 'small-tattoo');
    expect(artists.map((a) => a.id).sort()).toEqual(['jon', 'mara']);
});

it('lists station resources', async () => {
    const res = await getActiveResources(ctx.db, 'station');
    expect(res).toHaveLength(2);
});

it('reads availability rules for a window', async () => {
    const rules = await getAvailabilityRules(ctx.db, ['mara'], '2026-09-01', '2026-09-08');
    expect(rules.length).toBe(5);
});

it('reads only blocking-status blocks intersecting the window', async () => {
    const c = await ctx.db.insertInto('customer').values({ first_name: 'F', last_name: 'L', email: 'e@x.de', phone: '123456' }).returning('id').executeTakeFirstOrThrow();
    const common = {
        artist_id: 'mara', resource_id: 'station-1', service_type_id: 'small-tattoo', customer_id: c.id,
        session_starts_at: '2026-09-01T08:00:00Z', session_ends_at: '2026-09-01T10:00:00Z', deposit_cents: 0,
    };
    await ctx.db.insertInto('appointment_block').values([
        { ...common, starts_at: '2026-09-01T08:00:00Z', ends_at: '2026-09-01T10:00:00Z', status: 'CONFIRMED' },
        { ...common, resource_id: 'station-2', starts_at: '2026-09-01T12:00:00Z', ends_at: '2026-09-01T14:00:00Z', status: 'EXPIRED' },
    ]).execute();

    const blocks = await getBlockingBlocks(ctx.db, ['mara'], new Date('2026-09-01T00:00:00Z'), new Date('2026-09-02T00:00:00Z'));
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({ status_free: undefined });
    expect(blocks[0]!.resource_id).toBe('station-1');
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npm test --workspace @tattoo-studio/api -- repositories/reference`
Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
// apps/api/src/repositories/reference.ts
import type { Kysely, Selectable } from 'kysely';
import type {
    AppointmentBlockTable, ArtistTable, AvailabilityRuleTable, BlockedPeriodTable,
    Database, ResourceTable, ServiceTypeTable,
} from '../database/types.js';

export type ServiceTypeRow = Selectable<ServiceTypeTable>;
export type ArtistRow = Selectable<ArtistTable>;
export type ResourceRow = Selectable<ResourceTable>;
export type AvailabilityRuleRow = Selectable<AvailabilityRuleTable>;
export type BlockedPeriodRow = Selectable<BlockedPeriodTable>;
export type BlockingBlockRow = Pick<Selectable<AppointmentBlockTable>, 'artist_id' | 'resource_id' | 'starts_at' | 'ends_at' | 'status'>;

const BLOCKING = ['HELD', 'PAYMENT_PENDING', 'CONFIRMED'] as const;

export const getServiceType = (db: Kysely<Database>, id: string) =>
    db.selectFrom('service_type').selectAll().where('id', '=', id).executeTakeFirst();

export const getActiveArtistsForService = (db: Kysely<Database>, serviceTypeId: string) =>
    db
        .selectFrom('artist')
        .innerJoin('artist_service', 'artist_service.artist_id', 'artist.id')
        .where('artist_service.service_type_id', '=', serviceTypeId)
        .where('artist.active', '=', true)
        .selectAll('artist')
        .execute();

export const getActiveResources = (db: Kysely<Database>, kind: 'station' | 'consult') =>
    db.selectFrom('resource').selectAll().where('kind', '=', kind).where('active', '=', true).execute();

export const getAvailabilityRules = (
    db: Kysely<Database>,
    artistIds: string[],
    fromDate: string,
    toDate: string,
) =>
    db
        .selectFrom('availability_rule')
        .selectAll()
        .where('artist_id', 'in', artistIds.length ? artistIds : ['__none__'])
        .where('valid_from', '<', toDate)
        .where((eb) => eb.or([eb('valid_to', 'is', null), eb('valid_to', '>', fromDate)]))
        .execute();

export const getBlockedPeriods = (
    db: Kysely<Database>,
    artistIds: string[],
    resourceIds: string[],
    from: Date,
    to: Date,
) =>
    db
        .selectFrom('blocked_period')
        .selectAll()
        .where('starts_at', '<', to)
        .where('ends_at', '>', from)
        .where((eb) =>
            eb.or([
                eb('artist_id', 'in', artistIds.length ? artistIds : ['__none__']),
                eb('resource_id', 'in', resourceIds.length ? resourceIds : ['__none__']),
            ]),
        )
        .execute();

export const getBlockingBlocks = (
    db: Kysely<Database>,
    artistIds: string[],
    from: Date,
    to: Date,
): Promise<BlockingBlockRow[]> =>
    db
        .selectFrom('appointment_block')
        .select(['artist_id', 'resource_id', 'starts_at', 'ends_at', 'status'])
        .where('artist_id', 'in', artistIds.length ? artistIds : ['__none__'])
        .where('status', 'in', BLOCKING as unknown as string[])
        .where('starts_at', '<', to)
        .where('ends_at', '>', from)
        .execute();
```

> Im Test die überflüssige `status_free`-Assertion entfernen (Copy-Fehler); es genügt `expect(blocks).toHaveLength(1)` + `resource_id`-Check.

- [ ] **Step 4: Run test, verify it passes**

Run: `npm test --workspace @tattoo-studio/api -- repositories/reference`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/repositories/reference.ts apps/api/src/repositories/reference.test.ts
git commit -m "feat(api): reference-data read repository"
```

---

### Task 12: Availability-Service + Route

**Files:**
- Create: `apps/api/src/services/availability-service.ts`
- Create: `apps/api/src/routes/availability.ts`
- Modify: `apps/api/src/app.ts`
- Test: `apps/api/src/routes/availability.test.ts`

**Interfaces:**
- Consumes: `computeSlots` (Task 10), reference repo (Task 11), `encodeSlotId` (Task 8), contracts (Task 6), `AppConfig` (Task 1).
- Produces:
  - `getAvailability(db: Kysely<Database>, config: AppConfig, query: AvailabilityQuery): Promise<AvailabilityResponse>` — wirft `ServiceTypeNotFoundError` / `ArtistNotFoundError`
  - `class ServiceTypeNotFoundError extends Error`, `class ArtistNotFoundError extends Error`
  - Fastify-Plugin `availabilityRoutes(app, opts: { db; config })` — registriert `GET /v1/availability`
  - `app.ts`: `buildApp` nimmt zusätzlich `config?: AppConfig` und `db?: Kysely<Database>` in `BuildAppOptions`.

- [ ] **Step 1: Failing test**

```ts
// apps/api/src/routes/availability.test.ts
import { afterAll, afterEach, beforeAll, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '../testing/db.js';
import { buildApp } from '../app.js';
import type { AppConfig } from '../config.js';

const config: AppConfig = {
    gridMinutes: 60, minLeadHours: 12, holdTtlHours: 48, maxAvailabilityDays: 31,
    adminApiToken: 'test', workerIntervalSeconds: 60, rateLimitMax: 1000,
};

let ctx: TestDb;
let app: ReturnType<typeof buildApp>;
beforeAll(async () => {
    ctx = await createTestDb();
    app = buildApp({ db: ctx.db, config });
    await app.ready();
});
afterEach(async () => { await ctx.db.deleteFrom('blocked_period').where('reason', '=', 'test').execute(); });
afterAll(async () => { await app.close(); await ctx.destroy(); });

const near = () => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + 3);
    // roll forward to a weekday
    while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString().slice(0, 10);
};

it('returns slots for a service across all artists', async () => {
    const res = await app.inject({ method: 'GET', url: `/v1/availability?serviceTypeId=small-tattoo&from=${near()}&days=1` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.timezone).toBe('Europe/Berlin');
    expect(body.slots.length).toBeGreaterThan(0);
    expect(new Set(body.slots.map((s: { artistId: string }) => s.artistId))).toEqual(new Set(['mara', 'jon']));
});

it('filters by artistId', async () => {
    const res = await app.inject({ method: 'GET', url: `/v1/availability?serviceTypeId=small-tattoo&artistId=mara&from=${near()}&days=1` });
    const body = res.json();
    expect(body.slots.every((s: { artistId: string }) => s.artistId === 'mara')).toBe(true);
});

it('404s on an unknown service type', async () => {
    const res = await app.inject({ method: 'GET', url: `/v1/availability?serviceTypeId=nope&from=${near()}&days=1` });
    expect(res.statusCode).toBe(404);
    expect(res.json().code).toBe('SERVICE_TYPE_NOT_FOUND');
});

it('400s on a bad query', async () => {
    const res = await app.inject({ method: 'GET', url: `/v1/availability?serviceTypeId=small-tattoo&from=not-a-date` });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('VALIDATION_ERROR');
});

it('drops slots covered by a blocked period', async () => {
    const day = near();
    await ctx.db.insertInto('blocked_period').values({
        artist_id: 'mara', resource_id: null,
        starts_at: `${day}T00:00:00Z`, ends_at: `${day}T23:59:00Z`, reason: 'test',
    }).execute();
    const res = await app.inject({ method: 'GET', url: `/v1/availability?serviceTypeId=small-tattoo&artistId=mara&from=${day}&days=1` });
    expect(res.json().slots).toHaveLength(0);
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npm test --workspace @tattoo-studio/api -- routes/availability`
Expected: FAIL.

- [ ] **Step 3: Service implementieren**

```ts
// apps/api/src/services/availability-service.ts
import type { Kysely } from 'kysely';
import type { AvailabilityQuery, AvailabilityResponse } from '@tattoo-studio/contracts';
import type { AppConfig } from '../config.js';
import type { Database } from '../database/types.js';
import { computeSlots } from '../domain/availability.js';
import { encodeSlotId } from '../domain/slot-id.js';
import {
    getActiveArtistsForService, getActiveResources, getAvailabilityRules,
    getBlockedPeriods, getBlockingBlocks, getServiceType,
} from '../repositories/reference.js';
import { eachDate } from '../domain/time.js';

export class ServiceTypeNotFoundError extends Error {}
export class ArtistNotFoundError extends Error {}

const toContractServiceType = (row: Awaited<ReturnType<typeof getServiceType>>) => ({
    id: row!.id,
    name: row!.name,
    description: row!.description,
    durationMinutes: row!.duration_minutes,
    preBufferMinutes: row!.pre_buffer_minutes,
    postBufferMinutes: row!.post_buffer_minutes,
    bookingMode: row!.booking_mode,
    depositTier: row!.deposit_tier,
    depositCents: row!.deposit_cents,
});

export const getAvailability = async (
    db: Kysely<Database>,
    config: AppConfig,
    query: AvailabilityQuery,
): Promise<AvailabilityResponse> => {
    const st = await getServiceType(db, query.serviceTypeId);
    if (!st) throw new ServiceTypeNotFoundError(query.serviceTypeId);

    const days = Math.min(query.days, config.maxAvailabilityDays);
    let artists = await getActiveArtistsForService(db, st.id);
    if (query.artistId !== 'any') {
        artists = artists.filter((a) => a.id === query.artistId);
        if (artists.length === 0) throw new ArtistNotFoundError(query.artistId);
    }

    const kind = st.id === 'consultation' ? ('consult' as const) : ('station' as const);
    const resources = await getActiveResources(db, kind);
    const artistIds = artists.map((a) => a.id);
    const resourceIds = resources.map((r) => r.id);

    const dates = eachDate(query.from, days);
    const from = new Date(`${dates[0]}T00:00:00Z`);
    const to = new Date(`${dates[dates.length - 1]}T23:59:59Z`);
    // Puffer für Zeitzonen-Ränder: eine Tagesbreite auf beiden Seiten
    from.setUTCDate(from.getUTCDate() - 1);
    to.setUTCDate(to.getUTCDate() + 1);

    const [rules, blockedPeriods, blocks] = await Promise.all([
        getAvailabilityRules(db, artistIds, query.from, dates[dates.length - 1]!),
        getBlockedPeriods(db, artistIds, resourceIds, from, to),
        getBlockingBlocks(db, artistIds, from, to),
    ]);

    const slots = computeSlots({
        serviceType: {
            id: st.id,
            durationMinutes: st.duration_minutes,
            preBufferMinutes: st.pre_buffer_minutes,
            postBufferMinutes: st.post_buffer_minutes,
            bookingMode: st.booking_mode,
        },
        artists: artists.map((a) => ({ id: a.id, timezone: a.timezone })),
        rules: rules.map((r) => ({
            artistId: r.artist_id,
            weekday: r.weekday,
            startLocal: r.start_local,
            endLocal: r.end_local,
            validFrom: r.valid_from,
            validTo: r.valid_to,
        })),
        blockedPeriods: blockedPeriods.map((b) => ({
            artistId: b.artist_id,
            resourceId: b.resource_id,
            startsAt: new Date(b.starts_at),
            endsAt: new Date(b.ends_at),
        })),
        existingBlocks: blocks.map((b) => ({
            artistId: b.artist_id,
            resourceId: b.resource_id,
            startsAt: new Date(b.starts_at),
            endsAt: new Date(b.ends_at),
        })),
        resources: resources.map((r) => ({ id: r.id, kind: r.kind })),
        from: query.from,
        days,
        now: new Date(),
        config: { gridMinutes: config.gridMinutes, minLeadHours: config.minLeadHours },
    });

    const nameById = new Map(artists.map((a) => [a.id, a.display_name]));

    return {
        timezone: 'Europe/Berlin',
        serviceType: toContractServiceType(st),
        slots: slots.map((s) => ({
            id: encodeSlotId({ artistId: s.artistId, serviceTypeId: st.id, startsAt: s.startsAt.toISOString() }),
            artistId: s.artistId,
            artistName: nameById.get(s.artistId) ?? s.artistId,
            startsAt: s.startsAt.toISOString(),
            endsAt: s.endsAt.toISOString(),
            durationMinutes: st.duration_minutes,
            depositCents: st.deposit_cents,
        })),
    };
};
```

- [ ] **Step 4: Route implementieren**

```ts
// apps/api/src/routes/availability.ts
import type { FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import { availabilityQuerySchema } from '@tattoo-studio/contracts';
import type { AppConfig } from '../config.js';
import type { Database } from '../database/types.js';
import { ArtistNotFoundError, getAvailability, ServiceTypeNotFoundError } from '../services/availability-service.js';

export const availabilityRoutes = async (
    app: FastifyInstance,
    opts: { db: Kysely<Database>; config: AppConfig },
) => {
    app.get('/v1/availability', async (request, reply) => {
        const parsed = availabilityQuerySchema.safeParse(request.query);
        if (!parsed.success) {
            return reply.status(400).send({
                code: 'VALIDATION_ERROR',
                message: 'Die Abfrageparameter sind ungültig.',
                issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
            });
        }
        try {
            return await getAvailability(opts.db, opts.config, parsed.data);
        } catch (err) {
            if (err instanceof ServiceTypeNotFoundError) {
                return reply.status(404).send({ code: 'SERVICE_TYPE_NOT_FOUND', message: 'Terminart nicht gefunden.' });
            }
            if (err instanceof ArtistNotFoundError) {
                return reply.status(404).send({ code: 'ARTIST_NOT_FOUND', message: 'Artist nicht gefunden.' });
            }
            throw err;
        }
    });
};
```

- [ ] **Step 5: `app.ts` erweitern**

`BuildAppOptions` um `config?: AppConfig` und `db?: Kysely<Database>` ergänzen. Wenn `db` und `config` gesetzt sind, `app.register(availabilityRoutes, { db, config })`. Bestehende `/api/v1/*`-Routen und `MemoryBookingRequestRepository`-Default unverändert lassen. `onClose`-Hook: `db` **nicht** hier schließen (Ownership liegt beim Aufrufer/`server.ts`).

- [ ] **Step 6: Run test, verify it passes**

Run: `npm test --workspace @tattoo-studio/api -- routes/availability`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/services/availability-service.ts apps/api/src/routes/availability.ts apps/api/src/app.ts apps/api/src/routes/availability.test.ts
git commit -m "feat(api): GET /v1/availability backed by the calendar engine"
```

---

### Task 13: Idempotency-, Outbox- und Audit-Repositories

**Files:**
- Create: `apps/api/src/repositories/idempotency.ts`, `outbox.ts`, `audit.ts`
- Test: `apps/api/src/repositories/betrieb.test.ts`

**Interfaces:**
- Consumes: `Kysely<Database>` bzw. `Transaction<Database>` (beide erfüllen `Kysely<Database>` als Parametertyp — Parameter heißt `exec`).
- Produces:
  - `hashRequestBody(body: unknown): string` — SHA-256 hex des kanonisch sortierten JSON
  - `findIdempotencyRecord(exec, key: string): Promise<{ requestHash: string; responseJson: unknown; statusCode: number } | undefined>`
  - `saveIdempotencyRecord(exec, r: { key: string; route: string; requestHash: string; responseJson: unknown; statusCode: number; ttlHours?: number }): Promise<void>`
  - `enqueueOutbox(exec, e: { type: string; payload: unknown }): Promise<void>`
  - `listPendingOutbox(exec, limit: number): Promise<Array<{ id: string; type: string; payload: unknown }>>`
  - `recordAudit(exec, e: { actor: string; action: string; entityType: string; entityId: string; before?: unknown; after?: unknown }): Promise<void>`

- [ ] **Step 1: Failing test**

```ts
// apps/api/src/repositories/betrieb.test.ts
import { afterAll, afterEach, beforeAll, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '../testing/db.js';
import { findIdempotencyRecord, hashRequestBody, saveIdempotencyRecord } from './idempotency.js';
import { enqueueOutbox, listPendingOutbox } from './outbox.js';
import { recordAudit } from './audit.js';

let ctx: TestDb;
beforeAll(async () => { ctx = await createTestDb(); });
afterEach(async () => {
    await ctx.db.deleteFrom('idempotency_key').execute();
    await ctx.db.deleteFrom('outbox_event').execute();
    await ctx.db.deleteFrom('audit_event').execute();
});
afterAll(async () => { await ctx.destroy(); });

it('hash is stable regardless of key order', () => {
    expect(hashRequestBody({ a: 1, b: 2 })).toBe(hashRequestBody({ b: 2, a: 1 }));
    expect(hashRequestBody({ a: 1 })).not.toBe(hashRequestBody({ a: 2 }));
});

it('stores and replays an idempotency record', async () => {
    await saveIdempotencyRecord(ctx.db, {
        key: 'k1', route: 'POST /v1/slot-holds', requestHash: 'h1',
        responseJson: { holdId: 'x' }, statusCode: 201,
    });
    const found = await findIdempotencyRecord(ctx.db, 'k1');
    expect(found).toMatchObject({ requestHash: 'h1', statusCode: 201, responseJson: { holdId: 'x' } });
});

it('enqueues and lists pending outbox events', async () => {
    await enqueueOutbox(ctx.db, { type: 'slot_hold.created', payload: { holdId: 'x' } });
    const pending = await listPendingOutbox(ctx.db, 10);
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({ type: 'slot_hold.created', payload: { holdId: 'x' } });
});

it('records an audit event', async () => {
    await recordAudit(ctx.db, { actor: 'studio', action: 'appointment.confirmed', entityType: 'appointment_block', entityId: 'b1', after: { status: 'CONFIRMED' } });
    const rows = await ctx.db.selectFrom('audit_event').selectAll().execute();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.action).toBe('appointment.confirmed');
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npm test --workspace @tattoo-studio/api -- repositories/betrieb`
Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
// apps/api/src/repositories/idempotency.ts
import { createHash } from 'node:crypto';
import type { Kysely } from 'kysely';
import type { Database } from '../database/types.js';

const canonical = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(canonical);
    if (v && typeof v === 'object') {
        return Object.fromEntries(
            Object.entries(v as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([k, val]) => [k, canonical(val)]),
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
        responseJson: typeof row.response_json === 'string' ? JSON.parse(row.response_json) : row.response_json,
        statusCode: row.status_code,
    };
};

export const saveIdempotencyRecord = async (
    exec: Kysely<Database>,
    r: { key: string; route: string; requestHash: string; responseJson: unknown; statusCode: number; ttlHours?: number },
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
```

```ts
// apps/api/src/repositories/outbox.ts
import type { Kysely } from 'kysely';
import type { Database } from '../database/types.js';

export const enqueueOutbox = async (exec: Kysely<Database>, e: { type: string; payload: unknown }) => {
    await exec.insertInto('outbox_event').values({ type: e.type, payload: JSON.stringify(e.payload) }).execute();
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
```

```ts
// apps/api/src/repositories/audit.ts
import type { Kysely } from 'kysely';
import type { Database } from '../database/types.js';

export const recordAudit = async (
    exec: Kysely<Database>,
    e: { actor: string; action: string; entityType: string; entityId: string; before?: unknown; after?: unknown },
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
```

- [ ] **Step 4: Run test, verify it passes**

Run: `npm test --workspace @tattoo-studio/api -- repositories/betrieb`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/repositories/idempotency.ts apps/api/src/repositories/outbox.ts apps/api/src/repositories/audit.ts apps/api/src/repositories/betrieb.test.ts
git commit -m "feat(api): idempotency, outbox and audit repositories"
```

---

### Task 14: Hold-Repository (Transaktionsprimitive)

**Files:**
- Create: `apps/api/src/repositories/holds.ts`
- Test: `apps/api/src/repositories/holds.test.ts`

**Interfaces:**
- Consumes: `Kysely<Database>` / `Transaction<Database>` (Parameter `trx`), `assertTransition` (Task 9).
- Produces:
  - `class SlotConflictError extends Error`
  - `class HoldNotFoundError extends Error`
  - `expireStaleHolds(trx, now: Date): Promise<Array<{ id: string; artistId: string; resourceId: string; customerId: string; startsAt: Date }>>`
  - `findFreeResourceId(trx, p: { candidateResourceIds: string[]; blockStart: Date; blockEnd: Date }): Promise<string | undefined>`
  - `upsertCustomer(trx, c: { chaynsPersonId?: string; firstName: string; lastName: string; email: string; phone: string }): Promise<string>`
  - `insertHoldBlock(trx, b: InsertHold): Promise<HoldBlockRow>` — mappt SQLSTATE `23P01` auf `SlotConflictError`
  - `getBlockById(exec, id: string): Promise<Selectable<AppointmentBlockTable> | undefined>`
  - `releaseHold(trx, id: string, clientToken: string): Promise<Selectable<AppointmentBlockTable>>` — `HoldNotFoundError` wenn kein `HELD`-Block mit passendem Token
  - `confirmHoldBlock(trx, id: string, deposit?: { amountCents: number; at: string; method: string }): Promise<{ appointmentId: string }>`
  - `declineHoldBlock(trx, id: string, reason: string): Promise<void>`
  - Typen: `InsertHold = { artistId; resourceId; serviceTypeId; customerId; sessionStart: Date; sessionEnd: Date; blockStart: Date; blockEnd: Date; depositCents: number; holdClientToken: string; idempotencyKey: string; expiresAt: Date }`, `HoldBlockRow = Selectable<AppointmentBlockTable>`

- [ ] **Step 1: Failing test**

```ts
// apps/api/src/repositories/holds.test.ts
import { afterAll, afterEach, beforeAll, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '../testing/db.js';
import {
    confirmHoldBlock, declineHoldBlock, expireStaleHolds, findFreeResourceId,
    getBlockById, insertHoldBlock, releaseHold, SlotConflictError, upsertCustomer,
} from './holds.js';

let ctx: TestDb;
beforeAll(async () => { ctx = await createTestDb(); });
afterEach(async () => {
    await ctx.db.deleteFrom('appointment').execute();
    await ctx.db.deleteFrom('appointment_block').execute();
    await ctx.db.deleteFrom('customer').execute();
});
afterAll(async () => { await ctx.destroy(); });

const hold = (over: Partial<Parameters<typeof insertHoldBlock>[1]> = {}) => ({
    artistId: 'mara', resourceId: 'station-1', serviceTypeId: 'small-tattoo', customerId: '',
    sessionStart: new Date('2026-09-01T08:00:00Z'), sessionEnd: new Date('2026-09-01T10:00:00Z'),
    blockStart: new Date('2026-09-01T07:45:00Z'), blockEnd: new Date('2026-09-01T10:15:00Z'),
    depositCents: 5000, holdClientToken: 'tok-1', idempotencyKey: 'idem-1',
    expiresAt: new Date(Date.now() + 3_600_000), ...over,
});

it('upserts a customer by chayns person id', async () => {
    const a = await upsertCustomer(ctx.db, { chaynsPersonId: 'p1', firstName: 'A', lastName: 'B', email: 'a@b.de', phone: '123456' });
    const b = await upsertCustomer(ctx.db, { chaynsPersonId: 'p1', firstName: 'A', lastName: 'B', email: 'a@b.de', phone: '123456' });
    expect(a).toBe(b);
});

it('inserts a hold and rejects an overlapping one with SlotConflictError', async () => {
    const cid = await upsertCustomer(ctx.db, { firstName: 'A', lastName: 'B', email: 'a@b.de', phone: '123456' });
    await insertHoldBlock(ctx.db, hold({ customerId: cid }));
    await expect(
        insertHoldBlock(ctx.db, hold({
            customerId: cid, holdClientToken: 'tok-2', idempotencyKey: 'idem-2',
            blockStart: new Date('2026-09-01T09:00:00Z'), blockEnd: new Date('2026-09-01T11:00:00Z'),
        })),
    ).rejects.toBeInstanceOf(SlotConflictError);
});

it('findFreeResourceId skips a taken resource', async () => {
    const cid = await upsertCustomer(ctx.db, { firstName: 'A', lastName: 'B', email: 'a@b.de', phone: '123456' });
    await insertHoldBlock(ctx.db, hold({ customerId: cid }));
    const free = await findFreeResourceId(ctx.db, {
        candidateResourceIds: ['station-1', 'station-2'],
        blockStart: new Date('2026-09-01T08:00:00Z'), blockEnd: new Date('2026-09-01T09:00:00Z'),
    });
    expect(free).toBe('station-2');
});

it('expireStaleHolds flips only past-due HELD blocks', async () => {
    const cid = await upsertCustomer(ctx.db, { firstName: 'A', lastName: 'B', email: 'a@b.de', phone: '123456' });
    await insertHoldBlock(ctx.db, hold({ customerId: cid, expiresAt: new Date(Date.now() - 1000) }));
    const expired = await expireStaleHolds(ctx.db, new Date());
    expect(expired).toHaveLength(1);
    const row = await getBlockById(ctx.db, expired[0]!.id);
    expect(row!.status).toBe('EXPIRED');
});

it('releaseHold cancels a hold owned by the token', async () => {
    const cid = await upsertCustomer(ctx.db, { firstName: 'A', lastName: 'B', email: 'a@b.de', phone: '123456' });
    const block = await insertHoldBlock(ctx.db, hold({ customerId: cid }));
    await releaseHold(ctx.db, block.id, 'tok-1');
    const row = await getBlockById(ctx.db, block.id);
    expect(row!.status).toBe('CANCELLED');
});

it('confirmHoldBlock creates an appointment and clears expiry', async () => {
    const cid = await upsertCustomer(ctx.db, { firstName: 'A', lastName: 'B', email: 'a@b.de', phone: '123456' });
    const block = await insertHoldBlock(ctx.db, hold({ customerId: cid }));
    const { appointmentId } = await confirmHoldBlock(ctx.db, block.id);
    const row = await getBlockById(ctx.db, block.id);
    expect(row!.status).toBe('CONFIRMED');
    expect(row!.expires_at).toBeNull();
    const appt = await ctx.db.selectFrom('appointment').selectAll().where('id', '=', appointmentId).executeTakeFirst();
    expect(appt!.block_id).toBe(block.id);
});

it('declineHoldBlock cancels with a reason', async () => {
    const cid = await upsertCustomer(ctx.db, { firstName: 'A', lastName: 'B', email: 'a@b.de', phone: '123456' });
    const block = await insertHoldBlock(ctx.db, hold({ customerId: cid }));
    await declineHoldBlock(ctx.db, block.id, 'motiv passt nicht');
    const row = await getBlockById(ctx.db, block.id);
    expect(row!.status).toBe('CANCELLED');
    expect(row!.decline_reason).toBe('motiv passt nicht');
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npm test --workspace @tattoo-studio/api -- repositories/holds`
Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
// apps/api/src/repositories/holds.ts
import type { Kysely, Selectable } from 'kysely';
import type { AppointmentBlockTable, Database } from '../database/types.js';

export type HoldBlockRow = Selectable<AppointmentBlockTable>;
export class SlotConflictError extends Error { constructor() { super('Slot conflict'); this.name = 'SlotConflictError'; } }
export class HoldNotFoundError extends Error { constructor() { super('Hold not found'); this.name = 'HoldNotFoundError'; } }

const isExclusionViolation = (e: unknown): boolean =>
    typeof e === 'object' && e !== null && (e as { code?: string }).code === '23P01';

export type InsertHold = {
    artistId: string; resourceId: string; serviceTypeId: string; customerId: string;
    sessionStart: Date; sessionEnd: Date; blockStart: Date; blockEnd: Date;
    depositCents: number; holdClientToken: string; idempotencyKey: string; expiresAt: Date;
};

export const upsertCustomer = async (
    trx: Kysely<Database>,
    c: { chaynsPersonId?: string; firstName: string; lastName: string; email: string; phone: string },
): Promise<string> => {
    if (c.chaynsPersonId) {
        const existing = await trx.selectFrom('customer').select('id').where('chayns_person_id', '=', c.chaynsPersonId).executeTakeFirst();
        if (existing) return existing.id;
    }
    const row = await trx
        .insertInto('customer')
        .values({
            chayns_person_id: c.chaynsPersonId ?? null,
            first_name: c.firstName, last_name: c.lastName, email: c.email, phone: c.phone,
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
            .where('status', 'in', ['HELD', 'PAYMENT_PENDING', 'CONFIRMED'])
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

export const insertHoldBlock = async (trx: Kysely<Database>, b: InsertHold): Promise<HoldBlockRow> => {
    try {
        return await trx
            .insertInto('appointment_block')
            .values({
                artist_id: b.artistId, resource_id: b.resourceId, service_type_id: b.serviceTypeId,
                customer_id: b.customerId,
                starts_at: b.blockStart, ends_at: b.blockEnd,
                session_starts_at: b.sessionStart, session_ends_at: b.sessionEnd,
                status: 'HELD', expires_at: b.expiresAt,
                hold_client_token: b.holdClientToken, idempotency_key: b.idempotencyKey,
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
        id: r.id, artistId: r.artist_id, resourceId: r.resource_id,
        customerId: r.customer_id, startsAt: new Date(r.session_starts_at),
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
        const { InvalidStateError } = await import('../domain/status.js');
        throw new InvalidStateError(block.status, 'CONFIRMED');
    }
    await trx.updateTable('appointment_block').set({ status: 'CONFIRMED', expires_at: null, updated_at: new Date() }).where('id', '=', id).execute();
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
        const { InvalidStateError } = await import('../domain/status.js');
        throw new InvalidStateError(block.status, 'CANCELLED');
    }
    await trx
        .updateTable('appointment_block')
        .set({ status: 'CANCELLED', decline_reason: reason, updated_at: new Date() })
        .where('id', '=', id)
        .execute();
};
```

> `assertTransition` wird hier bewusst nicht für jeden Pfad genutzt (die SQL-`WHERE`-Klauseln erzwingen den Ausgangszustand); für `confirm`/`decline` wird `InvalidStateError` direkt geworfen, damit die Route sie auf `409 INVALID_STATE` mappen kann.

- [ ] **Step 4: Run test, verify it passes**

Run: `npm test --workspace @tattoo-studio/api -- repositories/holds`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/repositories/holds.ts apps/api/src/repositories/holds.test.ts
git commit -m "feat(api): hold/block/appointment transaction primitives"
```

---

### Task 15: Hold-Service + Routen (`POST`/`DELETE /v1/slot-holds`)

**Files:**
- Create: `apps/api/src/services/hold-service.ts`
- Create: `apps/api/src/routes/slot-holds.ts`
- Modify: `apps/api/src/app.ts`
- Test: `apps/api/src/routes/slot-holds.test.ts`

**Interfaces:**
- Consumes: alles aus Tasks 8/10/11/13/14, `getAvailability` (Task 12), contracts (Task 6).
- Produces:
  - `createHold(db, config, input: { idempotencyKey: string; clientToken: string; body: SlotHoldRequest }): Promise<{ statusCode: number; payload: unknown }>`
    - `409 IDEMPOTENCY_KEY_REUSED` bei Key+Hash-Mismatch; Replay bei Treffer
    - `409 SLOT_NO_LONGER_AVAILABLE` wenn `startsAt` nicht (mehr) unter den Engine-Slots ist — mit `alternativeSlots`
    - `409 SLOT_CONFLICT` bei `SlotConflictError` — mit `alternativeSlots`
    - `201` + `slotHoldResponseSchema`-Payload sonst
  - `releaseHoldById(db, input: { id: string; clientToken: string }): Promise<void>` — `HoldNotFoundError`
  - Fastify-Plugin `slotHoldRoutes(app, { db, config })`
- Ablauf `createHold` (in **einer** `db.transaction().execute(async (trx) => …)`):
  1. `expireStaleHolds(trx, now)` → je Zeile `recordAudit` + `enqueueOutbox('slot_hold.expired')`
  2. `findIdempotencyRecord(trx, key)` → Treffer+gleicher Hash: Replay; Treffer+anderer Hash: `409 IDEMPOTENCY_KEY_REUSED`
  3. `getAvailability(trx, config, { serviceTypeId, artistId: body.artistId, from: <Datum von startsAt in Europe/Berlin>, days: 1 })` — prüfen, dass ein Slot mit exakt `body.startsAt` existiert; sonst `409 SLOT_NO_LONGER_AVAILABLE` (+ diese Slots als `alternativeSlots`)
  4. Puffer aus `service_type` holen, `applyBuffers` → `blockStart/blockEnd`
  5. `findFreeResourceId(trx, …)` → keine → `409 SLOT_CONFLICT`
  6. `upsertCustomer(trx, …)`
  7. `insertHoldBlock(trx, …)` → `SlotConflictError` → `409 SLOT_CONFLICT` (+ frische `alternativeSlots`)
  8. `recordAudit('hold.created', actor)` + `enqueueOutbox('slot_hold.created', payload)`
  9. `saveIdempotencyRecord(trx, { key, route:'POST /v1/slot-holds', requestHash, responseJson, statusCode: 201 })`
  10. Commit → `{ statusCode: 201, payload }`
  - `actor` = `body.chaynsPersonId ? 'chayns:'+id : 'anon:'+clientToken.slice(0,8)`

- [ ] **Step 1: Failing test**

```ts
// apps/api/src/routes/slot-holds.test.ts
import { afterAll, afterEach, beforeAll, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createTestDb, type TestDb } from '../testing/db.js';
import { buildApp } from '../app.js';
import type { AppConfig } from '../config.js';

const config: AppConfig = {
    gridMinutes: 60, minLeadHours: 12, holdTtlHours: 48, maxAvailabilityDays: 31,
    adminApiToken: 'test', workerIntervalSeconds: 60, rateLimitMax: 1000,
};

let ctx: TestDb;
let app: ReturnType<typeof buildApp>;
beforeAll(async () => { ctx = await createTestDb(); app = buildApp({ db: ctx.db, config }); await app.ready(); });
afterEach(async () => {
    await ctx.db.deleteFrom('appointment').execute();
    await ctx.db.deleteFrom('appointment_block').execute();
    await ctx.db.deleteFrom('customer').execute();
    await ctx.db.deleteFrom('idempotency_key').execute();
    await ctx.db.deleteFrom('outbox_event').execute();
    await ctx.db.deleteFrom('audit_event').execute();
});
afterAll(async () => { await app.close(); await ctx.destroy(); });

const firstSlot = async () => {
    const d = new Date(); d.setUTCDate(d.getUTCDate() + 3);
    while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() + 1);
    const from = d.toISOString().slice(0, 10);
    const res = await app.inject({ method: 'GET', url: `/v1/availability?serviceTypeId=small-tattoo&artistId=mara&from=${from}&days=1` });
    return res.json().slots[0] as { startsAt: string };
};

const body = (startsAt: string) => ({
    serviceTypeId: 'small-tattoo', artistId: 'mara', startsAt,
    customer: { firstName: 'Ann', lastName: 'Roe', email: 'a@b.de', phone: '+49 111 222' },
});

it('creates a hold (201)', async () => {
    const slot = await firstSlot();
    const res = await app.inject({
        method: 'POST', url: '/v1/slot-holds',
        headers: { 'idempotency-key': randomUUID(), 'x-client-token': randomUUID() },
        payload: body(slot.startsAt),
    });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ status: 'HELD', artistId: 'mara', depositCents: 5000 });
});

it('replays the same idempotency key', async () => {
    const slot = await firstSlot();
    const key = randomUUID(); const tok = randomUUID();
    const a = await app.inject({ method: 'POST', url: '/v1/slot-holds', headers: { 'idempotency-key': key, 'x-client-token': tok }, payload: body(slot.startsAt) });
    const b = await app.inject({ method: 'POST', url: '/v1/slot-holds', headers: { 'idempotency-key': key, 'x-client-token': tok }, payload: body(slot.startsAt) });
    expect(b.statusCode).toBe(201);
    expect(b.json().holdId).toBe(a.json().holdId);
    const count = await ctx.db.selectFrom('appointment_block').select(ctx.db.fn.countAll().as('n')).executeTakeFirstOrThrow();
    expect(Number(count.n)).toBe(1);
});

it('rejects a reused key with a different body (409)', async () => {
    const slot = await firstSlot();
    const key = randomUUID();
    await app.inject({ method: 'POST', url: '/v1/slot-holds', headers: { 'idempotency-key': key, 'x-client-token': randomUUID() }, payload: body(slot.startsAt) });
    const res = await app.inject({ method: 'POST', url: '/v1/slot-holds', headers: { 'idempotency-key': key, 'x-client-token': randomUUID() }, payload: { ...body(slot.startsAt), artistId: 'jon' } });
    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe('IDEMPOTENCY_KEY_REUSED');
});

it('409s when the slot is already held, with alternatives', async () => {
    const slot = await firstSlot();
    await app.inject({ method: 'POST', url: '/v1/slot-holds', headers: { 'idempotency-key': randomUUID(), 'x-client-token': randomUUID() }, payload: body(slot.startsAt) });
    // second station still free -> force conflict by also taking station-2 via a blocked period
    await ctx.db.insertInto('blocked_period').values({ artist_id: null, resource_id: 'station-2', starts_at: slot.startsAt, ends_at: new Date(new Date(slot.startsAt).getTime() + 6 * 3600_000), reason: 'test' }).execute();
    const res = await app.inject({ method: 'POST', url: '/v1/slot-holds', headers: { 'idempotency-key': randomUUID(), 'x-client-token': randomUUID() }, payload: body(slot.startsAt) });
    expect(res.statusCode).toBe(409);
    expect(['SLOT_CONFLICT', 'SLOT_NO_LONGER_AVAILABLE']).toContain(res.json().code);
    await ctx.db.deleteFrom('blocked_period').where('reason', '=', 'test').execute();
});

it('deletes a hold with the owning token', async () => {
    const slot = await firstSlot();
    const tok = randomUUID();
    const created = await app.inject({ method: 'POST', url: '/v1/slot-holds', headers: { 'idempotency-key': randomUUID(), 'x-client-token': tok }, payload: body(slot.startsAt) });
    const id = created.json().holdId;
    const wrong = await app.inject({ method: 'DELETE', url: `/v1/slot-holds/${id}`, headers: { 'x-client-token': randomUUID() } });
    expect(wrong.statusCode).toBe(404);
    const ok = await app.inject({ method: 'DELETE', url: `/v1/slot-holds/${id}`, headers: { 'x-client-token': tok } });
    expect(ok.statusCode).toBe(204);
});

it('400s without the required headers', async () => {
    const slot = await firstSlot();
    const res = await app.inject({ method: 'POST', url: '/v1/slot-holds', payload: body(slot.startsAt) });
    expect(res.statusCode).toBe(400);
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npm test --workspace @tattoo-studio/api -- routes/slot-holds`
Expected: FAIL.

- [ ] **Step 3: Service implementieren**

`apps/api/src/services/hold-service.ts` nach dem Ablauf im Interfaces-Block. Wichtige Details:
- Datum für die `getAvailability`-Revalidierung: `DateTime.fromISO(body.startsAt).setZone('Europe/Berlin').toISODate()`.
- Slot-Match: `slots.some((s) => s.startsAt === body.startsAt)` (beide ISO-UTC mit `.000Z` — `new Date(x).toISOString()` normalisieren).
- `alternativeSlots`: das `slots`-Array einer **frischen** `getAvailability(db, …)`-Abfrage (max. 10).
- Response-Payload = `slotHoldResponseSchema`-Form aus `insertHoldBlock`-Rückgabe (`holdId: row.id`, `expiresAt: row.expires_at.toISOString()`, `startsAt: row.session_starts_at.toISOString()`, `endsAt: row.session_ends_at.toISOString()`).
- **Wichtig (Postgres-Semantik):** Ein gefangener `23P01`-Fehler bricht die laufende Transaktion ab — danach ist **keine** weitere Query auf `trx` mehr möglich. Deshalb: bei `SlotConflictError` und bei „kein freier Arbeitsplatz" **kein** weiteres `getAvailability(trx, …)`, sondern eine typisierte Ausnahme `SlotUnavailable` (mit `code: 'SLOT_CONFLICT' | 'SLOT_NO_LONGER_AVAILABLE'`) **aus dem Transaktions-Callback werfen**. Der Aufrufer (`createHold` außerhalb der Transaktion) fängt sie und holt die `alternativeSlots` mit dem Pool-`db`.
- `db.transaction().execute(async (trx) => …)`; alle Repo-Aufrufe innerhalb erhalten `trx`.

```ts
// Grundgerüst
import { DateTime } from 'luxon';
import type { Kysely } from 'kysely';
import type { SlotHoldRequest } from '@tattoo-studio/contracts';
import type { AppConfig } from '../config.js';
import type { Database } from '../database/types.js';
import { getAvailability } from './availability-service.js';
import { applyBuffers } from '../domain/time.js';
import { getServiceType } from '../repositories/reference.js';
import { hashRequestBody, findIdempotencyRecord, saveIdempotencyRecord } from '../repositories/idempotency.js';
import { enqueueOutbox } from '../repositories/outbox.js';
import { recordAudit } from '../repositories/audit.js';
import {
    HoldNotFoundError, SlotConflictError, expireStaleHolds, findFreeResourceId,
    insertHoldBlock, releaseHold, upsertCustomer,
} from '../repositories/holds.js';

class SlotUnavailable extends Error {
    constructor(readonly code: 'SLOT_CONFLICT' | 'SLOT_NO_LONGER_AVAILABLE', readonly humanMessage: string) {
        super(code);
    }
}

export const createHold = async (
    db: Kysely<Database>,
    config: AppConfig,
    input: { idempotencyKey: string; clientToken: string; body: SlotHoldRequest },
): Promise<{ statusCode: number; payload: unknown }> => {
    const requestHash = hashRequestBody(input.body);
    const route = 'POST /v1/slot-holds';
    const fromDate = DateTime.fromISO(new Date(input.body.startsAt).toISOString())
        .setZone('Europe/Berlin')
        .toISODate()!;
    try {
        return await db.transaction().execute(async (trx) => {
            const now = new Date();
            for (const exp of await expireStaleHolds(trx, now)) {
                await recordAudit(trx, { actor: 'worker', action: 'hold.expired', entityType: 'appointment_block', entityId: exp.id });
                await enqueueOutbox(trx, { type: 'slot_hold.expired', payload: { holdId: exp.id, artistId: exp.artistId } });
            }

            const replay = await findIdempotencyRecord(trx, input.idempotencyKey);
            if (replay) {
                if (replay.requestHash !== requestHash) {
                    return { statusCode: 409, payload: { code: 'IDEMPOTENCY_KEY_REUSED', message: 'Idempotency-Key bereits mit anderem Inhalt verwendet.' } };
                }
                return { statusCode: replay.statusCode, payload: replay.responseJson };
            }

            const startIso = new Date(input.body.startsAt).toISOString();
            const availability = await getAvailability(trx, config, {
                serviceTypeId: input.body.serviceTypeId, artistId: input.body.artistId, from: fromDate, days: 1,
            });
            if (!availability.slots.some((s) => new Date(s.startsAt).toISOString() === startIso)) {
                throw new SlotUnavailable('SLOT_NO_LONGER_AVAILABLE', 'Der Slot ist nicht mehr verfügbar.');
            }

            const st = await getServiceType(trx, input.body.serviceTypeId);
            const sessionStart = new Date(startIso);
            const sessionEnd = new Date(sessionStart.getTime() + st!.duration_minutes * 60_000);
            const { blockStart, blockEnd } = applyBuffers(sessionStart, sessionEnd, st!.pre_buffer_minutes, st!.post_buffer_minutes);

            const kind = st!.id === 'consultation' ? 'consult' : 'station';
            const resources = await trx.selectFrom('resource').select('id').where('kind', '=', kind).where('active', '=', true).execute();
            const resourceId = await findFreeResourceId(trx, { candidateResourceIds: resources.map((r) => r.id), blockStart, blockEnd });
            if (!resourceId) throw new SlotUnavailable('SLOT_CONFLICT', 'Kein freier Arbeitsplatz für diesen Slot.');

            const customerId = await upsertCustomer(trx, { chaynsPersonId: input.body.chaynsPersonId, ...input.body.customer });

            let block;
            try {
                block = await insertHoldBlock(trx, {
                    artistId: input.body.artistId, resourceId, serviceTypeId: st!.id, customerId,
                    sessionStart, sessionEnd, blockStart, blockEnd,
                    depositCents: st!.deposit_cents, holdClientToken: input.clientToken, idempotencyKey: input.idempotencyKey,
                    expiresAt: new Date(now.getTime() + config.holdTtlHours * 3_600_000),
                });
            } catch (e) {
                if (e instanceof SlotConflictError) throw new SlotUnavailable('SLOT_CONFLICT', 'Slot wurde soeben vergeben.');
                throw e;
            }

            const payload = {
                holdId: block.id, status: 'HELD' as const,
                expiresAt: new Date(block.expires_at as Date).toISOString(),
                artistId: block.artist_id,
                startsAt: new Date(block.session_starts_at).toISOString(),
                endsAt: new Date(block.session_ends_at).toISOString(),
                depositCents: block.deposit_cents,
            };
            const actor = input.body.chaynsPersonId ? `chayns:${input.body.chaynsPersonId}` : `anon:${input.clientToken.slice(0, 8)}`;
            await recordAudit(trx, { actor, action: 'hold.created', entityType: 'appointment_block', entityId: block.id, after: payload });
            await enqueueOutbox(trx, { type: 'slot_hold.created', payload: { ...payload, customer: input.body.customer } });
            await saveIdempotencyRecord(trx, { key: input.idempotencyKey, route, requestHash, responseJson: payload, statusCode: 201, ttlHours: 24 });

            return { statusCode: 201, payload };
        });
    } catch (e) {
        if (e instanceof SlotUnavailable) {
            const fresh = await getAvailability(db, config, {
                serviceTypeId: input.body.serviceTypeId, artistId: input.body.artistId, from: fromDate, days: 1,
            }).catch(() => ({ slots: [] as unknown[] }));
            return {
                statusCode: 409,
                payload: { code: e.code, message: e.humanMessage, alternativeSlots: fresh.slots.slice(0, 10) },
            };
        }
        throw e;
    }
};

export const releaseHoldById = async (db: Kysely<Database>, input: { id: string; clientToken: string }) => {
    await db.transaction().execute(async (trx) => {
        const released = await releaseHold(trx, input.id, input.clientToken); // wirft HoldNotFoundError
        await recordAudit(trx, { actor: `anon:${input.clientToken.slice(0, 8)}`, action: 'hold.released', entityType: 'appointment_block', entityId: released.id });
        await enqueueOutbox(trx, { type: 'slot_hold.released', payload: { holdId: released.id } });
    });
};

export { HoldNotFoundError };
```

- [ ] **Step 4: Routen implementieren**

```ts
// apps/api/src/routes/slot-holds.ts
import type { FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import { slotHoldRequestSchema } from '@tattoo-studio/contracts';
import type { AppConfig } from '../config.js';
import type { Database } from '../database/types.js';
import { createHold, HoldNotFoundError, releaseHoldById } from '../services/hold-service.js';

export const slotHoldRoutes = async (app: FastifyInstance, opts: { db: Kysely<Database>; config: AppConfig }) => {
    app.post('/v1/slot-holds', async (request, reply) => {
        const idempotencyKey = request.headers['idempotency-key'];
        const clientToken = request.headers['x-client-token'];
        if (typeof idempotencyKey !== 'string' || typeof clientToken !== 'string') {
            return reply.status(400).send({ code: 'VALIDATION_ERROR', message: 'Idempotency-Key und X-Client-Token sind erforderlich.' });
        }
        const parsed = slotHoldRequestSchema.safeParse(request.body);
        if (!parsed.success) {
            return reply.status(400).send({
                code: 'VALIDATION_ERROR', message: 'Ungültige Anfrage.',
                issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
            });
        }
        const { statusCode, payload } = await createHold(opts.db, opts.config, { idempotencyKey, clientToken, body: parsed.data });
        return reply.status(statusCode).send(payload);
    });

    app.delete<{ Params: { id: string } }>('/v1/slot-holds/:id', async (request, reply) => {
        const clientToken = request.headers['x-client-token'];
        if (typeof clientToken !== 'string') {
            return reply.status(400).send({ code: 'VALIDATION_ERROR', message: 'X-Client-Token ist erforderlich.' });
        }
        try {
            await releaseHoldById(opts.db, { id: request.params.id, clientToken });
            return reply.status(204).send();
        } catch (e) {
            if (e instanceof HoldNotFoundError) {
                return reply.status(404).send({ code: 'HOLD_NOT_FOUND', message: 'Hold nicht gefunden.' });
            }
            throw e;
        }
    });
};
```

- [ ] **Step 5: In `app.ts` registrieren**

`app.register(slotHoldRoutes, { db, config })` (nur wenn `db` + `config` gesetzt).

- [ ] **Step 6: Run test, verify it passes**

Run: `npm test --workspace @tattoo-studio/api -- routes/slot-holds`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/services/hold-service.ts apps/api/src/routes/slot-holds.ts apps/api/src/app.ts apps/api/src/routes/slot-holds.test.ts
git commit -m "feat(api): POST/DELETE /v1/slot-holds with idempotency and revalidation"
```

---

### Task 16: Parallelitätstest (20 gleichzeitige Holds)

**Files:**
- Test: `apps/api/src/routes/slot-holds.concurrency.test.ts`

**Interfaces:**
- Consumes: alles aus Task 15. Kein neuer Produktionscode — dieser Task deckt Spec §12.3 / §14 ab und darf Fixes an `hold-service.ts` nach sich ziehen.

- [ ] **Step 1: Test schreiben**

```ts
// apps/api/src/routes/slot-holds.concurrency.test.ts
import { afterAll, beforeAll, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createTestDb, type TestDb } from '../testing/db.js';
import { buildApp } from '../app.js';
import type { AppConfig } from '../config.js';

const config: AppConfig = {
    gridMinutes: 60, minLeadHours: 12, holdTtlHours: 48, maxAvailabilityDays: 31,
    adminApiToken: 'test', workerIntervalSeconds: 60, rateLimitMax: 100000,
};

let ctx: TestDb;
let app: ReturnType<typeof buildApp>;
beforeAll(async () => { ctx = await createTestDb(); app = buildApp({ db: ctx.db, config }); await app.ready(); });
afterAll(async () => { await app.close(); await ctx.destroy(); });

it('lets exactly one of 20 concurrent holds win the same slot', async () => {
    // one artist, one station -> only one hold can succeed for a given start
    await ctx.db.deleteFrom('resource').where('id', '=', 'station-2').execute();

    const d = new Date(); d.setUTCDate(d.getUTCDate() + 3);
    while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() + 1);
    const from = d.toISOString().slice(0, 10);
    const avail = await app.inject({ method: 'GET', url: `/v1/availability?serviceTypeId=small-tattoo&artistId=mara&from=${from}&days=1` });
    const slot = avail.json().slots[0] as { startsAt: string };

    const attempts = Array.from({ length: 20 }, () =>
        app.inject({
            method: 'POST', url: '/v1/slot-holds',
            headers: { 'idempotency-key': randomUUID(), 'x-client-token': randomUUID() },
            payload: {
                serviceTypeId: 'small-tattoo', artistId: 'mara', startsAt: slot.startsAt,
                customer: { firstName: 'Ann', lastName: 'Roe', email: 'a@b.de', phone: '+49 111 222' },
            },
        }),
    );
    const results = await Promise.all(attempts);
    const created = results.filter((r) => r.statusCode === 201);
    const conflicts = results.filter((r) => r.statusCode === 409);

    expect(created).toHaveLength(1);
    expect(conflicts).toHaveLength(19);

    const blocks = await ctx.db.selectFrom('appointment_block').select(ctx.db.fn.countAll().as('n')).where('status', '=', 'HELD').executeTakeFirstOrThrow();
    expect(Number(blocks.n)).toBe(1);
});
```

- [ ] **Step 2: Run test**

Run: `npm test --workspace @tattoo-studio/api -- concurrency`
Expected: PASS (genau 1 × `201`, 19 × `409`, genau 1 `HELD`-Block). Falls gelegentlich >1 `201`: sicherstellen, dass `getAvailability` **innerhalb** der Transaktion mit `trx` läuft (nicht mit dem Pool-`db`) und dass der `23P01`→`SlotConflictError`→`SlotUnavailable`-Pfad die Transaktion tatsächlich abbrechen lässt (Exception verlässt den `transaction().execute()`-Callback). Bei „current transaction is aborted"-Fehlern im Log: es wird nach dem gefangenen `23P01` noch eine Query auf `trx` abgesetzt — diese entfernen.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/routes/slot-holds.concurrency.test.ts apps/api/src/services/hold-service.ts
git commit -m "test(api): exactly one winner among 20 concurrent holds"
```

---

### Task 17: Admin-Auth-Plugin + Confirm/Decline-Routen

**Files:**
- Create: `apps/api/src/plugins/admin-auth.ts`
- Create: `apps/api/src/services/admin-service.ts`
- Create: `apps/api/src/routes/admin-holds.ts`
- Modify: `apps/api/src/app.ts`
- Test: `apps/api/src/routes/admin-holds.test.ts`

**Interfaces:**
- Consumes: `confirmHoldBlock`, `declineHoldBlock`, `getBlockById`, `HoldNotFoundError` (Task 14); `InvalidStateError` (Task 9); `recordAudit`, `enqueueOutbox` (Task 13); contracts `holdConfirmRequestSchema`, `holdDeclineRequestSchema` (Task 6).
- Produces:
  - `requireAdmin(token: string)` → Fastify-`preHandler`, das `Authorization: Bearer <token>` prüft; sonst `reply.status(401).send({ code: 'UNAUTHORIZED', ... })`
  - `confirmHold(db, id, deposit?): Promise<{ appointmentId: string; blockId: string }>` — `HoldNotFoundError` / `InvalidStateError`
  - `declineHold(db, id, reason): Promise<void>`
  - `listHolds(db, q: { status?: string; limit: number }): Promise<Array<{ id; artistId; customerName; serviceTypeId; sessionStartsAt; status; expiresAt }>>`
  - Fastify-Plugin `adminHoldRoutes(app, { db, config })`

- [ ] **Step 1: Failing test**

```ts
// apps/api/src/routes/admin-holds.test.ts
import { afterAll, afterEach, beforeAll, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createTestDb, type TestDb } from '../testing/db.js';
import { buildApp } from '../app.js';
import type { AppConfig } from '../config.js';

const config: AppConfig = {
    gridMinutes: 60, minLeadHours: 12, holdTtlHours: 48, maxAvailabilityDays: 31,
    adminApiToken: 'secret-token', workerIntervalSeconds: 60, rateLimitMax: 1000,
};

let ctx: TestDb;
let app: ReturnType<typeof buildApp>;
beforeAll(async () => { ctx = await createTestDb(); app = buildApp({ db: ctx.db, config }); await app.ready(); });
afterEach(async () => {
    await ctx.db.deleteFrom('appointment').execute();
    await ctx.db.deleteFrom('appointment_block').execute();
    await ctx.db.deleteFrom('customer').execute();
    await ctx.db.deleteFrom('outbox_event').execute();
    await ctx.db.deleteFrom('audit_event').execute();
});
afterAll(async () => { await app.close(); await ctx.destroy(); });

const seedHold = async () => {
    const c = await ctx.db.insertInto('customer').values({ first_name: 'F', last_name: 'L', email: 'e@x.de', phone: '123456' }).returning('id').executeTakeFirstOrThrow();
    return ctx.db.insertInto('appointment_block').values({
        artist_id: 'mara', resource_id: 'station-1', service_type_id: 'small-tattoo', customer_id: c.id,
        starts_at: '2026-12-01T08:00:00Z', ends_at: '2026-12-01T10:30:00Z',
        session_starts_at: '2026-12-01T08:15:00Z', session_ends_at: '2026-12-01T10:15:00Z',
        status: 'HELD', expires_at: new Date(Date.now() + 3_600_000), hold_client_token: 'tok', deposit_cents: 5000,
    }).returning('id').executeTakeFirstOrThrow();
};

it('rejects requests without the admin token', async () => {
    const { id } = await seedHold();
    const res = await app.inject({ method: 'POST', url: `/v1/admin/holds/${id}/confirm`, payload: {} });
    expect(res.statusCode).toBe(401);
    expect(res.json().code).toBe('UNAUTHORIZED');
});

it('confirms a hold and records an appointment + outbox event', async () => {
    const { id } = await seedHold();
    const res = await app.inject({
        method: 'POST', url: `/v1/admin/holds/${id}/confirm`,
        headers: { authorization: 'Bearer secret-token' },
        payload: { depositReceived: { amountCents: 5000, at: '2026-11-30T09:00:00.000Z', method: 'bank_transfer' } },
    });
    expect(res.statusCode).toBe(200);
    const block = await ctx.db.selectFrom('appointment_block').selectAll().where('id', '=', id).executeTakeFirstOrThrow();
    expect(block.status).toBe('CONFIRMED');
    expect(block.expires_at).toBeNull();
    const appt = await ctx.db.selectFrom('appointment').selectAll().where('block_id', '=', id).executeTakeFirstOrThrow();
    expect(appt.deposit_received_cents).toBe(5000);
    const outbox = await ctx.db.selectFrom('outbox_event').selectAll().where('type', '=', 'appointment.confirmed').execute();
    expect(outbox).toHaveLength(1);
});

it('409s when confirming an already-cancelled hold', async () => {
    const { id } = await seedHold();
    await ctx.db.updateTable('appointment_block').set({ status: 'CANCELLED' }).where('id', '=', id).execute();
    const res = await app.inject({ method: 'POST', url: `/v1/admin/holds/${id}/confirm`, headers: { authorization: 'Bearer secret-token' }, payload: {} });
    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe('INVALID_STATE');
});

it('declines a hold with a reason', async () => {
    const { id } = await seedHold();
    const res = await app.inject({
        method: 'POST', url: `/v1/admin/holds/${id}/decline`,
        headers: { authorization: 'Bearer secret-token' }, payload: { reason: 'Motiv passt nicht' },
    });
    expect(res.statusCode).toBe(200);
    const block = await ctx.db.selectFrom('appointment_block').selectAll().where('id', '=', id).executeTakeFirstOrThrow();
    expect(block.status).toBe('CANCELLED');
    expect(block.decline_reason).toBe('Motiv passt nicht');
});

it('lists holds by status', async () => {
    await seedHold();
    const res = await app.inject({ method: 'GET', url: '/v1/admin/holds?status=HELD&limit=10', headers: { authorization: 'Bearer secret-token' } });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toHaveLength(1);
});

it('404s on an unknown hold id', async () => {
    const res = await app.inject({ method: 'POST', url: `/v1/admin/holds/${randomUUID()}/confirm`, headers: { authorization: 'Bearer secret-token' }, payload: {} });
    expect(res.statusCode).toBe(404);
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npm test --workspace @tattoo-studio/api -- routes/admin-holds`
Expected: FAIL.

- [ ] **Step 3: Auth-Plugin**

```ts
// apps/api/src/plugins/admin-auth.ts
import type { FastifyReply, FastifyRequest } from 'fastify';

export const requireAdmin =
    (token: string) => async (request: FastifyRequest, reply: FastifyReply) => {
        const header = request.headers.authorization;
        if (header !== `Bearer ${token}`) {
            await reply.status(401).send({ code: 'UNAUTHORIZED', message: 'Admin-Token fehlt oder ist ungültig.' });
        }
    };
```

- [ ] **Step 4: Admin-Service**

```ts
// apps/api/src/services/admin-service.ts
import type { Kysely } from 'kysely';
import type { HoldConfirmRequest } from '@tattoo-studio/contracts';
import type { Database } from '../database/types.js';
import { confirmHoldBlock, declineHoldBlock, getBlockById } from '../repositories/holds.js';
import { recordAudit } from '../repositories/audit.js';
import { enqueueOutbox } from '../repositories/outbox.js';

export const confirmHold = async (db: Kysely<Database>, id: string, deposit?: HoldConfirmRequest['depositReceived']) =>
    db.transaction().execute(async (trx) => {
        const { appointmentId } = await confirmHoldBlock(trx, id, deposit);
        await recordAudit(trx, { actor: 'studio', action: 'appointment.confirmed', entityType: 'appointment_block', entityId: id, after: { status: 'CONFIRMED', appointmentId } });
        await enqueueOutbox(trx, { type: 'appointment.confirmed', payload: { blockId: id, appointmentId } });
        return { appointmentId, blockId: id };
    });

export const declineHold = async (db: Kysely<Database>, id: string, reason: string) =>
    db.transaction().execute(async (trx) => {
        await declineHoldBlock(trx, id, reason);
        await recordAudit(trx, { actor: 'studio', action: 'appointment.declined', entityType: 'appointment_block', entityId: id, after: { status: 'CANCELLED', reason } });
        await enqueueOutbox(trx, { type: 'appointment.declined', payload: { blockId: id, reason } });
    });

export const listHolds = async (db: Kysely<Database>, q: { status?: string; limit: number }) => {
    let query = db
        .selectFrom('appointment_block as b')
        .innerJoin('customer as c', 'c.id', 'b.customer_id')
        .select([
            'b.id as id', 'b.artist_id as artistId', 'b.service_type_id as serviceTypeId',
            'b.session_starts_at as sessionStartsAt', 'b.status as status', 'b.expires_at as expiresAt',
            'c.first_name as firstName', 'c.last_name as lastName',
        ])
        .orderBy('b.created_at', 'desc')
        .limit(q.limit);
    if (q.status) query = query.where('b.status', '=', q.status as never);
    const rows = await query.execute();
    return rows.map((r) => ({
        id: r.id, artistId: r.artistId, serviceTypeId: r.serviceTypeId,
        sessionStartsAt: new Date(r.sessionStartsAt).toISOString(),
        status: r.status, expiresAt: r.expiresAt ? new Date(r.expiresAt).toISOString() : null,
        customerName: `${r.firstName} ${r.lastName}`,
    }));
};
```

- [ ] **Step 5: Routen**

```ts
// apps/api/src/routes/admin-holds.ts
import type { FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import { holdConfirmRequestSchema, holdDeclineRequestSchema } from '@tattoo-studio/contracts';
import type { AppConfig } from '../config.js';
import type { Database } from '../database/types.js';
import { requireAdmin } from '../plugins/admin-auth.js';
import { confirmHold, declineHold, listHolds } from '../services/admin-service.js';
import { HoldNotFoundError } from '../repositories/holds.js';
import { InvalidStateError } from '../domain/status.js';

export const adminHoldRoutes = async (app: FastifyInstance, opts: { db: Kysely<Database>; config: AppConfig }) => {
    app.addHook('preHandler', requireAdmin(opts.config.adminApiToken));

    const mapError = (reply: import('fastify').FastifyReply, e: unknown) => {
        if (e instanceof HoldNotFoundError) return reply.status(404).send({ code: 'HOLD_NOT_FOUND', message: 'Hold nicht gefunden.' });
        if (e instanceof InvalidStateError) return reply.status(409).send({ code: 'INVALID_STATE', message: `Aktion im Status ${e.from} nicht möglich.` });
        throw e;
    };

    app.post<{ Params: { id: string } }>('/v1/admin/holds/:id/confirm', async (request, reply) => {
        const parsed = holdConfirmRequestSchema.safeParse(request.body ?? {});
        if (!parsed.success) return reply.status(400).send({ code: 'VALIDATION_ERROR', message: 'Ungültiger Body.' });
        try {
            return await confirmHold(opts.db, request.params.id, parsed.data.depositReceived);
        } catch (e) {
            return mapError(reply, e);
        }
    });

    app.post<{ Params: { id: string } }>('/v1/admin/holds/:id/decline', async (request, reply) => {
        const parsed = holdDeclineRequestSchema.safeParse(request.body);
        if (!parsed.success) return reply.status(400).send({ code: 'VALIDATION_ERROR', message: 'reason ist erforderlich.' });
        try {
            await declineHold(opts.db, request.params.id, parsed.data.reason);
            return { ok: true };
        } catch (e) {
            return mapError(reply, e);
        }
    });

    app.get<{ Querystring: { status?: string; limit?: string } }>('/v1/admin/holds', async (request) => {
        const limit = Math.min(Number(request.query.limit ?? 50) || 50, 200);
        return listHolds(opts.db, { status: request.query.status, limit });
    });
};
```

- [ ] **Step 6: In `app.ts` registrieren** — `app.register(adminHoldRoutes, { db, config })` (nur wenn `db` + `config` gesetzt).

- [ ] **Step 7: Run test, verify it passes**

Run: `npm test --workspace @tattoo-studio/api -- routes/admin-holds`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/plugins/admin-auth.ts apps/api/src/services/admin-service.ts apps/api/src/routes/admin-holds.ts apps/api/src/app.ts apps/api/src/routes/admin-holds.test.ts
git commit -m "feat(api): admin confirm/decline/list endpoints behind bearer auth"
```

---

### Task 18: Rate-Limit auf `POST /v1/slot-holds`

**Files:**
- Create: `apps/api/src/plugins/rate-limit.ts`
- Modify: `apps/api/src/app.ts`, `apps/api/package.json`
- Test: `apps/api/src/routes/slot-holds.rate-limit.test.ts`

**Interfaces:**
- Consumes: `@fastify/rate-limit` (neue Dependency), `AppConfig.rateLimitMax`.
- Produces: `registerSlotHoldRateLimit(app, config): Promise<void>` — begrenzt `POST /v1/slot-holds` auf `config.rateLimitMax` pro Minute, Key = `X-Client-Token` (Fallback IP). Antwort bei Überschreitung: `429` mit `{ code: 'RATE_LIMITED', message }`.

- [ ] **Step 1: Dependency hinzufügen**

Run: `npm install --workspace @tattoo-studio/api @fastify/rate-limit@^10`

- [ ] **Step 2: Failing test**

```ts
// apps/api/src/routes/slot-holds.rate-limit.test.ts
import { afterAll, beforeAll, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createTestDb, type TestDb } from '../testing/db.js';
import { buildApp } from '../app.js';
import type { AppConfig } from '../config.js';

const config: AppConfig = {
    gridMinutes: 60, minLeadHours: 12, holdTtlHours: 48, maxAvailabilityDays: 31,
    adminApiToken: 'test', workerIntervalSeconds: 60, rateLimitMax: 3,
};

let ctx: TestDb;
let app: ReturnType<typeof buildApp>;
beforeAll(async () => { ctx = await createTestDb(); app = buildApp({ db: ctx.db, config }); await app.ready(); });
afterAll(async () => { await app.close(); await ctx.destroy(); });

it('returns 429 after the configured number of requests per client token', async () => {
    const tok = randomUUID();
    const send = () => app.inject({
        method: 'POST', url: '/v1/slot-holds',
        headers: { 'idempotency-key': randomUUID(), 'x-client-token': tok },
        payload: { serviceTypeId: 'small-tattoo', artistId: 'mara', startsAt: '2099-01-01T09:00:00.000Z',
            customer: { firstName: 'Ann', lastName: 'Roe', email: 'a@b.de', phone: '+49 111 222' } },
    });
    const codes: number[] = [];
    for (let i = 0; i < 5; i += 1) codes.push((await send()).statusCode);
    expect(codes.filter((c) => c === 429).length).toBeGreaterThanOrEqual(1);
    expect(codes.slice(0, 3).every((c) => c !== 429)).toBe(true);
});
```

- [ ] **Step 3: Implement**

```ts
// apps/api/src/plugins/rate-limit.ts
import rateLimit from '@fastify/rate-limit';
import type { FastifyInstance } from 'fastify';
import type { AppConfig } from '../config.js';

export const registerSlotHoldRateLimit = async (app: FastifyInstance, config: AppConfig) => {
    await app.register(rateLimit, { global: false });
    app.addHook('onRoute', (route) => {
        if (route.method === 'POST' && route.url === '/v1/slot-holds') {
            route.config = {
                ...route.config,
                rateLimit: {
                    max: config.rateLimitMax,
                    timeWindow: '1 minute',
                    keyGenerator: (req) =>
                        (typeof req.headers['x-client-token'] === 'string' ? req.headers['x-client-token'] : req.ip),
                    errorResponseBuilder: () => ({ code: 'RATE_LIMITED', message: 'Zu viele Anfragen. Bitte später erneut versuchen.' }),
                },
            };
        }
    });
};
```

> `@fastify/rate-limit` muss **vor** dem Registrieren von `slotHoldRoutes` geladen werden. In `app.ts` daher `await registerSlotHoldRateLimit(app, config)` vor `app.register(slotHoldRoutes, …)` aufrufen. Wenn `buildApp` synchron bleibt: `slotHoldRoutes` als `app.register`-Plugin belassen und das Rate-Limit-Plugin ebenfalls via `app.register` einhängen (Fastify serialisiert Plugins über `ready()`).

- [ ] **Step 4: Run test, verify it passes**

Run: `npm test --workspace @tattoo-studio/api -- rate-limit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/plugins/rate-limit.ts apps/api/src/app.ts apps/api/package.json package-lock.json apps/api/src/routes/slot-holds.rate-limit.test.ts
git commit -m "feat(api): per-client-token rate limit on slot hold creation"
```

---

### Task 19: Worker — Hold-Ablauf-Job

**Files:**
- Create: `apps/api/src/jobs/expire-holds.ts`
- Create: `apps/api/src/worker.ts`
- Modify: `apps/api/package.json` (Scripts `worker`, `start:worker`)
- Test: `apps/api/src/jobs/expire-holds.test.ts`

**Interfaces:**
- Consumes: `expireStaleHolds` (Task 14), `recordAudit`, `enqueueOutbox` (Task 13).
- Produces:
  - `runExpireHoldsJob(db: Kysely<Database>, now?: Date): Promise<{ expired: number }>` — flippt fällige `HELD`→`EXPIRED`, schreibt je Zeile `audit_event` (`actor: 'worker'`) + `outbox_event` (`slot_hold.expired`), alles in einer Transaktion.
  - `worker.ts`: Entrypoint — liest `DATABASE_URL` + `loadConfig()`, ruft den Job alle `workerIntervalSeconds` Sekunden auf, sauberes `SIGINT`/`SIGTERM`-Handling.

- [ ] **Step 1: Failing test**

```ts
// apps/api/src/jobs/expire-holds.test.ts
import { afterAll, afterEach, beforeAll, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '../testing/db.js';
import { runExpireHoldsJob } from './expire-holds.js';

let ctx: TestDb;
beforeAll(async () => { ctx = await createTestDb(); });
afterEach(async () => {
    await ctx.db.deleteFrom('appointment_block').execute();
    await ctx.db.deleteFrom('customer').execute();
    await ctx.db.deleteFrom('audit_event').execute();
    await ctx.db.deleteFrom('outbox_event').execute();
});
afterAll(async () => { await ctx.destroy(); });

const insertHold = async (expiresAt: Date) => {
    const c = await ctx.db.insertInto('customer').values({ first_name: 'F', last_name: 'L', email: 'e@x.de', phone: '123456' }).returning('id').executeTakeFirstOrThrow();
    return ctx.db.insertInto('appointment_block').values({
        artist_id: 'mara', resource_id: 'station-1', service_type_id: 'small-tattoo', customer_id: c.id,
        starts_at: '2026-09-01T08:00:00Z', ends_at: '2026-09-01T10:30:00Z',
        session_starts_at: '2026-09-01T08:15:00Z', session_ends_at: '2026-09-01T10:15:00Z',
        status: 'HELD', expires_at: expiresAt, hold_client_token: 'tok', deposit_cents: 5000,
    }).returning('id').executeTakeFirstOrThrow();
};

it('expires only past-due holds and emits audit + outbox rows', async () => {
    await insertHold(new Date(Date.now() - 60_000));
    await insertHold(new Date(Date.now() + 3_600_000));

    const { expired } = await runExpireHoldsJob(ctx.db);
    expect(expired).toBe(1);

    const statuses = (await ctx.db.selectFrom('appointment_block').select('status').execute()).map((r) => r.status).sort();
    expect(statuses).toEqual(['EXPIRED', 'HELD']);
    expect(await ctx.db.selectFrom('outbox_event').select('type').where('type', '=', 'slot_hold.expired').execute()).toHaveLength(1);
    expect(await ctx.db.selectFrom('audit_event').select('action').where('action', '=', 'hold.expired').execute()).toHaveLength(1);
});

it('is a no-op when nothing is due', async () => {
    await insertHold(new Date(Date.now() + 3_600_000));
    expect((await runExpireHoldsJob(ctx.db)).expired).toBe(0);
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npm test --workspace @tattoo-studio/api -- jobs/expire-holds`
Expected: FAIL.

- [ ] **Step 3: Job implementieren**

```ts
// apps/api/src/jobs/expire-holds.ts
import type { Kysely } from 'kysely';
import type { Database } from '../database/types.js';
import { expireStaleHolds } from '../repositories/holds.js';
import { recordAudit } from '../repositories/audit.js';
import { enqueueOutbox } from '../repositories/outbox.js';

export const runExpireHoldsJob = async (db: Kysely<Database>, now: Date = new Date()) =>
    db.transaction().execute(async (trx) => {
        const expired = await expireStaleHolds(trx, now);
        for (const e of expired) {
            await recordAudit(trx, { actor: 'worker', action: 'hold.expired', entityType: 'appointment_block', entityId: e.id, after: { status: 'EXPIRED' } });
            await enqueueOutbox(trx, { type: 'slot_hold.expired', payload: { holdId: e.id, artistId: e.artistId, resourceId: e.resourceId } });
        }
        return { expired: expired.length };
    });
```

- [ ] **Step 4: Worker-Entrypoint**

```ts
// apps/api/src/worker.ts
import { createDatabase } from './database/client.js';
import { loadConfig } from './config.js';
import { runExpireHoldsJob } from './jobs/expire-holds.js';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
    console.error('DATABASE_URL fehlt: Worker kann nicht starten.');
    process.exit(1);
}

const config = loadConfig();
const db = createDatabase(connectionString);
let stopping = false;

const tick = async () => {
    try {
        const { expired } = await runExpireHoldsJob(db);
        if (expired > 0) console.info(`[worker] ${expired} Hold(s) abgelaufen`);
    } catch (error) {
        console.error('[worker] Job-Fehler', error);
    }
};

const loop = async () => {
    while (!stopping) {
        await tick();
        await new Promise((r) => setTimeout(r, config.workerIntervalSeconds * 1000));
    }
    await db.destroy();
};

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
    process.on(sig, () => {
        stopping = true;
    });
}

void loop();
```

- [ ] **Step 5: package.json-Scripts**

In `apps/api/package.json` `scripts` ergänzen:

```json
"worker": "tsx watch src/worker.ts",
"start:worker": "node dist/worker.js"
```

- [ ] **Step 6: Run test, verify it passes**

Run: `npm test --workspace @tattoo-studio/api -- jobs/expire-holds`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/jobs/expire-holds.ts apps/api/src/worker.ts apps/api/package.json apps/api/src/jobs/expire-holds.test.ts
git commit -m "feat(api): worker entrypoint and expire-holds job"
```

---

### Task 20: Server-Verdrahtung, Root-Scripts, Doku, Gesamtlauf

**Files:**
- Modify: `apps/api/src/server.ts`, `apps/api/src/app.ts`, `package.json` (root), `.env.example`, `CLAUDE.md`
- Test: keine neue Datei — voller Testlauf.

**Interfaces:**
- Consumes: alles.
- Produces: `server.ts` baut `db` aus `DATABASE_URL` und ruft `buildApp({ logger: true, config: loadConfig(), db, repository })`; wenn `DATABASE_URL` fehlt: weiterhin nur `MemoryBookingRequestRepository`, `db`/`config` weglassen → nur `/api/v1/*`-Altrouten aktiv (die `/v1/*`-Routen brauchen `db`).

- [ ] **Step 1: `server.ts` verdrahten**

```ts
// apps/api/src/server.ts
import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { createDatabase } from './database/client.js';
import { MemoryBookingRequestRepository, PostgresBookingRequestRepository } from './repository.js';

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? '0.0.0.0';

const dbUrl = process.env.DATABASE_URL;
const db = dbUrl ? createDatabase(dbUrl) : undefined;
const config = loadConfig();
const repository = db
    ? new PostgresBookingRequestRepository(db)
    : new MemoryBookingRequestRepository();

const app = buildApp({ logger: true, repository, config, db });

if (!dbUrl) app.log.warn('DATABASE_URL fehlt: /v1/*-Kalenderrouten sind deaktiviert, Anfragen nur im Arbeitsspeicher.');

try {
    await app.listen({ host, port });
} catch (error) {
    app.log.error(error);
    process.exit(1);
}
```

> `PostgresBookingRequestRepository` nimmt bereits eine `Kysely<Database>` entgegen — dieselbe Instanz wie die Kalenderrouten teilen. Der `onClose`-Hook in `app.ts` schließt `db` **nicht** (Ownership bei `server.ts`); dort ist das für den Serverprozess akzeptabel (Prozessende schließt den Pool).

- [ ] **Step 2: `app.ts` — finale Registrierung prüfen**

`BuildAppOptions`:

```ts
type BuildAppOptions = {
    repository?: BookingRequestRepository;
    logger?: boolean;
    config?: AppConfig;
    db?: Kysely<Database>;
};
```

Wenn `options.db && options.config`: `await`-freie `app.register(...)` für `availabilityRoutes`, `slotHoldRoutes`, `adminHoldRoutes`, jeweils `{ db, config }`; plus das Rate-Limit-Plugin (Task 18). Reihenfolge: Rate-Limit-Plugin **vor** `slotHoldRoutes`.

- [ ] **Step 3: Root-`dev`-Script**

`package.json` (root) `dev` erweitern:

```json
"dev": "npm run build --workspace @tattoo-studio/contracts && concurrently -n api,worker,web -c cyan,yellow,magenta \"npm run dev --workspace @tattoo-studio/api\" \"npm run worker --workspace @tattoo-studio/api\" \"npm run dev --workspace @tattoo-studio/web\""
```

- [ ] **Step 4: `.env.example`** — bereits in Task 1 gesetzt; prüfen, dass `ADMIN_API_TOKEN`, `TEST_DATABASE_URL`, `RATE_LIMIT_MAX` enthalten sind.

- [ ] **Step 5: `CLAUDE.md` aktualisieren**

Ergänzen:
- Unter *Commands*: `npm run worker --workspace @tattoo-studio/api` (Hold-Ablauf-Job); DB-Integrationstests brauchen `npm run db:up` + optional `TEST_DATABASE_URL`.
- Unter *Architecture*: neues Kalenderschema (`appointment_block` als einzige blockierende Tabelle mit 2 GiST-Exclusion-Constraints), Domain/Repository/Service-Schichtung unter `src/domain` · `src/repositories` · `src/services`, `/v1/*`-Routen (neu) vs. `/api/v1/*` (Legacy, bis Spec C), Worker als zweiter Entrypoint in `apps/api`.
- Hinweis: `src/availability.ts` + `catalog.ts` sind Legacy und werden in Spec C entfernt.

- [ ] **Step 6: Gesamtlauf**

Run:
```
npm run db:up
npm run check-types
npm test
```
Expected: alle Workspaces grün; `apps/api` inkl. aller neuen Integrations-, Parallel- und Zeitzonentests; `apps/web` und `contracts` unverändert grün.

- [ ] **Step 7: Smoke-Test manuell**

```
$env:DATABASE_URL='postgresql://tattoo:tattoo-local@localhost:5432/tattoo_studio'
$env:ADMIN_API_TOKEN='local-dev'
npm run db:migrate
npm run dev
```
Dann: `GET http://localhost:3000/v1/availability?serviceTypeId=small-tattoo&from=<naher Werktag>&days=7` liefert Slots; `POST /v1/slot-holds` mit `Idempotency-Key` + `X-Client-Token` legt einen Hold an; `GET /v1/admin/holds` mit `Authorization: Bearer local-dev` zeigt ihn.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/server.ts apps/api/src/app.ts package.json .env.example CLAUDE.md
git commit -m "feat(api): wire calendar core into server and dev workflow"
```

---

## Self-Review (durchgeführt)

**1. Spec-Abdeckung:**

| Spec-Abschnitt | Task(s) |
|---|---|
| §2 Datenmodell | 4 (Schema + Typen), 5 (Seed) |
| §2.5 Statusmodell | 9 (Guards), erzwungen in 14 |
| §3 Verfügbarkeits-Engine | 7 (Zeit), 8 (Slot-ID), 10 (Engine), 11 (Repo), 12 (Service + Route) |
| §3.4 Konfiguration | 1 |
| §4 Atomarer Hold | 13 (Idempotency/Outbox/Audit), 14 (Primitive), 15 (Service + Routen), 16 (Parallelität) |
| §4.3 Freigabe | 15 (`DELETE`) |
| §4.4 Identität (Login optional) | 15 (`X-Client-Token`, `chaynsPersonId` unbestätigt) |
| §5 Studio-Endpoints | 17 |
| §6 Worker | 19 |
| §7 Contracts | 6 |
| §8 Seed | 5 |
| §9 Fehlercodes | 6 (Enum), angewandt in 12/15/17/18 |
| §10 Sicherheit / Rate Limit | 17 (Auth), 18 (Rate Limit) |
| §12 Teststrategie | 7/10 (Domain + DST), 4 (Constraints), 16 (20 parallel), 12 (Zeitzone in Route), 15/17 (API) |
| §13 Repo-Auswirkungen | 20 |
| §14 Definition of Done | 20 (Gesamtlauf + Smoke) |

Lücken: keine offenen. §12.4 (Zeitzone über DST-Wechsel im Routen-Test) ist durch die Domain-Tests in Task 7/10 abgedeckt; ein zusätzlicher Routen-Level-DST-Test kann bei Bedarf in Task 12 ergänzt werden.

**2. Platzhalter-Scan:** keine `TODO`/`TBD`; alle Test- und Implementierungsschritte enthalten realen Code. Zwei Stellen enthalten bewusst „Grundgerüst" + präzise Regeln statt vollständigem Code (Task 15 Service, Task 20 `app.ts`-Verdrahtung) — die maßgeblichen Signaturen und Abläufe sind vollständig spezifiziert.

**3. Typ-Konsistenz:** `AppConfig` (Task 1) identisch in allen Route-/Service-Tests. `SlotConflictError`/`HoldNotFoundError` in Task 14 definiert, in 15/17 konsumiert. `InvalidStateError` in Task 9 definiert, in 14 geworfen, in 17 gemappt. `computeSlots`/`EngineInput` (Task 10) ↔ `availability-service` (Task 12) Feldnamen abgeglichen. `encodeSlotId`/`decodeSlotId` (Task 8) ↔ Service (Task 12).

## Offene Annahmen aus der Spec (§11) — Entscheidungen im Plan

- `weekday` = ISO 1–7 (`DateTime.weekday`), CHECK `BETWEEN 1 AND 7`.
- Hold-TTL Default **48 h** (`HOLD_TTL_HOURS`).
- Ressourcen-Auto-Zuweisung: kleinste freie `id` (`findFreeResourceId` sortiert).
- Ein Puffer-Paar pro `service_type`.
- `customer`-Dedup nur über `chayns_person_id`.
- Kein serverseitiger chayns-Token-Check.
- `MIN_LEAD_HOURS` = 12.
- `confirm` verlangt keinen Deposit-Nachweis (`depositReceived` optional).
