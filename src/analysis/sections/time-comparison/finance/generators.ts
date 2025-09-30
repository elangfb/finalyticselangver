import { createChart } from '../../../helpers'
import { AlsoStoreFn, createMaybeAlsoStoreFn } from '../../../utils/store-helpers'
import { chartTooltip, mergeChartOptions, shortenCurrency } from '../../../utils/chart-formatters'
import { formatCurrency as formatCurrencyUtil, formatIntBasedPercentage, formatDecimalBasedPercentage } from '../../../utils/string-formatters'

export function generatePnlComparisonTable(reportA: any, reportB: any, containerId: string, config?: { alsoStore?: AlsoStoreFn }) {
  const container = document.getElementById(containerId)
  if (!container) return
  container.innerHTML = ''

  try {
    const pnlDataA = reportA?.pnlData || {}
    const pnlDataB = reportB?.pnlData || {}

    const categoryOrder = [
      'Pendapatan (Revenue)',
      'Harga Pokok Produksi',
      'Beban Operasional (OPEX)',
      'Beban Non Operasional',
      'Depresiasi/ Amortisasi',
      'Bunga',
      'Pajak (PB1)',
    ]
    const subtotals: Record<string, (data: Record<string, number>) => number> = {
      'Laba Kotor (Gross Profit)': (data) => (data['Pendapatan (Revenue)'] || 0) - (data['Harga Pokok Produksi'] || 0),
      'Pendapatan Bersih Operasional (Net Operating Income)': (data) =>
        (subtotals['Laba Kotor (Gross Profit)']?.(data) || 0) - (data['Beban Operasional (OPEX)'] || 0),
      'Pendapatan Bersih Sebelum Deprisiasi/Amortisasi, Bunga & Pajak (EBITDA)': (data) =>
        (subtotals['Pendapatan Bersih Operasional (Net Operating Income)']?.(data) || 0) - (data['Beban Non Operasional'] || 0),
      'Pendapatan Bersih (Net Income)': (data) =>
        (subtotals['Pendapatan Bersih Sebelum Deprisiasi/Amortisasi, Bunga & Pajak (EBITDA)']?.(data) || 0)
        - (data['Depresiasi/ Amortisasi'] || 0)
        - (data['Bunga'] || 0)
        - (data['Pajak (PB1)'] || 0),
    }
    const allMetrics = [...categoryOrder, ...Object.keys(subtotals)]

    const calculateAllMetrics = (pnlData: Record<string, Record<string, number>>) => {
      const results: Record<string, number> = {}
      const categoryTotals: Record<string, number> = {}
      categoryOrder.forEach((cat) => {
        const total = Object.values((pnlData?.[cat] ?? {}) as Record<string, number>).reduce((sum: number, val: number) => sum + val, 0)
        results[cat] = total
        categoryTotals[cat] = total
      })
      Object.keys(subtotals).forEach((sub) => {
        results[sub] = subtotals[sub]?.(categoryTotals) ?? 0
      })
      return results
    }

    const valuesA = calculateAllMetrics(pnlDataA)
    const valuesB = calculateAllMetrics(pnlDataB)

    const alsoStore = createMaybeAlsoStoreFn(config?.alsoStore)

    const formatCurrency = (value: number) => `Rp${Math.round(value).toLocaleString('id-ID')}`
    const labelA = reportA ? new Date(reportA.period + '-02').toLocaleString('default', { month: 'short', year: 'numeric' }) : 'Period A'
    const labelB = reportB ? new Date(reportB.period + '-02').toLocaleString('default', { month: 'short', year: 'numeric' }) : 'Period B'

    let tableHtml = `
            <table class="min-w-full divide-y divide-gray-200">
                <thead class="bg-gray-50">
                    <tr>
                        <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Metric</th>
                        <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">${labelA}</th>
                        <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">${labelB}</th>
                        <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Change</th>
                    </tr>
                </thead>
                <tbody class="bg-white divide-y divide-gray-200">`

    allMetrics.forEach((metric) => {
      const valueA = valuesA[metric] || 0
      const valueB = valuesB[metric] || 0
      const change = valueB - valueA
      const isCost = metric.toLowerCase().includes('beban') || metric.toLowerCase().includes('harga pokok produksi')

      let changeText: string
      if (valueA === 0) {
        changeText = `${change >= 0 ? '+' : ''}${formatCurrency(change)}`
      } else {
        const percentage = (change / valueA) * 100
        changeText = `${percentage >= 0 ? '+' : ''}${percentage.toFixed(1)}%`
      }

      let changeColor = 'text-gray-500'
      if (change > 0) changeColor = isCost ? 'text-red-600' : 'text-green-600'
      if (change < 0) changeColor = isCost ? 'text-green-600' : 'text-red-600'

      alsoStore(valueA, (v) => ({ pnlComparison: { reportA: { [metric]: formatCurrencyUtil(v) } } }))
      alsoStore(valueB, (v) => ({ pnlComparison: { reportB: { [metric]: formatCurrencyUtil(v) } } }))

      tableHtml += `
                <tr>
                    <td class="px-6 py-4 text-sm font-medium text-gray-900">${metric}</td>
                    <td class="px-6 py-4 text-sm text-gray-500 text-right font-mono">${formatCurrency(valueA)}</td>
                    <td class="px-6 py-4 text-sm text-gray-500 text-right font-mono">${formatCurrency(valueB)}</td>
                    <td class="px-6 py-4 text-sm text-gray-500 text-right">
                        <div class="flex items-center justify-end">
                            <span class="font-semibold ${changeColor} w-20 text-right">${changeText}</span>
                        </div>
                    </td>
                </tr>`
    })

    tableHtml += `</tbody></table>`
    container.innerHTML = tableHtml
  } catch (error) {
    console.error('Error generating P&L comparison table:', error)
    container.innerHTML = `<p class="text-red-500 p-4">Error loading data for comparison. One of the selected periods may be missing a P&L report.</p>`
  }
}

export function generateRatioComparisonChart(
  reportA: any,
  reportB: any,
  config: { canvasId: string, metric: string, title: string, alsoStore?: AlsoStoreFn },
) {
  const pnlDataA = reportA?.pnlData
  const pnlDataB = reportB?.pnlData

  const getMetricValue = (pnlData: Record<string, Record<string, number>> | undefined) => {
    const revenue = Object.values((pnlData?.['Pendapatan (Revenue)'] ?? {}) as Record<string, number>).reduce((s: number, v: number) => s + v, 0)
    if (!revenue) return 0

    if (config.metric.includes('Profit') || config.metric.includes('Income')) {
      const hpp = Object.values((pnlData?.['Harga Pokok Produksi'] ?? {}) as Record<string, number>).reduce((s: number, v: number) => s + v, 0)
      return revenue - hpp
    }
    return Object.values((pnlData?.[config.metric] ?? {}) as Record<string, number>).reduce((s: number, v: number) => s + v, 0)
  }

  const valueA = getMetricValue(pnlDataA)
  const valueB = getMetricValue(pnlDataB)
  const revenueA = Object.values((pnlDataA?.['Pendapatan (Revenue)'] ?? {}) as Record<string, number>).reduce((s: number, v: number) => s + v, 0)
  const revenueB = Object.values((pnlDataB?.['Pendapatan (Revenue)'] ?? {}) as Record<string, number>).reduce((s: number, v: number) => s + v, 0)
  const percentA = revenueA > 0 ? (valueA / revenueA) * 100 : 0
  const percentB = revenueB > 0 ? (valueB / revenueB) * 100 : 0

  config?.alsoStore?.([valueA, valueB] as const, ([a, b]) => ({
    [`${config.title} Chart`]: {
      periodA: { inCurrency: formatCurrencyUtil(a) },
      periodB: { inCurrency: formatCurrencyUtil(b) },
    },
  }))
  config?.alsoStore?.([percentA, percentB] as const, ([a, b]) => ({
    [`${config.title} Chart`]: {
      periodA: { inPercentage: formatDecimalBasedPercentage(a) },
      periodB: { inPercentage: formatDecimalBasedPercentage(b) },
    },
  }))

  const labels = [
    reportA ? new Date(reportA.period + '-02').toLocaleString('default', { month: 'short', year: 'numeric' }) : 'Period A',
    reportB ? new Date(reportB.period + '-02').toLocaleString('default', { month: 'short', year: 'numeric' }) : 'Period B',
  ]

  createChart(
    config.canvasId,
    'bar',
    {
      labels,
      datasets: [
        { type: 'bar', label: `${config.title} (Rp)`, data: [valueA, valueB], backgroundColor: '#60A5FA', yAxisID: 'y-rp' },
        { type: 'line', label: `${config.title} (%)`, data: [percentA, percentB], borderColor: '#F97316', yAxisID: 'y-percent' },
      ],
    },
    mergeChartOptions(
      ({
        scales: {
          'y-rp': { type: 'linear', position: 'left', title: { display: true, text: 'Value (Rp)' }, ticks: { callback: (n: number) => shortenCurrency(n) } },
          'y-percent': { type: 'linear', position: 'right', title: { display: true, text: 'Percentage (%)' }, grid: { drawOnChartArea: false }, ticks: { callback: (v: string | number) => `${Number(v).toFixed(1)}%` } },
        },
      } as any),
      chartTooltip({
        label: (context) => {
          let label = context.dataset.label || ''
          if (label) label += ': '
          const value = context.parsed.y
          if (context.dataset.yAxisID === 'y-rp') label += formatCurrencyUtil(value)
          else label += formatIntBasedPercentage(value, 2)
          return label
        },
      }),
    ),
  )
}
