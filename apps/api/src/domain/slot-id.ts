export type SlotParts = { artistId: string; serviceTypeId: string; startsAt: string };

export class InvalidSlotIdError extends Error {
    constructor(id: string) {
        super(`Invalid slot id: ${id}`);
        this.name = 'InvalidSlotIdError';
    }
}

export const encodeSlotId = (p: SlotParts): string =>
    Buffer.from(`${p.artistId}|${p.serviceTypeId}|${p.startsAt}`, 'utf8').toString('base64url');

export const decodeSlotId = (id: string): SlotParts => {
    let decoded: string;
    try {
        decoded = Buffer.from(id, 'base64url').toString('utf8');
    } catch {
        throw new InvalidSlotIdError(id);
    }
    const parts = decoded.split('|');
    if (parts.length !== 3 || parts.some((s) => s.length === 0)) throw new InvalidSlotIdError(id);
    const [artistId, serviceTypeId, startsAt] = parts as [string, string, string];
    if (Number.isNaN(Date.parse(startsAt))) throw new InvalidSlotIdError(id);
    return { artistId, serviceTypeId, startsAt };
};
