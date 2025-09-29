import * as $store from '@/store'
import { createChart } from '../../../helpers'
import { chartTooltip, chartXTicks, chartYTicks, currencyTooltipCallback, mergeChartOptions, shortenCurrency, shortenDateTickCallback, shortenNumber } from '../../../utils/chart-formatters'
import { deepmerge } from 'deepmerge-ts'
import type { ChartDataset, TickOptions } from 'chart.js'
import { maybeAlsoStore } from '../../../utils/store-helpers'
import { formatCurrency as formatCurrencyUtil, formatNumber as formatNumberUtil } from '../../../utils/string-formatters'
import type { AlsoStoreConfig, SalesSummary } from './types'

export function generateOmzetHarianChartFromSummaries(summaries: SalesSummary[], canvasId: string, config?: AlsoStoreConfig) {
  const sortedSummaries = summaries.toSorted((a, b) => a.date.getTime() - b.date.getTime())
  const labels = sortedSummaries.map(s => s.date.toISOString().split('T')[0])
  const data = sortedSummaries.map(s => s.totalOmzet)

  const totalOmzet = data.reduce((sum, value) => sum + value, 0)
  const averageOmzet = sortedSummaries.length > 0 ? totalOmzet / sortedSummaries.length : 0

  const datasets: ChartDataset<'line', number[]>[] = [{
    label: 'Total Omzet Harian',
    data: maybeAlsoStore(
      config?.alsoStore,
      data,
      (v) => ({
        omzetHarian: deepmerge(...v.map((v, index) => ({ [`Day ${index + 1}`]: formatCurrencyUtil(v) }))),
      }),
    ),
    borderColor: '#3B82F6',
    tension: 0.1,
    type: 'line',
  }]

  const salesTarget = $store.getConfigValue('activeSalesTarget') || {}
  if (salesTarget && salesTarget['Omzet Harian']) {
    datasets.push({
      label: 'Target Omzet Harian',
      data: Array(labels.length).fill(maybeAlsoStore(config?.alsoStore, salesTarget['Omzet Harian'], (v) => ({ targetOmzetHarian: formatCurrencyUtil(v) }))),
      borderColor: '#FFDE21',
      borderDash: [5, 5],
      borderWidth: 2,
      pointRadius: 0,
      tension: 0,
      type: 'line',
    } as ChartDataset<'line', number[]>)
  }

  if (averageOmzet > 0) {
    datasets.push({
      label: 'Average Omzet',
      data: Array(labels.length).fill(maybeAlsoStore(config?.alsoStore, averageOmzet, (v) => ({ avgOmzet: formatCurrencyUtil(v) }))),
      borderColor: '#10B981',
      borderDash: [5, 5],
      borderWidth: 2,
      pointRadius: 0,
      tension: 0,
      type: 'line',
    } as ChartDataset<'line', number[]>)
  }

  createChart(canvasId, 'line', { labels, datasets }, mergeChartOptions(
    chartTooltip({ label: currencyTooltipCallback }),
    chartYTicks((value: string | number) => shortenCurrency(Number(value))),
    chartXTicks(shortenDateTickCallback),
  ))
}

export function generateOmzetMingguanChartFromSummaries(summaries: SalesSummary[], canvasId: string, type: 'line' | 'bar' = 'bar', config?: AlsoStoreConfig) {
  const weeklyOmzet: Record<string, number> = summaries.reduce((acc: Record<string, number>, summary) => {
    const d = summary.date
    const firstDayOfWeek = new Date(d)
    firstDayOfWeek.setDate(d.getDate() - d.getDay())
    const weekLabel = firstDayOfWeek.toISOString().split('T')[0]!
    acc[weekLabel] = ((acc[weekLabel] as number | undefined) || 0) + summary.totalOmzet
    return acc
  }, {} as Record<string, number>)

  const sortedWeeks = Object.keys(weeklyOmzet).toSorted()

  const datasets: ChartDataset<'bar' | 'line', number[]>[] = [{
    label: 'Total Omzet Mingguan',
    data: maybeAlsoStore(
      config?.alsoStore,
      sortedWeeks.map((week) => weeklyOmzet[week] ?? 0),
      (v) => ({ omzetMingguan: deepmerge(...v.map((v, index) => ({ [`Week ${index + 1}`]: formatCurrencyUtil(v as number) }))) }),
    ),
    backgroundColor: '#10B981',
    borderColor: '#10B981',
  }]

  const salesTarget = $store.getConfigValue('activeSalesTarget') || {}
  if (salesTarget && salesTarget['Omzet Mingguan']) {
    datasets.push({
      type: 'line',
      label: 'Target Omzet Mingguan',
      data: Array(sortedWeeks.length).fill(maybeAlsoStore(config?.alsoStore, salesTarget['Omzet Mingguan'], (v) => ({ targetOmzetMingguan: formatCurrencyUtil(v) }))),
      borderColor: '#EF4444',
      borderDash: [5, 5],
      borderWidth: 2,
      pointRadius: 0,
      tension: 0,
      fill: false,
    } as ChartDataset<'line', number[]>)
  }

  createChart(canvasId, 'bar', { labels: sortedWeeks, datasets }, mergeChartOptions(
    chartYTicks((value: string | number) => shortenCurrency(Number(value))),
    chartXTicks(shortenDateTickCallback),
    chartTooltip({ label: currencyTooltipCallback }),
  ))
}

export function generateTcApcHarianChartFromSummaries(summaries: SalesSummary[], canvasId: string, config?: AlsoStoreConfig) {
  const sortedSummaries = summaries.toSorted((a, b) => a.date.getTime() - b.date.getTime())
  const labels = sortedSummaries.map(s => s.date.toISOString().split('T')[0])
  const tcData = sortedSummaries.map(s => s.totalTransactions)
  const apcData = sortedSummaries.map(s => s.apc)

  const datasets: ChartDataset<'bar' | 'line', number[]>[] = [
    {
      type: 'bar',
      label: 'Total Check (TC)',
      data: maybeAlsoStore(config?.alsoStore, tcData, (v) => ({ totalCheckHarian: deepmerge(...v.map((v, index) => ({ [`Day ${index + 1}`]: formatNumberUtil(v) }))) })),
      backgroundColor: '#60A5FA',
      yAxisID: 'y-tc',
      order: 2,
    },
    {
      type: 'line',
      label: 'Average Check (APC)',
      data: maybeAlsoStore(config?.alsoStore, apcData, (v) => ({ avgPerCheckHarian: deepmerge(...v.map((v, index) => ({ [`Day ${index + 1}`]: formatNumberUtil(v) }))) })),
      borderColor: '#F97316',
      tension: 0.1,
      yAxisID: 'y-apc',
      order: 1,
    },
  ]

  const salesTarget = $store.getConfigValue('activeSalesTarget') || {}
  if (salesTarget && salesTarget['Total Transaksi Per Hari']) {
    config?.alsoStore?.(salesTarget['Total Transaksi Per Hari'], (v) => ({ targetTotalCheckHarian: formatNumberUtil(v) }))
    datasets.push({
      type: 'line',
      label: 'Target TC Harian',
      data: Array(labels.length).fill(salesTarget['Total Transaksi Per Hari']),
      borderColor: '#3B82F6',
      borderDash: [5, 5],
      borderWidth: 2,
      pointRadius: 0,
      yAxisID: 'y-tc',
    } as ChartDataset<'line', number[]>)
  }

  if (salesTarget && salesTarget['Average Check']) {
    config?.alsoStore?.(salesTarget['Average Check'], (v) => ({ targetAvgPerCheckHarian: formatCurrencyUtil(v) }))
    datasets.push({
      type: 'line',
      label: 'Target Average Check',
      data: Array(labels.length).fill(salesTarget['Average Check']),
      borderColor: '#EF4444',
      borderDash: [5, 5],
      borderWidth: 2,
      pointRadius: 0,
      yAxisID: 'y-apc',
    } as ChartDataset<'line', number[]>)
  }

  createChart(canvasId, 'bar', { labels, datasets }, mergeChartOptions(
    ({
      scales: {
        'y-tc': { type: 'linear' as const, display: true, position: 'left', title: { display: true, text: 'Total Check' }, ticks: { callback: shortenNumber as unknown as TickOptions['callback'] } },
        'y-apc': { type: 'linear' as const, display: true, position: 'right', title: { display: true, text: 'Average Check (Rp)' }, grid: { drawOnChartArea: false }, ticks: { callback: ((tickValue: string | number) => shortenCurrency(typeof tickValue === 'number' ? tickValue : Number(tickValue))) as unknown as TickOptions['callback'] } },
      },
    } as any),
    chartXTicks(shortenDateTickCallback),
    chartTooltip({
      label: (context) => {
        const label = context.dataset.label || ''
        const value = context.parsed.y as number
        if (context.dataset.yAxisID === 'y-apc') {
          return `${label}: ${formatCurrencyUtil(value)}`
        }
        return `${label}: ${formatNumberUtil(value)}`
      },
    }),
  ))
}
