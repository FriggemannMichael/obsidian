import { applyBuffers, eachDate, intervalsOverlap, isoWeekday, localWindowToUtc } from './time.js';

export type EngineServiceType = {
    id: string;
    durationMinutes: number;
    preBufferMinutes: number;
    postBufferMinutes: number;
    bookingMode: 'request' | 'direct';
};
export type EngineArtist = { id: string; timezone: string };
export type EngineRule = {
    artistId: string;
    weekday: number;
    startLocal: string;
    endLocal: string;
    validFrom: string;
    validTo: string | null;
};
export type EngineBlocked = {
    artistId: string | null;
    resourceId: string | null;
    startsAt: Date;
    endsAt: Date;
};
export type EngineBlock = { artistId: string; resourceId: string; startsAt: Date; endsAt: Date };
export type EngineResource = { id: string; kind: 'station' | 'consult' };

export type EngineInput = {
    serviceType: EngineServiceType;
    artists: EngineArtist[];
    rules: EngineRule[];
    blockedPeriods: EngineBlocked[];
    existingBlocks: EngineBlock[];
    resources: EngineResource[];
    from: string; // YYYY-MM-DD
    days: number;
    now: Date;
    config: { gridMinutes: number; minLeadHours: number };
};

export type EngineSlot = { artistId: string; startsAt: Date; endsAt: Date };

const neededKind = (serviceTypeId: string): 'station' | 'consult' =>
    serviceTypeId === 'consultation' ? 'consult' : 'station';

const withinWindow = (s: Date, e: Date, wStart: Date, wEnd: Date) =>
    s.getTime() >= wStart.getTime() && e.getTime() <= wEnd.getTime();

export function computeSlots(input: EngineInput): EngineSlot[] {
    const { serviceType: st, config } = input;
    const kind = neededKind(st.id);
    const candidateResources = input.resources.filter((r) => r.kind === kind);
    const earliest = new Date(input.now.getTime() + config.minLeadHours * 3_600_000);
    const durationMs = st.durationMinutes * 60_000;
    const gridMs = config.gridMinutes * 60_000;
    const dates = eachDate(input.from, input.days);
    const out: EngineSlot[] = [];

    for (const artist of input.artists) {
        const artistRules = input.rules.filter((r) => r.artistId === artist.id);

        for (const date of dates) {
            const wd = isoWeekday(date, artist.timezone);
            for (const rule of artistRules) {
                if (rule.weekday !== wd) continue;
                if (date < rule.validFrom) continue;
                if (rule.validTo !== null && date >= rule.validTo) continue;

                const { start: wStart, end: wEnd } = localWindowToUtc(
                    date,
                    rule.startLocal,
                    rule.endLocal,
                    artist.timezone,
                );

                for (let t = wStart.getTime(); ; t += gridMs) {
                    const sessionStart = new Date(t);
                    const sessionEnd = new Date(t + durationMs);
                    const { blockStart, blockEnd } = applyBuffers(
                        sessionStart,
                        sessionEnd,
                        st.preBufferMinutes,
                        st.postBufferMinutes,
                    );
                    if (blockEnd.getTime() > wEnd.getTime()) break;
                    if (!withinWindow(blockStart, blockEnd, wStart, wEnd)) continue;
                    if (sessionStart.getTime() < earliest.getTime()) continue;

                    const artistBlockedHit = input.blockedPeriods.some(
                        (b) =>
                            b.artistId === artist.id &&
                            b.resourceId === null &&
                            intervalsOverlap(blockStart, blockEnd, b.startsAt, b.endsAt),
                    );
                    if (artistBlockedHit) continue;

                    const hasFreeResource = candidateResources.some((res) => {
                        const takenByBlock = input.existingBlocks.some(
                            (b) =>
                                b.resourceId === res.id &&
                                intervalsOverlap(blockStart, blockEnd, b.startsAt, b.endsAt),
                        );
                        const takenByBlocked = input.blockedPeriods.some(
                            (b) =>
                                b.resourceId === res.id &&
                                intervalsOverlap(blockStart, blockEnd, b.startsAt, b.endsAt),
                        );
                        return !takenByBlock && !takenByBlocked;
                    });
                    if (!hasFreeResource) continue;

                    out.push({ artistId: artist.id, startsAt: sessionStart, endsAt: sessionEnd });
                }
            }
        }
    }

    return out.sort(
        (a, b) => a.startsAt.getTime() - b.startsAt.getTime() || a.artistId.localeCompare(b.artistId),
    );
}
