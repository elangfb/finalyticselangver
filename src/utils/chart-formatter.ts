import type { Tick, TickOptions, TooltipOptions } from "chart.js";
import { deepmerge } from "deepmerge-ts";
import { formatCurrency, formatIntBasedPercentage, shortenDate } from "./string";

type TooltipCallbacks = TooltipOptions['callbacks']
type TooltipCallbackLabel = TooltipCallbacks['label']
type TickCallback = TickOptions['callback']

// Internal utility: wrap a simple (number)=>string into a Chart.js tick callback signature
function asTickCallback(fn: (n: number) => string): TickCallback {
    return function (this: unknown, tickValue: string | number, _index: number, _ticks: Tick[]) {
        const v = typeof tickValue === 'number' ? tickValue : Number(tickValue);
        return fn(v);
    } as TickCallback;
}

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
export function chartTicks<TAxis extends string>(axis: TAxis, callback: TickCallback | ((n: number) => string)) {
    const wrapped: TickCallback = (callback as any).length === 1
        ? asTickCallback(callback as (n: number) => string)
        : (callback as TickCallback);
    return { scales: { [axis]: { ticks: { callback: wrapped } } } } as const;
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
export function chartXTicks(callback: TickCallback | ((n: number) => string)) {
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
export function chartYTicks(callback: TickCallback | ((n: number) => string)) {
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
export const shortenDateTickCallback = function (this: any, _: string | number, index: number) {
    const labels = this.chart.data.labels as string[];

    return shortenDate(labels[index]!, labels);
} satisfies TickCallback

/**
 * Generate Chart.js tooltip configuration with custom callback formatters.
 *
 * @description
 * Creates a Chart.js plugins configuration object specifically for tooltip callbacks.
 * This allows you to define custom functions for the title, label, footer, etc.
 *
 * @param callbacks - An object containing callback functions for the tooltip.
 * @returns A Chart.js plugins configuration object for tooltips.
 */
export function chartTooltip<TCallback extends Partial<TooltipCallbacks>>(callbacks: TCallback) {
    return { plugins: { tooltip: { callbacks } } }
}

/**
 * A pre-configured Chart.js tooltip callback to format the label as Indonesian currency.
 */
export const currencyTooltipCallback = ((context) => {
    let label = context.dataset.label || '';
    if (label) {
        label += ': ';
    }
    if (context.parsed.y) {
        label += formatCurrency(context.parsed.y);
    } else if (context.parsed) {
        label += formatCurrency(context.parsed);
    }
    return label;
}) satisfies TooltipCallbackLabel;

/**
 * A pre-configured Chart.js tooltip callback to format the label as a percentage.
 */
export const percentageTooltipCallback = ((context) => {
    let label = context.dataset.label || '';
    if (label) {
        label += ': ';
    }
    if (context.parsed.y) {
        label += formatIntBasedPercentage(context.parsed.y);
    } else if (context.parsed) {
        label += formatIntBasedPercentage(context.parsed);
    }
    return label;
}) satisfies TooltipCallbackLabel;

/**
 * Deeply merges multiple Chart.js option snippets into a single configuration object.
 *
 * @description
 * Essential for combining the output of multiple helper functions (e.g., chartXTicks,
 * chartYTicks, chartTooltip) without overwriting nested properties like `scales` or `plugins`.
 *
 * @param options - A series of Chart.js option objects to merge.
 * @returns A single, deeply merged Chart.js options object.
 */
export function mergeChartOptions<Ts extends Readonly<ReadonlyArray<unknown>>>(...options: readonly [...Ts]): any {
    // deepmerge expects objects; we trust callers to pass partial option snippets
    // Return 'any' so callers can pass this into Chart.js options without excessive typing friction.
    return deepmerge(...(options as unknown as object[])) as any;
}
