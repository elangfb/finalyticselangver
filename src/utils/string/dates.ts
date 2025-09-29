export const shortMonths = [
  'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun',
  'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'
] as const

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

/**
 * Format a date to machine-parsable year-month format.
 *
 * @description
 * Converts a date to YYYY-MM format for consistent machine processing.
 * Useful for API keys, database queries, or standardized date comparisons.
 *
 * @param {string | Date} date – Date to format.
 * @returns {string} Year-month string in YYYY-MM format.
 *
 * @example
 * formatMachineYearMonth('2024-06-24')
 * // => '2024-06'
 *
 * formatMachineYearMonth(new Date('2023-12-15'))
 * // => '2023-12'
 *
 * formatMachineYearMonth('2025-01-01T10:30:00Z')
 * // => '2025-01'
 */
export function formatMachineYearMonth(date: string | Date): string {
  const dateObj = new Date(date);

  if (isNaN(dateObj.getTime())) {
    throw new Error('Invalid date provided');
  }

  const year = dateObj.getFullYear();
  const month = (dateObj.getMonth() + 1).toString().padStart(2, '0');

  return `${year}-${month}`;
}

/**
 * Format a date to machine-parsable year-month-day format.
 *
 * @description
 * Converts a date to YYYY-MM-DD format for consistent machine processing.
 * Useful for API parameters, database queries, or standardized date comparisons.
 *
 * @param {string | Date} date – Date to format.
 * @returns {string} Year-month-day string in YYYY-MM-DD format.
 *
 * @example
 * formatMachineYearMonthDay('2024-06-24')
 * // => '2024-06-24'
 *
 * formatMachineYearMonthDay(new Date('2023-12-15'))
 * // => '2023-12-15'
 *
 * formatMachineYearMonthDay('2025-01-01T10:30:00Z')
 * // => '2025-01-01'
 */
export function formatMachineYearMonthDay(date: string | Date): string {
  const dateObj = new Date(date);

  if (isNaN(dateObj.getTime())) {
    throw new Error('Invalid date provided');
  }

  const year = dateObj.getFullYear();
  const month = (dateObj.getMonth() + 1).toString().padStart(2, '0');
  const day = dateObj.getDate().toString().padStart(2, '0');

  return `${year}-${month}-${day}`;
}
