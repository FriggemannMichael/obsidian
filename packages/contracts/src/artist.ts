import { z } from 'zod';

export const artistSchema = z.object({
    id: z.string(),
    displayName: z.string(),
    bio: z.string(),
    timezone: z.string(),
});

export type Artist = z.infer<typeof artistSchema>;
