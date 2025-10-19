import * as z from 'zod'
import { TimestampMetadataSchema } from './_common'

const UserRoleSchema = z.enum(['user', 'admin'])

/**
 * [@]: `/users/{uid}`
 */
export const UserSchema = z.object({
  id: z.string().nullish(),
  uid: z.string().nullish(),

  fullName: z.string().nullish(),
  email: z.email(),
  phoneNumber: z.string().nullish(),

  role: UserRoleSchema.nullish(),
  roles: z.array(UserRoleSchema).nullish(),

  hasUploadedData: z.boolean().nullish().transform((v) => v || false),

  ...TimestampMetadataSchema.shape,
}).transform((user) => {
  const { id, roles, ...remaining } = user

  return {
    ...remaining,
    uid: user.uid || id,
    role: user.role || roles?.[0] || 'user',
    fullName: user.fullName || user.email.split('@')[0],
  }
})

export type LooseUser = z.input<typeof UserSchema>
export type User = z.output<typeof UserSchema>
