import * as z from 'zod'
import { DateTimeSchema } from "./datetime"
import { FREE_PLAN, PLANS } from './_plan'
import { transformNullToUndefined } from './_common'

/**
 * Activation Status Enum Schema
 */
export const ActivationStatusSchema = z.enum([
  'waiting_validation',
  'validating_code',
  'invalid_code',
  'waiting_password',
  'waiting_create_account',
  'creating_account',
  'assigning_plan',
  'success',
  'failed',
])

/**
 * Activation Status Type
 */
export type ActivationStatus = z.infer<typeof ActivationStatusSchema>

/**
 * Metadata extracted from Mayar response
 */
export const ActivationMetadataSchema = z.object({
  planType: z.enum(PLANS).optional().default(FREE_PLAN),
  transactionId: z.string().optional(),
  membershipExpiresAt: DateTimeSchema,
  productId: z.string().optional(),
  customerId: z.string().optional(),
  customerName: z.string().optional(),
  customerEmail: z.email().optional(),
  membershipTierId: z.string().optional(),
  membershipTierName: z.string().optional(),
  memberStatus: z.string().optional(),
  memberPaymentLink: z.string().optional(),
})

export type ActivationMetadata = z.output<typeof ActivationMetadataSchema>
export type LooseActivationMetadata = z.input<typeof ActivationMetadataSchema>
export type CompatibleActivationMetadataInput = LooseActivationMetadata

/**
 * Activation Document Schema
 * 
 * [@]: `/activations/{activationId}`
 */
export const ActivationDocumentSchema = z.object({
  activationCode: z.string().min(1),
  email: z.email().transform((val) => val.toLowerCase().trim()),
  status: ActivationStatusSchema,
  password: z.string().optional(),
  error: z.string().nullable().transform(transformNullToUndefined).optional(),
  retryCount: z.number().default(0),
  activationExpiresAt: DateTimeSchema,
  createdAt: DateTimeSchema,
  updatedAt: DateTimeSchema,
  metadata: ActivationMetadataSchema.optional(),
})

export type ActivationDocument = z.infer<typeof ActivationDocumentSchema>
