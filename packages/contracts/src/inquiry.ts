import { z } from 'zod';
import { bodyRegionCodeSchema } from './body-regions.js';

export const inquiryStatusSchema = z.enum(['NEW', 'IN_REVIEW', 'NEEDS_INFO', 'ACCEPTED', 'DECLINED']);
export type InquiryStatus = z.infer<typeof inquiryStatusSchema>;

export const createInquirySchema = z.object({
    serviceTypeId: z.string().min(1),
    preferredArtistId: z.string().min(1).default('any'),
    preferredStartsAt: z.iso.datetime({ offset: true }).optional(),
    bodyRegions: z.array(bodyRegionCodeSchema).min(1).max(20),
    sizeCm: z.number().int().positive().max(300).optional(),
    description: z.string().trim().max(2000).default(''),
    referenceImageIds: z.array(z.uuid()).max(5).default([]),
    customer: z.object({
        firstName: z.string().trim().min(2).max(80),
        lastName: z.string().trim().min(2).max(80),
        email: z.string().email(),
        phone: z.string().trim().min(6).max(40),
    }),
    chaynsPersonId: z.string().min(1).optional(),
    acceptsTerms: z.literal(true),
});
export type CreateInquiry = z.infer<typeof createInquirySchema>;

export const inquiryResponseSchema = z.object({
    inquiryId: z.uuid(),
    status: inquiryStatusSchema,
    reference: z.string(),
    createdAt: z.iso.datetime({ offset: true }),
});
export type InquiryResponse = z.infer<typeof inquiryResponseSchema>;
