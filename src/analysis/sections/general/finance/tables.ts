// Tables for General > Finance

import { AlsoStoreFn, createMaybeAlsoStoreFn } from '../../../utils/store-helpers'
import { chartYTicks, shortenCurrency } from '../../../utils/chart-formatters'
import { formatCurrency as formatCurrencyUtil, formatMachineYearMonth } from '../../../utils/string-formatters'
import { calculateAllPnlMetrics } from '../../../utils/pnl'
import { deepmerge } from 'deepmerge-ts'
import { currentUser } from '@/core/state'
import { db } from '@/core/firebase'
import { doc, getDoc } from 'firebase/firestore'
import { showPnlTargetModal } from '@/data-hub/modals'

type PnlReport = { period: string; pnlData?: Record<string, Record<string, number>> }

/**
 * Generates a P&L Target vs Actual comparison table for a single period into containerId.
 */
export async function generatePnlTargetComparisonTable(period: string, branch: string, containerId: string, config?: { alsoStore?: AlsoStoreFn }) {
  const container = document.getElementById(containerId)
  if (!container || !currentUser) return
  container.innerHTML = '<p class="text-gray-500">Loading P&L comparison...</p>'

  const targetId = `${period}_${branch.replace(/\s+/g, '_')}`
  const reportId = `${period}_${branch.replace(/\s+/g, '_')}`

  const targetRef = doc(db, `users/${currentUser.uid}/monthlyPnlTargets`, targetId)
  const targetSnap = await getDoc(targetRef)
  if (targetSnap.exists()) {
    await showPnlTargetModal(targetSnap.data(), reportId)
    const modalBody = document.getElementById('pnl-target-modal-body')
    if (modalBody) container.innerHTML = modalBody.innerHTML
    document.getElementById('pnl-target-modal')?.classList.add('hidden')
  } else {
    container.innerHTML = `
      <div class="text-center p-4 border rounded-lg bg-gray-50">
        <p class="text-gray-500 mb-4">No target data found for this branch and period.</p>
        <button class="upload-compiled-btn bg-indigo-500 text-white text-sm font-bold py-2 px-4 rounded-lg hover:bg-indigo-600" data-period="${period}" data-type="pnlTarget" data-branch="${branch}">
          Upload P&L Target
        </button>
      </div>`
  }
}

/**
 * Generates a historical P&L table with expandable rows for sub-categories.
 */
export function generateHistoricalPnlTable(reports: PnlReport[], theadId: string, tbodyId: string, config?: { alsoStore?: AlsoStoreFn }) {
  const thead = document.getElementById(theadId)
  const tbody = document.getElementById(tbodyId)
  if (!thead || !tbody) return

  if (reports.length === 0) {
    thead.innerHTML = ''
    tbody.innerHTML = '<tr><td colspan="13" class="p-4 text-center text-gray-500">No P&L reports found for this period.</td></tr>'
    return
  }

  const periodHeaders = reports
    .map(r => `<th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">${new Date(r.period + '-02').toLocaleString('default', { month: 'short', year: 'numeric' })}</th>`)
    .join('')
  thead.innerHTML = `<tr><th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Metric</th>${periodHeaders}</tr>`

  tbody.innerHTML = ''
  const allMetrics = [
    'Pendapatan (Revenue)',
    'Harga Pokok Produksi',
    'Laba Kotor (Gross Profit)',
    'Beban Operasional (OPEX)',
    'Pendapatan Bersih Operasional (Net Operating Income)',
    'Beban Non Operasional',
    'Pendapatan Bersih Sebelum Deprisiasi/Amortisasi, Bunga & Pajak (EBITDA)',
    'Depresiasi/ Amortisasi',
    'Bunga',
    'Pajak (PB1)',
    'Pendapatan Bersih (Net Income)'
  ]
  const alsoStore = createMaybeAlsoStoreFn(config?.alsoStore)

  allMetrics.forEach(metricName => {
    const metrics = reports.map(report => calculateAllPnlMetrics(report.pnlData || {}))
    const isSubtotal = !reports[0]?.pnlData?.[metricName]
    const mainRow = document.createElement('tr')
    let mainRowHtml = ''

    if (!isSubtotal) {
      mainRow.className = 'pnl-main-category bg-gray-50 hover:bg-gray-100 cursor-pointer'
      const sanitizedMetricName = metricName.replace(/[^a-zA-Z0-9]/g, '')
      ;(mainRow as any).dataset.target = `sub-items-of-${sanitizedMetricName}`
      mainRowHtml += `<td class="px-6 py-4 whitespace-nowrap text-sm text-gray-700 font-semibold"><div class="flex items-center">${metricName}<svg class="w-4 h-4 ml-2 transform transition-transform chevron-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg></div></td>`
    } else {
      mainRow.className = 'bg-white font-bold'
      mainRowHtml += `<td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${metricName}</td>`
    }

    metrics.forEach((metricSet, index) => {
      const value = metricSet[metricName] || 0
      alsoStore(value, v => ({ historicalPnl: { [formatMachineYearMonth(reports[index]!.period)]: { [metricName]: formatCurrencyUtil(v) } } }))
      mainRowHtml += `<td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-right font-mono">${shortenCurrency(value)}</td>`
    })
    mainRow.innerHTML = mainRowHtml
    tbody.appendChild(mainRow)

    if (!isSubtotal) {
      const sanitizedMetricName = metricName.replace(/[^a-zA-Z0-9]/g, '')
      const allSubKeys = new Set(reports.flatMap(r => Object.keys(r.pnlData?.[metricName] || {})))
      allSubKeys.forEach(subKey => {
        const subRow = document.createElement('tr')
        subRow.className = `pnl-sub-category sub-items-of-${sanitizedMetricName} hidden`
        let subRowHtml = `<td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600 pl-8">${subKey}</td>`
        reports.forEach(report => {
          const subValue = report.pnlData?.[metricName]?.[subKey] || 0
          alsoStore(subValue, v => ({ historicalPnl: { [formatMachineYearMonth(report.period)]: { [metricName]: { [subKey]: formatCurrencyUtil(v) } } } }))
          subRowHtml += `<td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-right font-mono">${shortenCurrency(subValue)}</td>`
        })
        subRow.innerHTML = subRowHtml
        tbody.appendChild(subRow)
      })
    }
  })
}

/** Accordion listener for history table */
export function initializePnlAccordionListener(): void {
  document.getElementById('general-pnl-history-tbody')?.addEventListener('click', e => {
    const target = e.target as HTMLElement
    const headerRow = target.closest('.pnl-main-category') as HTMLElement | null
    if (headerRow) {
      const targetClass = (headerRow as HTMLElement).dataset.target
      if (!targetClass) return
      const subRows = document.querySelectorAll(`.${targetClass}`)
      const chevron = headerRow.querySelector('.chevron-icon')
      subRows.forEach(row => row.classList.toggle('hidden'))
      chevron?.classList.toggle('rotate-180')
    }
  })
}
