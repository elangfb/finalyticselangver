import * as z from 'zod'
import { TimestampMetadataSchema, YearMonthPeriodSchema } from './_common'

/**
 * [@]: `/processingJobs/{jobId}`
 */
export const JobSchema = z.object({
  jobId: z.string().nonempty(),
  fileName: z.string(),
  format: z.enum(['MOKA', 'ESB']),
  periodRange: YearMonthPeriodSchema,
  progress: z.object({
    current: z.number().int().nullish().default(null),
    message: z.string(),
    total: z.number().int().nullish().default(null),
  }),
  status: z.enum(['preparing', 'processing', 'complete', 'error']),
  userId: z.string(),

  ...TimestampMetadataSchema.shape,
})

export type LooseJob = z.input<typeof JobSchema>
export type Job = z.output<typeof JobSchema>
