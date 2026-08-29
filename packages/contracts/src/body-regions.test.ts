import { describe, expect, it } from 'vitest';
import { bodyRegionCodeSchema, bodyRegionLabels } from './index.js';

describe('body regions', () => {
    it('has 34 codes', () => {
        expect(bodyRegionCodeSchema.options).toHaveLength(34);
    });

    it('has a German label for every code', () => {
        for (const code of bodyRegionCodeSchema.options) {
            expect(typeof bodyRegionLabels[code]).toBe('string');
            expect(bodyRegionLabels[code].length).toBeGreaterThan(0);
        }
    });

    it('rejects an unknown code', () => {
        expect(bodyRegionCodeSchema.safeParse('front.nose').success).toBe(false);
    });
});
