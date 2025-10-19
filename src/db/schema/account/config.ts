import * as z from 'zod'
import { PositivePercentageRangeSchema, TimestampMetadataSchema } from '../_common'

export const AccountDefaultAnalysisExclusionsSchema = z.object({
  hiddenCategories: z.array(z.string()).default([]),
  hiddenMenus: z.array(z.string()).default([]),
  hiddenChannels: z.array(z.string()).default([]),
})

export type LooseAccountDefaultAnalysisExclusions = z.input<typeof AccountDefaultAnalysisExclusionsSchema>
export type AccountDefaultAnalysisExclusions = z.output<typeof AccountDefaultAnalysisExclusionsSchema>

export const AccountDefaultSalesTargetSchema = z.object({
  totalOmzet: z.number().int().positive().nullish().default(null),
  totalTransactions: z.number().int().positive().nullish().default(null),
  avgCheck: z.number().positive().nullish().default(null),
})

export type LooseAccountDefaultSalesTarget = z.input<typeof AccountDefaultSalesTargetSchema>
export type AccountDefaultSalesTarget = z.output<typeof AccountDefaultSalesTargetSchema>

export const AccountDefaultPnlTargetSchema = z.object({
  cogsPercent: PositivePercentageRangeSchema.nullish().default(null),
  wagesPercent: PositivePercentageRangeSchema.nullish().default(null),
  rentPercent: PositivePercentageRangeSchema.nullish().default(null),
})

export type LooseAccountDefaultPnlTarget = z.input<typeof AccountDefaultPnlTargetSchema>
export type AccountDefaultPnlTarget = z.output<typeof AccountDefaultPnlTargetSchema>

export const AccountDefaultConfigSchema = z.object({
  sales: AccountDefaultSalesTargetSchema,
  pnl: AccountDefaultPnlTargetSchema,
  ...AccountDefaultAnalysisExclusionsSchema.shape,
  ...TimestampMetadataSchema.shape,
})

export type LooseAccountDefaultConfig = z.input<typeof AccountDefaultConfigSchema>
export type AccountDefaultConfig = z.output<typeof AccountDefaultConfigSchema>
