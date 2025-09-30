import { collectionGroup, getDocs, query, where } from 'firebase/firestore'
import { db } from '@/core/firebase'
import { currentUser } from '@/core/state'

export async function showSalesTargetModal(data: any) {
  const modal = document.getElementById('sales-target-modal')
  const titleEl = document.getElementById('sales-target-modal-title')
  const bodyEl = document.getElementById('sales-target-modal-body')
  if (!modal || !titleEl || !bodyEl) return
  if (!currentUser) return

  bodyEl.innerHTML = '<p id="sales-target-loading-msg" class="text-center text-gray-500">Loading actual sales data...</p>'
  modal.classList.remove('hidden')

  const period = data.period
  if (!period) {
    bodyEl.innerHTML = '<p class="text-center text-red-500">Error: Period not found in target data.</p>'
    return
  }

  const [year, month] = period.split('-')
  const formattedPeriod = new Date(parseInt(year), parseInt(month) - 1, 1).toLocaleString('default', { month: 'long', year: 'numeric' })
  titleEl.textContent = `Sales Target vs Actual for ${formattedPeriod}`

  try {
    const summariesQuery = query(
      collectionGroup(db, 'dailySummaries'),
      where('userId', '==', currentUser.uid),
    )
    const querySnapshot = await getDocs(summariesQuery)

    const periodSummaries: { totalOmzet: number, totalTransactions: number, totalItemsSold: number }[] = []
    querySnapshot.forEach((doc) => {
      const summary = doc.data()
      if (summary.date && summary.date.startsWith(period)) {
        periodSummaries.push(summary as any)
      }
    })

    const actuals = periodSummaries.reduce((acc, summary) => {
      acc.totalOmzet += summary.totalOmzet || 0
      acc.totalTransactions += summary.totalTransactions || 0
      acc.totalItemsSold += summary.totalItemsSold || 0
      return acc
    }, { totalOmzet: 0, totalTransactions: 0, totalItemsSold: 0 })

    const actualAvgPerTransaction = actuals.totalTransactions > 0
      ? actuals.totalOmzet / actuals.totalTransactions
      : 0

    const actualValues = {
      'Total Omzet': actuals.totalOmzet,
      'Total Transaction': actuals.totalTransactions,
      'Total Items Sold': actuals.totalItemsSold,
      'Avg. Per Transaction': actualAvgPerTransaction,
    }

    const targets = data.targets || {}
    const formatCurrency = (value: number) => `Rp${Math.round(value).toLocaleString('id-ID')}`
    const formatNumber = (value: number) => Math.round(value).toLocaleString('id-ID')

    const metricsToShow = ['Total Omzet', 'Total Items Sold', 'Total Transaction', 'Avg. Per Transaction']
    const currencyMetrics = ['Total Omzet', 'Avg. Per Transaction']

    let tableHtml = `
      <div class="overflow-x-auto">
        <table class="min-w-full divide-y divide-gray-200">
          <thead class="bg-gray-50">
            <tr>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Metric</th>
              <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Target</th>
              <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actual</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Achievement</th>
            </tr>
          </thead>
          <tbody class="bg-white divide-y divide-gray-200">
    `

    metricsToShow.forEach((metric) => {
      if (!targets[metric]) return

      const targetValue = targets[metric]
      const actualValue = actualValues[metric as keyof typeof actualValues] || 0
      const achievement = targetValue > 0 ? (actualValue / targetValue) * 100 : 0
      const isCurrency = currencyMetrics.includes(metric)

      tableHtml += `
        <tr>
          <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">${metric}</td>
          <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-right font-mono">
            ${isCurrency ? formatCurrency(targetValue) : formatNumber(targetValue)}
          </td>
          <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-right font-mono">
            ${isCurrency ? formatCurrency(actualValue) : formatNumber(actualValue)}
          </td>
          <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
            <div class="flex items-center">
              <span class="font-semibold">${achievement.toFixed(1)}%</span>
            </div>
          </td>
        </tr>
      `
    })

    tableHtml += `
          </tbody>
        </table>
      </div>
    `
    bodyEl.innerHTML = tableHtml
  } catch (error: any) {
    console.error('Error fetching or processing actuals for sales target:', error)
    bodyEl.innerHTML = `<p class="text-center text-red-500">Error: Could not load actual sales data. ${error.message}</p>`
  }
}
