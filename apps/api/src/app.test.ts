import { expect, it } from 'vitest';
import { buildApp } from './app.js';

it('serves /health in memory mode without db/config', async () => {
    const app = buildApp();
    await app.ready();
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: 'ok', persistence: 'memory' });
    await app.close();
});

it('does not mount /v1 routes without db+config', async () => {
    const app = buildApp();
    await app.ready();
    expect((await app.inject({ method: 'GET', url: '/v1/service-types' })).statusCode).toBe(404);
    await app.close();
});
