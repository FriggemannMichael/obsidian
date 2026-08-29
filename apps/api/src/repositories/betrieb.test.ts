import { afterAll, afterEach, beforeAll, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '../testing/db.js';
import { findIdempotencyRecord, hashRequestBody, saveIdempotencyRecord } from './idempotency.js';
import { enqueueOutbox, listPendingOutbox } from './outbox.js';
import { recordAudit } from './audit.js';

let ctx: TestDb;
beforeAll(async () => {
    ctx = await createTestDb();
});
afterEach(async () => {
    await ctx.db.deleteFrom('idempotency_key').execute();
    await ctx.db.deleteFrom('outbox_event').execute();
    await ctx.db.deleteFrom('audit_event').execute();
});
afterAll(async () => {
    await ctx.destroy();
});

it('hash is stable regardless of key order', () => {
    expect(hashRequestBody({ a: 1, b: 2 })).toBe(hashRequestBody({ b: 2, a: 1 }));
    expect(hashRequestBody({ a: 1 })).not.toBe(hashRequestBody({ a: 2 }));
});

it('stores and replays an idempotency record', async () => {
    await saveIdempotencyRecord(ctx.db, {
        key: 'k1',
        route: 'POST /v1/slot-holds',
        requestHash: 'h1',
        responseJson: { holdId: 'x' },
        statusCode: 201,
    });
    const found = await findIdempotencyRecord(ctx.db, 'k1');
    expect(found).toMatchObject({ requestHash: 'h1', statusCode: 201, responseJson: { holdId: 'x' } });
});

it('enqueues and lists pending outbox events', async () => {
    await enqueueOutbox(ctx.db, { type: 'slot_hold.created', payload: { holdId: 'x' } });
    const pending = await listPendingOutbox(ctx.db, 10);
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({ type: 'slot_hold.created', payload: { holdId: 'x' } });
});

it('records an audit event', async () => {
    await recordAudit(ctx.db, {
        actor: 'studio',
        action: 'appointment.confirmed',
        entityType: 'appointment_block',
        entityId: 'b1',
        after: { status: 'CONFIRMED' },
    });
    const rows = await ctx.db.selectFrom('audit_event').selectAll().execute();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.action).toBe('appointment.confirmed');
});
