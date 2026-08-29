import { z } from 'zod';

const intFromEnv = (fallback: number) =>
    z
        .string()
        .optional()
        .transform((v) => (v === undefined ? fallback : Number(v)))
        .pipe(z.number().int().positive());

const schema = z.object({
    GRID_MINUTES: intFromEnv(15),
    MIN_LEAD_HOURS: intFromEnv(12),
    HOLD_TTL_HOURS: intFromEnv(48),
    MAX_AVAILABILITY_DAYS: intFromEnv(31),
    WORKER_INTERVAL_SECONDS: intFromEnv(60),
    RATE_LIMIT_MAX: intFromEnv(10),
    ADMIN_API_TOKEN: z
        .string({ error: 'ADMIN_API_TOKEN is required' })
        .min(1, 'ADMIN_API_TOKEN is required'),
});

export type AppConfig = {
    gridMinutes: number;
    minLeadHours: number;
    holdTtlHours: number;
    maxAvailabilityDays: number;
    adminApiToken: string;
    workerIntervalSeconds: number;
    rateLimitMax: number;
};

export const loadConfig = (env: NodeJS.ProcessEnv = process.env): AppConfig => {
    const parsed = schema.parse(env);
    return {
        gridMinutes: parsed.GRID_MINUTES,
        minLeadHours: parsed.MIN_LEAD_HOURS,
        holdTtlHours: parsed.HOLD_TTL_HOURS,
        maxAvailabilityDays: parsed.MAX_AVAILABILITY_DAYS,
        adminApiToken: parsed.ADMIN_API_TOKEN,
        workerIntervalSeconds: parsed.WORKER_INTERVAL_SECONDS,
        rateLimitMax: parsed.RATE_LIMIT_MAX,
    };
};
