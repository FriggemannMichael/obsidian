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
- `npm run dev` — build contracts, then run API (`tsx watch`, `http://localhost:3000`) and web
  (`chayns-toolkit dev`, `http://localhost:8080`) concurrently.
- `npm run build` / `npm run check-types` / `npm test` — each **first builds `@tattoo-studio/contracts`**,
  then fans out across workspaces. Always go through these (or build contracts manually) so downstream
  packages see current contract types.
- Web lint: `npm run lint --workspace @tattoo-studio/web` (`chayns-toolkit lint`; the only workspace with a lint script).
- Format: `npm run format` (Prettier, web workspace) — 4-space tabs, single quotes, `printWidth` 100.

### Running a single test

Tests use Vitest. Build contracts once first (`npm run build --workspace @tattoo-studio/contracts`), then:

- API: `cd apps/api && npx vitest run src/app.test.ts` (or `-t "creates a valid booking request"`).
- Web: `cd apps/web && npx vitest run src/components/BookingFlow.test.tsx`.

### Database (optional locally)

Without `DATABASE_URL` the API uses an in-memory repository. For the full stack:

```
npm run db:up          # docker compose: postgres:18-alpine
$env:DATABASE_URL='postgresql://tattoo:tattoo-local@localhost:5432/tattoo_studio'
npm run db:migrate     # apps/api custom runner over apps/api/migrations/*.sql
```

## Architecture

Monorepo with npm workspaces: `apps/web`, `apps/api`, `packages/contracts`.

### `packages/contracts` — the source of truth

Zod schemas + inferred types for every API request/response (`service-types`, `availability`,
`booking-requests`, error shape). Both API and web import the **compiled** output (`dist/`, `main`
points there), which is why every root script rebuilds it first. After editing schemas here,
rebuild contracts before the API or web will pick up the change.

### `apps/api` — Fastify 5, ESM (`NodeNext`)

- `app.ts` exports `buildApp({ repository, logger })` — a pure factory with no I/O, tested via
  `app.inject(...)`. `server.ts` only reads env and picks the repository.
- Repository pattern in `repository.ts`: `MemoryBookingRequestRepository` (default) vs
  `PostgresBookingRequestRepository` (Kysely + `pg`), selected by presence of `DATABASE_URL`.
- `availability.ts` synthesizes slots (Luxon, `Europe/Berlin`, Mon–Fri, 10:00 & 14:00, `day-session`
  10:00 only, minimum 12h lead time). There is no real calendar yet.
- `catalog.ts` hard-codes the 3 service types — **must stay in sync** with the seed in
  `migrations/001_initial_booking.sql`.
- Migrations are plain `.sql` files applied in filename order by `src/database/migrate.ts`, tracked in
  a `schema_migration` table. The schema already defines `appointment_hold` with a GiST exclusion
  constraint (`btree_gist`) for overlap-free holds; the endpoint that creates holds is not built yet.
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
