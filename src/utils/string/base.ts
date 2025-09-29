/**
 * Clean and normalize a multiline string by trimming whitespace on each line.
 *
 * @description
 * Splits by newline, trims each line, and rejoins.
 * Useful for normalizing template literals or raw text inputs.
 *
 * @param {string} value – Multiline string to clean.
 * @returns {string} Cleaned string with trimmed lines.
 *
 * @example
 * // Input string with uneven whitespace
 * // "  foo\n bar  "
 * trimMultiline("  foo\n bar  ")
 * // => "foo\nbar"
 */
export function trimMultiline(value: string): string {
  return value.trim().split('\n').map((line) => line.trim()).join('\n')
}

/**
 * Truncate a number to given decimal places without rounding.
 *
 * @description
 * Multiplies, trims excess decimals, and divides back to produce exact truncation.
 *
 * @param {number} value – Number to truncate.
 * @param {number} decimals – Decimal places to keep.
 * @returns {number} Truncated numeric value.
 *
 * @example
 * truncateToFixed(1.237, 2)
 * // => 1.23
 */
export function truncateToFixed(value: number, decimals: number) {
  const multiplier = Math.pow(10, decimals)
  return Math.trunc(value * multiplier) / multiplier
}

export const html = String.raw
