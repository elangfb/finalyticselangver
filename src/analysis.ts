import { SalesDataRow, setStore } from './store'
import { formatCurrency, formatNumber } from './utils/string'

/**
 * Sets up and calculates comparative sales analysis between the current and previous periods.
 *
 * @description
 * Computes key metrics—total revenue, number of checks (bills), and average check—for both
 * periods. It then calculates period-over-period growth comparisons and stores all results
 * in the global state so they can be used for dashboards and reports.
 *
 * @param currentData - Sales data array for the current period.
 * @param lastPeriodData - Sales data array for the previous period.
 * @returns This function does not return a value; it updates the global store.
 *
 * @example
 * // Assuming SalesDataRow is defined and setStore is available
 * const currentSales = [
 *   { "Bill Number": "1", Revenue: 100 },
 *   { "Bill Number": "2", Revenue: 200 }
 * ];
 * const lastPeriodSales = [
 *   { "Bill Number": "3", Revenue: 50 },
 *   { "Bill Number": "4", Revenue: 150 }
 * ];
 * setupAnalysis(currentSales, lastPeriodSales);
 * // After execution, the global store will be updated with comparison metrics like 'currentOmzet', 'lastPeriodOmzetComparison', etc.
 */
export function setupAnalysis(currentData: SalesDataRow[], lastPeriodData: SalesDataRow[]) {
  const currentOmzet = currentData.reduce((sum, d) => sum + d.Revenue, 0)
  const currentCheck = new Set(currentData.map((d) => d['Bill Number'])).size
  const currentAvgCheck = currentCheck > 0 ? currentOmzet / currentCheck : 0

  const lastPeriodOmzet = lastPeriodData.reduce((sum, d) => sum + d.Revenue, 0)
  const lastPeriodCheck = new Set(lastPeriodData.map((d) => d['Bill Number'])).size
  const lastPeriodAvgCheck = lastPeriodCheck > 0 ? lastPeriodOmzet / lastPeriodCheck : 0

  setStore('currentOmzet', currentOmzet)
  setStore('currentOmzetFormatted', formatCurrency(currentOmzet))
  setStore('currentCheck', currentCheck)
  setStore('currentCheckFormatted', formatNumber(currentCheck))
  setStore('currentAvgCheck', currentAvgCheck)
  setStore('currentAvgCheckFormatted', formatCurrency(currentAvgCheck))

  setStore('lastPeriodOmzet', lastPeriodOmzet)
  setStore('lastPeriodCheck', lastPeriodCheck)
  setStore('lastPeriodAvgCheck', lastPeriodAvgCheck)

  const omzetComparison = calculateComparison(currentOmzet, lastPeriodOmzet)
  setStore('lastPeriodOmzetComparison', omzetComparison)

  const checkComparison = calculateComparison(currentCheck, lastPeriodCheck)
  setStore('lastPeriodCheckComparison', checkComparison)

  const avgCheckComparison = calculateComparison(currentAvgCheck, lastPeriodAvgCheck)
  setStore('lastPeriodAvgCheckComparison', avgCheckComparison)
}

/**
 * Calculates the comparison between two numeric values and returns change details.
 *
 * @description
 * Compares two numbers, computes the percentage growth or decline, and determines
 * whether the current value increased or decreased relative to the previous one.
 * Intended for consistently displaying period-over-period performance metrics.
 *
 * @param current - The current value.
 * @param previous - The previous value.
 * @returns An object describing the change with the following properties:
 *   - `upOrDown`: Direction arrow ("▲" for increase, "▼" for decrease).
 *   - `percentage`: Percentage change, formatted as a string.
 *   - `plusOrMinus`: Sign character ("+" or "-") indicating growth direction.
 *   - `difference`: Absolute difference between the two values, formatted as a string.
 *
 * @example
 * calculateComparison(150, 100)
 * // => { upOrDown: '▲', percentage: '50.0', plusOrMinus: '+', difference: '50' }
 * calculateComparison(75, 100)
 * // => { upOrDown: '▼', percentage: '25.0', plusOrMinus: '-', difference: '25' }
 * calculateComparison(100, 100)
 * // => { upOrDown: '▲', percentage: '0.0', plusOrMinus: '+', difference: '0' }
 * calculateComparison(50, 0)
 * // => { upOrDown: '', percentage: 'N/A', plusOrMinus: '', difference: 'N/A' }
 */
export function calculateComparison(current: number, previous: number) {
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
