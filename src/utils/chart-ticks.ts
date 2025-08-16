import type { TickOptions } from "chart.js";
import { shortenDate } from "./string";

type TickCallback = TickOptions['callback']

/**
 * Generate type-safe Chart.js scales configuration with custom tick formatting callback.
 *
 * @description
 * Creates Chart.js scales configuration object with custom tick formatting callback
 * for specified axis. Provides type-safe wrapper for Chart.js tick customization,
 * enabling consistent formatting across charts with proper TypeScript support.
 * Returns properly structured scales object for Chart.js configuration.
 *
 * @param axis - Chart axis identifier ('x', 'y', or custom axis name).
 * @param callback - Tick formatting function to customize label display.
 * @returns Chart.js scales configuration object with tick callback.
 *
 * @example
 * // Format Y-axis ticks as currency
 * const currencyTicks = chartTicks('y', (value) => `Rp ${value.toLocaleString()}`);
 * // Use in Chart.js options
 * const chartOptions = { ...currencyTicks };
 */
export function chartTicks<
    TAxis extends string,
    TCallback extends TickCallback,
>(axis: TAxis, callback: TCallback) {
    return { scales: { [axis]: { ticks: { callback } } } }
}

/**
 * Generate Chart.js X-axis scales configuration with custom tick formatting.
 *
 * @description
 * Convenience function that creates X-axis specific scales configuration with
 * custom tick formatting callback. Provides shorthand for chartTicks('x', callback)
 * to simplify X-axis tick customization in Chart.js configurations. Commonly
 * used for formatting time labels, category names, or other X-axis data.
 *
 * @param callback - Tick formatting function to customize X-axis label display.
 * @returns Chart.js X-axis scales configuration object with tick callback.
 *
 * @example
 * // Format X-axis labels as uppercase
 * const xAxisConfig = chartXTicks((value) => value.toString().toUpperCase());
 * // Use in Chart.js options
 * const chartOptions = { ...xAxisConfig };
 */
export function chartXTicks<TCallback extends TickCallback>(callback: TCallback) {
    return chartTicks('x', callback)
}

/**
 * Generate Chart.js Y-axis scales configuration with custom tick formatting.
 *
 * @description
 * Convenience function that creates Y-axis specific scales configuration with
 * custom tick formatting callback. Provides shorthand for chartTicks('y', callback)
 * to simplify Y-axis tick customization in Chart.js configurations. Commonly
 * used for formatting currency values, percentages, or other Y-axis numerical data.
 *
 * @param callback - Tick formatting function to customize Y-axis label display.
 * @returns Chart.js Y-axis scales configuration object with tick callback.
 *
 * @example
 * // Format Y-axis labels as percentages
 * const yAxisConfig = chartYTicks((value) => `${value}%`);
 * // Format as currency
 * const currencyConfig = chartYTicks((value) => `Rp ${value.toLocaleString()}`);
 */
export function chartYTicks<TCallback extends TickCallback>(callback: TCallback) {
    return chartTicks('y', callback)
}

/**
 * Format Chart.js date tick labels using `shortenDate` utility.
 *
 * @description
 * Callback for Chart.js tick formatting: retrieves the label at `index` from
 * `this.chart.data.labels`, then shortens it based on context.
 *
 * @param {any} _value – Original tick value (unused).
 * @param {number} index – Position of the tick in the labels array.
 * @returns {string} Shortened date string.
 *
 * @example
 * // Use as formatter in X-axis ticks:
 * const xAxis = chartXTicks(shortenDateTickCallback);
 * // => { scales: { x: { ticks: { callback: shortenDateTickCallback } } } }
 */
export const shortenDateTickCallback = function (_, index) {
    const labels = this.chart.data.labels as string[];

    return shortenDate(labels[index]!, labels);
} satisfies TickCallback
