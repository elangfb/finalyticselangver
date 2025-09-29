// Contains specialized utility functions for formatting strings, numbers, and dates for UI and AI data.

// Re-export general formatters from the core helpers file with their original aliases for consistency.
export { formatCurrency as formatCurrencyUtil, formatNumber as formatNumberUtil } from '../helpers';

/**
 * Formats a decimal value (e.g., 0.25) into a percentage string with one decimal place.
 * @param value The decimal number to format.
 * @returns A string like "25.0%". Returns "N/A" if the value is not a valid number.
 */
export function formatDecimalBasedPercentage(value: number): string {
    if (typeof value !== 'number' || isNaN(value)) return 'N/A';
    return `${(value * 100).toFixed(1)}%`;
}

/**
 * Formats an integer or float value (e.g., 25) into a percentage string with specified decimal places.
 * @param value The number to format, where 100 is 100%.
 * @param fractionDigits The number of decimal places for the output.
 * @returns A string like "25.00%". Returns "N/A" if the value is not a valid number.
 */
export function formatIntBasedPercentage(value: number, fractionDigits = 2): string {
    if (typeof value !== 'number' || isNaN(value)) return 'N/A';
    return `${value.toFixed(fractionDigits)}%`;
}

/**
 * Formats a Date object or a date string into a machine-readable "YYYY-MM-DD" string.
 * @param date The Date object or string to format.
 * @returns A string in "YYYY-MM-DD" format, or an empty string if the date is invalid.
 */
export function formatMachineYearMonthDay(date: Date | string): string {
    const d = new Date(date);
    if (isNaN(d.getTime())) return '';

    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
}

/**
 * Formats a date string (like "YYYY-MM-DD" or a full ISO string) into a "YYYY-MM" string.
 * @param dateStr The date string to format.
 * @returns A string in "YYYY-MM" format, or an empty string if the input is invalid.
 */
export function formatMachineYearMonth(dateStr: string): string {
    if (!dateStr || typeof dateStr !== 'string' || dateStr.length < 7) return '';
    // This safely handles "YYYY-MM" or "YYYY-MM-DD..." formats.
    return dateStr.slice(0, 7);
}
