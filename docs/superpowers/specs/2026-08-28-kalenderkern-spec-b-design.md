# Spec B — Kalenderkern & Verfügbarkeit

> Stand: 2026-08-28
> Status: Design freigegeben, bereit für Implementierungsplan
> Fachliche Grundlage: `.idea/VORKONZEPT_TATTOO_STUDIO_CHAYNS.md`, `.idea/ARCHITEKTUR_UND_UMSETZUNG.md`
> Teil der Zerlegung: **A** Marketing-Site · **B** Kalenderkern *(dieses Dokument)* · **B2** chayns-Shop & Anzahlung · **C** Anfrage-Wizard & Uploads · **D** Benachrichtigung

## 1. Ziel und Abgrenzung

Spec B liefert den transaktionalen Buchungskern: ein relationales Kalendermodell,
eine Verfügbarkeits-Engine über mehrere Artists und Ressourcen, atomare Slot-Holds
mit Datenbank-Constraint gegen Doppelbuchung, einen geschützten Endpoint zum
Bestätigen eines Holds und einen Worker, der abgelaufene Holds freigibt.

### 1.1 In Scope

- Kalender-Datenmodell in PostgreSQL (ersetzt `apps/api/migrations/001_initial_booking.sql`)
- Verfügbarkeits-Engine (`GET /v1/availability`)
- Atomarer Slot-Hold (`POST /v1/slot-holds`, `DELETE /v1/slot-holds/{id}`)
- Studio-Endpoints `POST /v1/admin/holds/{id}/confirm` und `.../decline`
- Worker-Prozess für Hold-Ablauf
- Deposit-**Modellierung** (Tier + Betrag), keine Zahlungsabwicklung
- Idempotency-Speicher für schreibende Kundenoperationen
- Outbox- und Audit-Tabellen (B **schreibt** Einträge; Zustellung ist Spec D)
- Seed-Daten (Platzhalter-Artists, Ressourcen, Regeln)
- Zod-Contracts in `packages/contracts`
- Automatisierte Tests inkl. Parallel- und Zeitzonentests

### 1.2 Explizit nicht in Scope

| Thema | Gehört zu |
|---|---|
| chayns-Shop-Checkout, `order.create`, MQTT-Ereignis, `PAID → CONFIRMED` | Spec B2 |
| Zustellung von E-Mail / chayns-Nachricht | Spec D (B schreibt nur `outbox_event`) |
| Anfrage-Wizard-UI, Zwischenspeichern, Referenzbild-Uploads | Spec C |
| Öffentliche Marketing-Seiten | Spec A |
| Admin-UI / Kanban-Pipeline / Kalenderansicht | spätere Spec |
| chayns-Login-Pflicht, serverseitige Token-Validierung | verschoben (Login optional, siehe §4.4) |
| Mehrsitzungs-Projekte, Quotes-Versionierung, Warteliste | Phase 2 |

### 1.3 Kontext im bestehenden Repo

- `apps/api` — Fastify 5, ESM (`NodeNext`), `buildApp()`-Factory, Kysely + `pg`, Vitest.
- `apps/api/src/availability.ts` erzeugt heute **synthetische** Slots ohne Regeln/Holds → wird durch die Engine aus §3 ersetzt.
- `apps/api/src/catalog.ts` hält Service-Typen hart kodiert → wandert in Seed + DB, `catalog.ts` liest künftig aus der DB oder entfällt.
- `apps/api/migrations/001_initial_booking.sql` ist ein erster Entwurf (`appointment_hold` hängt an `booking_request`) → **wird ersetzt** durch das Schema aus §2.
- `packages/contracts` ist die verbindliche Schema-Quelle; muss vor API/Web gebaut werden.
- Neuer Workspace `apps/worker` (geteilter Codebestand mit `apps/api`).

## 2. Datenmodell (PostgreSQL)

Alle Zeitpunkte `timestamptz` in UTC. Lokale Zeiten (`availability_rule`) als `time`
in der Artist-Zeitzone interpretiert. Zeitintervalle halboffen `[start, end)`.
`btree_gist` wird für die Exclusion-Constraints benötigt.

### 2.1 Stammdaten

**`service_type`**

| Feld | Typ | Anmerkung |
|---|---|---|
| `id` | text PK | z. B. `consultation`, `small-tattoo`, `day-session` |
| `name` | text | |
| `description` | text | |
| `duration_minutes` | int > 0 | reine Sitzungsdauer ohne Puffer |
| `pre_buffer_minutes` | int ≥ 0 | Vorbereitung; Teil des belegten Blocks |
| `post_buffer_minutes` | int ≥ 0 | Reinigung; Teil des belegten Blocks |
| `booking_mode` | text | `'request'` \| `'direct'` — gespeichert, in B nicht verzweigt |
| `deposit_tier` | text | `'NONE'` \| `'D50'` \| `'D100'` \| `'D150'` (Vorschau auf B2) |
| `deposit_cents` | int ≥ 0 | Anzeigebetrag; in B2 an Shop-Artikel gebunden |
| `active` | boolean default true | |
| `created_at` | timestamptz default now() | |

**`artist`**

| Feld | Typ | Anmerkung |
|---|---|---|
| `id` | text PK | slug-artig, z. B. `mara` |
| `display_name` | text | |
| `bio` | text | |
| `timezone` | text default `'Europe/Berlin'` | |
| `active` | boolean default true | |
| `created_at` | timestamptz default now() | |

**`resource`**

| Feld | Typ | Anmerkung |
|---|---|---|
| `id` | text PK | z. B. `station-1` |
| `name` | text | |
| `kind` | text | `'station'` \| `'consult'` |
| `active` | boolean default true | |
| `created_at` | timestamptz default now() | |

**`artist_service`** — m:n, welcher Artist welche Leistung anbietet

| Feld | Typ |
|---|---|
| `artist_id` | text FK → artist(id) |
| `service_type_id` | text FK → service_type(id) |
| PK | (`artist_id`, `service_type_id`) |

**`availability_rule`** — wiederkehrende wöchentliche Fenster

| Feld | Typ | Anmerkung |
|---|---|---|
| `id` | uuid PK | |
| `artist_id` | text FK → artist(id) | |
| `weekday` | int 0–6 | 1 = Montag … 7 = Sonntag (ISO); 0 ungenutzt — **Annahme: ISO 1–7**, siehe §11 |
| `start_local` | time | in Artist-Zeitzone |
| `end_local` | time | `end_local > start_local` (CHECK) |
| `valid_from` | date | inklusive |
| `valid_to` | date NULL | exklusive; NULL = unbegrenzt |
| `created_at` | timestamptz default now() | |

**`blocked_period`** — negative Verfügbarkeit (Urlaub, Krankheit, Feiertag, Sperre)

| Feld | Typ | Anmerkung |
|---|---|---|
| `id` | uuid PK | |
| `artist_id` | text FK NULL | gesetzt = artistweite Sperre |
| `resource_id` | text FK NULL | gesetzt = ressourcenweite Sperre |
| `starts_at` | timestamptz | |
| `ends_at` | timestamptz | `ends_at > starts_at` (CHECK) |
| `reason` | text | intern |
| `created_at` | timestamptz default now() | |
| CHECK | `num_nonnulls(artist_id, resource_id) >= 1` | mindestens eine Dimension |

### 2.2 Kunde

**`customer`** — anon-fähig; wird beim Hold angelegt

| Feld | Typ | Anmerkung |
|---|---|---|
| `id` | uuid PK | |
| `chayns_person_id` | text UNIQUE NULL | gesetzt, wenn eingeloggt |
| `first_name` | text | |
| `last_name` | text | |
| `email` | text | |
| `phone` | text | |
| `created_at` | timestamptz default now() | |

> Dedup-Regel für MVP: bei vorhandener `chayns_person_id` wird der bestehende
> Datensatz wiederverwendet; sonst wird pro Hold ein neuer `customer` angelegt
> (Zusammenführung ist eine spätere Aufgabe).

### 2.3 Kalender

**`appointment_block`** — einzige blockierende Tabelle

| Feld | Typ | Anmerkung |
|---|---|---|
| `id` | uuid PK | |
| `artist_id` | text FK → artist(id) | |
| `resource_id` | text FK → resource(id) | |
| `service_type_id` | text FK → service_type(id) | |
| `customer_id` | uuid FK → customer(id) | |
| `starts_at` | timestamptz | **inkl.** `pre_buffer` |
| `ends_at` | timestamptz | **inkl.** `post_buffer` |
| `session_starts_at` | timestamptz | reine Sitzung (für Anzeige/Reminder) |
| `session_ends_at` | timestamptz | |
| `status` | text | `HELD` \| `PAYMENT_PENDING` \| `CONFIRMED` \| `COMPLETED` \| `EXPIRED` \| `CANCELLED` |
| `expires_at` | timestamptz NULL | gesetzt solange `HELD`; NULL ab `CONFIRMED` |
| `hold_client_token` | text NULL | Besitznachweis für anonyme Holds |
| `idempotency_key` | text NULL | Key der erzeugenden Anfrage |
| `deposit_cents` | int ≥ 0 | Snapshot aus `service_type` zum Hold-Zeitpunkt |
| `decline_reason` | text NULL | |
| `created_at` | timestamptz default now() | |
| `updated_at` | timestamptz default now() | via Trigger oder App |
| CHECK | `ends_at > starts_at` | |
| CHECK | Statuswerte (s. o.) | |

Constraints (benötigen `CREATE EXTENSION IF NOT EXISTS btree_gist`):

```sql
ALTER TABLE appointment_block
  ADD CONSTRAINT appointment_block_artist_no_overlap
  EXCLUDE USING gist (
    artist_id WITH =,
    tstzrange(starts_at, ends_at, '[)') WITH &&
  ) WHERE (status IN ('HELD', 'PAYMENT_PENDING', 'CONFIRMED'));

ALTER TABLE appointment_block
  ADD CONSTRAINT appointment_block_resource_no_overlap
  EXCLUDE USING gist (
    resource_id WITH =,
    tstzrange(starts_at, ends_at, '[)') WITH &&
  ) WHERE (status IN ('HELD', 'PAYMENT_PENDING', 'CONFIRMED'));
```

Indizes: `(status, expires_at)` für den Ablauf-Sweeper; `(hold_client_token)` partial `WHERE hold_client_token IS NOT NULL`; `(artist_id, starts_at)`.

**`appointment`** — entsteht beim Bestätigen eines Holds

| Feld | Typ | Anmerkung |
|---|---|---|
| `id` | uuid PK | |
| `block_id` | uuid FK → appointment_block(id) UNIQUE | |
| `service_type_id` | text FK → service_type(id) | |
| `customer_status` | text | `'BOOKED'` \| `'CHECKED_IN'` \| `'DONE'` \| `'NO_SHOW'` (nur `'BOOKED'` in B) |
| `deposit_received_cents` | int NULL | manuell durch Studio (Überweisung/vor Ort) |
| `deposit_received_at` | timestamptz NULL | |
| `deposit_method` | text NULL | frei, z. B. `'bank_transfer'` |
| `notes` | text NULL | intern |
| `created_at` | timestamptz default now() | |

### 2.4 Betrieb

**`idempotency_key`**

| Feld | Typ |
|---|---|
| `key` | text PK |
| `route` | text |
| `request_hash` | text (SHA-256 des normalisierten Bodys) |
| `response_json` | jsonb |
| `status_code` | int |
| `created_at` | timestamptz default now() |
| `expires_at` | timestamptz (now() + 24 h) |

Regel: gleicher `key` + abweichender `request_hash` → HTTP `409` (`IDEMPOTENCY_KEY_REUSED`).

**`outbox_event`**

| Feld | Typ | Anmerkung |
|---|---|---|
| `id` | uuid PK | |
| `type` | text | `slot_hold.created` \| `slot_hold.released` \| `appointment.confirmed` \| `appointment.declined` \| `slot_hold.expired` |
| `payload` | jsonb | |
| `status` | text | `PENDING` \| `SENT` \| `FAILED` |
| `attempts` | int default 0 | |
| `created_at` | timestamptz default now() | |
| `sent_at` | timestamptz NULL | |

**`audit_event`**

| Feld | Typ |
|---|---|
| `id` | uuid PK |
| `actor` | text (`'anon:<client_token_prefix>'`, `'chayns:<person_id>'`, `'studio'`, `'worker'`) |
| `action` | text (`hold.created`, `hold.released`, `hold.expired`, `appointment.confirmed`, `appointment.declined`) |
| `entity_type` | text |
| `entity_id` | text |
| `before` | jsonb NULL |
| `after` | jsonb NULL |
| `at` | timestamptz default now() |

### 2.5 Statusmodell `appointment_block`

```
                 ┌──────────────► EXPIRED      (Worker: expires_at < now)
                 │
HELD ────────────┼──────────────► CANCELLED    (DELETE /slot-holds/{id} oder admin decline)
                 │
                 └──► CONFIRMED ──► COMPLETED   (COMPLETED erst in späterer Spec)

PAYMENT_PENDING ist reserviert für Spec B2 und wird in B nicht gesetzt.
```

Jeder Übergang schreibt `audit_event` **und** `outbox_event` in **derselben Transaktion** wie die Statusänderung.

## 3. Verfügbarkeits-Engine

### 3.1 Endpoint

```
GET /v1/availability?serviceTypeId=<id>&artistId=<id|any>&from=<YYYY-MM-DD>&days=<1..31>
```

- `from` wird in `Europe/Berlin` als Tagesbeginn interpretiert.
- `days` Default 14, Max 31.
- `artistId=any` → alle aktiven Artists, die die Leistung anbieten.

### 3.2 Antwort (Contract)

```jsonc
{
  "timezone": "Europe/Berlin",
  "serviceType": { "id": "...", "name": "...", "durationMinutes": 120, "depositCents": 5000 },
  "slots": [
    {
      "id": "<opak: base64url(artistId|serviceTypeId|startsAtISO)>",
      "artistId": "mara",
      "artistName": "Mara",
      "startsAt": "2026-09-01T08:00:00.000Z",   // Sitzungsbeginn (ohne pre-buffer), UTC
      "endsAt":   "2026-09-01T10:00:00.000Z",   // Sitzungsende (ohne post-buffer), UTC
      "durationMinutes": 120,
      "depositCents": 5000
    }
  ]
}
```

### 3.3 Algorithmus

Für jeden in Frage kommenden Artist (`artist_service` ∧ `artist.active`):

1. **Regelfenster expandieren.** Für jeden Tag `d` in `[from, from + days)`:
   - passende `availability_rule` (weekday, `valid_from ≤ d < valid_to`)
   - `start_local`/`end_local` am Tag `d` in `artist.timezone` → UTC-Intervall
     (Luxon; DST-Übergänge dabei korrekt behandeln)
2. **Sperren abziehen.** `blocked_period` mit `artist_id = A` sowie alle
   `blocked_period` mit `resource_id` (ressourcenweit) — Letztere reduzieren die
   Ressourcenverfügbarkeit in Schritt 5, nicht das Artist-Fenster.
3. **Belegte Blöcke abziehen.** `appointment_block` des Artists mit
   `status IN ('HELD','PAYMENT_PENDING','CONFIRMED')` → aus den Regelfenstern
   herausschneiden (mit Puffern, da `starts_at`/`ends_at` die Puffer enthalten).
4. **Startraster.** In jedem verbleibenden freien Fenster Startzeiten im
   `GRID_MINUTES`-Raster (Default 15) erzeugen, für die gilt:
   `slotStart − pre_buffer ≥ Fensteranfang` **und**
   `slotStart + duration + post_buffer ≤ Fensterende`.
5. **Ressourcenprüfung.** Kandidat ist nur buchbar, wenn **mindestens eine**
   aktive `resource` (kind passend: `consult` für Beratung, sonst `station`) im
   Intervall `[slotStart − pre, slotEnd + post)` frei ist — also weder durch
   `appointment_block` (blockierende Status) noch durch ressourcenweite
   `blocked_period` belegt.
6. **Vorlauf.** Kandidaten mit `slotStart < now() + MIN_LEAD_HOURS` (Default 12)
   verwerfen.
7. Sortiert nach `startsAt`, dann `artistName`, zurückgeben.

### 3.4 Konfiguration

| Env | Default | Zweck |
|---|---|---|
| `GRID_MINUTES` | `15` | internes Startraster |
| `MIN_LEAD_HOURS` | `12` | minimale Vorlaufzeit |
| `HOLD_TTL_HOURS` | `48` | Gültigkeit eines Holds |
| `MAX_AVAILABILITY_DAYS` | `31` | Obergrenze für `days` |

## 4. Atomarer Slot-Hold

### 4.1 Endpoint

```
POST /v1/slot-holds
Headers:  Idempotency-Key: <uuid>      (Pflicht)
          X-Client-Token: <uuid>        (Pflicht; vom Client generiert, in localStorage)
Body:
{
  "serviceTypeId": "small-tattoo",
  "artistId": "mara",
  "startsAt": "2026-09-01T08:00:00.000Z",
  "customer": { "firstName": "...", "lastName": "...", "email": "...", "phone": "..." },
  "chaynsPersonId": "..."   // optional
}
```

### 4.2 Ablauf (eine Transaktion, `READ COMMITTED`; Konfliktschutz kommt aus der Exclusion-Constraint, nicht aus dem Isolationslevel)

1. **Idempotenz.** `SELECT ... FROM idempotency_key WHERE key = $1`.
   - Treffer + gleicher `request_hash` → gespeicherte Antwort + Statuscode zurück.
   - Treffer + anderer `request_hash` → `409 IDEMPOTENCY_KEY_REUSED`.
2. **Abgelaufene Holds räumen.**
   `UPDATE appointment_block SET status='EXPIRED', updated_at=now()
    WHERE status='HELD' AND expires_at < now()` — inkl. `audit_event` /
   `outbox_event` je betroffener Zeile. (Nötig, weil der Partial-Index `now()`
   nicht auswerten kann; der Sweeper aus §6 ist die zweite Absicherung.)
3. **Slot revalidieren.** Startzeit erneut durch die Engine (§3) prüfen —
   schützt vor veraltetem Client-Zustand. Ungültig → `409 SLOT_NO_LONGER_AVAILABLE`
   mit frischen Alternativ-Slots.
4. **Ressource wählen.** Erste freie aktive Ressource (deterministisch: kleinste
   `id`) für `[start − pre, end + post)`.
5. **Kunde.** `chayns_person_id` vorhanden → bestehenden `customer` laden, sonst
   neuen anlegen.
6. **Block einfügen.**
   `INSERT INTO appointment_block (... status='HELD',
     expires_at = now() + interval '<HOLD_TTL_HOURS> hours',
     deposit_cents = <service_type.deposit_cents>,
     hold_client_token = <X-Client-Token>, idempotency_key = <key>)`.
   - Exclusion-Verletzung (SQLSTATE `23P01`) → Transaktion zurückrollen,
     `409 SLOT_CONFLICT` mit frischen Alternativ-Slots.
7. **Nebenwirkungen.** `audit_event` (`hold.created`) + `outbox_event`
   (`slot_hold.created`, Payload mit Hold-, Kunden-, Artist-, Zeitdaten).
8. **Idempotenz speichern.** `INSERT INTO idempotency_key (...)`.
9. **Commit.** Antwort:

```jsonc
{
  "holdId": "<uuid>",
  "status": "HELD",
  "expiresAt": "2026-09-03T08:00:00.000Z",
  "artistId": "mara",
  "startsAt": "2026-09-01T08:00:00.000Z",
  "endsAt": "2026-09-01T10:00:00.000Z",
  "depositCents": 5000
}
```

### 4.3 Freigabe

```
DELETE /v1/slot-holds/{id}
Headers: X-Client-Token: <uuid>
```

- Block muss `status='HELD'` **und** `hold_client_token` = Header sein, sonst `404`
  (kein Informationsleck über fremde Holds).
- Setzt `status='CANCELLED'`, `audit_event` (`hold.released`), `outbox_event`
  (`slot_hold.released`). Antwort `204`.

### 4.4 Identität / Login

Login ist **optional**. Der Hold-Besitz hängt am `X-Client-Token` (Client-seitig
erzeugte UUID, in `localStorage`). Ist der Nutzer in chayns eingeloggt, schickt der
Client zusätzlich `chaynsPersonId` im Body; diese wird gespeichert, aber in B
**nicht serverseitig gegen ein chayns-Token validiert** (das ist ein späterer
Auth-Spike). Bis dahin gilt `chaynsPersonId` als unbestätigte Angabe und darf
keine Autorisierungsentscheidung tragen.

## 5. Studio-Endpoints (out-of-band Bestätigung)

Maschinen-Authentifizierung über statisches Bearer-Token aus `ADMIN_API_TOKEN`
(Env). Kein UI. Alle `/v1/admin/*`-Routen prüfen den Header, sonst `401`.

### 5.1 Bestätigen

```
POST /v1/admin/holds/{id}/confirm
Authorization: Bearer <ADMIN_API_TOKEN>
Body (optional):
{ "depositReceived": { "amountCents": 5000, "at": "2026-08-29T09:00:00Z", "method": "bank_transfer" } }
```

Transaktion:
- Block muss `status IN ('HELD','PAYMENT_PENDING')` sein, sonst `409 INVALID_STATE`.
- `status='CONFIRMED'`, `expires_at=NULL`.
- `INSERT INTO appointment (block_id, service_type_id, customer_status='BOOKED', deposit_received_*)`.
- `audit_event` (`appointment.confirmed`) + `outbox_event` (`appointment.confirmed`).
- Antwort: Appointment-Objekt.

### 5.2 Ablehnen

```
POST /v1/admin/holds/{id}/decline
Body: { "reason": "Motiv passt nicht zum Studio" }
```

- Block `status='CANCELLED'`, `decline_reason` gesetzt.
- `audit_event` (`appointment.declined`) + `outbox_event` (`appointment.declined`).
- Antwort `200`.

### 5.3 Lesen (Minimalauskunft für Debug/Betrieb)

```
GET /v1/admin/holds?status=HELD&limit=50
```

Liste der Blocks mit Kunde/Artist/Zeit. Nur lesend, keine Filterlogik über das
Nötigste hinaus.

## 6. Worker (`apps/worker`)

Eigenständiger Prozess, gleicher Codebestand wie `apps/api`. Läuft im Intervall
`WORKER_INTERVAL_SECONDS` (Default 60).

**Job „expire-holds":**

```sql
UPDATE appointment_block
   SET status = 'EXPIRED', updated_at = now()
 WHERE status = 'HELD' AND expires_at < now()
RETURNING id, artist_id, resource_id, starts_at, customer_id;
```

Pro zurückgegebener Zeile: `audit_event` (`hold.expired`, actor `worker`) +
`outbox_event` (`slot_hold.expired`). Alles in einer Transaktion pro Batch.

**Outbox-Zustellung:** nur Grundgerüst (Query nach `status='PENDING'`, Logging,
kein realer Versand). Die Zusteller (SMTP, chayns.Codes) kommen in Spec D.

Der `dev`-Task im Root startet zusätzlich den Worker (`concurrently` um einen
Eintrag erweitern).

## 7. Contracts (`packages/contracts/src`)

Neue bzw. erweiterte Zod-Schemas (Dateien nach Domäne aufteilen, `index.ts`
re-exportiert):

| Schema | Inhalt |
|---|---|
| `serviceTypeSchema` | + `preBufferMinutes`, `postBufferMinutes`, `bookingMode`, `depositTier`, `depositCents` |
| `artistSchema` | `id`, `displayName`, `bio`, `timezone` |
| `availabilityQuerySchema` | `serviceTypeId`, `artistId` (`z.union([id, z.literal('any')])`), `from`, `days` |
| `availabilitySlotSchema` | `id`, `artistId`, `artistName`, `startsAt`, `endsAt`, `durationMinutes`, `depositCents` |
| `availabilityResponseSchema` | `timezone`, `serviceType`, `slots[]` |
| `slotHoldRequestSchema` | `serviceTypeId`, `artistId`, `startsAt`, `customer{}`, `chaynsPersonId?` |
| `slotHoldResponseSchema` | `holdId`, `status`, `expiresAt`, `artistId`, `startsAt`, `endsAt`, `depositCents` |
| `holdConfirmRequestSchema` | `depositReceived?: { amountCents, at, method }` |
| `holdDeclineRequestSchema` | `reason` |
| `apiErrorSchema` | + Fehlercodes aus §9 |

Die bestehenden `createBookingRequestSchema` / `bookingRequestSchema` bleiben
vorerst unverändert (werden von Spec C abgelöst).

## 8. Seed-Daten

Als SQL-Migration `002_seed_reference_data.sql` (nutzt den bestehenden Runner in
`src/database/migrate.ts`), idempotent (`ON CONFLICT DO NOTHING`, `valid_from` via
`CURRENT_DATE`):

- **Artists:** `mara`, `jon` (beide aktiv, `Europe/Berlin`).
- **Ressourcen:** `station-1`, `station-2` (`station`), `consult-1` (`consult`).
- **Service-Typen:** `consultation` (30 min, 0/0 Puffer, `NONE`, 0 ct),
  `small-tattoo` (120 min, 15/15, `D50`, 5000 ct),
  `day-session` (360 min, 30/30, `D150`, 15000 ct).
- **`artist_service`:** beide Artists bieten alle drei Leistungen an.
- **`availability_rule`:** Mo–Fr 10:00–18:00 je Artist, `valid_from` = heute,
  `valid_to` = NULL.
- **`blocked_period`:** ein Beispiel (z. B. `jon` eine Woche Urlaub).

## 9. Fehlercodes

| HTTP | `code` | Bedeutung |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Zod-Fehler, mit `issues[]` |
| 401 | `UNAUTHORIZED` | Admin-Token fehlt/falsch |
| 404 | `SERVICE_TYPE_NOT_FOUND` / `ARTIST_NOT_FOUND` / `HOLD_NOT_FOUND` | |
| 409 | `SLOT_CONFLICT` | Exclusion-Constraint, mit `alternativeSlots[]` |
| 409 | `SLOT_NO_LONGER_AVAILABLE` | Revalidierung fehlgeschlagen, mit `alternativeSlots[]` |
| 409 | `IDEMPOTENCY_KEY_REUSED` | gleicher Key, anderer Body |
| 409 | `INVALID_STATE` | Confirm/Decline auf falschem Status |
| 429 | `RATE_LIMITED` | siehe §10 |

## 10. Sicherheit / Betrieb

- Rate Limit auf `POST /v1/slot-holds` (z. B. 10/min pro `X-Client-Token` **und**
  pro IP) via `@fastify/rate-limit`.
- Body-Limit klein (`bodyLimit` in Fastify), keine Datei-Uploads in B.
- `ADMIN_API_TOKEN` nur aus Env, nie im Log; Logs strukturieren (bereits `logger: true`).
- Parametrisierte Queries durchgängig (Kysely).
- `audit_event` ist append-only (kein `UPDATE`/`DELETE` im App-Code).

## 11. Offene Annahmen (Review-Punkte)

1. **`weekday`-Kodierung:** ISO 1–7 (Mo–So). Alternativ 0–6 (So–Sa) — muss zur
   Luxon-Nutzung passen (`DateTime.weekday` ist 1–7).
2. **Hold-TTL 48 h:** lange Blockade eines realen Slots ohne Zahlung. Vertretbar,
   weil B2 später `PAYMENT_PENDING` mit kürzerer Frist einführt. Ggf. für B auf
   24 h reduzieren.
3. **Ressourcen-Auto-Zuweisung** = kleinste freie ID. Kein „Stamm-Arbeitsplatz"
   pro Artist im MVP.
4. **Ein Puffer-Paar pro `service_type`**, nicht pro Artist.
5. **`customer`-Dedup** nur über `chayns_person_id`; anonyme Mehrfachanfragen
   erzeugen mehrere Datensätze.
6. **Kein serverseitiger chayns-Token-Check** in B (`chaynsPersonId` unbestätigt).
7. **`MIN_LEAD_HOURS` = 12** (aus dem bestehenden `availability.ts` übernommen).
8. Der `confirm`-Endpoint verlangt **keinen** Deposit-Nachweis (Feld optional) —
   in B2 wird CONFIRMED an ein echtes Shop-Ereignis gebunden.

## 12. Teststrategie

### 12.1 Domain-Unit (`vitest`, ohne DB)

- Regel-Expansion über einen Zeitraum inkl. `valid_from`/`valid_to`-Grenzen
- Puffer-Mathematik: `starts_at`/`ends_at` vs. `session_*`
- DST: Slot am Tag der Frühjahrs-Umstellung (keine nicht-existente Ortszeit),
  am Tag der Herbst-Umstellung (keine doppelte Ortszeit)
- Deposit-Auflösung aus `service_type`
- Statusübergangs-Guards (erlaubte/verbotene Transitionen)
- Opak-Slot-ID: encode/decode-Roundtrip

### 12.2 DB-Integration (Testcontainers oder lokale Test-DB)

- Beide Exclusion-Constraints greifen (Artist-Overlap, Ressourcen-Overlap)
- `[start, end)`: Termin darf exakt am Ende des vorherigen beginnen
- Stale-Hold-Cleanup gibt den Slot frei
- Migration läuft sauber von leer; `002_seed` idempotent

### 12.3 API (`app.inject`)

- `GET /v1/availability`: Regeln − Sperren − Blocks − Puffer, `artistId=any`
- **20 parallele `POST /v1/slot-holds` auf denselben Slot → genau 1 × `201`,
  19 × `409`** (§18.2.1 des Konzepts)
- Idempotency-Replay: gleicher Key → identische Antwort, kein zweiter Block
- Idempotency-Missbrauch: gleicher Key + anderer Body → `409`
- `409 SLOT_CONFLICT` enthält `alternativeSlots[]`
- `DELETE /slot-holds/{id}` nur mit passendem `X-Client-Token`
- `confirm` erzeugt `appointment`, `expires_at = NULL`, `outbox_event`
- `confirm`/`decline` ohne `ADMIN_API_TOKEN` → `401`
- `confirm` auf bereits `CANCELLED` → `409 INVALID_STATE`

### 12.4 Zeitzone

- Verfügbarkeit über einen DST-Wechsel hinweg: keine doppelten/fehlenden Slots.

## 13. Auswirkungen auf das Repo

| Pfad | Änderung |
|---|---|
| `apps/api/migrations/` | Inhalt von `001_initial_booking.sql` durch das Schema aus §2 ersetzen; neu `002_seed_reference_data.sql` (nichts ist deployt, `schema_migration` startet leer) |
| `apps/api/src/availability.ts` | ersetzt durch DB-gestützte Engine (`src/availability/`) |
| `apps/api/src/catalog.ts` | liest aus DB oder entfällt |
| `apps/api/src/repository.ts` | erweitert um Hold-/Block-Repository; `MemoryBookingRequestRepository` nur noch für Alt-Endpoint |
| `apps/api/src/app.ts` | neue Routen `/v1/availability`, `/v1/slot-holds`, `/v1/admin/holds/*` |
| `apps/api/src/database/types.ts` | neue Kysely-Tabellentypen |
| `apps/worker/` | **neu** — Worker-Prozess, `package.json`, `tsconfig.json` |
| `packages/contracts/src/` | neue Schemas (§7), nach Domäne aufgeteilt |
| `package.json` (root) | `dev`-Task um den Worker erweitern (`concurrently`) |
| `compose.yaml` | unverändert (Postgres reicht) |
| `.env.example` | `ADMIN_API_TOKEN`, `HOLD_TTL_HOURS`, `GRID_MINUTES`, `MIN_LEAD_HOURS`, `WORKER_INTERVAL_SECONDS` |
| `CLAUDE.md` | Worker-Kommandos, neues Datenmodell, Engine-Hinweis |

## 14. Definition of Done

- Migration + Seed laufen reproduzierbar gegen eine leere DB.
- `GET /v1/availability` liefert korrekte Slots aus Regeln/Sperren/Blocks/Puffern.
- 20-parallele-Holds-Test grün: genau ein Erfolg.
- Idempotency-Replay- und -Missbrauch-Tests grün.
- Hold läuft nach `HOLD_TTL_HOURS` ab (Worker) und der Slot wird wieder angeboten.
- `confirm` macht aus einem Hold ein `appointment`; `decline` gibt den Slot frei.
- DST-Tests grün.
- `npm test` (alle Workspaces) grün; `npm run check-types` grün.
- `CLAUDE.md` und `.env.example` aktualisiert.

## 15. Nachgelagerte Specs (nicht Teil von B)

- **B2 — chayns-Shop & Anzahlung:** `POST /v1/checkouts`, chayns.Codes-Adapter,
  `order.create`, Warenkorb-Weiterleitung, `POST /v1/integrations/chayns/shop-events`
  (idempotent), Outbox-Zustellung, Reconciliation, `HELD → PAYMENT_PENDING → CONFIRMED`
  über echtes Shop-Ereignis. **Blockiert** durch chayns-Einrichtung (Weg X).
- **C — Anfrage-Wizard & Uploads:** mehrstufiges UI, `localStorage`-Zwischenspeichern,
  signierte S3/MinIO-Uploads, `media_assets`, `inquiries` (löst `booking_request` ab),
  Altersbestätigung.
- **D — Benachrichtigung:** SMTP (Mailpit lokal) + chayns.Codes-Nachricht,
  Outbox-Zusteller, Retry.
- **A — Marketing-Site:** React-Custom-Page-Shell, Content-Modell + Content-Datei,
  öffentliche Seiten.
