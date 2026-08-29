import { describe, expect, it } from 'vitest';
import { decodeSlotId, encodeSlotId, InvalidSlotIdError } from './slot-id.js';

describe('slot id', () => {
    const parts = {
        artistId: 'mara',
        serviceTypeId: 'small-tattoo',
        startsAt: '2026-09-01T08:00:00.000Z',
    };

    it('round-trips', () => {
        expect(decodeSlotId(encodeSlotId(parts))).toEqual(parts);
    });

    it('produces url-safe output', () => {
        expect(encodeSlotId(parts)).toMatch(/^[A-Za-z0-9_-]+$/);
    });

    it('rejects garbage', () => {
        expect(() => decodeSlotId('not-valid')).toThrow(InvalidSlotIdError);
    });

    it('rejects a token with too few parts', () => {
        expect(() => decodeSlotId(Buffer.from('a|b', 'utf8').toString('base64url'))).toThrow(
            InvalidSlotIdError,
        );
    });
});
