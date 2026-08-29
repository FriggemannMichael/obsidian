import { z } from 'zod';

export const serviceTypeIdSchema = z.enum(['consultation', 'small-tattoo', 'day-session']);

export type ServiceTypeId = z.infer<typeof serviceTypeIdSchema>;

export * from './errors.js';
export * from './service-type.js';
export * from './artist.js';
export * from './availability.js';
export * from './slot-hold.js';
export * from './admin.js';
export * from './body-regions.js';
export * from './inquiry.js';
export * from './upload.js';
export * from './admin-inquiry.js';
