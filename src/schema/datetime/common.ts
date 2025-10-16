import * as z from "zod";

export type CompatibleDateTimeInput =
  | Date
  | string
  | number // seconds or milliseconds Unix timestamps
  | { seconds: number; nanoseconds: number } // Firestore Timestamp format
  | { _seconds: number; _nanoseconds: number }; // Client SDK Firestore Timestamp format

// Helpers
const toMillisFromSeconds = (s: number, ns = 0) =>
  s * 1000 + Math.floor(ns / 1_000_000);

const coerceNumberToMillis = (n: number) => {
  const abs = Math.abs(n);

  // Heuristics:
  // - < 1e12 → seconds (10-11 digits, e.g. 1700000000)
  // - 1e12..1e16 → milliseconds (13 digits, e.g. 1700000000000)
  // - >= 1e16 → micro/nanoseconds; fall back to dividing to ms
  if (abs < 1e12) return n * 1000;           // seconds → ms
  if (abs < 1e16) return n;                  // already ms
  return Math.trunc(n / 1000);               // µs/ns → ms (best-effort)
};

const FirestoreTimestampSchema = z.object({
    seconds: z.number(),
    nanoseconds: z.number(),
});

const FirestoreClientTimestampSchema = z.object({
    _seconds: z.number(),
    _nanoseconds: z.number(),
});

/**
 * Schema: accepts multiple timestamp shapes and outputs a JS Date.
 */
export const DateTimeSchema = z
  .union([
    z.date(),
    z.string(), // ISO string or numeric string
    z.number(), // seconds or milliseconds
    FirestoreTimestampSchema,
    FirestoreClientTimestampSchema,
  ])
  .transform<Date>((value) => {
    // Date instance → return as-is
    if (value instanceof Date) return value;

    // Firestore {seconds, nanoseconds}
    if ("seconds" in (value as any) && "nanoseconds" in (value as any)) {
      const v = value as { seconds: number; nanoseconds: number };
      return new Date(toMillisFromSeconds(v.seconds, v.nanoseconds));
    }

    // Firestore {_seconds, _nanoseconds}
    if ("_seconds" in (value as any) && "_nanoseconds" in (value as any)) {
      const v = value as { _seconds: number; _nanoseconds: number };
      return new Date(toMillisFromSeconds(v._seconds, v._nanoseconds));
    }

    // number → seconds or milliseconds (heuristic)
    if (typeof value === "number") {
      return new Date(coerceNumberToMillis(value));
    }

    // string → numeric string or ISO/Date-parsable string
    if (typeof value === "string") {
      const trimmed = value.trim();

      // Numeric string (int/float, optional sign)
      if (/^[+-]?\d+(\.\d+)?$/.test(trimmed)) {
        const num = Number(trimmed);
        return new Date(coerceNumberToMillis(num));
      }

      // Otherwise let Date parse (ISO, RFC2822, etc.)
      return new Date(trimmed);
    }

    // Should be unreachable due to union, but keep a safe fallback.
    return new Date(NaN);
  })
  // Ensure the resulting Date is valid.
  .pipe(
    z.date().refine((d) => !Number.isNaN(d.getTime()), {
      message: "Invalid date/time value",
    })
  );

// Convenient helper if you prefer a function wrapper.
export const parseDateTime = (input: CompatibleDateTimeInput) =>
  DateTimeSchema.parse(input);

// Example usage:
// const d1 = parseDateTime("2025-10-16T10:00:00Z");
// const d2 = parseDateTime(1700000000);        // seconds → Date
// const d3 = parseDateTime(1700000000000);     // ms → Date
// const d4 = parseDateTime({ seconds: 1700000000, nanoseconds: 123000000 });
// const d5 = DateTimeSchema.parse(new Date());
