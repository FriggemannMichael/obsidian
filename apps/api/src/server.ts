import { buildApp } from './app.js';
import { createDatabase } from './database/client.js';
import {
    MemoryBookingRequestRepository,
    PostgresBookingRequestRepository,
} from './repository.js';

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? '0.0.0.0';
const repository = process.env.DATABASE_URL
    ? new PostgresBookingRequestRepository(createDatabase(process.env.DATABASE_URL))
    : new MemoryBookingRequestRepository();
const app = buildApp({ logger: true, repository });

if (!process.env.DATABASE_URL) {
    app.log.warn('DATABASE_URL fehlt: Anfragen werden nur im Arbeitsspeicher gespeichert.');
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
