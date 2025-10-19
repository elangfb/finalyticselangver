import * as z from 'zod'
import { TimestampMetadataSchema } from '../_common'
import { DateTimeSchema } from '../datetime'
import { AccountDefaultConfigSchema } from './config'
import { PaidPlanSchema } from '../_plan'

/**
 * [@]: `/accounts/{accountId}`
 */
export const AccountSchema = z.object({
  id: z.string().nonempty(),
  ownerUid: z.string().nonempty(),

  accountName: z.string().nonempty(),

  config: AccountDefaultConfigSchema
    .nullish()
    .transform((v) => v || AccountDefaultConfigSchema.parse({})),

  ...TimestampMetadataSchema.shape,
})

export type LooseAccount = z.input<typeof AccountSchema>
export type Account = z.output<typeof AccountSchema>

/**
 * [@]: `/accounts/{accountId}/subscriptions/{subscriptionId}`
 */
export const AccountSubscriptionSchema = z.object({
  id: z.string().nonempty(),
  accountId: z.string().nonempty(),
  // Which Branch use this subscription
  branchIds: z.array(z.string().nonempty()),

  planType: PaidPlanSchema,

  fromPaymentGateway: z.object({
    licenseCode: z.string(),
    status: z.string(),
    transactionId: z.string(),
    productId: z.string(),
    customerId: z.string(),
    customerName: z.string(),
    customerEmail: z.email(),
    membershipTierId: z.string(),
    membershipTierName: z.string(),
    memberPaymentLink: z.url(),
    createdAt: DateTimeSchema,
    updatedAt: DateTimeSchema,
    expiredAt: DateTimeSchema,
  }).partial().nullable(),

  limits: z.object({
    // Limit count can be a positive-number or `null` for unlimited
    branchLimitCount: z.int().positive().nullable(),
    // Use count must be a positive-number
    branchUseCount: z.int().positive(),
  }),

  // Kapan diaktivasi di aplikasi
  activatedAt: DateTimeSchema,
  activatedBy: z.string(),

  // When to start alert soon expiring
  // `null` means don't shows alert.
  startAlertSoonExpiringAt: DateTimeSchema.nullable(),

  ...TimestampMetadataSchema.shape,
})

export type LooseAccountSubscription = z.input<typeof AccountSubscriptionSchema>
export type AccountSubscription = z.output<typeof AccountSubscriptionSchema>
