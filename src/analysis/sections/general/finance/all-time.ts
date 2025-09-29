// All-time P&L table for General > Finance

import { collection, getDocs } from 'firebase/firestore'
import { db } from '@/core/firebase'
import { currentUser } from '@/core/state'

/**
 * Generates the P&L table for the "Waktu P&L" (last 24 months) section.
 */
export async function generateAllTimePnlTable() {
  if (!currentUser) return
  const thead = document.getElementById('waktu-pnl-thead')
  const tbody = document.getElementById('waktu-pnl-tbody')
  if (!thead || !tbody) return
  tbody.innerHTML = '<tr><td colspan="2" class="text-center p-4 text-gray-500">Loading P&L reports for the last 24 months...</td></tr>'

  try {
    const reportsRef = collection(db, `users/${currentUser.uid}/pnlReports`)
    const reportsSnap = await getDocs(reportsRef)
    const twentyFourMonthsAgo = new Date()
    twentyFourMonthsAgo.setMonth(twentyFourMonthsAgo.getMonth() - 24)
    const twentyFourMonthsAgoPeriod = twentyFourMonthsAgo.toISOString().slice(0, 7)
    type PnlReport = { period: string; pnlData?: Record<string, Record<string, number>> }
    const recentReports: PnlReport[] = reportsSnap.docs
      .map(doc => doc.data() as PnlReport)
      .filter((report): report is PnlReport => !!report?.period && typeof report.period === 'string' && report.period >= twentyFourMonthsAgoPeriod)
      .toSorted((a, b) => a.period.localeCompare(b.period))

    if (recentReports.length === 0) {
      thead.innerHTML = ''
      tbody.innerHTML = '<tr><td colspan="2" class="text-center p-4 text-gray-500">No P&L reports found in the last 24 months.</td></tr>'
      return
    }

    const periodHeaders = recentReports.map(r => {
      const date = new Date(r.period + '-02')
      return `<th scope="col" class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">${date.toLocaleString('default', { month: 'short', year: 'numeric' })}</th>`
    }).join('')
    thead.innerHTML = `<tr>
            <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Metric</th>
            ${periodHeaders}
        </tr>`

    tbody.innerHTML = ''
    const formatCurrency = (value: number | null | undefined) => value || value === 0 ? `Rp${Math.round(value as number).toLocaleString('id-ID')}` : 'Rp0'

    const categoryOrder = ['Pendapatan (Revenue)', 'Harga Pokok Produksi', 'Beban Operasional (OPEX)', 'Beban Non Operasional', 'Depresiasi/ Amortisasi', 'Bunga', 'Pajak (PB1)']
    const subtotals: Record<string, (data: Record<string, number>) => number> = {
      'Laba Kotor (Gross Profit)': (data) => (data['Pendapatan (Revenue)'] || 0) - (data['Harga Pokok Produksi'] || 0),
      'Pendapatan Bersih Operasional (Net Operating Income)': (data) => (subtotals['Laba Kotor (Gross Profit)']?.(data) || 0) - (data['Beban Operasional (OPEX)'] || 0),
      'Pendapatan Bersih Sebelum Deprisiasi/Amortisasi, Bunga & Pajak (EBITDA)': (data) => (subtotals['Pendapatan Bersih Operasional (Net Operating Income)']?.(data) || 0) - (data['Beban Non Operasional'] || 0),
      'Pendapatan Bersih (Net Income)': (data) => (subtotals['Pendapatan Bersih Sebelum Deprisiasi/Amortisasi, Bunga & Pajak (EBITDA)']?.(data) || 0) - (data['Depresiasi/ Amortisasi'] || 0) - (data['Bunga'] || 0) - (data['Pajak (PB1)'] || 0),
    }

    const allMetrics = [...categoryOrder, ...Object.keys(subtotals)]
    allMetrics.forEach(metricName => {
      const isSubtotal = !!subtotals[metricName]
      const tr = document.createElement('tr')
      tr.className = isSubtotal ? 'bg-gray-50 font-semibold' : ''
      let rowHtml = `<td class="px-6 py-4 whitespace-nowrap text-sm ${isSubtotal ? 'text-gray-900' : 'text-gray-700'}">${metricName}</td>`
      recentReports.forEach(report => {
        let value = 0
        if (isSubtotal) {
          const categoryTotals: Record<string, number> = {}
          categoryOrder.forEach(cat => {
            categoryTotals[cat] = Object.values((report.pnlData?.[cat] ?? {}) as Record<string, number>).reduce((sum: number, val: number) => sum + val, 0)
          })
          value = subtotals[metricName]?.(categoryTotals) ?? 0
        } else {
          value = Object.values((report.pnlData?.[metricName] ?? {}) as Record<string, number>).reduce((sum: number, val: number) => sum + val, 0)
        }
        rowHtml += `<td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-right font-mono">${formatCurrency(value)}</td>`
      })
      tr.innerHTML = rowHtml
      tbody.appendChild(tr)
    })
  } catch (error) {
    console.error('Error generating all-time P&L table:', error)
    tbody.innerHTML = `<tr><td colspan="2" class="text-center p-4 text-red-500">Error: Could not load P&L data.</td></tr>`
  }
}
