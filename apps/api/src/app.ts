import cors from '@fastify/cors';
import {
    legacyAvailabilityQuerySchema,
    createBookingRequestSchema,
} from '@tattoo-studio/contracts';
import Fastify from 'fastify';
import type { Kysely } from 'kysely';
import { createAvailability } from './availability.js';
import { findServiceType, serviceTypes } from './catalog.js';
import type { AppConfig } from './config.js';
import type { Database } from './database/types.js';
import { registerRateLimit } from './plugins/rate-limit.js';
import { adminHoldRoutes } from './routes/admin-holds.js';
import { availabilityRoutes } from './routes/availability.js';
import { slotHoldRoutes } from './routes/slot-holds.js';
import {
    MemoryBookingRequestRepository,
    type BookingRequestRepository,
} from './repository.js';

type BuildAppOptions = {
    repository?: BookingRequestRepository;
    logger?: boolean;
    config?: AppConfig;
    db?: Kysely<Database>;
};

const validationError = (issues: { path: PropertyKey[]; message: string }[]) => ({
    code: 'VALIDATION_ERROR',
    message: 'Die übermittelten Daten sind unvollständig oder ungültig.',
    issues: issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
});

export const buildApp = (options: BuildAppOptions = {}) => {
    const app = Fastify({ logger: options.logger ?? false });
    const repository: BookingRequestRepository =
        options.repository ?? new MemoryBookingRequestRepository();

    app.addHook('onClose', async () => {
        await repository.close?.();
    });

    app.register(cors, {
        origin: true,
        methods: ['GET', 'POST'],
    });

    app.get('/health', async (_request, reply) => {
        try {
            await repository.check();
            return { status: 'ok', persistence: repository.persistence };
        } catch {
            return reply.status(503).send({ status: 'unavailable' });
        }
    });

    if (options.db && options.config) {
        registerRateLimit(app);
        app.register(availabilityRoutes, { db: options.db, config: options.config });
        app.register(slotHoldRoutes, { db: options.db, config: options.config });
        app.register(adminHoldRoutes, { db: options.db, config: options.config });
    }

    app.get('/api/v1/service-types', async () => ({ items: serviceTypes }));

    app.get('/api/v1/availability', async (request, reply) => {
        const result = legacyAvailabilityQuerySchema.safeParse(request.query);

        if (!result.success) {
            return reply.status(400).send(validationError(result.error.issues));
        }

        const serviceType = findServiceType(result.data.serviceTypeId);

        if (!serviceType) {
            return reply.status(404).send({
                code: 'SERVICE_TYPE_NOT_FOUND',
                message: 'Die gewählte Terminart wurde nicht gefunden.',
            });
        }

        return {
            timezone: 'Europe/Berlin' as const,
            serviceType,
            slots: createAvailability(serviceType, result.data.from, result.data.days),
        };
    });

    app.post('/api/v1/booking-requests', async (request, reply) => {
        const result = createBookingRequestSchema.safeParse(request.body);

        if (!result.success) {
            return reply.status(400).send(validationError(result.error.issues));
        }

        const bookingRequest = await repository.create(result.data);
        return reply.status(201).send({ request: bookingRequest });
    });

    return app;
};
