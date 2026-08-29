# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

`chayns`-integrated request & appointment platform for a tattoo studio (German-language product,
code/identifiers in English). First vertical MVP slice: a self-hosted React custom page for the
booking flow, a Fastify booking API, and a shared Zod contract package. Requires Node.js 24+ and
npm 11+. Working language for UI copy, docs, and commit messages is German.

Deeper background lives in `.idea/ARCHITEKTUR_UND_UMSETZUNG.md` and
`.idea/VORKONZEPT_TATTOO_STUDIO_CHAYNS.md`.

## Commands

Run from the repo root unless noted.

- `npm install` — install all workspaces.
- `npm run dev` — build contracts, then run API (`tsx watch`, `http://localhost:3000`), the
  hold-expiry worker, and web (`chayns-toolkit dev`, `http://localhost:8080`) concurrently.
- `npm run worker --workspace @tattoo-studio/api` — hold-expiry worker alone (`tsx watch`, needs
  `DATABASE_URL` + `ADMIN_API_TOKEN`); flips due `HELD` blocks to `EXPIRED` every
  `WORKER_INTERVAL_SECONDS`.
- `npm run build` / `npm run check-types` / `npm test` — each **first builds `@tattoo-studio/contracts`**,
  then fans out across workspaces. Always go through these (or build contracts manually) so downstream
  packages see current contract types.
- Web lint: `npm run lint --workspace @tattoo-studio/web` (`chayns-toolkit lint`; the only workspace with a lint script).
- Format: `npm run format` (Prettier, web workspace) — 4-space tabs, single quotes, `printWidth` 100.

### Running a single test

Tests use Vitest. Build contracts once first (`npm run build --workspace @tattoo-studio/contracts`), then:

- API: `cd apps/api && npx vitest run src/app.test.ts` (or `-t "creates a valid booking request"`).
- Web: `cd apps/web && npx vitest run src/components/BookingFlow.test.tsx`.

Many API suites are Postgres integration tests (`src/database/*`, `src/repositories/*`,
`src/routes/*`, `src/jobs/*`). They need a running database — `npm run db:up` — and each spins up
its own throw-away database via `src/testing/db.ts`. Base connection is
`TEST_DATABASE_URL` (default `postgresql://tattoo:tattoo-local@localhost:5432/tattoo_studio_test`).

### Database (optional locally)

Without `DATABASE_URL` the API runs memory-only: just the `/api/v1/*` legacy routes, no `/v1/*`
calendar core. For the full stack:

```
npm run db:up          # docker compose: postgres:18-alpine
$env:DATABASE_URL='postgresql://tattoo:tattoo-local@localhost:5432/tattoo_studio'
$env:ADMIN_API_TOKEN='local-dev'   # required once db is set (loadConfig)
npm run db:migrate     # apps/api custom runner over apps/api/migrations/*.sql
```

See `.env.example` for the full set of tunables (`GRID_MINUTES`, `MIN_LEAD_HOURS`,
`HOLD_TTL_HOURS`, `MAX_AVAILABILITY_DAYS`, `WORKER_INTERVAL_SECONDS`, `RATE_LIMIT_MAX`).

## Architecture

Monorepo with npm workspaces: `apps/web`, `apps/api`, `packages/contracts`.

### `packages/contracts` — the source of truth

Zod schemas + inferred types for every API request/response. Modules: `service-type`, `artist`,
`availability`, `slot-hold`, `admin`, `errors` (Spec B `/v1/*`), plus `index.ts` which also holds
the `legacy*` schemas for the old `/api/v1/*` path (`legacyServiceTypeSchema`,
`legacyAvailability*`, `createBookingRequestSchema` …). Both API and web import the **compiled**
output (`dist/`, `main` points there), which is why every root script rebuilds it first. After
editing schemas here, rebuild contracts before the API or web will pick up the change.

### `apps/api` — Fastify 5, ESM (`NodeNext`)

- `app.ts` exports `buildApp({ repository, logger, config?, db? })` — a pure factory with no I/O,
  tested via `app.inject(...)`. When `db` **and** `config` are passed it also registers the
  calendar core: `@fastify/rate-limit`, then `availabilityRoutes`, `slotHoldRoutes`,
  `adminHoldRoutes`. `server.ts` reads env, builds the `Kysely` instance and `loadConfig()`, and
  picks the repository.
- Two route generations coexist:
  - `/v1/*` (new, Spec B) — the calendar core, only mounted when `db`+`config` are present.
  - `/api/v1/*` (legacy MVP) — `service-types`, synthetic `availability`, `booking-requests`; still
    served from `catalog.ts` + `availability.ts` and the `MemoryBookingRequestRepository` default.
    These and the `legacy*` contract schemas go away with Spec C.
- Layering under the calendar core: `src/domain/` (pure logic — time math, slot-id, status guards,
  the availability engine), `src/repositories/` (Kysely reads/writes, all take `Kysely`/`Transaction`
  as first arg), `src/services/` (orchestration + transactions), `src/routes/` (Fastify plugins).
- Data model (`migrations/001_initial_booking.sql`, replaced from the old draft): `appointment_block`
  is the single blocking table, with **two** GiST exclusion constraints (`btree_gist`, one per
  `artist_id` / `resource_id`) guarding overlap-free holds regardless of app code. Reference tables
  `service_type` / `artist` / `resource` / `availability_rule` / `blocked_period`, plus
  `idempotency_key`, `outbox_event`, `audit_event`. `migrations/002_seed_reference_data.sql` seeds
  placeholder artists, resources, services and Mon–Fri rules. `booking_request` stays as a legacy
  table for the old path.
- `config.ts` — `loadConfig(env)` → typed `AppConfig` (grid minutes, lead hours, hold TTL, admin
  token, worker interval, rate-limit max) with the defaults from `.env.example`.
- Worker: `src/worker.ts` is a second entrypoint in the same workspace (`npm run worker`). It calls
  `runExpireHoldsJob` (`src/jobs/expire-holds.ts`) on an interval — no cross-workspace imports.
- Migrations are plain `.sql` files applied in filename order by `src/database/migrate.ts`
  (`runMigrations(connectionString)` is importable; the CLI guard runs it for `db:migrate`), tracked
  in a `schema_migration` table.
- `NodeNext` resolution: relative imports need explicit `.js` extensions even in `.ts` sources.

### `apps/web` — chayns custom page (React 18)

- Built with `chayns-toolkit` (not raw Vite). Entry `src/index.tsx` → `AppWrapper` (`ChaynsProvider` +
  React Query + `@chayns-components/core` `PageProvider`) → `App` → `BookingFlow`.
- `BookingFlow.tsx` is a 3-step wizard (service type → slot → customer form). The form uses
  `react-hook-form` + `zodResolver(createBookingRequestSchema)` from contracts; API responses are
  re-validated client-side with the same contract schemas in `src/api/bookingApi.ts`.
- API base URL comes from `PUBLIC_BOOKING_API_URL`; `chayns-toolkit` inlines `PUBLIC_`-prefixed env
  vars at build time. `.env` holds the production placeholder, `.env.development.local` the local value.

### Conventions

- `tsconfig.base.json`: `strict` + `noUncheckedIndexedAccess` everywhere.
- `apps/web` and `apps/api` never import each other — the contract package is the only shared code.

## Other agent configs

A Gemini CLI config exists at `~/.gemini/` (`settings.json`, `GEMINI.md`). Reply `/import` to scan and
list what's importable, then `/import --yes=<digest>` to apply user-level items.
