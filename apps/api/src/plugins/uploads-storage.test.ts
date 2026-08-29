import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { createUploadsStorage, type UploadsStorage } from './uploads-storage.js';

let dir: string;
let storage: UploadsStorage;
beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'uploads-'));
    storage = createUploadsStorage(dir);
});

afterAll(() => { rmSync(dir, { recursive: true, force: true }); });

it('writes, reads, stats and removes a file by key', async () => {
    const key = storage.keyFor('jpg');
    expect(key).toMatch(/^\d{4}\/\d{2}\/[0-9a-f-]{36}\.jpg$/);
    await storage.write(key, Buffer.from('hello'));
    expect((await storage.read(key)).toString()).toBe('hello');
    expect(await storage.stat(key)).toEqual({ size: 5 });
    await storage.remove(key);
    expect(await storage.stat(key)).toBeUndefined();
    await storage.remove(key); // idempotent
});

it('rejects reading a missing key', async () => {
    await expect(storage.read('2000/01/missing.jpg')).rejects.toThrow();
});
