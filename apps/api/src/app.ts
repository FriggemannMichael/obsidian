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
