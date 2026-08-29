import type { FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import type { Database } from '../database/types.js';

export const serviceTypeRoutes = async (app: FastifyInstance, opts: { db: Kysely<Database> }) => {
    app.get('/v1/service-types', async () => {
        const rows = await opts.db
            .selectFrom('service_type')
            .selectAll()
            .where('active', '=', true)
            .orderBy('name', 'asc')
            .execute();
        return {
            items: rows.map((r) => ({
                id: r.id,
                name: r.name,
                description: r.description,
                durationMinutes: r.duration_minutes,
                preBufferMinutes: r.pre_buffer_minutes,
                postBufferMinutes: r.post_buffer_minutes,
                bookingMode: r.booking_mode,
                depositTier: r.deposit_tier,
                depositCents: r.deposit_cents,
            })),
        };
    });
};
