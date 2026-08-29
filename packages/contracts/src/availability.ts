import { z } from 'zod';
import { serviceTypeSchema } from './service-type.js';

export const availabilityQuerySchema = z.object({
    serviceTypeId: z.string().min(1),
    artistId: z.string().min(1).default('any'),
    from: z.iso.date(),
    days: z.coerce.number().int().min(1).max(31).default(14),
});

export const availabilitySlotSchema = z.object({
    id: z.string(),
    artistId: z.string(),
    artistName: z.string(),
    startsAt: z.iso.datetime({ offset: true }),
    endsAt: z.iso.datetime({ offset: true }),
    durationMinutes: z.number().int().positive(),
    depositCents: z.number().int().nonnegative(),
});

export const availabilityResponseSchema = z.object({
    timezone: z.literal('Europe/Berlin'),
    serviceType: serviceTypeSchema,
    slots: z.array(availabilitySlotSchema),
});

export type AvailabilityQuery = z.infer<typeof availabilityQuerySchema>;
export type AvailabilitySlot = z.infer<typeof availabilitySlotSchema>;
export type AvailabilityResponse = z.infer<typeof availabilityResponseSchema>;
