import { describe, expect, it } from 'vitest';
import { loadConfig } from './config.js';

const base = { ADMIN_API_TOKEN: 'test-token' };

describe('loadConfig', () => {
    it('applies documented defaults', () => {
        const c = loadConfig(base);
        expect(c).toMatchObject({
            gridMinutes: 15,
            minLeadHours: 12,
            holdTtlHours: 48,
            maxAvailabilityDays: 31,
            workerIntervalSeconds: 60,
            adminApiToken: 'test-token',
        });
    });

    it('parses overrides from env', () => {
        const c = loadConfig({ ...base, GRID_MINUTES: '30', HOLD_TTL_HOURS: '24' });
        expect(c.gridMinutes).toBe(30);
        expect(c.holdTtlHours).toBe(24);
    });

    it('throws when ADMIN_API_TOKEN is missing', () => {
        expect(() => loadConfig({})).toThrow(/ADMIN_API_TOKEN/);
    });

    it('rejects non-positive numbers', () => {
        expect(() => loadConfig({ ...base, GRID_MINUTES: '0' })).toThrow();
    });

    it('applies spec C upload defaults', () => {
        const c = loadConfig({ ADMIN_API_TOKEN: 'test-token' });
        expect(c).toMatchObject({
            uploadsDir: 'apps/api/var/uploads',
            maxUploadBytes: 10_485_760,
            orphanUploadTtlHours: 24,
            uploadRateLimitMax: 30,
            inquiryRateLimitMax: 5,
        });
    });

    it('parses upload overrides and rejects a blank UPLOADS_DIR', () => {
        const c = loadConfig({ ADMIN_API_TOKEN: 't', UPLOADS_DIR: '/data/up', MAX_UPLOAD_BYTES: '5000000' });
        expect(c.uploadsDir).toBe('/data/up');
        expect(c.maxUploadBytes).toBe(5_000_000);
        expect(() => loadConfig({ ADMIN_API_TOKEN: 't', UPLOADS_DIR: '' })).toThrow();
    });
});
