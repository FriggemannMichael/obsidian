import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

export type UploadsStorage = {
    keyFor(ext: string): string;
    write(key: string, data: Buffer): Promise<void>;
    read(key: string): Promise<Buffer>;
    stat(key: string): Promise<{ size: number } | undefined>;
    remove(key: string): Promise<void>;
};

export const createUploadsStorage = (baseDir: string): UploadsStorage => {
    const pathFor = (key: string) => join(baseDir, key);
    return {
        keyFor(ext) {
            const now = new Date();
            const yyyy = String(now.getUTCFullYear());
            const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
            return `${yyyy}/${mm}/${randomUUID()}.${ext}`;
        },
        async write(key, data) {
            const full = pathFor(key);
            await mkdir(dirname(full), { recursive: true });
            await writeFile(full, data);
        },
        read: (key) => readFile(pathFor(key)),
        async stat(key) {
            try {
                const s = await stat(pathFor(key));
                return { size: s.size };
            } catch (err) {
                if ((err as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
                throw err;
            }
        },
        async remove(key) {
            await rm(pathFor(key), { force: true });
        },
    };
};
