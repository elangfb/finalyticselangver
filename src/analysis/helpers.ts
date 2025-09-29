// Shared helper functions for creating charts and formatting data across the analysis views.

import * as $store from '../store';

// Assuming Chart.js is available globally via a script tag in index.html
declare const Chart: any;

/**
 * Destroys all active Chart.js instances to prevent memory leaks and resets the store.
 */
export function destroyCharts(): void {
  Object.values($store.getCharts()).forEach((chart) => chart.destroy());
  $store.setCharts({});
}

/**
 * Creates a Chart.js instance, stores it, and automatically handles PDF versions if their canvas exists.
 * @param canvasId The ID of the canvas element where the chart will be rendered.
 * @param type The Chart.js chart type (e.g., 'line', 'bar', 'doughnut').
 * @param data The chart's data object, containing labels and datasets.
 * @param options Additional Chart.js configuration options to merge with defaults.
 */
export function createChart(canvasId: string, type: any, data: any, options: any = {}): void {
  const canvas = document.getElementById(canvasId) as HTMLCanvasElement;
  if (!canvas) {
    // Silently fail if the canvas for a chart doesn't exist on the current view.
    return;
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // Destroy any existing chart on the same canvas to prevent memory leaks.
  const existingChart = $store.getChartProperty(canvasId);
  if (existingChart) {
    existingChart.destroy();
  }

  const finalOptions = { responsive: true, maintainAspectRatio: false, ...options };
  const newChart = new Chart(ctx, { type, data, options: finalOptions });
  $store.setChartProperty(canvasId, newChart);

  // Automatically create chart versions for PDF export if their canvas elements exist.
  const pdfCanvasId = `${canvasId}-pdf`;
  if (document.getElementById(pdfCanvasId)) {
    createChart(pdfCanvasId, type, data, options);
  }

  const pdfLandscapeCanvasId = `${canvasId.replace(/-pdf$/, '')}-landscape-pdf`;
  if (document.getElementById(pdfLandscapeCanvasId)) {
    createChart(pdfLandscapeCanvasId, type, data, options);
  }
}

/**
 * Formats a number into an Indonesian currency string (e.g., "Rp1.234.567").
 * @param value The numeric value to format.
 * @param prefix The currency prefix, defaults to 'Rp'.
 * @param fractionDigits The number of decimal places, defaults to 0.
 */
export const formatCurrency = (value: number, prefix = 'Rp', fractionDigits = 0): string => {
  if (typeof value !== 'number' || isNaN(value)) return `${prefix} 0`;
  return `${prefix}${value.toLocaleString('id-ID', { maximumFractionDigits: fractionDigits })}`;
};

/**
 * Formats a number into a string with Indonesian thousand separators (e.g., "1.234.567").
 * @param value The numeric value to format.
 * @param fractionDigits The number of decimal places, defaults to 0.
 */
export const formatNumber = (value: number, fractionDigits = 0): string => {
  if (typeof value !== 'number' || isNaN(value)) return `0`;
  return value.toLocaleString('id-ID', { maximumFractionDigits: fractionDigits });
};

/**
 * Compares two numbers and returns an object with formatted strings for displaying the change.
 * @param current The current value.
 * @param previous The previous value to compare against.
 */
export const calculateComparison = (current: number, previous: number) => {
  if (previous === 0 || typeof current !== 'number' || typeof previous !== 'number') {
    return { upOrDown: '', percentage: 'N/A', plusOrMinus: '', difference: 'N/A' };
  }
  const diff = current - previous;
  const growth = (diff / previous) * 100;
  return {
    upOrDown: growth > 0 ? '▲' : '▼',
    percentage: formatNumber(Math.abs(growth), 1),
    plusOrMinus: growth > 0 ? '+' : '-',
    difference: formatNumber(Math.abs(diff), 0),
  };
};

/**
 * Determines profit trend classification ('growing', 'declining', 'stable') for investment analysis.
 * @param firstValue The profit value from the starting period.
 * @param lastValue The profit value from the ending period.
 * @param threshold The percentage change required to be considered growing or declining.
 */
export function getProfitTrend(firstValue: number, lastValue: number, threshold = 5): string {
    if (firstValue === 0) return 'stable';
    const changePercent = ((lastValue - firstValue) / Math.abs(firstValue)) * 100;
    if (Math.abs(changePercent) <= threshold) return 'stable';
    return changePercent > 0 ? 'growing' : 'declining';
}
