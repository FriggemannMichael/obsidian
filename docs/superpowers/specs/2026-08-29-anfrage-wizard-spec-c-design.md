# Spec C — Anfrage-Wizard, Referenz-Uploads & Studio-Ansicht

> Stand: 2026-08-29
> Status: Design freigegeben, bereit für Implementierungsplan
> Fachliche Grundlage: `.idea/VORKONZEPT_TATTOO_STUDIO_CHAYNS.md`, `.idea/ARCHITEKTUR_UND_UMSETZUNG.md`
> Teil der Zerlegung: **A** Marketing-Site · **B** Kalenderkern · **B2** chayns-Shop & Anzahlung · **C** Anfrage-Wizard & Uploads *(dieses Dokument)* · **D** Benachrichtigung

## 1. Ziel und Abgrenzung

Spec C ersetzt den Wegwerf-MVP-Buchungspfad durch die echte **Tattoo-Anfrage**: ein strukturiertes
Anfrage-Modell mit visueller Körperauswahl statt Freitext-Körperstelle, privaten Referenzbild-Uploads,
und einer minimalen Studio-Ansicht, über die das Studio eingehende Anfragen prüft, annimmt, mit einer
Rückfrage zurückstellt oder ablehnt. Die Anfrage ist **keine** Terminbuchung — der gewählte Zeitpunkt
ist ein unverbindlicher Wunsch; die eigentliche Terminvergabe über den Kalenderkern (Spec B) ist eine
spätere Spec.

### 1.1 In Scope

- Anfrage-Datenmodell in PostgreSQL (`inquiry`, `inquiry_region`, `media_asset`); Migration `003`
- Öffentliche Endpunkte: `GET /v1/service-types`, `POST /v1/uploads`, `GET /v1/uploads/{id}`,
  `POST /v1/inquiries`
- Studio-Endpunkte (Bearer): `GET /v1/admin/inquiries`, `GET /v1/admin/inquiries/{id}`,
  `POST /v1/admin/inquiries/{id}/accept|needs-info|decline`
- Kunden-Wizard (`apps/web`, ersetzt `BookingFlow`): 4 Schritte (Art · Zeit · Motiv · Kontakt)
- `BodyRegionPicker` — Vorder-/Rück-SVG-Figur, ~35 klickbare Regionen, Mehrfachauswahl; geteilt
  zwischen Wizard (Bearbeiten) und Studio (Ansicht)
- `ReferenceUploader` — Hintergrund-Upload mit lokaler Vorschau, Fortschritt, Retry, Entfernen
- Studio-Ansicht (`apps/web`, zweiter Entry-Point `/studio.html`): Liste + Detail + drei Aktionen,
  Token-Gate
- Serverseitige Upload-Validierung (Typ, Größe, Anzahl), HEIC/HEIF → JPEG (`sharp`)
- Worker-Job `runPurgeOrphanUploadsJob` für nicht-referenzierte Uploads
- `outbox_event` + `audit_event` bei Anlage und jedem Statuswechsel (Zustellung ist Spec D)
- Zod-Contracts in `packages/contracts`
- Automatisierte Tests inkl. Postgres-Integration, Wizard-Flow, Upload-Grenzen, Statusautomat

### 1.2 Explizit nicht in Scope

| Thema | Gehört zu |
|---|---|
| Terminvergabe / Hold / `appointment_block` nach Annahme einer Anfrage | spätere Spec (nutzt Spec B) |
| chayns-Shop-Checkout, Anzahlung, `PAID → CONFIRMED` | Spec B2 |
| Zustellung von E-Mail / chayns-Nachricht (Rückfrage, Ablehnung, Eingangsbestätigung) | Spec D (C schreibt nur `outbox_event`) |
| Kundinnen-Rückkanal auf `NEEDS_INFO` (Infos nachreichen, erneuter Upload) | spätere Spec — Studio schiebt manuell auf `IN_REVIEW` zurück |
| Echte Studio-Authentifizierung / Rollen / chayns-Admin-Gruppen-Check | spätere Spec (Token-Gate ist MVP-Provisorium) |
| Geräteübergreifendes Weitermachen des Wizards (server-seitiger Draft) | spätere Spec (nur `localStorage`-Draft) |
| „Alte Anfrage später ansehen" für die Kundin, Kundinnen-Projektübersicht | spätere Spec |
| Cover-up-Vorher-Fotos als eigene Datenklasse, Gesundheitsangaben | spätere Spec |
| Öffentliche Marketing-Seiten, Portfolio, Flash-Katalog | Spec A |
| Studio-Kanban / Pipeline-Board / Kalenderansicht / Angebots-Versionierung | spätere Spec |

### 1.3 Kontext im bestehenden Repo

- Spec B hat `/v1/availability`, `/v1/slot-holds`, `/v1/admin/holds/*`, den Kalender-Schema-Kern
  (`001`/`002`), die Schichtung `src/domain` · `src/repositories` · `src/services` · `src/routes` ·
  `src/plugins`, `config.ts` (`loadConfig` → `AppConfig`), das `@fastify/rate-limit`-Plugin, das
  `admin-auth`-Bearer-Plugin, den Worker (`worker.ts` + `jobs/expire-holds.ts`), und die
  Repositories `idempotency.ts` / `outbox.ts` / `audit.ts` / `reference.ts` / `holds.ts` gebaut.
- Der alte MVP-Pfad läuft weiter über `/api/v1/service-types`, die synthetische
  `src/availability.ts`, `/api/v1/booking-requests`, `src/catalog.ts`, `src/repository.ts`, die
  `legacy*`-Contracts und `apps/web/src/components/BookingFlow.tsx`. **All das wird von Spec C
  entfernt** (§13).
- `apps/web` wird mit `chayns-toolkit` gebaut; `toolkit.config.ts` erlaubt mehrere `entryPoints`.
- `customer` (Spec B) wird wiederverwendet; `upsertCustomer` wandert von `repositories/holds.ts`
  nach `repositories/customer.ts`.

## 2. Datenmodell (PostgreSQL) — Migration `003_inquiries_and_media.sql`

Konventionen wie im Kalenderschema: `timestamptz` in UTC, `uuid` für Transaktionsdaten,
CHECK-Constraints, `created_at` / `updated_at`. `003` legt die drei Tabellen an **und** droppt die
Legacy-Tabelle `booking_request` (`DROP TABLE IF EXISTS booking_request;`).

### 2.1 `inquiry`

| Feld | Typ | Anmerkung |
|---|---|---|
| `id` | `uuid PRIMARY KEY DEFAULT gen_random_uuid()` | |
| `service_type_id` | `text NOT NULL REFERENCES service_type(id)` | |
| `preferred_artist_id` | `text REFERENCES artist(id)` | NULL = „egal" |
| `preferred_starts_at` | `timestamptz` | Wunsch-Slot, unverbindlich, darf in der Vergangenheit liegen |
| `size_cm` | `integer CHECK (size_cm > 0)` | ungefähre Größe, NULL erlaubt |
| `description` | `text NOT NULL DEFAULT ''` | max. 2000 (Contract-seitig) |
| `status` | `text NOT NULL CHECK (status IN ('NEW','IN_REVIEW','NEEDS_INFO','ACCEPTED','DECLINED'))` | |
| `studio_note` | `text` | intern, nicht an die Kundin |
| `needs_info_message` | `text` | letzte Rückfrage |
| `decline_reason` | `text` | |
| `customer_id` | `uuid NOT NULL REFERENCES customer(id)` | |
| `client_token` | `text NOT NULL` | `X-Client-Token` der Kundin |
| `accepted_terms_at` | `timestamptz NOT NULL` | |
| `created_at` | `timestamptz NOT NULL DEFAULT now()` | |
| `updated_at` | `timestamptz NOT NULL DEFAULT now()` | |

Index: `CREATE INDEX inquiry_status_created_idx ON inquiry (status, created_at DESC);`

### 2.2 `inquiry_region`

```sql
CREATE TABLE inquiry_region (
    inquiry_id  uuid NOT NULL REFERENCES inquiry(id) ON DELETE CASCADE,
    region_code text NOT NULL,
    PRIMARY KEY (inquiry_id, region_code)
);
```

`region_code` ist ein fester enumerierter Satz (§7.1), Contract-seitig validiert. Kein DB-CHECK auf
die Enum-Werte (die Liste lebt im Contract, damit sie ohne Migration wachsen kann).

### 2.3 `media_asset`

| Feld | Typ | Anmerkung |
|---|---|---|
| `id` | `uuid PRIMARY KEY DEFAULT gen_random_uuid()` | |
| `purpose` | `text NOT NULL CHECK (purpose IN ('inquiry_reference'))` | später erweiterbar |
| `inquiry_id` | `uuid REFERENCES inquiry(id) ON DELETE CASCADE` | NULL solange verwaist |
| `storage_key` | `text NOT NULL` | relativ im privaten Volume, z. B. `2026/08/<uuid>.jpg` |
| `content_type` | `text NOT NULL` | normalisiert, nach Konvertierung |
| `original_filename` | `text` | |
| `byte_size` | `integer NOT NULL CHECK (byte_size > 0)` | Größe der gespeicherten (ggf. konvertierten) Datei |
| `width` | `integer` | NULL wenn nicht ermittelbar |
| `height` | `integer` | |
| `client_token` | `text NOT NULL` | wer hochgeladen hat — Verknüpfungs- und Fenster-Prüfung |
| `created_at` | `timestamptz NOT NULL DEFAULT now()` | |
| `linked_at` | `timestamptz` | wann an eine Anfrage gehängt |

Indizes:
`CREATE INDEX media_asset_inquiry_idx ON media_asset (inquiry_id);`
`CREATE INDEX media_asset_orphan_idx ON media_asset (created_at) WHERE inquiry_id IS NULL;`

### 2.4 Statusautomat

```
NEW        ──▶ IN_REVIEW, DECLINED
IN_REVIEW  ──▶ ACCEPTED, NEEDS_INFO, DECLINED
NEEDS_INFO ──▶ IN_REVIEW, ACCEPTED, DECLINED
ACCEPTED   ──▶ (Endzustand in Spec C)
DECLINED   ──▶ (Endzustand)
```

- `GET /v1/admin/inquiries/{id}` bumpt `NEW → IN_REVIEW` als Seiteneffekt (eigene Mini-Transaktion +
  `audit_event`), **bevor** das Detail zurückgegeben wird — die Antwort zeigt bereits `IN_REVIEW`.
- `accept` / `decline` sind aus `IN_REVIEW` **und** `NEEDS_INFO` erlaubt (das Studio hat die Infos
  ggf. telefonisch erhalten); `needs-info` aus `IN_REVIEW`; `decline` zusätzlich direkt aus `NEW`
  (Schnell-Ablehnen aus der Liste). `NEEDS_INFO → IN_REVIEW` schiebt das Studio manuell zurück.
- `ACCEPTED` und `DECLINED` haben keine ausgehenden Übergänge.
- Umgesetzt in `domain/inquiry-status.ts` analog `domain/status.ts`:
  `ALLOWED_TRANSITIONS: Record<InquiryStatus, readonly InquiryStatus[]>`, `canTransition`,
  `assertTransition` (wirft `InquiryInvalidStateError` mit `.from`/`.to`).
- Jeder Statuswechsel schreibt in **einer** DB-Transaktion: `inquiry`-Update + `audit_event`
  (`actor: 'studio'` bzw. `'system'` beim Bump) + `outbox_event`
  (`inquiry.created` / `inquiry.accepted` / `inquiry.needs_info` / `inquiry.declined`).

## 3. Speicher für Uploads

- Privates Verzeichnis, konfiguriert über `UPLOADS_DIR` (Default `apps/api/var/uploads`,
  `.gitignore`-t; in `compose.yaml` ein Named Volume, in den `apps/api` gemountet wird).
- `plugins/uploads-storage.ts` kapselt Pfadauflösung und `read` / `write` / `delete` / `stat`.
  `storage_key` = `<yyyy>/<mm>/<uuid>.<ext>`; die Datei liegt unter `UPLOADS_DIR/<storage_key>`.
- Der Browser erhält nie einen direkten Speicherzugang. Upload läuft ausschließlich über
  `POST /v1/uploads`; Auslieferung ausschließlich über `GET /v1/uploads/{id}` (Bearer).
- Keine signierten URLs, kein Objektspeicher-SDK — bewusste MVP-Vereinfachung gegenüber
  `.idea/ARCHITEKTUR_UND_UMSETZUNG.md §14`; die Sicherheitsgarantie („kein allgemeiner
  Speicherzugang im Browser", „serverseitige Typ-/Größenprüfung") bleibt erfüllt.

## 4. Konfiguration

Ergänzt `AppConfig` / `loadConfig` (`config.ts`) und `.env.example`:

| Variable | Default | Bedeutung |
|---|---|---|
| `UPLOADS_DIR` | `apps/api/var/uploads` | Wurzel des privaten Bildspeichers |
| `MAX_UPLOAD_BYTES` | `10485760` | max. Größe der **eingehenden** Datei bei `POST /v1/uploads` |
| `ORPHAN_UPLOAD_TTL_HOURS` | `24` | Alter, ab dem nicht-referenzierte `media_asset` gelöscht werden |
| `UPLOAD_RATE_LIMIT_MAX` | `30` | `POST /v1/uploads` pro Minute pro `X-Client-Token` |
| `INQUIRY_RATE_LIMIT_MAX` | `5` | `POST /v1/inquiries` pro Minute pro `X-Client-Token` |

Alle als `intFromEnv` mit `positive()`-Prüfung außer `UPLOADS_DIR` (nicht-leerer String).

Die maximale Bildanzahl pro Anfrage ist **5**, festgelegt durch `referenceImageIds.max(5)` im
Contract (§5.2) — keine eigene Env-Variable.

## 5. Contracts (`packages/contracts`)

Neue Module, über `index.ts` re-exportiert (Spec-B-Muster). `errors.ts` erweitert um
`INQUIRY_NOT_FOUND`, `UPLOAD_TOO_LARGE`, `UPLOAD_TYPE_NOT_ALLOWED`, `UPLOAD_NOT_FOUND`,
`TOO_MANY_UPLOADS`.

### 5.1 `body-regions.ts`

```ts
export const bodyRegionCodeSchema = z.enum([
  // Vorderseite
  'front.head', 'front.neck', 'front.chest', 'front.abdomen', 'front.pelvis',
  'front.shoulder.left', 'front.shoulder.right',
  'front.upper_arm.left', 'front.upper_arm.right',
  'front.forearm.left', 'front.forearm.right',
  'front.hand.left', 'front.hand.right',
  'front.thigh.left', 'front.thigh.right',
  'front.lower_leg.left', 'front.lower_leg.right',
  'front.foot.left', 'front.foot.right',
  // Rückseite
  'back.head', 'back.neck', 'back.upper_back', 'back.lower_back', 'back.buttocks',
  'back.shoulder_blade.left', 'back.shoulder_blade.right',
  'back.upper_arm.left', 'back.upper_arm.right',
  'back.forearm.left', 'back.forearm.right',
  'back.thigh.left', 'back.thigh.right',
  'back.calf.left', 'back.calf.right',
]);
export type BodyRegionCode = z.infer<typeof bodyRegionCodeSchema>;

// Einzige Quelle für Anzeigetexte; `left`/`right` = aus Sicht der Kundin.
export const bodyRegionLabels: Record<BodyRegionCode, string> = { /* deutsche Labels */ };
```

### 5.2 `inquiry.ts`

```ts
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

export const inquiryStatusSchema = z.enum(['NEW', 'IN_REVIEW', 'NEEDS_INFO', 'ACCEPTED', 'DECLINED']);

export const inquiryResponseSchema = z.object({
    inquiryId: z.uuid(),
    status: inquiryStatusSchema,
    reference: z.string(), // erste 8 Zeichen der uuid, für die Kundin
    createdAt: z.iso.datetime({ offset: true }),
});
```

`bodyRegions.min(1)` ist bewusst — die Körperauswahl ist der Kern des Redesigns; „noch unklar" ist
selten und wird über die Beschreibung abgedeckt.

### 5.3 `upload.ts`

Kein Request-Schema (multipart-Binär). Eine Response:

```ts
export const uploadResultSchema = z.object({
    uploadId: z.uuid(),
    url: z.string(),                       // geschützter GET-Pfad, z. B. /v1/uploads/<id>
    contentType: z.string(),
    width: z.number().int().positive().nullable(),
    height: z.number().int().positive().nullable(),
    byteSize: z.number().int().positive(),
});
```

### 5.4 `service-type.ts` (erweitert)

`serviceTypesResponseSchema = z.object({ items: z.array(serviceTypeSchema) })` — für das neue
`GET /v1/service-types`. `serviceTypeSchema` existiert bereits (Spec B).

### 5.5 `admin-inquiry.ts`

```ts
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

export const inquiryAcceptRequestSchema = z.object({
    studioNote: z.string().trim().max(2000).optional(),
});
export const inquiryNeedsInfoRequestSchema = z.object({
    message: z.string().trim().min(1).max(1000),
});
export const inquiryDeclineRequestSchema = z.object({
    reason: z.string().trim().min(1).max(500),
});
```

## 6. API (`apps/api`)

Schichtung wie Spec B. Neue Deps: `@fastify/multipart`, `sharp`.

### 6.1 Endpunkte

| Route | Auth | Verhalten |
|---|---|---|
| `GET /v1/service-types` | — | `{ items: serviceTypeSchema[] }`, `active = true`, aus `service_type` |
| `POST /v1/uploads` | `X-Client-Token` + Rate-Limit `UPLOAD_RATE_LIMIT_MAX` | ein Bild als `multipart/form-data`, Feld `file`. Prüft: `content-type` in `image/jpeg|png|webp|heic|heif`, Quellgröße ≤ `MAX_UPLOAD_BYTES`. HEIC/HEIF → JPEG (`sharp`); sonst re-encoding light (Maße auslesen, EXIF-Rotation anwenden, Metadaten strippen). Schreibt Datei nach `UPLOADS_DIR/<storage_key>`, `media_asset` (`inquiry_id` NULL, `client_token` aus Header). `201` `uploadResultSchema`. Fehlercodes: `UPLOAD_TYPE_NOT_ALLOWED` (415→400), `UPLOAD_TOO_LARGE` (413→400), fehlender Header → `VALIDATION_ERROR` (400) |
| `GET /v1/uploads/{id}` | **Bearer** | streamt die Datei mit `Content-Type` aus `media_asset`, `Cache-Control: private, max-age=300`. Unbekannt / ohne Bearer → `404` (kein 403, um Existenz nicht zu verraten) |
| `POST /v1/inquiries` | `X-Client-Token` + `Idempotency-Key` + Rate-Limit `INQUIRY_RATE_LIMIT_MAX` | Body gegen `createInquirySchema`. In **einer** Transaktion: Idempotency-Replay prüfen (`repositories/idempotency.ts`, Route `POST /v1/inquiries`) → `upsertCustomer` → `inquiry` (`status = 'NEW'`) → `inquiry_region`-Zeilen → `media_asset` verknüpfen: `UPDATE media_asset SET inquiry_id = $1, linked_at = now() WHERE id = ANY($2) AND inquiry_id IS NULL AND client_token = $3` (nicht gefundene / fremde IDs werden still ignoriert; `referenceImageIds` ist Contract-seitig auf 5 begrenzt) → `audit_event` (`actor: 'anon:'+clientToken.slice(0,8)`) → `outbox_event('inquiry.created', { inquiryId })` → Idempotency-Record (`statusCode 201`, TTL 24 h). `201` `inquiryResponseSchema`. Unbekannter `serviceTypeId` → `SERVICE_TYPE_NOT_FOUND` (404). Unbekannter `preferredArtistId` (≠ `'any'`) → `ARTIST_NOT_FOUND` (404) |
| `GET /v1/admin/inquiries?status=&limit=` | Bearer | `inquiryListItemSchema[]`, `status` optional gefiltert, `limit` ≤ 200 (Default 50), `created_at DESC` |
| `GET /v1/admin/inquiries/{id}` | Bearer | `inquiryDetailSchema`. Seiteneffekt `NEW → IN_REVIEW` (eigene Transaktion + `audit_event` `actor: 'system'`, kein `outbox_event`). `INQUIRY_NOT_FOUND` → 404 |
| `POST /v1/admin/inquiries/{id}/accept` | Bearer | Body `inquiryAcceptRequestSchema`. Transaktion: `assertTransition(status, 'ACCEPTED')` → Update (`status`, `studio_note`) → `audit_event` + `outbox_event('inquiry.accepted')`. `200 { ok: true }`. Falscher Übergang → `INVALID_STATE` (409), unbekannt → 404 |
| `POST /v1/admin/inquiries/{id}/needs-info` | Bearer | Body `inquiryNeedsInfoRequestSchema`. → `NEEDS_INFO`, `needs_info_message`, Audit + `outbox('inquiry.needs_info')`. `200 { ok: true }` |
| `POST /v1/admin/inquiries/{id}/decline` | Bearer | Body `inquiryDeclineRequestSchema`. → `DECLINED`, `decline_reason`, Audit + `outbox('inquiry.declined')`. `200 { ok: true }` |

### 6.2 Bilder-Auslieferung

`GET /v1/uploads/{id}` ist **nur** über Bearer erreichbar. Der Wizard zeigt seine eigenen Thumbnails
über `URL.createObjectURL(file)` — es gibt keinen Server-Round-Trip für die Bilder der Kundin. Die
Studio-Ansicht holt jedes Bild per `fetch` mit `Authorization: Bearer …`, macht daraus einen Blob
und eine Object-URL fürs `<img>`.

### 6.3 Neue Bausteine

- `domain/inquiry-status.ts` — Übergangs-Wächter
- `repositories/customer.ts` — `upsertCustomer` (aus `holds.ts` herausgezogen; `holds.ts` und
  `hold-service.ts` importieren neu von hier)
- `repositories/inquiries.ts` — `insertInquiry`, `insertInquiryRegions`, `getInquiryById`
  (join Regionen + verknüpfte `media_asset`), `listInquiries`, `transitionInquiry`
- `repositories/media.ts` — `insertMediaAsset`, `getMediaAssetById`, `linkMediaAssets`,
  `listOrphanMediaAssets`, `deleteMediaAsset`
- `services/upload-service.ts` — `storeUpload(deps, { clientToken, file })`
- `services/inquiry-service.ts` — `createInquiry(db, config, { idempotencyKey, clientToken, body })`
- `services/admin-inquiry-service.ts` — `listInquiries`, `getInquiryDetail`, `acceptInquiry`,
  `needsInfoInquiry`, `declineInquiry`
- `routes/service-types.ts`, `routes/uploads.ts`, `routes/inquiries.ts`, `routes/admin-inquiries.ts`
- `plugins/uploads-storage.ts`
- `jobs/purge-orphan-uploads.ts` + `runPurgeOrphanUploadsJob` — Transaktion: `listOrphanMediaAssets`
  (älter als `ORPHAN_UPLOAD_TTL_HOURS`) → je Zeile Datei löschen + `deleteMediaAsset` → Anzahl
  zurückgeben. Wird zusätzlich zu `runExpireHoldsJob` im `worker.ts`-Tick aufgerufen.

### 6.4 Wiederverwendet

`repositories/idempotency.ts`, `repositories/outbox.ts`, `repositories/audit.ts`,
`repositories/reference.ts` (`getServiceType`, `getActiveArtistsForService`, `getActiveResources`),
`services/availability-service.ts` (`GET /v1/availability` unverändert), `plugins/admin-auth.ts`,
`plugins/rate-limit.ts` (um zwei Routen-Limits erweitert).

### 6.5 `app.ts` / `server.ts`

- `BuildAppOptions` unverändert (`db?`, `config?`). Wenn beide gesetzt, zusätzlich zu den
  Spec-B-Plugins registrieren: `@fastify/multipart` (Limits aus Config), `serviceTypeRoutes`,
  `uploadRoutes`, `inquiryRoutes`, `adminInquiryRoutes`.
- `/health` ohne `repository`: mit `db` ein direktes `sql\`select 1\`.execute(db)` (`{ status:'ok',
  persistence:'postgres' }`), ohne `db` `{ status:'ok', persistence:'memory' }`.
- `server.ts` legt keinen `PostgresBookingRequestRepository` mehr an.

## 7. Web (`apps/web`)

### 7.1 Region-Codes ↔ SVG ↔ Label

`bodyRegionLabels` (Contract) ist die einzige Quelle für Anzeigetexte. Die SVG-Figur hat pro Region
ein `<path>`/`<g>` mit `id` = Region-Code. Der Picker liest die IDs, kein zweites Mapping.

### 7.2 Kunden-Wizard (`src/wizard/`, ersetzt `BookingFlow.tsx`)

Vier Schritte. `Wizard.tsx` hält den State (`serviceTypeId`, `preferredArtistId`,
`preferredStartsAt`, `bodyRegions`, `sizeCm`, `description`, `referenceImageIds`, Kontaktfelder).

| Schritt | Komponente | Inhalt |
|---|---|---|
| 01 Art | `steps/ServiceStep.tsx` | Service-Karten aus `GET /v1/service-types` |
| 02 Zeit | `steps/TimeStep.tsx` | Wunschtermin-Chips aus `GET /v1/availability`; „Kein Wunschtermin" möglich → `preferredStartsAt` bleibt undefined |
| 03 Motiv | `steps/MotifStep.tsx` | `BodyRegionPicker` (Vorder/Rück, Mehrfach, Chip-Liste) · `SizeField` (cm) · Beschreibung · `ReferenceUploader` |
| 04 Kontakt | `steps/ContactStep.tsx` | Vor-/Nachname · E-Mail · Telefon · Einwilligung · klebende Zusammenfassungs­leiste mit „Anfrage absenden" |

- `react-hook-form` nur für die Text-Inputs (Touch/Dirty). **Beim Absenden `createInquirySchema.safeParse(payload)` manuell** auf der aus dem `Wizard`-State zusammengesetzten Payload; Feldfehler werden den Schritten zugeordnet und angezeigt. (Der Bug des alten `BookingFlow` war genau ein nicht bei RHF registriertes Feld — hier umgangen.)
- `steps/Confirmation.tsx` — Referenznummer, „noch nicht verbindlich".
- `wizard/api/inquiryApi.ts` — `getServiceTypes`, `getAvailability`, `uploadImage(file, onProgress)`, `createInquiry(payload)`. Header: `X-Client-Token` (einmal `crypto.randomUUID()`, in `localStorage`), `Idempotency-Key` (pro Absende-Versuch neu). Antworten client-seitig gegen die Contract-Schemas revalidiert.
- `ReferenceUploader.tsx` — `<input type="file" accept="image/*" multiple>` (Kamera auf dem Handy) + Drag/Drop. Pro Datei: lokale Vorschau via `URL.createObjectURL`, Upload sofort (Hintergrund), Zustände `uploading` (Fortschritt) / `done` (`uploadId`) / `error` (Retry). Entfernen löscht die ID aus dem State (kein Server-Call — Waise wird vom Job aufgeräumt). Max. 5 Bilder.
- **Draft:** `Wizard`-State ohne `File`-Objekte bei Änderung nach `localStorage`; bei erfolgreichem Absenden gelöscht.

### 7.3 Studio-Ansicht (`src/studio/`, zweiter Entry-Point)

- `toolkit.config.ts` bekommt einen zweiten `entryPoint` `studio` (`pathIndex: './src/studio'`, `pathHtml: './src/studio.html'`) → ausgeliefert unter `/studio.html`.
- `StudioApp.tsx` — **Token-Gate**: kein Token in `localStorage` oder letzter Call `401` → Formular „Studio-Zugangscode"; der eingegebene Wert (= `ADMIN_API_TOKEN`) wird gespeichert und als `Authorization: Bearer …` an alle `/v1/admin/*`-Calls gehängt.
- `InquiryList.tsx` — Karten/Tabelle aus `GET /v1/admin/inquiries`; Status-Filter-Chips; neueste zuerst; Klick → Detail; Schnellaktion „Ablehnen" für `NEW`.
- `InquiryDetail.tsx` — `GET /v1/admin/inquiries/{id}`; `BodyRegionPicker` im `view`-Modus mit markierten Regionen; Bildergalerie (`fetch` + Bearer → Blob); alle Angaben; Aktionsleiste **Annehmen** (optionale Notiz) · **Rückfrage** (Pflicht-Nachricht) · **Ablehnen** (Pflicht-Grund) → danach zurück zur Liste.
- `studio/api/studioApi.ts` — Bearer-Header, die fünf Admin-Endpunkte.

### 7.4 Geteilt

`src/shared/BodyRegionPicker.tsx` — Props `{ value: BodyRegionCode[]; onChange?; mode: 'edit' | 'view' }`. Die lizenzierte SVG-Illustration (§13, Aufgabe) wird hier eingebunden; bis dahin die Piktogramm-Fallback-Figur. `src/shared/AppWrapper.tsx` (aus `components/` verschoben) — `ChaynsProvider` + React Query + `PageProvider`, von beiden Entry-Points genutzt.

## 8. Fehlercodes (Ergänzung zu Spec B §9)

`INQUIRY_NOT_FOUND` · `UPLOAD_TOO_LARGE` · `UPLOAD_TYPE_NOT_ALLOWED` · `UPLOAD_NOT_FOUND` ·
`TOO_MANY_UPLOADS`. Wiederverwendet: `VALIDATION_ERROR`, `UNAUTHORIZED`, `SERVICE_TYPE_NOT_FOUND`,
`ARTIST_NOT_FOUND`, `INVALID_STATE`, `IDEMPOTENCY_KEY_REUSED`, `RATE_LIMITED`. Antwortform
`apiErrorSchema`.

## 9. Teststrategie

### 9.1 Contracts

`spec-c.test.ts` — `createInquirySchema` (Defaults; leere `bodyRegions` → Fehler; > 5 Bilder →
Fehler; ungültige E-Mail → Fehler; `acceptsTerms`-Literal). `body-regions.test.ts` — jeder Enum-Code
hat einen Eintrag in `bodyRegionLabels`.

### 9.2 API (Postgres-Integration über `createTestDb`)

| Datei | Deckt ab |
|---|---|
| `database/schema.test.ts` (erweitert oder `inquiries-schema.test.ts`) | `003`-Tabellen; `ON DELETE CASCADE` (Inquiry löschen → `inquiry_region` + `media_asset` weg); `DROP` von `booking_request`; CHECK-Constraints |
| `domain/inquiry-status.test.ts` | erlaubte/verbotene Übergänge; `assertTransition` mit `.from` |
| `repositories/inquiries.test.ts` | Insert + Regionen; Detail-Join (Regionen, verknüpfte Bilder); Liste nach Status; `transitionInquiry` |
| `repositories/media.test.ts` | Insert; `linkMediaAssets` verknüpft nur passenden `client_token` + unverknüpfte; `listOrphanMediaAssets`; `deleteMediaAsset` |
| `services/upload-service.test.ts` | 15 MB → Ablehnung; `.txt` → Ablehnung; PNG/WebP/JPEG durch (Maße gesetzt); HEIC → JPEG **wenn `sharp` `libheif` mitbringt**, sonst `it.skip` + Vermerk |
| `routes/uploads.test.ts` | `POST` 201 (PNG); 400 bei Übergröße; 400 bei falschem Typ; 400 ohne `X-Client-Token`. `GET` mit Bearer → Bytes + korrekter `Content-Type`; ohne Bearer → 404 |
| `routes/service-types.test.ts` | `GET /v1/service-types` liefert die drei Seed-Typen |
| `routes/inquiries.test.ts` | 201 → `inquiry` `NEW` + `inquiry_region`-Zeilen + Bild-Verknüpfung; Idempotency-Replay (gleiche `inquiryId`, kein zweiter Datensatz); fehlende Header → 400; leere Regionen → 400; unbekannter Service → 404; fremde `referenceImageIds` still ignoriert |
| `routes/admin-inquiries.test.ts` | Liste (Bearer, Status-Filter); Detail bumpt `NEW → IN_REVIEW`; accept/needs-info/decline happy + 409 bei falschem Übergang + 404 unbekannt + 401 ohne Token |
| `jobs/purge-orphan-uploads.test.ts` | alter Waise → Zeile + Datei weg; verknüpftes Asset unberührt; frischer Waise bleibt |

### 9.3 Web (`@testing-library/react`, jsdom, Modul-Mocks)

- `shared/BodyRegionPicker.test.tsx` — Klick auf Region-`<path>` toggelt; Mehrfachauswahl; `onChange` liefert Code-Array; `view`-Modus nicht klickbar
- `wizard/ReferenceUploader.test.tsx` — Dateiwahl → `uploadImage` (gemockt) → Fortschritt→`done`; Entfernen; Max-5 blockiert weiteres Hinzufügen; Retry nach Fehler
- `wizard/Wizard.test.tsx` — voller 4-Schritt-Flow gemockt: Service → kein Wunschtermin → Region + Größe + zwei Bilder → Kontakt + Einwilligung → `createInquiry` wird mit einer Payload aufgerufen, die `createInquirySchema` **besteht** (Regressionsschutz gegen den alten Bug); fehlende Region blockiert Schritt 03; `localStorage`-Draft wird nach Erfolg gelöscht
- `studio/InquiryDetail.test.tsx` — Regionen auf der Figur markiert; Bilder aus gemocktem Blob; „Annehmen" ruft `accept` und kehrt zur Liste zurück

### 9.4 Fixtures

Ein 1×1-PNG als base64-Konstante für Upload-Tests. **HEIC-Fixture-Lücke** (§10).

## 10. Risiken und offene Punkte

- **HEIC-Konvertierung** hängt davon ab, ob das installierte `sharp`-Prebuilt `libheif` enthält. Mitigation: beim Serverstart `sharp.format`-Fähigkeiten prüfen; fehlt HEIF-Support, `POST /v1/uploads` für `image/heic|heif` mit `UPLOAD_TYPE_NOT_ALLOWED` + Klartext („bitte als JPEG hochladen") ablehnen statt 500. Automatischer Konvertierungstest wird in dem Fall übersprungen.
- **`sharp` als native Dependency** — Prebuilt für Windows-Dev und Linux-Container vorhanden; falls `npm install` klemmt, im Plan als Blocker behandeln.
- **Studio-Token-Gate** — der `ADMIN_API_TOKEN` liegt im Browser der Studio-Person (`localStorage`). Bewusstes MVP-Provisorium, in `CLAUDE.md` als Limitierung dokumentiert; eine echte Studio-Auth-Spec ersetzt es.
- **`GET /v1/uploads/{id}` nur Bearer** — die Kundin kann ihre Referenzbilder nach Verlassen der Bestätigungsseite nicht erneut ansehen. Akzeptiert (out of scope).
- **Körper-Illustration** — Lizenz/Zeit für eine professionelle Vorder-/Rück-SVG. Fällt die Beschaffung aus, ist die verfeinerte Piktogramm-Figur (Brainstorm-Stand v5) der Fallback; blockiert die Spec nicht.
- **links/rechts „aus Sicht der Kundin"** — muss auf der Figur sichtbar beschriftet sein (Seiten-Label oder Hinweis). Anforderung an die Illustrations-Aufgabe.
- **`preferred_starts_at` in der Vergangenheit** — bei später Prüfung normal; nur ein Hinweis, kein Constraint.
- **`inquiry_region.region_code` ohne DB-CHECK** — die gültige Menge lebt im Contract; ungültige Codes werden von `createInquirySchema` abgewiesen, bevor sie die DB erreichen.

## 11. Repo-Auswirkungen — Legacy-Abbau

Entfernt bzw. ersetzt in dieser Spec:

| Datei / Artefakt | Aktion |
|---|---|
| `apps/api/src/catalog.ts` | löschen |
| `apps/api/src/availability.ts` (synthetisch) | löschen |
| `apps/api/src/repository.ts` | löschen; `/health` macht direktes `select 1` |
| `apps/api/src/app.ts` | `/api/v1/service-types`, `/api/v1/availability`, `/api/v1/booking-requests`, `validationError` entfernen |
| `apps/api/src/app.test.ts` | mit dem Repository-Abbau neu geschnitten |
| `apps/api/src/database/types.ts` | `BookingRequestTable` aus `Database` entfernen |
| `apps/api/migrations/003_…sql` | `DROP TABLE IF EXISTS booking_request;` |
| `apps/api/src/repositories/holds.ts` | `upsertCustomer` → `repositories/customer.ts` |
| `packages/contracts/src/index.ts` | `legacyServiceTypeSchema`, `legacyServiceTypesResponseSchema`, `legacyAvailability{Query,Slot,Response}Schema`, `createBookingRequestSchema`, `bookingRequestSchema`, `createBookingRequestResponseSchema` + zugehörige Typen entfernen; `serviceTypeIdSchema` bleibt |
| `apps/web/src/api/bookingApi.ts` | → `wizard/api/inquiryApi.ts` |
| `apps/web/src/components/BookingFlow.tsx` (+ `.test.tsx`) | → `src/wizard/` |
| `apps/web/src/components/App.tsx` | rendert `<Wizard/>` |
| `apps/web/src/components/{AppWrapper.tsx,app.css}` | `AppWrapper` → `src/shared/`; CSS für die neuen Schritte |
| `CLAUDE.md`, `.env.example`, `compose.yaml` | aktualisieren (Inquiry-Flow, Uploads, `/studio.html`, `UPLOADS_DIR`, Volume) |

Neue Deps: `@fastify/multipart`, `sharp` (`apps/api`).

## 12. Definition of Done

- `npm run db:up && npm run check-types && npm test` grün über alle Workspaces
- `apps/api`: alle neuen Integrations-, Upload- und Statusautomat-Tests grün; `apps/web`: Wizard- und Studio-Tests grün; `contracts` grün
- Smoke-Test manuell: Wizard (`/`) — Service wählen, Region(en) + Größe + zwei Fotos, Kontakt + Einwilligung, Absenden → Referenznummer. Studio (`/studio.html`) — Zugangscode, Anfrage in der Liste, Detail zeigt Regionen auf der Figur + Bilder, „Annehmen" → Status `ACCEPTED`, `outbox_event` `inquiry.accepted` vorhanden.
- Worker: `runPurgeOrphanUploadsJob` entfernt einen künstlich gealterten Waise (Zeile + Datei).
- Legacy-Pfad (`/api/v1/*`, `booking_request`, `catalog.ts`, `BookingFlow`) vollständig entfernt; kein toter Code, kein `legacy*`-Contract mehr.

## 13. Aufgaben außerhalb Code

- **Körper-Illustration beschaffen:** professionelle oder open-licensed Vorder-/Rück-Körper-SVG,
  regionentauglich (`<path id>` pro Region-Code), links/rechts beschriftet aus Sicht der Kundin.
  Bis zur Beschaffung: verfeinerte Piktogramm-Figur als Platzhalter (Interaktion unverändert).

## 14. Offene Annahmen — Entscheidungen im Design

- Körperauswahl-Granularität: mittel (~35 Codes über Vorder/Rück, mit links/rechts).
- Mehrfachauswahl von Regionen erlaubt; mindestens eine Region Pflicht.
- Größe (`size_cm`) und Freitext bleiben neben der Körperauswahl, beide optional.
- Wunschtermin ist unverbindlich, erzeugt keinen Hold.
- Bild-Upload: einzeln, sofort, im Hintergrund (Ansatz A); Verknüpfung beim Absenden; Waisen-Cleanup
  per Worker (`ORPHAN_UPLOAD_TTL_HOURS = 24`).
- Bildspeicher: privates Volume hinter der API, keine signierten URLs.
- Studio-Ansicht ist Teil dieser Spec; Terminvergabe nach Annahme nicht.
- Studio-Zugang: Token-Gate mit `ADMIN_API_TOKEN` (MVP-Provisorium).
- Wizard-Persistenz: nur `localStorage`-Draft, kein server-seitiger Draft.
