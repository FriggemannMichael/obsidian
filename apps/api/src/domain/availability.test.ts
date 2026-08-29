import { describe, expect, it } from 'vitest';
import { computeSlots, type EngineInput } from './availability.js';

const baseInput = (over: Partial<EngineInput> = {}): EngineInput => ({
    serviceType: {
        id: 'small-tattoo',
        durationMinutes: 120,
        preBufferMinutes: 15,
        postBufferMinutes: 15,
        bookingMode: 'request',
    },
    artists: [{ id: 'mara', timezone: 'Europe/Berlin' }],
    rules: [
        {
            artistId: 'mara',
            weekday: 2,
            startLocal: '10:00',
            endLocal: '18:00',
            validFrom: '2026-01-01',
            validTo: null,
        },
    ],
    blockedPeriods: [],
    existingBlocks: [],
    resources: [
        { id: 'station-1', kind: 'station' },
        { id: 'station-2', kind: 'station' },
    ],
    from: '2026-09-01', // Tuesday
    days: 1,
    now: new Date('2026-08-01T00:00:00Z'),
    config: { gridMinutes: 60, minLeadHours: 12 },
    ...over,
});

describe('computeSlots', () => {
    it('places grid starts inside the rule window, respecting buffers', () => {
        const slots = computeSlots(baseInput());
        // window 10:00-18:00 local = 08:00-16:00Z; need 15+120+15 = 150 min block.
        // first session start where block fits: 10:15 local (block 10:00) ... on a 60-min grid: 11:00,12:00,13:00,14:00,15:00 local? check post: 15:00+120+15=17:15<=18:00 ok; 16:00 -> 18:15 no.
        const localHours = slots.map((s) => new Date(s.startsAt).toISOString());
        expect(slots.length).toBeGreaterThan(0);
        expect(new Date(slots[0]!.startsAt).toISOString()).toBe('2026-09-01T09:00:00.000Z'); // 11:00 local
        expect(localHours).not.toContain('2026-09-01T14:00:00.000Z'); // 16:00 local would overflow
    });

    it('excludes a day with no matching rule weekday', () => {
        const slots = computeSlots(baseInput({ from: '2026-09-02', days: 1 })); // Wednesday, no rule
        expect(slots).toHaveLength(0);
    });

    it('subtracts an artist-wide blocked period', () => {
        const slots = computeSlots(
            baseInput({
                blockedPeriods: [
                    {
                        artistId: 'mara',
                        resourceId: null,
                        startsAt: new Date('2026-09-01T00:00:00Z'),
                        endsAt: new Date('2026-09-02T00:00:00Z'),
                    },
                ],
            }),
        );
        expect(slots).toHaveLength(0);
    });

    it('subtracts an existing blocking appointment block for the artist', () => {
        const slots = computeSlots(
            baseInput({
                existingBlocks: [
                    {
                        artistId: 'mara',
                        resourceId: 'station-1',
                        startsAt: new Date('2026-09-01T08:00:00Z'),
                        endsAt: new Date('2026-09-01T16:00:00Z'),
                    },
                ],
            }),
        );
        // station-1 fully blocked all day but station-2 is still free -> slots remain
        expect(slots.length).toBeGreaterThan(0);
    });

    it('returns nothing when every resource is taken', () => {
        const slots = computeSlots(
            baseInput({
                existingBlocks: [
                    {
                        artistId: 'other',
                        resourceId: 'station-1',
                        startsAt: new Date('2026-09-01T00:00:00Z'),
                        endsAt: new Date('2026-09-02T00:00:00Z'),
                    },
                    {
                        artistId: 'other2',
                        resourceId: 'station-2',
                        startsAt: new Date('2026-09-01T00:00:00Z'),
                        endsAt: new Date('2026-09-02T00:00:00Z'),
                    },
                ],
            }),
        );
        expect(slots).toHaveLength(0);
    });

    it('honours the minimum lead time', () => {
        const slots = computeSlots(baseInput({ now: new Date('2026-09-01T06:00:00Z') })); // 6h before window
        expect(slots).toHaveLength(0); // 12h lead not met for any 2026-09-01 slot
    });

    it('merges and sorts slots from multiple artists', () => {
        const slots = computeSlots(
            baseInput({
                artists: [
                    { id: 'mara', timezone: 'Europe/Berlin' },
                    { id: 'jon', timezone: 'Europe/Berlin' },
                ],
                rules: [
                    {
                        artistId: 'mara',
                        weekday: 2,
                        startLocal: '10:00',
                        endLocal: '18:00',
                        validFrom: '2026-01-01',
                        validTo: null,
                    },
                    {
                        artistId: 'jon',
                        weekday: 2,
                        startLocal: '10:00',
                        endLocal: '18:00',
                        validFrom: '2026-01-01',
                        validTo: null,
                    },
                ],
            }),
        );
        const times = slots.map((s) => s.startsAt.getTime());
        expect(times).toEqual([...times].sort((a, b) => a - b));
        expect(new Set(slots.map((s) => s.artistId))).toEqual(new Set(['mara', 'jon']));
    });
});
