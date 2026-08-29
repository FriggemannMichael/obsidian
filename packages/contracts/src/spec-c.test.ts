import { describe, expect, it } from 'vitest';
import {
    createInquirySchema,
    inquiryDeclineRequestSchema,
    inquiryNeedsInfoRequestSchema,
    uploadResultSchema,
    serviceTypesResponseSchema,
} from './index.js';

const validBody = {
    serviceTypeId: 'small-tattoo',
    bodyRegions: ['front.upper_arm.left'],
    customer: { firstName: 'Ann', lastName: 'Roe', email: 'a@b.de', phone: '+49 111 222' },
    acceptsTerms: true,
};

describe('spec C contracts', () => {
    it('defaults optional inquiry fields', () => {
        const q = createInquirySchema.parse(validBody);
        expect(q).toMatchObject({ preferredArtistId: 'any', description: '', referenceImageIds: [] });
    });

    it('requires at least one body region', () => {
        expect(createInquirySchema.safeParse({ ...validBody, bodyRegions: [] }).success).toBe(false);
    });

    it('rejects more than 5 reference images', () => {
        const ids = Array.from({ length: 6 }, () => crypto.randomUUID());
        expect(createInquirySchema.safeParse({ ...validBody, referenceImageIds: ids }).success).toBe(false);
    });

    it('rejects an unchecked consent and a bad email', () => {
        expect(createInquirySchema.safeParse({ ...validBody, acceptsTerms: false }).success).toBe(false);
        expect(
            createInquirySchema.safeParse({ ...validBody, customer: { ...validBody.customer, email: 'x' } }).success,
        ).toBe(false);
    });

    it('validates the admin action bodies', () => {
        expect(inquiryDeclineRequestSchema.parse({ reason: 'passt nicht' }).reason).toBe('passt nicht');
        expect(inquiryNeedsInfoRequestSchema.safeParse({ message: '' }).success).toBe(false);
    });

    it('describes an upload result and a service-type list', () => {
        const u = uploadResultSchema.parse({
            uploadId: crypto.randomUUID(), url: '/v1/uploads/x', contentType: 'image/jpeg',
            width: 800, height: 600, byteSize: 1234,
        });
        expect(u.contentType).toBe('image/jpeg');
        expect(serviceTypesResponseSchema.parse({ items: [] }).items).toEqual([]);
    });
});
