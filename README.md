# Tattoo-Studio-Plattform für chayns

Dieses Repository enthält den ersten vertikalen MVP-Schnitt der geplanten
Tattoo-Studio-Anwendung:

- eine React-Custom-Page auf Basis des offiziellen chayns API-v5-Generators,
- eine Fastify-API für Leistungen, Verfügbarkeiten und Tattoo-Anfragen,
- ein gemeinsames Zod-Paket als verbindlicher Vertrag zwischen Front- und Backend.

## Voraussetzungen

- Node.js 24 LTS
- npm 11 oder neuer

## Lokal starten

```bash
npm install
npm run dev
```

Danach laufen standardmäßig:

- Frontend: `http://localhost:8080`
- API: `http://localhost:3000`
- API-Healthcheck: `http://localhost:3000/health`

Ohne `DATABASE_URL` verwendet die API für schnelles UI-Entwickeln einen
flüchtigen In-Memory-Speicher. Für den vollständigen lokalen Betrieb:

```powershell
npm run db:up
$env:DATABASE_URL='postgresql://tattoo:tattoo-local@localhost:5432/tattoo_studio'
npm run db:migrate
npm run dev
```

## Wichtige Befehle

```bash
npm run build
npm run check-types
npm test
```

## Struktur

```text
apps/web             React-Custom-Page und chayns-Integration
apps/api             Fastify Booking API
packages/contracts   Geteilte API-Schemas und TypeScript-Typen
docs                 Projektdokumentation
```

Das initiale Datenbankschema speichert Anfragen dauerhaft und enthält bereits
die PostgreSQL-Exclusion-Constraint für überschneidungsfreie Termin-Holds. Der
API-Endpunkt zum Erstellen solcher Holds sowie die chayns-Shop-Verknüpfung folgen
im nächsten fachlichen Schnitt.
