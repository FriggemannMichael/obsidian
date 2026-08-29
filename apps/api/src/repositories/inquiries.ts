// apps/api/src/repositories/inquiries.ts
import type { Kysely, Selectable } from 'kysely';
import type { Database, InquiryStatus, InquiryTable } from '../database/types.js';
import type { MediaAssetRow } from './media.js';

export type InquiryRow = Selectable<InquiryTable>;

export const insertInquiry = (
    exec: Kysely<Database>,
    i: {
        serviceTypeId: string;
        preferredArtistId: string | null;
        preferredStartsAt: string | null;
        sizeCm: number | null;
        description: string;
        customerId: string;
        clientToken: string;
        acceptedTermsAt: string;
    },
): Promise<InquiryRow> =>
    exec
        .insertInto('inquiry')
        .values({
            service_type_id: i.serviceTypeId,
            preferred_artist_id: i.preferredArtistId,
            preferred_starts_at: i.preferredStartsAt,
            size_cm: i.sizeCm,
            description: i.description,
            status: 'NEW',
            customer_id: i.customerId,
            client_token: i.clientToken,
            accepted_terms_at: i.acceptedTermsAt,
        })
        .returningAll()
        .executeTakeFirstOrThrow();

export const insertInquiryRegions = async (
    exec: Kysely<Database>,
    inquiryId: string,
    regionCodes: string[],
) => {
    if (regionCodes.length === 0) return;
    await exec
        .insertInto('inquiry_region')
        .values(regionCodes.map((region_code) => ({ inquiry_id: inquiryId, region_code })))
        .execute();
};

export const getInquiryById = async (exec: Kysely<Database>, id: string) => {
    const row = await exec.selectFrom('inquiry').selectAll().where('id', '=', id).executeTakeFirst();
    if (!row) return undefined;
    const regions = (
        await exec.selectFrom('inquiry_region').select('region_code').where('inquiry_id', '=', id).execute()
    ).map((r) => r.region_code);
    const images = (await exec
        .selectFrom('media_asset')
        .selectAll()
        .where('inquiry_id', '=', id)
        .orderBy('created_at', 'asc')
        .execute()) as MediaAssetRow[];
    return { ...row, regions, images };
};

export const listInquiries = async (exec: Kysely<Database>, q: { status?: string; limit: number }) => {
    let query = exec
        .selectFrom('inquiry as i')
        .innerJoin('service_type as s', 's.id', 'i.service_type_id')
        .innerJoin('customer as c', 'c.id', 'i.customer_id')
        .selectAll('i')
        .select(({ selectFrom }) => [
            's.name as service_type_name',
            'c.first_name as first_name',
            'c.last_name as last_name',
            selectFrom('inquiry_region as r')
                .select(({ fn }) => fn.countAll<number>().as('n'))
                .whereRef('r.inquiry_id', '=', 'i.id')
                .as('region_count'),
            selectFrom('media_asset as m')
                .select(({ fn }) => fn.countAll<number>().as('n'))
                .whereRef('m.inquiry_id', '=', 'i.id')
                .as('image_count'),
        ])
        .orderBy('i.created_at', 'desc')
        .limit(q.limit);
    if (q.status) query = query.where('i.status', '=', q.status as InquiryStatus);
    const rows = await query.execute();
    return rows.map((r) => ({
        ...r,
        serviceTypeName: r.service_type_name,
        customerName: `${r.first_name} ${r.last_name}`,
        regionCount: Number(r.region_count),
        imageCount: Number(r.image_count),
    }));
};

export const transitionInquiry = async (
    exec: Kysely<Database>,
    id: string,
    to: InquiryStatus,
    patch: { studioNote?: string; needsInfoMessage?: string; declineReason?: string },
) => {
    await exec
        .updateTable('inquiry')
        .set({
            status: to,
            updated_at: new Date(),
            ...(patch.studioNote !== undefined ? { studio_note: patch.studioNote } : {}),
            ...(patch.needsInfoMessage !== undefined ? { needs_info_message: patch.needsInfoMessage } : {}),
            ...(patch.declineReason !== undefined ? { decline_reason: patch.declineReason } : {}),
        })
        .where('id', '=', id)
        .execute();
};
