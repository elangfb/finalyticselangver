import * as z from 'zod'
import { PositivePercentageRangeSchema, TimestampMetadataSchema, transformUndefinedToNull } from '../_common'
import { FREE_PLAN, PaidPlanSchema } from '../_plan'
import { DateTimeSchema } from '../datetime'
import { createId } from '@paralleldrive/cuid2'

const BranchInvestmentSchema = z.object({
  investmentAmount: z.number()
    .positive()
    .nullish()
    .transform(transformUndefinedToNull),
  investmentSlots: z.int()
    .positive()
    .nullish()
    .transform(transformUndefinedToNull),
  investorSharePercentage: PositivePercentageRangeSchema
    .nullish()
    .transform(transformUndefinedToNull),
})

const CommonBaseBranchSchema = z.object({
  id: z.string().nonempty(),
  accountId: z.string().nonempty(),

  branchName: z.string().nonempty(),

  investment: BranchInvestmentSchema
    .nullish()
    .transform((v) => v || BranchInvestmentSchema.parse({})),

  ...TimestampMetadataSchema.shape,
})

/**
 * [@]: `/branches/{branchId}`
 */
export const BranchSchema = z.discriminatedUnion('planType', [
  z.object({
    planType: z.literal(FREE_PLAN),
    currentSubscriptionId: z.null().catch(null),
    ...CommonBaseBranchSchema.shape,
  }),
  z.object({
    planType: PaidPlanSchema,
    currentSubscriptionId: z.string().nonempty(),
    ...CommonBaseBranchSchema.shape,
  }),
])

export type LooseBranch = z.input<typeof BranchSchema>
export type Branch = z.output<typeof BranchSchema>

/**
 * [@]: `/memberships/{membershipId}`
 */
export const BranchMembershipSchema = z.object({
  userId: z.string().nonempty(),
  branchId: z.string().nonempty(),

  ...TimestampMetadataSchema.shape,
})

export type LooseBranchMembership = z.input<typeof BranchMembershipSchema>
export type BranchMembership = z.output<typeof BranchMembershipSchema>

export const MemberInvitationParamsSchema = z.object({
  branchId: z.string().nonempty(),
})

/**
 * Generate invitation ID and code.
 *
 * Invitation code format: `<branchId>.<invitationId>`.
 * Invitation ID format: `<cuid2>`.
 * We generate invitation ID because its get included in code itself.
 * The invitation code contains two parts
 * for easy and fast look-up when validating invitation.
 */
export function generateMemberInvitationIdAndCode(
  params: z.infer<typeof MemberInvitationParamsSchema>,
) {
  const invitationId = createId()

  return {
    invitationId,
    code: `${params.branchId}.${invitationId}`,
  }
}

/**
 * [@]: `/branches/{branchId}/invites/{invitationId}`
 */
export const BranchMembershipInvitationSchema = z.object({
  branchId: z.string().nonempty(),

  email: z.email(),
  code: z.string().nonempty(),

  expiresAt: DateTimeSchema,
  acceptedAt: DateTimeSchema.optional(),
  canceledAt: DateTimeSchema.optional(),
  canceledBy: z.string().optional(),

  ...TimestampMetadataSchema.shape,
})

export type LooseBranchMembershipInvitation = z.input<typeof BranchMembershipInvitationSchema>
export type BranchMembershipInvitation = z.output<typeof BranchMembershipInvitationSchema>
