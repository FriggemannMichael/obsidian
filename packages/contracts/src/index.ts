import { z } from 'zod';

export const serviceTypeIdSchema = z.enum(['consultation', 'small-tattoo', 'day-session']);

/**
 * Legacy-Schemas des ersten MVP-Slices (`/api/v1/*`, synthetische Verfügbarkeit,
 * Anfrage-Wizard). Die Spec-B-Engine unter `/v1/*` bringt eigene, gleichnamige
 * Schemas mit (siehe `./service-type.js`, `./availability.js`); um die
 * Kollision zu vermeiden, tragen die alten Definitionen hier das Präfix `legacy`.
 */
export const legacyServiceTypeSchema = z.object({
    id: serviceTypeIdSchema,
    name: z.string(),
    description: z.string(),
    durationMinutes: z.number().int().positive(),
    depositCents: z.number().int().nonnegative(),
});

export const legacyServiceTypesResponseSchema = z.object({
    items: z.array(legacyServiceTypeSchema),
});

export const legacyAvailabilityQuerySchema = z.object({
    serviceTypeId: serviceTypeIdSchema,
    from: z.iso.date(),
    days: z.coerce.number().int().min(1).max(31).default(14),
});

export const legacyAvailabilitySlotSchema = z.object({
    id: z.string(),
    startsAt: z.iso.datetime({ offset: true }),
    endsAt: z.iso.datetime({ offset: true }),
    available: z.boolean(),
});

export const legacyAvailabilityResponseSchema = z.object({
    timezone: z.literal('Europe/Berlin'),
    serviceType: legacyServiceTypeSchema,
    slots: z.array(legacyAvailabilitySlotSchema),
});

export const createBookingRequestSchema = z.object({
    serviceTypeId: serviceTypeIdSchema,
    slot: legacyAvailabilitySlotSchema.pick({ id: true, startsAt: true, endsAt: true }),
    customer: z.object({
        firstName: z.string().trim().min(2).max(80),
        lastName: z.string().trim().min(2).max(80),
        email: z.email(),
        phone: z.string().trim().min(6).max(40),
    }),
    tattooIdea: z.string().trim().min(20).max(3000),
    chaynsPersonId: z.string().min(1).optional(),
    acceptsTerms: z.literal(true),
});

export const bookingRequestSchema = createBookingRequestSchema.extend({
    id: z.uuid(),
    status: z.literal('submitted'),
    createdAt: z.iso.datetime(),
});

export const createBookingRequestResponseSchema = z.object({
    request: bookingRequestSchema,
});

export type ServiceTypeId = z.infer<typeof serviceTypeIdSchema>;
export type LegacyServiceType = z.infer<typeof legacyServiceTypeSchema>;
export type LegacyAvailabilityQuery = z.infer<typeof legacyAvailabilityQuerySchema>;
export type LegacyAvailabilitySlot = z.infer<typeof legacyAvailabilitySlotSchema>;
export type LegacyAvailabilityResponse = z.infer<typeof legacyAvailabilityResponseSchema>;
export type CreateBookingRequest = z.infer<typeof createBookingRequestSchema>;
export type BookingRequest = z.infer<typeof bookingRequestSchema>;

export * from './errors.js';
export * from './service-type.js';
export * from './artist.js';
export * from './availability.js';
export * from './slot-hold.js';
export * from './admin.js';
export * from './body-regions.js';
export * from './inquiry.js';
export * from './upload.js';
export * from './admin-inquiry.js';
