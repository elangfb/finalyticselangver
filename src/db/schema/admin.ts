import * as z from 'zod';
import { TimestampMetadataSchema } from './_common';

/**
 * [@]: `/admin/config`
 */
export const AdminGlobalConfigSchema = z.object({
  geminiApiKey: z.string().nonempty().nullish().default(null),

  ...TimestampMetadataSchema.shape,
});

export type LooseAdminGlobalConfig = z.input<typeof AdminGlobalConfigSchema>;
export type AdminGlobalConfig = z.output<typeof AdminGlobalConfigSchema>;
