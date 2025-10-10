// [NEW FILE] src/analysis/premium/orchestrator.ts

import * as $store from '@/store'
import { generateRingkasanFromSummaries } from '@/analysis/sections/general/sales/ringkasan'
import type { SalesSummary } from '@/analysis/sections/general/sales/types'

import { generateTcApcHarianChartFromSummaries, generateOmzetHarianChartFromSummaries } from '@/analysis/sections/general/sales/charts'
import { generateOmzetHeatmapFromSummaries } from '@/analysis/sections/general/sales/heatmaps'
import { generateOmzetByOutletChart } from './charts'
import { showView } from '@/core/views'

import { collection, getDocs } from 'firebase/firestore'
import { db } from '@/core/firebase'
import { currentUser } from '@/core/state'

// Add these imports at the top of src/analysis/premium/orchestrator.ts
import { collection, getDocs, query, where } from 'firebase/firestore'
import { db } from '@/core/firebase'
import { currentUser } from '@/core/state'
import { showLoading, hideLoading } from '@/core/ui'
import { createAlsoStoreFn } from '@/analysis/utils/store-helpers'
import { setupPageSummary } from '@/components/PageSummary'
import { getGeminiAnalysis } from '@/config/gemini'
import {
  generatePnlTargetComparisonTable,
  generateHistoricalPnlTable,
} from '@/analysis/sections/general/finance/tables'
import {
  generatePnlOverviewChart,
  generateFinancialRatioChart,
  generateSpecificSubCategoryRatioChart,
} from '@/analysis/sections/general/finance/charts'

// Add these imports at the top of src/analysis/premium/orchestrator.ts
import { generateRingkasanFromSummaries } from '@/analysis/sections/general/sales/ringkasan'
import { generateTcApcHarianChartFromSummaries } from '@/analysis/sections/general/sales/charts'
import { generateOmzetHeatmapFromSummaries, generateSalesTrendHourlyDailyChartFromSummaries } from '@/analysis/sections/general/sales/heatmaps'

/**
 * This function runs when the branch selection changes. It filters data and updates the KPIs.
 */
function generatePremiumAnalysis() {
  const allSalesData: SalesSummary[] = $store.getAllSalesData()
  const branchSelect = document.getElementById('premium-analysis-branch-select') as HTMLSelectElement
  const selectedBranch = branchSelect.value

  if (!selectedBranch) return

  // 1. Filter data by the selected branch
  const branchData = selectedBranch === 'ALL'
    ? allSalesData
    : allSalesData.filter((s) => s.branches.includes(selectedBranch))

  // 2. Determine date ranges (last month vs month before)
  const now = new Date() // Use consistent time
  const lastMonthYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear()
  const lastMonth = now.getMonth() === 0 ? 11 : now.getMonth() - 1

  const comparisonMonthYear = lastMonth === 0 ? lastMonthYear - 1 : lastMonthYear
  const comparisonMonth = lastMonth === 0 ? 11 : lastMonth - 1

  // 3. Filter the branch-specific data for each period
  const lastMonthSummaries = branchData.filter((summary) =>
    summary.date.getFullYear() === lastMonthYear && summary.date.getMonth() === lastMonth,
  )

  const comparisonMonthSummaries = branchData.filter((summary) =>
    summary.date.getFullYear() === comparisonMonthYear && summary.date.getMonth() === comparisonMonth,
  )

  // 4. Define element IDs and update the UI
  const premiumKpiIds = {
    omzet: 'premium-total-omzet',
    check: 'premium-total-check',
    avgCheck: 'premium-avg-check',
    omzetGrowth: 'premium-omzet-growth',
    checkGrowth: 'premium-check-growth',
    avgCheckGrowth: 'premium-avg-check-growth',
  }

  generateRingkasanFromSummaries(lastMonthSummaries, comparisonMonthSummaries, premiumKpiIds)

  if (lastMonthSummaries.length > 0) {
    generateTcApcHarianChartFromSummaries(lastMonthSummaries, 'premium-tc-apc-chart')
    generateOmzetHarianChartFromSummaries(lastMonthSummaries, 'premium-omzet-chart')
    generateOmzetHeatmapFromSummaries(lastMonthSummaries, 'premium-heatmap-container')

    // Only show Omzet by Outlet if "All Branches" is selected
    if (selectedBranch === 'ALL') {
      document.getElementById('premium-omzet-by-outlet-chart')?.parentElement?.parentElement?.classList.remove('hidden')
      generateOmzetByOutletChart(lastMonthSummaries, 'premium-omzet-by-outlet-chart')
    } else {
      // Hide the chart if a single branch is selected as it's redundant
      document.getElementById('premium-omzet-by-outlet-chart')?.parentElement?.parentElement?.classList.add('hidden')
    }
  }
}

// Add these two functions before setupPremiumAnalysisView
async function generatePremiumGeneralFinance() {
  if (!currentUser) return
  const branchSelect = document.getElementById('premium-finance-branch-select') as HTMLSelectElement
  const periodSelect = document.getElementById('premium-finance-period-select') as HTMLSelectElement
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

  const historicalReports = reportsSnap.docs
    .map((doc) => doc.data())
    .filter((report) => {
      if (!report || typeof report.period !== 'string') return false
      const reportDate = new Date(report.period + '-02')
      return reportDate >= startDate && reportDate <= endDate
    })
    .sort((a, b) => a.period.localeCompare(b.period))

  showLoading({ message: 'Generating tables and charts...', value: 50 })

  $store.clearViewData('premium-general-keuangan')
  const periodRange = historicalReports.length > 0
    ? `${historicalReports[0]!.period} to ${historicalReports[historicalReports.length - 1]!.period}`
    : 'No data'
  $store.setActiveViewData('premium-general-keuangan', { viewContext: { selectedBranch, selectedPeriod, periodRange } }, { selectedBranch, selectedPeriod })
  const alsoStore = createAlsoStoreFn($store, 'premium-general-keuangan')

  // Call generators with new premium element IDs
  await generatePnlTargetComparisonTable(selectedPeriod, selectedBranch, 'premium-finance-pnl-target-container', { alsoStore })
  generateHistoricalPnlTable(historicalReports, 'premium-finance-pnl-history-thead', 'premium-finance-pnl-history-tbody', { alsoStore })
  generatePnlOverviewChart(historicalReports, 'premium-finance-pnl-overview-chart', { alsoStore })

  generateFinancialRatioChart(historicalReports, { canvasId: 'premium-finance-cogs-chart', metric: 'Harga Pokok Produksi', title: 'COGS', alsoStore })
  generateFinancialRatioChart(historicalReports, { canvasId: 'premium-finance-gpm-chart', metric: 'Laba Kotor (Gross Profit)', title: 'Gross Profit Margin', alsoStore })
  generateSpecificSubCategoryRatioChart(historicalReports, { canvasId: 'premium-finance-wages-chart', mainCategory: 'Beban Operasional (OPEX)', subCategory: 'Wages', title: 'Wages', alsoStore })
  generateSpecificSubCategoryRatioChart(historicalReports, { canvasId: 'premium-finance-rent-chart', mainCategory: 'Beban Operasional (OPEX)', subCategory: 'Rent', title: 'Rent', alsoStore })
  generateSpecificSubCategoryRatioChart(historicalReports, { canvasId: 'premium-finance-advertising-chart', mainCategory: 'Beban Non Operasional', subCategory: 'Advertising', title: 'Advertising', alsoStore })
  generateFinancialRatioChart(historicalReports, { canvasId: 'premium-finance-npm-chart', metric: 'Pendapatan Bersih (Net Income)', title: 'Net Profit Margin', alsoStore })

  hideLoading()
}

async function setupPremiumGeneralFinance() {
  const pageId = 'premium-placeholder-general-keuangan'
  if ($store.getInitFlag('premiumGeneralFinanceInitialized')) {
    // If already initialized, just ensure the data is generated for the current selection
    await generatePremiumGeneralFinance()
    return
  }
  if (!currentUser) return

  const periodSelect = document.getElementById('premium-finance-period-select') as HTMLSelectElement
  const branchSelect = document.getElementById('premium-finance-branch-select') as HTMLSelectElement

  const reportsRef = collection(db, `users/${currentUser.uid}/pnlReports`)
  const reportsSnap = await getDocs(reportsRef)
  const branches = [...new Set(reportsSnap.docs.map((doc) => doc.data().branchName))].sort()

  if (branches.length === 0) {
    branchSelect.innerHTML = '<option>No branches with P&L data</option>'
    return
  }

  branchSelect.innerHTML = branches.map((b) => `<option value="${b}">${b}</option>`).join('')
  branchSelect.value = branches[0]

  const updatePeriods = async () => {
    const selectedBranch = branchSelect.value
    const q = query(reportsRef, where('branchName', '==', selectedBranch))
    const branchReportsSnap = await getDocs(q)
    const periods = branchReportsSnap.docs.map((doc) => doc.data().period).filter(Boolean).sort().reverse()
    if (periods.length === 0) {
      periodSelect.innerHTML = '<option>No P&L data for this branch</option>'
      return
    }
    periodSelect.innerHTML = periods.map((p) => `<option value="${p}">${new Date(p + '-02').toLocaleString('default', { month: 'long', year: 'numeric' })}</option>`).join('')
    await generatePremiumGeneralFinance()
  }

  branchSelect.addEventListener('change', updatePeriods)
  periodSelect.addEventListener('change', generatePremiumGeneralFinance)

  // Initialize the AI summary component for this view
  setupPageSummary({ pageId, analyzeUsingAI: getGeminiAnalysis })

  $store.setInitFlag('premiumGeneralFinanceInitialized', true)
  await updatePeriods()
}

export function setupPremiumAnalysisView() {
  // Prevent re-initialization
  if ($store.getInitFlag('premiumAnalysisInitialized')) {
    return
  }

  // --- Get all necessary DOM elements ---
  const branchSelect = document.getElementById('premium-analysis-branch-select') as HTMLSelectElement
  const dashboardContent = document.getElementById('premium-dashboard-content')
  const manageDataContent = document.getElementById('premium-manage-data-content')
  const userManagementContent = document.getElementById('premium-user-management-content')
  const allMainContent = document.querySelectorAll('.premium-analysis-content')

  const dashboardBtn = document.getElementById('premium-goto-dashboard-btn')
  const manageDataBtn = document.getElementById('premium-goto-manage-data-btn')
  const userManagementBtn = document.getElementById('premium-goto-user-management-btn')

  const manageDataBranchSelect = document.getElementById('premium-manage-data-branch-select') as HTMLSelectElement
  const gridContainer = document.getElementById('premium-data-cards-grid')
  const prevBtn = document.getElementById('premium-data-prev-btn') as HTMLButtonElement
  const nextBtn = document.getElementById('premium-data-next-btn') as HTMLButtonElement
  const pageInfo = document.getElementById('premium-data-page-info')

  if (!branchSelect || !manageDataBranchSelect || !gridContainer || !prevBtn || !nextBtn || !pageInfo) return

  // --- State variables for the Manage Data view ---
  let hasLoadedManageData = false
  let hasLoadedUserData = false
  let aggregatedData: Record<string, any> = {}
  let currentPage = 1
  const CARDS_PER_PAGE = 8

  // --- View Switching Logic ---
  const showDashboard = () => {
    allMainContent.forEach((el) => el.classList.add('hidden'))
    dashboardContent?.classList.remove('hidden')
    document.querySelectorAll('aside nav a').forEach((el) => el.classList.remove('bg-gray-100', 'font-semibold'))
    dashboardBtn?.classList.add('bg-gray-100', 'font-semibold')
  }

  const showManageData = () => {
    allMainContent.forEach((el) => el.classList.add('hidden'))
    manageDataContent?.classList.remove('hidden')
    document.querySelectorAll('aside nav a').forEach((el) => el.classList.remove('bg-gray-100', 'font-semibold'))
    manageDataBtn?.classList.add('bg-gray-100', 'font-semibold')

    if (!hasLoadedManageData) {
      renderPremiumManageDataView()
      hasLoadedManageData = true
    }
  }

  const showUserManagement = () => {
    allMainContent.forEach((el) => el.classList.add('hidden'))
    userManagementContent?.classList.remove('hidden')
    document.querySelectorAll('aside nav a').forEach((el) => el.classList.remove('bg-gray-100', 'font-semibold'))
    userManagementBtn?.classList.add('bg-gray-100', 'font-semibold')

    if (!hasLoadedUserData) {
      renderPremiumUserManagementView()
      hasLoadedUserData = true
    }
  }

  // --- Rendering and Filtering function for Manage Data ---
  const renderFilteredCards = () => {
    const selectedBranch = manageDataBranchSelect.value
    const allKeys = Object.keys(aggregatedData).sort((a, b) => {
      const [_branchA, periodA] = a.split('|')
      const [_branchB, periodB] = b.split('|')
      return periodB.localeCompare(periodA)
    })

    const filteredKeys = selectedBranch === 'ALL'
      ? allKeys
      : allKeys.filter((key) => aggregatedData[key].branch === selectedBranch)

    const totalPages = Math.ceil(filteredKeys.length / CARDS_PER_PAGE)
    currentPage = Math.max(1, Math.min(currentPage, totalPages))

    const startIndex = (currentPage - 1) * CARDS_PER_PAGE
    const pageKeys = filteredKeys.slice(startIndex, startIndex + CARDS_PER_PAGE)

    if (pageKeys.length === 0) {
      gridContainer.innerHTML = '<p class="text-gray-500 col-span-4">No data found for the selected branch.</p>'
    } else {
      gridContainer.innerHTML = pageKeys.map((key) => {
        const item = aggregatedData[key]
        const [year, month] = item.period.split('-')
        const formattedPeriod = new Date(parseInt(year), parseInt(month) - 1, 1).toLocaleString('default', { month: 'long', year: 'numeric' })
        const progress = (item.count / 4) * 100
        const status = progress === 100 ? 'Complete' : 'In Progress'
        const statusColor = progress === 100 ? 'green' : 'yellow'
        const checkmarkIcon = `<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-green-500" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" /></svg>`
        const circleIcon = `<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-gray-300" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM7 9a1 1 0 000 2h6a1 1 0 100-2H7z" clip-rule="evenodd" /></svg>`
        const dataTypes = ['Sales Data', 'Sales Target', 'P&L Data', 'P&L Target']

        return `
                <div class="bg-white p-4 rounded-lg shadow-md border border-gray-200">
                    <div class="flex justify-between items-center mb-2"><span class="text-xs font-semibold bg-${statusColor}-100 text-${statusColor}-800 px-2 py-0.5 rounded-full">${status}</span><button class="text-gray-400 hover:text-gray-600"><svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" /></svg></button></div>
                    <h4 class="font-semibold text-gray-800">${item.branch}</h4>
                    <p class="text-sm text-gray-500 mb-3">${formattedPeriod}</p>
                    <div class="flex items-center gap-2 text-sm text-gray-600 mb-3"><div class="w-full bg-gray-200 rounded-full h-1.5"><div class="bg-${statusColor}-500 h-1.5 rounded-full" style="width: ${progress}%"></div></div><span>${item.count}/4</span></div>
                    <div class="text-sm"><button class="w-full text-left flex justify-between items-center text-gray-600"><span>See details</span><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg></button><div class="pl-4 mt-2 space-y-2 text-gray-500">${dataTypes.map((type) => `<div class="flex items-center gap-2">${item.types[type] ? checkmarkIcon : circleIcon} ${type}</div>`).join('')}</div></div>
                </div>`
      }).join('')
    }

    pageInfo.textContent = `Page ${currentPage} of ${totalPages || 1}`
    prevBtn.disabled = currentPage === 1
    nextBtn.disabled = currentPage >= totalPages
  }

  // --- Data Fetching function for Manage Data ---
  async function renderPremiumManageDataView() {
    if (!currentUser) return
    gridContainer.innerHTML = '<p class="text-gray-500 col-span-4">Loading compiled data...</p>'

    try {
      const [salesSnap, salesTargetSnap, pnlSnap, pnlTargetSnap] = await Promise.all([
        getDocs(collection(db, `artifacts/sales-app/users/${currentUser.uid}/uploads`)),
        getDocs(collection(db, `users/${currentUser.uid}/monthlySalesTargets`)),
        getDocs(collection(db, `users/${currentUser.uid}/pnlReports`)),
        getDocs(collection(db, `users/${currentUser.uid}/monthlyPnlTargets`)),
      ])

      aggregatedData = {}
      const processAgg = (snap: any, type: string) => snap.forEach((doc: any) => {
        const data = doc.data(); const period = data.period || doc.id; if (!period || !/^\d{4}-\d{2}$/.test(period)) return; const branch = data.branchName || 'Company-Wide'; const key = `${branch}|${period}`; if (!aggregatedData[key]) { aggregatedData[key] = { branch: branch, period: period, count: 0, types: {} } } aggregatedData[key].types[type] = true; aggregatedData[key].count++
      })
      processAgg(salesSnap, 'Sales Data'); processAgg(salesTargetSnap, 'Sales Target'); processAgg(pnlSnap, 'P&L Data'); processAgg(pnlTargetSnap, 'P&L Target')

      const branches = [...new Set(Object.values(aggregatedData).map((item) => item.branch))].sort()
      manageDataBranchSelect.innerHTML = `<option value="ALL">All Branches</option>` + branches.map((b) => `<option value="${b}">${b}</option>`).join('')

      renderFilteredCards()
    } catch (error) {
      console.error('Error populating premium manage data view:', error)
      gridContainer.innerHTML = '<p class="text-red-500 col-span-4">Failed to load data. Please try again.</p>'
    }
  }

  // --- Attach all event listeners ---
  dashboardBtn?.addEventListener('click', (e) => { e.preventDefault(); showDashboard() })
  manageDataBtn?.addEventListener('click', (e) => { e.preventDefault(); showManageData() })
  userManagementBtn?.addEventListener('click', (e) => { e.preventDefault(); showUserManagement() })
  document.getElementById('premium-back-to-main-menu-btn')?.addEventListener('click', (e) => { e.preventDefault(); showView('main-menu') })

  manageDataBranchSelect.addEventListener('change', () => {
    currentPage = 1
    renderFilteredCards()
  })
  prevBtn.addEventListener('click', () => {
    if (currentPage > 1) {
      currentPage--
      renderFilteredCards()
    }
  })
  nextBtn.addEventListener('click', () => {
    currentPage++
    renderFilteredCards()
  })

  const analysisMenu = document.getElementById('premium-analysis-menu')
  analysisMenu?.addEventListener('click', async (e) => {
    const target = e.target as HTMLElement

    const toggleBtn = target.closest('.premium-submenu-toggle')
    if (toggleBtn) {
      const submenu = toggleBtn.nextElementSibling as HTMLElement
      const chevron = toggleBtn.querySelector('.chevron-icon')
      submenu?.classList.toggle('hidden')
      chevron?.classList.toggle('rotate-180')
      return
    }

    const link = target.closest('.premium-sidebar-link') as HTMLAnchorElement
    if (link) {
      e.preventDefault()
      const targetId = link.dataset.target
      if (!targetId) return

      allMainContent.forEach((el) => el.classList.add('hidden'))
      const targetContent = document.getElementById(targetId)
      targetContent?.classList.remove('hidden')

      document.querySelectorAll('aside nav a').forEach((el) => el.classList.remove('bg-gray-100', 'font-semibold'))

      link.classList.add('bg-gray-100', 'font-semibold')
      const parentToggle = link.closest('.submenu-container')?.querySelector('.premium-submenu-toggle')
      parentToggle?.classList.add('font-semibold')

      // --- TRIGGER THE SETUP FOR THE SPECIFIC VIEW ---
      if (targetId === 'premium-placeholder-general-keuangan') {
        await setupPremiumGeneralFinance()
      } else if (targetId === 'premium-placeholder-general-penjualan') {
        await setupPremiumGeneralSales()
      }
    }
  })

  // --- Initial Setup for Dashboard View ---
  const allSalesData: SalesSummary[] = $store.getAllSalesData()
  const dashboardBranches = [...new Set(allSalesData.flatMap((s) => s.branches))].sort()
  branchSelect.innerHTML = `<option value="ALL">All Branches</option>` + dashboardBranches.map((b) => `<option value="${b}">${b}</option>`).join('')
  branchSelect.addEventListener('change', generatePremiumAnalysis)

  $store.setInitFlag('premiumAnalysisInitialized', true)
  generatePremiumAnalysis()
}

/**
 * Fetches all user data and renders the "Manage Data" card grid.
 */
async function renderPremiumManageDataView() {
  if (!currentUser) return
  const gridContainer = document.getElementById('premium-data-cards-grid')
  const branchSelect = document.getElementById('premium-manage-data-branch-select') as HTMLSelectElement
  if (!gridContainer || !branchSelect) return

  gridContainer.innerHTML = '<p class="text-gray-500 col-span-4">Loading compiled data...</p>'

  try {
    // --- Data Fetching (runs only once) ---
    const [salesSnap, salesTargetSnap, pnlSnap, pnlTargetSnap] = await Promise.all([
      getDocs(collection(db, `artifacts/sales-app/users/${currentUser.uid}/uploads`)),
      getDocs(collection(db, `users/${currentUser.uid}/monthlySalesTargets`)),
      getDocs(collection(db, `users/${currentUser.uid}/pnlReports`)),
      getDocs(collection(db, `users/${currentUser.uid}/monthlyPnlTargets`)),
    ])

    const aggregatedData: Record<string, any> = {}
    const processSnap = (snap: any, type: string) => {
      snap.forEach((doc: any) => {
        const data = doc.data()
        const period = data.period || doc.id
        if (!period || !/^\d{4}-\d{2}$/.test(period)) return
        const branch = data.branchName || 'Company-Wide'
        const key = `${branch}|${period}`
        if (!aggregatedData[key]) {
          aggregatedData[key] = { branch: branch, period: period, count: 0, types: {} }
        }
        aggregatedData[key].types[type] = true
        aggregatedData[key].count++
      })
    }

    processSnap(salesSnap, 'Sales Data')
    processSnap(salesTargetSnap, 'Sales Target')
    processSnap(pnlSnap, 'P&L Data')
    processSnap(pnlTargetSnap, 'P&L Target')

    // --- Selector Population ---
    const branches = [...new Set(Object.values(aggregatedData).map((item) => item.branch))].sort()
    branchSelect.innerHTML = `<option value="ALL">All Branches</option>` + branches.map((b) => `<option value="${b}">${b}</option>`).join('')

    // --- Rendering Logic ---
    const renderCards = () => {
      const selectedBranch = branchSelect.value
      const allKeys = Object.keys(aggregatedData).sort((a, b) => {
        const [_branchA, periodA] = a.split('|') as [string, string]
        const [_branchB, periodB] = b.split('|') as [string, string]
        return periodB.localeCompare(periodA)
      })

      const filteredKeys = selectedBranch === 'ALL'
        ? allKeys
        : allKeys.filter((key) => aggregatedData[key].branch === selectedBranch)

      if (filteredKeys.length === 0) {
        gridContainer.innerHTML = '<p class="text-gray-500 col-span-4">No data found for the selected branch.</p>'
        return
      }

      gridContainer.innerHTML = filteredKeys.map((key) => {
        const item = aggregatedData[key]
        const [year, month] = item.period.split('-')
        const formattedPeriod = new Date(parseInt(year), parseInt(month) - 1, 1).toLocaleString('default', { month: 'long', year: 'numeric' })
        const progress = (item.count / 4) * 100
        const status = progress === 100 ? 'Complete' : 'In Progress'
        const statusColor = progress === 100 ? 'green' : 'yellow'

        const checkmarkIcon = `<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-green-500" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" /></svg>`
        const circleIcon = `<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-gray-300" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM7 9a1 1 0 000 2h6a1 1 0 100-2H7z" clip-rule="evenodd" /></svg>`
        const dataTypes = ['Sales Data', 'Sales Target', 'P&L Data', 'P&L Target']

        return `
                <div class="bg-white p-4 rounded-lg shadow-md border border-gray-200">
                    <div class="flex justify-between items-center mb-2">
                        <span class="text-xs font-semibold bg-${statusColor}-100 text-${statusColor}-800 px-2 py-0.5 rounded-full">${status}</span>
                        <button class="text-gray-400 hover:text-gray-600"><svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" /></svg></button>
                    </div>
                    <h4 class="font-semibold text-gray-800">${item.branch}</h4>
                    <p class="text-sm text-gray-500 mb-3">${formattedPeriod}</p>
                    <div class="flex items-center gap-2 text-sm text-gray-600 mb-3">
                        <div class="w-full bg-gray-200 rounded-full h-1.5"><div class="bg-${statusColor}-500 h-1.5 rounded-full" style="width: ${progress}%"></div></div>
                        <span>${item.count}/4</span>
                    </div>
                    <div class="text-sm">
                        <button class="w-full text-left flex justify-between items-center text-gray-600">
                            <span>See details</span>
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
                        </button>
                        <div class="pl-4 mt-2 space-y-2 text-gray-500">
                            ${dataTypes.map((type) => `<div class="flex items-center gap-2">${item.types[type] ? checkmarkIcon : circleIcon} ${type}</div>`).join('')}
                        </div>
                    </div>
                </div>`
      }).join('')
    }

    // --- Event Listener and Initial Render ---
    branchSelect.addEventListener('change', renderCards)
    renderCards() // Initial render for "All Branches"
  } catch (error) {
    console.error('Error populating premium manage data view:', error)
    gridContainer.innerHTML = '<p class="text-red-500 col-span-4">Failed to load data. Please try again.</p>'
  }
}

async function renderPremiumUserManagementView() {
  if (!currentUser) return
  const tbody = document.getElementById('premium-user-list-tbody')
  if (!tbody) return

  tbody.innerHTML = '<tr><td colspan="4" class="text-center p-4 text-gray-500">Loading users...</td></tr>'

  try {
    const querySnapshot = await getDocs(collection(db, 'users'))
    tbody.innerHTML = ''
    if (querySnapshot.empty) {
      tbody.innerHTML = '<tr><td colspan="4" class="text-center p-4 text-gray-500">No users found.</td></tr>'
      return
    }

    querySnapshot.forEach((docSnap) => {
      const user = docSnap.data()
      const tr = document.createElement('tr')
      tr.innerHTML = `
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${user.email}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${user.role === 'admin' ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}">
                        ${user.role}
                    </span>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 font-mono">${user.uid}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm font-medium flex items-center gap-4">
                    <button class="text-gray-400 hover:text-indigo-600" title="Edit User">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M17.414 2.586a2 2 0 00-2.828 0L7 10.172V13h2.828l7.586-7.586a2 2 0 000-2.828z" /><path fill-rule="evenodd" d="M2 6a2 2 0 012-2h4a1 1 0 010 2H4v10h10v-4a1 1 0 112 0v4a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" clip-rule="evenodd" /></svg>
                    </button>
                    <button class="text-gray-400 hover:text-red-600" title="Delete User">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd" /></svg>
                    </button>
                </td>
            `
      tbody.appendChild(tr)
    })
  } catch (error) {
    console.error('Error loading users for premium view:', error)
    tbody.innerHTML = '<tr><td colspan="4" class="text-center p-4 text-red-500">Could not load user data.</td></tr>'
  }
}

// Add these two new functions to src/analysis/premium/orchestrator.ts

async function generatePremiumGeneralSales() {
    if (!currentUser) return;
    
    // Get filter elements
    const branchSelect = document.getElementById('premium-sales-branch-select') as HTMLSelectElement;
    const rangeSelect = document.getElementById('premium-sales-range-select') as HTMLSelectElement;
    const periodSelect = document.getElementById('premium-sales-period-select') as HTMLSelectElement;

    const selectedBranch = branchSelect.value;
    const selectedRange = rangeSelect.value;
    const selectedPeriod = periodSelect.value;

    if (!selectedBranch || !selectedRange || !selectedPeriod) return;

    // --- Filter Data Based on Selections ---
    const allSalesData = $store.getAllSalesData();
    let filteredData = allSalesData;

    if (selectedBranch !== 'ALL') {
        filteredData = filteredData.filter(s => s.branches.includes(selectedBranch));
    }

    console.log(`Filtering data for: Branch=${selectedBranch}, Range=${selectedRange}, Period=${selectedPeriod}`);
    
    // --- Update UI Elements ---
    // 1. KPIs - START MODIFIED SECTION
    generateRingkasanFromSummaries(filteredData, [], {
        omzet: 'premium-sales-total-omzet',
        check: 'premium-sales-total-check',
        avgCheck: 'premium-sales-avg-check',
        omzetGrowth: 'premium-sales-omzet-growth',
        checkGrowth: 'premium-sales-check-growth',
        avgCheckGrowth: 'premium-sales-avg-check-growth'
    });
    // --- END MODIFIED SECTION ---

    // 2. Dynamic Omzet Chart
    const omzetTitle = document.getElementById('premium-sales-omzet-title') as HTMLElement;
    const chartContainers = {
        yearly: document.getElementById('premium-sales-omzet-yearly-container'),
        quarterly: document.getElementById('premium-sales-omzet-quarterly-container'),
        monthly: document.getElementById('premium-sales-omzet-monthly-container'),
        weekly: document.getElementById('premium-sales-omzet-weekly-container'),
    };
    
    Object.values(chartContainers).forEach(c => c?.classList.add('hidden'));

    const activeContainer = chartContainers[selectedRange as keyof typeof chartContainers];
    activeContainer?.classList.remove('hidden');
    omzetTitle.textContent = `Omzet ${selectedRange.charAt(0).toUpperCase() + selectedRange.slice(1)}`;

    console.log(`TODO: Render ${selectedRange} chart in canvas inside #${activeContainer?.id}`);

    // 3. Other Charts & Heatmaps
    generateTcApcHarianChartFromSummaries(filteredData, 'premium-sales-tc-apc-chart');
    generateOmzetHeatmapFromSummaries(filteredData, 'premium-sales-heatmap-container');
    generateOmzetHeatmapFromSummaries(filteredData, 'premium-sales-hourly-heatmap-container');
    generateSalesTrendHourlyDailyChartFromSummaries(filteredData, 'premium-sales-trend-chart');
}

async function setupPremiumGeneralSales() {
    const pageId = 'premium-placeholder-general-penjualan';
    if ($store.getInitFlag('premiumGeneralSalesInitialized')) {
        // If already initialized, just ensure the data is generated for the current selection
        await generatePremiumGeneralSales();
        return;
    }
    if (!currentUser) return;

    // Get filter elements
    const branchSelect = document.getElementById('premium-sales-branch-select') as HTMLSelectElement;
    const rangeSelect = document.getElementById('premium-sales-range-select') as HTMLSelectElement;
    const periodSelect = document.getElementById('premium-sales-period-select') as HTMLSelectElement;
    
    // Populate Branch Selector
    const allSalesData = $store.getAllSalesData();
    const branches = [...new Set(allSalesData.flatMap((s) => s.branches))].sort();
    branchSelect.innerHTML = `<option value="ALL">All Branches</option>` + branches.map((b) => `<option value="${b}">${b}</option>`).join('');
    
    // --- START MODIFIED SECTION ---
    // Logic to update Period Selector based on Range and available data
    const updatePeriodSelector = () => {
        const range = rangeSelect.value;
        const selectedBranch = branchSelect.value;

        let branchData = allSalesData;
        if (selectedBranch !== 'ALL') {
            branchData = allSalesData.filter(s => s.branches.includes(selectedBranch));
        }
        const allDates = branchData.map(s => s.date);
        if (allDates.length === 0) {
            periodSelect.innerHTML = '<option>No data available</option>';
            return;
        }

        const periods = new Set<string>();
        
        if (range === 'yearly') {
            allDates.forEach(d => periods.add(String(d.getFullYear())));
        } else if (range === 'monthly') {
            allDates.forEach(d => periods.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`));
        } else if (range === 'quarterly') {
            allDates.forEach(d => {
                const quarter = Math.floor(d.getMonth() / 3) + 1;
                periods.add(`${d.getFullYear()}-Q${quarter}`);
            });
        } else if (range === 'weekly') {
            const getMonday = (d: Date) => {
                const date = new Date(d);
                const day = date.getDay();
                const diff = date.getDate() - day + (day === 0 ? -6 : 1); // adjust when day is sunday
                return new Date(date.setDate(diff));
            };
            allDates.forEach(d => {
                const monday = getMonday(d);
                const weekKey = `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`;
                periods.add(weekKey);
            });
        }

        const sortedPeriods = Array.from(periods).sort((a, b) => b.localeCompare(a));
        
        if (sortedPeriods.length === 0) {
            periodSelect.innerHTML = '<option>No data for this range</option>';
            return;
        }
        
        const optionsHtml = sortedPeriods.map(p => {
            if (range === 'yearly') {
                return `<option value="${p}">${p}</option>`;
            }
            if (range === 'monthly') {
                const [year, month] = p.split('-');
                const label = new Date(parseInt(year), parseInt(month) - 1).toLocaleString('default', { month: 'long', year: 'numeric' });
                return `<option value="${p}">${label}</option>`;
            }
            if (range === 'quarterly') {
                return `<option value="${p}">${p.replace('-Q', ' Q')}</option>`;
            }
            if (range === 'weekly') {
                const [year, month, day] = p.split('-');
                const mondayDate = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
                const label = `Week of ${mondayDate.toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })}`;
                return `<option value="${p}">${label}</option>`;
            }
            return '';
        }).join('');

        periodSelect.innerHTML = optionsHtml;
        generatePremiumGeneralSales(); // Re-generate charts on change
    };
    // --- END MODIFIED SECTION ---

    // Attach event listeners
    branchSelect.addEventListener('change', updatePeriodSelector); // Now calls the new dynamic function
    rangeSelect.addEventListener('change', updatePeriodSelector);
    periodSelect.addEventListener('change', generatePremiumGeneralSales);

    // Initialize the AI summary component for this view
    setupPageSummary({ pageId, analyzeUsingAI: getGeminiAnalysis });

    $store.setInitFlag('premiumGeneralSalesInitialized', true);
    updatePeriodSelector(); // Initial population
}
