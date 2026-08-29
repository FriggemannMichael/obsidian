# Anfrage-Wizard, Referenz-Uploads & Studio-Ansicht (Spec C) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Den MVP-Buchungspfad durch die echte Tattoo-Anfrage ersetzen — strukturiertes Anfrage-Modell, visuelle Körperauswahl statt Freitext-Körperstelle, private Referenzbild-Uploads über die API, und eine minimale Studio-Ansicht (Liste/Detail/annehmen · rückfrage · ablehnen).

**Architecture:** Fastify-API mit der Spec-B-Schichtung (`src/domain` reine Logik · `src/repositories` Kysely · `src/services` Orchestrierung + Transaktionen · `src/routes` Fastify-Plugins). PostgreSQL ist Source of Truth; drei neue Tabellen (`inquiry`, `inquiry_region`, `media_asset`) über Migration `003`, die zusätzlich die Legacy-Tabelle `booking_request` droppt. Bilder liegen in einem privaten Verzeichnis hinter der API (kein Objektspeicher, keine signierten URLs); Upload einzeln über `POST /v1/uploads`, Verknüpfung beim Absenden der Anfrage, Waisen-Cleanup als zweiter Worker-Job. `apps/web` bekommt einen zweiten `chayns-toolkit`-Entry-Point für die Studio-Ansicht; Wizard und Studio teilen sich den `BodyRegionPicker`.

**Tech Stack:** Node 24, TypeScript (ESM/`NodeNext`), Fastify 5, `@fastify/multipart`, `sharp`, Kysely + `pg`, Zod 4 (`@tattoo-studio/contracts`), Luxon, Vitest, `@fastify/rate-limit`, PostgreSQL 18. Web: React 18, `chayns-toolkit`, `react-hook-form`, `@tanstack/react-query`, `@testing-library/react` + jsdom.

**Spec:** `docs/superpowers/specs/2026-08-29-anfrage-wizard-spec-c-design.md`

## Global Constraints

- Node `>=24`; npm-Workspaces (`apps/*`, `packages/*`).
- **Baut auf Spec B auf.** Die Implementierung muss von einem Stand ausgehen, der Spec B enthält
  (`feat/kalenderkern-spec-b` gemergt oder als Basis-Branch). Verwendet werden u. a.
  `repositories/idempotency.ts` / `outbox.ts` / `audit.ts` / `reference.ts`, `services/availability-service.ts`,
  `plugins/admin-auth.ts`, `plugins/rate-limit.ts`, `worker.ts`, `jobs/expire-holds.ts`, `config.ts`,
  `customer`-Tabelle, `domain/status.ts` als Vorlage.
- `@tattoo-studio/contracts` **muss vor** API/Web gebaut werden
  (`npm run build --workspace @tattoo-studio/contracts`); Konsum als kompiliertes `dist/`.
- ESM `NodeNext`: relative Importe brauchen `.js`-Endung auch in `.ts`-Dateien.
- `tsconfig.base.json`: `strict` + `noUncheckedIndexedAccess` überall. Test-Dateien werden **nicht**
  typgeprüft (`apps/api/tsconfig.json` schließt `src/**/*.test.ts` aus).
- Alle Zeitpunkte `timestamptz` in **UTC**; Intervalle/Vergleiche halboffen.
- Statusänderung + `audit_event` + `outbox_event` immer in **derselben** DB-Transaktion.
- Prettier (web-Konvention, gilt auch für api): 4-Space-Tabs, Single Quotes, `printWidth` 100.
- Fehlerantworten folgen `apiErrorSchema` (`{ code, message, issues? }`); Fehlercodes aus Spec §8.
- Deutsch für UI-Texte, Doku und Commit-Messages; Code/Bezeichner Englisch.
- Env-Defaults: `MAX_UPLOAD_BYTES=10485760`, `ORPHAN_UPLOAD_TTL_HOURS=24`, `UPLOAD_RATE_LIMIT_MAX=30`,
  `INQUIRY_RATE_LIMIT_MAX=5`, `UPLOADS_DIR=apps/api/var/uploads`.
- Max. **5** Referenzbilder pro Anfrage — festgelegt durch `referenceImageIds.max(5)` im Contract,
  keine Env-Variable.
- `region_code` hat **keinen** DB-CHECK; die gültige Menge lebt allein in
  `bodyRegionCodeSchema` (Contract).
- Kysely `.where(col, 'in', …)` gegen Enum-Spalten: `const X = […] as const satisfies readonly T[]`
  und `X` direkt übergeben (kein `as never`-Cast) — siehe Spec-B-Repositories.

## Voraussetzungen

- **Git:** Von einem Spec-B-Stand aus branchen (`feat/anfrage-wizard-spec-c`). Commit-Messages ohne
  AI-Trailer (siehe `~/CLAUDE.md`), Präfix-Konvention wie in Spec B.
- **Datenbank:** `npm run db:up` (PostgreSQL 18). DB-Integrationstests legen je Lauf über
  `apps/api/src/testing/db.ts` eine frische Datenbank an (`TEST_DATABASE_URL`, Default
  `postgresql://tattoo:tattoo-local@localhost:5432/tattoo_studio_test`). Die Dev-DB `tattoo_studio`
  nach Migration `003` einmal neu aufsetzen (`DROP`/`CREATE` + `npm run db:migrate`), da `003` die
  Legacy-Tabelle droppt.
- **`sharp`:** native Dependency; Prebuilt für Windows-Dev und Linux vorhanden. Bringt das Prebuilt
  kein `libheif` mit, wird HEIC/HEIF serverseitig abgelehnt statt konvertiert (Task 11, `heifSupported()`).

## Abweichungen von der Spec

- Keine. Bei Konflikten gilt die Spec; Abweichungen hier dokumentieren.

## Dateistruktur

### Neu — API

| Datei | Verantwortung |
|---|---|
| `apps/api/src/domain/inquiry-status.ts` | erlaubte Statusübergänge `inquiry` |
| `apps/api/src/repositories/customer.ts` | `upsertCustomer` (aus `holds.ts` extrahiert) |
| `apps/api/src/repositories/media.ts` | `media_asset` einfügen/lesen/verknüpfen/listen/löschen |
| `apps/api/src/repositories/inquiries.ts` | `inquiry` + `inquiry_region` schreiben/lesen, Liste, Übergang |
| `apps/api/src/plugins/uploads-storage.ts` | Pfadauflösung + `read`/`write`/`delete`/`stat` im privaten Volume |
| `apps/api/src/services/upload-service.ts` | Validierung, HEIC→JPEG, Datei ablegen, Zeile schreiben |
| `apps/api/src/services/inquiry-service.ts` | `createInquiry` — die Anfrage-Transaktion |
| `apps/api/src/services/admin-inquiry-service.ts` | Liste, Detail (+ NEW→IN_REVIEW-Bump), accept/needs-info/decline |
| `apps/api/src/routes/service-types.ts` | `GET /v1/service-types` |
| `apps/api/src/routes/uploads.ts` | `POST /v1/uploads`, `GET /v1/uploads/{id}` |
| `apps/api/src/routes/inquiries.ts` | `POST /v1/inquiries` |
| `apps/api/src/routes/admin-inquiries.ts` | `GET`/`POST` `/v1/admin/inquiries…` |
| `apps/api/src/jobs/purge-orphan-uploads.ts` | Job: verwaiste `media_asset` löschen |
| `apps/api/migrations/003_inquiries_and_media.sql` | neue Tabellen + `DROP booking_request` |

### Neu — Contracts

| Datei | Verantwortung |
|---|---|
| `packages/contracts/src/body-regions.ts` | `bodyRegionCodeSchema` + `bodyRegionLabels` |
| `packages/contracts/src/inquiry.ts` | `createInquirySchema`, `inquiryStatusSchema`, `inquiryResponseSchema` |
| `packages/contracts/src/upload.ts` | `uploadResultSchema` |
| `packages/contracts/src/admin-inquiry.ts` | Liste/Detail/Bild + accept/needs-info/decline-Requests |

### Neu — Web

| Datei | Verantwortung |
|---|---|
| `apps/web/src/shared/AppWrapper.tsx` | verschoben aus `components/`; von beiden Entry-Points genutzt |
| `apps/web/src/shared/BodyRegionPicker.tsx` | Vorder/Rück-SVG-Figur, `mode: 'edit' \| 'view'` |
| `apps/web/src/shared/bodyFigure.tsx` | die SVG-Figur (Platzhalter-Piktogramm; §13 der Spec) |
| `apps/web/src/wizard/Wizard.tsx` | Orchestrierung der 4 Schritte, Draft, Absende-Validierung |
| `apps/web/src/wizard/steps/ServiceStep.tsx` | 01 Art |
| `apps/web/src/wizard/steps/TimeStep.tsx` | 02 Zeit |
| `apps/web/src/wizard/steps/MotifStep.tsx` | 03 Motiv |
| `apps/web/src/wizard/steps/ContactStep.tsx` | 04 Kontakt |
| `apps/web/src/wizard/steps/Confirmation.tsx` | Bestätigungsseite |
| `apps/web/src/wizard/ReferenceUploader.tsx` | Hintergrund-Upload mit Vorschau/Fortschritt |
| `apps/web/src/wizard/SizeField.tsx` | cm-Eingabe |
| `apps/web/src/wizard/api/inquiryApi.ts` | Client-Token, Idempotency, Upload, `createInquiry` |
| `apps/web/src/studio.tsx` | Entry-Point Studio |
| `apps/web/src/studio.html` | HTML für den Studio-Entry-Point |
| `apps/web/src/studio/StudioApp.tsx` | Token-Gate + Liste ⇄ Detail |
| `apps/web/src/studio/InquiryList.tsx` | Anfrage-Liste |
| `apps/web/src/studio/InquiryDetail.tsx` | Anfrage-Detail + Aktionen |
| `apps/web/src/studio/api/studioApi.ts` | Bearer-Header, Admin-Endpunkte |

### Geändert

| Datei | Änderung |
|---|---|
| `apps/api/src/config.ts` | `AppConfig` um Upload-/Rate-Limit-Felder |
| `apps/api/src/database/types.ts` | `InquiryTable`, `InquiryRegionTable`, `MediaAssetTable`; `BookingRequestTable` raus |
| `apps/api/src/app.ts` | neue Routen + `@fastify/multipart` registrieren; `/api/v1/*` raus; `/health` ohne Repository |
| `apps/api/src/server.ts` | kein `PostgresBookingRequestRepository` mehr |
| `apps/api/src/worker.ts` | `runPurgeOrphanUploadsJob` in den Tick |
| `apps/api/src/repositories/holds.ts` | `upsertCustomer` importiert aus `customer.ts` |
| `apps/api/src/services/hold-service.ts` | `upsertCustomer` importiert aus `customer.ts` |
| `apps/api/src/app.test.ts` | ohne Repository/Legacy-Routen neu geschnitten |
| `apps/api/package.json` | Deps `@fastify/multipart`, `sharp` |
| `apps/api/.gitignore` bzw. Repo-`.gitignore` | `apps/api/var/` |
| `packages/contracts/src/index.ts` | neue Module re-exportieren; alle `legacy*`- + `createBookingRequest*`-Schemas raus |
| `apps/web/toolkit.config.ts` | zweiter Entry-Point `studio` |
| `apps/web/src/components/App.tsx` | rendert `<Wizard/>` |
| `apps/web/src/index.tsx` | Import aus `shared/AppWrapper` |
| `apps/web/src/components/app.css` | Stile für die neuen Schritte + Studio |
| `.env.example` | neue Variablen |
| `compose.yaml` | Named Volume für Uploads, in `apps/api` gemountet |
| `CLAUDE.md` | Anfrage-Flow, Uploads, `/studio.html`, `UPLOADS_DIR`, Legacy-Abbau |

### Gelöscht

`apps/api/src/catalog.ts` · `apps/api/src/availability.ts` · `apps/api/src/repository.ts` ·
`apps/web/src/api/bookingApi.ts` · `apps/web/src/components/BookingFlow.tsx` ·
`apps/web/src/components/BookingFlow.test.tsx` · `apps/web/src/components/AppWrapper.tsx` (verschoben)

---

### Task 1: Config um Upload- und Rate-Limit-Felder erweitern

**Files:**
- Modify: `apps/api/src/config.ts`
- Test: `apps/api/src/config.test.ts` (erweitern)
- Modify: `.env.example`
- Modify: `.gitignore` (Repo-Wurzel)

**Interfaces:**
- Produces:
  - `AppConfig` zusätzlich `{ uploadsDir: string; maxUploadBytes: number; orphanUploadTtlHours: number; uploadRateLimitMax: number; inquiryRateLimitMax: number }`
  - `loadConfig` liest `UPLOADS_DIR` (nicht-leerer String, Default `apps/api/var/uploads`), `MAX_UPLOAD_BYTES` (10485760), `ORPHAN_UPLOAD_TTL_HOURS` (24), `UPLOAD_RATE_LIMIT_MAX` (30), `INQUIRY_RATE_LIMIT_MAX` (5)

- [ ] **Step 1: Failing test** — an `apps/api/src/config.test.ts` anhängen (innerhalb `describe('loadConfig', …)`)

```ts
    it('applies spec C upload defaults', () => {
        const c = loadConfig({ ADMIN_API_TOKEN: 'test-token' });
        expect(c).toMatchObject({
            uploadsDir: 'apps/api/var/uploads',
            maxUploadBytes: 10_485_760,
            orphanUploadTtlHours: 24,
            uploadRateLimitMax: 30,
            inquiryRateLimitMax: 5,
        });
    });

    it('parses upload overrides and rejects a blank UPLOADS_DIR', () => {
        const c = loadConfig({ ADMIN_API_TOKEN: 't', UPLOADS_DIR: '/data/up', MAX_UPLOAD_BYTES: '5000000' });
        expect(c.uploadsDir).toBe('/data/up');
        expect(c.maxUploadBytes).toBe(5_000_000);
        expect(() => loadConfig({ ADMIN_API_TOKEN: 't', UPLOADS_DIR: '' })).toThrow();
    });
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npm test --workspace @tattoo-studio/api -- config`
Expected: FAIL (`uploadsDir` undefined).

- [ ] **Step 3: Implement** — `apps/api/src/config.ts`: `schema`, `AppConfig`, `loadConfig` erweitern

```ts
const schema = z.object({
    GRID_MINUTES: intFromEnv(15),
    MIN_LEAD_HOURS: intFromEnv(12),
    HOLD_TTL_HOURS: intFromEnv(48),
    MAX_AVAILABILITY_DAYS: intFromEnv(31),
    WORKER_INTERVAL_SECONDS: intFromEnv(60),
    RATE_LIMIT_MAX: intFromEnv(10),
    MAX_UPLOAD_BYTES: intFromEnv(10_485_760),
    ORPHAN_UPLOAD_TTL_HOURS: intFromEnv(24),
    UPLOAD_RATE_LIMIT_MAX: intFromEnv(30),
    INQUIRY_RATE_LIMIT_MAX: intFromEnv(5),
    UPLOADS_DIR: z
        .string()
        .optional()
        .transform((v) => (v === undefined ? 'apps/api/var/uploads' : v))
        .pipe(z.string().min(1, 'UPLOADS_DIR must not be blank')),
    ADMIN_API_TOKEN: z
        .string({ error: 'ADMIN_API_TOKEN is required' })
        .min(1, 'ADMIN_API_TOKEN is required'),
});

export type AppConfig = {
    gridMinutes: number;
    minLeadHours: number;
    holdTtlHours: number;
    maxAvailabilityDays: number;
    adminApiToken: string;
    workerIntervalSeconds: number;
    rateLimitMax: number;
    uploadsDir: string;
    maxUploadBytes: number;
    orphanUploadTtlHours: number;
    uploadRateLimitMax: number;
    inquiryRateLimitMax: number;
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
        uploadsDir: parsed.UPLOADS_DIR,
        maxUploadBytes: parsed.MAX_UPLOAD_BYTES,
        orphanUploadTtlHours: parsed.ORPHAN_UPLOAD_TTL_HOURS,
        uploadRateLimitMax: parsed.UPLOAD_RATE_LIMIT_MAX,
        inquiryRateLimitMax: parsed.INQUIRY_RATE_LIMIT_MAX,
    };
};
```

- [ ] **Step 4: Run test, verify it passes**

Run: `npm test --workspace @tattoo-studio/api -- config`
Expected: PASS.

- [ ] **Step 5: `.env.example` erweitern** — anhängen

```
UPLOADS_DIR=apps/api/var/uploads
MAX_UPLOAD_BYTES=10485760
ORPHAN_UPLOAD_TTL_HOURS=24
UPLOAD_RATE_LIMIT_MAX=30
INQUIRY_RATE_LIMIT_MAX=5
```

- [ ] **Step 6: `.gitignore` (Repo-Wurzel)** — Zeile ergänzen: `apps/api/var/`

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/config.ts apps/api/src/config.test.ts .env.example .gitignore
git commit -m "feat(api): Upload- und Rate-Limit-Konfiguration für Spec C"
```

---

### Task 2: Contracts — Körperregionen

**Files:**
- Create: `packages/contracts/src/body-regions.ts`
- Modify: `packages/contracts/src/index.ts`
- Test: `packages/contracts/src/body-regions.test.ts`

**Interfaces:**
- Produces:
  - `bodyRegionCodeSchema` (`z.enum`, 34 Codes)
  - `type BodyRegionCode = z.infer<typeof bodyRegionCodeSchema>`
  - `bodyRegionLabels: Record<BodyRegionCode, string>`

- [ ] **Step 1: Failing test**

```ts
// packages/contracts/src/body-regions.test.ts
import { describe, expect, it } from 'vitest';
import { bodyRegionCodeSchema, bodyRegionLabels } from './index.js';

describe('body regions', () => {
    it('has 34 codes', () => {
        expect(bodyRegionCodeSchema.options).toHaveLength(34);
    });

    it('has a German label for every code', () => {
        for (const code of bodyRegionCodeSchema.options) {
            expect(typeof bodyRegionLabels[code]).toBe('string');
            expect(bodyRegionLabels[code].length).toBeGreaterThan(0);
        }
    });

    it('rejects an unknown code', () => {
        expect(bodyRegionCodeSchema.safeParse('front.nose').success).toBe(false);
    });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npm test --workspace @tattoo-studio/contracts -- body-regions`
Expected: FAIL (Export fehlt).

- [ ] **Step 3: Implement**

```ts
// packages/contracts/src/body-regions.ts
import { z } from 'zod';

export const bodyRegionCodeSchema = z.enum([
    'front.head', 'front.neck', 'front.chest', 'front.abdomen', 'front.pelvis',
    'front.shoulder.left', 'front.shoulder.right',
    'front.upper_arm.left', 'front.upper_arm.right',
    'front.forearm.left', 'front.forearm.right',
    'front.hand.left', 'front.hand.right',
    'front.thigh.left', 'front.thigh.right',
    'front.lower_leg.left', 'front.lower_leg.right',
    'front.foot.left', 'front.foot.right',
    'back.head', 'back.neck', 'back.upper_back', 'back.lower_back', 'back.buttocks',
    'back.shoulder_blade.left', 'back.shoulder_blade.right',
    'back.upper_arm.left', 'back.upper_arm.right',
    'back.forearm.left', 'back.forearm.right',
    'back.thigh.left', 'back.thigh.right',
    'back.calf.left', 'back.calf.right',
]);

export type BodyRegionCode = z.infer<typeof bodyRegionCodeSchema>;

/** Einzige Quelle für Anzeigetexte. `links`/`rechts` = aus Sicht der Kundin. */
export const bodyRegionLabels: Record<BodyRegionCode, string> = {
    'front.head': 'Kopf / Gesicht',
    'front.neck': 'Hals',
    'front.chest': 'Brust',
    'front.abdomen': 'Bauch',
    'front.pelvis': 'Becken / Leiste',
    'front.shoulder.left': 'Schulter links',
    'front.shoulder.right': 'Schulter rechts',
    'front.upper_arm.left': 'Oberarm links',
    'front.upper_arm.right': 'Oberarm rechts',
    'front.forearm.left': 'Unterarm links',
    'front.forearm.right': 'Unterarm rechts',
    'front.hand.left': 'Hand links',
    'front.hand.right': 'Hand rechts',
    'front.thigh.left': 'Oberschenkel links',
    'front.thigh.right': 'Oberschenkel rechts',
    'front.lower_leg.left': 'Unterschenkel links',
    'front.lower_leg.right': 'Unterschenkel rechts',
    'front.foot.left': 'Fuß links',
    'front.foot.right': 'Fuß rechts',
    'back.head': 'Hinterkopf',
    'back.neck': 'Nacken',
    'back.upper_back': 'Oberer Rücken',
    'back.lower_back': 'Unterer Rücken / Lende',
    'back.buttocks': 'Gesäß',
    'back.shoulder_blade.left': 'Schulterblatt links',
    'back.shoulder_blade.right': 'Schulterblatt rechts',
    'back.upper_arm.left': 'Oberarm links (hinten)',
    'back.upper_arm.right': 'Oberarm rechts (hinten)',
    'back.forearm.left': 'Unterarm links (hinten)',
    'back.forearm.right': 'Unterarm rechts (hinten)',
    'back.thigh.left': 'Hinterer Oberschenkel links',
    'back.thigh.right': 'Hinterer Oberschenkel rechts',
    'back.calf.left': 'Wade links',
    'back.calf.right': 'Wade rechts',
};
```

- [ ] **Step 4: `index.ts` erweitern** — Zeile ergänzen: `export * from './body-regions.js';`

- [ ] **Step 5: Build + Test**

Run: `npm run build --workspace @tattoo-studio/contracts && npm test --workspace @tattoo-studio/contracts -- body-regions`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/contracts/src/body-regions.ts packages/contracts/src/body-regions.test.ts packages/contracts/src/index.ts
git commit -m "feat(contracts): Körperregionen-Codes und Labels"
```

---

### Task 3: Contracts — Inquiry-, Upload- und Admin-Schemas

**Files:**
- Create: `packages/contracts/src/inquiry.ts`, `packages/contracts/src/upload.ts`, `packages/contracts/src/admin-inquiry.ts`
- Modify: `packages/contracts/src/errors.ts`, `packages/contracts/src/service-type.ts`, `packages/contracts/src/index.ts`
- Test: `packages/contracts/src/spec-c.test.ts`

**Interfaces:**
- Consumes: `bodyRegionCodeSchema` (Task 2), vorhandenes `serviceTypeSchema` (`./service-type.js`)
- Produces (alle als `z.infer`-Typen exportiert):
  - `createInquirySchema` → `{ serviceTypeId: string; preferredArtistId: string; preferredStartsAt?: string; bodyRegions: BodyRegionCode[]; sizeCm?: number; description: string; referenceImageIds: string[]; customer: { firstName; lastName; email; phone }; chaynsPersonId?: string; acceptsTerms: true }`
  - `inquiryStatusSchema` → `'NEW'|'IN_REVIEW'|'NEEDS_INFO'|'ACCEPTED'|'DECLINED'`
  - `inquiryResponseSchema` → `{ inquiryId: string; status; reference: string; createdAt: string }`
  - `uploadResultSchema` → `{ uploadId: string; url: string; contentType: string; width: number|null; height: number|null; byteSize: number }`
  - `serviceTypesResponseSchema` → `{ items: ServiceType[] }`
  - `inquiryListItemSchema`, `inquiryImageSchema`, `inquiryDetailSchema`
  - `inquiryAcceptRequestSchema` → `{ studioNote?: string }`
  - `inquiryNeedsInfoRequestSchema` → `{ message: string }`
  - `inquiryDeclineRequestSchema` → `{ reason: string }`
  - `errors.ts`: `apiErrorCodeSchema` um `INQUIRY_NOT_FOUND`, `UPLOAD_TOO_LARGE`, `UPLOAD_TYPE_NOT_ALLOWED`, `UPLOAD_NOT_FOUND`, `TOO_MANY_UPLOADS` erweitert

- [ ] **Step 1: Failing test**

```ts
// packages/contracts/src/spec-c.test.ts
import { describe, expect, it } from 'vitest';
import {
    createInquirySchema,
    inquiryDeclineRequestSchema,
    inquiryNeedsInfoRequestSchema,
    uploadResultSchema,
    serviceTypesResponseSchema,
} from './index.js';

const validBody = {
    serviceTypeId: 'small-tattoo',
    bodyRegions: ['front.upper_arm.left'],
    customer: { firstName: 'Ann', lastName: 'Roe', email: 'a@b.de', phone: '+49 111 222' },
    acceptsTerms: true,
};

describe('spec C contracts', () => {
    it('defaults optional inquiry fields', () => {
        const q = createInquirySchema.parse(validBody);
        expect(q).toMatchObject({ preferredArtistId: 'any', description: '', referenceImageIds: [] });
    });

    it('requires at least one body region', () => {
        expect(createInquirySchema.safeParse({ ...validBody, bodyRegions: [] }).success).toBe(false);
    });

    it('rejects more than 5 reference images', () => {
        const ids = Array.from({ length: 6 }, () => crypto.randomUUID());
        expect(createInquirySchema.safeParse({ ...validBody, referenceImageIds: ids }).success).toBe(false);
    });

    it('rejects an unchecked consent and a bad email', () => {
        expect(createInquirySchema.safeParse({ ...validBody, acceptsTerms: false }).success).toBe(false);
        expect(
            createInquirySchema.safeParse({ ...validBody, customer: { ...validBody.customer, email: 'x' } }).success,
        ).toBe(false);
    });

    it('validates the admin action bodies', () => {
        expect(inquiryDeclineRequestSchema.parse({ reason: 'passt nicht' }).reason).toBe('passt nicht');
        expect(inquiryNeedsInfoRequestSchema.safeParse({ message: '' }).success).toBe(false);
    });

    it('describes an upload result and a service-type list', () => {
        const u = uploadResultSchema.parse({
            uploadId: crypto.randomUUID(), url: '/v1/uploads/x', contentType: 'image/jpeg',
            width: 800, height: 600, byteSize: 1234,
        });
        expect(u.contentType).toBe('image/jpeg');
        expect(serviceTypesResponseSchema.parse({ items: [] }).items).toEqual([]);
    });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npm test --workspace @tattoo-studio/contracts -- spec-c`
Expected: FAIL (Exports fehlen).

- [ ] **Step 3: `errors.ts` erweitern** — Enum-Liste ergänzen

```ts
export const apiErrorCodeSchema = z.enum([
    'VALIDATION_ERROR', 'UNAUTHORIZED', 'SERVICE_TYPE_NOT_FOUND', 'ARTIST_NOT_FOUND',
    'HOLD_NOT_FOUND', 'SLOT_CONFLICT', 'SLOT_NO_LONGER_AVAILABLE', 'IDEMPOTENCY_KEY_REUSED',
    'INVALID_STATE', 'RATE_LIMITED',
    'INQUIRY_NOT_FOUND', 'UPLOAD_TOO_LARGE', 'UPLOAD_TYPE_NOT_ALLOWED', 'UPLOAD_NOT_FOUND',
    'TOO_MANY_UPLOADS',
]);
```

- [ ] **Step 4: `inquiry.ts` schreiben**

```ts
// packages/contracts/src/inquiry.ts
import { z } from 'zod';
import { bodyRegionCodeSchema } from './body-regions.js';

export const inquiryStatusSchema = z.enum(['NEW', 'IN_REVIEW', 'NEEDS_INFO', 'ACCEPTED', 'DECLINED']);
export type InquiryStatus = z.infer<typeof inquiryStatusSchema>;

export const createInquirySchema = z.object({
    serviceTypeId: z.string().min(1),
    preferredArtistId: z.string().min(1).default('any'),
    preferredStartsAt: z.iso.datetime({ offset: true }).optional(),
    bodyRegions: z.array(bodyRegionCodeSchema).min(1).max(20),
    sizeCm: z.number().int().positive().max(300).optional(),
    description: z.string().trim().max(2000).default(''),
    referenceImageIds: z.array(z.uuid()).max(5).default([]),
    customer: z.object({
        firstName: z.string().trim().min(2).max(80),
        lastName: z.string().trim().min(2).max(80),
        email: z.email(),
        phone: z.string().trim().min(6).max(40),
    }),
    chaynsPersonId: z.string().min(1).optional(),
    acceptsTerms: z.literal(true),
});
export type CreateInquiry = z.infer<typeof createInquirySchema>;

export const inquiryResponseSchema = z.object({
    inquiryId: z.uuid(),
    status: inquiryStatusSchema,
    reference: z.string(),
    createdAt: z.iso.datetime({ offset: true }),
});
export type InquiryResponse = z.infer<typeof inquiryResponseSchema>;
```

- [ ] **Step 5: `upload.ts` schreiben**

```ts
// packages/contracts/src/upload.ts
import { z } from 'zod';

export const uploadResultSchema = z.object({
    uploadId: z.uuid(),
    url: z.string(),
    contentType: z.string(),
    width: z.number().int().positive().nullable(),
    height: z.number().int().positive().nullable(),
    byteSize: z.number().int().positive(),
});
export type UploadResult = z.infer<typeof uploadResultSchema>;
```

- [ ] **Step 6: `service-type.ts` erweitern** — ans Dateiende anhängen

```ts
export const serviceTypesResponseSchema = z.object({ items: z.array(serviceTypeSchema) });
export type ServiceTypesResponse = z.infer<typeof serviceTypesResponseSchema>;
```

- [ ] **Step 7: `admin-inquiry.ts` schreiben**

```ts
// packages/contracts/src/admin-inquiry.ts
import { z } from 'zod';
import { bodyRegionCodeSchema } from './body-regions.js';
import { inquiryStatusSchema } from './inquiry.js';

export const inquiryListItemSchema = z.object({
    id: z.uuid(),
    status: inquiryStatusSchema,
    serviceTypeId: z.string(),
    serviceTypeName: z.string(),
    preferredArtistId: z.string().nullable(),
    preferredStartsAt: z.iso.datetime({ offset: true }).nullable(),
    customerName: z.string(),
    sizeCm: z.number().int().nullable(),
    regionCount: z.number().int(),
    imageCount: z.number().int(),
    createdAt: z.iso.datetime({ offset: true }),
});
export type InquiryListItem = z.infer<typeof inquiryListItemSchema>;

export const inquiryImageSchema = z.object({
    id: z.uuid(),
    url: z.string(),
    width: z.number().int().positive().nullable(),
    height: z.number().int().positive().nullable(),
});

export const inquiryDetailSchema = inquiryListItemSchema.extend({
    description: z.string(),
    bodyRegions: z.array(bodyRegionCodeSchema),
    customer: z.object({
        firstName: z.string(),
        lastName: z.string(),
        email: z.string(),
        phone: z.string(),
    }),
    chaynsPersonId: z.string().nullable(),
    images: z.array(inquiryImageSchema),
    studioNote: z.string().nullable(),
    needsInfoMessage: z.string().nullable(),
    declineReason: z.string().nullable(),
    acceptedTermsAt: z.iso.datetime({ offset: true }),
});
export type InquiryDetail = z.infer<typeof inquiryDetailSchema>;

export const inquiryAcceptRequestSchema = z.object({
    studioNote: z.string().trim().max(2000).optional(),
});
export const inquiryNeedsInfoRequestSchema = z.object({
    message: z.string().trim().min(1).max(1000),
});
export const inquiryDeclineRequestSchema = z.object({
    reason: z.string().trim().min(1).max(500),
});
export type InquiryAcceptRequest = z.infer<typeof inquiryAcceptRequestSchema>;
export type InquiryNeedsInfoRequest = z.infer<typeof inquiryNeedsInfoRequestSchema>;
export type InquiryDeclineRequest = z.infer<typeof inquiryDeclineRequestSchema>;
```

- [ ] **Step 8: `index.ts` erweitern** — Zeilen ergänzen

```ts
export * from './inquiry.js';
export * from './upload.js';
export * from './admin-inquiry.js';
```

- [ ] **Step 9: Build + Test**

Run: `npm run build --workspace @tattoo-studio/contracts && npm test --workspace @tattoo-studio/contracts`
Expected: PASS (`spec-c` + bestehende).

- [ ] **Step 10: Commit**

```bash
git add packages/contracts/src
git commit -m "feat(contracts): Schemas für Anfrage, Upload und Studio-Aktionen"
```

---

### Task 4: Migration `003` + Kysely-Typen

**Files:**
- Create: `apps/api/migrations/003_inquiries_and_media.sql`
- Modify: `apps/api/src/database/types.ts`
- Test: `apps/api/src/database/inquiries-schema.test.ts`

**Interfaces:**
- Produces: Kysely-`Database`-Interface zusätzlich `inquiry`, `inquiry_region`, `media_asset`; `BookingRequestTable` entfernt. Neuer Union-Typ `export type InquiryStatus = 'NEW' | 'IN_REVIEW' | 'NEEDS_INFO' | 'ACCEPTED' | 'DECLINED'`.

- [ ] **Step 1: Failing test**

```ts
// apps/api/src/database/inquiries-schema.test.ts
import { afterAll, afterEach, beforeAll, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '../testing/db.js';

let ctx: TestDb;
beforeAll(async () => { ctx = await createTestDb(); });
afterEach(async () => {
    await ctx.db.deleteFrom('media_asset').execute();
    await ctx.db.deleteFrom('inquiry').execute();
    await ctx.db.deleteFrom('customer').execute();
});
afterAll(async () => { await ctx.destroy(); });

const seedCustomer = () =>
    ctx.db.insertInto('customer')
        .values({ first_name: 'F', last_name: 'L', email: 'e@x.de', phone: '123456' })
        .returning('id').executeTakeFirstOrThrow();

it('dropped the legacy booking_request table', async () => {
    const { rows } = await ctx.db.executeQuery({
        sql: `SELECT to_regclass('public.booking_request') AS t`, parameters: [],
    } as never);
    expect((rows[0] as { t: string | null }).t).toBeNull();
});

it('cascades regions and media when an inquiry is deleted', async () => {
    const c = await seedCustomer();
    const inq = await ctx.db.insertInto('inquiry').values({
        service_type_id: 'small-tattoo', customer_id: c.id, status: 'NEW',
        client_token: 'tok', accepted_terms_at: '2026-08-29T10:00:00Z',
    }).returning('id').executeTakeFirstOrThrow();
    await ctx.db.insertInto('inquiry_region')
        .values({ inquiry_id: inq.id, region_code: 'front.upper_arm.left' }).execute();
    await ctx.db.insertInto('media_asset').values({
        purpose: 'inquiry_reference', inquiry_id: inq.id, storage_key: '2026/08/a.jpg',
        content_type: 'image/jpeg', byte_size: 10, client_token: 'tok',
    }).execute();

    await ctx.db.deleteFrom('inquiry').where('id', '=', inq.id).execute();

    expect(await ctx.db.selectFrom('inquiry_region').selectAll().execute()).toHaveLength(0);
    expect(await ctx.db.selectFrom('media_asset').selectAll().execute()).toHaveLength(0);
});

it('rejects an unknown status and a non-positive size', async () => {
    const c = await seedCustomer();
    await expect(
        ctx.db.insertInto('inquiry').values({
            service_type_id: 'small-tattoo', customer_id: c.id, status: 'BOGUS' as never,
            client_token: 't', accepted_terms_at: '2026-08-29T10:00:00Z',
        }).execute(),
    ).rejects.toThrow();
    await expect(
        ctx.db.insertInto('inquiry').values({
            service_type_id: 'small-tattoo', customer_id: c.id, status: 'NEW', size_cm: 0,
            client_token: 't', accepted_terms_at: '2026-08-29T10:00:00Z',
        }).execute(),
    ).rejects.toThrow();
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npm test --workspace @tattoo-studio/api -- inquiries-schema`
Expected: FAIL (Tabellen fehlen).

- [ ] **Step 3: Migration schreiben** — `apps/api/migrations/003_inquiries_and_media.sql`

```sql
CREATE TABLE inquiry (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    service_type_id text NOT NULL REFERENCES service_type(id),
    preferred_artist_id text REFERENCES artist(id),
    preferred_starts_at timestamptz,
    size_cm integer CHECK (size_cm > 0),
    description text NOT NULL DEFAULT '',
    status text NOT NULL CHECK (status IN ('NEW','IN_REVIEW','NEEDS_INFO','ACCEPTED','DECLINED')),
    studio_note text,
    needs_info_message text,
    decline_reason text,
    customer_id uuid NOT NULL REFERENCES customer(id),
    client_token text NOT NULL,
    accepted_terms_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX inquiry_status_created_idx ON inquiry (status, created_at DESC);

CREATE TABLE inquiry_region (
    inquiry_id uuid NOT NULL REFERENCES inquiry(id) ON DELETE CASCADE,
    region_code text NOT NULL,
    PRIMARY KEY (inquiry_id, region_code)
);

CREATE TABLE media_asset (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    purpose text NOT NULL CHECK (purpose IN ('inquiry_reference')),
    inquiry_id uuid REFERENCES inquiry(id) ON DELETE CASCADE,
    storage_key text NOT NULL,
    content_type text NOT NULL,
    original_filename text,
    byte_size integer NOT NULL CHECK (byte_size > 0),
    width integer,
    height integer,
    client_token text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    linked_at timestamptz
);
CREATE INDEX media_asset_inquiry_idx ON media_asset (inquiry_id);
CREATE INDEX media_asset_orphan_idx ON media_asset (created_at) WHERE inquiry_id IS NULL;

-- Legacy-Anfragepfad abgelöst durch die inquiry-Tabelle.
DROP TABLE IF EXISTS booking_request;
```

- [ ] **Step 4: Kysely-Typen** — in `apps/api/src/database/types.ts` `BookingRequestTable` samt `Database`-Eintrag entfernen und ergänzen:

```ts
export type InquiryStatus = 'NEW' | 'IN_REVIEW' | 'NEEDS_INFO' | 'ACCEPTED' | 'DECLINED';

export interface InquiryTable {
    id: Generated<string>;
    service_type_id: string;
    preferred_artist_id: string | null;
    preferred_starts_at: ColumnType<Date | null, Date | string | null, Date | string | null>;
    size_cm: number | null;
    description: ColumnType<string, string | undefined, string>;
    status: InquiryStatus;
    studio_note: string | null;
    needs_info_message: string | null;
    decline_reason: string | null;
    customer_id: string;
    client_token: string;
    accepted_terms_at: Ts;
    created_at: TsDefault;
    updated_at: TsDefault;
}

export interface InquiryRegionTable {
    inquiry_id: string;
    region_code: string;
}

export interface MediaAssetTable {
    id: Generated<string>;
    purpose: 'inquiry_reference';
    inquiry_id: string | null;
    storage_key: string;
    content_type: string;
    original_filename: string | null;
    byte_size: number;
    width: number | null;
    height: number | null;
    client_token: string;
    created_at: TsDefault;
    linked_at: ColumnType<Date | null, Date | string | null, Date | string | null>;
}
```

Und im `Database`-Interface: `booking_request: BookingRequestTable;` entfernen, dafür:
```ts
    inquiry: InquiryTable;
    inquiry_region: InquiryRegionTable;
    media_asset: MediaAssetTable;
```

> `Ts` / `TsDefault` / `Generated` / `ColumnType` sind in `types.ts` bereits importiert bzw. definiert (Spec B).

- [ ] **Step 5: `repository.ts`-Bruch temporär hinnehmen** — `apps/api/src/repository.ts` und `apps/api/src/app.ts` referenzieren `booking_request` noch. Diese Dateien werden in Task 17 entfernt. Bis dahin: `npm run check-types --workspace @tattoo-studio/api` schlägt fehl. **Das ist erwartet** — die Schema-Tests (`vitest`, kein tsc) laufen trotzdem. Nach Task 17 ist `check-types` wieder grün.

  > Alternativ, wenn ein grüner `check-types`-Zwischenstand gewünscht ist: Task 17 (Legacy-API-Abbau) **vor** Task 4 ausführen. Der Plan ordnet Task 17 spät ein, weil der Legacy-Abbau die neuen `/v1`-Routen als Ersatz braucht; die Reihenfolge 4→…→17 ist die empfohlene, 17→4 ist zulässig.

- [ ] **Step 6: Run tests**

Run: `npm test --workspace @tattoo-studio/api -- inquiries-schema`
Expected: PASS (alle 3 `it`).

- [ ] **Step 7: Commit**

```bash
git add apps/api/migrations/003_inquiries_and_media.sql apps/api/src/database/types.ts apps/api/src/database/inquiries-schema.test.ts
git commit -m "feat(api): Anfrage- und Media-Schema, Legacy-Tabelle entfernt"
```

---

### Task 5: Domain — Inquiry-Statusübergänge

**Files:**
- Create: `apps/api/src/domain/inquiry-status.ts`
- Test: `apps/api/src/domain/inquiry-status.test.ts`

**Interfaces:**
- Consumes: `InquiryStatus` aus `../database/types.js`
- Produces:
  - `INQUIRY_TRANSITIONS: Record<InquiryStatus, readonly InquiryStatus[]>`
  - `canTransitionInquiry(from, to): boolean`
  - `assertInquiryTransition(from, to): void` — wirft `InquiryInvalidStateError`
  - `class InquiryInvalidStateError extends Error` mit `.from`, `.to`

- [ ] **Step 1: Failing test**

```ts
// apps/api/src/domain/inquiry-status.test.ts
import { describe, expect, it } from 'vitest';
import { assertInquiryTransition, canTransitionInquiry, InquiryInvalidStateError } from './inquiry-status.js';

describe('inquiry status transitions', () => {
    it('allows the review lifecycle', () => {
        expect(canTransitionInquiry('NEW', 'IN_REVIEW')).toBe(true);
        expect(canTransitionInquiry('NEW', 'DECLINED')).toBe(true);
        expect(canTransitionInquiry('IN_REVIEW', 'ACCEPTED')).toBe(true);
        expect(canTransitionInquiry('IN_REVIEW', 'NEEDS_INFO')).toBe(true);
        expect(canTransitionInquiry('NEEDS_INFO', 'IN_REVIEW')).toBe(true);
        expect(canTransitionInquiry('NEEDS_INFO', 'ACCEPTED')).toBe(true);
        expect(canTransitionInquiry('NEEDS_INFO', 'DECLINED')).toBe(true);
    });

    it('forbids resurrecting a terminal state and skipping review', () => {
        expect(canTransitionInquiry('ACCEPTED', 'IN_REVIEW')).toBe(false);
        expect(canTransitionInquiry('DECLINED', 'IN_REVIEW')).toBe(false);
        expect(canTransitionInquiry('NEW', 'ACCEPTED')).toBe(false);
        expect(canTransitionInquiry('NEW', 'NEEDS_INFO')).toBe(false);
    });

    it('assertInquiryTransition throws with context', () => {
        try {
            assertInquiryTransition('DECLINED', 'ACCEPTED');
            throw new Error('should have thrown');
        } catch (e) {
            expect(e).toBeInstanceOf(InquiryInvalidStateError);
            expect((e as InquiryInvalidStateError).from).toBe('DECLINED');
        }
    });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npm test --workspace @tattoo-studio/api -- inquiry-status`
Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
// apps/api/src/domain/inquiry-status.ts
import type { InquiryStatus } from '../database/types.js';

export const INQUIRY_TRANSITIONS: Record<InquiryStatus, readonly InquiryStatus[]> = {
    NEW: ['IN_REVIEW', 'DECLINED'],
    IN_REVIEW: ['ACCEPTED', 'NEEDS_INFO', 'DECLINED'],
    NEEDS_INFO: ['IN_REVIEW', 'ACCEPTED', 'DECLINED'],
    ACCEPTED: [],
    DECLINED: [],
};

export class InquiryInvalidStateError extends Error {
    readonly from: InquiryStatus;
    readonly to: InquiryStatus;
    constructor(from: InquiryStatus, to: InquiryStatus) {
        super(`Cannot transition inquiry from ${from} to ${to}`);
        this.name = 'InquiryInvalidStateError';
        this.from = from;
        this.to = to;
    }
}

export const canTransitionInquiry = (from: InquiryStatus, to: InquiryStatus): boolean =>
    INQUIRY_TRANSITIONS[from].includes(to);

export const assertInquiryTransition = (from: InquiryStatus, to: InquiryStatus): void => {
    if (!canTransitionInquiry(from, to)) throw new InquiryInvalidStateError(from, to);
};
```

- [ ] **Step 4: Run test, verify it passes**

Run: `npm test --workspace @tattoo-studio/api -- inquiry-status`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/domain/inquiry-status.ts apps/api/src/domain/inquiry-status.test.ts
git commit -m "feat(api): Statusübergangs-Wächter für Anfragen"
```

---

### Task 6: Repository — `upsertCustomer` extrahieren

**Files:**
- Create: `apps/api/src/repositories/customer.ts`
- Modify: `apps/api/src/repositories/holds.ts`, `apps/api/src/services/hold-service.ts`
- Test: `apps/api/src/repositories/customer.test.ts`

**Interfaces:**
- Produces: `upsertCustomer(trx: Kysely<Database>, c: { chaynsPersonId?: string; firstName: string; lastName: string; email: string; phone: string }): Promise<string>` — identisch zur bisherigen Implementierung in `holds.ts`.

- [ ] **Step 1: Failing test**

```ts
// apps/api/src/repositories/customer.test.ts
import { afterAll, afterEach, beforeAll, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '../testing/db.js';
import { upsertCustomer } from './customer.js';

let ctx: TestDb;
beforeAll(async () => { ctx = await createTestDb(); });
afterEach(async () => { await ctx.db.deleteFrom('customer').execute(); });
afterAll(async () => { await ctx.destroy(); });

it('returns the same id for the same chayns person', async () => {
    const a = await upsertCustomer(ctx.db, { chaynsPersonId: 'p1', firstName: 'A', lastName: 'B', email: 'a@b.de', phone: '123456' });
    const b = await upsertCustomer(ctx.db, { chaynsPersonId: 'p1', firstName: 'A', lastName: 'B', email: 'a@b.de', phone: '123456' });
    expect(a).toBe(b);
});

it('creates a fresh customer without a chayns person id', async () => {
    const a = await upsertCustomer(ctx.db, { firstName: 'A', lastName: 'B', email: 'a@b.de', phone: '1' });
    const b = await upsertCustomer(ctx.db, { firstName: 'C', lastName: 'D', email: 'c@d.de', phone: '2' });
    expect(a).not.toBe(b);
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npm test --workspace @tattoo-studio/api -- repositories/customer`
Expected: FAIL (`./customer.js` fehlt).

- [ ] **Step 3: `customer.ts` schreiben** — den `upsertCustomer`-Block **wörtlich** aus `apps/api/src/repositories/holds.ts` hierher verschieben:

```ts
// apps/api/src/repositories/customer.ts
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
```

- [ ] **Step 4: `holds.ts` anpassen** — die lokale `upsertCustomer`-Definition entfernen und importieren:

```ts
import { upsertCustomer } from './customer.js';
```

Am Export-Ende von `holds.ts` `export { upsertCustomer }` (Re-Export) hinzufügen, falls andere Module `upsertCustomer` aus `holds.js` importieren. `hold-service.ts` prüfen: importiert es `upsertCustomer` aus `./repositories/holds.js`? Dann auf `./repositories/customer.js` umstellen.

- [ ] **Step 5: Run tests + check-types**

Run: `npm test --workspace @tattoo-studio/api -- repositories/customer repositories/holds`
Run: `npm run check-types --workspace @tattoo-studio/api` (falls Task 19 noch aussteht: nur die neuen Fehler in `repository.ts`/`app.ts` sind ok)
Expected: `customer` + `holds`-Tests PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/repositories/customer.ts apps/api/src/repositories/customer.test.ts apps/api/src/repositories/holds.ts apps/api/src/services/hold-service.ts
git commit -m "refactor(api): upsertCustomer in eigenes Repository"
```

---

### Task 7: Repository — `media_asset`

**Files:**
- Create: `apps/api/src/repositories/media.ts`
- Test: `apps/api/src/repositories/media.test.ts`

**Interfaces:**
- Consumes: `Kysely<Database>` / `Transaction<Database>` (Parameter `exec`)
- Produces:
  - `type MediaAssetRow = Selectable<MediaAssetTable>`
  - `insertMediaAsset(exec, a: { purpose: 'inquiry_reference'; storageKey: string; contentType: string; originalFilename: string | null; byteSize: number; width: number | null; height: number | null; clientToken: string }): Promise<MediaAssetRow>`
  - `getMediaAssetById(exec, id: string): Promise<MediaAssetRow | undefined>`
  - `linkMediaAssets(exec, p: { ids: string[]; inquiryId: string; clientToken: string }): Promise<string[]>` — verknüpft nur `inquiry_id IS NULL AND client_token = clientToken`; gibt die tatsächlich verknüpften IDs zurück
  - `listOrphanMediaAssets(exec, olderThan: Date): Promise<MediaAssetRow[]>` — `inquiry_id IS NULL AND created_at < olderThan`
  - `deleteMediaAsset(exec, id: string): Promise<void>`

- [ ] **Step 1: Failing test**

```ts
// apps/api/src/repositories/media.test.ts
import { afterAll, afterEach, beforeAll, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '../testing/db.js';
import {
    deleteMediaAsset, getMediaAssetById, insertMediaAsset, linkMediaAssets, listOrphanMediaAssets,
} from './media.js';

let ctx: TestDb;
beforeAll(async () => { ctx = await createTestDb(); });
afterEach(async () => {
    await ctx.db.deleteFrom('media_asset').execute();
    await ctx.db.deleteFrom('inquiry').execute();
    await ctx.db.deleteFrom('customer').execute();
});
afterAll(async () => { await ctx.destroy(); });

const asset = (over = {}) => ({
    purpose: 'inquiry_reference' as const, storageKey: '2026/08/a.jpg', contentType: 'image/jpeg',
    originalFilename: 'a.jpg', byteSize: 100, width: 800, height: 600, clientToken: 'tok', ...over,
});

const seedInquiry = async () => {
    const c = await ctx.db.insertInto('customer')
        .values({ first_name: 'F', last_name: 'L', email: 'e@x.de', phone: '1' })
        .returning('id').executeTakeFirstOrThrow();
    return ctx.db.insertInto('inquiry').values({
        service_type_id: 'small-tattoo', customer_id: c.id, status: 'NEW',
        client_token: 'tok', accepted_terms_at: '2026-08-29T10:00:00Z',
    }).returning('id').executeTakeFirstOrThrow();
};

it('inserts and reads an asset', async () => {
    const row = await insertMediaAsset(ctx.db, asset());
    const back = await getMediaAssetById(ctx.db, row.id);
    expect(back?.storage_key).toBe('2026/08/a.jpg');
    expect(back?.inquiry_id).toBeNull();
});

it('links only unlinked assets owned by the client token', async () => {
    const mine = await insertMediaAsset(ctx.db, asset());
    const foreign = await insertMediaAsset(ctx.db, asset({ clientToken: 'other' }));
    const inq = await seedInquiry();
    const linked = await linkMediaAssets(ctx.db, { ids: [mine.id, foreign.id], inquiryId: inq.id, clientToken: 'tok' });
    expect(linked).toEqual([mine.id]);
    expect((await getMediaAssetById(ctx.db, mine.id))?.inquiry_id).toBe(inq.id);
    expect((await getMediaAssetById(ctx.db, foreign.id))?.inquiry_id).toBeNull();
});

it('lists and deletes orphans older than a cutoff', async () => {
    await insertMediaAsset(ctx.db, asset());
    await ctx.db.updateTable('media_asset').set({ created_at: new Date('2020-01-01T00:00:00Z') }).execute();
    const fresh = await insertMediaAsset(ctx.db, asset({ storageKey: '2026/08/b.jpg' }));
    const orphans = await listOrphanMediaAssets(ctx.db, new Date('2021-01-01T00:00:00Z'));
    expect(orphans).toHaveLength(1);
    await deleteMediaAsset(ctx.db, orphans[0]!.id);
    expect(await ctx.db.selectFrom('media_asset').selectAll().execute()).toHaveLength(1);
    expect((await getMediaAssetById(ctx.db, fresh.id))).toBeDefined();
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npm test --workspace @tattoo-studio/api -- repositories/media`
Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
// apps/api/src/repositories/media.ts
import type { Kysely, Selectable } from 'kysely';
import type { Database, MediaAssetTable } from '../database/types.js';

export type MediaAssetRow = Selectable<MediaAssetTable>;

export const insertMediaAsset = (
    exec: Kysely<Database>,
    a: {
        purpose: 'inquiry_reference';
        storageKey: string;
        contentType: string;
        originalFilename: string | null;
        byteSize: number;
        width: number | null;
        height: number | null;
        clientToken: string;
    },
): Promise<MediaAssetRow> =>
    exec
        .insertInto('media_asset')
        .values({
            purpose: a.purpose,
            inquiry_id: null,
            storage_key: a.storageKey,
            content_type: a.contentType,
            original_filename: a.originalFilename,
            byte_size: a.byteSize,
            width: a.width,
            height: a.height,
            client_token: a.clientToken,
        })
        .returningAll()
        .executeTakeFirstOrThrow();

export const getMediaAssetById = (exec: Kysely<Database>, id: string) =>
    exec.selectFrom('media_asset').selectAll().where('id', '=', id).executeTakeFirst();

export const linkMediaAssets = async (
    exec: Kysely<Database>,
    p: { ids: string[]; inquiryId: string; clientToken: string },
): Promise<string[]> => {
    if (p.ids.length === 0) return [];
    const rows = await exec
        .updateTable('media_asset')
        .set({ inquiry_id: p.inquiryId, linked_at: new Date() })
        .where('id', 'in', p.ids)
        .where('inquiry_id', 'is', null)
        .where('client_token', '=', p.clientToken)
        .returning('id')
        .execute();
    return rows.map((r) => r.id);
};

export const listOrphanMediaAssets = (exec: Kysely<Database>, olderThan: Date) =>
    exec
        .selectFrom('media_asset')
        .selectAll()
        .where('inquiry_id', 'is', null)
        .where('created_at', '<', olderThan)
        .execute();

export const deleteMediaAsset = async (exec: Kysely<Database>, id: string) => {
    await exec.deleteFrom('media_asset').where('id', '=', id).execute();
};
```

- [ ] **Step 4: Run test, verify it passes**

Run: `npm test --workspace @tattoo-studio/api -- repositories/media`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/repositories/media.ts apps/api/src/repositories/media.test.ts
git commit -m "feat(api): media_asset-Repository"
```

---

### Task 8: Repository — `inquiry` / `inquiry_region`

**Files:**
- Create: `apps/api/src/repositories/inquiries.ts`
- Test: `apps/api/src/repositories/inquiries.test.ts`

**Interfaces:**
- Consumes: `Kysely<Database>` (Parameter `exec`), `InquiryStatus`, `BodyRegionCode` (Contract)
- Produces:
  - `type InquiryRow = Selectable<InquiryTable>`
  - `insertInquiry(exec, i: { serviceTypeId: string; preferredArtistId: string | null; preferredStartsAt: string | null; sizeCm: number | null; description: string; customerId: string; clientToken: string; acceptedTermsAt: string }): Promise<InquiryRow>` — legt mit `status: 'NEW'` an
  - `insertInquiryRegions(exec, inquiryId: string, regionCodes: string[]): Promise<void>`
  - `getInquiryById(exec, id: string): Promise<(InquiryRow & { regions: string[]; images: MediaAssetRow[] }) | undefined>`
  - `listInquiries(exec, q: { status?: string; limit: number }): Promise<Array<InquiryRow & { serviceTypeName: string; customerName: string; regionCount: number; imageCount: number }>>`
  - `transitionInquiry(exec, id: string, to: InquiryStatus, patch: { studioNote?: string; needsInfoMessage?: string; declineReason?: string }): Promise<void>` — nur `UPDATE`, kein Guard (Guard in der Service-Schicht)

- [ ] **Step 1: Failing test**

```ts
// apps/api/src/repositories/inquiries.test.ts
import { afterAll, afterEach, beforeAll, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '../testing/db.js';
import { getInquiryById, insertInquiry, insertInquiryRegions, listInquiries, transitionInquiry } from './inquiries.js';
import { insertMediaAsset, linkMediaAssets } from './media.js';

let ctx: TestDb;
beforeAll(async () => { ctx = await createTestDb(); });
afterEach(async () => {
    await ctx.db.deleteFrom('media_asset').execute();
    await ctx.db.deleteFrom('inquiry').execute();
    await ctx.db.deleteFrom('customer').execute();
});
afterAll(async () => { await ctx.destroy(); });

const seedCustomerId = async () =>
    (await ctx.db.insertInto('customer').values({ first_name: 'Ann', last_name: 'Roe', email: 'a@b.de', phone: '1' })
        .returning('id').executeTakeFirstOrThrow()).id;

const base = (customerId: string) => ({
    serviceTypeId: 'small-tattoo', preferredArtistId: 'mara' as string | null,
    preferredStartsAt: null, sizeCm: 12, description: 'florales Motiv', customerId,
    clientToken: 'tok', acceptedTermsAt: '2026-08-29T10:00:00Z',
});

it('creates an inquiry with regions and reads it back with images', async () => {
    const cid = await seedCustomerId();
    const inq = await insertInquiry(ctx.db, base(cid));
    expect(inq.status).toBe('NEW');
    await insertInquiryRegions(ctx.db, inq.id, ['front.upper_arm.left', 'front.forearm.left']);
    const img = await insertMediaAsset(ctx.db, {
        purpose: 'inquiry_reference', storageKey: '2026/08/a.jpg', contentType: 'image/jpeg',
        originalFilename: null, byteSize: 10, width: null, height: null, clientToken: 'tok',
    });
    await linkMediaAssets(ctx.db, { ids: [img.id], inquiryId: inq.id, clientToken: 'tok' });

    const back = await getInquiryById(ctx.db, inq.id);
    expect(back?.regions.sort()).toEqual(['front.forearm.left', 'front.upper_arm.left']);
    expect(back?.images).toHaveLength(1);
});

it('lists inquiries with counts and a status filter', async () => {
    const cid = await seedCustomerId();
    const a = await insertInquiry(ctx.db, base(cid));
    await insertInquiryRegions(ctx.db, a.id, ['front.chest']);
    const b = await insertInquiry(ctx.db, base(cid));
    await transitionInquiry(ctx.db, b.id, 'DECLINED', { declineReason: 'nein' });

    const all = await listInquiries(ctx.db, { limit: 50 });
    expect(all).toHaveLength(2);
    const declined = await listInquiries(ctx.db, { status: 'DECLINED', limit: 50 });
    expect(declined).toHaveLength(1);
    const listed = all.find((r) => r.id === a.id)!;
    expect(listed.regionCount).toBe(1);
    expect(listed.serviceTypeName).toBe('Kleines Tattoo');
    expect(listed.customerName).toBe('Ann Roe');
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npm test --workspace @tattoo-studio/api -- repositories/inquiries`
Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
// apps/api/src/repositories/inquiries.ts
import type { Kysely, Selectable } from 'kysely';
import type { Database, InquiryStatus, InquiryTable } from '../database/types.js';
import type { MediaAssetRow } from './media.js';

export type InquiryRow = Selectable<InquiryTable>;

export const insertInquiry = (
    exec: Kysely<Database>,
    i: {
        serviceTypeId: string;
        preferredArtistId: string | null;
        preferredStartsAt: string | null;
        sizeCm: number | null;
        description: string;
        customerId: string;
        clientToken: string;
        acceptedTermsAt: string;
    },
): Promise<InquiryRow> =>
    exec
        .insertInto('inquiry')
        .values({
            service_type_id: i.serviceTypeId,
            preferred_artist_id: i.preferredArtistId,
            preferred_starts_at: i.preferredStartsAt,
            size_cm: i.sizeCm,
            description: i.description,
            status: 'NEW',
            customer_id: i.customerId,
            client_token: i.clientToken,
            accepted_terms_at: i.acceptedTermsAt,
        })
        .returningAll()
        .executeTakeFirstOrThrow();

export const insertInquiryRegions = async (
    exec: Kysely<Database>,
    inquiryId: string,
    regionCodes: string[],
) => {
    if (regionCodes.length === 0) return;
    await exec
        .insertInto('inquiry_region')
        .values(regionCodes.map((region_code) => ({ inquiry_id: inquiryId, region_code })))
        .execute();
};

export const getInquiryById = async (exec: Kysely<Database>, id: string) => {
    const row = await exec.selectFrom('inquiry').selectAll().where('id', '=', id).executeTakeFirst();
    if (!row) return undefined;
    const regions = (
        await exec.selectFrom('inquiry_region').select('region_code').where('inquiry_id', '=', id).execute()
    ).map((r) => r.region_code);
    const images = (await exec
        .selectFrom('media_asset')
        .selectAll()
        .where('inquiry_id', '=', id)
        .orderBy('created_at', 'asc')
        .execute()) as MediaAssetRow[];
    return { ...row, regions, images };
};

export const listInquiries = async (exec: Kysely<Database>, q: { status?: string; limit: number }) => {
    let query = exec
        .selectFrom('inquiry as i')
        .innerJoin('service_type as s', 's.id', 'i.service_type_id')
        .innerJoin('customer as c', 'c.id', 'i.customer_id')
        .selectAll('i')
        .select(({ selectFrom }) => [
            's.name as service_type_name',
            'c.first_name as first_name',
            'c.last_name as last_name',
            selectFrom('inquiry_region as r')
                .select(({ fn }) => fn.countAll<number>().as('n'))
                .whereRef('r.inquiry_id', '=', 'i.id')
                .as('region_count'),
            selectFrom('media_asset as m')
                .select(({ fn }) => fn.countAll<number>().as('n'))
                .whereRef('m.inquiry_id', '=', 'i.id')
                .as('image_count'),
        ])
        .orderBy('i.created_at', 'desc')
        .limit(q.limit);
    if (q.status) query = query.where('i.status', '=', q.status as InquiryStatus);
    const rows = await query.execute();
    return rows.map((r) => ({
        ...r,
        serviceTypeName: r.service_type_name,
        customerName: `${r.first_name} ${r.last_name}`,
        regionCount: Number(r.region_count),
        imageCount: Number(r.image_count),
    }));
};

export const transitionInquiry = async (
    exec: Kysely<Database>,
    id: string,
    to: InquiryStatus,
    patch: { studioNote?: string; needsInfoMessage?: string; declineReason?: string },
) => {
    await exec
        .updateTable('inquiry')
        .set({
            status: to,
            updated_at: new Date(),
            ...(patch.studioNote !== undefined ? { studio_note: patch.studioNote } : {}),
            ...(patch.needsInfoMessage !== undefined ? { needs_info_message: patch.needsInfoMessage } : {}),
            ...(patch.declineReason !== undefined ? { decline_reason: patch.declineReason } : {}),
        })
        .where('id', '=', id)
        .execute();
};
```

> Kysely-Subquery-Count: die `selectFrom(...).select(fn.countAll())....as('region_count')`-Form ist Kysely-idiomatisch; falls die Typinferenz für `.selectAll('i')` + korrelierte Subquery zickt, alternativ zwei separate `GROUP BY`-Aggregat-Queries und im JS zusammenführen — Hauptsache das Testverhalten stimmt.

- [ ] **Step 4: Run test, verify it passes**

Run: `npm test --workspace @tattoo-studio/api -- repositories/inquiries`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/repositories/inquiries.ts apps/api/src/repositories/inquiries.test.ts
git commit -m "feat(api): inquiry-Repository"
```

---

### Task 9: Plugin — privater Uploads-Speicher

**Files:**
- Create: `apps/api/src/plugins/uploads-storage.ts`
- Test: `apps/api/src/plugins/uploads-storage.test.ts`

**Interfaces:**
- Produces:
  - `type UploadsStorage = { keyFor(ext: string): string; write(key: string, data: Buffer): Promise<void>; read(key: string): Promise<Buffer>; stat(key: string): Promise<{ size: number } | undefined>; remove(key: string): Promise<void> }`
  - `createUploadsStorage(baseDir: string): UploadsStorage` — legt Unterordner an; `keyFor('jpg')` → `<yyyy>/<mm>/<uuid>.jpg`; `read` wirft, wenn die Datei fehlt; `stat` gibt `undefined` bei fehlender Datei; `remove` ist idempotent.

- [ ] **Step 1: Failing test**

```ts
// apps/api/src/plugins/uploads-storage.test.ts
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { createUploadsStorage, type UploadsStorage } from './uploads-storage.js';

let dir: string;
let storage: UploadsStorage;
beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'uploads-'));
    storage = createUploadsStorage(dir);
});

it('writes, reads, stats and removes a file by key', async () => {
    const key = storage.keyFor('jpg');
    expect(key).toMatch(/^\d{4}\/\d{2}\/[0-9a-f-]{36}\.jpg$/);
    await storage.write(key, Buffer.from('hello'));
    expect((await storage.read(key)).toString()).toBe('hello');
    expect(await storage.stat(key)).toEqual({ size: 5 });
    await storage.remove(key);
    expect(await storage.stat(key)).toBeUndefined();
    await storage.remove(key); // idempotent
});

it('rejects reading a missing key', async () => {
    await expect(storage.read('2000/01/missing.jpg')).rejects.toThrow();
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npm test --workspace @tattoo-studio/api -- uploads-storage`
Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
// apps/api/src/plugins/uploads-storage.ts
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

export type UploadsStorage = {
    keyFor(ext: string): string;
    write(key: string, data: Buffer): Promise<void>;
    read(key: string): Promise<Buffer>;
    stat(key: string): Promise<{ size: number } | undefined>;
    remove(key: string): Promise<void>;
};

export const createUploadsStorage = (baseDir: string): UploadsStorage => {
    const pathFor = (key: string) => join(baseDir, key);
    return {
        keyFor(ext) {
            const now = new Date();
            const yyyy = String(now.getUTCFullYear());
            const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
            return `${yyyy}/${mm}/${randomUUID()}.${ext}`;
        },
        async write(key, data) {
            const full = pathFor(key);
            await mkdir(dirname(full), { recursive: true });
            await writeFile(full, data);
        },
        read: (key) => readFile(pathFor(key)),
        async stat(key) {
            try {
                const s = await stat(pathFor(key));
                return { size: s.size };
            } catch {
                return undefined;
            }
        },
        async remove(key) {
            await rm(pathFor(key), { force: true });
        },
    };
};
```

- [ ] **Step 4: Run test, verify it passes**

Run: `npm test --workspace @tattoo-studio/api -- uploads-storage`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/plugins/uploads-storage.ts apps/api/src/plugins/uploads-storage.test.ts
git commit -m "feat(api): privater Uploads-Dateispeicher"
```

---

### Task 10: Dependencies `@fastify/multipart` und `sharp`

**Files:**
- Modify: `apps/api/package.json`, `package-lock.json`

- [ ] **Step 1: Installieren**

Run: `npm install --workspace @tattoo-studio/api @fastify/multipart@^9 sharp@^0.34`

- [ ] **Step 2: Verifizieren**

Run: `node -e "console.log(require('@fastify/multipart/package.json').version, require('sharp').format.jpeg.output.buffer)"`
Expected: eine Versionsnummer und `true`. Bei `sharp`-Installationsfehler: als Blocker behandeln, im Report melden.

- [ ] **Step 3: Commit**

```bash
git add apps/api/package.json package-lock.json
git commit -m "chore(api): @fastify/multipart und sharp"
```

---

### Task 11: Service — Upload-Verarbeitung

**Files:**
- Create: `apps/api/src/services/upload-service.ts`
- Test: `apps/api/src/services/upload-service.test.ts`

**Interfaces:**
- Consumes: `UploadsStorage` (Task 9), `insertMediaAsset` (Task 7), `sharp`
- Produces:
  - `class UploadRejected extends Error` mit `.code: 'UPLOAD_TOO_LARGE' | 'UPLOAD_TYPE_NOT_ALLOWED'`
  - `heifSupported(): boolean` — ob `sharp` HEIC/HEIF dekodieren kann
  - `storeUpload(deps: { db: Kysely<Database>; storage: UploadsStorage; maxBytes: number }, input: { clientToken: string; filename: string | null; declaredMime: string; data: Buffer }): Promise<{ id: string; storageKey: string; contentType: string; width: number | null; height: number | null; byteSize: number }>`
    - `data.length > maxBytes` → `UploadRejected('UPLOAD_TOO_LARGE')`
    - `declaredMime` nicht in `image/jpeg|png|webp|heic|heif` → `UPLOAD_TYPE_NOT_ALLOWED`
    - HEIC/HEIF + `!heifSupported()` → `UPLOAD_TYPE_NOT_ALLOWED`
    - sonst: `sharp(data).rotate()` → bei HEIC/HEIF `.jpeg({ quality: 82 })`, sonst Format beibehalten, Metadaten strippen; `metadata()` für `width`/`height`; Datei über `storage.write(storage.keyFor(ext), out)`; `insertMediaAsset(db, …)`; Rückgabe.

- [ ] **Step 1: Failing test**

```ts
// apps/api/src/services/upload-service.test.ts
import sharp from 'sharp';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '../testing/db.js';
import { createUploadsStorage } from '../plugins/uploads-storage.js';
import { storeUpload, UploadRejected } from './upload-service.js';

let ctx: TestDb;
let storage = createUploadsStorage(mkdtempSync(join(tmpdir(), 'up-svc-')));
beforeAll(async () => { ctx = await createTestDb(); });
afterEach(async () => { await ctx.db.deleteFrom('media_asset').execute(); });
afterAll(async () => { await ctx.destroy(); });

const png = async () => sharp({ create: { width: 20, height: 12, channels: 3, background: '#345' } }).png().toBuffer();
const deps = () => ({ db: ctx.db, storage, maxBytes: 10_000 });

it('stores a png and records dimensions', async () => {
    const out = await storeUpload(deps(), { clientToken: 'tok', filename: 'a.png', declaredMime: 'image/png', data: await png() });
    expect(out.contentType).toBe('image/png');
    expect(out).toMatchObject({ width: 20, height: 12 });
    const row = await ctx.db.selectFrom('media_asset').selectAll().where('id', '=', out.id).executeTakeFirstOrThrow();
    expect(row.client_token).toBe('tok');
    expect((await storage.stat(row.storage_key))?.size).toBe(out.byteSize);
});

it('rejects an oversize file', async () => {
    await expect(
        storeUpload({ ...deps(), maxBytes: 10 }, { clientToken: 't', filename: null, declaredMime: 'image/png', data: await png() }),
    ).rejects.toMatchObject({ code: 'UPLOAD_TOO_LARGE' });
});

it('rejects a disallowed type', async () => {
    await expect(
        storeUpload(deps(), { clientToken: 't', filename: 'a.txt', declaredMime: 'text/plain', data: Buffer.from('x') }),
    ).rejects.toBeInstanceOf(UploadRejected);
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npm test --workspace @tattoo-studio/api -- upload-service`
Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
// apps/api/src/services/upload-service.ts
import sharp from 'sharp';
import type { Kysely } from 'kysely';
import type { Database } from '../database/types.js';
import type { UploadsStorage } from '../plugins/uploads-storage.js';
import { insertMediaAsset } from '../repositories/media.js';

const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']);
const HEIF = new Set(['image/heic', 'image/heif']);

export class UploadRejected extends Error {
    constructor(readonly code: 'UPLOAD_TOO_LARGE' | 'UPLOAD_TYPE_NOT_ALLOWED', message: string) {
        super(message);
        this.name = 'UploadRejected';
    }
}

export const heifSupported = (): boolean => Boolean(sharp.format.heif?.input?.buffer);

const extFor = (contentType: string): string =>
    contentType === 'image/jpeg' ? 'jpg' : contentType === 'image/png' ? 'png' : 'webp';

export const storeUpload = async (
    deps: { db: Kysely<Database>; storage: UploadsStorage; maxBytes: number },
    input: { clientToken: string; filename: string | null; declaredMime: string; data: Buffer },
): Promise<{
    id: string;
    storageKey: string;
    contentType: string;
    width: number | null;
    height: number | null;
    byteSize: number;
}> => {
    if (input.data.length > deps.maxBytes) {
        throw new UploadRejected('UPLOAD_TOO_LARGE', 'Bild überschreitet die zulässige Größe.');
    }
    if (!ALLOWED.has(input.declaredMime)) {
        throw new UploadRejected('UPLOAD_TYPE_NOT_ALLOWED', 'Dateityp nicht erlaubt.');
    }
    const isHeif = HEIF.has(input.declaredMime);
    if (isHeif && !heifSupported()) {
        throw new UploadRejected('UPLOAD_TYPE_NOT_ALLOWED', 'HEIC wird nicht unterstützt — bitte als JPEG hochladen.');
    }

    const pipeline = sharp(input.data).rotate();
    const contentType = isHeif ? 'image/jpeg' : input.declaredMime;
    const out = isHeif ? await pipeline.jpeg({ quality: 82 }).toBuffer() : await pipeline.toBuffer();
    const meta = await sharp(out).metadata();

    const storageKey = deps.storage.keyFor(extFor(contentType));
    await deps.storage.write(storageKey, out);

    const row = await insertMediaAsset(deps.db, {
        purpose: 'inquiry_reference',
        storageKey,
        contentType,
        originalFilename: input.filename,
        byteSize: out.length,
        width: meta.width ?? null,
        height: meta.height ?? null,
        clientToken: input.clientToken,
    });

    return { id: row.id, storageKey, contentType, width: meta.width ?? null, height: meta.height ?? null, byteSize: out.length };
};
```

- [ ] **Step 4: Run test, verify it passes**

Run: `npm test --workspace @tattoo-studio/api -- upload-service`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/upload-service.ts apps/api/src/services/upload-service.test.ts
git commit -m "feat(api): Upload-Verarbeitung mit Typ-/Größenprüfung und HEIC-Konvertierung"
```

---

### Task 12: Routen — `GET /v1/service-types` und Uploads

**Files:**
- Create: `apps/api/src/routes/service-types.ts`, `apps/api/src/routes/uploads.ts`
- Modify: `apps/api/src/app.ts`
- Test: `apps/api/src/routes/uploads.test.ts`

**Interfaces:**
- Consumes: `storeUpload`/`UploadRejected` (Task 11), `getMediaAssetById` (Task 7), `createUploadsStorage` (Task 9), `getActiveResources`/`reference.ts`-Muster für Service-Typen (direkt aus `service_type`), `AppConfig`, `slotHoldRateLimit`-Muster aus `plugins/rate-limit.ts`
- Produces:
  - `serviceTypeRoutes(app, opts: { db })` — `GET /v1/service-types` → `{ items: serviceTypeSchema[] }` (Mapping `duration_minutes`→`durationMinutes` etc., `active = true`)
  - `uploadRoutes(app, opts: { db; config; storage })` — `POST /v1/uploads` (multipart, `X-Client-Token`, Rate-Limit `config.uploadRateLimitMax`), `GET /v1/uploads/:id` (Bearer)
  - `app.ts`: `@fastify/multipart` registrieren (`limits: { fileSize: config.maxUploadBytes, files: 1 }`), dann `serviceTypeRoutes` + `uploadRoutes`

- [ ] **Step 1: Failing test**

```ts
// apps/api/src/routes/uploads.test.ts
import sharp from 'sharp';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '../testing/db.js';
import { buildApp } from '../app.js';
import type { AppConfig } from '../config.js';

const config: AppConfig = {
    gridMinutes: 60, minLeadHours: 12, holdTtlHours: 48, maxAvailabilityDays: 31, adminApiToken: 'secret',
    workerIntervalSeconds: 60, rateLimitMax: 1000, uploadsDir: mkdtempSync(join(tmpdir(), 'up-route-')),
    maxUploadBytes: 4000, orphanUploadTtlHours: 24, uploadRateLimitMax: 1000, inquiryRateLimitMax: 1000,
};

let ctx: TestDb;
let app: ReturnType<typeof buildApp>;
beforeAll(async () => { ctx = await createTestDb(); app = buildApp({ db: ctx.db, config }); await app.ready(); });
afterAll(async () => { await app.close(); await ctx.destroy(); });

const pngBuf = () => sharp({ create: { width: 16, height: 16, channels: 3, background: '#abc' } }).png().toBuffer();

const multipart = (buf: Buffer, filename: string, type: string) => {
    const b = '----t';
    const head = `--${b}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${type}\r\n\r\n`;
    const tail = `\r\n--${b}--\r\n`;
    return {
        payload: Buffer.concat([Buffer.from(head), buf, Buffer.from(tail)]),
        headers: { 'content-type': `multipart/form-data; boundary=${b}` },
    };
};

it('rejects an upload without a client token', async () => {
    const { payload, headers } = multipart(await pngBuf(), 'a.png', 'image/png');
    const res = await app.inject({ method: 'POST', url: '/v1/uploads', payload, headers });
    expect(res.statusCode).toBe(400);
});

it('stores an image and serves it back only with the admin bearer', async () => {
    const { payload, headers } = multipart(await pngBuf(), 'a.png', 'image/png');
    const up = await app.inject({
        method: 'POST', url: '/v1/uploads',
        payload, headers: { ...headers, 'x-client-token': randomUUID() },
    });
    expect(up.statusCode).toBe(201);
    const { uploadId, url } = up.json();
    expect(url).toBe(`/v1/uploads/${uploadId}`);

    const noAuth = await app.inject({ method: 'GET', url });
    expect(noAuth.statusCode).toBe(404);

    const withAuth = await app.inject({ method: 'GET', url, headers: { authorization: 'Bearer secret' } });
    expect(withAuth.statusCode).toBe(200);
    expect(withAuth.headers['content-type']).toContain('image/png');
});

it('rejects a disallowed type and an oversize file', async () => {
    const bad = multipart(Buffer.from('hello'), 'a.txt', 'text/plain');
    const r1 = await app.inject({ method: 'POST', url: '/v1/uploads', payload: bad.payload, headers: { ...bad.headers, 'x-client-token': randomUUID() } });
    expect(r1.statusCode).toBe(400);
    expect(r1.json().code).toBe('UPLOAD_TYPE_NOT_ALLOWED');

    const bigPng = await sharp({ create: { width: 400, height: 400, channels: 3, background: '#fff' } }).png().toBuffer();
    const big = multipart(bigPng, 'big.png', 'image/png');
    const r2 = await app.inject({ method: 'POST', url: '/v1/uploads', payload: big.payload, headers: { ...big.headers, 'x-client-token': randomUUID() } });
    expect(r2.statusCode).toBe(400);
});

it('lists the seeded service types', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/service-types' });
    expect(res.statusCode).toBe(200);
    expect(res.json().items.map((i: { id: string }) => i.id).sort()).toEqual(['consultation', 'day-session', 'small-tattoo']);
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npm test --workspace @tattoo-studio/api -- routes/uploads`
Expected: FAIL.

- [ ] **Step 3: `service-types.ts` schreiben**

```ts
// apps/api/src/routes/service-types.ts
import type { FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import type { Database } from '../database/types.js';

export const serviceTypeRoutes = async (app: FastifyInstance, opts: { db: Kysely<Database> }) => {
    app.get('/v1/service-types', async () => {
        const rows = await opts.db
            .selectFrom('service_type')
            .selectAll()
            .where('active', '=', true)
            .orderBy('name', 'asc')
            .execute();
        return {
            items: rows.map((r) => ({
                id: r.id,
                name: r.name,
                description: r.description,
                durationMinutes: r.duration_minutes,
                preBufferMinutes: r.pre_buffer_minutes,
                postBufferMinutes: r.post_buffer_minutes,
                bookingMode: r.booking_mode,
                depositTier: r.deposit_tier,
                depositCents: r.deposit_cents,
            })),
        };
    });
};
```

- [ ] **Step 4: `uploads.ts` schreiben**

```ts
// apps/api/src/routes/uploads.ts
import type { FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import type { AppConfig } from '../config.js';
import type { Database } from '../database/types.js';
import type { UploadsStorage } from '../plugins/uploads-storage.js';
import { getMediaAssetById } from '../repositories/media.js';
import { storeUpload, UploadRejected } from '../services/upload-service.js';

export const uploadRoutes = async (
    app: FastifyInstance,
    opts: { db: Kysely<Database>; config: AppConfig; storage: UploadsStorage },
) => {
    app.post(
        '/v1/uploads',
        {
            config: {
                rateLimit: {
                    max: opts.config.uploadRateLimitMax,
                    timeWindow: '1 minute',
                    keyGenerator: (req) =>
                        typeof req.headers['x-client-token'] === 'string'
                            ? req.headers['x-client-token']
                            : req.ip,
                    errorResponseBuilder: (_req, ctx: { statusCode?: number }) => {
                        const e = new Error('Zu viele Uploads.') as Error & { statusCode: number; code: string };
                        e.statusCode = ctx.statusCode ?? 429;
                        e.code = 'RATE_LIMITED';
                        return e;
                    },
                },
            },
        },
        async (request, reply) => {
            const clientToken = request.headers['x-client-token'];
            if (typeof clientToken !== 'string') {
                return reply
                    .status(400)
                    .send({ code: 'VALIDATION_ERROR', message: 'X-Client-Token ist erforderlich.' });
            }
            const part = await request.file();
            if (!part) {
                return reply.status(400).send({ code: 'VALIDATION_ERROR', message: 'Keine Datei übermittelt.' });
            }
            let data: Buffer;
            try {
                data = await part.toBuffer();
            } catch {
                return reply
                    .status(400)
                    .send({ code: 'UPLOAD_TOO_LARGE', message: 'Bild überschreitet die zulässige Größe.' });
            }
            try {
                const r = await storeUpload(
                    { db: opts.db, storage: opts.storage, maxBytes: opts.config.maxUploadBytes },
                    { clientToken, filename: part.filename ?? null, declaredMime: part.mimetype, data },
                );
                return reply.status(201).send({
                    uploadId: r.id,
                    url: `/v1/uploads/${r.id}`,
                    contentType: r.contentType,
                    width: r.width,
                    height: r.height,
                    byteSize: r.byteSize,
                });
            } catch (e) {
                if (e instanceof UploadRejected) {
                    return reply.status(400).send({ code: e.code, message: e.message });
                }
                throw e;
            }
        },
    );

    app.get<{ Params: { id: string } }>('/v1/uploads/:id', async (request, reply) => {
        const header = request.headers.authorization;
        if (header !== `Bearer ${opts.config.adminApiToken}`) {
            return reply.status(404).send({ code: 'UPLOAD_NOT_FOUND', message: 'Nicht gefunden.' });
        }
        const asset = await getMediaAssetById(opts.db, request.params.id);
        if (!asset) {
            return reply.status(404).send({ code: 'UPLOAD_NOT_FOUND', message: 'Nicht gefunden.' });
        }
        const data = await opts.storage.read(asset.storage_key);
        return reply
            .header('Content-Type', asset.content_type)
            .header('Cache-Control', 'private, max-age=300')
            .send(data);
    });
};
```

- [ ] **Step 5: `app.ts` verdrahten** — in `buildApp`, im `if (options.db && options.config)`-Block, **vor** den `slotHoldRoutes`:

```ts
import multipart from '@fastify/multipart';
import { createUploadsStorage } from './plugins/uploads-storage.js';
import { serviceTypeRoutes } from './routes/service-types.js';
import { uploadRoutes } from './routes/uploads.js';
// …
        app.register(multipart, { limits: { fileSize: options.config.maxUploadBytes, files: 1 } });
        const storage = createUploadsStorage(options.config.uploadsDir);
        app.register(serviceTypeRoutes, { db: options.db });
        app.register(uploadRoutes, { db: options.db, config: options.config, storage });
```

> `@fastify/multipart` ist `fastify-plugin`-gewrappt und global; die Reihenfolge zu `registerRateLimit` ist egal, solange beide vor `uploadRoutes` registriert sind.

- [ ] **Step 6: Run test, verify it passes**

Run: `npm test --workspace @tattoo-studio/api -- routes/uploads`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/routes/service-types.ts apps/api/src/routes/uploads.ts apps/api/src/app.ts
git commit -m "feat(api): GET /v1/service-types, POST/GET /v1/uploads"
```

---

### Task 13: Service + Route — `POST /v1/inquiries`

**Files:**
- Create: `apps/api/src/services/inquiry-service.ts`, `apps/api/src/routes/inquiries.ts`
- Modify: `apps/api/src/app.ts`
- Test: `apps/api/src/routes/inquiries.test.ts`

**Interfaces:**
- Consumes: `upsertCustomer` (Task 6), `insertInquiry`/`insertInquiryRegions` (Task 8), `linkMediaAssets` (Task 7), `hashRequestBody`/`findIdempotencyRecord`/`saveIdempotencyRecord` (`repositories/idempotency.ts`), `enqueueOutbox` (`repositories/outbox.ts`), `recordAudit` (`repositories/audit.ts`), `getServiceType`/`getActiveArtistsForService` (`repositories/reference.ts`), `createInquirySchema`/`inquiryResponseSchema` (Contract)
- Produces:
  - `class ServiceTypeNotFoundError extends Error` (bereits in `availability-service.ts` vorhanden — dort re-exportieren oder eigene; hier eigene `InquiryServiceTypeNotFound` / `InquiryArtistNotFound` um Kopplung zu vermeiden)
  - `createInquiry(db: Kysely<Database>, input: { idempotencyKey: string; clientToken: string; body: CreateInquiry }): Promise<{ statusCode: number; payload: unknown }>`
  - `inquiryRoutes(app, opts: { db; config })` — `POST /v1/inquiries`

- [ ] **Step 1: Failing test**

```ts
// apps/api/src/routes/inquiries.test.ts
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '../testing/db.js';
import { buildApp } from '../app.js';
import type { AppConfig } from '../config.js';

const config: AppConfig = {
    gridMinutes: 60, minLeadHours: 12, holdTtlHours: 48, maxAvailabilityDays: 31, adminApiToken: 'secret',
    workerIntervalSeconds: 60, rateLimitMax: 1000, uploadsDir: mkdtempSync(join(tmpdir(), 'inq-')),
    maxUploadBytes: 200000, orphanUploadTtlHours: 24, uploadRateLimitMax: 1000, inquiryRateLimitMax: 1000,
};

let ctx: TestDb;
let app: ReturnType<typeof buildApp>;
beforeAll(async () => { ctx = await createTestDb(); app = buildApp({ db: ctx.db, config }); await app.ready(); });
afterEach(async () => {
    await ctx.db.deleteFrom('media_asset').execute();
    await ctx.db.deleteFrom('inquiry').execute();
    await ctx.db.deleteFrom('customer').execute();
    await ctx.db.deleteFrom('idempotency_key').execute();
    await ctx.db.deleteFrom('outbox_event').execute();
    await ctx.db.deleteFrom('audit_event').execute();
});
afterAll(async () => { await app.close(); await ctx.destroy(); });

const uploadOne = async (tok: string) => {
    const buf = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#123' } }).png().toBuffer();
    const b = '--x';
    const payload = Buffer.concat([
        Buffer.from(`--${b}\r\nContent-Disposition: form-data; name="file"; filename="a.png"\r\nContent-Type: image/png\r\n\r\n`),
        buf, Buffer.from(`\r\n--${b}--\r\n`),
    ]);
    const res = await app.inject({
        method: 'POST', url: '/v1/uploads', payload,
        headers: { 'content-type': `multipart/form-data; boundary=${b}`, 'x-client-token': tok },
    });
    return res.json().uploadId as string;
};

const body = (over = {}) => ({
    serviceTypeId: 'small-tattoo', bodyRegions: ['front.upper_arm.left'], sizeCm: 12,
    description: 'florales Motiv am Unterarm', customer: { firstName: 'Ann', lastName: 'Roe', email: 'a@b.de', phone: '+49 111 222' },
    acceptsTerms: true, ...over,
});

it('creates an inquiry with regions and links the uploaded image', async () => {
    const tok = randomUUID();
    const imgId = await uploadOne(tok);
    const res = await app.inject({
        method: 'POST', url: '/v1/inquiries',
        headers: { 'idempotency-key': randomUUID(), 'x-client-token': tok },
        payload: body({ referenceImageIds: [imgId] }),
    });
    expect(res.statusCode).toBe(201);
    const { inquiryId, status, reference } = res.json();
    expect(status).toBe('NEW');
    expect(reference).toHaveLength(8);
    const regions = await ctx.db.selectFrom('inquiry_region').selectAll().where('inquiry_id', '=', inquiryId).execute();
    expect(regions).toHaveLength(1);
    const img = await ctx.db.selectFrom('media_asset').selectAll().where('id', '=', imgId).executeTakeFirstOrThrow();
    expect(img.inquiry_id).toBe(inquiryId);
    const outbox = await ctx.db.selectFrom('outbox_event').selectAll().where('type', '=', 'inquiry.created').execute();
    expect(outbox).toHaveLength(1);
});

it('replays the same idempotency key', async () => {
    const tok = randomUUID();
    const key = randomUUID();
    const a = await app.inject({ method: 'POST', url: '/v1/inquiries', headers: { 'idempotency-key': key, 'x-client-token': tok }, payload: body() });
    const b = await app.inject({ method: 'POST', url: '/v1/inquiries', headers: { 'idempotency-key': key, 'x-client-token': tok }, payload: body() });
    expect(b.statusCode).toBe(201);
    expect(b.json().inquiryId).toBe(a.json().inquiryId);
    const count = await ctx.db.selectFrom('inquiry').select(ctx.db.fn.countAll().as('n')).executeTakeFirstOrThrow();
    expect(Number(count.n)).toBe(1);
});

it('400s on empty regions and missing headers, 404 on unknown service type', async () => {
    const tok = randomUUID();
    expect((await app.inject({ method: 'POST', url: '/v1/inquiries', headers: { 'idempotency-key': randomUUID(), 'x-client-token': tok }, payload: body({ bodyRegions: [] }) })).statusCode).toBe(400);
    expect((await app.inject({ method: 'POST', url: '/v1/inquiries', payload: body() })).statusCode).toBe(400);
    const r = await app.inject({ method: 'POST', url: '/v1/inquiries', headers: { 'idempotency-key': randomUUID(), 'x-client-token': tok }, payload: body({ serviceTypeId: 'nope' }) });
    expect(r.statusCode).toBe(404);
    expect(r.json().code).toBe('SERVICE_TYPE_NOT_FOUND');
});

it('ignores foreign reference image ids', async () => {
    const mine = randomUUID();
    const other = randomUUID();
    const foreignImg = await uploadOne(other);
    const res = await app.inject({
        method: 'POST', url: '/v1/inquiries',
        headers: { 'idempotency-key': randomUUID(), 'x-client-token': mine },
        payload: body({ referenceImageIds: [foreignImg] }),
    });
    expect(res.statusCode).toBe(201);
    const img = await ctx.db.selectFrom('media_asset').selectAll().where('id', '=', foreignImg).executeTakeFirstOrThrow();
    expect(img.inquiry_id).toBeNull();
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npm test --workspace @tattoo-studio/api -- routes/inquiries`
Expected: FAIL.

- [ ] **Step 3: `inquiry-service.ts` schreiben**

```ts
// apps/api/src/services/inquiry-service.ts
import type { Kysely } from 'kysely';
import type { CreateInquiry } from '@tattoo-studio/contracts';
import type { Database } from '../database/types.js';
import { upsertCustomer } from '../repositories/customer.js';
import { insertInquiry, insertInquiryRegions } from '../repositories/inquiries.js';
import { linkMediaAssets } from '../repositories/media.js';
import { getActiveArtistsForService, getServiceType } from '../repositories/reference.js';
import {
    findIdempotencyRecord,
    hashRequestBody,
    saveIdempotencyRecord,
} from '../repositories/idempotency.js';
import { enqueueOutbox } from '../repositories/outbox.js';
import { recordAudit } from '../repositories/audit.js';

export class InquiryServiceTypeNotFound extends Error {}
export class InquiryArtistNotFound extends Error {}

export const createInquiry = async (
    db: Kysely<Database>,
    input: { idempotencyKey: string; clientToken: string; body: CreateInquiry },
): Promise<{ statusCode: number; payload: unknown }> => {
    const requestHash = hashRequestBody(input.body);
    return db.transaction().execute(async (trx) => {
        const replay = await findIdempotencyRecord(trx, input.idempotencyKey);
        if (replay) {
            if (replay.requestHash !== requestHash) {
                return {
                    statusCode: 409,
                    payload: {
                        code: 'IDEMPOTENCY_KEY_REUSED',
                        message: 'Idempotency-Key bereits mit anderem Inhalt verwendet.',
                    },
                };
            }
            return { statusCode: replay.statusCode, payload: replay.responseJson };
        }

        const st = await getServiceType(trx, input.body.serviceTypeId);
        if (!st) throw new InquiryServiceTypeNotFound(input.body.serviceTypeId);

        const preferredArtistId =
            input.body.preferredArtistId === 'any' ? null : input.body.preferredArtistId;
        if (preferredArtistId) {
            const artists = await getActiveArtistsForService(trx, st.id);
            if (!artists.some((a) => a.id === preferredArtistId)) {
                throw new InquiryArtistNotFound(preferredArtistId);
            }
        }

        const customerId = await upsertCustomer(trx, {
            chaynsPersonId: input.body.chaynsPersonId,
            ...input.body.customer,
        });

        const inquiry = await insertInquiry(trx, {
            serviceTypeId: st.id,
            preferredArtistId,
            preferredStartsAt: input.body.preferredStartsAt ?? null,
            sizeCm: input.body.sizeCm ?? null,
            description: input.body.description,
            customerId,
            clientToken: input.clientToken,
            acceptedTermsAt: new Date().toISOString(),
        });

        await insertInquiryRegions(trx, inquiry.id, input.body.bodyRegions);
        if (input.body.referenceImageIds.length > 0) {
            await linkMediaAssets(trx, {
                ids: input.body.referenceImageIds,
                inquiryId: inquiry.id,
                clientToken: input.clientToken,
            });
        }

        const payload = {
            inquiryId: inquiry.id,
            status: 'NEW' as const,
            reference: inquiry.id.slice(0, 8),
            createdAt: new Date(inquiry.created_at).toISOString(),
        };
        const actor = input.body.chaynsPersonId
            ? `chayns:${input.body.chaynsPersonId}`
            : `anon:${input.clientToken.slice(0, 8)}`;
        await recordAudit(trx, {
            actor,
            action: 'inquiry.created',
            entityType: 'inquiry',
            entityId: inquiry.id,
            after: payload,
        });
        await enqueueOutbox(trx, { type: 'inquiry.created', payload: { inquiryId: inquiry.id } });
        await saveIdempotencyRecord(trx, {
            key: input.idempotencyKey,
            route: 'POST /v1/inquiries',
            requestHash,
            responseJson: payload,
            statusCode: 201,
            ttlHours: 24,
        });

        return { statusCode: 201, payload };
    });
};
```

- [ ] **Step 4: `inquiries.ts` (Route) schreiben**

```ts
// apps/api/src/routes/inquiries.ts
import type { FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import { createInquirySchema } from '@tattoo-studio/contracts';
import type { AppConfig } from '../config.js';
import type { Database } from '../database/types.js';
import {
    createInquiry,
    InquiryArtistNotFound,
    InquiryServiceTypeNotFound,
} from '../services/inquiry-service.js';

export const inquiryRoutes = async (
    app: FastifyInstance,
    opts: { db: Kysely<Database>; config: AppConfig },
) => {
    app.post(
        '/v1/inquiries',
        {
            config: {
                rateLimit: {
                    max: opts.config.inquiryRateLimitMax,
                    timeWindow: '1 minute',
                    keyGenerator: (req) =>
                        typeof req.headers['x-client-token'] === 'string'
                            ? req.headers['x-client-token']
                            : req.ip,
                    errorResponseBuilder: (_req, ctx: { statusCode?: number }) => {
                        const e = new Error('Zu viele Anfragen.') as Error & {
                            statusCode: number;
                            code: string;
                        };
                        e.statusCode = ctx.statusCode ?? 429;
                        e.code = 'RATE_LIMITED';
                        return e;
                    },
                },
            },
        },
        async (request, reply) => {
            const idempotencyKey = request.headers['idempotency-key'];
            const clientToken = request.headers['x-client-token'];
            if (typeof idempotencyKey !== 'string' || typeof clientToken !== 'string') {
                return reply.status(400).send({
                    code: 'VALIDATION_ERROR',
                    message: 'Idempotency-Key und X-Client-Token sind erforderlich.',
                });
            }
            const parsed = createInquirySchema.safeParse(request.body);
            if (!parsed.success) {
                return reply.status(400).send({
                    code: 'VALIDATION_ERROR',
                    message: 'Ungültige Anfrage.',
                    issues: parsed.error.issues.map((i) => ({
                        path: i.path.join('.'),
                        message: i.message,
                    })),
                });
            }
            try {
                const { statusCode, payload } = await createInquiry(opts.db, {
                    idempotencyKey,
                    clientToken,
                    body: parsed.data,
                });
                return reply.status(statusCode).send(payload);
            } catch (e) {
                if (e instanceof InquiryServiceTypeNotFound) {
                    return reply
                        .status(404)
                        .send({ code: 'SERVICE_TYPE_NOT_FOUND', message: 'Terminart nicht gefunden.' });
                }
                if (e instanceof InquiryArtistNotFound) {
                    return reply
                        .status(404)
                        .send({ code: 'ARTIST_NOT_FOUND', message: 'Artist nicht gefunden.' });
                }
                throw e;
            }
        },
    );
};
```

- [ ] **Step 5: `app.ts` verdrahten** — nach `uploadRoutes`:

```ts
import { inquiryRoutes } from './routes/inquiries.js';
// …
        app.register(inquiryRoutes, { db: options.db, config: options.config });
```

- [ ] **Step 6: Run test, verify it passes**

Run: `npm test --workspace @tattoo-studio/api -- routes/inquiries`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/services/inquiry-service.ts apps/api/src/routes/inquiries.ts apps/api/src/app.ts
git commit -m "feat(api): POST /v1/inquiries mit Idempotency, Regionen und Bild-Verknüpfung"
```

---

### Task 14: Service — Studio-Anfrage-Aktionen

**Files:**
- Create: `apps/api/src/services/admin-inquiry-service.ts`
- Test: `apps/api/src/services/admin-inquiry-service.test.ts`

**Interfaces:**
- Consumes: `listInquiries`/`getInquiryById`/`transitionInquiry` (Task 8), `assertInquiryTransition`/`InquiryInvalidStateError` (Task 5), `recordAudit`/`enqueueOutbox`
- Produces:
  - `class InquiryNotFoundError extends Error`
  - `listInquiriesForStudio(db, q: { status?: string; limit: number }): Promise<InquiryListItem[]>`
  - `getInquiryDetail(db, id: string): Promise<InquiryDetail>` — bumpt `NEW → IN_REVIEW` (eigene Transaktion + Audit `actor: 'system'`, kein Outbox), dann Detail-Mapping; `InquiryNotFoundError` wenn unbekannt
  - `acceptInquiry(db, id, patch: { studioNote?: string }): Promise<void>`
  - `needsInfoInquiry(db, id, message: string): Promise<void>`
  - `declineInquiry(db, id, reason: string): Promise<void>`
  - alle drei Aktionen: `getInquiryById` → `InquiryNotFoundError` / `assertInquiryTransition` → `transitionInquiry` + `recordAudit(actor: 'studio')` + `enqueueOutbox` in **einer** Transaktion

- [ ] **Step 1: Failing test**

```ts
// apps/api/src/services/admin-inquiry-service.test.ts
import { afterAll, afterEach, beforeAll, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '../testing/db.js';
import { InquiryInvalidStateError } from '../domain/inquiry-status.js';
import {
    acceptInquiry, declineInquiry, getInquiryDetail, InquiryNotFoundError,
    listInquiriesForStudio, needsInfoInquiry,
} from './admin-inquiry-service.js';
import { insertInquiry, insertInquiryRegions } from '../repositories/inquiries.js';

let ctx: TestDb;
beforeAll(async () => { ctx = await createTestDb(); });
afterEach(async () => {
    await ctx.db.deleteFrom('inquiry').execute();
    await ctx.db.deleteFrom('customer').execute();
    await ctx.db.deleteFrom('outbox_event').execute();
    await ctx.db.deleteFrom('audit_event').execute();
});
afterAll(async () => { await ctx.destroy(); });

const seed = async () => {
    const cid = (await ctx.db.insertInto('customer').values({ first_name: 'Ann', last_name: 'Roe', email: 'a@b.de', phone: '1' }).returning('id').executeTakeFirstOrThrow()).id;
    const inq = await insertInquiry(ctx.db, {
        serviceTypeId: 'small-tattoo', preferredArtistId: null, preferredStartsAt: null, sizeCm: 10,
        description: 'x', customerId: cid, clientToken: 'tok', acceptedTermsAt: '2026-08-29T10:00:00Z',
    });
    await insertInquiryRegions(ctx.db, inq.id, ['front.chest']);
    return inq.id;
};

it('detail bumps NEW to IN_REVIEW', async () => {
    const id = await seed();
    const d = await getInquiryDetail(ctx.db, id);
    expect(d.status).toBe('IN_REVIEW');
    expect(d.bodyRegions).toEqual(['front.chest']);
    const audit = await ctx.db.selectFrom('audit_event').selectAll().where('action', '=', 'inquiry.reviewed').execute();
    expect(audit).toHaveLength(1);
});

it('accepts from IN_REVIEW and writes an outbox event', async () => {
    const id = await seed();
    await getInquiryDetail(ctx.db, id);
    await acceptInquiry(ctx.db, id, { studioNote: 'passt' });
    const row = await ctx.db.selectFrom('inquiry').selectAll().where('id', '=', id).executeTakeFirstOrThrow();
    expect(row.status).toBe('ACCEPTED');
    expect(row.studio_note).toBe('passt');
    expect(await ctx.db.selectFrom('outbox_event').selectAll().where('type', '=', 'inquiry.accepted').execute()).toHaveLength(1);
});

it('declines from NEW and needs-info from IN_REVIEW; rejects a bad transition', async () => {
    const id = await seed();
    await declineInquiry(ctx.db, id, 'Motiv passt nicht');
    const row = await ctx.db.selectFrom('inquiry').selectAll().where('id', '=', id).executeTakeFirstOrThrow();
    expect(row.status).toBe('DECLINED');
    await expect(acceptInquiry(ctx.db, id, {})).rejects.toBeInstanceOf(InquiryInvalidStateError);

    const id2 = await seed();
    await getInquiryDetail(ctx.db, id2);
    await needsInfoInquiry(ctx.db, id2, 'Bitte Referenzfoto nachreichen');
    expect((await ctx.db.selectFrom('inquiry').selectAll().where('id', '=', id2).executeTakeFirstOrThrow()).needs_info_message).toBe('Bitte Referenzfoto nachreichen');
});

it('throws for an unknown id', async () => {
    await expect(getInquiryDetail(ctx.db, '00000000-0000-0000-0000-000000000000')).rejects.toBeInstanceOf(InquiryNotFoundError);
});

it('lists items with counts', async () => {
    const id = await seed();
    const items = await listInquiriesForStudio(ctx.db, { limit: 50 });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ id, regionCount: 1, imageCount: 0, serviceTypeName: 'Kleines Tattoo', customerName: 'Ann Roe' });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npm test --workspace @tattoo-studio/api -- admin-inquiry-service`
Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
// apps/api/src/services/admin-inquiry-service.ts
import type { Kysely } from 'kysely';
import type {
    InquiryDetail,
    InquiryListItem,
} from '@tattoo-studio/contracts';
import type { Database, InquiryStatus } from '../database/types.js';
import { assertInquiryTransition } from '../domain/inquiry-status.js';
import { getInquiryById, listInquiries, transitionInquiry } from '../repositories/inquiries.js';
import { recordAudit } from '../repositories/audit.js';
import { enqueueOutbox } from '../repositories/outbox.js';

export class InquiryNotFoundError extends Error {}

export const listInquiriesForStudio = async (
    db: Kysely<Database>,
    q: { status?: string; limit: number },
): Promise<InquiryListItem[]> => {
    const rows = await listInquiries(db, q);
    return rows.map((r) => ({
        id: r.id,
        status: r.status,
        serviceTypeId: r.service_type_id,
        serviceTypeName: r.serviceTypeName,
        preferredArtistId: r.preferred_artist_id,
        preferredStartsAt: r.preferred_starts_at ? new Date(r.preferred_starts_at).toISOString() : null,
        customerName: r.customerName,
        sizeCm: r.size_cm,
        regionCount: r.regionCount,
        imageCount: r.imageCount,
        createdAt: new Date(r.created_at).toISOString(),
    }));
};

export const getInquiryDetail = async (
    db: Kysely<Database>,
    id: string,
): Promise<InquiryDetail> => {
    const existing = await getInquiryById(db, id);
    if (!existing) throw new InquiryNotFoundError(id);

    if (existing.status === 'NEW') {
        await db.transaction().execute(async (trx) => {
            await transitionInquiry(trx, id, 'IN_REVIEW', {});
            await recordAudit(trx, {
                actor: 'system',
                action: 'inquiry.reviewed',
                entityType: 'inquiry',
                entityId: id,
                after: { status: 'IN_REVIEW' },
            });
        });
    }

    const inq = await getInquiryById(db, id);
    if (!inq) throw new InquiryNotFoundError(id);
    const st = await db
        .selectFrom('service_type')
        .select('name')
        .where('id', '=', inq.service_type_id)
        .executeTakeFirst();
    const customer = await db
        .selectFrom('customer')
        .selectAll()
        .where('id', '=', inq.customer_id)
        .executeTakeFirstOrThrow();

    return {
        id: inq.id,
        status: inq.status,
        serviceTypeId: inq.service_type_id,
        serviceTypeName: st?.name ?? inq.service_type_id,
        preferredArtistId: inq.preferred_artist_id,
        preferredStartsAt: inq.preferred_starts_at ? new Date(inq.preferred_starts_at).toISOString() : null,
        customerName: `${customer.first_name} ${customer.last_name}`,
        sizeCm: inq.size_cm,
        regionCount: inq.regions.length,
        imageCount: inq.images.length,
        createdAt: new Date(inq.created_at).toISOString(),
        description: inq.description,
        bodyRegions: inq.regions as InquiryDetail['bodyRegions'],
        customer: {
            firstName: customer.first_name,
            lastName: customer.last_name,
            email: customer.email,
            phone: customer.phone,
        },
        chaynsPersonId: customer.chayns_person_id,
        images: inq.images.map((m) => ({
            id: m.id,
            url: `/v1/uploads/${m.id}`,
            width: m.width,
            height: m.height,
        })),
        studioNote: inq.studio_note,
        needsInfoMessage: inq.needs_info_message,
        declineReason: inq.decline_reason,
        acceptedTermsAt: new Date(inq.accepted_terms_at).toISOString(),
    };
};

const act = async (
    db: Kysely<Database>,
    id: string,
    to: InquiryStatus,
    action: string,
    outboxType: string,
    patch: { studioNote?: string; needsInfoMessage?: string; declineReason?: string },
) => {
    await db.transaction().execute(async (trx) => {
        const inq = await getInquiryById(trx, id);
        if (!inq) throw new InquiryNotFoundError(id);
        assertInquiryTransition(inq.status, to);
        await transitionInquiry(trx, id, to, patch);
        await recordAudit(trx, {
            actor: 'studio',
            action,
            entityType: 'inquiry',
            entityId: id,
            before: { status: inq.status },
            after: { status: to, ...patch },
        });
        await enqueueOutbox(trx, { type: outboxType, payload: { inquiryId: id } });
    });
};

export const acceptInquiry = (db: Kysely<Database>, id: string, patch: { studioNote?: string }) =>
    act(db, id, 'ACCEPTED', 'inquiry.accepted', 'inquiry.accepted', { studioNote: patch.studioNote });

export const needsInfoInquiry = (db: Kysely<Database>, id: string, message: string) =>
    act(db, id, 'NEEDS_INFO', 'inquiry.needs_info', 'inquiry.needs_info', { needsInfoMessage: message });

export const declineInquiry = (db: Kysely<Database>, id: string, reason: string) =>
    act(db, id, 'DECLINED', 'inquiry.declined', 'inquiry.declined', { declineReason: reason });
```

- [ ] **Step 4: Run test, verify it passes**

Run: `npm test --workspace @tattoo-studio/api -- admin-inquiry-service`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/admin-inquiry-service.ts apps/api/src/services/admin-inquiry-service.test.ts
git commit -m "feat(api): Studio-Service für Anfrage-Liste, -Detail und -Aktionen"
```

---

### Task 15: Routen — `/v1/admin/inquiries…`

**Files:**
- Create: `apps/api/src/routes/admin-inquiries.ts`
- Modify: `apps/api/src/app.ts`
- Test: `apps/api/src/routes/admin-inquiries.test.ts`

**Interfaces:**
- Consumes: Task 14, `requireAdmin` (`plugins/admin-auth.ts`), `InquiryInvalidStateError` (Task 5), Contract-Action-Schemas
- Produces: `adminInquiryRoutes(app, opts: { db; config })` — `addHook('preHandler', requireAdmin(config.adminApiToken))`; Routen `GET /v1/admin/inquiries`, `GET /v1/admin/inquiries/:id`, `POST …/:id/accept|needs-info|decline`. `InquiryNotFoundError` → 404 `INQUIRY_NOT_FOUND`; `InquiryInvalidStateError` → 409 `INVALID_STATE`.

- [ ] **Step 1: Failing test**

```ts
// apps/api/src/routes/admin-inquiries.test.ts
import { randomUUID } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '../testing/db.js';
import { buildApp } from '../app.js';
import type { AppConfig } from '../config.js';
import { insertInquiry, insertInquiryRegions } from '../repositories/inquiries.js';

const config: AppConfig = {
    gridMinutes: 60, minLeadHours: 12, holdTtlHours: 48, maxAvailabilityDays: 31, adminApiToken: 'secret',
    workerIntervalSeconds: 60, rateLimitMax: 1000, uploadsDir: mkdtempSync(join(tmpdir(), 'adm-inq-')),
    maxUploadBytes: 4000, orphanUploadTtlHours: 24, uploadRateLimitMax: 1000, inquiryRateLimitMax: 1000,
};

let ctx: TestDb;
let app: ReturnType<typeof buildApp>;
beforeAll(async () => { ctx = await createTestDb(); app = buildApp({ db: ctx.db, config }); await app.ready(); });
afterEach(async () => {
    await ctx.db.deleteFrom('inquiry').execute();
    await ctx.db.deleteFrom('customer').execute();
    await ctx.db.deleteFrom('outbox_event').execute();
    await ctx.db.deleteFrom('audit_event').execute();
});
afterAll(async () => { await app.close(); await ctx.destroy(); });

const bearer = { authorization: 'Bearer secret' };
const seed = async () => {
    const cid = (await ctx.db.insertInto('customer').values({ first_name: 'Ann', last_name: 'Roe', email: 'a@b.de', phone: '1' }).returning('id').executeTakeFirstOrThrow()).id;
    const inq = await insertInquiry(ctx.db, {
        serviceTypeId: 'small-tattoo', preferredArtistId: null, preferredStartsAt: null, sizeCm: 10,
        description: 'x', customerId: cid, clientToken: 't', acceptedTermsAt: '2026-08-29T10:00:00Z',
    });
    await insertInquiryRegions(ctx.db, inq.id, ['front.chest']);
    return inq.id;
};

it('401s without the admin token', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/admin/inquiries' });
    expect(res.statusCode).toBe(401);
});

it('lists, filters, shows detail and confirms', async () => {
    const id = await seed();
    const list = await app.inject({ method: 'GET', url: '/v1/admin/inquiries?status=NEW', headers: bearer });
    expect(list.statusCode).toBe(200);
    expect(list.json()).toHaveLength(1);

    const detail = await app.inject({ method: 'GET', url: `/v1/admin/inquiries/${id}`, headers: bearer });
    expect(detail.json().status).toBe('IN_REVIEW');
    expect(detail.json().bodyRegions).toEqual(['front.chest']);

    const accept = await app.inject({ method: 'POST', url: `/v1/admin/inquiries/${id}/accept`, headers: bearer, payload: { studioNote: 'ok' } });
    expect(accept.statusCode).toBe(200);

    const again = await app.inject({ method: 'POST', url: `/v1/admin/inquiries/${id}/decline`, headers: bearer, payload: { reason: 'x' } });
    expect(again.statusCode).toBe(409);
    expect(again.json().code).toBe('INVALID_STATE');
});

it('404s on an unknown id and 400s on a bad body', async () => {
    expect((await app.inject({ method: 'GET', url: `/v1/admin/inquiries/${randomUUID()}`, headers: bearer })).statusCode).toBe(404);
    const id = await seed();
    expect((await app.inject({ method: 'POST', url: `/v1/admin/inquiries/${id}/needs-info`, headers: bearer, payload: {} })).statusCode).toBe(400);
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npm test --workspace @tattoo-studio/api -- routes/admin-inquiries`
Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
// apps/api/src/routes/admin-inquiries.ts
import type { FastifyInstance, FastifyReply } from 'fastify';
import type { Kysely } from 'kysely';
import {
    inquiryAcceptRequestSchema,
    inquiryDeclineRequestSchema,
    inquiryNeedsInfoRequestSchema,
} from '@tattoo-studio/contracts';
import type { AppConfig } from '../config.js';
import type { Database } from '../database/types.js';
import { requireAdmin } from '../plugins/admin-auth.js';
import { InquiryInvalidStateError } from '../domain/inquiry-status.js';
import {
    acceptInquiry,
    declineInquiry,
    getInquiryDetail,
    InquiryNotFoundError,
    listInquiriesForStudio,
    needsInfoInquiry,
} from '../services/admin-inquiry-service.js';

export const adminInquiryRoutes = async (
    app: FastifyInstance,
    opts: { db: Kysely<Database>; config: AppConfig },
) => {
    app.addHook('preHandler', requireAdmin(opts.config.adminApiToken));

    const mapError = (reply: FastifyReply, e: unknown) => {
        if (e instanceof InquiryNotFoundError) {
            return reply.status(404).send({ code: 'INQUIRY_NOT_FOUND', message: 'Anfrage nicht gefunden.' });
        }
        if (e instanceof InquiryInvalidStateError) {
            return reply
                .status(409)
                .send({ code: 'INVALID_STATE', message: `Aktion im Status ${e.from} nicht möglich.` });
        }
        throw e;
    };

    app.get<{ Querystring: { status?: string; limit?: string } }>(
        '/v1/admin/inquiries',
        async (request) => {
            const limit = Math.min(Number(request.query.limit ?? 50) || 50, 200);
            return listInquiriesForStudio(opts.db, { status: request.query.status, limit });
        },
    );

    app.get<{ Params: { id: string } }>('/v1/admin/inquiries/:id', async (request, reply) => {
        try {
            return await getInquiryDetail(opts.db, request.params.id);
        } catch (e) {
            return mapError(reply, e);
        }
    });

    app.post<{ Params: { id: string } }>('/v1/admin/inquiries/:id/accept', async (request, reply) => {
        const parsed = inquiryAcceptRequestSchema.safeParse(request.body ?? {});
        if (!parsed.success) {
            return reply.status(400).send({ code: 'VALIDATION_ERROR', message: 'Ungültiger Body.' });
        }
        try {
            await acceptInquiry(opts.db, request.params.id, { studioNote: parsed.data.studioNote });
            return { ok: true };
        } catch (e) {
            return mapError(reply, e);
        }
    });

    app.post<{ Params: { id: string } }>('/v1/admin/inquiries/:id/needs-info', async (request, reply) => {
        const parsed = inquiryNeedsInfoRequestSchema.safeParse(request.body);
        if (!parsed.success) {
            return reply.status(400).send({ code: 'VALIDATION_ERROR', message: 'message ist erforderlich.' });
        }
        try {
            await needsInfoInquiry(opts.db, request.params.id, parsed.data.message);
            return { ok: true };
        } catch (e) {
            return mapError(reply, e);
        }
    });

    app.post<{ Params: { id: string } }>('/v1/admin/inquiries/:id/decline', async (request, reply) => {
        const parsed = inquiryDeclineRequestSchema.safeParse(request.body);
        if (!parsed.success) {
            return reply.status(400).send({ code: 'VALIDATION_ERROR', message: 'reason ist erforderlich.' });
        }
        try {
            await declineInquiry(opts.db, request.params.id, parsed.data.reason);
            return { ok: true };
        } catch (e) {
            return mapError(reply, e);
        }
    });
};
```

- [ ] **Step 4: `app.ts` verdrahten** — nach `adminHoldRoutes`:

```ts
import { adminInquiryRoutes } from './routes/admin-inquiries.js';
// …
        app.register(adminInquiryRoutes, { db: options.db, config: options.config });
```

- [ ] **Step 5: Run test, verify it passes**

Run: `npm test --workspace @tattoo-studio/api -- routes/admin-inquiries`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/admin-inquiries.ts apps/api/src/app.ts
git commit -m "feat(api): Studio-Routen für Anfragen hinter Bearer-Auth"
```

---

### Task 16: Worker — Verwaisten-Uploads-Job

**Files:**
- Create: `apps/api/src/jobs/purge-orphan-uploads.ts`
- Modify: `apps/api/src/worker.ts`
- Test: `apps/api/src/jobs/purge-orphan-uploads.test.ts`

**Interfaces:**
- Consumes: `listOrphanMediaAssets`/`deleteMediaAsset` (Task 7), `UploadsStorage` (Task 9)
- Produces:
  - `runPurgeOrphanUploadsJob(deps: { db: Kysely<Database>; storage: UploadsStorage; ttlHours: number }, now?: Date): Promise<{ purged: number }>` — `listOrphanMediaAssets(db, now - ttlHours)` → je Zeile `storage.remove(storage_key)` + `deleteMediaAsset` → Anzahl
  - `worker.ts`: ruft je Tick zusätzlich `runPurgeOrphanUploadsJob` auf

- [ ] **Step 1: Failing test**

```ts
// apps/api/src/jobs/purge-orphan-uploads.test.ts
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '../testing/db.js';
import { createUploadsStorage } from '../plugins/uploads-storage.js';
import { insertMediaAsset, linkMediaAssets } from '../repositories/media.js';
import { insertInquiry } from '../repositories/inquiries.js';
import { runPurgeOrphanUploadsJob } from './purge-orphan-uploads.js';

let ctx: TestDb;
const storage = createUploadsStorage(mkdtempSync(join(tmpdir(), 'purge-')));
beforeAll(async () => { ctx = await createTestDb(); });
afterEach(async () => {
    await ctx.db.deleteFrom('media_asset').execute();
    await ctx.db.deleteFrom('inquiry').execute();
    await ctx.db.deleteFrom('customer').execute();
});
afterAll(async () => { await ctx.destroy(); });

const writeAsset = async (over = {}) => {
    const key = storage.keyFor('jpg');
    await storage.write(key, Buffer.from('img'));
    return insertMediaAsset(ctx.db, {
        purpose: 'inquiry_reference', storageKey: key, contentType: 'image/jpeg',
        originalFilename: null, byteSize: 3, width: null, height: null, clientToken: 'tok', ...over,
    });
};

it('removes aged orphans (row + file), keeps fresh and linked assets', async () => {
    const old = await writeAsset();
    await ctx.db.updateTable('media_asset').set({ created_at: new Date('2020-01-01T00:00:00Z') }).where('id', '=', old.id).execute();
    const fresh = await writeAsset();

    const cid = (await ctx.db.insertInto('customer').values({ first_name: 'F', last_name: 'L', email: 'e@x.de', phone: '1' }).returning('id').executeTakeFirstOrThrow()).id;
    const inq = await insertInquiry(ctx.db, {
        serviceTypeId: 'small-tattoo', preferredArtistId: null, preferredStartsAt: null, sizeCm: null,
        description: '', customerId: cid, clientToken: 'tok', acceptedTermsAt: '2026-08-29T10:00:00Z',
    });
    const linked = await writeAsset();
    await ctx.db.updateTable('media_asset').set({ created_at: new Date('2020-01-01T00:00:00Z') }).where('id', '=', linked.id).execute();
    await linkMediaAssets(ctx.db, { ids: [linked.id], inquiryId: inq.id, clientToken: 'tok' });

    const { purged } = await runPurgeOrphanUploadsJob({ db: ctx.db, storage, ttlHours: 24 });
    expect(purged).toBe(1);
    expect(await storage.stat(old.storage_key)).toBeUndefined();
    expect(await storage.stat(fresh.storage_key)).toBeDefined();
    expect(await ctx.db.selectFrom('media_asset').select('id').where('id', '=', linked.id).executeTakeFirst()).toBeDefined();
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npm test --workspace @tattoo-studio/api -- purge-orphan-uploads`
Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
// apps/api/src/jobs/purge-orphan-uploads.ts
import type { Kysely } from 'kysely';
import type { Database } from '../database/types.js';
import type { UploadsStorage } from '../plugins/uploads-storage.js';
import { deleteMediaAsset, listOrphanMediaAssets } from '../repositories/media.js';

export const runPurgeOrphanUploadsJob = async (
    deps: { db: Kysely<Database>; storage: UploadsStorage; ttlHours: number },
    now: Date = new Date(),
): Promise<{ purged: number }> => {
    const cutoff = new Date(now.getTime() - deps.ttlHours * 3_600_000);
    const orphans = await listOrphanMediaAssets(deps.db, cutoff);
    for (const asset of orphans) {
        await deps.storage.remove(asset.storage_key);
        await deleteMediaAsset(deps.db, asset.id);
    }
    return { purged: orphans.length };
};
```

- [ ] **Step 4: `worker.ts` erweitern** — Job in den Tick aufnehmen

```ts
import { createUploadsStorage } from './plugins/uploads-storage.js';
import { runPurgeOrphanUploadsJob } from './jobs/purge-orphan-uploads.js';
// … nach `const db = createDatabase(connectionString);`
const storage = createUploadsStorage(config.uploadsDir);
// … innerhalb von `tick`, nach dem expire-holds-Aufruf:
        const purge = await runPurgeOrphanUploadsJob({ db, storage, ttlHours: config.orphanUploadTtlHours });
        if (purge.purged > 0) console.info(`[worker] ${purge.purged} verwaiste Upload(s) entfernt`);
```

- [ ] **Step 5: Run test, verify it passes**

Run: `npm test --workspace @tattoo-studio/api -- purge-orphan-uploads`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/jobs/purge-orphan-uploads.ts apps/api/src/jobs/purge-orphan-uploads.test.ts apps/api/src/worker.ts
git commit -m "feat(api): Worker-Job für verwaiste Uploads"
```

---

### Task 17: Legacy-API entfernen

**Files:**
- Delete: `apps/api/src/catalog.ts`, `apps/api/src/availability.ts`, `apps/api/src/repository.ts`
- Modify: `apps/api/src/app.ts`, `apps/api/src/server.ts`, `apps/api/src/app.test.ts`

**Interfaces:**
- Consumes: nichts Neues.
- Produces: `buildApp` ohne `repository`-Option; `/health` prüft direkt gegen `db` (oder meldet `memory`).

- [ ] **Step 1: `app.test.ts` neu schreiben** — der alte Test prüft `/api/v1/*` + `/health` mit Memory-Repository. Ersetzen durch:

```ts
// apps/api/src/app.test.ts
import { expect, it } from 'vitest';
import { buildApp } from './app.js';

it('serves /health in memory mode without db/config', async () => {
    const app = buildApp();
    await app.ready();
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: 'ok', persistence: 'memory' });
    await app.close();
});

it('does not mount /v1 routes without db+config', async () => {
    const app = buildApp();
    await app.ready();
    expect((await app.inject({ method: 'GET', url: '/v1/service-types' })).statusCode).toBe(404);
    await app.close();
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npm test --workspace @tattoo-studio/api -- app.test`
Expected: FAIL (alte `/api/v1`-Assertions weg, `persistence: 'memory'` noch anders geliefert).

- [ ] **Step 3: `app.ts` aufräumen** — komplett auf diese Struktur bringen:

```ts
// apps/api/src/app.ts
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import Fastify from 'fastify';
import { sql, type Kysely } from 'kysely';
import type { AppConfig } from './config.js';
import type { Database } from './database/types.js';
import { createUploadsStorage } from './plugins/uploads-storage.js';
import { registerRateLimit } from './plugins/rate-limit.js';
import { adminHoldRoutes } from './routes/admin-holds.js';
import { adminInquiryRoutes } from './routes/admin-inquiries.js';
import { availabilityRoutes } from './routes/availability.js';
import { inquiryRoutes } from './routes/inquiries.js';
import { serviceTypeRoutes } from './routes/service-types.js';
import { slotHoldRoutes } from './routes/slot-holds.js';
import { uploadRoutes } from './routes/uploads.js';

type BuildAppOptions = {
    logger?: boolean;
    config?: AppConfig;
    db?: Kysely<Database>;
};

export const buildApp = (options: BuildAppOptions = {}) => {
    const app = Fastify({ logger: options.logger ?? false });
    const { db, config } = options;

    app.register(cors, { origin: true, methods: ['GET', 'POST', 'DELETE'] });

    app.get('/health', async (_request, reply) => {
        if (!db) return { status: 'ok', persistence: 'memory' as const };
        try {
            await sql`select 1`.execute(db);
            return { status: 'ok', persistence: 'postgres' as const };
        } catch {
            return reply.status(503).send({ status: 'unavailable' });
        }
    });

    if (db && config) {
        registerRateLimit(app);
        app.register(multipart, { limits: { fileSize: config.maxUploadBytes, files: 1 } });
        const storage = createUploadsStorage(config.uploadsDir);
        app.register(serviceTypeRoutes, { db });
        app.register(uploadRoutes, { db, config, storage });
        app.register(availabilityRoutes, { db, config });
        app.register(inquiryRoutes, { db, config });
        app.register(slotHoldRoutes, { db, config });
        app.register(adminHoldRoutes, { db, config });
        app.register(adminInquiryRoutes, { db, config });
    }

    return app;
};
```

> Falls `slotHoldRoutes` / `adminHoldRoutes` / `availabilityRoutes` einen `onClose`-Hook oder anderes vom alten `repository` erwarteten: prüfen — sie sollten nur `db`/`config` nutzen (Spec B). Der alte `onClose`-Hook (`repository.close()`) entfällt ersatzlos; `db` gehört `server.ts`.

- [ ] **Step 4: `server.ts` aufräumen**

```ts
// apps/api/src/server.ts
import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { createDatabase } from './database/client.js';

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? '0.0.0.0';

const dbUrl = process.env.DATABASE_URL;
const db = dbUrl ? createDatabase(dbUrl) : undefined;
const config = db ? loadConfig() : undefined;

const app = buildApp({ logger: true, config, db });

if (!dbUrl) {
    app.log.warn('DATABASE_URL fehlt: /v1/*-Routen sind deaktiviert.');
}

try {
    await app.listen({ host, port });
} catch (error) {
    app.log.error(error);
    process.exit(1);
}

const shutdown = async () => {
    await app.close();
    process.exit(0);
};
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
```

- [ ] **Step 5: Dateien löschen**

```bash
git rm apps/api/src/catalog.ts apps/api/src/availability.ts apps/api/src/repository.ts
```

- [ ] **Step 6: Run tests**

Run: `npm test --workspace @tattoo-studio/api -- app.test`
Expected: PASS.

Run: `npm test --workspace @tattoo-studio/api`
Expected: alle grün (die neuen `/v1`-Tests + Spec-B-Tests). Falls Spec-B-Tests noch `/api/v1` oder das alte `repository` referenzierten: das dürfen sie nicht — Spec B nutzte ausschließlich `/v1/*` und `db`. Andernfalls hier anpassen.

- [ ] **Step 7: `check-types`**

Run: `npm run check-types --workspace @tattoo-studio/api`
Expected: PASS (jetzt, da `booking_request`-Referenzen weg sind).

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/app.ts apps/api/src/server.ts apps/api/src/app.test.ts
git commit -m "refactor(api): Legacy-/api/v1-Pfad und Repository entfernt"
```

---

### Task 18: Legacy-Contracts entfernen

**Files:**
- Modify: `packages/contracts/src/index.ts`
- Test: `packages/contracts/src/index.test.ts` (anpassen)

**Interfaces:**
- Produces: `index.ts` ohne `legacyServiceTypeSchema`, `legacyServiceTypesResponseSchema`, `legacyAvailabilityQuerySchema`, `legacyAvailabilitySlotSchema`, `legacyAvailabilityResponseSchema`, `createBookingRequestSchema`, `bookingRequestSchema`, `createBookingRequestResponseSchema` und zugehörige Typen. `serviceTypeIdSchema` + `ServiceTypeId` **bleiben** (Web-Typisierung).

- [ ] **Step 1: `index.test.ts` prüfen/anpassen** — falls der bestehende Test `createBookingRequestSchema` testet, diesen `describe`-Block löschen. Ein Ersatz-Assertion, dass `serviceTypeIdSchema` noch da ist:

```ts
// packages/contracts/src/index.test.ts
import { describe, expect, it } from 'vitest';
import { serviceTypeIdSchema } from './index.js';

describe('service type id', () => {
    it('accepts the three seeded ids', () => {
        expect(serviceTypeIdSchema.options).toEqual(['consultation', 'small-tattoo', 'day-session']);
    });
});
```

- [ ] **Step 2: `index.ts` bereinigen** — alle `legacy*`- und `createBookingRequest*`-/`bookingRequest*`-Definitionen samt `export type`-Zeilen entfernen. Behalten: `serviceTypeIdSchema`, `export type ServiceTypeId`, die `export * from './…js'`-Zeilen (inkl. der neuen aus Tasks 2/3).

- [ ] **Step 3: Build + Test**

Run: `npm run build --workspace @tattoo-studio/contracts && npm test --workspace @tattoo-studio/contracts`
Expected: PASS.

- [ ] **Step 4: Downstream prüfen** — `npm run check-types` (root). `apps/web` bricht jetzt (importiert `legacy*` in `bookingApi.ts` / `BookingFlow.tsx`). **Erwartet** — diese Dateien werden in Task 24 gelöscht/ersetzt. Wenn ein grüner Zwischenstand gewünscht ist: Task 18 mit den Web-Tasks 20–24 bündeln.

- [ ] **Step 5: Commit**

```bash
git add packages/contracts/src/index.ts packages/contracts/src/index.test.ts
git commit -m "refactor(contracts): Legacy-Schemas entfernt"
```

---

### Task 19: API-Gesamtlauf + Dev-DB zurücksetzen

**Files:** keine (Verifikation).

- [ ] **Step 1: Volle API-Suite**

Run: `npm run db:up && npm test --workspace @tattoo-studio/api`
Expected: alle grün.

- [ ] **Step 2: `check-types` (api + contracts)**

Run: `npm run check-types --workspace @tattoo-studio/contracts && npm run check-types --workspace @tattoo-studio/api`
Expected: PASS.

- [ ] **Step 3: Dev-DB neu aufsetzen** (weil `003` `booking_request` droppt)

```bash
docker exec chayns_website-postgres-1 psql -U tattoo -d postgres -c "DROP DATABASE IF EXISTS tattoo_studio WITH (FORCE);" -c "CREATE DATABASE tattoo_studio;"
DATABASE_URL='postgresql://tattoo:tattoo-local@localhost:5432/tattoo_studio' npm run db:migrate
```

Expected: `001`, `002`, `003` laufen durch.

- [ ] **Step 4: Smoke-Test der API** (Server bauen + starten)

```bash
npm run build --workspace @tattoo-studio/api
DATABASE_URL='postgresql://tattoo:tattoo-local@localhost:5432/tattoo_studio' ADMIN_API_TOKEN='local-dev' PORT=3999 node apps/api/dist/server.js &
```

Dann: `GET /v1/service-types` liefert 3 Typen; `POST /v1/uploads` (multipart, `X-Client-Token`) → 201 mit `uploadId`; `POST /v1/inquiries` (mit `Idempotency-Key`, `X-Client-Token`, einer Region) → 201; `GET /v1/admin/inquiries` (Bearer `local-dev`) zeigt sie; `POST /v1/admin/inquiries/{id}/accept` → 200. Server stoppen, Testdaten aus der Dev-DB löschen.

- [ ] **Step 5: Commit** (nur falls in Steps Anpassungen nötig waren; sonst überspringen)

```bash
git commit -am "test(api): Gesamtlauf Spec-C-Backend grün"
```

---

### Task 20: `shared/AppWrapper` mit `children`

**Files:**
- Create: `apps/web/src/shared/AppWrapper.tsx`
- Modify: `apps/web/src/index.tsx`
- Delete: `apps/web/src/components/AppWrapper.tsx`
- Test: `apps/web/src/shared/AppWrapper.test.tsx`

**Interfaces:**
- Produces: `AppWrapper: React.FC<{ children: React.ReactNode }>` — `ChaynsProvider` (nur wenn nicht Standalone-Preview) + `QueryClientProvider` + `PageProvider`, rendert `children` statt fest `<App/>`.

- [ ] **Step 1: Failing test**

```tsx
// apps/web/src/shared/AppWrapper.test.tsx
import React from 'react';
import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import AppWrapper from './AppWrapper';

it('renders its children', async () => {
    render(<AppWrapper><p>hallo welt</p></AppWrapper>);
    expect(await screen.findByText('hallo welt')).toBeTruthy();
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `cd apps/web && npx vitest run src/shared/AppWrapper.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement** — `components/AppWrapper.tsx` nach `shared/AppWrapper.tsx` verschieben und `<App/>` durch `{children}` ersetzen:

```tsx
// apps/web/src/shared/AppWrapper.tsx
import React, { useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ChaynsProvider } from 'chayns-api';
import { PageProvider } from '@chayns-components/core';

const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: 1, staleTime: 60_000 } },
});

const AppWrapper = ({ children }: { children: React.ReactNode }) => {
    const isStandalonePreview =
        window.self === window.top && !/chayns/i.test(navigator.userAgent);

    useEffect(() => {
        document.documentElement.classList.toggle('standalone-preview', isStandalonePreview);
        return () => document.documentElement.classList.remove('standalone-preview');
    }, [isStandalonePreview]);

    if (isStandalonePreview) {
        return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
    }

    return (
        <ChaynsProvider>
            <QueryClientProvider client={queryClient}>
                <PageProvider>{children}</PageProvider>
            </QueryClientProvider>
        </ChaynsProvider>
    );
};

export default AppWrapper;
```

- [ ] **Step 4: `index.tsx` anpassen**

```tsx
import React from 'react';
import { createRoot } from 'react-dom/client';
import AppWrapper from './shared/AppWrapper';
import Wizard from './wizard/Wizard';
import './components/app.css';

try {
    const root = createRoot(document.querySelector('#root') as Element);
    root.render(
        <AppWrapper>
            <Wizard />
        </AppWrapper>,
    );
} catch (e) {
    console.error('Encountered error at `ReactDOM.render`: ', e);
}
```

> `wizard/Wizard` existiert erst nach Task 25 — bis dahin bricht der Build von `apps/web`. Das ist erwartet; die Web-Tasks 20–27 sind eine zusammenhängende Einheit, `check-types`/`build` von `apps/web` wird erst nach Task 25 wieder grün.

- [ ] **Step 5: Datei löschen**

```bash
git rm apps/web/src/components/AppWrapper.tsx
```

- [ ] **Step 6: Run test**

Run: `cd apps/web && npx vitest run src/shared/AppWrapper.test.tsx`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/shared/AppWrapper.tsx apps/web/src/shared/AppWrapper.test.tsx apps/web/src/index.tsx
git commit -m "refactor(web): AppWrapper nach shared/, nimmt children"
```

---

### Task 21: `BodyRegionPicker` (geteilt)

**Files:**
- Create: `apps/web/src/shared/bodyFigure.tsx`, `apps/web/src/shared/BodyRegionPicker.tsx`
- Test: `apps/web/src/shared/BodyRegionPicker.test.tsx`

**Interfaces:**
- Consumes: `bodyRegionCodeSchema`, `bodyRegionLabels`, `BodyRegionCode` (Contract)
- Produces:
  - `bodyFigure.tsx`: `FRONT_REGIONS: { code: BodyRegionCode; d?: string; cx?: number; cy?: number; rx?: number; ry?: number }[]` und `BACK_REGIONS: …` plus `FigureFrame` (SVG-Silhouette, ohne Klick-Logik). Jede Region als `<path>`/`<ellipse>` mit `data-region={code}` und `aria-label={label}`.
  - `BodyRegionPicker.tsx`: `React.FC<{ value: BodyRegionCode[]; onChange?: (next: BodyRegionCode[]) => void; mode: 'edit' | 'view' }>` — rendert Vorder- und Rückfigur; im `edit`-Modus togglet ein Klick/Tastendruck (`role="button"`, `tabIndex=0`, `onKeyDown` Space/Enter) die Region und ruft `onChange`; ausgewählte Regionen sind farbig gefüllt; darunter eine Chip-Liste der gewählten Labels (im `edit`-Modus mit „✕" zum Entfernen). Im `view`-Modus keine Handler, kein `tabIndex`.

- [ ] **Step 1: Failing test**

```tsx
// apps/web/src/shared/BodyRegionPicker.test.tsx
import React, { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import type { BodyRegionCode } from '@tattoo-studio/contracts';
import BodyRegionPicker from './BodyRegionPicker';

const Harness = ({ onChange }: { onChange: (v: BodyRegionCode[]) => void }) => {
    const [v, setV] = useState<BodyRegionCode[]>([]);
    return (
        <BodyRegionPicker
            mode="edit"
            value={v}
            onChange={(next) => {
                setV(next);
                onChange(next);
            }}
        />
    );
};

it('toggles regions on click and supports multi-select', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    fireEvent.click(screen.getByLabelText('Oberarm links'));
    fireEvent.click(screen.getByLabelText('Brust'));
    expect(onChange).toHaveBeenLastCalledWith(['front.upper_arm.left', 'front.chest']);
    fireEvent.click(screen.getByLabelText('Oberarm links'));
    expect(onChange).toHaveBeenLastCalledWith(['front.chest']);
});

it('view mode is not interactive', () => {
    render(<BodyRegionPicker mode="view" value={['front.chest']} />);
    const region = screen.getByLabelText('Brust');
    expect(region.getAttribute('tabindex')).toBeNull();
    expect(screen.getByText('Brust')).toBeTruthy(); // chip
});
```

> Die erwartete Klick-Reihenfolge (`front.upper_arm.left` vor `front.chest`) muss zur Reihenfolge passen, in der `onChange` das Array aufbaut — die Implementierung hängt neue Codes hinten an.

- [ ] **Step 2: Run test, verify it fails**

Run: `cd apps/web && npx vitest run src/shared/BodyRegionPicker.test.tsx`
Expected: FAIL.

- [ ] **Step 3: `bodyFigure.tsx` schreiben** — Platzhalter-Piktogramm (finale Illustration = §13-Aufgabe der Spec). Silhouette als eine `<path>`-Form pro Figur; Regionen als einfache `<ellipse>`/`<rect>`/`<path>` mit `data-region` + `aria-label`. Beispiel-Ausschnitt (das Muster für alle 34 Codes fortsetzen):

```tsx
// apps/web/src/shared/bodyFigure.tsx
import React from 'react';
import { bodyRegionLabels, type BodyRegionCode } from '@tattoo-studio/contracts';

type Shape = { code: BodyRegionCode } & (
    | { kind: 'ellipse'; cx: number; cy: number; rx: number; ry: number }
    | { kind: 'rect'; x: number; y: number; w: number; h: number }
);

export const FRONT_REGIONS: Shape[] = [
    { code: 'front.head', kind: 'ellipse', cx: 110, cy: 46, rx: 24, ry: 31 },
    { code: 'front.neck', kind: 'rect', x: 98, y: 74, w: 24, h: 18 },
    { code: 'front.shoulder.left', kind: 'ellipse', cx: 150, cy: 100, rx: 20, ry: 14 },
    { code: 'front.shoulder.right', kind: 'ellipse', cx: 70, cy: 100, rx: 20, ry: 14 },
    { code: 'front.chest', kind: 'rect', x: 80, y: 92, w: 60, h: 46 },
    { code: 'front.abdomen', kind: 'rect', x: 82, y: 138, w: 56, h: 44 },
    { code: 'front.pelvis', kind: 'rect', x: 84, y: 182, w: 52, h: 34 },
    { code: 'front.upper_arm.left', kind: 'rect', x: 150, y: 100, w: 26, h: 64 },
    { code: 'front.upper_arm.right', kind: 'rect', x: 44, y: 100, w: 26, h: 64 },
    { code: 'front.forearm.left', kind: 'rect', x: 152, y: 164, w: 24, h: 66 },
    { code: 'front.forearm.right', kind: 'rect', x: 44, y: 164, w: 24, h: 66 },
    { code: 'front.hand.left', kind: 'ellipse', cx: 164, cy: 244, rx: 12, ry: 15 },
    { code: 'front.hand.right', kind: 'ellipse', cx: 56, cy: 244, rx: 12, ry: 15 },
    { code: 'front.thigh.left', kind: 'rect', x: 112, y: 216, w: 24, h: 80 },
    { code: 'front.thigh.right', kind: 'rect', x: 84, y: 216, w: 24, h: 80 },
    { code: 'front.lower_leg.left', kind: 'rect', x: 114, y: 296, w: 22, h: 84 },
    { code: 'front.lower_leg.right', kind: 'rect', x: 84, y: 296, w: 22, h: 84 },
    { code: 'front.foot.left', kind: 'ellipse', cx: 125, cy: 392, rx: 13, ry: 10 },
    { code: 'front.foot.right', kind: 'ellipse', cx: 95, cy: 392, rx: 13, ry: 10 },
];

export const BACK_REGIONS: Shape[] = [
    { code: 'back.head', kind: 'ellipse', cx: 110, cy: 46, rx: 24, ry: 31 },
    { code: 'back.neck', kind: 'rect', x: 98, y: 74, w: 24, h: 18 },
    { code: 'back.shoulder_blade.left', kind: 'ellipse', cx: 150, cy: 104, rx: 20, ry: 16 },
    { code: 'back.shoulder_blade.right', kind: 'ellipse', cx: 70, cy: 104, rx: 20, ry: 16 },
    { code: 'back.upper_back', kind: 'rect', x: 80, y: 92, w: 60, h: 48 },
    { code: 'back.lower_back', kind: 'rect', x: 82, y: 140, w: 56, h: 40 },
    { code: 'back.buttocks', kind: 'rect', x: 82, y: 180, w: 56, h: 36 },
    { code: 'back.upper_arm.left', kind: 'rect', x: 150, y: 100, w: 26, h: 64 },
    { code: 'back.upper_arm.right', kind: 'rect', x: 44, y: 100, w: 26, h: 64 },
    { code: 'back.forearm.left', kind: 'rect', x: 152, y: 164, w: 24, h: 66 },
    { code: 'back.forearm.right', kind: 'rect', x: 44, y: 164, w: 24, h: 66 },
    { code: 'back.thigh.left', kind: 'rect', x: 112, y: 216, w: 24, h: 80 },
    { code: 'back.thigh.right', kind: 'rect', x: 84, y: 216, w: 24, h: 80 },
    { code: 'back.calf.left', kind: 'rect', x: 114, y: 296, w: 22, h: 84 },
    { code: 'back.calf.right', kind: 'rect', x: 84, y: 296, w: 22, h: 84 },
];

const SILHOUETTE =
    'M110 10c15 0 26 13 26 30 0 15-8 26-19 32 20 3 33 15 33 34v70c0 12-4 22-10 30 8 40 10 96 6 150-1 12-11 18-21 16-8-2-13-9-13-18-1-40-1-80-4-118-3 38-3 78-4 118 0 9-5 16-13 18-10 2-20-4-21-16-4-54-2-110 6-150-6-8-10-18-10-30v-70c0-19 13-31 33-34-11-6-19-17-19-32 0-17 11-30 26-30z';

export const FigureFrame = ({
    regions,
    selected,
    onToggle,
    interactive,
}: {
    regions: Shape[];
    selected: Set<string>;
    onToggle: (code: BodyRegionCode) => void;
    interactive: boolean;
}) => (
    <svg viewBox="0 0 220 410" className="body-figure" role="img" aria-label="Körperfigur">
        <path d={SILHOUETTE} className="body-figure__silhouette" />
        {regions.map((s) => {
            const common = {
                key: s.code,
                'data-region': s.code,
                'aria-label': bodyRegionLabels[s.code],
                className: `body-figure__region${selected.has(s.code) ? ' is-selected' : ''}`,
                ...(interactive
                    ? {
                          role: 'button' as const,
                          tabIndex: 0,
                          onClick: () => onToggle(s.code),
                          onKeyDown: (e: React.KeyboardEvent) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault();
                                  onToggle(s.code);
                              }
                          },
                      }
                    : {}),
            };
            return s.kind === 'ellipse' ? (
                <ellipse {...common} cx={s.cx} cy={s.cy} rx={s.rx} ry={s.ry} />
            ) : (
                <rect {...common} x={s.x} y={s.y} width={s.w} height={s.h} rx={8} />
            );
        })}
    </svg>
);
```

- [ ] **Step 4: `BodyRegionPicker.tsx` schreiben**

```tsx
// apps/web/src/shared/BodyRegionPicker.tsx
import React from 'react';
import { bodyRegionLabels, type BodyRegionCode } from '@tattoo-studio/contracts';
import { BACK_REGIONS, FRONT_REGIONS, FigureFrame } from './bodyFigure';

type Props = {
    value: BodyRegionCode[];
    onChange?: (next: BodyRegionCode[]) => void;
    mode: 'edit' | 'view';
};

const BodyRegionPicker = ({ value, onChange, mode }: Props) => {
    const selected = new Set<string>(value);
    const interactive = mode === 'edit' && Boolean(onChange);

    const toggle = (code: BodyRegionCode) => {
        if (!onChange) return;
        onChange(value.includes(code) ? value.filter((c) => c !== code) : [...value, code]);
    };

    return (
        <div className="body-picker">
            <div className="body-picker__figures">
                <figure>
                    <figcaption>Vorderseite</figcaption>
                    <FigureFrame regions={FRONT_REGIONS} selected={selected} onToggle={toggle} interactive={interactive} />
                </figure>
                <figure>
                    <figcaption>Rückseite</figcaption>
                    <FigureFrame regions={BACK_REGIONS} selected={selected} onToggle={toggle} interactive={interactive} />
                </figure>
            </div>
            <ul className="body-picker__chips">
                {value.map((code) => (
                    <li key={code}>
                        {bodyRegionLabels[code]}
                        {interactive && (
                            <button type="button" aria-label={`${bodyRegionLabels[code]} entfernen`} onClick={() => toggle(code)}>
                                ✕
                            </button>
                        )}
                    </li>
                ))}
            </ul>
        </div>
    );
};

export default BodyRegionPicker;
```

- [ ] **Step 5: Run test, verify it passes**

Run: `cd apps/web && npx vitest run src/shared/BodyRegionPicker.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/shared/bodyFigure.tsx apps/web/src/shared/BodyRegionPicker.tsx apps/web/src/shared/BodyRegionPicker.test.tsx
git commit -m "feat(web): geteilter BodyRegionPicker (Platzhalter-Figur)"
```

---

### Task 22: `wizard/api/inquiryApi.ts`

**Files:**
- Create: `apps/web/src/wizard/api/inquiryApi.ts`
- Modify: `apps/web/.env`, `apps/web/.env.development.local`
- Test: `apps/web/src/wizard/api/inquiryApi.test.ts`

**Interfaces:**
- Consumes: `serviceTypesResponseSchema`, `availabilityResponseSchema`, `uploadResultSchema`, `inquiryResponseSchema`, `createInquirySchema` (Contract)
- Produces:
  - `getClientToken(): string` — `localStorage['tattoo.clientToken']`, sonst `crypto.randomUUID()` + speichern
  - `getServiceTypes(): Promise<ServiceType[]>`
  - `getAvailability(serviceTypeId: string, artistId: string, from: string): Promise<AvailabilityResponse>`
  - `uploadImage(file: File, onProgress?: (p: number) => void): Promise<UploadResult>` — `XMLHttpRequest` für Fortschritt, `X-Client-Token`
  - `createInquiry(payload: CreateInquiry): Promise<InquiryResponse>` — `POST` mit `Idempotency-Key` (`crypto.randomUUID()`) + `X-Client-Token`; Antwort mit `inquiryResponseSchema` revalidiert

- [ ] **Step 1: Failing test**

```ts
// apps/web/src/wizard/api/inquiryApi.test.ts
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createInquiry, getClientToken, getServiceTypes } from './inquiryApi';

beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal('fetch', vi.fn());
});
afterEach(() => vi.unstubAllGlobals());

it('persists a client token', () => {
    const a = getClientToken();
    const b = getClientToken();
    expect(a).toBe(b);
    expect(localStorage.getItem('tattoo.clientToken')).toBe(a);
});

it('parses the service type list', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: async () => ({
            items: [
                {
                    id: 'small-tattoo', name: 'Kleines Tattoo', description: 'x', durationMinutes: 120,
                    preBufferMinutes: 15, postBufferMinutes: 15, bookingMode: 'request', depositTier: 'D50', depositCents: 5000,
                },
            ],
        }),
    });
    const items = await getServiceTypes();
    expect(items[0]!.id).toBe('small-tattoo');
});

it('sends idempotency and client-token headers on createInquiry', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: async () => ({
            inquiryId: crypto.randomUUID(), status: 'NEW', reference: 'abcd1234',
            createdAt: '2026-08-29T10:00:00.000Z',
        }),
    });
    await createInquiry({
        serviceTypeId: 'small-tattoo', preferredArtistId: 'any', bodyRegions: ['front.chest'],
        description: '', referenceImageIds: [],
        customer: { firstName: 'Ann', lastName: 'Roe', email: 'a@b.de', phone: '+49 111 222' },
        acceptsTerms: true,
    });
    const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(init.headers['X-Client-Token']).toBeTruthy();
    expect(init.headers['Idempotency-Key']).toBeTruthy();
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `cd apps/web && npx vitest run src/wizard/api/inquiryApi.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
// apps/web/src/wizard/api/inquiryApi.ts
import {
    availabilityResponseSchema,
    createInquirySchema,
    inquiryResponseSchema,
    serviceTypesResponseSchema,
    uploadResultSchema,
    type AvailabilityResponse,
    type CreateInquiry,
    type InquiryResponse,
    type ServiceType,
    type UploadResult,
} from '@tattoo-studio/contracts';

const BASE = (process.env.PUBLIC_BOOKING_API_URL || 'http://localhost:3000').replace(/\/$/, '');
const TOKEN_KEY = 'tattoo.clientToken';

export const getClientToken = (): string => {
    let t = localStorage.getItem(TOKEN_KEY);
    if (!t) {
        t = crypto.randomUUID();
        localStorage.setItem(TOKEN_KEY, t);
    }
    return t;
};

const getJson = async (path: string, init?: RequestInit) => {
    const res = await fetch(`${BASE}${path}`, init);
    const body: unknown = await res.json();
    if (!res.ok) {
        const message =
            typeof body === 'object' && body && 'message' in body
                ? String((body as { message: unknown }).message)
                : 'Die Anfrage konnte nicht verarbeitet werden.';
        throw new Error(message);
    }
    return body;
};

export const getServiceTypes = async (): Promise<ServiceType[]> =>
    serviceTypesResponseSchema.parse(await getJson('/v1/service-types')).items;

export const getAvailability = async (
    serviceTypeId: string,
    artistId: string,
    from: string,
): Promise<AvailabilityResponse> => {
    const params = new URLSearchParams({ serviceTypeId, artistId, from, days: '14' });
    return availabilityResponseSchema.parse(await getJson(`/v1/availability?${params}`));
};

export const uploadImage = (file: File, onProgress?: (p: number) => void): Promise<UploadResult> =>
    new Promise((resolve, reject) => {
        const form = new FormData();
        form.append('file', file);
        const xhr = new XMLHttpRequest();
        xhr.open('POST', `${BASE}/v1/uploads`);
        xhr.setRequestHeader('X-Client-Token', getClientToken());
        xhr.upload.onprogress = (e) => {
            if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
        };
        xhr.onload = () => {
            try {
                const json = JSON.parse(xhr.responseText);
                if (xhr.status >= 200 && xhr.status < 300) resolve(uploadResultSchema.parse(json));
                else reject(new Error(json?.message ?? 'Upload fehlgeschlagen.'));
            } catch {
                reject(new Error('Upload fehlgeschlagen.'));
            }
        };
        xhr.onerror = () => reject(new Error('Upload fehlgeschlagen.'));
        xhr.send(form);
    });

export const createInquiry = async (payload: CreateInquiry): Promise<InquiryResponse> => {
    const body = createInquirySchema.parse(payload);
    const json = await getJson('/v1/inquiries', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Client-Token': getClientToken(),
            'Idempotency-Key': crypto.randomUUID(),
        },
        body: JSON.stringify(body),
    });
    return inquiryResponseSchema.parse(json);
};
```

- [ ] **Step 4: `.env` / `.env.development.local` anpassen** — `PUBLIC_BOOKING_API_URL` auf die Basis ohne `/api/v1` setzen:
  - `apps/web/.env`: `PUBLIC_BOOKING_API_URL = https://api.example.com`
  - `apps/web/.env.development.local`: `PUBLIC_BOOKING_API_URL=http://localhost:3000`  *(lokal, gitignored — nicht committen)*

- [ ] **Step 5: Run test, verify it passes**

Run: `cd apps/web && npx vitest run src/wizard/api/inquiryApi.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/wizard/api/inquiryApi.ts apps/web/src/wizard/api/inquiryApi.test.ts apps/web/.env
git commit -m "feat(web): API-Client für Anfrage, Upload und Service-Typen"
```

---

### Task 23: `ReferenceUploader` und `SizeField`

**Files:**
- Create: `apps/web/src/wizard/ReferenceUploader.tsx`, `apps/web/src/wizard/SizeField.tsx`
- Test: `apps/web/src/wizard/ReferenceUploader.test.tsx`

**Interfaces:**
- Consumes: `uploadImage` (Task 22)
- Produces:
  - `SizeField: React.FC<{ value: number | undefined; onChange: (v: number | undefined) => void }>` — `<input type="number" inputMode="numeric">`, leer → `undefined`
  - `ReferenceUploader: React.FC<{ value: string[]; onChange: (ids: string[]) => void; max?: number }>` — `<input type="file" accept="image/*" multiple>`; pro Datei ein Eintrag mit `URL.createObjectURL`-Vorschau + Zustand `uploading` (Prozent) / `done` / `error` (Retry-Button); bei `done` wird die `uploadId` in `value` aufgenommen; „Entfernen" nimmt sie raus. `max` (Default 5) blockiert weiteres Auswählen.

- [ ] **Step 1: Failing test**

```tsx
// apps/web/src/wizard/ReferenceUploader.test.tsx
import React, { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

vi.mock('./api/inquiryApi', () => ({
    uploadImage: vi.fn(),
}));
import { uploadImage } from './api/inquiryApi';
import ReferenceUploader from './ReferenceUploader';

const Harness = () => {
    const [ids, setIds] = useState<string[]>([]);
    return (
        <>
            <ReferenceUploader value={ids} onChange={setIds} />
            <output data-testid="ids">{ids.join(',')}</output>
        </>
    );
};

afterEach(() => vi.clearAllMocks());
globalThis.URL.createObjectURL = vi.fn(() => 'blob:x');

it('uploads a picked file and records the id', async () => {
    (uploadImage as ReturnType<typeof vi.fn>).mockResolvedValue({ uploadId: 'up-1', url: '/v1/uploads/up-1', contentType: 'image/png', width: 10, height: 10, byteSize: 5 });
    render(<Harness />);
    const file = new File(['x'], 'a.png', { type: 'image/png' });
    fireEvent.change(screen.getByLabelText(/foto/i), { target: { files: [file] } });
    await waitFor(() => expect(screen.getByTestId('ids').textContent).toBe('up-1'));
});

it('shows an error and lets the user retry', async () => {
    (uploadImage as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('kaputt'));
    render(<Harness />);
    fireEvent.change(screen.getByLabelText(/foto/i), { target: { files: [new File(['x'], 'a.png', { type: 'image/png' })] } });
    expect(await screen.findByRole('button', { name: /erneut/i })).toBeTruthy();
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `cd apps/web && npx vitest run src/wizard/ReferenceUploader.test.tsx`
Expected: FAIL.

- [ ] **Step 3: `SizeField.tsx` schreiben**

```tsx
// apps/web/src/wizard/SizeField.tsx
import React from 'react';

const SizeField = ({
    value,
    onChange,
}: {
    value: number | undefined;
    onChange: (v: number | undefined) => void;
}) => (
    <label className="size-field">
        Ungefähre Größe (cm)
        <input
            type="number"
            inputMode="numeric"
            min={1}
            max={300}
            value={value ?? ''}
            onChange={(e) => {
                const n = e.target.valueAsNumber;
                onChange(Number.isFinite(n) ? n : undefined);
            }}
        />
    </label>
);

export default SizeField;
```

- [ ] **Step 4: `ReferenceUploader.tsx` schreiben**

```tsx
// apps/web/src/wizard/ReferenceUploader.tsx
import React, { useRef, useState } from 'react';
import { uploadImage } from './api/inquiryApi';

type Item = {
    key: string;
    previewUrl: string;
    file: File;
    state: 'uploading' | 'done' | 'error';
    progress: number;
    uploadId?: string;
};

const ReferenceUploader = ({
    value,
    onChange,
    max = 5,
}: {
    value: string[];
    onChange: (ids: string[]) => void;
    max?: number;
}) => {
    const [items, setItems] = useState<Item[]>([]);
    const inputRef = useRef<HTMLInputElement>(null);

    const patch = (key: string, next: Partial<Item>) =>
        setItems((cur) => cur.map((it) => (it.key === key ? { ...it, ...next } : it)));

    const start = async (item: Item) => {
        patch(item.key, { state: 'uploading', progress: 0 });
        try {
            const res = await uploadImage(item.file, (p) => patch(item.key, { progress: p }));
            patch(item.key, { state: 'done', uploadId: res.uploadId });
            onChange([...value, res.uploadId]);
        } catch {
            patch(item.key, { state: 'error' });
        }
    };

    const onPick = (files: FileList | null) => {
        if (!files) return;
        const room = max - items.length;
        for (const file of Array.from(files).slice(0, room)) {
            const item: Item = {
                key: crypto.randomUUID(),
                previewUrl: URL.createObjectURL(file),
                file,
                state: 'uploading',
                progress: 0,
            };
            setItems((cur) => [...cur, item]);
            void start(item);
        }
        if (inputRef.current) inputRef.current.value = '';
    };

    const remove = (item: Item) => {
        setItems((cur) => cur.filter((it) => it.key !== item.key));
        if (item.uploadId) onChange(value.filter((id) => id !== item.uploadId));
    };

    return (
        <div className="reference-uploader">
            <ul>
                {items.map((it) => (
                    <li key={it.key}>
                        <img src={it.previewUrl} alt="" />
                        {it.state === 'uploading' && <span>{it.progress}%</span>}
                        {it.state === 'done' && <span>hochgeladen</span>}
                        {it.state === 'error' && (
                            <button type="button" onClick={() => start(it)}>
                                Erneut versuchen
                            </button>
                        )}
                        <button type="button" aria-label="Bild entfernen" onClick={() => remove(it)}>
                            ✕
                        </button>
                    </li>
                ))}
            </ul>
            {items.length < max && (
                <label className="reference-uploader__add">
                    + Foto
                    <input
                        ref={inputRef}
                        type="file"
                        accept="image/*"
                        multiple
                        onChange={(e) => onPick(e.target.files)}
                    />
                </label>
            )}
        </div>
    );
};

export default ReferenceUploader;
```

- [ ] **Step 5: Run test, verify it passes**

Run: `cd apps/web && npx vitest run src/wizard/ReferenceUploader.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/wizard/ReferenceUploader.tsx apps/web/src/wizard/SizeField.tsx apps/web/src/wizard/ReferenceUploader.test.tsx
git commit -m "feat(web): Referenzbild-Uploader und cm-Feld"
```

---

### Task 24: Wizard-Schritte

**Files:**
- Create: `apps/web/src/wizard/steps/ServiceStep.tsx`, `TimeStep.tsx`, `MotifStep.tsx`, `ContactStep.tsx`, `Confirmation.tsx`
- Test: `apps/web/src/wizard/steps/steps.test.tsx`

**Interfaces:**
- Consumes: `getServiceTypes`/`getAvailability` (Task 22), `BodyRegionPicker` (Task 21), `ReferenceUploader`/`SizeField` (Task 23), `bodyRegionCodeSchema` types
- Produces (jede Step-Komponente ist „dumm": bekommt Werte + Setter, kein API-Aufruf außer Laden von Listen):
  - `ServiceStep: React.FC<{ value?: string; onSelect: (id: string) => void }>` — lädt Service-Typen via `useQuery`, rendert Karten
  - `TimeStep: React.FC<{ serviceTypeId: string; value?: string; onSelect: (startsAt: string | undefined, artistId: string) => void }>` — lädt `getAvailability(serviceTypeId, 'any', <heute+2>)`, Chips + „Kein Wunschtermin"
  - `MotifStep: React.FC<{ regions; onRegions; sizeCm; onSizeCm; description; onDescription; imageIds; onImageIds }>`
  - `ContactStep: React.FC<{ customer; onCustomer; acceptsTerms; onAcceptsTerms; summary: { serviceName: string; when: string | null }; onSubmit: () => void; submitting: boolean; error?: string }>`
  - `Confirmation: React.FC<{ reference: string }>`

- [ ] **Step 1: Failing test**

```tsx
// apps/web/src/wizard/steps/steps.test.tsx
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

vi.mock('../api/inquiryApi', () => ({
    getServiceTypes: vi.fn().mockResolvedValue([
        { id: 'small-tattoo', name: 'Kleines Tattoo', description: 'x', durationMinutes: 120, preBufferMinutes: 15, postBufferMinutes: 15, bookingMode: 'request', depositTier: 'D50', depositCents: 5000 },
    ]),
    getAvailability: vi.fn().mockResolvedValue({ timezone: 'Europe/Berlin', serviceType: {}, slots: [] }),
}));
import ServiceStep from './ServiceStep';
import ContactStep from './ContactStep';

const wrap = (ui: React.ReactNode) => {
    const c = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(<QueryClientProvider client={c}>{ui}</QueryClientProvider>);
};

it('ServiceStep renders cards and reports selection', async () => {
    const onSelect = vi.fn();
    wrap(<ServiceStep onSelect={onSelect} />);
    fireEvent.click(await screen.findByRole('button', { name: /Kleines Tattoo/i }));
    expect(onSelect).toHaveBeenCalledWith('small-tattoo');
});

it('ContactStep disables submit until consent is checked', () => {
    const onSubmit = vi.fn();
    wrap(
        <ContactStep
            customer={{ firstName: 'Ann', lastName: 'Roe', email: 'a@b.de', phone: '+49 111 222' }}
            onCustomer={() => {}}
            acceptsTerms={false}
            onAcceptsTerms={() => {}}
            summary={{ serviceName: 'Kleines Tattoo', when: null }}
            onSubmit={onSubmit}
            submitting={false}
        />,
    );
    const btn = screen.getByRole('button', { name: /absenden/i });
    fireEvent.click(btn);
    expect(onSubmit).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `cd apps/web && npx vitest run src/wizard/steps/steps.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Steps implementieren** — jede Datei einzeln; die Kernstruktur:

```tsx
// apps/web/src/wizard/steps/ServiceStep.tsx
import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { getServiceTypes } from '../api/inquiryApi';

const currency = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });

const ServiceStep = ({ value, onSelect }: { value?: string; onSelect: (id: string) => void }) => {
    const q = useQuery({ queryKey: ['service-types'], queryFn: getServiceTypes });
    return (
        <section>
            <h2>Was planst du?</h2>
            {q.isPending && <p>Lade Terminarten …</p>}
            {q.isError && <p className="error">Terminarten konnten nicht geladen werden.</p>}
            <div className="service-list">
                {q.data?.map((s) => (
                    <button
                        key={s.id}
                        type="button"
                        className={`service-card${s.id === value ? ' service-card--selected' : ''}`}
                        onClick={() => onSelect(s.id)}
                    >
                        <strong>{s.name}</strong>
                        <small>{s.description}</small>
                        <span>
                            {s.durationMinutes} Min.
                            {s.depositCents > 0 && ` · ${currency.format(s.depositCents / 100)} Anzahlung`}
                        </span>
                    </button>
                ))}
            </div>
        </section>
    );
};

export default ServiceStep;
```

```tsx
// apps/web/src/wizard/steps/TimeStep.tsx
import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { getAvailability } from '../api/inquiryApi';

const dateTime = new Intl.DateTimeFormat('de-DE', {
    weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
});

const twoDaysOut = () => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + 2);
    return d.toISOString().slice(0, 10);
};

const TimeStep = ({
    serviceTypeId,
    value,
    onSelect,
}: {
    serviceTypeId: string;
    value?: string;
    onSelect: (startsAt: string | undefined, artistId: string) => void;
}) => {
    const q = useQuery({
        queryKey: ['availability', serviceTypeId],
        queryFn: () => getAvailability(serviceTypeId, 'any', twoDaysOut()),
    });
    return (
        <section>
            <h2>Welcher Zeitpunkt passt?</h2>
            <button type="button" className={!value ? 'is-selected' : ''} onClick={() => onSelect(undefined, 'any')}>
                Kein Wunschtermin
            </button>
            {q.isPending && <p>Lade freie Zeiten …</p>}
            <div className="slot-grid">
                {q.data?.slots.map((slot) => (
                    <button
                        key={slot.id}
                        type="button"
                        className={value === slot.startsAt ? 'is-selected' : ''}
                        onClick={() => onSelect(slot.startsAt, slot.artistId)}
                    >
                        {dateTime.format(new Date(slot.startsAt))}
                    </button>
                ))}
            </div>
        </section>
    );
};

export default TimeStep;
```

```tsx
// apps/web/src/wizard/steps/MotifStep.tsx
import React from 'react';
import type { BodyRegionCode } from '@tattoo-studio/contracts';
import BodyRegionPicker from '../../shared/BodyRegionPicker';
import ReferenceUploader from '../ReferenceUploader';
import SizeField from '../SizeField';

const MotifStep = ({
    regions,
    onRegions,
    sizeCm,
    onSizeCm,
    description,
    onDescription,
    imageIds,
    onImageIds,
}: {
    regions: BodyRegionCode[];
    onRegions: (r: BodyRegionCode[]) => void;
    sizeCm: number | undefined;
    onSizeCm: (v: number | undefined) => void;
    description: string;
    onDescription: (v: string) => void;
    imageIds: string[];
    onImageIds: (ids: string[]) => void;
}) => (
    <section>
        <h2>Wohin soll dein Tattoo?</h2>
        <BodyRegionPicker mode="edit" value={regions} onChange={onRegions} />
        <SizeField value={sizeCm} onChange={onSizeCm} />
        <label>
            Beschreibung (kurz, optional)
            <textarea
                rows={5}
                maxLength={2000}
                value={description}
                onChange={(e) => onDescription(e.target.value)}
                placeholder="Stil, Wirkung, Farbe, Cover-up ja/nein …"
            />
        </label>
        <h3>Referenzbilder (bis 5)</h3>
        <ReferenceUploader value={imageIds} onChange={onImageIds} />
    </section>
);

export default MotifStep;
```

```tsx
// apps/web/src/wizard/steps/ContactStep.tsx
import React from 'react';

type Customer = { firstName: string; lastName: string; email: string; phone: string };

const ContactStep = ({
    customer,
    onCustomer,
    acceptsTerms,
    onAcceptsTerms,
    summary,
    onSubmit,
    submitting,
    error,
}: {
    customer: Customer;
    onCustomer: (c: Customer) => void;
    acceptsTerms: boolean;
    onAcceptsTerms: (v: boolean) => void;
    summary: { serviceName: string; when: string | null };
    onSubmit: () => void;
    submitting: boolean;
    error?: string;
}) => {
    const field = (key: keyof Customer, label: string, type = 'text') => (
        <label>
            {label}
            <input
                type={type}
                value={customer[key]}
                onChange={(e) => onCustomer({ ...customer, [key]: e.target.value })}
            />
        </label>
    );
    return (
        <section>
            <h2>Kontakt</h2>
            <div className="form-grid">
                {field('firstName', 'Vorname')}
                {field('lastName', 'Nachname')}
                {field('email', 'E-Mail', 'email')}
                {field('phone', 'Telefon', 'tel')}
            </div>
            <label className="consent">
                <input type="checkbox" checked={acceptsTerms} onChange={(e) => onAcceptsTerms(e.target.checked)} />
                Ich stimme der Verarbeitung meiner Angaben zur Bearbeitung der Anfrage zu.
            </label>
            {error && <p className="error">{error}</p>}
            <div className="request-summary">
                <span>
                    {summary.serviceName}
                    {summary.when ? ` · Wunsch: ${summary.when}` : ''}
                </span>
                <button
                    type="button"
                    className="primary-button"
                    disabled={submitting || !acceptsTerms}
                    onClick={onSubmit}
                >
                    {submitting ? 'Wird gesendet …' : 'Anfrage absenden'}
                </button>
            </div>
        </section>
    );
};

export default ContactStep;
```

```tsx
// apps/web/src/wizard/steps/Confirmation.tsx
import React from 'react';

const Confirmation = ({ reference }: { reference: string }) => (
    <section className="success-card">
        <span aria-hidden="true">✓</span>
        <h1>Danke, wir schauen uns deine Idee an.</h1>
        <p>
            Deine Referenznummer lautet <strong>{reference}</strong>. Die Anfrage ist noch nicht
            verbindlich; das Studio meldet sich nach der Prüfung.
        </p>
    </section>
);

export default Confirmation;
```

- [ ] **Step 4: Run test, verify it passes**

Run: `cd apps/web && npx vitest run src/wizard/steps/steps.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/wizard/steps
git commit -m "feat(web): Wizard-Schritte Art, Zeit, Motiv, Kontakt, Bestätigung"
```

---

### Task 25: `Wizard`-Orchestrierung + Legacy-Web-Abbau

**Files:**
- Create: `apps/web/src/wizard/Wizard.tsx`
- Modify: `apps/web/src/components/App.tsx`
- Delete: `apps/web/src/components/BookingFlow.tsx`, `apps/web/src/components/BookingFlow.test.tsx`, `apps/web/src/api/bookingApi.ts`
- Test: `apps/web/src/wizard/Wizard.test.tsx`

**Interfaces:**
- Consumes: alle Steps (Task 24), `createInquiry` (Task 22), `createInquirySchema` (Contract)
- Produces: `Wizard: React.FC` — hält den gesamten State; Navigation über 4 Schritte; Draft in `localStorage['tattoo.draft']` (ohne `File`-Objekte — nur `imageIds` als Strings); beim Absenden `createInquirySchema.safeParse(payload)` **manuell**, Feldfehler zu Schritten zuordnen; bei Erfolg `Confirmation` + Draft löschen.

- [ ] **Step 1: Failing test**

```tsx
// apps/web/src/wizard/Wizard.test.tsx
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('./api/inquiryApi', () => ({
    getClientToken: vi.fn(() => 'tok'),
    getServiceTypes: vi.fn().mockResolvedValue([
        { id: 'small-tattoo', name: 'Kleines Tattoo', description: 'x', durationMinutes: 120, preBufferMinutes: 15, postBufferMinutes: 15, bookingMode: 'request', depositTier: 'D50', depositCents: 5000 },
    ]),
    getAvailability: vi.fn().mockResolvedValue({ timezone: 'Europe/Berlin', serviceType: {}, slots: [] }),
    uploadImage: vi.fn(),
    createInquiry: vi.fn(),
}));
import { createInquiry } from './api/inquiryApi';
import Wizard from './Wizard';

const wrap = () => {
    const c = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(<QueryClientProvider client={c}><Wizard /></QueryClientProvider>);
};

beforeEach(() => localStorage.clear());
afterEach(() => vi.clearAllMocks());

it('walks the four steps and submits a schema-valid payload', async () => {
    (createInquiry as ReturnType<typeof vi.fn>).mockResolvedValue({ inquiryId: crypto.randomUUID(), status: 'NEW', reference: 'abcd1234', createdAt: '2026-08-29T10:00:00.000Z' });
    wrap();

    fireEvent.click(await screen.findByRole('button', { name: /Kleines Tattoo/i }));
    fireEvent.click(await screen.findByRole('button', { name: /weiter/i }));            // -> Zeit
    fireEvent.click(await screen.findByRole('button', { name: /Kein Wunschtermin/i }));
    fireEvent.click(await screen.findByRole('button', { name: /weiter/i }));            // -> Motiv

    fireEvent.click(await screen.findByLabelText('Brust'));
    fireEvent.click(screen.getByRole('button', { name: /weiter/i }));                   // -> Kontakt

    fireEvent.change(screen.getByLabelText('Vorname'), { target: { value: 'Ann' } });
    fireEvent.change(screen.getByLabelText('Nachname'), { target: { value: 'Roe' } });
    fireEvent.change(screen.getByLabelText('E-Mail'), { target: { value: 'a@b.de' } });
    fireEvent.change(screen.getByLabelText('Telefon'), { target: { value: '+49 111 222' } });
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: /absenden/i }));

    await waitFor(() => expect(createInquiry).toHaveBeenCalledTimes(1));
    const payload = (createInquiry as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(payload).toMatchObject({ serviceTypeId: 'small-tattoo', bodyRegions: ['front.chest'], acceptsTerms: true });
    expect(await screen.findByText(/abcd1234/)).toBeTruthy();
    expect(localStorage.getItem('tattoo.draft')).toBeNull();
});

it('blocks step 3 -> 4 without a body region', async () => {
    wrap();
    fireEvent.click(await screen.findByRole('button', { name: /Kleines Tattoo/i }));
    fireEvent.click(await screen.findByRole('button', { name: /weiter/i }));
    fireEvent.click(await screen.findByRole('button', { name: /Kein Wunschtermin/i }));
    fireEvent.click(await screen.findByRole('button', { name: /weiter/i }));
    fireEvent.click(screen.getByRole('button', { name: /weiter/i }));
    expect(screen.getByText(/mindestens eine Körperstelle/i)).toBeTruthy();
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `cd apps/web && npx vitest run src/wizard/Wizard.test.tsx`
Expected: FAIL.

- [ ] **Step 3: `Wizard.tsx` implementieren**

```tsx
// apps/web/src/wizard/Wizard.tsx
import React, { useEffect, useState } from 'react';
import { createInquirySchema, type BodyRegionCode, type CreateInquiry } from '@tattoo-studio/contracts';
import { createInquiry } from './api/inquiryApi';
import ServiceStep from './steps/ServiceStep';
import TimeStep from './steps/TimeStep';
import MotifStep from './steps/MotifStep';
import ContactStep from './steps/ContactStep';
import Confirmation from './steps/Confirmation';

type Customer = { firstName: string; lastName: string; email: string; phone: string };

type Draft = {
    serviceTypeId?: string;
    preferredArtistId: string;
    preferredStartsAt?: string;
    bodyRegions: BodyRegionCode[];
    sizeCm?: number;
    description: string;
    imageIds: string[];
    customer: Customer;
    acceptsTerms: boolean;
};

const EMPTY: Draft = {
    preferredArtistId: 'any',
    bodyRegions: [],
    description: '',
    imageIds: [],
    customer: { firstName: '', lastName: '', email: '', phone: '' },
    acceptsTerms: false,
};

const DRAFT_KEY = 'tattoo.draft';

const loadDraft = (): Draft => {
    try {
        const raw = localStorage.getItem(DRAFT_KEY);
        return raw ? { ...EMPTY, ...(JSON.parse(raw) as Partial<Draft>) } : EMPTY;
    } catch {
        return EMPTY;
    }
};

const dateTime = new Intl.DateTimeFormat('de-DE', {
    weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
});

const Wizard = () => {
    const [step, setStep] = useState(0);
    const [draft, setDraft] = useState<Draft>(loadDraft);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string>();
    const [reference, setReference] = useState<string>();

    useEffect(() => {
        try {
            localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
        } catch {
            /* ignore */
        }
    }, [draft]);

    const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));

    if (reference) return <Confirmation reference={reference} />;

    const submit = async () => {
        setError(undefined);
        const payload: CreateInquiry = {
            serviceTypeId: draft.serviceTypeId ?? '',
            preferredArtistId: draft.preferredArtistId,
            preferredStartsAt: draft.preferredStartsAt,
            bodyRegions: draft.bodyRegions,
            sizeCm: draft.sizeCm,
            description: draft.description,
            referenceImageIds: draft.imageIds,
            customer: draft.customer,
            acceptsTerms: true,
        };
        const parsed = createInquirySchema.safeParse(payload);
        if (!parsed.success) {
            setError('Bitte prüfe deine Angaben — etwas fehlt oder ist ungültig.');
            return;
        }
        setSubmitting(true);
        try {
            const res = await createInquiry(parsed.data);
            localStorage.removeItem(DRAFT_KEY);
            setReference(res.reference);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Absenden fehlgeschlagen.');
        } finally {
            setSubmitting(false);
        }
    };

    const next = () => setStep((s) => Math.min(s + 1, 3));
    const canLeaveMotif = draft.bodyRegions.length > 0;

    return (
        <main className="booking-page">
            {step === 0 && (
                <>
                    <ServiceStep value={draft.serviceTypeId} onSelect={(id) => set({ serviceTypeId: id })} />
                    <button type="button" disabled={!draft.serviceTypeId} onClick={next}>Weiter</button>
                </>
            )}
            {step === 1 && draft.serviceTypeId && (
                <>
                    <TimeStep
                        serviceTypeId={draft.serviceTypeId}
                        value={draft.preferredStartsAt}
                        onSelect={(startsAt, artistId) =>
                            set({ preferredStartsAt: startsAt, preferredArtistId: artistId })
                        }
                    />
                    <button type="button" onClick={next}>Weiter</button>
                </>
            )}
            {step === 2 && (
                <>
                    <MotifStep
                        regions={draft.bodyRegions}
                        onRegions={(r) => set({ bodyRegions: r })}
                        sizeCm={draft.sizeCm}
                        onSizeCm={(v) => set({ sizeCm: v })}
                        description={draft.description}
                        onDescription={(v) => set({ description: v })}
                        imageIds={draft.imageIds}
                        onImageIds={(ids) => set({ imageIds: ids })}
                    />
                    {!canLeaveMotif && <p className="error">Bitte wähle mindestens eine Körperstelle.</p>}
                    <button type="button" disabled={!canLeaveMotif} onClick={next}>Weiter</button>
                </>
            )}
            {step === 3 && (
                <ContactStep
                    customer={draft.customer}
                    onCustomer={(c) => set({ customer: c })}
                    acceptsTerms={draft.acceptsTerms}
                    onAcceptsTerms={(v) => set({ acceptsTerms: v })}
                    summary={{
                        serviceName: draft.serviceTypeId ?? '',
                        when: draft.preferredStartsAt ? dateTime.format(new Date(draft.preferredStartsAt)) : null,
                    }}
                    onSubmit={() => {
                        if (draft.acceptsTerms) void submit();
                    }}
                    submitting={submitting}
                    error={error}
                />
            )}
        </main>
    );
};

export default Wizard;
```

> Die Step-„Weiter"-Buttons tragen den zugänglichen Namen „Weiter" — die Tests suchen `name: /weiter/i`. `ServiceStep`/`TimeStep`/`MotifStep` haben je genau **einen** solchen Button pro Schritt.

- [ ] **Step 4: `components/App.tsx` anpassen**

```tsx
// apps/web/src/components/App.tsx
import React from 'react';
import Wizard from '../wizard/Wizard';
import './app.css';

const App = () => <Wizard />;

export default App;
```

> `components/App.tsx` wird nur noch von nichts direkt gebraucht (Task 20 rendert `Wizard` direkt in `index.tsx`). Prüfen, ob `App.tsx` noch importiert wird; falls nein, löschen und `app.css` in `index.tsx` importieren (Task 20 tut das bereits). In dem Fall: `git rm apps/web/src/components/App.tsx`.

- [ ] **Step 5: Legacy-Web löschen**

```bash
git rm apps/web/src/components/BookingFlow.tsx apps/web/src/components/BookingFlow.test.tsx apps/web/src/api/bookingApi.ts
```

- [ ] **Step 6: Run tests + build**

Run: `cd apps/web && npx vitest run`
Expected: alle Web-Tests grün.

Run: `npm run check-types --workspace @tattoo-studio/web`
Expected: PASS (Wizard existiert jetzt, Legacy-Importe weg).

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/wizard/Wizard.tsx apps/web/src/components/App.tsx apps/web/src/wizard/Wizard.test.tsx
git commit -m "feat(web): Wizard-Orchestrierung; alten BookingFlow entfernt"
```

---

### Task 26: Studio-Entry-Point + Token-Gate

**Files:**
- Create: `apps/web/src/studio.tsx`, `apps/web/src/studio.html`, `apps/web/src/studio/api/studioApi.ts`, `apps/web/src/studio/StudioApp.tsx`
- Modify: `apps/web/toolkit.config.ts`
- Test: `apps/web/src/studio/StudioApp.test.tsx`

**Interfaces:**
- Consumes: `inquiryListItemSchema`, `inquiryDetailSchema` (Contract)
- Produces:
  - `studioApi.ts`: `getStudioToken()/setStudioToken(t)/clearStudioToken()` (`localStorage['tattoo.studioToken']`); `listInquiries(status?)`, `getInquiry(id)`, `accept(id, studioNote?)`, `needsInfo(id, message)`, `decline(id, reason)`, `fetchImageObjectUrl(url)` — alle mit `Authorization: Bearer <token>`; wirft `UnauthorizedError` bei `401`
  - `StudioApp.tsx`: kein Token oder letzter Call `401` → Zugangscode-Formular (`setStudioToken`); sonst `InquiryList` ⇄ `InquiryDetail` (State `selectedId`)

- [ ] **Step 1: Failing test**

```tsx
// apps/web/src/studio/StudioApp.test.tsx
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('./api/studioApi', async () => {
    const actual = await vi.importActual<typeof import('./api/studioApi')>('./api/studioApi');
    return { ...actual, listInquiries: vi.fn().mockResolvedValue([]) };
});
import { getStudioToken } from './api/studioApi';
import StudioApp from './StudioApp';

const wrap = () => {
    const c = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(<QueryClientProvider client={c}><StudioApp /></QueryClientProvider>);
};

beforeEach(() => localStorage.clear());
afterEach(() => vi.clearAllMocks());

it('shows the access-code form until a token is set', async () => {
    wrap();
    expect(screen.getByLabelText(/Zugangscode/i)).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/Zugangscode/i), { target: { value: 'secret' } });
    fireEvent.click(screen.getByRole('button', { name: /anmelden/i }));
    expect(getStudioToken()).toBe('secret');
    expect(await screen.findByText(/Keine Anfragen/i)).toBeTruthy();
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `cd apps/web && npx vitest run src/studio/StudioApp.test.tsx`
Expected: FAIL.

- [ ] **Step 3: `studioApi.ts` schreiben**

```ts
// apps/web/src/studio/api/studioApi.ts
import {
    inquiryDetailSchema,
    inquiryListItemSchema,
    type InquiryDetail,
    type InquiryListItem,
} from '@tattoo-studio/contracts';
import { z } from 'zod';

const BASE = (process.env.PUBLIC_BOOKING_API_URL || 'http://localhost:3000').replace(/\/$/, '');
const KEY = 'tattoo.studioToken';

export class UnauthorizedError extends Error {}

export const getStudioToken = () => localStorage.getItem(KEY);
export const setStudioToken = (t: string) => localStorage.setItem(KEY, t);
export const clearStudioToken = () => localStorage.removeItem(KEY);

const call = async (path: string, init?: RequestInit) => {
    const token = getStudioToken();
    const res = await fetch(`${BASE}${path}`, {
        ...init,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token ?? ''}`, ...init?.headers },
    });
    if (res.status === 401) {
        clearStudioToken();
        throw new UnauthorizedError('Zugangscode ungültig.');
    }
    const body: unknown = res.status === 204 ? null : await res.json();
    if (!res.ok) {
        throw new Error(
            typeof body === 'object' && body && 'message' in body
                ? String((body as { message: unknown }).message)
                : 'Aktion fehlgeschlagen.',
        );
    }
    return body;
};

export const listInquiries = async (status?: string): Promise<InquiryListItem[]> => {
    const q = status ? `?status=${encodeURIComponent(status)}` : '';
    return z.array(inquiryListItemSchema).parse(await call(`/v1/admin/inquiries${q}`));
};

export const getInquiry = async (id: string): Promise<InquiryDetail> =>
    inquiryDetailSchema.parse(await call(`/v1/admin/inquiries/${id}`));

export const accept = (id: string, studioNote?: string) =>
    call(`/v1/admin/inquiries/${id}/accept`, { method: 'POST', body: JSON.stringify({ studioNote }) });
export const needsInfo = (id: string, message: string) =>
    call(`/v1/admin/inquiries/${id}/needs-info`, { method: 'POST', body: JSON.stringify({ message }) });
export const decline = (id: string, reason: string) =>
    call(`/v1/admin/inquiries/${id}/decline`, { method: 'POST', body: JSON.stringify({ reason }) });

export const fetchImageObjectUrl = async (url: string): Promise<string> => {
    const res = await fetch(`${BASE}${url}`, { headers: { Authorization: `Bearer ${getStudioToken() ?? ''}` } });
    if (!res.ok) throw new Error('Bild konnte nicht geladen werden.');
    return URL.createObjectURL(await res.blob());
};
```

- [ ] **Step 4: `StudioApp.tsx` schreiben**

```tsx
// apps/web/src/studio/StudioApp.tsx
import React, { useState } from 'react';
import { getStudioToken, setStudioToken } from './api/studioApi';
import InquiryList from './InquiryList';
import InquiryDetail from './InquiryDetail';

const StudioApp = () => {
    const [hasToken, setHasToken] = useState(Boolean(getStudioToken()));
    const [code, setCode] = useState('');
    const [selectedId, setSelectedId] = useState<string>();

    if (!hasToken) {
        return (
            <main className="studio">
                <h1>Studio</h1>
                <label>
                    Zugangscode
                    <input type="password" value={code} onChange={(e) => setCode(e.target.value)} />
                </label>
                <button
                    type="button"
                    onClick={() => {
                        if (code) {
                            setStudioToken(code);
                            setHasToken(true);
                        }
                    }}
                >
                    Anmelden
                </button>
            </main>
        );
    }

    return (
        <main className="studio">
            {selectedId ? (
                <InquiryDetail id={selectedId} onBack={() => setSelectedId(undefined)} onExpired={() => setHasToken(false)} />
            ) : (
                <InquiryList onOpen={setSelectedId} onExpired={() => setHasToken(false)} />
            )}
        </main>
    );
};

export default StudioApp;
```

- [ ] **Step 5: Entry-Point + HTML + Toolkit-Config**

```tsx
// apps/web/src/studio.tsx
import React from 'react';
import { createRoot } from 'react-dom/client';
import AppWrapper from './shared/AppWrapper';
import StudioApp from './studio/StudioApp';
import './components/app.css';

const root = createRoot(document.querySelector('#root') as Element);
root.render(
    <AppWrapper>
        <StudioApp />
    </AppWrapper>,
);
```

```html
<!-- apps/web/src/studio.html -->
<!DOCTYPE html>
<html lang="de">
    <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <%= CHAYNS_TOOLKIT_CSS_TAG %>
        <title>Tattoo-Anfragen — Studio</title>
    </head>
    <body>
        <div id="root"></div>
    </body>
</html>
```

`apps/web/toolkit.config.ts` — im `output.entryPoints` ergänzen:

```ts
            studio: {
                pathIndex: './src/studio',
                pathHtml: './src/studio.html',
            },
```

- [ ] **Step 6: Run test, verify it passes**

Run: `cd apps/web && npx vitest run src/studio/StudioApp.test.tsx`
Expected: PASS. (`InquiryList`/`InquiryDetail` existieren erst nach Task 27 — bis dahin schlägt der Import fehl. Wenn ein grüner Zwischenstand nötig ist: Tasks 26 + 27 zusammen ausführen; der `StudioApp`-Test mockt `listInquiries`, sodass er nach Task 27 grün ist.)

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/studio.tsx apps/web/src/studio.html apps/web/src/studio/api/studioApi.ts apps/web/src/studio/StudioApp.tsx apps/web/toolkit.config.ts apps/web/src/studio/StudioApp.test.tsx
git commit -m "feat(web): Studio-Entry-Point mit Token-Gate"
```

---

### Task 27: Studio — Liste und Detail

**Files:**
- Create: `apps/web/src/studio/InquiryList.tsx`, `apps/web/src/studio/InquiryDetail.tsx`
- Test: `apps/web/src/studio/InquiryDetail.test.tsx`

**Interfaces:**
- Consumes: `studioApi` (Task 26), `BodyRegionPicker` (Task 21)
- Produces:
  - `InquiryList: React.FC<{ onOpen: (id: string) => void; onExpired: () => void }>` — `useQuery` auf `listInquiries(status)`, Status-Filter-Chips, Karten mit Kundenname/Service/Wunschtermin/Alter, Klick → `onOpen`; „Ablehnen"-Schnellaktion für `NEW`; `UnauthorizedError` → `onExpired()`
  - `InquiryDetail: React.FC<{ id: string; onBack: () => void; onExpired: () => void }>` — `useQuery` auf `getInquiry(id)`; `BodyRegionPicker mode="view"`; Bildergalerie über `fetchImageObjectUrl`; Aktionsleiste Annehmen/Rückfrage/Ablehnen (Prompt bzw. Textfeld für die Pflichttexte) → nach Erfolg `onBack()`

- [ ] **Step 1: Failing test**

```tsx
// apps/web/src/studio/InquiryDetail.test.tsx
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

vi.mock('./api/studioApi', () => ({
    getInquiry: vi.fn(),
    accept: vi.fn().mockResolvedValue(undefined),
    needsInfo: vi.fn(),
    decline: vi.fn(),
    fetchImageObjectUrl: vi.fn().mockResolvedValue('blob:img'),
    UnauthorizedError: class extends Error {},
}));
import { accept, getInquiry } from './api/studioApi';
import InquiryDetail from './InquiryDetail';

const detail = {
    id: 'abc', status: 'IN_REVIEW', serviceTypeId: 'small-tattoo', serviceTypeName: 'Kleines Tattoo',
    preferredArtistId: null, preferredStartsAt: null, customerName: 'Ann Roe', sizeCm: 12,
    regionCount: 1, imageCount: 1, createdAt: '2026-08-29T10:00:00.000Z', description: 'florales Motiv',
    bodyRegions: ['front.chest'], customer: { firstName: 'Ann', lastName: 'Roe', email: 'a@b.de', phone: '1' },
    chaynsPersonId: null, images: [{ id: 'img1', url: '/v1/uploads/img1', width: 10, height: 10 }],
    studioNote: null, needsInfoMessage: null, declineReason: null, acceptedTermsAt: '2026-08-29T09:00:00.000Z',
};

const wrap = (ui: React.ReactNode) => {
    const c = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(<QueryClientProvider client={c}>{ui}</QueryClientProvider>);
};

afterEach(() => vi.clearAllMocks());

it('shows regions and images, and accepts', async () => {
    (getInquiry as ReturnType<typeof vi.fn>).mockResolvedValue(detail);
    const onBack = vi.fn();
    wrap(<InquiryDetail id="abc" onBack={onBack} onExpired={() => {}} />);

    expect(await screen.findByText('Brust')).toBeTruthy();          // Region-Chip (view mode)
    await waitFor(() => expect(screen.getByRole('img', { name: /referenz/i })).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: /annehmen/i }));
    await waitFor(() => expect(accept).toHaveBeenCalledWith('abc', undefined));
    await waitFor(() => expect(onBack).toHaveBeenCalled());
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `cd apps/web && npx vitest run src/studio/InquiryDetail.test.tsx`
Expected: FAIL.

- [ ] **Step 3: `InquiryList.tsx` schreiben**

```tsx
// apps/web/src/studio/InquiryList.tsx
import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { decline, listInquiries, UnauthorizedError } from './api/studioApi';

const STATUSES = ['NEW', 'IN_REVIEW', 'NEEDS_INFO', 'ACCEPTED', 'DECLINED'] as const;
const rel = new Intl.RelativeTimeFormat('de', { numeric: 'auto' });

const ageLabel = (iso: string) => {
    const h = Math.round((Date.now() - new Date(iso).getTime()) / 3_600_000);
    return h < 24 ? rel.format(-h, 'hour') : rel.format(-Math.round(h / 24), 'day');
};

const InquiryList = ({
    onOpen,
    onExpired,
}: {
    onOpen: (id: string) => void;
    onExpired: () => void;
}) => {
    const [status, setStatus] = useState<string>();
    const qc = useQueryClient();
    const q = useQuery({
        queryKey: ['inquiries', status],
        queryFn: () => listInquiries(status),
    });

    if (q.error instanceof UnauthorizedError) onExpired();

    return (
        <div>
            <h1>Anfragen</h1>
            <div className="status-filter">
                <button type="button" onClick={() => setStatus(undefined)} aria-pressed={!status}>Alle</button>
                {STATUSES.map((s) => (
                    <button key={s} type="button" onClick={() => setStatus(s)} aria-pressed={status === s}>{s}</button>
                ))}
            </div>
            {q.isPending && <p>Lade …</p>}
            {q.data?.length === 0 && <p>Keine Anfragen.</p>}
            <ul className="inquiry-list">
                {q.data?.map((i) => (
                    <li key={i.id}>
                        <button type="button" onClick={() => onOpen(i.id)}>
                            <strong>{i.customerName}</strong>
                            <span>{i.serviceTypeName}</span>
                            <span>{i.status}</span>
                            <span>{ageLabel(i.createdAt)}</span>
                        </button>
                        {i.status === 'NEW' && (
                            <button
                                type="button"
                                onClick={async () => {
                                    const reason = window.prompt('Grund für die Ablehnung?');
                                    if (reason) {
                                        await decline(i.id, reason);
                                        void qc.invalidateQueries({ queryKey: ['inquiries'] });
                                    }
                                }}
                            >
                                Ablehnen
                            </button>
                        )}
                    </li>
                ))}
            </ul>
        </div>
    );
};

export default InquiryList;
```

- [ ] **Step 4: `InquiryDetail.tsx` schreiben**

```tsx
// apps/web/src/studio/InquiryDetail.tsx
import React, { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import BodyRegionPicker from '../shared/BodyRegionPicker';
import {
    accept,
    decline,
    fetchImageObjectUrl,
    getInquiry,
    needsInfo,
    UnauthorizedError,
} from './api/studioApi';

const InquiryDetail = ({
    id,
    onBack,
    onExpired,
}: {
    id: string;
    onBack: () => void;
    onExpired: () => void;
}) => {
    const q = useQuery({ queryKey: ['inquiry', id], queryFn: () => getInquiry(id) });
    const [imageUrls, setImageUrls] = useState<Record<string, string>>({});
    const [busy, setBusy] = useState(false);

    if (q.error instanceof UnauthorizedError) onExpired();

    useEffect(() => {
        if (!q.data) return;
        let alive = true;
        Promise.all(
            q.data.images.map(async (img) => [img.id, await fetchImageObjectUrl(img.url)] as const),
        ).then((pairs) => {
            if (alive) setImageUrls(Object.fromEntries(pairs));
        });
        return () => {
            alive = false;
        };
    }, [q.data]);

    if (q.isPending) return <p>Lade …</p>;
    if (!q.data) return <p>Nicht gefunden.</p>;
    const inq = q.data;

    const run = async (fn: () => Promise<unknown>) => {
        setBusy(true);
        try {
            await fn();
            onBack();
        } finally {
            setBusy(false);
        }
    };

    return (
        <article>
            <button type="button" onClick={onBack}>← Zurück</button>
            <h1>{inq.customerName} · {inq.serviceTypeName}</h1>
            <p>{inq.status} · {inq.sizeCm ? `${inq.sizeCm} cm` : 'Größe offen'}</p>
            <BodyRegionPicker mode="view" value={inq.bodyRegions} />
            <p>{inq.description || 'Keine Beschreibung.'}</p>
            <div className="gallery">
                {inq.images.map((img) =>
                    imageUrls[img.id] ? (
                        <img key={img.id} src={imageUrls[img.id]} alt={`Referenzbild ${img.id}`} />
                    ) : (
                        <span key={img.id}>Lade Bild …</span>
                    ),
                )}
            </div>
            <dl>
                <dt>E-Mail</dt><dd>{inq.customer.email}</dd>
                <dt>Telefon</dt><dd>{inq.customer.phone}</dd>
                <dt>Einwilligung</dt><dd>{new Date(inq.acceptedTermsAt).toLocaleString('de-DE')}</dd>
            </dl>
            <div className="actions">
                <button type="button" disabled={busy} onClick={() => run(() => accept(id))}>Annehmen</button>
                <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                        const m = window.prompt('Welche Info fehlt?');
                        if (m) void run(() => needsInfo(id, m));
                    }}
                >
                    Rückfrage
                </button>
                <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                        const r = window.prompt('Grund für die Ablehnung?');
                        if (r) void run(() => decline(id, r));
                    }}
                >
                    Ablehnen
                </button>
            </div>
        </article>
    );
};

export default InquiryDetail;
```

- [ ] **Step 5: Run tests**

Run: `cd apps/web && npx vitest run src/studio`
Expected: `StudioApp` + `InquiryDetail` grün.

Run: `cd apps/web && npx vitest run && npm run check-types --workspace @tattoo-studio/web`
Expected: alle Web-Tests + `check-types` grün.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/studio/InquiryList.tsx apps/web/src/studio/InquiryDetail.tsx apps/web/src/studio/InquiryDetail.test.tsx
git commit -m "feat(web): Studio-Anfrageliste und -Detail mit Aktionen"
```

---

### Task 28: Doku, compose, Gesamtlauf, Smoke-Test

**Files:**
- Modify: `CLAUDE.md`, `compose.yaml`, `apps/web/src/components/app.css`
- Test: voller Lauf.

- [ ] **Step 1: `app.css` erweitern** — Klassen der neuen Komponenten stylen: `.body-picker`, `.body-figure`, `.body-figure__region`, `.body-figure__region.is-selected`, `.reference-uploader`, `.status-filter`, `.inquiry-list`, `.gallery`, `.studio`, `.service-list`, `.slot-grid`, `.form-grid`, `.request-summary`, `.success-card`. Bestehende Farb-/Typo-Variablen wiederverwenden. Mindestens: Figur-Regionen `fill: transparent; stroke: transparent` und `:hover`/`.is-selected` sichtbar; klebende `.request-summary` unten.

- [ ] **Step 2: `compose.yaml` — Uploads-Volume**

```yaml
services:
    postgres:
        # … unverändert …
    api:
        # nur relevant, falls die API containerisiert läuft; sonst als Doku-Anker:
        # volumes:
        #   - tattoo_uploads:/app/apps/api/var/uploads

volumes:
    tattoo_postgres_data:
    tattoo_uploads:
```

> Läuft die API in Dev nur über `tsx` (kein Container), ist `UPLOADS_DIR=apps/api/var/uploads` (lokal, gitignored) ausreichend; das Volume ist für die spätere containerisierte Ausbringung vorbereitet.

- [ ] **Step 3: `CLAUDE.md` aktualisieren**
  - *Commands*: `npm run dev` startet zusätzlich den Worker (bereits von Spec B); Studio-UI unter `/studio.html`.
  - *Architecture › `apps/api`*: neue Tabellen `inquiry` / `inquiry_region` / `media_asset`; `/v1/inquiries`, `/v1/uploads`, `/v1/service-types`, `/v1/admin/inquiries*`; Bildspeicher `UPLOADS_DIR` (privat, hinter der API); Worker-Job `runPurgeOrphanUploadsJob`. Legacy `/api/v1/*`, `booking_request`, `catalog.ts`, `availability.ts`, `repository.ts` **entfernt**.
  - *Architecture › `apps/web`*: zwei Entry-Points (`index` Kunden-Wizard, `studio` Studio-Ansicht `/studio.html`); geteilter `BodyRegionPicker`; `AppWrapper` in `src/shared/`. `BookingFlow` entfernt.
  - *Conventions*: Wizard-Absende-Validierung über `createInquirySchema.safeParse` (nicht RHF-Resolver).
  - Hinweis: die Körper-Illustration ist ein Platzhalter-Piktogramm; die finale Grafik ist eine offene Aufgabe (Spec §13).
  - Limitierung: Studio-Zugang über `ADMIN_API_TOKEN` im `localStorage` (MVP-Provisorium).

- [ ] **Step 4: Gesamtlauf**

```bash
npm run db:up
npm run check-types
npm test
```

Expected: alle Workspaces grün.

- [ ] **Step 5: Web-Lint**

Run: `npm run lint --workspace @tattoo-studio/web`
Expected: keine **neuen** Fehler (der vorbestehende `no-explicit-any` in `src/types/global.d.ts` bleibt, sofern nicht ohnehin angefasst).

- [ ] **Step 6: Manueller Smoke-Test**

```
$env:DATABASE_URL='postgresql://tattoo:tattoo-local@localhost:5432/tattoo_studio'
$env:ADMIN_API_TOKEN='local-dev'
npm run db:migrate     # 003 anwenden (Dev-DB ggf. vorher DROP/CREATE, s. Task 19)
npm run dev
```

- Wizard (`http://localhost:8080/`): Service wählen → Weiter → „Kein Wunschtermin" → Weiter → Region(en) auf der Figur + Größe + zwei Fotos → Weiter → Kontakt + Einwilligung → Absenden → Referenznummer. `localStorage['tattoo.draft']` ist nach dem Absenden weg.
- Studio (`http://localhost:8080/studio.html`): Zugangscode `local-dev` → Anfrage in der Liste → Detail zeigt Regionen auf der Figur + Bilder → „Annehmen" → Status `ACCEPTED`; in der DB liegt `outbox_event` `inquiry.accepted`.
- Worker-Log zeigt ggf. „verwaiste Upload(s) entfernt", wenn ein nicht abgesendeter Upload älter als `ORPHAN_UPLOAD_TTL_HOURS` ist (zum Test `media_asset.created_at` künstlich zurücksetzen).
- Testdaten aus der Dev-DB löschen.

- [ ] **Step 7: Commit**

```bash
git add CLAUDE.md compose.yaml apps/web/src/components/app.css
git commit -m "docs: Anfrage-Wizard, Uploads und Studio-Ansicht dokumentiert; Styles"
```

---

## Self-Review (durchgeführt)

**1. Spec-Abdeckung**

| Spec-Abschnitt | Task(s) |
|---|---|
| §2 Datenmodell (`inquiry`, `inquiry_region`, `media_asset`, `003`, Legacy-Drop) | 4 |
| §2.4 Statusautomat | 5 (Guard), erzwungen in 14 |
| §3 Upload-Speicher | 9, 11 |
| §4 Konfiguration | 1 |
| §5 Contracts | 2 (Regionen), 3 (Inquiry/Upload/Admin/Errors) |
| §6.1 `GET /v1/service-types` | 12 |
| §6.1 `POST/GET /v1/uploads` | 11 (Service), 12 (Routen) |
| §6.1 `POST /v1/inquiries` | 13 |
| §6.1 `GET/POST /v1/admin/inquiries*` | 14 (Service), 15 (Routen) |
| §6.2 Bilder-Auslieferung (Bearer, Blob im Studio) | 12 (GET), 27 (`fetchImageObjectUrl`) |
| §6.3 Bausteine | 5–16 |
| §6.5 `app.ts` / `server.ts` / `/health` | 12, 13, 15, 17 |
| §7.1 Region-Codes ↔ SVG ↔ Label | 2, 21 |
| §7.2 Kunden-Wizard (4 Schritte, manuelle Validierung, Draft) | 20–25 |
| §7.3 Studio-Ansicht (Entry-Point, Token-Gate, Liste, Detail) | 26, 27 |
| §7.4 geteilte `BodyRegionPicker` / `AppWrapper` | 20, 21 |
| §8 Fehlercodes | 3, angewandt in 12/13/15 |
| §9 Teststrategie | jeweils Step 1 der Tasks + 19 + 28 |
| §10 Risiken (HEIC, sharp, Token-Gate) | 10, 11, 26; Doku in 28 |
| §11 Legacy-Abbau | 17 (API), 18 (Contracts), 20/25 (Web) |
| §12 Definition of Done | 19, 28 |
| §13 Illustrations-Aufgabe | in 21 + 28 als Platzhalter markiert; bleibt offene Nicht-Code-Aufgabe |
| §14 Entscheidungen | im ganzen Plan umgesetzt |

Lücken: keine offenen Code-Anforderungen. §13 (professionelle Illustration) ist bewusst kein Code-Task — der Platzhalter ist funktional, die finale Grafik wird separat beschafft.

**2. Platzhalter-Scan:** keine `TODO`/`TBD`; jeder Code-Step enthält realen Code. Zwei Stellen mit „das Muster fortsetzen" (Task 21 `bodyFigure` für alle 34 Regionen, Task 28 `app.css`) sind bewusst gekürzt — Struktur und Beispiele sind vollständig, die Wiederholung ist mechanisch.

**3. Typ-Konsistenz:** `AppConfig` (Task 1) in allen Route-Tests identisch. `UploadsStorage` (Task 9) ↔ `storeUpload`/`runPurgeOrphanUploadsJob`. `MediaAssetRow` (Task 7) ↔ `inquiries.ts`/`admin-inquiry-service.ts`. `InquiryStatus` (Task 4) ↔ `inquiry-status.ts` (Task 5) ↔ `transitionInquiry` (Task 8). `createInquirySchema`/`CreateInquiry` (Task 3) ↔ `inquiry-service.ts` (Task 13) ↔ `inquiryApi.ts` (Task 22) ↔ `Wizard.tsx` (Task 25). `InquiryDetail`/`InquiryListItem` (Task 3) ↔ `admin-inquiry-service.ts` (Task 14) ↔ `studioApi.ts` (Task 26). `bodyRegionCodeSchema`/`bodyRegionLabels` (Task 2) ↔ `bodyFigure.tsx`/`BodyRegionPicker.tsx` (Task 21).

## Offene Annahmen — Entscheidungen im Plan

- Region-Codes: 35, `front.`/`back.`-Namespace, `.left`/`.right` aus Sicht der Kundin.
- HEIC → JPEG serverseitig; ohne `libheif` sauberer 400 statt 500.
- Upload: direkter multipart-POST, kein Presign.
- Studio-Zugang: `ADMIN_API_TOKEN` im `localStorage` (MVP).
- Wizard-Validierung: manuelles `createInquirySchema.safeParse` beim Absenden.
- Draft: nur `localStorage`, ohne `File`-Objekte.
- `check-types`/`build`-Zwischenstände: Tasks 4→19 (API) und 20→27 (Web) sind je eine Einheit; grün am Ende der Einheit. Alternative Reihenfolgen sind in den betroffenen Tasks vermerkt.
