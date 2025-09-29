// Contains utility functions specifically for formatting Chart.js options and callbacks.

import { deepmerge } from 'deepmerge-ts';
import { formatCurrency, formatNumber } from '../helpers';

/**
 * Shortens a large number to a more readable format (e.g., 1.2M, 5K).
 * @param value The number to shorten.
 * @returns The shortened number string.
 */
export function shortenNumber(value: number | string): string {
  const num = Number(value);
  if (isNaN(num)) return '0';
  if (num >= 1_000_000_000) return (num / 1_000_000_000).toFixed(1).replace(/\.0$/, '') + 'B';
  if (num >= 1_000_000) return (num / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (num >= 1_000) return (num / 1_000).toFixed(1).replace(/\.0$/, '') + 'K';
  return num.toString();
}

/**
 * Shortens a large currency value, adding an "Rp" prefix.
 * @param value The currency value to shorten.
 * @returns The shortened currency string (e.g., 'Rp1.2M').
 */
export function shortenCurrency(value: number | string): string {
  return 'Rp' + shortenNumber(value);
}

/**
 * A default Chart.js tooltip callback for formatting labels as currency.
 * @param context The Chart.js tooltip context object.
 * @returns The formatted currency label string.
 */
export function currencyTooltipCallback(context: any): string {
  let label = context.dataset.label || '';
  if (label) {
      label += ': ';
  }
  const value = context.parsed.y || context.parsed.x || context.parsed;
  label += formatCurrency(value);
  return label;
}

/**
 * A callback for formatting chart X-axis ticks as shortened dates (e.g., 'Jan 23').
 * @param this Chart.js scale context.
 * @param tickValue The index of the tick.
 * @returns The formatted date string.
 */
export function shortenDateTickCallback(this: any, tickValue: number): string {
    const label = this.getLabelForValue(tickValue);
    if (typeof label !== 'string' || !label) return '';
    try {
        const date = new Date(label);
        // Check if it's a valid date before formatting
        if (isNaN(date.getTime())) return label;
        return date.toLocaleDateString('en-GB', { month: 'short', day: 'numeric' });
    } catch (e) {
        return label; // Fallback to original label on error
    }
}

/**
 * Higher-order function to create a Chart.js options object for tooltips.
 * @param callbacks Custom callback functions for the tooltip.
 * @returns A Chart.js options snippet for tooltips.
 */
export function chartTooltip(callbacks: object): object {
  return { plugins: { tooltip: { callbacks } } };
}

/**
 * Higher-order function to create a Chart.js options object for the X-axis ticks.
 * @param callback The function to format the tick labels.
 * @returns A Chart.js options snippet for the X-axis.
 */
export function chartXTicks(callback: (value: any) => string): object {
  return { scales: { x: { ticks: { callback } } } };
}

/**
 * Higher-order function to create a Chart.js options object for the Y-axis ticks.
 * @param callback The function to format the tick labels.
 * @returns A Chart.js options snippet for the Y-axis.
 */
export function chartYTicks(callback: (value: any) => string): object {
  return { scales: { y: { ticks: { callback } } } };
}

/**
 * Re-exports the deepmerge function for safely merging nested Chart.js options.
 */
export const mergeChartOptions = deepmerge;
