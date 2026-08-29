import { z } from 'zod';

export const holdConfirmRequestSchema = z.object({
    depositReceived: z
        .object({
            amountCents: z.number().int().nonnegative(),
            at: z.iso.datetime({ offset: true }),
            method: z.string().min(1).max(40),
        })
        .optional(),
});

export const holdDeclineRequestSchema = z.object({
    reason: z.string().trim().min(1).max(500),
});

export type HoldConfirmRequest = z.infer<typeof holdConfirmRequestSchema>;
export type HoldDeclineRequest = z.infer<typeof holdDeclineRequestSchema>;
