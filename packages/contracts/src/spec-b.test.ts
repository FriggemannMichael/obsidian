import { describe, expect, it } from 'vitest';
import {
    availabilityQuerySchema,
    slotHoldRequestSchema,
    holdConfirmRequestSchema,
    apiErrorSchema,
} from './index.js';

describe('spec B contracts', () => {
    it('defaults availability query fields', () => {
        const q = availabilityQuerySchema.parse({ serviceTypeId: 'small-tattoo', from: '2026-09-01' });
        expect(q).toMatchObject({ artistId: 'any', days: 14 });
    });

    it('rejects days over 31', () => {
        expect(() =>
            availabilityQuerySchema.parse({ serviceTypeId: 's', from: '2026-09-01', days: 40 }),
        ).toThrow();
    });

    it('validates a slot hold request', () => {
        const body = {
            serviceTypeId: 'small-tattoo',
            artistId: 'mara',
            startsAt: '2026-09-01T08:00:00.000Z',
            customer: { firstName: 'Ann', lastName: 'Roe', email: 'a@b.de', phone: '+49 111 222' },
        };
        expect(slotHoldRequestSchema.parse(body)).toMatchObject({ artistId: 'mara' });
    });

    it('rejects a slot hold request with a bad email', () => {
        expect(() =>
            slotHoldRequestSchema.parse({
                serviceTypeId: 's',
                artistId: 'a',
                startsAt: '2026-09-01T08:00:00.000Z',
                customer: { firstName: 'Ann', lastName: 'Roe', email: 'nope', phone: '123456' },
            }),
        ).toThrow();
    });

    it('accepts an empty confirm body', () => {
        expect(holdConfirmRequestSchema.parse({})).toEqual({});
    });

    it('describes an api error', () => {
        expect(apiErrorSchema.parse({ code: 'SLOT_CONFLICT', message: 'x' }).code).toBe('SLOT_CONFLICT');
    });
});
