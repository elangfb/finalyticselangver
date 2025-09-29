import { truncateToFixed } from './base'

/**
 * Convert a number to Indonesian currency format with grouping separators.
 *
 * @description
 * Uses locale formatting to insert thousand separators and fixed decimals.
 *
 * @param {number} value – Numeric value to format.
 * @param {string} [prefix='Rp'] – Currency prefix.
 * @param {number} [fractionDigits=0] – Number of decimal digits.
 * @returns {string} String formatted as Indonesian currency.
 *
 * @example
 * formatCurrency(1234567)
 * // => "Rp1.234.567"
 */
export function formatCurrency(value: number, prefix = 'Rp', fractionDigits = 0) {
  if (typeof value !== 'number' || isNaN(value)) return `${prefix}0`
  return `${prefix}${value.toLocaleString('id-ID', { maximumFractionDigits: fractionDigits })}`
}

/**
 * Format a number with thousand separators according to Indonesian locale.
 *
 * @description
 * Inserts grouping separators and limits decimals without rounding.
 *
 * @param {number} value – Numeric value to format.
 * @param {number} [fractionDigits=0] – Number of decimal digits.
 * @returns {string} Formatted number string.
 *
 * @example
 * formatNumber(1234567, 2)
 * // => "1.234.567,00"
 */
export function formatNumber(value: number, fractionDigits = 0) {
  if (typeof value !== 'number' || isNaN(value)) return `0`
  return value.toLocaleString('id-ID', { maximumFractionDigits: fractionDigits })
}

/**
 * Format a number as a percentage string.
 *
 * @description
 * Appends a '%' symbol and uses locale-specific formatting for the number.
 * Best for whole or pre-calculated percentage values.
 *
 * @param value – The numeric value to format.
 * @param fractionDigits – Number of decimal digits to display.
 * @returns Formatted percentage string, e.g., "75%".
 *
 * @example
 * formatIntBasedPercentage(75.5, 1)
 * // => "75,5%"
 */
export function formatIntBasedPercentage(value: number, fractionDigits = 0): string {
  if (typeof value !== 'number' || isNaN(value)) return '0%'

  const formatted = truncateToFixed(value, fractionDigits).toLocaleString('id-ID', {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  })

  return `${formatted}%`
}

/**
 * Format a number as a percentage with configurable decimal points.
 *
 * @description
 * Converts a decimal value to percentage format with Indonesian locale formatting.
 * The input should be in decimal form (0.15 for 15%).
 *
 * @param {number} value – Decimal value to format as percentage (e.g., 0.15 for 15%).
 * @param {number} [fractionDigits=1] – Number of decimal digits to display.
 * @returns {string} Formatted percentage string.
 *
 * @example
 * formatDecimalBasedPercentage(0.1546, 2)
 * // => "15,46%"
 *
 * formatDecimalBasedPercentage(0.25)
 * // => "25,0%"
 *
 * formatDecimalBasedPercentage(0.333333, 0)
 * // => "33%"
 */
export function formatDecimalBasedPercentage(value: number, fractionDigits = 1): string {
  if (typeof value !== 'number' || isNaN(value)) return '0%'

  const percentage = value * 100

  return formatIntBasedPercentage(percentage, fractionDigits)
}

// Mapping untuk suffix berdasarkan nilai
const numberSuffixMap = Object.freeze({
  [1_000_000_000_000_000]: 'kd', // kuadriliun
  [1_000_000_000_000]: 't', // triliun
  [1_000_000_000]: 'm', // milyar
  [1_000_000]: 'jt', // juta
  [1_000]: 'rb', // ribu
})

/**
 * Convert a large number to a compact format with Indonesian suffixes.
 *
 * @description
 * Uses suffixes: 'rb' (thousand), 'jt' (million), 'm' (billion), 't' (trillion),
 * 'kd' (quadrillion), with one decimal precision.
 *
 * @param {number} value – Numeric value to shorten.
 * @returns {string} Compact string, e.g., '1,2jt'.
 *
 * @example
 * shortenNumber(1500000)
 * // => '1,5jt'
 */
export function shortenNumber(value: number) {
  // Urutkan dari nilai terbesar ke terkecil
  const sortedKeys = Object.keys(numberSuffixMap)
    .map(Number)
    .toSorted((a, b) => b - a)

  for (const divisor of sortedKeys) {
    if (value >= divisor) {
      const truncated = truncateToFixed(value / divisor, 1)
      const suffix = numberSuffixMap[divisor as keyof typeof numberSuffixMap]
      const number = truncated % 1 === 0
        ? truncated.toString()
        : truncated.toFixed(1).replace('.', ',')

      return number + suffix
    }
  }

  return value.toString()
}

/**
 * Convert a currency amount to compact form with prefix and suffix.
 *
 * @description
 * Prepends 'Rp' to a shortened number (see shortenNumber) for compact display.
 *
 * @param {number} value – Currency amount to shorten.
 * @param {string} [prefix='Rp'] – Currency prefix.
 * @returns {string} Compact currency, e.g., 'Rp1,2jt'.
 *
 * @example
 * shortenCurrency(1500000)
 * // => 'Rp1,5jt'
 */
export function shortenCurrency(value: number, prefix = 'Rp') {
  return prefix + shortenNumber(value)
}
