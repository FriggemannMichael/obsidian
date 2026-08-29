import { DateTime } from 'luxon';

export const localWindowToUtc = (date: string, start: string, end: string, tz: string) => {
    const toUtc = (hm: string) => {
        const [h, m] = hm.split(':').map(Number);
        const dt = DateTime.fromISO(date, { zone: tz }).set({
            hour: h,
            minute: m,
            second: 0,
            millisecond: 0,
        });
        return dt.toUTC().toJSDate();
    };
    return { start: toUtc(start), end: toUtc(end) };
};

export const applyBuffers = (
    sessionStart: Date,
    sessionEnd: Date,
    preMin: number,
    postMin: number,
) => ({
    blockStart: new Date(sessionStart.getTime() - preMin * 60_000),
    blockEnd: new Date(sessionEnd.getTime() + postMin * 60_000),
});

export const intervalsOverlap = (aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) =>
    aStart.getTime() < bEnd.getTime() && bStart.getTime() < aEnd.getTime();

export const eachDate = (from: string, days: number): string[] => {
    const base = DateTime.fromISO(from, { zone: 'utc' });
    return Array.from({ length: days }, (_, i) => base.plus({ days: i }).toISODate() as string);
};

export const isoWeekday = (date: string, tz: string): number =>
    DateTime.fromISO(date, { zone: tz }).weekday;
