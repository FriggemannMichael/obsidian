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
