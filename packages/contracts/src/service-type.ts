import { z } from 'zod';

export const depositTierSchema = z.enum(['NONE', 'D50', 'D100', 'D150']);

export const serviceTypeSchema = z.object({
    id: z.string(),
    name: z.string(),
    description: z.string(),
    durationMinutes: z.number().int().positive(),
    preBufferMinutes: z.number().int().nonnegative(),
    postBufferMinutes: z.number().int().nonnegative(),
    bookingMode: z.enum(['request', 'direct']),
    depositTier: depositTierSchema,
    depositCents: z.number().int().nonnegative(),
});

export type ServiceType = z.infer<typeof serviceTypeSchema>;

export const serviceTypesResponseSchema = z.object({ items: z.array(serviceTypeSchema) });
export type ServiceTypesResponse = z.infer<typeof serviceTypesResponseSchema>;
