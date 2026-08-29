import { afterAll, afterEach, beforeAll, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '../testing/db.js';
import { upsertCustomer } from './customer.js';
import {
    confirmHoldBlock,
    declineHoldBlock,
    expireStaleHolds,
    findFreeResourceId,
    getBlockById,
    insertHoldBlock,
    releaseHold,
    SlotConflictError,
} from './holds.js';

let ctx: TestDb;
beforeAll(async () => {
    ctx = await createTestDb();
});
afterEach(async () => {
    await ctx.db.deleteFrom('appointment').execute();
    await ctx.db.deleteFrom('appointment_block').execute();
    await ctx.db.deleteFrom('customer').execute();
});
afterAll(async () => {
    await ctx.destroy();
});

const hold = (over: Partial<Parameters<typeof insertHoldBlock>[1]> = {}) => ({
    artistId: 'mara',
    resourceId: 'station-1',
    serviceTypeId: 'small-tattoo',
    customerId: '',
    sessionStart: new Date('2026-09-01T08:00:00Z'),
    sessionEnd: new Date('2026-09-01T10:00:00Z'),
    blockStart: new Date('2026-09-01T07:45:00Z'),
    blockEnd: new Date('2026-09-01T10:15:00Z'),
    depositCents: 5000,
    holdClientToken: 'tok-1',
    idempotencyKey: 'idem-1',
    expiresAt: new Date(Date.now() + 3_600_000),
    ...over,
});

it('upserts a customer by chayns person id', async () => {
    const a = await upsertCustomer(ctx.db, {
        chaynsPersonId: 'p1',
        firstName: 'A',
        lastName: 'B',
        email: 'a@b.de',
        phone: '123456',
    });
    const b = await upsertCustomer(ctx.db, {
        chaynsPersonId: 'p1',
        firstName: 'A',
        lastName: 'B',
        email: 'a@b.de',
        phone: '123456',
    });
    expect(a).toBe(b);
});

it('inserts a hold and rejects an overlapping one with SlotConflictError', async () => {
    const cid = await upsertCustomer(ctx.db, {
        firstName: 'A',
        lastName: 'B',
        email: 'a@b.de',
        phone: '123456',
    });
    await insertHoldBlock(ctx.db, hold({ customerId: cid }));
    await expect(
        insertHoldBlock(
            ctx.db,
            hold({
                customerId: cid,
                holdClientToken: 'tok-2',
                idempotencyKey: 'idem-2',
                blockStart: new Date('2026-09-01T09:00:00Z'),
                blockEnd: new Date('2026-09-01T11:00:00Z'),
            }),
        ),
    ).rejects.toBeInstanceOf(SlotConflictError);
});

it('findFreeResourceId skips a taken resource', async () => {
    const cid = await upsertCustomer(ctx.db, {
        firstName: 'A',
        lastName: 'B',
        email: 'a@b.de',
        phone: '123456',
    });
    await insertHoldBlock(ctx.db, hold({ customerId: cid }));
    const free = await findFreeResourceId(ctx.db, {
        candidateResourceIds: ['station-1', 'station-2'],
        blockStart: new Date('2026-09-01T08:00:00Z'),
        blockEnd: new Date('2026-09-01T09:00:00Z'),
    });
    expect(free).toBe('station-2');
});

it('expireStaleHolds flips only past-due HELD blocks', async () => {
    const cid = await upsertCustomer(ctx.db, {
        firstName: 'A',
        lastName: 'B',
        email: 'a@b.de',
        phone: '123456',
    });
    await insertHoldBlock(ctx.db, hold({ customerId: cid, expiresAt: new Date(Date.now() - 1000) }));
    const expired = await expireStaleHolds(ctx.db, new Date());
    expect(expired).toHaveLength(1);
    const row = await getBlockById(ctx.db, expired[0]!.id);
    expect(row!.status).toBe('EXPIRED');
});

it('releaseHold cancels a hold owned by the token', async () => {
    const cid = await upsertCustomer(ctx.db, {
        firstName: 'A',
        lastName: 'B',
        email: 'a@b.de',
        phone: '123456',
    });
    const block = await insertHoldBlock(ctx.db, hold({ customerId: cid }));
    await releaseHold(ctx.db, block.id, 'tok-1');
    const row = await getBlockById(ctx.db, block.id);
    expect(row!.status).toBe('CANCELLED');
});

it('confirmHoldBlock creates an appointment and clears expiry', async () => {
    const cid = await upsertCustomer(ctx.db, {
        firstName: 'A',
        lastName: 'B',
        email: 'a@b.de',
        phone: '123456',
    });
    const block = await insertHoldBlock(ctx.db, hold({ customerId: cid }));
    const { appointmentId } = await confirmHoldBlock(ctx.db, block.id);
    const row = await getBlockById(ctx.db, block.id);
    expect(row!.status).toBe('CONFIRMED');
    expect(row!.expires_at).toBeNull();
    const appt = await ctx.db
        .selectFrom('appointment')
        .selectAll()
        .where('id', '=', appointmentId)
        .executeTakeFirst();
    expect(appt!.block_id).toBe(block.id);
});

it('declineHoldBlock cancels with a reason', async () => {
    const cid = await upsertCustomer(ctx.db, {
        firstName: 'A',
        lastName: 'B',
        email: 'a@b.de',
        phone: '123456',
    });
    const block = await insertHoldBlock(ctx.db, hold({ customerId: cid }));
    await declineHoldBlock(ctx.db, block.id, 'motiv passt nicht');
    const row = await getBlockById(ctx.db, block.id);
    expect(row!.status).toBe('CANCELLED');
    expect(row!.decline_reason).toBe('motiv passt nicht');
});
