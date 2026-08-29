import { loadConfig } from './config.js';
import { createDatabase } from './database/client.js';
import { runExpireHoldsJob } from './jobs/expire-holds.js';
import { runPurgeOrphanUploadsJob } from './jobs/purge-orphan-uploads.js';
import { createUploadsStorage } from './plugins/uploads-storage.js';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
    console.error('DATABASE_URL fehlt: Worker kann nicht starten.');
    process.exit(1);
}

const config = loadConfig();
const db = createDatabase(connectionString);
const storage = createUploadsStorage(config.uploadsDir);
let stopping = false;

const tick = async () => {
    try {
        const { expired } = await runExpireHoldsJob(db);
        if (expired > 0) console.info(`[worker] ${expired} Hold(s) abgelaufen`);
        const { purged } = await runPurgeOrphanUploadsJob({
            db,
            storage,
            ttlHours: config.orphanUploadTtlHours,
        });
        if (purged > 0) console.info(`[worker] ${purged} verwaiste Upload(s) entfernt`);
    } catch (error) {
        console.error('[worker] Job-Fehler', error);
    }
};

const loop = async () => {
    while (!stopping) {
        await tick();
        await new Promise((resolve) => setTimeout(resolve, config.workerIntervalSeconds * 1000));
    }
    await db.destroy();
};

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
    process.on(sig, () => {
        stopping = true;
    });
}

void loop();
