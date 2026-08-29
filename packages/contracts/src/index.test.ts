import { describe, expect, it } from 'vitest';
import { serviceTypeIdSchema } from './index.js';

describe('service type id', () => {
    it('accepts the three seeded ids', () => {
        expect(serviceTypeIdSchema.options).toEqual(['consultation', 'small-tattoo', 'day-session']);
    });
});
