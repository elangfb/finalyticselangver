import { formatCurrency as formatCurrencyUtil, formatDecimalBasedPercentage, formatNumber as formatNumberUtil } from '../../../utils/string-formatters'
import type { AlsoStoreFn } from '../../../utils/store-helpers'
import type { SalesSummary } from './types'

function calculateAndDisplayGrowth(elementId: string, currentValue: number, previousValue: number, config?: { alsoStore?: AlsoStoreFn }): void {
  const element = document.getElementById(elementId)
  if (!element) return

  if (previousValue === 0) {
    element.textContent = 'vs N/A'
    element.className = 'text-sm mt-1 font-medium text-gray-500'
    return
  }

  const growth = ((currentValue - previousValue) / previousValue) * 100
  const sign = growth >= 0 ? '+' : ''
  const colorClass = growth >= 0 ? 'text-green-600' : 'text-red-600'

  config?.alsoStore?.(growth / 100, (v) => ({ [`${elementId}_growth`]: formatDecimalBasedPercentage(v) }))

  element.textContent = `${sign}${growth.toFixed(1)}% vs comparison period`
  element.className = `text-sm mt-1 font-medium ${colorClass}`
}

export function generateRingkasanFromSummaries(
  currentSummaries: SalesSummary[],
  lastPeriodSummaries: SalesSummary[],
  ids: { omzet: string, check: string, avgCheck: string, omzetGrowth: string, checkGrowth: string, avgCheckGrowth: string },
  config?: { alsoStore?: AlsoStoreFn },
) {
  const adjustFontSize = (elementId: string, text: string) => {
    const element = document.getElementById(elementId)
    if (!element) return
    element.textContent = text
    if (text.length > 12) {
      element.classList.remove('text-4xl')
      element.classList.add('text-2xl')
    } else {
      element.classList.remove('text-2xl')
      element.classList.add('text-4xl')
    }
  }

  const calculateTotals = (summaries: SalesSummary[]) => summaries.reduce((acc, summary) => {
    acc.omzet += summary.totalOmzet || 0
    acc.checks += summary.totalTransactions || 0
    return acc
  }, { omzet: 0, checks: 0 })

  const currentTotals = calculateTotals(currentSummaries)
  const currentAvgCheck = currentTotals.checks > 0 ? currentTotals.omzet / currentTotals.checks : 0

  adjustFontSize(ids.omzet, `Rp${currentTotals.omzet.toLocaleString('id-ID')}`)
  config?.alsoStore?.(currentTotals.omzet, (v) => ({ omzet: formatCurrencyUtil(v) }))
  adjustFontSize(ids.check, currentTotals.checks.toLocaleString('id-ID'))
  config?.alsoStore?.(currentTotals.checks, (v) => ({ totalCheck: formatNumberUtil(v) }))
  adjustFontSize(ids.avgCheck, `Rp${currentAvgCheck.toLocaleString('id-ID', { maximumFractionDigits: 0 })}`)
  config?.alsoStore?.(currentAvgCheck, (v) => ({ avgPerCheck: formatCurrencyUtil(v) }))

  if (lastPeriodSummaries && lastPeriodSummaries.length > 0) {
    const lastPeriodTotals = calculateTotals(lastPeriodSummaries)
    const lastPeriodAvgCheck = lastPeriodTotals.checks > 0 ? lastPeriodTotals.omzet / lastPeriodTotals.checks : 0

    config?.alsoStore?.(lastPeriodTotals.omzet, (v) => ({ lastPeriodOmzet: formatCurrencyUtil(v) }))
    config?.alsoStore?.(lastPeriodTotals.checks, (v) => ({ lastPeriodCheck: formatNumberUtil(v) }))
    config?.alsoStore?.(lastPeriodAvgCheck, (v) => ({ lastPeriodAvgPerCheck: formatCurrencyUtil(v) }))

    calculateAndDisplayGrowth(ids.omzetGrowth, currentTotals.omzet, lastPeriodTotals.omzet, config)
    calculateAndDisplayGrowth(ids.checkGrowth, currentTotals.checks, lastPeriodTotals.checks, config)
    calculateAndDisplayGrowth(ids.avgCheckGrowth, currentAvgCheck, lastPeriodAvgCheck, config)
  } else {
    document.getElementById(ids.omzetGrowth)!.textContent = ''
    document.getElementById(ids.checkGrowth)!.textContent = ''
    document.getElementById(ids.avgCheckGrowth)!.textContent = ''
  }
}
