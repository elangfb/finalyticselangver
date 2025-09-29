import * as $store from '@/store'
import { createChart } from '../../../helpers'
import { chartTooltip, chartYTicks, currencyTooltipCallback, mergeChartOptions, shortenCurrency } from '../../../utils/chart-formatters'
import type { ChartDataset } from 'chart.js'
import { formatCurrency as formatCurrencyUtil } from '../../../utils/string-formatters'
import { deepmerge } from 'deepmerge-ts'
import type { AlsoStoreConfig, SalesSummary } from './types'
import { maybeAlsoStore } from '@/utils/also-store'

export function generateDailyOmzetHeatmapFromSummaries(summaries: SalesSummary[], containerId: string = 'daily-omzet-heatmap-container', config?: AlsoStoreConfig) {
  const container = document.getElementById(containerId)
  if (!container) return

  container.innerHTML = ''

  if (summaries.length === 0) {
    container.innerHTML = '<p class="text-gray-500">No data to display for the selected period.</p>'
    return
  }

  const dailyTotals: Record<string, number> = Object.fromEntries(summaries.map(s => [s.date.toISOString().split('T')[0], s.totalOmzet]))
  $store.setChartDataForAIProperty('dailyOmzetHeatmap', dailyTotals)

  const maxOmzet = Math.max(...summaries.map(s => s.totalOmzet))
  const startDate = summaries.reduce((min, s) => s.date < min ? s.date : min, summaries[0]!.date)
  const endDate = summaries.reduce((max, s) => s.date > max ? s.date : max, summaries[0]!.date)

  let currentMonth = -1
  let calendarHTML = ''
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

  for (let d = new Date(startDate); d <= endDate; d.setUTCDate(d.getUTCDate() + 1)) {
    const month = d.getUTCMonth()
    if (month !== currentMonth) {
      if (currentMonth !== -1) {
        calendarHTML += '</tr></tbody></table></div>'
      }
      currentMonth = month
      calendarHTML += `<div class="mb-4"><h4 class="text-lg font-semibold text-center mb-2">${monthNames[month]} ${d.getUTCFullYear()}</h4><table class="heatmap-calendar-table"><thead><tr><th>Sun</th><th>Mon</th><th>Tue</th><th>Wed</th><th>Thu</th><th>Fri</th><th>Sat</th></tr></thead><tbody><tr>`
      const firstDayOfMonth = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1))
      for (let i = 0; i < firstDayOfMonth.getUTCDay(); i++) calendarHTML += '<td></td>'
    }

    if (d.getUTCDay() === 0 && d.getUTCDate() !== 1) {
      calendarHTML += '</tr><tr>'
    }

    const dateStr = d.toISOString().split('T')[0]
    const omzet = dailyTotals[dateStr as string] || 0
    const opacity = maxOmzet > 0 ? (omzet / maxOmzet) : 0
    const color = `rgba(79, 70, 229, ${opacity})`
    const title = `${dateStr}: Rp${omzet.toLocaleString('id-ID')}`
    const textColor = opacity > 0.5 ? 'white' : '#374151'
    calendarHTML += `<td style="background-color: ${color}" title="${title}"><div class="day-number" style="color: ${textColor}">${d.getUTCDate()}</div></td>`
    config?.alsoStore?.(omzet, (v) => ({ dailyOmzet: { [dateStr!]: formatCurrencyUtil(v) } }))
  }
  calendarHTML += '</tr></tbody></table></div>'

  container.innerHTML = calendarHTML
}

export function generateOmzetHeatmapFromSummaries(summaries: SalesSummary[], containerId: string, config?: AlsoStoreConfig) {
  const container = document.getElementById(containerId)
  if (!container) return
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const hours = Array.from({ length: 24 }, (_, i) => i)

  const heatmapData: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0))
  let maxOmzet = 0

  summaries.forEach(summary => {
    if (summary.hourlyRevenue && summary.hourlyRevenue.length === 24) {
      const dayIndex = summary.date.getDay()
      summary.hourlyRevenue.forEach((revenue: number, hourIndex: number) => {
        heatmapData[dayIndex]![hourIndex]! += revenue
        if (heatmapData[dayIndex]![hourIndex]! > maxOmzet) {
          maxOmzet = heatmapData[dayIndex]![hourIndex]!
        }
      })
    }
  })

  $store.setChartDataForAIProperty('omzetJamHariHeatmap', heatmapData)

  let tableHTML = '<table class="heatmap-table"><thead><tr><th></th>'
  hours.forEach(hour => tableHTML += `<th>${hour.toString().padStart(2, '0')}</th>`)
  tableHTML += '</tr></thead><tbody>'
  days.forEach((day, dayIndex) => {
    tableHTML += `<tr><td class="day-label">${day}</td>`
    hours.forEach(hour => {
      const omzet = heatmapData[dayIndex]![hour]!
      const opacity = maxOmzet > 0 ? (omzet / maxOmzet) : 0
      const color = `rgba(79, 70, 229, ${opacity})`
      const title = `Rp${omzet.toLocaleString('id-ID')}`
      tableHTML += `<td class="heatmap-cell" style="background-color: ${color}" title="${title}"></td>`
      config?.alsoStore?.(omzet, (v) => ({ hourlyOmzet: { [`${day} at ${hour}:00 to ${hour}:59`]: formatCurrencyUtil(v) } }))
    })
    tableHTML += '</tr>'
  })
  tableHTML += '</tbody></table>'

  container.innerHTML = tableHTML
}

export function generateSalesTrendHourlyDailyChartFromSummaries(summaries: SalesSummary[], canvasId: string, config?: AlsoStoreConfig) {
  const dailyData: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0))

  summaries.forEach(s => {
    if (s.hourlyRevenue && s.hourlyRevenue.length === 24) {
      const dayIndex = s.date.getDay()
      s.hourlyRevenue.forEach((rev: number, hourIndex: number) => {
        dailyData[dayIndex]![hourIndex]! += rev
      })
    }
  })

  const labels = Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, '0'))
  const dayLabels = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu']
  const colors = ['#EF4444', '#F97316', '#F59E0B', '#84CC16', '#22C55E', '#14B8A6', '#3B82F6']

  const datasets: ChartDataset<'line', number[]>[] = dayLabels.map((label, dayIndex) => ({
    label,
    data: maybeAlsoStore(config?.alsoStore, dailyData[dayIndex]!, (v) => ({
      salesTrendHourlyDaily: {
        [`Day ${label}`]: deepmerge({}, ...v!.map((val, hr) => ({ [`Hour ${hr}:00 to ${hr}:59`]: formatCurrencyUtil(val) }))),
      },
    })),
    borderColor: colors[dayIndex % colors.length]!,
    backgroundColor: colors[dayIndex % colors.length]!,
    tension: 0.2,
    fill: false,
  }))

  $store.setChartDataForAIProperty('salesTrendHourlyDaily', datasets.map(ds => ({ [String(ds.label)]: ds.data })))

  createChart(canvasId, 'line', { labels, datasets }, mergeChartOptions(
    chartYTicks((value: string | number) => shortenCurrency(Number(value))),
    chartTooltip({ label: currencyTooltipCallback }),
  ))
}
