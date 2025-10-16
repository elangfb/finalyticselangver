import * as z from "zod";
import type { FieldValue as ClientFieldValue } from "firebase/firestore";
import { DateTimeSchema, type CompatibleDateTimeInput } from "./common";

/** Heuristic guard: client FieldValue (no runtime ctor in v9+) */
const isClientFieldValue = (v: unknown): v is ClientFieldValue => {
  if (!v || typeof v !== "object") return false;
  const anyV = v as any;
  if (typeof anyV._methodName === "string") return true; // common in modular/compat builds
  const tag = anyV?.toString?.();
  return typeof tag === "string" &&
    /\b(FieldValue|serverTimestamp|arrayUnion|arrayRemove|increment|delete(Field)?)\b/i.test(tag);
};

/** Date | FieldValue (sentinels pass through) */
export const DateTimeOrClientFieldValueSchema = z.union([
    DateTimeSchema,
    z.custom<ClientFieldValue>(isClientFieldValue)
]);
export type DateTimeOrClientFieldValue = z.infer<typeof DateTimeOrClientFieldValueSchema>

export type ClientInput = CompatibleDateTimeInput | ClientFieldValue;
export const parseClientDateTimeOrFieldValue = (input: ClientInput) =>
  DateTimeOrClientFieldValueSchema.parse(input);
