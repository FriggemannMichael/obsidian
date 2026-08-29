import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';

const apps: ReturnType<typeof buildApp>[] = [];

afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe('Booking API', () => {
    it('returns the configured service types', async () => {
        const app = buildApp();
        apps.push(app);

        const response = await app.inject({ method: 'GET', url: '/api/v1/service-types' });

        expect(response.statusCode).toBe(200);
        expect(response.json().items).toHaveLength(3);
    });

    it('creates a valid booking request', async () => {
        const app = buildApp();
        apps.push(app);

        const response = await app.inject({
            method: 'POST',
            url: '/api/v1/booking-requests',
            payload: {
                serviceTypeId: 'consultation',
                slot: {
                    id: 'consultation-2026-09-01T08:00:00.000Z',
                    startsAt: '2026-09-01T08:00:00.000Z',
                    endsAt: '2026-09-01T08:30:00.000Z',
                },
                customer: {
                    firstName: 'Janine',
                    lastName: 'Beispiel',
                    email: 'janine@example.com',
                    phone: '+49 2561 123456',
                },
                tattooIdea: 'Florales Motiv am Unterarm, ungefähr zwölf Zentimeter groß.',
                acceptsTerms: true,
            },
        });

        expect(response.statusCode).toBe(201);
        expect(response.json().request).toMatchObject({
            serviceTypeId: 'consultation',
            status: 'submitted',
        });
    });

    it('rejects an incomplete request', async () => {
        const app = buildApp();
        apps.push(app);

        const response = await app.inject({
            method: 'POST',
            url: '/api/v1/booking-requests',
            payload: { serviceTypeId: 'consultation' },
        });

        expect(response.statusCode).toBe(400);
        expect(response.json().code).toBe('VALIDATION_ERROR');
    });
});
