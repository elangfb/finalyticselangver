import * as z from 'zod'

export const FREE_PLAN = 'free' as const
export const STANDARD_PLAN = 'standard' as const
export const PREMIUM_PLAN = 'premium' as const
export const PAID_PLANS = [STANDARD_PLAN, PREMIUM_PLAN] as const
export const PLANS = [FREE_PLAN, ...PAID_PLANS] as const

export type PaidPlan = (typeof PAID_PLANS)[number]
export type Plan = (typeof PLANS)[number]

export const PaidPlanSchema = z.enum(PAID_PLANS)
