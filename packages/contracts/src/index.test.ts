import { describe, expect, it } from 'vitest';
import { createBookingRequestSchema } from './index.js';

describe('createBookingRequestSchema', () => {
    it('accepts a complete tattoo request', () => {
        const result = createBookingRequestSchema.safeParse({
            serviceTypeId: 'consultation',
            slot: {
                id: 'consultation-2026-09-01T08:00:00.000Z',
                startsAt: '2026-09-01T08:00:00.000Z',
                endsAt: '2026-09-01T08:30:00.000Z',
            },
            customer: {
                firstName: 'Janine',
                lastName: 'Beispiel',
                email: 'janine@example.com',
                phone: '+49 2561 123456',
            },
            tattooIdea: 'Florales Motiv am Unterarm, ungefähr zwölf Zentimeter groß.',
            acceptsTerms: true,
        });

        expect(result.success).toBe(true);
    });

    it('rejects an unchecked consent', () => {
        const result = createBookingRequestSchema.safeParse({ acceptsTerms: false });
        expect(result.success).toBe(false);
    });
});
