import rateLimit from '@fastify/rate-limit';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { AppConfig } from '../config.js';

/**
 * Registriert `@fastify/rate-limit` ohne globale Wirkung. Muss **vor** den
 * Routen-Plugins registriert werden, damit der Plugin-eigene `onRoute`-Hook
 * die per-Route-Konfiguration noch erwischt.
 */
export const registerRateLimit = (app: FastifyInstance) =>
    app.register(rateLimit, { global: false });

/**
 * Per-Route-Rate-Limit für `POST /v1/slot-holds`: `config.rateLimitMax` pro
 * Minute, Key ist der `X-Client-Token`-Header (Fallback Client-IP), bei
 * Überschreitung `429` mit `{ code: 'RATE_LIMITED' }`.
 */
export const slotHoldRateLimit = (config: AppConfig) => ({
    max: config.rateLimitMax,
    timeWindow: '1 minute',
    keyGenerator: (req: FastifyRequest) =>
        typeof req.headers['x-client-token'] === 'string'
            ? req.headers['x-client-token']
            : req.ip,
    errorResponseBuilder: (_req: FastifyRequest, context: { statusCode?: number }) => {
        const err = new Error('Zu viele Anfragen. Bitte später erneut versuchen.') as Error & {
            statusCode: number;
            code: string;
        };
        err.statusCode = context.statusCode ?? 429;
        err.code = 'RATE_LIMITED';
        return err;
    },
});
