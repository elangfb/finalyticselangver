// Analisa P&L (single-period) for General > Finance

import { doc, getDoc, collection, getDocs } from 'firebase/firestore'
import { db } from '@/core/firebase'
import { currentUser } from '@/core/state'

/**
 * Generates the P&L comparison table for a single, specified period.
 * Now includes expandable/collapsible rows for sub-categories.
 */
export async function generateAnalisaPnlTable(selectedPeriod: string) {
  if (!currentUser || !selectedPeriod) return

  const thead = document.getElementById('analisa-pnl-thead')
  const tbody = document.getElementById('analisa-pnl-tbody')
  if (!thead || !tbody) return
  tbody.innerHTML = '<tr><td colspan="4" class="text-center p-4 text-gray-500">Loading P&L data for the selected period...</td></tr>'

  try {
    const reportRef = doc(db, `users/${currentUser.uid}/pnlReports`, selectedPeriod)
    const targetRef = doc(db, `users/${currentUser.uid}/monthlyPnlTargets`, selectedPeriod)
    const [reportSnap, targetSnap] = await Promise.all([getDoc(reportRef), getDoc(targetRef)])

    if (!reportSnap.exists()) {
      thead.innerHTML = ''
      tbody.innerHTML = `<tr><td colspan="4" class="text-center p-4 text-gray-500">No P&L report found for ${selectedPeriod}.</td></tr>`
      return
    }

    const report = reportSnap.data()
    const targetsByPeriod = targetSnap.exists() ? { [selectedPeriod]: targetSnap.data().targets } : {}
    const allReports = [report]

    let periodHeaders = ''
    allReports.forEach(r => {
      const date = new Date(r.period + '-02')
      const headerDate = date.toLocaleString('default', { month: 'short', year: 'numeric' })
      periodHeaders += `
                <th scope="col" class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">${headerDate} (Actual)</th>
                <th scope="col" class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">(Target)</th>
                <th scope="col" class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">(% of Revenue)</th>
            `
    })
    thead.innerHTML = `<tr>
            <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Metric</th>
            ${periodHeaders}
        </tr>`

    tbody.innerHTML = ''
    const formatCurrency = (value: number | null | undefined) => (value || value === 0) ? `Rp${Math.round(value as number).toLocaleString('id-ID')}` : 'N/A'
    const formatPercent = (value: number | null | undefined) => (value || value === 0) ? `${((value as number) * 100).toFixed(1)}%` : ''

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
    const subtotals: Record<string, (data: Record<string, number>) => number> = {
      'Laba Kotor (Gross Profit)': (data) => (data['Pendapatan (Revenue)'] || 0) - (data['Harga Pokok Produksi'] || 0),
      'Pendapatan Bersih Operasional (Net Operating Income)': (data) => (subtotals['Laba Kotor (Gross Profit)']?.(data) || 0) - (data['Beban Operasional (OPEX)'] || 0),
      'Pendapatan Bersih Sebelum Deprisiasi/Amortisasi, Bunga & Pajak (EBITDA)': (data) => (subtotals['Pendapatan Bersih Operasional (Net Operating Income)']?.(data) || 0) - (data['Beban Non Operasional'] || 0),
      'Pendapatan Bersih (Net Income)': (data) => (subtotals['Pendapatan Bersih Sebelum Deprisiasi/Amortisasi, Bunga & Pajak (EBITDA)']?.(data) || 0) - (data['Depresiasi/ Amortisasi'] || 0) - (data['Bunga'] || 0) - (data['Pajak (PB1)'] || 0),
    }

    const totalRevenueForPeriod = Object.values((report.pnlData?.['Pendapatan (Revenue)'] ?? {}) as Record<string, number>).reduce((sum: number, val: number) => sum + val, 0)

    allMetrics.forEach(metricName => {
      const isSubtotal = !!subtotals[metricName]
      const hasSubcategories = !isSubtotal
      const sanitizedMetricName = metricName.replace(/[^a-zA-Z0-9]/g, '')

      const mainRow = document.createElement('tr')
      mainRow.className = isSubtotal ? 'bg-white' : 'bg-gray-50 hover:bg-gray-100 cursor-pointer'
      if (hasSubcategories) {
        mainRow.classList.add('pnl-category-toggle')
        ;(mainRow as any).dataset.target = `sub-category-of-${sanitizedMetricName}`
      }

      let mainRowHtml = `<td class="px-6 py-4 whitespace-nowrap text-sm ${isSubtotal ? 'text-gray-900 font-bold' : 'text-gray-700 font-semibold'}"><div class="flex items-center">${metricName} ${hasSubcategories ? '<svg class="w-4 h-4 ml-2 transform transition-transform chevron-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>' : ''}</div></td>`

      const categoryTotals: Record<string, number> = {}
      if (report.pnlData) {
        Object.keys(report.pnlData).forEach(cat => {
          categoryTotals[cat] = Object.values((report.pnlData?.[cat] ?? {}) as Record<string, number>).reduce((sum: number, val: number) => sum + val, 0)
        })
      }
      const actualValue = isSubtotal ? (subtotals[metricName]?.(categoryTotals) ?? 0) : (categoryTotals[metricName] || 0)

      const periodTargets = targetsByPeriod[report.period] || {}
      const targetRevenue = periodTargets['Pendapatan (Revenue)']
      let nominalTarget: number | null = null
      if (targetRevenue) {
        if (metricName === 'Pendapatan (Revenue)') {
          nominalTarget = targetRevenue
        } else if ((periodTargets as any)[metricName] !== undefined) {
          nominalTarget = targetRevenue * (periodTargets as any)[metricName]
        }
      }

      const percentageOfRevenue = totalRevenueForPeriod > 0 ? actualValue / totalRevenueForPeriod : null
      mainRowHtml += `<td class="px-6 py-4 text-right text-sm text-gray-800 font-mono">${formatCurrency(actualValue)}</td>
                            <td class="px-6 py-4 text-right text-sm text-gray-500 font-mono">${formatCurrency(nominalTarget)}</td>
                            <td class="px-6 py-4 text-right text-sm text-blue-600 font-mono">${formatPercent(percentageOfRevenue)}</td>`
      mainRow.innerHTML = mainRowHtml
      tbody.appendChild(mainRow)

      if (hasSubcategories) {
        const subCategoryNames = new Set<string>()
        allReports.forEach(report => {
          if (report.pnlData && report.pnlData[metricName]) {
            Object.keys(report.pnlData[metricName]).forEach(subCat => subCategoryNames.add(subCat))
          }
        })
        subCategoryNames.forEach(subCatName => {
          const subRow = document.createElement('tr')
          subRow.className = `pnl-subcategory hidden sub-category-of-${sanitizedMetricName}`
          let subRowHtml = `<td class="pl-10 pr-6 py-3 whitespace-nowrap text-sm text-gray-600">${subCatName}</td>`
          allReports.forEach(report => {
            const actualValue = report.pnlData?.[metricName]?.[subCatName] || 0
            const totalRevenueForPeriodInner = Object.values((report.pnlData?.['Pendapatan (Revenue)'] ?? {}) as Record<string, number>).reduce((s: number, v: number) => s + v, 0)
            const percentageOfRevenue = totalRevenueForPeriodInner > 0 ? actualValue / totalRevenueForPeriodInner : null
            subRowHtml += `<td class="px-6 py-3 text-right text-sm text-gray-500 font-mono">${formatCurrency(actualValue)}</td>
                                       <td class="px-6 py-3"></td> <td class="px-6 py-3 text-right text-sm text-blue-600 font-mono">${formatPercent(percentageOfRevenue)}</td>`
          })
          subRow.innerHTML = subRowHtml
          tbody.appendChild(subRow)
        })
      }
    })
  } catch (error) {
    console.error('Error generating P&L table for period:', error)
    tbody.innerHTML = `<tr><td colspan="4" class="text-center p-4 text-red-500">Error: Could not load P&L data.</td></tr>`
  }
}

/**
 * Fetches available P&L periods, populates the period selector dropdown,
 * and sets up an event listener to update the table on selection change.
 */
export async function setupAnalisaPnl() {
  if (!currentUser) return
  const selectEl = document.getElementById('pnl-period-select') as HTMLSelectElement
  selectEl.innerHTML = '<option>Loading periods...</option>'

  try {
    const reportsRef = collection(db, `users/${currentUser.uid}/pnlReports`)
    const reportsSnap = await getDocs(reportsRef)
    const periods = reportsSnap.docs
      .map(doc => doc.data().period)
      .filter(Boolean)
      .toSorted()
      .reverse()
    if (periods.length === 0) {
      selectEl.innerHTML = '<option>No P&L data found</option>'
      const tbody = document.getElementById('analisa-pnl-tbody')
      const thead = document.getElementById('analisa-pnl-thead')
      if (tbody) tbody.innerHTML = '<tr><td colspan="4" class="text-center p-4 text-gray-500">No P&L reports have been saved yet.</td></tr>'
      if (thead) thead.innerHTML = ''
      return
    }
    selectEl.innerHTML = periods.map(period => {
      const [year, month] = (period as string).split('-') as [string, string]
      const dateLabel = new Date(parseInt(year), parseInt(month) - 1).toLocaleString('default', { month: 'long', year: 'numeric' })
      return `<option value="${period}">${dateLabel}</option>`
    }).join('')
    selectEl.addEventListener('change', () => {
      const selectedPeriod = selectEl.value
      generateAnalisaPnlTable(selectedPeriod)
    })
    generateAnalisaPnlTable(periods[0])
  } catch (error) {
    console.error('Error setting up P&L period selector:', error)
    selectEl.innerHTML = '<option>Error loading periods</option>'
  }
}
