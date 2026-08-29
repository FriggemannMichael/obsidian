import { z } from 'zod';

export const apiErrorCodeSchema = z.enum([
    'VALIDATION_ERROR',
    'UNAUTHORIZED',
    'SERVICE_TYPE_NOT_FOUND',
    'ARTIST_NOT_FOUND',
    'HOLD_NOT_FOUND',
    'SLOT_CONFLICT',
    'SLOT_NO_LONGER_AVAILABLE',
    'IDEMPOTENCY_KEY_REUSED',
    'INVALID_STATE',
    'RATE_LIMITED',
]);

export const apiErrorSchema = z.object({
    code: apiErrorCodeSchema.or(z.string()),
    message: z.string(),
    issues: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
    alternativeSlots: z.array(z.unknown()).optional(),
});

export type ApiErrorCode = z.infer<typeof apiErrorCodeSchema>;
export type ApiError = z.infer<typeof apiErrorSchema>;
