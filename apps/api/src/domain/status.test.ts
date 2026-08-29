import { describe, expect, it } from 'vitest';
import { assertTransition, canTransition, InvalidStateError } from './status.js';

describe('block status transitions', () => {
    it('allows the hold lifecycle', () => {
        expect(canTransition('HELD', 'EXPIRED')).toBe(true);
        expect(canTransition('HELD', 'CANCELLED')).toBe(true);
        expect(canTransition('HELD', 'CONFIRMED')).toBe(true);
        expect(canTransition('PAYMENT_PENDING', 'CONFIRMED')).toBe(true);
        expect(canTransition('CONFIRMED', 'COMPLETED')).toBe(true);
    });

    it('forbids resurrecting a terminal state', () => {
        expect(canTransition('CANCELLED', 'CONFIRMED')).toBe(false);
        expect(canTransition('EXPIRED', 'HELD')).toBe(false);
        expect(canTransition('COMPLETED', 'CONFIRMED')).toBe(false);
    });

    it('assertTransition throws with context', () => {
        try {
            assertTransition('EXPIRED', 'CONFIRMED');
            throw new Error('should have thrown');
        } catch (e) {
            expect(e).toBeInstanceOf(InvalidStateError);
            expect((e as InvalidStateError).from).toBe('EXPIRED');
        }
    });
});
