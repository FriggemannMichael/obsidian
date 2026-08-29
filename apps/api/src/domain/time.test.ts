import { describe, expect, it } from 'vitest';
import { applyBuffers, eachDate, intervalsOverlap, isoWeekday, localWindowToUtc } from './time.js';

describe('localWindowToUtc', () => {
    it('converts Berlin winter time (UTC+1)', () => {
        const { start, end } = localWindowToUtc('2026-01-15', '10:00', '18:00', 'Europe/Berlin');
        expect(start.toISOString()).toBe('2026-01-15T09:00:00.000Z');
        expect(end.toISOString()).toBe('2026-01-15T17:00:00.000Z');
    });

    it('converts Berlin summer time (UTC+2)', () => {
        const { start } = localWindowToUtc('2026-07-15', '10:00', '18:00', 'Europe/Berlin');
        expect(start.toISOString()).toBe('2026-07-15T08:00:00.000Z');
    });

    it('handles the spring-forward day without producing a non-existent local time', () => {
        // 2026-03-29: clocks jump 02:00 -> 03:00 in Berlin
        const { start } = localWindowToUtc('2026-03-29', '10:00', '18:00', 'Europe/Berlin');
        expect(start.toISOString()).toBe('2026-03-29T08:00:00.000Z');
    });

    it('handles the fall-back day', () => {
        // 2026-10-25: clocks fall 03:00 -> 02:00 in Berlin
        const { start } = localWindowToUtc('2026-10-25', '10:00', '18:00', 'Europe/Berlin');
        expect(start.toISOString()).toBe('2026-10-25T09:00:00.000Z');
    });
});

describe('applyBuffers', () => {
    it('extends the block by pre and post buffers', () => {
        const s = new Date('2026-09-01T08:00:00Z');
        const e = new Date('2026-09-01T10:00:00Z');
        const { blockStart, blockEnd } = applyBuffers(s, e, 15, 30);
        expect(blockStart.toISOString()).toBe('2026-09-01T07:45:00.000Z');
        expect(blockEnd.toISOString()).toBe('2026-09-01T10:30:00.000Z');
    });
});

describe('intervalsOverlap', () => {
    const d = (s: string) => new Date(s);
    it('treats touching intervals as non-overlapping', () => {
        expect(
            intervalsOverlap(
                d('2026-09-01T08:00Z'),
                d('2026-09-01T10:00Z'),
                d('2026-09-01T10:00Z'),
                d('2026-09-01T12:00Z'),
            ),
        ).toBe(false);
    });
    it('detects a real overlap', () => {
        expect(
            intervalsOverlap(
                d('2026-09-01T08:00Z'),
                d('2026-09-01T10:00Z'),
                d('2026-09-01T09:00Z'),
                d('2026-09-01T11:00Z'),
            ),
        ).toBe(true);
    });
});

describe('eachDate', () => {
    it('lists calendar days', () => {
        expect(eachDate('2026-02-27', 3)).toEqual(['2026-02-27', '2026-02-28', '2026-03-01']);
    });
});

describe('isoWeekday', () => {
    it('returns 1 for Monday', () => {
        expect(isoWeekday('2026-08-31', 'Europe/Berlin')).toBe(1);
    });
});
