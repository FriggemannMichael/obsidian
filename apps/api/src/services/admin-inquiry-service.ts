// apps/api/src/services/admin-inquiry-service.ts
import type { Kysely } from 'kysely';
import type {
    InquiryDetail,
    InquiryListItem,
} from '@tattoo-studio/contracts';
import type { Database, InquiryStatus } from '../database/types.js';
import { assertInquiryTransition } from '../domain/inquiry-status.js';
import { getInquiryById, listInquiries, transitionInquiry } from '../repositories/inquiries.js';
import { recordAudit } from '../repositories/audit.js';
import { enqueueOutbox } from '../repositories/outbox.js';

export class InquiryNotFoundError extends Error {}

export const listInquiriesForStudio = async (
    db: Kysely<Database>,
    q: { status?: string; limit: number },
): Promise<InquiryListItem[]> => {
    const rows = await listInquiries(db, q);
    return rows.map((r) => ({
        id: r.id,
        status: r.status,
        serviceTypeId: r.service_type_id,
        serviceTypeName: r.serviceTypeName,
        preferredArtistId: r.preferred_artist_id,
        preferredStartsAt: r.preferred_starts_at ? new Date(r.preferred_starts_at).toISOString() : null,
        customerName: r.customerName,
        sizeCm: r.size_cm,
        regionCount: r.regionCount,
        imageCount: r.imageCount,
        createdAt: new Date(r.created_at).toISOString(),
    }));
};

export const getInquiryDetail = async (
    db: Kysely<Database>,
    id: string,
): Promise<InquiryDetail> => {
    const existing = await getInquiryById(db, id);
    if (!existing) throw new InquiryNotFoundError(id);

    if (existing.status === 'NEW') {
        await db.transaction().execute(async (trx) => {
            await transitionInquiry(trx, id, 'IN_REVIEW', {});
            await recordAudit(trx, {
                actor: 'system',
                action: 'inquiry.reviewed',
                entityType: 'inquiry',
                entityId: id,
                after: { status: 'IN_REVIEW' },
            });
        });
    }

    const inq = await getInquiryById(db, id);
    if (!inq) throw new InquiryNotFoundError(id);
    const st = await db
        .selectFrom('service_type')
        .select('name')
        .where('id', '=', inq.service_type_id)
        .executeTakeFirst();
    const customer = await db
        .selectFrom('customer')
        .selectAll()
        .where('id', '=', inq.customer_id)
        .executeTakeFirstOrThrow();

    return {
        id: inq.id,
        status: inq.status,
        serviceTypeId: inq.service_type_id,
        serviceTypeName: st?.name ?? inq.service_type_id,
        preferredArtistId: inq.preferred_artist_id,
        preferredStartsAt: inq.preferred_starts_at ? new Date(inq.preferred_starts_at).toISOString() : null,
        customerName: `${customer.first_name} ${customer.last_name}`,
        sizeCm: inq.size_cm,
        regionCount: inq.regions.length,
        imageCount: inq.images.length,
        createdAt: new Date(inq.created_at).toISOString(),
        description: inq.description,
        bodyRegions: inq.regions as InquiryDetail['bodyRegions'],
        customer: {
            firstName: customer.first_name,
            lastName: customer.last_name,
            email: customer.email,
            phone: customer.phone,
        },
        chaynsPersonId: customer.chayns_person_id,
        images: inq.images.map((m) => ({
            id: m.id,
            url: `/v1/uploads/${m.id}`,
            width: m.width,
            height: m.height,
        })),
        studioNote: inq.studio_note,
        needsInfoMessage: inq.needs_info_message,
        declineReason: inq.decline_reason,
        acceptedTermsAt: new Date(inq.accepted_terms_at).toISOString(),
    };
};

const act = async (
    db: Kysely<Database>,
    id: string,
    to: InquiryStatus,
    action: string,
    outboxType: string,
    patch: { studioNote?: string; needsInfoMessage?: string; declineReason?: string },
) => {
    await db.transaction().execute(async (trx) => {
        const inq = await getInquiryById(trx, id);
        if (!inq) throw new InquiryNotFoundError(id);
        assertInquiryTransition(inq.status, to);
        await transitionInquiry(trx, id, to, patch);
        await recordAudit(trx, {
            actor: 'studio',
            action,
            entityType: 'inquiry',
            entityId: id,
            before: { status: inq.status },
            after: { status: to, ...patch },
        });
        await enqueueOutbox(trx, { type: outboxType, payload: { inquiryId: id } });
    });
};

export const acceptInquiry = (db: Kysely<Database>, id: string, patch: { studioNote?: string }) =>
    act(db, id, 'ACCEPTED', 'inquiry.accepted', 'inquiry.accepted', { studioNote: patch.studioNote });

export const needsInfoInquiry = (db: Kysely<Database>, id: string, message: string) =>
    act(db, id, 'NEEDS_INFO', 'inquiry.needs_info', 'inquiry.needs_info', { needsInfoMessage: message });

export const declineInquiry = (db: Kysely<Database>, id: string, reason: string) =>
    act(db, id, 'DECLINED', 'inquiry.declined', 'inquiry.declined', { declineReason: reason });
