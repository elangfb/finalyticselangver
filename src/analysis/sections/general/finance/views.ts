// Orchestrator for General > Finance

import { collection, getDocs, query, where } from 'firebase/firestore'
import { db } from '@/core/firebase'
import { currentUser } from '@/core/state'
import { showLoading, hideLoading } from '@/core/ui'
import * as $store from '@/store'
import { createAlsoStoreFn } from '../../../utils/store-helpers'
import { generatePnlTargetComparisonTable, generateHistoricalPnlTable } from './tables'
import { generateFinancialRatioChart, generatePnlOverviewChart, generateSpecificSubCategoryRatioChart } from './charts'
import { calculateAllPnlMetrics } from '../../../utils/pnl'

interface PnlReport { period: string, pnlData?: Record<string, Record<string, number>> }

export async function generateGeneralFinance() {
  if (!currentUser) return
  const branchSelect = document.getElementById('general-keuangan-branch-select') as HTMLSelectElement
  const periodSelect = document.getElementById('general-keuangan-period-select') as HTMLSelectElement
  const selectedBranch = branchSelect.value
  const selectedPeriod = periodSelect.value
  if (!selectedPeriod || !selectedBranch) return

  showLoading({ message: 'Fetching financial data...', value: 20 })

  const endDate = new Date(selectedPeriod + '-01T00:00:00')
  endDate.setMonth(endDate.getMonth() + 1)
  endDate.setDate(endDate.getDate() - 1)
  endDate.setHours(23, 59, 59, 999)

  const startDate = new Date(selectedPeriod + '-01T00:00:00')
  startDate.setMonth(startDate.getMonth() - 11)

  const reportsRef = collection(db, `users/${currentUser.uid}/pnlReports`)
  const q = query(reportsRef, where('branchName', '==', selectedBranch))
  const reportsSnap = await getDocs(q)

  const historicalReports: PnlReport[] = reportsSnap.docs
    .map((doc) => doc.data() as PnlReport)
    .filter((report): report is PnlReport => {
      if (!report || typeof report.period !== 'string') return false
      const reportDate = new Date(report.period + '-02')
      return reportDate >= startDate && reportDate <= endDate
    })
    .sort((a, b) => a.period.localeCompare(b.period))

  showLoading({ message: 'Generating tables and charts...', value: 50 })

  $store.clearViewData('general-keuangan')
  const periodRange = historicalReports.length > 0
    ? `${historicalReports[0]!.period} to ${historicalReports[historicalReports.length - 1]!.period}`
    : 'No data'
  $store.setActiveViewData('general-keuangan', { viewContext: { selectedBranch, selectedPeriod, periodRange } }, { selectedBranch, selectedPeriod })
  const alsoStore = createAlsoStoreFn($store, 'general-keuangan')

  await generatePnlTargetComparisonTable(selectedPeriod, selectedBranch, 'general-pnl-target-container', { alsoStore })
  generateHistoricalPnlTable(historicalReports, 'general-pnl-history-thead', 'general-pnl-history-tbody', { alsoStore })
  generatePnlOverviewChart(historicalReports, { alsoStore })

  generateFinancialRatioChart(historicalReports, { canvasId: 'general-cogs-chart', metric: 'Harga Pokok Produksi', title: 'COGS', alsoStore })
  generateFinancialRatioChart(historicalReports, { canvasId: 'general-gpm-chart', metric: 'Laba Kotor (Gross Profit)', title: 'Gross Profit Margin', alsoStore })
  generateSpecificSubCategoryRatioChart(historicalReports, { canvasId: 'general-hr-chart', mainCategory: 'Beban Operasional (OPEX)', subCategory: 'Wages', title: 'Wages', alsoStore })
  generateSpecificSubCategoryRatioChart(historicalReports, { canvasId: 'general-rent-chart', mainCategory: 'Beban Operasional (OPEX)', subCategory: 'Rent', title: 'Rent', alsoStore })
  generateSpecificSubCategoryRatioChart(historicalReports, { canvasId: 'general-advertising-chart', mainCategory: 'Beban Non Operasional', subCategory: 'Advertising', title: 'Advertising', alsoStore })
  generateFinancialRatioChart(historicalReports, { canvasId: 'general-npm-chart', metric: 'Pendapatan Bersih (Net Income)', title: 'Net Profit Margin', alsoStore })

  hideLoading()
}
