import * as $store from '@/store'
import { db } from '@/core/firebase'
import { currentUser } from '@/core/state'
import { doc, getDoc } from 'firebase/firestore'
import { createAlsoStoreFn } from '../../../utils/store-helpers'
import { destroyCharts } from '../../../helpers'
import { formatMachineYearMonthDay } from '../../../utils/string-formatters'
import type { SalesSummary } from './types'
import { generateRingkasanFromSummaries } from './ringkasan'
import { generateOmzetHarianChartFromSummaries, generateOmzetMingguanChartFromSummaries, generateTcApcHarianChartFromSummaries } from './charts'
import { generateDailyOmzetHeatmapFromSummaries, generateOmzetHeatmapFromSummaries, generateSalesTrendHourlyDailyChartFromSummaries } from './heatmaps'

async function generateGeneralSales() {
  const branchSelect = document.getElementById('general-penjualan-branch-select') as HTMLSelectElement
  const startDateInput = document.getElementById('general-penjualan-start-date') as HTMLInputElement
  const endDateInput = document.getElementById('general-penjualan-end-date') as HTMLInputElement

  const selectedBranch = branchSelect.value
  const startDate = new Date(startDateInput.value)
  const endDate = new Date(endDateInput.value)
  endDate.setHours(23, 59, 59, 999)

  if (!selectedBranch || !startDateInput.value || !endDateInput.value) {
    destroyCharts()
    return
  }

  $store.setConfigValue('activeSalesTarget', {})
  if (selectedBranch && selectedBranch !== 'ALL' && currentUser) {
    const period = endDate.toISOString().slice(0, 7)
    const safeBranchName = selectedBranch.replace(/\s+/g, '_')
    const targetDocId = `${period}_${safeBranchName}`
    try {
      const targetDocRef = doc(db, `users/${currentUser.uid}/monthlySalesTargets`, targetDocId)
      const targetDocSnap = await getDoc(targetDocRef)
      if (targetDocSnap.exists()) {
        $store.setConfigValue('activeSalesTarget', targetDocSnap.data().targets || {})
      }
    } catch (error) {
      console.error('Could not fetch sales target for the period:', error)
    }
  }

  let currentData: SalesSummary[] = $store.getAllSalesData().filter((s: SalesSummary) => s.date >= startDate && s.date <= endDate)
  if (selectedBranch !== 'ALL') {
    currentData = currentData.filter((s) => s.branches.includes(selectedBranch))
  }

  $store.clearViewData('general-penjualan')
  $store.setActiveViewData('general-penjualan', {
    viewContext: {
      selectedBranch,
      dateRange: `${formatMachineYearMonthDay(startDate)} to ${formatMachineYearMonthDay(endDate)}`,
      hasSalesTarget: Object.keys($store.getConfigValue('activeSalesTarget')).length > 0,
    },
  }, { selectedBranch, startDate, endDate })

  const alsoStore = createAlsoStoreFn($store, 'general-penjualan')

  generateRingkasanFromSummaries(currentData, [], {
    omzet: 'general-total-omzet', check: 'general-total-check', avgCheck: 'general-avg-check',
    omzetGrowth: 'general-omzet-growth', checkGrowth: 'general-check-growth', avgCheckGrowth: 'general-avg-check-growth',
  }, { alsoStore })

  generateOmzetHarianChartFromSummaries(currentData, 'general-omzet-harian-chart', { alsoStore })
  generateOmzetMingguanChartFromSummaries(currentData, 'general-omzet-mingguan-chart', 'line', { alsoStore })
  generateTcApcHarianChartFromSummaries(currentData, 'general-tc-apc-chart', { alsoStore })
  generateDailyOmzetHeatmapFromSummaries(currentData, 'general-heatmap-harian-container')
  generateOmzetHeatmapFromSummaries(currentData, 'general-heatmap-jam-hari-container')
  generateSalesTrendHourlyDailyChartFromSummaries(currentData, 'general-sales-trend-chart', { alsoStore })
}

export async function setupGeneralSales() {
  if ($store.getInitFlag('generalPenjualanSelectorInitialized')) return

  const branchSelect = document.getElementById('general-penjualan-branch-select') as HTMLSelectElement
  const applyBtn = document.getElementById('general-penjualan-apply-btn') as HTMLButtonElement | null
  const startDateInput = document.getElementById('general-penjualan-start-date') as HTMLInputElement
  const endDateInput = document.getElementById('general-penjualan-end-date') as HTMLInputElement
  if (!branchSelect || !applyBtn || !startDateInput || !endDateInput) return

  const branches = [...new Set($store.getAllSalesData().flatMap((s: SalesSummary) => s.branches))].sort()
  branchSelect.innerHTML = `<option value="ALL">All Branches</option>` + branches.map((b) => `<option value="${b}">${b}</option>`).join('')

  if ($store.getAllSalesData().length > 0) {
    const allDates = $store.getAllSalesData().map((s: SalesSummary) => s.date)
    const lastDate = new Date(Math.max.apply(null, allDates.map((d) => d.getTime())))
    const firstDate = new Date(lastDate)
    firstDate.setDate(lastDate.getDate() - 29)
    endDateInput.value = lastDate.toISOString().split('T')[0]!
    startDateInput.value = firstDate.toISOString().split('T')[0]!
  }

  applyBtn.addEventListener('click', generateGeneralSales)
  $store.setInitFlag('generalPenjualanSelectorInitialized', true)
  await generateGeneralSales()
}
