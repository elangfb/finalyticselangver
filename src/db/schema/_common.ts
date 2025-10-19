import * as z from 'zod'
import { DateTimeSchema } from './datetime'

export const TimestampMetadataSchema = z.object({
  createdAt: DateTimeSchema.nullish().default(new Date()),
  createdBy: z.string().nonempty().nullish().default(null),
  updatedAt: DateTimeSchema.nullish().default(null),
  updatedBy: z.string().nonempty().nullish().default(null),
})

export const YearMonthSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Invalid format. Expected YYYY-MM')
export const YearMonthPeriodSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])\s+to\s+\d{4}-(0[1-9]|1[0-2])$/, 'Invalid format. Expected "YYYY-MM to YYYY-MM"')

export const PositivePercentageRangeSchema = z.number().positive().min(0).max(100)

export function transformUndefinedToNull<T>(value: T) {
  return value === undefined ? null : value
}

export function transformNullToUndefined<T>(value: T) {
  return value === null ? undefined : value
}

export function bigintToUint8Array(bigint: bigint) {
  if (bigint < 0n) throw new RangeError('Only non-negative BigInt supported')
  if (bigint === 0n) return new Uint8Array([0])

  const bytes = []
  let temp = bigint
  while (temp > 0n) {
    bytes.push(Number(temp & 0xffn)) // least significant byte
    temp >>= 8n
  }

  // reverse for big-endian
  return new Uint8Array(bytes.reverse())
}
