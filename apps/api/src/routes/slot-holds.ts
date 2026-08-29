import type { FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import { slotHoldRequestSchema } from '@tattoo-studio/contracts';
import type { AppConfig } from '../config.js';
import type { Database } from '../database/types.js';
import { slotHoldRateLimit } from '../plugins/rate-limit.js';
import { createHold, HoldNotFoundError, releaseHoldById } from '../services/hold-service.js';

export const slotHoldRoutes = async (
    app: FastifyInstance,
    opts: { db: Kysely<Database>; config: AppConfig },
) => {
    app.post(
        '/v1/slot-holds',
        { config: { rateLimit: slotHoldRateLimit(opts.config) } },
        async (request, reply) => {
            const idempotencyKey = request.headers['idempotency-key'];
            const clientToken = request.headers['x-client-token'];
            if (typeof idempotencyKey !== 'string' || typeof clientToken !== 'string') {
                return reply.status(400).send({
                    code: 'VALIDATION_ERROR',
                    message: 'Idempotency-Key und X-Client-Token sind erforderlich.',
                });
            }
            const parsed = slotHoldRequestSchema.safeParse(request.body);
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
            const { statusCode, payload } = await createHold(opts.db, opts.config, {
                idempotencyKey,
                clientToken,
                body: parsed.data,
            });
            return reply.status(statusCode).send(payload);
        },
    );

    app.delete<{ Params: { id: string } }>('/v1/slot-holds/:id', async (request, reply) => {
        const clientToken = request.headers['x-client-token'];
        if (typeof clientToken !== 'string') {
            return reply
                .status(400)
                .send({ code: 'VALIDATION_ERROR', message: 'X-Client-Token ist erforderlich.' });
        }
        try {
            await releaseHoldById(opts.db, { id: request.params.id, clientToken });
            return reply.status(204).send();
        } catch (e) {
            if (e instanceof HoldNotFoundError) {
                return reply
                    .status(404)
                    .send({ code: 'HOLD_NOT_FOUND', message: 'Hold nicht gefunden.' });
            }
            throw e;
        }
    });
};
