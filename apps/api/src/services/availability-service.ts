import type { Kysely } from 'kysely';
import type { AvailabilityQuery, AvailabilityResponse } from '@tattoo-studio/contracts';
import type { AppConfig } from '../config.js';
import type { Database } from '../database/types.js';
import { computeSlots } from '../domain/availability.js';
import { encodeSlotId } from '../domain/slot-id.js';
import {
    getActiveArtistsForService,
    getActiveResources,
    getAvailabilityRules,
    getBlockedPeriods,
    getBlockingBlocks,
    getServiceType,
    type ServiceTypeRow,
} from '../repositories/reference.js';
import { eachDate } from '../domain/time.js';

export class ServiceTypeNotFoundError extends Error {}
export class ArtistNotFoundError extends Error {}

const toContractServiceType = (row: ServiceTypeRow) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    durationMinutes: row.duration_minutes,
    preBufferMinutes: row.pre_buffer_minutes,
    postBufferMinutes: row.post_buffer_minutes,
    bookingMode: row.booking_mode,
    depositTier: row.deposit_tier,
    depositCents: row.deposit_cents,
});

export const getAvailability = async (
    db: Kysely<Database>,
    config: AppConfig,
    query: AvailabilityQuery,
): Promise<AvailabilityResponse> => {
    const st = await getServiceType(db, query.serviceTypeId);
    if (!st) throw new ServiceTypeNotFoundError(query.serviceTypeId);

    const days = Math.min(query.days, config.maxAvailabilityDays);
    let artists = await getActiveArtistsForService(db, st.id);
    if (query.artistId !== 'any') {
        artists = artists.filter((a) => a.id === query.artistId);
        if (artists.length === 0) throw new ArtistNotFoundError(query.artistId);
    }

    const kind = st.id === 'consultation' ? ('consult' as const) : ('station' as const);
    const resources = await getActiveResources(db, kind);
    const artistIds = artists.map((a) => a.id);
    const resourceIds = resources.map((r) => r.id);

    const dates = eachDate(query.from, days);
    const lastDate = dates[dates.length - 1] ?? query.from;
    const from = new Date(`${dates[0] ?? query.from}T00:00:00Z`);
    const to = new Date(`${lastDate}T23:59:59Z`);
    // Puffer für Zeitzonen-Ränder: eine Tagesbreite auf beiden Seiten
    from.setUTCDate(from.getUTCDate() - 1);
    to.setUTCDate(to.getUTCDate() + 1);

    const [rules, blockedPeriods, blocks] = await Promise.all([
        getAvailabilityRules(db, artistIds, query.from, lastDate),
        getBlockedPeriods(db, artistIds, resourceIds, from, to),
        getBlockingBlocks(db, artistIds, from, to),
    ]);

    const slots = computeSlots({
        serviceType: {
            id: st.id,
            durationMinutes: st.duration_minutes,
            preBufferMinutes: st.pre_buffer_minutes,
            postBufferMinutes: st.post_buffer_minutes,
            bookingMode: st.booking_mode,
        },
        artists: artists.map((a) => ({ id: a.id, timezone: a.timezone })),
        rules: rules.map((r) => ({
            artistId: r.artist_id,
            weekday: r.weekday,
            startLocal: r.start_local,
            endLocal: r.end_local,
            validFrom: r.valid_from,
            validTo: r.valid_to,
        })),
        blockedPeriods: blockedPeriods.map((b) => ({
            artistId: b.artist_id,
            resourceId: b.resource_id,
            startsAt: new Date(b.starts_at),
            endsAt: new Date(b.ends_at),
        })),
        existingBlocks: blocks.map((b) => ({
            artistId: b.artist_id,
            resourceId: b.resource_id,
            startsAt: new Date(b.starts_at),
            endsAt: new Date(b.ends_at),
        })),
        resources: resources.map((r) => ({ id: r.id, kind: r.kind })),
        from: query.from,
        days,
        now: new Date(),
        config: { gridMinutes: config.gridMinutes, minLeadHours: config.minLeadHours },
    });

    const nameById = new Map(artists.map((a) => [a.id, a.display_name]));

    return {
        timezone: 'Europe/Berlin',
        serviceType: toContractServiceType(st),
        slots: slots.map((s) => ({
            id: encodeSlotId({
                artistId: s.artistId,
                serviceTypeId: st.id,
                startsAt: s.startsAt.toISOString(),
            }),
            artistId: s.artistId,
            artistName: nameById.get(s.artistId) ?? s.artistId,
            startsAt: s.startsAt.toISOString(),
            endsAt: s.endsAt.toISOString(),
            durationMinutes: st.duration_minutes,
            depositCents: st.deposit_cents,
        })),
    };
};
