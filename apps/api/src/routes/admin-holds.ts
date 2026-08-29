import type { FastifyInstance, FastifyReply } from 'fastify';
import type { Kysely } from 'kysely';
import { holdConfirmRequestSchema, holdDeclineRequestSchema } from '@tattoo-studio/contracts';
import type { AppConfig } from '../config.js';
import type { Database } from '../database/types.js';
import { requireAdmin } from '../plugins/admin-auth.js';
import { confirmHold, declineHold, listHolds } from '../services/admin-service.js';
import { HoldNotFoundError } from '../repositories/holds.js';
import { InvalidStateError } from '../domain/status.js';

export const adminHoldRoutes = async (
    app: FastifyInstance,
    opts: { db: Kysely<Database>; config: AppConfig },
) => {
    app.addHook('preHandler', requireAdmin(opts.config.adminApiToken));

    const mapError = (reply: FastifyReply, e: unknown) => {
        if (e instanceof HoldNotFoundError) {
            return reply.status(404).send({ code: 'HOLD_NOT_FOUND', message: 'Hold nicht gefunden.' });
        }
        if (e instanceof InvalidStateError) {
            return reply
                .status(409)
                .send({ code: 'INVALID_STATE', message: `Aktion im Status ${e.from} nicht möglich.` });
        }
        throw e;
    };

    app.post<{ Params: { id: string } }>('/v1/admin/holds/:id/confirm', async (request, reply) => {
        const parsed = holdConfirmRequestSchema.safeParse(request.body ?? {});
        if (!parsed.success) {
            return reply.status(400).send({ code: 'VALIDATION_ERROR', message: 'Ungültiger Body.' });
        }
        try {
            return await confirmHold(opts.db, request.params.id, parsed.data.depositReceived);
        } catch (e) {
            return mapError(reply, e);
        }
    });

    app.post<{ Params: { id: string } }>('/v1/admin/holds/:id/decline', async (request, reply) => {
        const parsed = holdDeclineRequestSchema.safeParse(request.body);
        if (!parsed.success) {
            return reply
                .status(400)
                .send({ code: 'VALIDATION_ERROR', message: 'reason ist erforderlich.' });
        }
        try {
            await declineHold(opts.db, request.params.id, parsed.data.reason);
            return { ok: true };
        } catch (e) {
            return mapError(reply, e);
        }
    });

    app.get<{ Querystring: { status?: string; limit?: string } }>(
        '/v1/admin/holds',
        async (request) => {
            const limit = Math.min(Number(request.query.limit ?? 50) || 50, 200);
            return listHolds(opts.db, { status: request.query.status, limit });
        },
    );
};
