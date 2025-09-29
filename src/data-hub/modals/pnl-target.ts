import { doc, getDoc } from 'firebase/firestore'
import { db } from '@/core/firebase'
import { currentUser } from '@/core/state'
import { calculateAllPnlMetrics } from '@/analysis/utils/pnl'
import { AlsoStoreFn, createMaybeAlsoStoreFn } from '@/utils/also-store'

export async function showPnlTargetModal(targetData: any, reportId: string, config?: { alsoStore?: AlsoStoreFn }) {
  const modal = document.getElementById('pnl-target-modal')
  const titleEl = document.getElementById('pnl-target-modal-title')
  const bodyEl = document.getElementById('pnl-target-modal-body')
  if (!modal || !titleEl || !bodyEl) return
  if (!currentUser) return

  bodyEl.innerHTML = '<p id="pnl-target-loading-msg" class="text-center text-gray-500">Loading actual P&L report for comparison...</p>'
  modal.classList.remove('hidden')

  const period = targetData.period
  if (!period) {
    bodyEl.innerHTML = '<p class="text-center text-red-500">Error: Period not found in target data.</p>'
    return
  }

  const [year, month] = period.split('-')
  const formattedPeriod = new Date(parseInt(year), parseInt(month) - 1, 1).toLocaleString('default', { month: 'long', year: 'numeric' })
  titleEl.textContent = `P&L Target vs Actual for ${formattedPeriod}`

  try {
    const pnlDocRef = doc(db, `users/${currentUser.uid}/pnlReports`, reportId)
    const pnlDocSnap = await getDoc(pnlDocRef)

    let actualValues = {
      'Pendapatan (Revenue)': 0, 'Harga Pokok Produksi': 0, 'Beban Operasional (OPEX)': 0,
      'Beban Non Operasional': 0, 'Depresiasi/ Amortisasi': 0, 'Bunga': 0, 'Pajak (PB1)': 0,
      'Laba Kotor (Gross Profit)': 0, 'Pendapatan Bersih Operasional (Net Operating Income)': 0,
      'Pendapatan Bersih Sebelum Deprisiasi/Amortisasi, Bunga & Pajak (EBITDA)': 0,
      'Pendapatan Bersih (Net Income)': 0,
    }

    if (pnlDocSnap.exists()) {
      const pnlData = pnlDocSnap.data().pnlData || {}
      const pnlMetrics = calculateAllPnlMetrics(pnlData)
      actualValues = { ...actualValues, ...pnlMetrics }
    }

    const targets = targetData.targets || {}
    const formatCurrency = (value: number) => `Rp${Math.round(value).toLocaleString('id-ID')}`

    let tableHtml = `
      <div class="overflow-x-auto">
        <table class="min-w-full divide-y divide-gray-200">
          <thead class="bg-gray-50">
            <tr>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Metric</th>
              <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Target</th>
              <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actual</th>
              <th class="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Change (%)</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase hidden">Achievement</th>
            </tr>
          </thead>
          <tbody class="bg-white divide-y divide-gray-200">`

    const metricOrder = [
      'Pendapatan (Revenue)', 'Harga Pokok Produksi', 'Laba Kotor (Gross Profit)',
      'Beban Operasional (OPEX)', 'Pendapatan Bersih Operasional (Net Operating Income)',
      'Beban Non Operasional', 'Pendapatan Bersih Sebelum Deprisiasi/Amortisasi, Bunga & Pajak (EBITDA)',
      'Depresiasi/ Amortisasi', 'Bunga', 'Pajak (PB1)', 'Pendapatan Bersih (Net Income)'
    ]

    const alsoStore = createMaybeAlsoStoreFn(config?.alsoStore)

    metricOrder.forEach(metric => {
      const targetRevenue = targets['Pendapatan (Revenue)']
      let targetValue = 0

      if (targetRevenue) {
        if (metric === 'Pendapatan (Revenue)') {
          targetValue = targetRevenue
        } else if (targets[metric] !== undefined) {
          targetValue = targetRevenue * targets[metric]
        }
      }

      const actualValue = (actualValues as any)[metric] || 0
      const achievement = targetValue > 0 ? (actualValue / targetValue) * 100 : 0
      const isCost = metric.toLowerCase().includes('beban') || metric.toLowerCase().includes('harga pokok')

      const change = actualValue - targetValue
      let percentageChangeText = 'N/A'
      if (targetValue !== 0) {
        const percentage = (change / targetValue) * 100
        percentageChangeText = `${percentage >= 0 ? '+' : ''}${percentage.toFixed(1)}%`
      } else if (change !== 0) {
        percentageChangeText = 'New'
      }

      let changeColor = 'text-gray-500'
      if (change > 0) changeColor = isCost ? 'text-red-600' : 'text-green-600'
      if (change < 0) changeColor = isCost ? 'text-green-600' : 'text-red-600'

      alsoStore(formatCurrency(targetValue), (v) => ({ monthlyPnL_vs_target: { targets: { [metric]: v } } }))
      alsoStore(formatCurrency(actualValue), (v) => ({ monthlyPnL_vs_target: { actuals: { [metric]: v } } }))
      alsoStore(percentageChangeText, (v) => ({ monthlyPnL_vs_target: { changes: { [metric]: v } } }))

      tableHtml += `
        <tr>
          <td class="px-6 py-4 text-sm font-medium text-gray-900">${metric}</td>
          <td class="px-6 py-4 text-sm text-gray-500 text-right font-mono">${formatCurrency(targetValue)}</td>
          <td class="px-6 py-4 text-sm text-gray-500 text-right font-mono">${formatCurrency(actualValue)}</td>
          <td class="px-6 py-4 text-sm text-center font-semibold ${changeColor}">${percentageChangeText}</td>
          <td class="px-6 py-4 text-sm text-gray-500">
            <div class="flex items-center hidden">
              <span class="font-semibold">${achievement.toFixed(1)}%</span>
            </div>
          </td>
        </tr>`
    })

    tableHtml += `</tbody></table></div>`
    bodyEl.innerHTML = tableHtml
  } catch (error: any) {
    console.error('Error processing P&L target view:', error)
    bodyEl.innerHTML = `<p class="text-center text-red-500">Error: Could not display P&L target comparison. ${error.message}</p>`
  }
}
