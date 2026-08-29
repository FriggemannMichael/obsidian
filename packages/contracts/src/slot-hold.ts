import { z } from 'zod';

export const holdCustomerSchema = z.object({
    firstName: z.string().trim().min(2).max(80),
    lastName: z.string().trim().min(2).max(80),
    email: z.email(),
    phone: z.string().trim().min(6).max(40),
});

export const slotHoldRequestSchema = z.object({
    serviceTypeId: z.string().min(1),
    artistId: z.string().min(1),
    startsAt: z.iso.datetime({ offset: true }),
    customer: holdCustomerSchema,
    chaynsPersonId: z.string().min(1).optional(),
});

export const slotHoldResponseSchema = z.object({
    holdId: z.uuid(),
    status: z.literal('HELD'),
    expiresAt: z.iso.datetime({ offset: true }),
    artistId: z.string(),
    startsAt: z.iso.datetime({ offset: true }),
    endsAt: z.iso.datetime({ offset: true }),
    depositCents: z.number().int().nonnegative(),
});

export type SlotHoldRequest = z.infer<typeof slotHoldRequestSchema>;
export type SlotHoldResponse = z.infer<typeof slotHoldResponseSchema>;
