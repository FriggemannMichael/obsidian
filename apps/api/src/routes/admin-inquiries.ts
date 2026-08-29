import type { FastifyInstance, FastifyReply } from 'fastify';
import type { Kysely } from 'kysely';
import {
    inquiryAcceptRequestSchema,
    inquiryDeclineRequestSchema,
    inquiryNeedsInfoRequestSchema,
} from '@tattoo-studio/contracts';
import type { AppConfig } from '../config.js';
import type { Database } from '../database/types.js';
import { requireAdmin } from '../plugins/admin-auth.js';
import { InquiryInvalidStateError } from '../domain/inquiry-status.js';
import {
    acceptInquiry,
    declineInquiry,
    getInquiryDetail,
    InquiryNotFoundError,
    listInquiriesForStudio,
    needsInfoInquiry,
} from '../services/admin-inquiry-service.js';

export const adminInquiryRoutes = async (
    app: FastifyInstance,
    opts: { db: Kysely<Database>; config: AppConfig },
) => {
    app.addHook('preHandler', requireAdmin(opts.config.adminApiToken));

    const mapError = (reply: FastifyReply, e: unknown) => {
        if (e instanceof InquiryNotFoundError) {
            return reply.status(404).send({ code: 'INQUIRY_NOT_FOUND', message: 'Anfrage nicht gefunden.' });
        }
        if (e instanceof InquiryInvalidStateError) {
            return reply
                .status(409)
                .send({ code: 'INVALID_STATE', message: `Aktion im Status ${e.from} nicht möglich.` });
        }
        throw e;
    };

    app.get<{ Querystring: { status?: string; limit?: string } }>(
        '/v1/admin/inquiries',
        async (request) => {
            const limit = Math.min(Number(request.query.limit ?? 50) || 50, 200);
            return listInquiriesForStudio(opts.db, { status: request.query.status, limit });
        },
    );

    app.get<{ Params: { id: string } }>('/v1/admin/inquiries/:id', async (request, reply) => {
        try {
            return await getInquiryDetail(opts.db, request.params.id);
        } catch (e) {
            return mapError(reply, e);
        }
    });

    app.post<{ Params: { id: string } }>('/v1/admin/inquiries/:id/accept', async (request, reply) => {
        const parsed = inquiryAcceptRequestSchema.safeParse(request.body ?? {});
        if (!parsed.success) {
            return reply.status(400).send({ code: 'VALIDATION_ERROR', message: 'Ungültiger Body.' });
        }
        try {
            await acceptInquiry(opts.db, request.params.id, { studioNote: parsed.data.studioNote });
            return { ok: true };
        } catch (e) {
            return mapError(reply, e);
        }
    });

    app.post<{ Params: { id: string } }>('/v1/admin/inquiries/:id/needs-info', async (request, reply) => {
        const parsed = inquiryNeedsInfoRequestSchema.safeParse(request.body);
        if (!parsed.success) {
            return reply.status(400).send({ code: 'VALIDATION_ERROR', message: 'message ist erforderlich.' });
        }
        try {
            await needsInfoInquiry(opts.db, request.params.id, parsed.data.message);
            return { ok: true };
        } catch (e) {
            return mapError(reply, e);
        }
    });

    app.post<{ Params: { id: string } }>('/v1/admin/inquiries/:id/decline', async (request, reply) => {
        const parsed = inquiryDeclineRequestSchema.safeParse(request.body);
        if (!parsed.success) {
            return reply.status(400).send({ code: 'VALIDATION_ERROR', message: 'reason ist erforderlich.' });
        }
        try {
            await declineInquiry(opts.db, request.params.id, parsed.data.reason);
            return { ok: true };
        } catch (e) {
            return mapError(reply, e);
        }
    });
};
