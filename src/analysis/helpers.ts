// Shared helper functions for creating charts and formatting data across the analysis views.

import { formatNumber } from '@/utils/string'

export { destroyCharts, createChart } from '@/utils/chart/factory'
export { formatNumber, formatCurrency } from '@/utils/string'

/**
 * Compares two numbers and returns an object with formatted strings for displaying the change.
 * @param current The current value.
 * @param previous The previous value to compare against.
 */
export const calculateComparison = (current: number, previous: number) => {
  if (previous === 0 || typeof current !== 'number' || typeof previous !== 'number') {
    return { upOrDown: '', percentage: 'N/A', plusOrMinus: '', difference: 'N/A' }
  }
  const diff = current - previous
  const growth = (diff / previous) * 100
  return {
    upOrDown: growth > 0 ? '▲' : '▼',
    percentage: formatNumber(Math.abs(growth), 1),
    plusOrMinus: growth > 0 ? '+' : '-',
    difference: formatNumber(Math.abs(diff), 0),
  }
}

/**
 * Determines profit trend classification ('growing', 'declining', 'stable') for investment analysis.
 * @param firstValue The profit value from the starting period.
 * @param lastValue The profit value from the ending period.
 * @param threshold The percentage change required to be considered growing or declining.
 */
export function getProfitTrend(firstValue: number, lastValue: number, threshold = 5): string {
  if (firstValue === 0) return 'stable'
  const changePercent = ((lastValue - firstValue) / Math.abs(firstValue)) * 100
  if (Math.abs(changePercent) <= threshold) return 'stable'
  return changePercent > 0 ? 'growing' : 'declining'
}
