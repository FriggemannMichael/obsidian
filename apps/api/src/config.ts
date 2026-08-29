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
    MAX_UPLOAD_BYTES: intFromEnv(10_485_760),
    ORPHAN_UPLOAD_TTL_HOURS: intFromEnv(24),
    UPLOAD_RATE_LIMIT_MAX: intFromEnv(30),
    INQUIRY_RATE_LIMIT_MAX: intFromEnv(5),
    UPLOADS_DIR: z
        .string()
        .optional()
        .transform((v) => (v === undefined ? 'apps/api/var/uploads' : v))
        .pipe(z.string().min(1, 'UPLOADS_DIR must not be blank')),
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
    uploadsDir: string;
    maxUploadBytes: number;
    orphanUploadTtlHours: number;
    uploadRateLimitMax: number;
    inquiryRateLimitMax: number;
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
        uploadsDir: parsed.UPLOADS_DIR,
        maxUploadBytes: parsed.MAX_UPLOAD_BYTES,
        orphanUploadTtlHours: parsed.ORPHAN_UPLOAD_TTL_HOURS,
        uploadRateLimitMax: parsed.UPLOAD_RATE_LIMIT_MAX,
        inquiryRateLimitMax: parsed.INQUIRY_RATE_LIMIT_MAX,
    };
};
