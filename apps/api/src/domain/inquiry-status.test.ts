import { describe, expect, it } from 'vitest';
import { assertInquiryTransition, canTransitionInquiry, InquiryInvalidStateError } from './inquiry-status.js';

describe('inquiry status transitions', () => {
    it('allows the review lifecycle', () => {
        expect(canTransitionInquiry('NEW', 'IN_REVIEW')).toBe(true);
        expect(canTransitionInquiry('NEW', 'DECLINED')).toBe(true);
        expect(canTransitionInquiry('IN_REVIEW', 'ACCEPTED')).toBe(true);
        expect(canTransitionInquiry('IN_REVIEW', 'NEEDS_INFO')).toBe(true);
        expect(canTransitionInquiry('NEEDS_INFO', 'IN_REVIEW')).toBe(true);
        expect(canTransitionInquiry('NEEDS_INFO', 'ACCEPTED')).toBe(true);
        expect(canTransitionInquiry('NEEDS_INFO', 'DECLINED')).toBe(true);
    });

    it('forbids resurrecting a terminal state and skipping review', () => {
        expect(canTransitionInquiry('ACCEPTED', 'IN_REVIEW')).toBe(false);
        expect(canTransitionInquiry('DECLINED', 'IN_REVIEW')).toBe(false);
        expect(canTransitionInquiry('NEW', 'ACCEPTED')).toBe(false);
        expect(canTransitionInquiry('NEW', 'NEEDS_INFO')).toBe(false);
    });

    it('assertInquiryTransition throws with context', () => {
        try {
            assertInquiryTransition('DECLINED', 'ACCEPTED');
            throw new Error('should have thrown');
        } catch (e) {
            expect(e).toBeInstanceOf(InquiryInvalidStateError);
            expect((e as InquiryInvalidStateError).from).toBe('DECLINED');
        }
    });
});
