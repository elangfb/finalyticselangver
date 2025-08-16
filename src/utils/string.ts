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
  return value
    .trim()
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
}

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
  if (typeof value !== 'number' || isNaN(value)) return `${prefix} 0`
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
  const multiplier = Math.pow(10, decimals);
  return Math.trunc(value * multiplier) / multiplier;
}

// Mapping untuk suffix berdasarkan nilai
const numberSuffixMap = {
  [1_000_000_000_000_000]: 'kd', // kuadriliun
  [1_000_000_000_000]: 't',      // triliun
  [1_000_000_000]: 'm',          // milyar
  [1_000_000]: 'jt',             // juta
  [1_000]: 'rb'                  // ribu
} as const;

// Fungsi untuk mempersingkat angka dalam format Indonesia
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
    .sort((a, b) => b - a);

  for (const divisor of sortedKeys) {
    if (value >= divisor) {
      const truncated = truncateToFixed(value / divisor, 1);
      const suffix = numberSuffixMap[divisor as keyof typeof numberSuffixMap];
      const number = truncated % 1 === 0
        ? truncated.toString()
        : truncated.toFixed(1).replace('.', ',')

      return number + suffix;
    }
  }

  return value.toString();
}

/**
 * Convert a currency amount to compact form with prefix and suffix.
 *
 * @description
 * Prepends 'Rp' to a shortened number (see shortenNumber) for compact display.
 *
 * @param {number} value – Currency amount to shorten.
 * @returns {string} Compact currency, e.g., 'Rp1,2jt'.
 *
 * @example
 * shortenCurrency(1500000)
 * // => 'Rp1,5jt'
 */
export function shortenCurrency(value: number) {
  return 'Rp' + shortenNumber(value)
}

export const shortMonths = [
  'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun',
  'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'
] as const;

/**
 * Format a date based on its context within an array of dates.
 *
 * @description
 * Returns 'DD MMM' if allDates are in the current year; else 'DD MMM YYYY' to
 * include year. Useful for chart labels or timeline displays.
 *
 * @param {string | Date} date – Date to format.
 * @param {(string | Date)[]} [allDates=[]] – Context array of dates.
 * @returns {string} Context-aware formatted date.
 *
 * @example
 * // All dates in current year
 * shortenDate('2025-08-09', ['2025-01-01', '2025-12-31'])
 * // => '9 Agu'
 *
 * // Mixed years
 * shortenDate('2024-06-24', ['2024-06-24', '2023-05-20'])
 * // => '24 Jun 2024'
 */
export function shortenDate(date: string | Date, allDates: string[] | Date[] = []) {
  const dateObj = new Date(date);
  const currentYear = new Date().getFullYear();
  const dateYear = dateObj.getFullYear();

  // Cek apakah semua tanggal di tahun yang sama
  const allYears = allDates.map(d => new Date(d).getFullYear());
  const allSameYear = allYears.every(year => year === allYears[0]) && dateYear === allYears[0];
  const allCurrentYear = allSameYear && dateYear === currentYear;

  const day = dateObj.getDate();
  const month = shortMonths[dateObj.getMonth()];

  // Format berdasarkan kondisi
  if (allCurrentYear) {
    return `${day} ${month}`; // 24 Jun
  } else {
    return `${day} ${month} ${dateYear}`; // 24 Jun 2024
  }
}
