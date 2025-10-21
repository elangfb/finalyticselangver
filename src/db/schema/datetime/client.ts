import { FieldValue } from 'firebase/firestore'
import { CrossCompatibleDateTimeInput, CrossDateTimeSchema } from './common'
import * as z from 'zod'

export type CompatibleDateTimeInput = CrossCompatibleDateTimeInput | FieldValue

const ClientFieldValueSchema = z.custom<FieldValue>(
  (v) => v instanceof FieldValue,
  'Value must be a Firestore Client SDK FieldValue',
)
export const DateTimeSchema = z.union([ClientFieldValueSchema, CrossDateTimeSchema])

export const parseDateTime = (input: CompatibleDateTimeInput) =>
  DateTimeSchema.parse(input)
