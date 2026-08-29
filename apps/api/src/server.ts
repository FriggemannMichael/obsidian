import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { createDatabase } from './database/client.js';
import {
    MemoryBookingRequestRepository,
    PostgresBookingRequestRepository,
} from './repository.js';

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? '0.0.0.0';

const dbUrl = process.env.DATABASE_URL;
const db = dbUrl ? createDatabase(dbUrl) : undefined;
const config = db ? loadConfig() : undefined;
const repository = db
    ? new PostgresBookingRequestRepository(db)
    : new MemoryBookingRequestRepository();

const app = buildApp({ logger: true, repository, config, db });

if (!dbUrl) {
    app.log.warn(
        'DATABASE_URL fehlt: /v1/*-Kalenderrouten sind deaktiviert, Anfragen nur im Arbeitsspeicher.',
    );
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
