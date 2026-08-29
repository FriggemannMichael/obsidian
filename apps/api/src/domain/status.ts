import type { BlockStatus } from '../database/types.js';

export const ALLOWED_TRANSITIONS: Record<BlockStatus, readonly BlockStatus[]> = {
    HELD: ['PAYMENT_PENDING', 'CONFIRMED', 'EXPIRED', 'CANCELLED'],
    PAYMENT_PENDING: ['CONFIRMED', 'EXPIRED', 'CANCELLED'],
    CONFIRMED: ['COMPLETED', 'CANCELLED'],
    COMPLETED: [],
    EXPIRED: [],
    CANCELLED: [],
};

export class InvalidStateError extends Error {
    readonly from: BlockStatus;
    readonly to: BlockStatus;
    constructor(from: BlockStatus, to: BlockStatus) {
        super(`Cannot transition appointment_block from ${from} to ${to}`);
        this.name = 'InvalidStateError';
        this.from = from;
        this.to = to;
    }
}

export const canTransition = (from: BlockStatus, to: BlockStatus): boolean =>
    ALLOWED_TRANSITIONS[from].includes(to);

export const assertTransition = (from: BlockStatus, to: BlockStatus): void => {
    if (!canTransition(from, to)) throw new InvalidStateError(from, to);
};
