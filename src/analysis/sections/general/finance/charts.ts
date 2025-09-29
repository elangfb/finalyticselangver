// Charts for General > Finance

import { deepmerge } from 'deepmerge-ts'
import { createChart } from '../../../helpers'
import { AlsoStoreFn, createMaybeAlsoStoreFn } from '../../../utils/store-helpers'
import { chartTooltip, chartYTicks, mergeChartOptions, shortenCurrency } from '../../../utils/chart-formatters'
import { calculateAllPnlMetrics } from '../../../utils/pnl'
import { formatCurrency as formatCurrencyUtil, formatDecimalBasedPercentage, formatIntBasedPercentage, formatMachineYearMonth } from '../../../utils/string-formatters'

/**
 * Generates a stacked bar chart with Omset, Expense, and Profit stacked in that order.
 */
export function generatePnlOverviewChart(reports: any[], config?: { alsoStore?: AlsoStoreFn }) {
  const labels = reports.map(r => new Date(r.period + '-02').toLocaleString('default', { month: 'short', year: 'numeric' }))
  const revenueData: number[] = []
  const expenseData: number[] = []
  const profitData: number[] = []

  reports.forEach(r => {
    const pnlData = r.pnlData
    const allMetrics = calculateAllPnlMetrics(pnlData)
    const revenue = allMetrics['Pendapatan (Revenue)'] || 0
    const profit = allMetrics['Pendapatan Bersih (Net Income)'] || 0
    const expense = revenue - profit
    revenueData.push(revenue)
    expenseData.push(expense)
    profitData.push(profit)
  })

  const alsoStore = createMaybeAlsoStoreFn(config?.alsoStore)

  createChart('general-pnl-overview-chart', 'bar', {
    labels,
    datasets: [
      {
        label: 'Profit',
  data: alsoStore(profitData, (v: number[]) => ({
          pnlOverviewChart: deepmerge(
            ...v.map((val: number, index: number) => ({ [formatMachineYearMonth(reports[index].period)]: { profit: val } })),
          ),
        })),
        backgroundColor: '#10B981',
      },
      {
        label: 'Expense',
  data: alsoStore(expenseData, (v: number[]) => ({
          pnlOverviewChart: deepmerge(
            ...v.map((val: number, index: number) => ({ [formatMachineYearMonth(reports[index].period)]: { expense: val } })),
          ),
        })),
        backgroundColor: '#EF4444',
      },
    ],
  }, {
    plugins: {
      tooltip: {
        callbacks: {
          label: (context: any) => {
            const label = context.dataset.label || ''
            const value = context.raw as number
            const formattedValue = `Rp${Math.round(value).toLocaleString('id-ID')}`
            const totalRevenue = revenueData[context.dataIndex] ?? 0
            if (totalRevenue > 0) {
              const percentage = (value / totalRevenue) * 100
              return `${label}: ${formattedValue} (${percentage.toFixed(1)}%)`
            }
            return `${label}: ${formattedValue}`
          },
          footer: (tooltipItems: any[]) => {
            const sum = tooltipItems.reduce((acc: number, t: any) => acc + t.parsed.y, 0)
            return 'Total Stack (Omset): ' + `Rp${Math.round(sum).toLocaleString('id-ID')}`
          },
        },
      },
    },
    scales: { x: { stacked: true }, y: { stacked: true, ticks: { callback: (v: string | number) => shortenCurrency(Number(v)) } } },
  })
}

/**
 * Reusable function to generate dual-axis financial ratio charts.
 */
export function generateFinancialRatioChart(
  reports: Array<{ period: string; pnlData?: Record<string, Record<string, number>> }>,
  config: { canvasId: string; metric: string; title: string; alsoStore?: AlsoStoreFn },
) {
  const labels = reports.map(r => new Date(r.period + '-02').toLocaleString('default', { month: 'short', year: 'numeric' }))
  const barData: number[] = []
  const lineData: number[] = []

  reports.forEach(r => {
    const allMetrics = calculateAllPnlMetrics(r.pnlData || {})
    const revenue = allMetrics['Pendapatan (Revenue)'] || 0
    const absoluteValue = allMetrics[config.metric] || 0
    barData.push(absoluteValue)
    lineData.push(revenue > 0 ? (absoluteValue / revenue) * 100 : 0)
  })

  config.alsoStore?.(barData, (v: number[]) => ({
    [`${config.title} Chart`]: deepmerge(
  ...v.map((val: number, i: number) => ({ [formatMachineYearMonth(reports[i]!.period)]: { inCurrency: formatCurrencyUtil(val) } })),
    ),
  }))
  config.alsoStore?.(lineData, (v: number[]) => ({
    [`${config.title} Chart`]: deepmerge(
  ...v.map((val: number, i: number) => ({ [formatMachineYearMonth(reports[i]!.period)]: { inPercentage: formatDecimalBasedPercentage(val / 100) } })),
    ),
  }))

  createChart(config.canvasId, 'bar', {
    labels,
    datasets: [
      { type: 'bar', label: `${config.title} (Rp)`, data: barData, backgroundColor: '#60A5FA', yAxisID: 'y-rp', order: 2 },
      { type: 'line', label: `${config.title} (%)`, data: lineData, borderColor: '#F97316', yAxisID: 'y-percent', order: 1 },
    ],
  }, mergeChartOptions(
    { scales: {
      'y-rp': { type: 'linear', position: 'left', title: { display: true, text: 'Value (Rp)' }, ticks: { callback: (v: string | number) => shortenCurrency(Number(v)) } },
      'y-percent': { type: 'linear', position: 'right', title: { display: true, text: 'Percentage (%)' }, grid: { drawOnChartArea: false }, ticks: { callback: (v: string | number) => `${Number(v).toFixed(1)}%` } },
    } },
    chartTooltip({
  label: (context: any) => {
        let label = context.dataset.label || ''
        if (label) label += ': '
        const value = context.parsed.y
        label += context.dataset.yAxisID === 'y-rp' ? formatCurrencyUtil(value) : formatIntBasedPercentage(value, 2)
        return label
      },
    }),
  ))
}

/**
 * Generates a dual-axis chart for a specific sub-category's value and its ratio to revenue.
 */
export function generateSpecificSubCategoryRatioChart(
  reports: Array<{ period: string; pnlData?: Record<string, Record<string, number>> }>,
  config: { canvasId: string; mainCategory: string; subCategory: string; title: string; alsoStore?: AlsoStoreFn },
) {
  const labels = reports.map(r => new Date(r.period + '-02').toLocaleString('default', { month: 'short', year: 'numeric' }))
  const barData: number[] = []
  const lineData: number[] = []

  reports.forEach(r => {
    const pnlData = r.pnlData || {}
    const revenue = Object.values(pnlData['Pendapatan (Revenue)'] || {}).reduce((s: number, v: number) => s + v, 0)
    const subCategoryValue = pnlData[config.mainCategory]?.[config.subCategory] || 0
    barData.push(subCategoryValue)
    lineData.push(revenue > 0 ? (subCategoryValue / revenue) * 100 : 0)
  })

  config.alsoStore?.(barData, (v: number[]) => ({
    [`${config.title} Chart`]: deepmerge(
  ...v.map((val: number, i: number) => ({ [formatMachineYearMonth(reports[i]!.period)]: { inCurrency: formatCurrencyUtil(val) } })),
    ),
  }))
  config.alsoStore?.(lineData, (v: number[]) => ({
    [`${config.title} Chart`]: deepmerge(
  ...v.map((val: number, i: number) => ({ [formatMachineYearMonth(reports[i]!.period)]: { inPercentage: formatDecimalBasedPercentage(val / 100) } })),
    ),
  }))

  createChart(config.canvasId, 'bar', {
    labels,
    datasets: [
      { type: 'bar', label: `${config.title} (Rp)`, data: barData, backgroundColor: '#60A5FA', yAxisID: 'y-rp', order: 2 },
      { type: 'line', label: `${config.title} (%)`, data: lineData, borderColor: '#F97316', yAxisID: 'y-percent', order: 1 },
    ],
  }, mergeChartOptions(
    { scales: {
      'y-rp': { type: 'linear', position: 'left', title: { display: true, text: 'Value (Rp)' }, ticks: chartYTicks(shortenCurrency) },
      'y-percent': { type: 'linear', position: 'right', title: { display: true, text: 'Percentage (%)' }, grid: { drawOnChartArea: false }, ticks: { callback: (v: string | number) => `${Number(v).toFixed(1)}%` } },
    } },
    chartTooltip({
  label: (context: any) => {
        let label = context.dataset.label || ''
        if (label) label += ': '
        const value = context.parsed.y
        label += context.dataset.yAxisID === 'y-rp' ? formatCurrencyUtil(value) : formatIntBasedPercentage(value, 2)
        return label
      },
    }),
  ))
}
