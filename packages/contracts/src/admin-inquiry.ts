import { z } from 'zod';
import { bodyRegionCodeSchema } from './body-regions.js';
import { inquiryStatusSchema } from './inquiry.js';

export const inquiryListItemSchema = z.object({
    id: z.string().uuid(),
    status: inquiryStatusSchema,
    serviceTypeId: z.string(),
    serviceTypeName: z.string(),
    preferredArtistId: z.string().nullable(),
    preferredStartsAt: z.string().datetime({ offset: true }).nullable(),
    customerName: z.string(),
    sizeCm: z.number().int().nullable(),
    regionCount: z.number().int(),
    imageCount: z.number().int(),
    createdAt: z.string().datetime({ offset: true }),
});
export type InquiryListItem = z.infer<typeof inquiryListItemSchema>;

export const inquiryImageSchema = z.object({
    id: z.string().uuid(),
    url: z.string(),
    width: z.number().int().positive().nullable(),
    height: z.number().int().positive().nullable(),
});

export const inquiryDetailSchema = inquiryListItemSchema.extend({
    description: z.string(),
    bodyRegions: z.array(bodyRegionCodeSchema),
    customer: z.object({
        firstName: z.string(),
        lastName: z.string(),
        email: z.string(),
        phone: z.string(),
    }),
    chaynsPersonId: z.string().nullable(),
    images: z.array(inquiryImageSchema),
    studioNote: z.string().nullable(),
    needsInfoMessage: z.string().nullable(),
    declineReason: z.string().nullable(),
    acceptedTermsAt: z.string().datetime({ offset: true }),
});
export type InquiryDetail = z.infer<typeof inquiryDetailSchema>;

export const inquiryAcceptRequestSchema = z.object({
    studioNote: z.string().trim().max(2000).optional(),
});
export const inquiryNeedsInfoRequestSchema = z.object({
    message: z.string().trim().min(1).max(1000),
});
export const inquiryDeclineRequestSchema = z.object({
    reason: z.string().trim().min(1).max(500),
});
export type InquiryAcceptRequest = z.infer<typeof inquiryAcceptRequestSchema>;
export type InquiryNeedsInfoRequest = z.infer<typeof inquiryNeedsInfoRequestSchema>;
export type InquiryDeclineRequest = z.infer<typeof inquiryDeclineRequestSchema>;
