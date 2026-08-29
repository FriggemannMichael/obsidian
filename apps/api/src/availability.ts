import type {
    LegacyAvailabilitySlot as AvailabilitySlot,
    LegacyServiceType as ServiceType,
} from '@tattoo-studio/contracts';
import { DateTime } from 'luxon';

const TIMEZONE = 'Europe/Berlin';
const START_HOURS = [10, 14];

export const createAvailability = (
    serviceType: ServiceType,
    from: string,
    days: number,
): AvailabilitySlot[] => {
    const firstDay = DateTime.fromISO(from, { zone: TIMEZONE }).startOf('day');
    const earliestStart = DateTime.now().setZone(TIMEZONE).plus({ hours: 12 });
    const slots: AvailabilitySlot[] = [];

    for (let offset = 0; offset < days; offset += 1) {
        const day = firstDay.plus({ days: offset });

        if (day.weekday > 5) {
            continue;
        }

        const hours = serviceType.id === 'day-session' ? [10] : START_HOURS;

        for (const hour of hours) {
            const start = day.set({ hour, minute: 0 });
            const end = start.plus({ minutes: serviceType.durationMinutes });

            if (start <= earliestStart) {
                continue;
            }

            const startsAt = start.toUTC().toISO();
            const endsAt = end.toUTC().toISO();

            if (!startsAt || !endsAt) {
                continue;
            }

            slots.push({
                id: `${serviceType.id}-${startsAt}`,
                startsAt,
                endsAt,
                available: true,
            });
        }
    }

    return slots;
};
