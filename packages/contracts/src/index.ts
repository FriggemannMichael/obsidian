import { z } from 'zod';

export const serviceTypeIdSchema = z.enum(['consultation', 'small-tattoo', 'day-session']);

export const serviceTypeSchema = z.object({
    id: serviceTypeIdSchema,
    name: z.string(),
    description: z.string(),
    durationMinutes: z.number().int().positive(),
    depositCents: z.number().int().nonnegative(),
});

export const serviceTypesResponseSchema = z.object({
    items: z.array(serviceTypeSchema),
});

export const availabilityQuerySchema = z.object({
    serviceTypeId: serviceTypeIdSchema,
    from: z.iso.date(),
    days: z.coerce.number().int().min(1).max(31).default(14),
});

export const availabilitySlotSchema = z.object({
    id: z.string(),
    startsAt: z.iso.datetime({ offset: true }),
    endsAt: z.iso.datetime({ offset: true }),
    available: z.boolean(),
});

export const availabilityResponseSchema = z.object({
    timezone: z.literal('Europe/Berlin'),
    serviceType: serviceTypeSchema,
    slots: z.array(availabilitySlotSchema),
});

export const createBookingRequestSchema = z.object({
    serviceTypeId: serviceTypeIdSchema,
    slot: availabilitySlotSchema.pick({ id: true, startsAt: true, endsAt: true }),
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

export const apiErrorSchema = z.object({
    code: z.string(),
    message: z.string(),
    issues: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
});

export type ServiceTypeId = z.infer<typeof serviceTypeIdSchema>;
export type ServiceType = z.infer<typeof serviceTypeSchema>;
export type AvailabilityQuery = z.infer<typeof availabilityQuerySchema>;
export type AvailabilitySlot = z.infer<typeof availabilitySlotSchema>;
export type AvailabilityResponse = z.infer<typeof availabilityResponseSchema>;
export type CreateBookingRequest = z.infer<typeof createBookingRequestSchema>;
export type BookingRequest = z.infer<typeof bookingRequestSchema>;
export type ApiError = z.infer<typeof apiErrorSchema>;
