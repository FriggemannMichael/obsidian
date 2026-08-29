// apps/api/src/services/inquiry-service.ts
import type { Kysely } from 'kysely';
import type { CreateInquiry } from '@tattoo-studio/contracts';
import type { Database } from '../database/types.js';
import { upsertCustomer } from '../repositories/customer.js';
import { insertInquiry, insertInquiryRegions } from '../repositories/inquiries.js';
import { linkMediaAssets } from '../repositories/media.js';
import { getActiveArtistsForService, getServiceType } from '../repositories/reference.js';
import {
    findIdempotencyRecord,
    hashRequestBody,
    saveIdempotencyRecord,
} from '../repositories/idempotency.js';
import { enqueueOutbox } from '../repositories/outbox.js';
import { recordAudit } from '../repositories/audit.js';

export class InquiryServiceTypeNotFound extends Error {}
export class InquiryArtistNotFound extends Error {}

export const createInquiry = async (
    db: Kysely<Database>,
    input: { idempotencyKey: string; clientToken: string; body: CreateInquiry },
): Promise<{ statusCode: number; payload: unknown }> => {
    const requestHash = hashRequestBody(input.body);
    return db.transaction().execute(async (trx) => {
        const replay = await findIdempotencyRecord(trx, input.idempotencyKey);
        if (replay) {
            if (replay.requestHash !== requestHash) {
                return {
                    statusCode: 409,
                    payload: {
                        code: 'IDEMPOTENCY_KEY_REUSED',
                        message: 'Idempotency-Key bereits mit anderem Inhalt verwendet.',
                    },
                };
            }
            return { statusCode: replay.statusCode, payload: replay.responseJson };
        }

        const st = await getServiceType(trx, input.body.serviceTypeId);
        if (!st) throw new InquiryServiceTypeNotFound(input.body.serviceTypeId);

        const preferredArtistId =
            input.body.preferredArtistId === 'any' ? null : input.body.preferredArtistId;
        if (preferredArtistId) {
            const artists = await getActiveArtistsForService(trx, st.id);
            if (!artists.some((a) => a.id === preferredArtistId)) {
                throw new InquiryArtistNotFound(preferredArtistId);
            }
        }

        const customerId = await upsertCustomer(trx, {
            chaynsPersonId: input.body.chaynsPersonId,
            ...input.body.customer,
        });

        const inquiry = await insertInquiry(trx, {
            serviceTypeId: st.id,
            preferredArtistId,
            preferredStartsAt: input.body.preferredStartsAt ?? null,
            sizeCm: input.body.sizeCm ?? null,
            description: input.body.description,
            customerId,
            clientToken: input.clientToken,
            acceptedTermsAt: new Date().toISOString(),
        });

        await insertInquiryRegions(trx, inquiry.id, input.body.bodyRegions);
        if (input.body.referenceImageIds.length > 0) {
            await linkMediaAssets(trx, {
                ids: input.body.referenceImageIds,
                inquiryId: inquiry.id,
                clientToken: input.clientToken,
            });
        }

        const payload = {
            inquiryId: inquiry.id,
            status: 'NEW' as const,
            reference: inquiry.id.slice(0, 8),
            createdAt: new Date(inquiry.created_at).toISOString(),
        };
        const actor = input.body.chaynsPersonId
            ? `chayns:${input.body.chaynsPersonId}`
            : `anon:${input.clientToken.slice(0, 8)}`;
        await recordAudit(trx, {
            actor,
            action: 'inquiry.created',
            entityType: 'inquiry',
            entityId: inquiry.id,
            after: payload,
        });
        await enqueueOutbox(trx, { type: 'inquiry.created', payload: { inquiryId: inquiry.id } });
        await saveIdempotencyRecord(trx, {
            key: input.idempotencyKey,
            route: 'POST /v1/inquiries',
            requestHash,
            responseJson: payload,
            statusCode: 201,
            ttlHours: 24,
        });

        return { statusCode: 201, payload };
    });
};
