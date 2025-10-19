import * as z from 'zod'
import { TimestampMetadataSchema, transformUndefinedToNull } from './_common'
import { DateTimeSchema } from './datetime'

const AnalysisCacheUsageSchema = z.looseObject({
  promptTokenCount: z.int()
    .nullish()
    .transform(transformUndefinedToNull),
  candidatesTokenCount: z.int()
    .nullish()
    .transform(transformUndefinedToNull),
  totalTokenCount: z.int()
    .nullish()
    .transform(transformUndefinedToNull),
})

/**
 * [@]: `/analysisCache/{cacheId}`
 */
export const AnalysisCacheSchema = z.object({
  accountId: z.string().nonempty(),
  branchId: z.string().nonempty(),

  filters: z.record(z.string().nonempty(), z.unknown()),
  filtersHash: z.string(),
  dataHash: z.string(),

  summary: z.string(),

  ...TimestampMetadataSchema.shape,

  expireAt: DateTimeSchema.optional(),
  expiresAt: DateTimeSchema.optional(),

  usageMetadata: AnalysisCacheUsageSchema
    .nullish()
    .transform((v) => v || AnalysisCacheUsageSchema.parse({})),
}).transform((cache, ctx) => {
  const {
    expireAt,
    ...remaining
  } = cache

  const expiresAt = cache.expiresAt || expireAt

  if (!expiresAt) {
    ctx.addIssue({
      code: 'custom',
      message: 'Either "expiresAt" or "expireAt" cannot be empty.',
      path: ['expiresAt'],
    })

    return z.NEVER
  }

  return {
    ...remaining,
    expiresAt,
  }
})

export type LooseAnalysisCache = z.input<typeof AnalysisCacheSchema>
export type AnalysisCache = z.output<typeof AnalysisCacheSchema>
