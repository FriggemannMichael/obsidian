import type { FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import { availabilityQuerySchema } from '@tattoo-studio/contracts';
import type { AppConfig } from '../config.js';
import type { Database } from '../database/types.js';
import {
    ArtistNotFoundError,
    getAvailability,
    ServiceTypeNotFoundError,
} from '../services/availability-service.js';

export const availabilityRoutes = async (
    app: FastifyInstance,
    opts: { db: Kysely<Database>; config: AppConfig },
) => {
    app.get('/v1/availability', async (request, reply) => {
        const parsed = availabilityQuerySchema.safeParse(request.query);
        if (!parsed.success) {
            return reply.status(400).send({
                code: 'VALIDATION_ERROR',
                message: 'Die Abfrageparameter sind ungültig.',
                issues: parsed.error.issues.map((i) => ({
                    path: i.path.join('.'),
                    message: i.message,
                })),
            });
        }
        try {
            return await getAvailability(opts.db, opts.config, parsed.data);
        } catch (err) {
            if (err instanceof ServiceTypeNotFoundError) {
                return reply
                    .status(404)
                    .send({ code: 'SERVICE_TYPE_NOT_FOUND', message: 'Terminart nicht gefunden.' });
            }
            if (err instanceof ArtistNotFoundError) {
                return reply
                    .status(404)
                    .send({ code: 'ARTIST_NOT_FOUND', message: 'Artist nicht gefunden.' });
            }
            throw err;
        }
    });
};
