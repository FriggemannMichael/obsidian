import { z } from 'zod';

export const uploadResultSchema = z.object({
    uploadId: z.uuid(),
    url: z.string(),
    contentType: z.string(),
    width: z.number().int().positive().nullable(),
    height: z.number().int().positive().nullable(),
    byteSize: z.number().int().positive(),
});
export type UploadResult = z.infer<typeof uploadResultSchema>;
