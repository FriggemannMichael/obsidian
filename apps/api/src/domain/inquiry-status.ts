import type { InquiryStatus } from '../database/types.js';

export const INQUIRY_TRANSITIONS: Record<InquiryStatus, readonly InquiryStatus[]> = {
    NEW: ['IN_REVIEW', 'DECLINED'],
    IN_REVIEW: ['ACCEPTED', 'NEEDS_INFO', 'DECLINED'],
    NEEDS_INFO: ['IN_REVIEW', 'ACCEPTED', 'DECLINED'],
    ACCEPTED: [],
    DECLINED: [],
};

export class InquiryInvalidStateError extends Error {
    readonly from: InquiryStatus;
    readonly to: InquiryStatus;
    constructor(from: InquiryStatus, to: InquiryStatus) {
        super(`Cannot transition inquiry from ${from} to ${to}`);
        this.name = 'InquiryInvalidStateError';
        this.from = from;
        this.to = to;
    }
}

export const canTransitionInquiry = (from: InquiryStatus, to: InquiryStatus): boolean =>
    INQUIRY_TRANSITIONS[from].includes(to);

export const assertInquiryTransition = (from: InquiryStatus, to: InquiryStatus): void => {
    if (!canTransitionInquiry(from, to)) throw new InquiryInvalidStateError(from, to);
};
