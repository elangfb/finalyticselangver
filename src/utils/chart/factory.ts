import Chart from 'chart.js/auto';
import * as $store from '../../store';
import { mergeChartOptions, chartTooltip, chartXTicks, chartYTicks } from '../chart-formatter';

// Chart.js types
export type { Chart } from 'chart.js/auto';

/**
 * Destroy all Chart.js instances managed by the factory.
 *
 * @description
 * Destroys all Chart.js instances stored in the charts store and resets
 * the charts storage to empty state. This prevents memory leaks when
 * navigating between views or resetting analysis state.
 *
 * TODO: See TODO.md #7 - Consider automated cleanup patterns
 */
export function destroyCharts(): void {
  Object.values($store.getCharts()).forEach((chart) => chart.destroy())
  $store.setCharts({})
}

/**
 * Create a Chart.js instance with automatic PDF chart generation and improved defaults.
 *
 * @description
 * Creates a new Chart.js instance with enhanced default options and automatic
 * PDF chart generation. Destroys any existing chart with the same canvas ID
 * to prevent memory leaks. Automatically creates PDF versions if corresponding
 * canvas elements exist with -pdf or -landscape-pdf suffixes.
 *
 * @param canvasId - The ID of the canvas element where the chart will be rendered.
 * @param type - The Chart.js chart type (e.g., 'line', 'bar', 'pie', 'doughnut').
 * @param data - Chart.js data object containing datasets, labels, and styling.
 * @param options - Additional Chart.js configuration options to merge with defaults.
 * @returns The created Chart.js instance, or null if canvas not found.
 */
export function createChart(canvasId: string, type: string, data: any, options: any = {}): Chart | null {
  const existingChart = $store.getChartProperty(canvasId);
  if (existingChart) existingChart.destroy();

  const canvas = document.getElementById(canvasId) as HTMLCanvasElement;
  if (!canvas) {
    console.warn(`Canvas element not found: ${canvasId}`);
    return null;
  }

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    console.warn(`Could not get 2D context for canvas: ${canvasId}`);
    return null;
  }

  // Determine if this is a PDF chart
  const isPDF = canvasId.includes('-pdf');

  // Apply enhanced default options
  const defaultOptions = getDefaultOptions(isPDF);
  const finalOptions = mergeChartOptions(defaultOptions, options);

  const newChart = new Chart(ctx, { type, data, options: finalOptions });
  $store.setChartProperty(canvasId, newChart);

  // TODO: See TODO.md #8 - Consider performance optimizations for large datasets

  // Auto create chart inside PDF with same data and options (only for non-PDF charts)
  if (!isPDF) {
    const chartPdf = document.getElementById(`${canvasId}-pdf`)
    if (chartPdf) {
      console.debug('Creating chart PDF for', canvasId)
      createChart(`${canvasId}-pdf`, type, data, options)
    }

    // Auto create chart inside PDF landscape with same data and options
    const chartLandscapePdfId = `${canvasId}-landscape-pdf`
    const chartLandscapePdf = document.getElementById(chartLandscapePdfId)
    if (chartLandscapePdf) {
      console.debug('Creating chart landscape PDF for', canvasId)
      createChart(chartLandscapePdfId, type, data, options)
    }
  }

  return newChart;
}

/**
 * Get default Chart.js options optimized for web or PDF rendering.
 *
 * @description
 * Returns default configuration options for Chart.js instances, with
 * specific optimizations for PDF rendering (disabled animation, fixed
 * aspect ratio) or web display (responsive, maintainAspectRatio).
 *
 * @param isPDF - Whether this chart is intended for PDF export.
 * @returns Default Chart.js options object.
 */
function getDefaultOptions(isPDF: boolean = false) {
  const baseOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        position: 'top' as const
      },
      tooltip: chartTooltip
    },
    scales: {
      x: chartXTicks,
      y: chartYTicks
    }
  };

  if (isPDF) {
    return {
      ...baseOptions,
      responsive: false,
      maintainAspectRatio: true,
      aspectRatio: 2,
      animation: false
    };
  }

  return baseOptions;
}
