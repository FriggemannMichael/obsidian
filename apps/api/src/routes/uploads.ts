import type { FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import type { AppConfig } from '../config.js';
import type { Database } from '../database/types.js';
import type { UploadsStorage } from '../plugins/uploads-storage.js';
import { getMediaAssetById } from '../repositories/media.js';
import { storeUpload, UploadRejected } from '../services/upload-service.js';

export const uploadRoutes = async (
    app: FastifyInstance,
    opts: { db: Kysely<Database>; config: AppConfig; storage: UploadsStorage },
) => {
    app.post(
        '/v1/uploads',
        {
            config: {
                rateLimit: {
                    max: opts.config.uploadRateLimitMax,
                    timeWindow: '1 minute',
                    keyGenerator: (req) =>
                        typeof req.headers['x-client-token'] === 'string'
                            ? req.headers['x-client-token']
                            : req.ip,
                    errorResponseBuilder: (_req, ctx: { statusCode?: number }) => {
                        const e = new Error('Zu viele Uploads.') as Error & { statusCode: number; code: string };
                        e.statusCode = ctx.statusCode ?? 429;
                        e.code = 'RATE_LIMITED';
                        return e;
                    },
                },
            },
        },
        async (request, reply) => {
            const clientToken = request.headers['x-client-token'];
            if (typeof clientToken !== 'string') {
                return reply
                    .status(400)
                    .send({ code: 'VALIDATION_ERROR', message: 'X-Client-Token ist erforderlich.' });
            }
            const part = await request.file();
            if (!part) {
                return reply.status(400).send({ code: 'VALIDATION_ERROR', message: 'Keine Datei übermittelt.' });
            }
            let data: Buffer;
            try {
                data = await part.toBuffer();
            } catch {
                return reply
                    .status(400)
                    .send({ code: 'UPLOAD_TOO_LARGE', message: 'Bild überschreitet die zulässige Größe.' });
            }
            try {
                const r = await storeUpload(
                    { db: opts.db, storage: opts.storage, maxBytes: opts.config.maxUploadBytes },
                    { clientToken, filename: part.filename ?? null, declaredMime: part.mimetype, data },
                );
                return reply.status(201).send({
                    uploadId: r.id,
                    url: `/v1/uploads/${r.id}`,
                    contentType: r.contentType,
                    width: r.width,
                    height: r.height,
                    byteSize: r.byteSize,
                });
            } catch (e) {
                if (e instanceof UploadRejected) {
                    return reply.status(400).send({ code: e.code, message: e.message });
                }
                throw e;
            }
        },
    );

    app.get<{ Params: { id: string } }>('/v1/uploads/:id', async (request, reply) => {
        const header = request.headers.authorization;
        if (header !== `Bearer ${opts.config.adminApiToken}`) {
            return reply.status(404).send({ code: 'UPLOAD_NOT_FOUND', message: 'Nicht gefunden.' });
        }
        const asset = await getMediaAssetById(opts.db, request.params.id);
        if (!asset) {
            return reply.status(404).send({ code: 'UPLOAD_NOT_FOUND', message: 'Nicht gefunden.' });
        }
        const data = await opts.storage.read(asset.storage_key);
        return reply
            .header('Content-Type', asset.content_type)
            .header('Cache-Control', 'private, max-age=300')
            .send(data);
    });
};
