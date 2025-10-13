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

import { httpsCallable } from 'firebase/functions'
import { functions } from '@/core/firebase'

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

// Add this import to the top of src/analysis/premium/orchestrator.ts
import { generateOmzetYearlyChart, generateOmzetQuarterlyChart, generateOmzetWeeklyChart } from './sales-charts'

// Add these imports to the top of src/analysis/premium/orchestrator.ts
import {
  drawGeneralMenuTrendChart,
  generateChannelDonutChart,
  generateOrderByCategoryDonutChart,
} from '@/analysis/sections/general/product-channel'
import { generateTop10MenuTable } from './sales-tables'

import {
  generatePnlComparisonTable,
  generateRatioComparisonChart,
} from '@/analysis/sections/time-comparison/finance/generators'
import { generatePremiumSubCategoryComparisonChart } from './finance-charts'

import { populateTimeComparisonKPIs, generatePremiumTimeComparisonChart } from './sales-charts'

// Add these imports to the top of src/analysis/premium/orchestrator.ts
import { generateTop10ComparisonTable } from './sales-tables'
import { generateCategoryComparisonChart, generateChannelComparisonChart } from '@/analysis/sections/time-comparison/product-channel'
import { generatePremiumMenuTrendComparisonChart } from './sales-charts'

import {
  generateBranchPnlComparisonTable,
  generateBranchRatioComparisonChart,
} from '@/analysis/sections/branch-comparison/finance'

import { populateBranchComparisonKPIs, generatePremiumBranchComparisonChart } from './sales-charts'

import {
  drawBranchMenuTrendChart,
  generateBranchChannelComparisonChart,
} from '@/analysis/sections/branch-comparison/product-channel'

import { handleSalesDataUpload } from '@/uploads/sales'
import { handleTargetUpload, downloadPnlTargetTemplate, downloadSalesTargetTemplate } from '@/uploads/targets'
import { uploadAndProcessPnlFile, downloadPnlTemplate } from '@/uploads/pnl'

import { createUserWithEmailAndPassword } from 'firebase/auth'
import { deleteDoc, setDoc } from 'firebase/firestore'
import { auth } from '@/core/firebase'
import { setAdminCredentials } from '@/core/state'
import { doc, getDoc, setDoc, deleteDoc } from 'firebase/firestore'
import { deepmerge } from 'deepmerge-ts'
import { formatMachineYearMonthDay, formatNumberUtil } from '@/utils/string'

const currentPage = 1
const CARDS_PER_PAGE = 8

declare const SlimSelect: any

/**
 * This function runs when the branch selection changes. It filters data and updates the KPIs.
 */
function generatePremiumAnalysis() {
  const allSalesData: SalesSummary[] = $store.getAllSalesData()
  const branchSelect = document.getElementById('premium-analysis-branch-select') as HTMLSelectElement
  const selectedBranch = branchSelect.value

  if (!selectedBranch) return

  const branchData = selectedBranch === 'ALL'
    ? allSalesData
    : allSalesData.filter((s) => s.branches.includes(selectedBranch))

  if (branchData.length === 0) {
    // If there is no data at all for this branch, clear the view and exit.
    // Calling the generators with empty arrays will reset the view.
    generateRingkasanFromSummaries([], [], { omzet: 'premium-total-omzet', check: 'premium-total-check', avgCheck: 'premium-avg-check', omzetGrowth: 'premium-omzet-growth', checkGrowth: 'premium-check-growth', avgCheckGrowth: 'premium-avg-check-growth' })
    createChart('premium-tc-apc-chart', 'line', { labels: [], datasets: [] })
    createChart('premium-omzet-chart', 'line', { labels: [], datasets: [] })
    const heatmap = document.getElementById('premium-heatmap-container')
    if (heatmap) heatmap.innerHTML = '<div class="h-full bg-gray-100 rounded flex items-center justify-center"><span class="text-gray-400">No Data Available</span></div>'
    createChart('premium-omzet-by-outlet-chart', 'bar', { labels: [], datasets: [] })
    return
  }

  let primarySummaries: SalesSummary[] = []
  let comparisonSummaries: SalesSummary[] = []

  // 1. First, try to get data for the previous full month.
  const now = new Date()
  const prevMonthYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear()
  const prevMonth = now.getMonth() === 0 ? 11 : now.getMonth() - 1

  primarySummaries = branchData.filter((summary) =>
    summary.date.getFullYear() === prevMonthYear && summary.date.getMonth() === prevMonth,
  )

  // 2. If no data exists for the previous month, fall back to the latest month with data.
  if (primarySummaries.length > 0) {
    // Data found for last month. The comparison period is the month before that.
    const comparisonMonthYear = prevMonth === 0 ? prevMonthYear - 1 : prevMonthYear
    const comparisonMonth = prevMonth === 0 ? 11 : prevMonth - 1
    comparisonSummaries = branchData.filter((summary) =>
      summary.date.getFullYear() === comparisonMonthYear && summary.date.getMonth() === comparisonMonth,
    )
  } else {
    // Fallback logic: Find the most recent month that has data.
    const latestDate = branchData.reduce((max, s) => s.date > max ? s.date : max, branchData[0].date)
    const latestMonthYear = latestDate.getFullYear()
    const latestMonth = latestDate.getMonth()

    primarySummaries = branchData.filter((summary) =>
      summary.date.getFullYear() === latestMonthYear && summary.date.getMonth() === latestMonth,
    )

    // The comparison for the latest month is the month immediately preceding it.
    const comparisonMonthYear = latestMonth === 0 ? latestMonthYear - 1 : latestMonthYear
    const comparisonMonth = latestMonth === 0 ? 11 : latestMonth - 1
    comparisonSummaries = branchData.filter((summary) =>
      summary.date.getFullYear() === comparisonMonthYear && summary.date.getMonth() === comparisonMonth,
    )
  }

  // 3. Define element IDs and update the UI with the determined data.
  const premiumKpiIds = {
    omzet: 'premium-total-omzet',
    check: 'premium-total-check',
    avgCheck: 'premium-avg-check',
    omzetGrowth: 'premium-omzet-growth',
    checkGrowth: 'premium-check-growth',
    avgCheckGrowth: 'premium-avg-check-growth',
  }

  generateRingkasanFromSummaries(primarySummaries, comparisonSummaries, premiumKpiIds)

  if (primarySummaries.length > 0) {
    generateTcApcHarianChartFromSummaries(primarySummaries, 'premium-tc-apc-chart')
    generateOmzetHarianChartFromSummaries(primarySummaries, 'premium-omzet-chart')
    generateOmzetHeatmapFromSummaries(primarySummaries, 'premium-heatmap-container')

    if (selectedBranch === 'ALL') {
      document.getElementById('premium-omzet-by-outlet-chart')?.parentElement?.parentElement?.classList.remove('hidden')
      generateOmzetByOutletChart(primarySummaries, 'premium-omzet-by-outlet-chart')
    } else {
      document.getElementById('premium-omzet-by-outlet-chart')?.parentElement?.parentElement?.classList.add('hidden')
    }
  }
}

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
  // Prevent re-initialization on subsequent views
  if ($store.getInitFlag('premiumAnalysisInitialized')) {
    return
  }

  async function loadGlobalConfig() {
    if (!currentUser) return
    try {
      const configDocRef = doc(db, `users/${currentUser.uid}/globalConfig`, 'targets')
      const docSnap = await getDoc(configDocRef)
      if (docSnap.exists()) {
        const data = docSnap.data()
        // Load exclusions
        $store.setConfigValue('hiddenCategories', data.hiddenCategories || [])
        $store.setConfigValue('hiddenMenus', data.hiddenMenus || [])
        // Load global sales targets (we can centralize this here)
        if (data.sales) {
          const mappedTargets = {
            'Omzet Harian': data.sales.totalOmzet > 0 ? data.sales.totalOmzet / 30 : 0,
            'Total Transaksi Per Hari': data.sales.totalTransactions > 0 ? data.sales.totalTransactions / 30 : 0,
            'Average Check': data.sales.avgCheck || 0,
          }
          $store.setConfigValue('activeSalesTarget', mappedTargets)
        }
      }
    } catch (error) {
      console.error('Error loading global configuration:', error)
    }
  }
  const userEmailDisplay = document.getElementById('premium-user-email-display');
  if (userEmailDisplay && currentUser?.email) {
    userEmailDisplay.textContent = `Hello //${currentUser.email}`;
  }
  // --- Get all necessary DOM elements ---
  const premiumView = document.getElementById('premium-analysis-view')
  const dashboardContent = document.getElementById('premium-dashboard-content')
  const manageDataContent = document.getElementById('premium-manage-data-content')
  const userManagementContent = document.getElementById('premium-user-management-content')
  const configurationContent = document.getElementById('premium-configuration-content')
  const exportPdfContent = document.getElementById('premium-export-pdf-content');
  const allMainContent = document.querySelectorAll('.premium-analysis-content')
  const branchSelect = document.getElementById('premium-analysis-branch-select') as HTMLSelectElement
  const dashboardBtn = document.getElementById('premium-goto-dashboard-btn')
  const manageDataBtn = document.getElementById('premium-goto-manage-data-btn')
  const userManagementBtn = document.getElementById('premium-goto-user-management-btn')
  const configurationBtn = document.getElementById('premium-goto-configuration-btn')
  const exportPdfBtn = document.getElementById('premium-goto-export-pdf-btn');
  const configBackBtn = document.getElementById('premium-config-back-btn')
  const uploadBtn = document.getElementById('premium-manage-data-upload-btn')
  const uploadModal = document.getElementById('premium-upload-modal')
  const uploadModalCloseBtn = document.getElementById('premium-upload-modal-close')
  const uploadModalContent = uploadModal?.querySelector('.bg-white')
  const salesDataInput = document.getElementById('premium-upload-sales-data-input') as HTMLInputElement
  const pnlDataInput = document.getElementById('premium-upload-pnl-data-input') as HTMLInputElement
  const downloadSalesTargetBtn = document.getElementById('premium-download-sales-target-btn')
  const downloadPnlDataBtn = document.getElementById('premium-download-pnl-data-btn')
  const downloadPnlTargetBtn = document.getElementById('premium-download-pnl-target-btn')

  if (!premiumView) return

  // --- State variables in a shared scope for nested functions ---
  let hasLoadedManageData = false
  let hasLoadedUserData = false
  let hasLoadedGlobalTargets = false
  let hasInitializedExclusions = false // <-- New flag for this feature
  let aggregatedData: Record<string, any> = {}
  let currentPage = 1
  const CARDS_PER_PAGE = 8

  // In src/analysis/premium/orchestrator.ts

  async function setupExclusionControls() {
    if (!currentUser) return

    // 1. Get all unique categories and menus from the store
    const allSalesData: SalesSummary[] = $store.getAllSalesData()
    const uniqueCategories = new Set<string>()
    const uniqueMenus = new Set<string>()

    allSalesData.forEach((summary) => {
      if (summary.menuItemQuantities) {
        for (const category in summary.menuItemQuantities) {
          if (category !== 'Uncategorized') uniqueCategories.add(category)
          for (const menuName in summary.menuItemQuantities[category]) {
            uniqueMenus.add(menuName)
          }
        }
      }
    })

    // 2. Initialize the SlimSelect dropdowns
    const categorySelectEl = document.getElementById('hide-menu-category-select') as HTMLSelectElement
    const menuSelectEl = document.getElementById('hide-menu-select') as HTMLSelectElement

    const categorySelect = new SlimSelect({
      select: categorySelectEl,
      data: Array.from(uniqueCategories).sort().map((name) => ({ text: name, value: name })),
      settings: {
        placeholderText: 'Select categories to hide',
        closeOnSelect: false,
        allowDeselect: true,
      },
    })

    const menuSelect = new SlimSelect({
      select: menuSelectEl,
      data: Array.from(uniqueMenus).sort().map((name) => ({ text: name, value: name })),
      settings: {
        placeholderText: 'Select menu items to hide',
        closeOnSelect: false,
        allowDeselect: true,
      },
    })

    // 3. Load saved settings from Firestore and apply them
    try {
      const configDocRef = doc(db, `users/${currentUser.uid}/globalConfig`, 'targets')
      const docSnap = await getDoc(configDocRef)
      if (docSnap.exists()) {
        const data = docSnap.data()
        if (data.hiddenCategories) {
          categorySelect.setSelected(data.hiddenCategories)
        }
        if (data.hiddenMenus) {
          menuSelect.setSelected(data.hiddenMenus)
        }
      }
    } catch (error) {
      console.error('Error loading exclusion settings:', error)
    }

    // 4. Attach the save listener
    const saveBtn = document.getElementById('save-exclusions-btn')
    const feedbackEl = document.getElementById('global-targets-feedback')

    saveBtn?.addEventListener('click', async () => {
      if (!currentUser || !feedbackEl) return

      const selectedCategories = categorySelect.getSelected()
      const selectedMenus = menuSelect.getSelected()

      try {
        const configDocRef = doc(db, `users/${currentUser.uid}/globalConfig`, 'targets')
        await setDoc(configDocRef, {
          hiddenCategories: selectedCategories,
          hiddenMenus: selectedMenus,
        }, { merge: true })

        feedbackEl.className = 'p-4 text-sm rounded-md bg-green-100 text-green-800'
        feedbackEl.textContent = 'Exclusion settings saved successfully!'
        feedbackEl.classList.remove('hidden')
      } catch (error) {
        feedbackEl.className = 'p-4 text-sm rounded-md bg-red-100 text-red-800'
        feedbackEl.textContent = 'Error saving exclusion settings. Please try again.'
        feedbackEl.classList.remove('hidden')
      }
      setTimeout(() => feedbackEl.classList.add('hidden'), 4000)
    })
  }

  async function loadGlobalTargets() {
    if (!currentUser) return
    showLoading({ message: 'Loading global targets...' })

    try {
      const targetsDocRef = doc(db, `users/${currentUser.uid}/globalConfig`, 'targets')
      const docSnap = await getDoc(targetsDocRef)

      if (docSnap.exists()) {
        const data = docSnap.data()
        // Populate Sales Target Form
        if (data.sales) {
          (document.getElementById('global-target-omzet') as HTMLInputElement).value = data.sales.totalOmzet || '';
          (document.getElementById('global-target-transactions') as HTMLInputElement).value = data.sales.totalTransactions || '';
          (document.getElementById('global-target-avg-check') as HTMLInputElement).value = data.sales.avgCheck || ''
        }
        // Populate P&L Target Form
        if (data.pnl) {
          (document.getElementById('global-target-cogs') as HTMLInputElement).value = data.pnl.cogsPercent || '';
          (document.getElementById('global-target-wages') as HTMLInputElement).value = data.pnl.wagesPercent || '';
          (document.getElementById('global-target-rent') as HTMLInputElement).value = data.pnl.rentPercent || ''
        }
      }
    } catch (error) {
      console.error('Error loading global targets:', error)
      alert('Could not load global targets.')
    } finally {
      hideLoading()
    }
  }

  // --- Nested Helper Functions for Manage Data View ---
  function renderFilteredCards() {
    const gridContainer = document.getElementById('premium-data-cards-grid')
    const branchSelect = document.getElementById('premium-manage-data-branch-select') as HTMLSelectElement
    const prevBtn = document.getElementById('premium-data-prev-btn') as HTMLButtonElement
    const nextBtn = document.getElementById('premium-data-next-btn') as HTMLButtonElement
    const pageInfo = document.getElementById('premium-data-page-info')

    if (!gridContainer || !branchSelect || !prevBtn || !nextBtn || !pageInfo) return

    const selectedBranch = branchSelect.value
    const allKeys = Object.keys(aggregatedData).sort((a, b) => {
      const [, periodA] = a.split('|')
      const [, periodB] = b.split('|')
      return periodB.localeCompare(periodA)
    })

    const filteredKeys = selectedBranch === 'ALL' ? allKeys : allKeys.filter((key) => aggregatedData[key].branch === selectedBranch)

    const totalPages = Math.ceil(filteredKeys.length / CARDS_PER_PAGE)
    currentPage = Math.max(1, Math.min(currentPage, totalPages || 1))

    const startIndex = (currentPage - 1) * CARDS_PER_PAGE
    const pageKeys = filteredKeys.slice(startIndex, startIndex + CARDS_PER_PAGE)

    if (pageKeys.length === 0) {
      gridContainer.innerHTML = '<p class="text-gray-500 col-span-4 text-center mt-4">No data found for the selected branch.</p>'
    } else {
      gridContainer.innerHTML = pageKeys.map((key) => {
        const item = aggregatedData[key]
        const [year, month] = item.period.split('-')
        const formattedPeriod = new Date(parseInt(year), parseInt(month) - 1, 1).toLocaleString('default', { month: 'long', year: 'numeric' })

        const dataTypes = ['Sales Data', 'Sales Target', 'P&L Data', 'P&L Target']
        const typeKeys = ['salesData', 'salesTarget', 'pnlData', 'pnlTarget']

        const count = typeKeys.filter((t) => item.types[t]?.exists).length
        const progress = (count / 4) * 100
        const status = progress === 100 ? 'Complete' : 'In Progress'
        const statusColor = progress === 100 ? 'green' : 'yellow'

        const checkmarkIcon = `<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-green-500" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" /></svg>`
        const circleIcon = `<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-gray-300" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM7 9a1 1 0 000 2h6a1 1 0 100-2H7z" clip-rule="evenodd" /></svg>`

        return `
          <div class="bg-white p-4 rounded-lg shadow-md border border-gray-200 flex flex-col">
              <div class="flex justify-between items-center mb-2">
                <span class="text-xs font-semibold bg-${statusColor}-100 text-${statusColor}-800 px-2 py-0.5 rounded-full">${status}</span>
                <button 
                  class="delete-premium-card-btn text-gray-400 hover:text-red-600" title="Delete all data for this period"
                  data-branch="${item.branch}"
                  data-period="${item.period}"
                  data-sales-id="${item.types.salesData?.id || ''}"
                  data-sales-target-id="${item.types.salesTarget?.id || ''}"
                  data-pnl-id="${item.types.pnlData?.id || ''}"
                  data-pnl-target-id="${item.types.pnlTarget?.id || ''}"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd" /></svg>
                </button>
              </div>
              <h4 class="font-semibold text-gray-800">${item.branch}</h4>
              <p class="text-sm text-gray-500 mb-3">${formattedPeriod}</p>
              <div class="flex items-center gap-2 text-sm text-gray-600 mb-3">
                <div class="w-full bg-gray-200 rounded-full h-1.5"><div class="bg-${statusColor}-500 h-1.5 rounded-full" style="width: ${progress}%"></div></div>
                <span>${count}/4</span>
              </div>
              <div class="text-xs space-y-1.5 mt-2 border-t pt-3">
                ${typeKeys.map((typeKey, index) => `
                  <div class="flex items-center gap-2 ${item.types[typeKey]?.exists ? 'text-gray-700' : 'text-gray-400'}">
                    ${item.types[typeKey]?.exists ? checkmarkIcon : circleIcon} ${dataTypes[index]}
                  </div>
                `).join('')}
              </div>
          </div>`
      }).join('')
    }

    pageInfo.textContent = `Page ${currentPage} of ${totalPages || 1}`
    prevBtn.disabled = currentPage === 1
    nextBtn.disabled = currentPage >= totalPages

    prevBtn.onclick = () => { if (currentPage > 1) { currentPage--; renderFilteredCards() } }
    nextBtn.onclick = () => { if (currentPage < totalPages) { currentPage++; renderFilteredCards() } }
  }

  async function ensureUserDocument(uid: string, email: string | null, role = 'user'): Promise<void> {
    const userRef = doc(db, 'users', uid)
    const userSnap = await getDoc(userRef)
    if (!userSnap.exists()) {
      try {
        await setDoc(userRef, { uid, email, createdAt: new Date(), role })
      } catch (error) {
        console.error('Error creating user document:', error)
      }
    }
  }

  async function deleteUserRecordPremium(userId: string): Promise<void> {
    if (userId === currentUser?.uid) {
      alert('For safety, you cannot delete your own user record from this interface.')
      return
    }
    try {
      await deleteDoc(doc(db, 'users', userId))
      alert('User Firestore record deleted.')
      await renderPremiumUserManagementView() // Refresh the premium view's list
    } catch (error: any) {
      console.error('Error deleting user record:', error)
      alert(`Error deleting user record: ${error.message}`)
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
              <button class="delete-user-btn-premium text-gray-400 hover:text-red-600" title="Delete User" data-id="${user.uid}">
                  <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 pointer-events-none" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd" /></svg>
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

  async function renderPremiumManageDataView() {
    if (!currentUser) return
    const gridContainer = document.getElementById('premium-data-cards-grid')
    const branchSelect = document.getElementById('premium-manage-data-branch-select') as HTMLSelectElement
    if (!gridContainer || !branchSelect) return

    gridContainer.innerHTML = '<p class="text-gray-500 col-span-4">Loading compiled data...</p>'

    try {
      const [salesSnap, salesTargetSnap, pnlSnap, pnlTargetSnap] = await Promise.all([
        getDocs(collection(db, `artifacts/sales-app/users/${currentUser.uid}/uploads`)),
        getDocs(collection(db, `users/${currentUser.uid}/monthlySalesTargets`)),
        getDocs(collection(db, `users/${currentUser.uid}/pnlReports`)),
        getDocs(collection(db, `users/${currentUser.uid}/monthlyPnlTargets`)),
      ])

      const localAggregatedData: Record<string, any> = {}
      const processSnap = (snap: any, type: string) => {
        snap.forEach((doc: any) => {
          const data = doc.data()
          const period = data.period || doc.id
          if (!period || !/^\d{4}-\d{2}$/.test(period)) return
          const branch = data.branchName || 'Company-Wide'
          const key = `${branch}|${period}`
          if (!localAggregatedData[key]) {
            localAggregatedData[key] = { branch: branch, period: period, types: {} }
          }
          localAggregatedData[key].types[type] = { id: doc.id, exists: true }
        })
      }

      processSnap(salesSnap, 'salesData')
      processSnap(salesTargetSnap, 'salesTarget')
      processSnap(pnlSnap, 'pnlData')
      processSnap(pnlTargetSnap, 'pnlTarget')

      aggregatedData = localAggregatedData // Update the shared state

      const branches = [...new Set(Object.values(aggregatedData).map((item) => item.branch))].sort()
      branchSelect.innerHTML = `<option value="ALL">All Branches</option>` + branches.map((b) => `<option value="${b}">${b}</option>`).join('')

      renderFilteredCards() // Initial render

      // --- FIX: This ensures the listener always has the correct data scope ---
      // We remove any old listener and add a fresh one.
      const newBranchSelect = branchSelect.cloneNode(true)
      branchSelect.parentNode?.replaceChild(newBranchSelect, branchSelect)
      newBranchSelect.addEventListener('change', () => {
        currentPage = 1 // Reset to first page on filter change
        renderFilteredCards()
      })
    } catch (error) {
      console.error('Error populating premium manage data view:', error)
      if (gridContainer) gridContainer.innerHTML = '<p class="text-red-500 col-span-4">Failed to load data. Please try again.</p>'
    }
  }

  // --- View Switching Logic ---
  const showContent = (contentElement: HTMLElement | null, buttonElement: HTMLElement | null) => {
    allMainContent.forEach((el) => el.classList.add('hidden'))
    contentElement?.classList.remove('hidden')
    document.querySelectorAll('aside nav a').forEach((el) => el.classList.remove('bg-gray-100', 'font-semibold'))
    buttonElement?.classList.add('bg-gray-100', 'font-semibold')
  }

  const showDashboard = () => showContent(dashboardContent, dashboardBtn)
  const showUserManagement = () => {
    showContent(userManagementContent, userManagementBtn)
    if (!hasLoadedUserData) {
      // Assuming renderPremiumUserManagementView() exists elsewhere
      renderPremiumUserManagementView()
      hasLoadedUserData = true
    }
  }

  const showConfiguration = () => {
    showContent(configurationContent, configurationBtn)
    if (!hasLoadedGlobalTargets) {
      loadGlobalTargets()
      hasLoadedGlobalTargets = true
    }
    // --- NEW: Initialize exclusion controls when showing the page ---
    if (!hasInitializedExclusions) {
      setupExclusionControls()
      hasInitializedExclusions = true
    }
  }

  const showExportPdf = () => showContent(exportPdfContent, exportPdfBtn);

  const showManageData = () => {
    showContent(manageDataContent, manageDataBtn)
    if (!hasLoadedManageData) {
      renderPremiumManageDataView()
      hasLoadedManageData = true
    }
  }

  // --- Attach all event listeners ---
  dashboardBtn?.addEventListener('click', (e) => { e.preventDefault(); showDashboard() })
  manageDataBtn?.addEventListener('click', (e) => { e.preventDefault(); showManageData() })

  userManagementBtn?.addEventListener('click', (e) => { e.preventDefault(); showUserManagement() })
  configurationBtn?.addEventListener('click', (e) => { e.preventDefault(); showConfiguration() })
  exportPdfBtn?.addEventListener('click', (e) => { e.preventDefault(); showExportPdf(); });
  configBackBtn?.addEventListener('click', (e) => { e.preventDefault(); showDashboard() })

  const saveSalesBtn = document.getElementById('save-global-sales-target-btn')
  const savePnlBtn = document.getElementById('save-global-pnl-target-btn')
  const feedbackEl = document.getElementById('global-targets-feedback')

  saveSalesBtn?.addEventListener('click', async () => {
    if (!currentUser || !feedbackEl) return

    const salesTargetData = {
      totalOmzet: parseFloat((document.getElementById('global-target-omzet') as HTMLInputElement).value) || 0,
      totalTransactions: parseInt((document.getElementById('global-target-transactions') as HTMLInputElement).value, 10) || 0,
      avgCheck: parseFloat((document.getElementById('global-target-avg-check') as HTMLInputElement).value) || 0,
    }

    try {
      const targetsDocRef = doc(db, `users/${currentUser.uid}/globalConfig`, 'targets')
      await setDoc(targetsDocRef, { sales: salesTargetData }, { merge: true })
      feedbackEl.className = 'p-4 text-sm rounded-md bg-green-100 text-green-800'
      feedbackEl.textContent = 'Global Sales Target saved successfully!'
      feedbackEl.classList.remove('hidden')
    } catch (error) {
      feedbackEl.className = 'p-4 text-sm rounded-md bg-red-100 text-red-800'
      feedbackEl.textContent = 'Error saving sales target. Please try again.'
      feedbackEl.classList.remove('hidden')
    }
    setTimeout(() => feedbackEl.classList.add('hidden'), 4000)
  })

  savePnlBtn?.addEventListener('click', async () => {
    if (!currentUser || !feedbackEl) return

    const pnlTargetData = {
      cogsPercent: parseFloat((document.getElementById('global-target-cogs') as HTMLInputElement).value) || 0,
      wagesPercent: parseFloat((document.getElementById('global-target-wages') as HTMLInputElement).value) || 0,
      rentPercent: parseFloat((document.getElementById('global-target-rent') as HTMLInputElement).value) || 0,
    }

    try {
      const targetsDocRef = doc(db, `users/${currentUser.uid}/globalConfig`, 'targets')
      await setDoc(targetsDocRef, { pnl: pnlTargetData }, { merge: true })
      feedbackEl.className = 'p-4 text-sm rounded-md bg-green-100 text-green-800'
      feedbackEl.textContent = 'Global P&L Target saved successfully!'
      feedbackEl.classList.remove('hidden')
    } catch (error) {
      feedbackEl.className = 'p-4 text-sm rounded-md bg-red-100 text-red-800'
      feedbackEl.textContent = 'Error saving P&L target. Please try again.'
      feedbackEl.classList.remove('hidden')
    }
    setTimeout(() => feedbackEl.classList.add('hidden'), 4000)
  })

  const addUserModal = document.getElementById('add-user-modal')
  const addUserBtn = document.getElementById('premium-add-user-btn') // FIX: Select button by its new ID
  const addUserModalClose = document.getElementById('add-user-modal-close')
  const cancelAddUserBtn = document.getElementById('cancel-add-user-btn-premium')
  const addUserForm = document.getElementById('add-user-form-premium')

  // Open modal
  addUserBtn?.addEventListener('click', () => {
    addUserModal?.classList.remove('hidden')
  })

  // Close modal
  const closeModal = () => addUserModal?.classList.add('hidden')
  addUserModalClose?.addEventListener('click', closeModal)
  cancelAddUserBtn?.addEventListener('click', closeModal)

  // Handle form submission
  addUserForm?.addEventListener('submit', async (e) => {
    e.preventDefault()
    const feedbackEl = document.getElementById('create-user-feedback-premium')
    if (!feedbackEl) return

    const email = (document.getElementById('new-user-email-premium') as HTMLInputElement).value
    const password = (document.getElementById('new-user-password-premium') as HTMLInputElement).value
    const role = (document.getElementById('new-user-role-premium') as HTMLSelectElement).value

    let adminCreds = { email: '', password: '' }

    if (auth.currentUser?.email) {
      const adminPassword = prompt('To create a new user, please re-enter your admin password for confirmation:')
      if (!adminPassword) {
        feedbackEl.textContent = 'Admin password not provided. User creation cancelled.'
        feedbackEl.className = 'text-red-500 text-sm mb-4 text-center'
        feedbackEl.classList.remove('hidden')
        return
      }
      // Store credentials locally for re-login
      adminCreds = { email: auth.currentUser.email, password: adminPassword }
    } else {
      alert('Admin not signed in. Cannot create user.')
      return
    }

    feedbackEl.textContent = 'Creating user...'
    feedbackEl.className = 'text-blue-500 text-sm mb-4 text-center'
    feedbackEl.classList.remove('hidden')

    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password)
      await ensureUserDocument(userCredential.user.uid, userCredential.user.email, role)

      feedbackEl.textContent = 'User created successfully! Re-authenticating admin and refreshing list...'
      feedbackEl.className = 'text-green-500 text-sm mb-4 text-center'
    } catch (error: any) {
      console.error('Error creating user:', error)
      feedbackEl.textContent = `Error: ${error.message}`
      feedbackEl.className = 'text-red-500 text-sm mb-4 text-center'
    } finally {
      // --- FIX: This block ensures the admin is always logged back in ---
      try {
        await signInWithEmailAndPassword(auth, adminCreds.email, adminCreds.password)
        await renderPremiumUserManagementView() // Refresh the user list
        setTimeout(closeModal, 2000)
      } catch (reauthError) {
        console.error('Admin re-authentication failed:', reauthError)
        alert('Could not sign you back in as admin. Please log in again.')
        signOut(auth) // Log out completely to avoid being stuck as the new user
      }
    }
  })

  // Handle delete button clicks on the user list
  const userTbody = document.getElementById('premium-user-list-tbody')
  userTbody?.addEventListener('click', (e) => {
    const target = e.target as HTMLElement
    const deleteButton = target.closest('.delete-user-btn-premium')
    if (deleteButton) {
      const userId = (deleteButton as HTMLElement).dataset.id
      if (userId && confirm('Are you sure you want to delete this user\'s Firestore data? This will NOT delete their login account.')) {
        deleteUserRecordPremium(userId)
      }
    }
  })

  document.getElementById('premium-back-to-main-menu-btn')?.addEventListener('click', (e) => { e.preventDefault(); showView('main-menu') })

  // Delete button listener
  manageDataContent?.addEventListener('click', async (e) => {
    const target = e.target as HTMLElement
    const deleteButton = target.closest('.delete-premium-card-btn')

    if (deleteButton) {
      const branch = deleteButton.getAttribute('data-branch')
      const period = deleteButton.getAttribute('data-period')

      const idsToDelete = {
        salesDataId: deleteButton.getAttribute('data-sales-id'),
        salesTargetId: deleteButton.getAttribute('data-sales-target-id'),
        pnlDataId: deleteButton.getAttribute('data-pnl-id'),
        pnlTargetId: deleteButton.getAttribute('data-pnl-target-id'),
      }

      if (!branch || !period) return

      const confirmation = confirm(`Are you sure you want to permanently delete all data for ${branch} for the period ${period}? This action cannot be undone.`)

      if (confirmation) {
        showLoading({ message: `Deleting data for ${branch} - ${period}...` })
        try {
          const deleteCompiledPeriodData = httpsCallable(functions, 'deleteCompiledPeriodData')
          await deleteCompiledPeriodData(idsToDelete)

          // Refresh the view by re-fetching and re-rendering
          await renderPremiumManageDataView()
        } catch (error) {
          console.error('Error deleting data:', error)
          alert('Failed to delete data. Please check the console for details.')
        } finally {
          hideLoading()
        }
      }
    }
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
      } else if (targetId === 'premium-placeholder-general-produk') {
        await setupPremiumProductChannel()
      } else if (targetId === 'premium-placeholder-waktu-keuangan') {
        await setupPremiumTimeFinance()
      } else if (targetId === 'premium-placeholder-waktu-penjualan') {
        await setupPremiumTimeSales()
      } else if (targetId === 'premium-placeholder-waktu-produk') {
        await setupPremiumTimeProductChannel()
      } else if (targetId === 'premium-placeholder-cabang-keuangan') {
        await setupPremiumBranchFinance()
      } else if (targetId === 'premium-placeholder-cabang-penjualan') {
        await setupPremiumBranchSales()
      } else if (targetId === 'premium-placeholder-cabang-produk') {
        await setupPremiumBranchProductChannel()
      }
    }
  })

  const openUploadModal = () => {
    if (uploadModal && uploadModalContent) {
      uploadModal.classList.remove('hidden')
      setTimeout(() => { // Allow the display property to apply before starting animation
        uploadModal.classList.remove('opacity-0')
        uploadModalContent.classList.remove('scale-95', 'opacity-0')
      }, 10)
    }
  }

  const closeUploadModal = () => {
    if (uploadModal && uploadModalContent) {
      uploadModal.classList.add('opacity-0')
      uploadModalContent.classList.add('scale-95', 'opacity-0')
      setTimeout(() => { // Wait for animation to finish before hiding
        uploadModal.classList.add('hidden')
      }, 300)
    }
  }

  uploadBtn?.addEventListener('click', (e) => { e.preventDefault(); openUploadModal() })
  uploadModalCloseBtn?.addEventListener('click', closeUploadModal)
  uploadModal?.addEventListener('click', (e) => { if (e.target === uploadModal) closeUploadModal() })

  // Link download buttons to their respective functions
  downloadSalesTargetBtn?.addEventListener('click', downloadSalesTargetTemplate)
  downloadPnlDataBtn?.addEventListener('click', downloadPnlTemplate)
  downloadPnlTargetBtn?.addEventListener('click', downloadPnlTargetTemplate)

  // Sales Data format chooser logic
  const salesDataUploadZone = uploadModal?.querySelector('label[for="premium-upload-sales-data-input"]') as HTMLLabelElement
  const esbBtn = document.getElementById('premium-upload-esb-btn')
  const mokaBtn = document.getElementById('premium-upload-moka-btn')
  const formatButtons = [esbBtn, mokaBtn]
  let selectedSalesFormat: 'ESB' | 'MOKA' | null = null

  formatButtons.forEach((button) => {
    button?.addEventListener('click', () => {
      selectedSalesFormat = button.getAttribute('data-format') as 'ESB' | 'MOKA'
      formatButtons.forEach((btn) => btn?.classList.remove('bg-indigo-100', 'border-indigo-500'))
      button.classList.add('bg-indigo-100', 'border-indigo-500')
      salesDataUploadZone?.classList.remove('hidden')
      salesDataUploadZone?.classList.add('flex')
    })
  })

  // Helper to handle all file uploads
  const handleFileUpload = async (file: File | undefined, type: 'salesData' | 'pnlData') => {
    if (!file) { alert('Please select a file.'); return }
    closeUploadModal()
    try {
      switch (type) {
        case 'salesData':
          if (!selectedSalesFormat) throw new Error('Sales data format (ESB/Moka) was not selected.')
          await handleSalesDataUpload(file, selectedSalesFormat)
          break
        case 'pnlData':
          await uploadAndProcessPnlFile(file)
          break
        // REMOVED: Cases for 'salesTarget' and 'pnlTarget'
      }
    } catch (error: any) {
      alert(`Upload failed: ${error.message}`)
      console.error(`Error during ${type} upload:`, error)
    }
  }

  salesDataInput?.addEventListener('change', (e) => handleFileUpload((e.target as HTMLInputElement).files?.[0], 'salesData'))
  pnlDataInput?.addEventListener('change', (e) => handleFileUpload((e.target as HTMLInputElement).files?.[0], 'pnlData'))

  const allSalesData: SalesSummary[] = $store.getAllSalesData()
  const dashboardBranches = [...new Set(allSalesData.flatMap((s) => s.branches))].sort()
  branchSelect.innerHTML = `<option value="ALL">All Branches</option>` + dashboardBranches.map((b) => `<option value="${b}">${b}</option>`).join('')
  branchSelect.addEventListener('change', generatePremiumAnalysis)

  $store.setInitFlag('premiumAnalysisInitialized', true)
  loadGlobalConfig().then(() => {
    generatePremiumAnalysis() // Renders the initial dashboard view
  })
}

async function generatePremiumGeneralSales() {
  if (!currentUser) return

  const branchSelect = document.getElementById('premium-sales-branch-select') as HTMLSelectElement
  const rangeSelect = document.getElementById('premium-sales-range-select') as HTMLSelectElement
  const periodSelect = document.getElementById('premium-sales-period-select') as HTMLSelectElement

  const selectedBranch = branchSelect.value
  const selectedRange = rangeSelect.value
  const selectedPeriod = periodSelect.value

  if (!selectedBranch || !selectedRange || !selectedPeriod) return

  try {
    const targetsDocRef = doc(db, `users/${currentUser.uid}/globalConfig`, 'targets')
    const docSnap = await getDoc(targetsDocRef)
    if (docSnap.exists() && docSnap.data().sales) {
      const globalSalesTargets = docSnap.data().sales

      // Map the global targets to the structure the chart functions expect
      const mappedTargets = {
        // Calculate a daily average for the daily omzet chart
        'Omzet Harian': globalSalesTargets.totalOmzet > 0 ? globalSalesTargets.totalOmzet / 30 : 0,
        'Total Transaksi Per Hari': globalSalesTargets.totalTransactions > 0 ? globalSalesTargets.totalTransactions / 30 : 0,
        'Average Check': globalSalesTargets.avgCheck || 0,
      }

      $store.setConfigValue('activeSalesTarget', mappedTargets)
    } else {
      // If no global targets are found, clear any existing ones from the state
      $store.setConfigValue('activeSalesTarget', {})
    }
  } catch (error) {
    console.error('Error fetching global sales targets:', error)
    $store.setConfigValue('activeSalesTarget', {})
  }

  // --- START: Real Date Filtering Logic ---
  const allSalesData = $store.getAllSalesData()
  let branchData = allSalesData
  if (selectedBranch !== 'ALL') {
    branchData = allSalesData.filter((s) => s.branches.includes(selectedBranch))
  }

  let startDate: Date, endDate: Date
  const [year, part] = selectedPeriod.split('-')

  switch (selectedRange) {
    case 'yearly':
      startDate = new Date(parseInt(year), 0, 1)
      endDate = new Date(parseInt(year), 11, 31, 23, 59, 59)
      break
    case 'quarterly':
      const quarter = parseInt(part.replace('Q', ''))
      const startMonth = (quarter - 1) * 3
      startDate = new Date(parseInt(year), startMonth, 1)
      endDate = new Date(parseInt(year), startMonth + 3, 0, 23, 59, 59)
      break
    case 'monthly':
      startDate = new Date(parseInt(year), parseInt(part) - 1, 1)
      endDate = new Date(parseInt(year), parseInt(part), 0, 23, 59, 59)
      break
    case 'weekly':
      const monthPart = parseInt(part)
      const dayPart = parseInt(selectedPeriod.split('-')[2])
      startDate = new Date(parseInt(year), monthPart - 1, dayPart)
      endDate = new Date(startDate)
      endDate.setDate(startDate.getDate() + 6)
      endDate.setHours(23, 59, 59)
      break
    default:
      return
  }

  const filteredData = branchData.filter((s) => s.date >= startDate && s.date <= endDate)
  // --- END: Real Date Filtering Logic ---

  // 1. KPIs
  generateRingkasanFromSummaries(filteredData, [], {
    omzet: 'premium-sales-total-omzet', check: 'premium-sales-total-check', avgCheck: 'premium-sales-avg-check',
    omzetGrowth: 'premium-sales-omzet-growth', checkGrowth: 'premium-sales-check-growth', avgCheckGrowth: 'premium-sales-avg-check-growth',
  })

  // 2. Dynamic Omzet Chart
  const omzetTitle = document.getElementById('premium-sales-omzet-title') as HTMLElement
  const chartContainers = {
    yearly: document.getElementById('premium-sales-omzet-yearly-container'),
    quarterly: document.getElementById('premium-sales-omzet-quarterly-container'),
    monthly: document.getElementById('premium-sales-omzet-monthly-container'),
    weekly: document.getElementById('premium-sales-omzet-weekly-container'),
  }

  Object.values(chartContainers).forEach((c) => c?.classList.add('hidden'))

  const activeContainer = chartContainers[selectedRange as keyof typeof chartContainers]
  activeContainer?.classList.remove('hidden')
  omzetTitle.textContent = `Omzet ${selectedRange.charAt(0).toUpperCase() + selectedRange.slice(1)}`

  // --- START: Call correct chart generator ---
  switch (selectedRange) {
    case 'yearly':
      generateOmzetYearlyChart(filteredData, 'premium-sales-omzet-yearly-chart')
      break
    case 'quarterly':
      generateOmzetQuarterlyChart(filteredData, 'premium-sales-omzet-quarterly-chart')
      break
    case 'monthly':
      // The monthly view is a daily chart, so we reuse the 'harian' generator
      generateOmzetHarianChartFromSummaries(filteredData, 'premium-sales-omzet-monthly-chart')
      break
    case 'weekly':
      generateOmzetWeeklyChart(filteredData, 'premium-sales-omzet-weekly-chart')
      break
  }
  // --- END: Call correct chart generator ---

  // 3. Other Charts & Heatmaps
  generateTcApcHarianChartFromSummaries(filteredData, 'premium-sales-tc-apc-chart')
  generateOmzetHeatmapFromSummaries(filteredData, 'premium-sales-heatmap-container')
  generateOmzetHeatmapFromSummaries(filteredData, 'premium-sales-hourly-heatmap-container')
  generateSalesTrendHourlyDailyChartFromSummaries(filteredData, 'premium-sales-trend-chart')
}

async function setupPremiumGeneralSales() {
  const pageId = 'premium-placeholder-general-penjualan'
  if ($store.getInitFlag('premiumGeneralSalesInitialized')) {
    // If already initialized, just ensure the data is generated for the current selection
    await generatePremiumGeneralSales()
    return
  }
  if (!currentUser) return

  // Get filter elements
  const branchSelect = document.getElementById('premium-sales-branch-select') as HTMLSelectElement
  const rangeSelect = document.getElementById('premium-sales-range-select') as HTMLSelectElement
  const periodSelect = document.getElementById('premium-sales-period-select') as HTMLSelectElement

  // Populate Branch Selector
  const allSalesData = $store.getAllSalesData()
  const branches = [...new Set(allSalesData.flatMap((s) => s.branches))].sort()
  branchSelect.innerHTML = `<option value="ALL">All Branches</option>` + branches.map((b) => `<option value="${b}">${b}</option>`).join('')

  // --- START MODIFIED SECTION ---
  // Logic to update Period Selector based on Range and available data
  const updatePeriodSelector = () => {
    const range = rangeSelect.value
    const selectedBranch = branchSelect.value

    let branchData = allSalesData
    if (selectedBranch !== 'ALL') {
      branchData = allSalesData.filter((s) => s.branches.includes(selectedBranch))
    }
    const allDates = branchData.map((s) => s.date)
    if (allDates.length === 0) {
      periodSelect.innerHTML = '<option>No data available</option>'
      return
    }

    const periods = new Set<string>()

    if (range === 'yearly') {
      allDates.forEach((d) => periods.add(String(d.getFullYear())))
    } else if (range === 'monthly') {
      allDates.forEach((d) => periods.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`))
    } else if (range === 'quarterly') {
      allDates.forEach((d) => {
        const quarter = Math.floor(d.getMonth() / 3) + 1
        periods.add(`${d.getFullYear()}-Q${quarter}`)
      })
    } else if (range === 'weekly') {
      const getMonday = (d: Date) => {
        const date = new Date(d)
        const day = date.getDay()
        const diff = date.getDate() - day + (day === 0 ? -6 : 1) // adjust when day is sunday
        return new Date(date.setDate(diff))
      }
      allDates.forEach((d) => {
        const monday = getMonday(d)
        const weekKey = `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`
        periods.add(weekKey)
      })
    }

    const sortedPeriods = Array.from(periods).sort((a, b) => b.localeCompare(a))

    if (sortedPeriods.length === 0) {
      periodSelect.innerHTML = '<option>No data for this range</option>'
      return
    }

    const optionsHtml = sortedPeriods.map((p) => {
      if (range === 'yearly') {
        return `<option value="${p}">${p}</option>`
      }
      if (range === 'monthly') {
        const [year, month] = p.split('-')
        const label = new Date(parseInt(year), parseInt(month) - 1).toLocaleString('default', { month: 'long', year: 'numeric' })
        return `<option value="${p}">${label}</option>`
      }
      if (range === 'quarterly') {
        return `<option value="${p}">${p.replace('-Q', ' Q')}</option>`
      }
      if (range === 'weekly') {
        const [year, month, day] = p.split('-')
        const mondayDate = new Date(parseInt(year), parseInt(month) - 1, parseInt(day))
        const label = `Week of ${mondayDate.toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })}`
        return `<option value="${p}">${label}</option>`
      }
      return ''
    }).join('')

    periodSelect.innerHTML = optionsHtml
    generatePremiumGeneralSales() // Re-generate charts on change
  }
  // --- END MODIFIED SECTION ---

  // Attach event listeners
  branchSelect.addEventListener('change', updatePeriodSelector) // Now calls the new dynamic function
  rangeSelect.addEventListener('change', updatePeriodSelector)
  periodSelect.addEventListener('change', generatePremiumGeneralSales)

  // Initialize the AI summary component for this view
  setupPageSummary({ pageId, analyzeUsingAI: getGeminiAnalysis })

  $store.setInitFlag('premiumGeneralSalesInitialized', true)
  updatePeriodSelector() // Initial population
}

// Add these two new functions to src/analysis/premium/orchestrator.ts

async function generatePremiumProductChannel() {
  if (!currentUser) return

  // Get filter values
  const branchSelect = document.getElementById('premium-product-branch-select') as HTMLSelectElement
  const rangeSelect = document.getElementById('premium-product-range-select') as HTMLSelectElement
  const periodSelect = document.getElementById('premium-product-period-select') as HTMLSelectElement
  const slimSelectInstance = $store.getUIComponent('premiumProductMenuSelect')

  const selectedBranch = branchSelect.value
  const selectedRange = rangeSelect.value
  const selectedPeriod = periodSelect.value

  if (!selectedBranch || !selectedRange || !selectedPeriod) return

  // --- START MODIFIED SECTION ---
  const allSalesData = $store.getAllSalesData()
  let branchData = allSalesData
  if (selectedBranch !== 'ALL') {
    branchData = allSalesData.filter((s) => s.branches.includes(selectedBranch))
  }

  let startDate: Date, endDate: Date
  // This logic correctly parses year, quarter, month, or week from the selected period
  try {
    const [year, part, dayPart] = selectedPeriod.split('-')

    switch (selectedRange) {
      case 'yearly':
        startDate = new Date(parseInt(year), 0, 1)
        endDate = new Date(parseInt(year), 11, 31, 23, 59, 59)
        break
      case 'quarterly':
        const quarter = parseInt(part.replace('Q', ''))
        const startMonth = (quarter - 1) * 3
        startDate = new Date(parseInt(year), startMonth, 1)
        endDate = new Date(parseInt(year), startMonth + 3, 0, 23, 59, 59)
        break
      case 'monthly':
        startDate = new Date(parseInt(year), parseInt(part) - 1, 1)
        endDate = new Date(parseInt(year), parseInt(part), 0, 23, 59, 59)
        break
      case 'weekly':
        startDate = new Date(parseInt(year), parseInt(part) - 1, parseInt(dayPart))
        endDate = new Date(startDate)
        endDate.setDate(startDate.getDate() + 6)
        endDate.setHours(23, 59, 59)
        break
      default:
        // If something goes wrong, filter nothing to show an empty state
        startDate = new Date(9999, 0, 1)
        endDate = new Date(9999, 0, 1)
        break
    }
  } catch (e) {
    console.error('Error parsing date range, showing empty data.', e)
    // On error, filter nothing to show an empty state
    startDate = new Date(9999, 0, 1)
    endDate = new Date(9999, 0, 1)
  }

  const filteredData = branchData.filter((s) => s.date >= startDate && s.date <= endDate)
  // --- END MODIFIED SECTION ---

  // Populate charts and tables
  if (slimSelectInstance) {
    drawGeneralMenuTrendChart(filteredData, 'premium-product-menu-trend-chart', slimSelectInstance)
  }
  generateChannelDonutChart(filteredData, 'premium-product-channel-chart')
  generateOrderByCategoryDonutChart(filteredData, 'premium-product-category-chart')
  generateTop10MenuTable(filteredData, 'premium-product-top-quantity-container', 'quantity')
  generateTop10MenuTable(filteredData, 'premium-product-top-revenue-container', 'revenue')
}

async function setupPremiumProductChannel() {
  const pageId = 'premium-placeholder-general-produk'
  if ($store.getInitFlag('premiumProductChannelInitialized')) {
    await generatePremiumProductChannel()
    return
  }
  if (!currentUser) return

  // --- Get Filter Elements ---
  const branchSelect = document.getElementById('premium-product-branch-select') as HTMLSelectElement
  const rangeSelect = document.getElementById('premium-product-range-select') as HTMLSelectElement
  const periodSelect = document.getElementById('premium-product-period-select') as HTMLSelectElement

  const allSalesData = $store.getAllSalesData()
  const branches = [...new Set(allSalesData.flatMap((s) => s.branches))].sort()
  branchSelect.innerHTML = `<option value="ALL">All Branches</option>` + branches.map((b) => `<option value="${b}">${b}</option>`).join('')

  // --- Setup Menu Multi-Select (before listeners) ---
  const menuSelectElement = document.getElementById('premium-product-menu-select') as HTMLSelectElement
  const allMenuItems = [...new Set(allSalesData.flatMap((s) => Object.keys(s.menuItemQuantities || {}).flatMap((cat) => Object.keys(s.menuItemQuantities[cat]))))].sort()
  menuSelectElement.innerHTML = allMenuItems.map((name) => `<option value="${name}">${name}</option>`).join('')

  const slimSelectInstance = new SlimSelect({
    select: '#premium-product-menu-select',
    events: { afterChange: () => generatePremiumProductChannel() },
  })
  $store.setUIComponent('premiumProductMenuSelect', slimSelectInstance)

  const updatePeriodSelector = () => {
    const range = rangeSelect.value
    const selectedBranch = branchSelect.value
    let branchData = allSalesData
    if (selectedBranch !== 'ALL') {
      branchData = allSalesData.filter((s) => s.branches.includes(selectedBranch))
    }
    const allDates = branchData.map((s) => s.date)

    if (allDates.length === 0) {
      periodSelect.innerHTML = '<option>No data available</option>'
      generatePremiumProductChannel()
      return
    }

    const periods = new Set<string>()

    if (range === 'yearly') { allDates.forEach((d) => periods.add(String(d.getFullYear()))) } else if (range === 'monthly') { allDates.forEach((d) => periods.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)) } else if (range === 'quarterly') { allDates.forEach((d) => { const q = Math.floor(d.getMonth() / 3) + 1; periods.add(`${d.getFullYear()}-Q${q}`) }) } else if (range === 'weekly') {
      const getMonday = (d: Date) => {
        const date = new Date(d)
        const day = date.getDay()
        const diff = date.getDate() - day + (day === 0 ? -6 : 1)
        return new Date(date.setDate(diff))
      }
      allDates.forEach((d) => {
        const monday = getMonday(d)
        const weekKey = `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`
        periods.add(weekKey)
      })
    }

    const sortedPeriods = Array.from(periods).sort((a, b) => b.localeCompare(a))
    if (sortedPeriods.length === 0) {
      periodSelect.innerHTML = '<option>No data for this range</option>'
      generatePremiumProductChannel()
      return
    }

    const optionsHtml = sortedPeriods.map((p) => {
      if (range === 'yearly') return `<option value="${p}">${p}</option>`
      if (range === 'monthly') {
        const [year, month] = p.split('-')
        const label = new Date(parseInt(year), parseInt(month) - 1).toLocaleString('default', { month: 'long', year: 'numeric' })
        return `<option value="${p}">${label}</option>`
      }
      if (range === 'quarterly') {
        return `<option value="${p}">${p.replace('-Q', ' Q')}</option>`
      }
      if (range === 'weekly') {
        const [year, month, day] = p.split('-')
        const mondayDate = new Date(parseInt(year), parseInt(month) - 1, parseInt(day))
        const label = `Week of ${mondayDate.toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })}`
        return `<option value="${p}">${label}</option>`
      }
      return ''
    }).join('')
    periodSelect.innerHTML = optionsHtml

    // --- START: CORRECTED LOGIC FOR DEFAULT SELECTION ---
    const initialPeriod = sortedPeriods[0]
    let initialFilteredData: any[] = []
    if (initialPeriod) {
      let startDate: Date, endDate: Date
      const [year, part, dayPart] = initialPeriod.split('-')

      switch (range) {
        case 'yearly':
          startDate = new Date(parseInt(year), 0, 1)
          endDate = new Date(parseInt(year), 11, 31, 23, 59, 59)
          break
        case 'quarterly':
          const quarter = parseInt(part.replace('Q', ''))
          const startMonth = (quarter - 1) * 3
          startDate = new Date(parseInt(year), startMonth, 1)
          endDate = new Date(parseInt(year), startMonth + 3, 0, 23, 59, 59)
          break
        case 'monthly':
          startDate = new Date(parseInt(year), parseInt(part) - 1, 1)
          endDate = new Date(parseInt(year), parseInt(part), 0, 23, 59, 59)
          break
        case 'weekly':
          startDate = new Date(parseInt(year), parseInt(part) - 1, parseInt(dayPart))
          endDate = new Date(startDate)
          endDate.setDate(startDate.getDate() + 6)
          endDate.setHours(23, 59, 59)
          break
      }
      initialFilteredData = branchData.filter((s) => s.date >= startDate && s.date <= endDate)
    }

    const menuQuantities = new Map<string, number>()
    initialFilteredData.forEach((summary) => {
      if (!summary.menuItemQuantities) return
      for (const category in summary.menuItemQuantities) {
        for (const itemName in summary.menuItemQuantities[category]) {
          const quantity = summary.menuItemQuantities[category][itemName]
          menuQuantities.set(itemName, (menuQuantities.get(itemName) || 0) + quantity)
        }
      }
    })

    const top3MenuNames = Array.from(menuQuantities.entries())
      .sort(([, qtyA], [, qtyB]) => qtyB - qtyA)
      .slice(0, 3)
      .map(([name]) => name)

    slimSelectInstance.setSelected(top3MenuNames)
    // --- END: CORRECTED LOGIC ---
  }

  // Attach event listeners
  branchSelect.addEventListener('change', updatePeriodSelector)
  rangeSelect.addEventListener('change', updatePeriodSelector)
  periodSelect.addEventListener('change', generatePremiumProductChannel)

  // Initialize AI summary and set flag
  setupPageSummary({ pageId, analyzeUsingAI: getGeminiAnalysis })
  $store.setInitFlag('premiumProductChannelInitialized', true)
  updatePeriodSelector() // Initial population and default selection
}

// Add these two new functions to src/analysis/premium/orchestrator.ts

async function generatePremiumTimeFinance() {
  if (!currentUser) return
  const branchSelect = document.getElementById('premium-time-finance-branch-select') as HTMLSelectElement
  const periodASelect = document.getElementById('premium-time-finance-period-a-select') as HTMLSelectElement
  const periodBSelect = document.getElementById('premium-time-finance-period-b-select') as HTMLSelectElement

  const selectedBranch = branchSelect.value
  const periodA = periodASelect.value
  const periodB = periodBSelect.value

  if (!selectedBranch || !periodA || !periodB) return

  showLoading({ message: 'Fetching P&L data for comparison...', value: 30 })

  const pnlReportsRef = collection(db, `users/${currentUser.uid}/pnlReports`)
  const reportsSnap = await getDocs(pnlReportsRef)
  const allReports = reportsSnap.docs.map((doc) => doc.data())

  const findReport = (period: string, branch: string) => allReports.find((r) => r.period === period && r.branchName === branch)

  const reportA = findReport(periodA, selectedBranch)
  const reportB = findReport(periodB, selectedBranch)

  // Populate the view
  generatePnlComparisonTable(reportA, reportB, 'premium-time-finance-pnl-comparison-container')
  generateRatioComparisonChart(reportA, reportB, { canvasId: 'premium-time-finance-cogs-chart', metric: 'Harga Pokok Produksi', title: 'COGS' })
  generateRatioComparisonChart(reportA, reportB, { canvasId: 'premium-time-finance-gpm-chart', metric: 'Laba Kotor (Gross Profit)', title: 'Gross Profit' })
  generatePremiumSubCategoryComparisonChart(reportA, reportB, { canvasId: 'premium-time-finance-wages-chart', mainCategory: 'Beban Operasional (OPEX)', subCategory: 'Wages', title: 'Wages' })
  generatePremiumSubCategoryComparisonChart(reportA, reportB, { canvasId: 'premium-time-finance-rent-chart', mainCategory: 'Beban Operasional (OPEX)', subCategory: 'Rent', title: 'Rent' })
  generatePremiumSubCategoryComparisonChart(reportA, reportB, { canvasId: 'premium-time-finance-advertising-chart', mainCategory: 'Beban Non Operasional', subCategory: 'Advertising', title: 'Advertising' })
  generateRatioComparisonChart(reportA, reportB, { canvasId: 'premium-time-finance-npm-chart', metric: 'Pendapatan Bersih (Net Income)', title: 'Net Income' })

  hideLoading()
}

async function setupPremiumTimeFinance() {
  const pageId = 'premium-placeholder-waktu-keuangan'
  if ($store.getInitFlag('premiumTimeFinanceInitialized')) {
    await generatePremiumTimeFinance()
    return
  }
  if (!currentUser) return

  const branchSelect = document.getElementById('premium-time-finance-branch-select') as HTMLSelectElement
  const periodASelect = document.getElementById('premium-time-finance-period-a-select') as HTMLSelectElement
  const periodBSelect = document.getElementById('premium-time-finance-period-b-select') as HTMLSelectElement

  const reportsRef = collection(db, `users/${currentUser.uid}/pnlReports`)
  const reportsSnap = await getDocs(reportsRef)
  const allReports = reportsSnap.docs.map((doc) => doc.data())
  const branches = [...new Set(allReports.map((report) => report.branchName))].sort()

  if (branches.length === 0) {
    branchSelect.innerHTML = '<option>No P&L data found</option>'
    return
  }
  branchSelect.innerHTML = branches.map((b) => `<option value="${b}">${b}</option>`).join('')

  const updatePeriodSelectors = async () => {
    const selectedBranch = branchSelect.value
    const periods = [...new Set(allReports.filter((r) => r.branchName === selectedBranch).map((r) => r.period))].sort().reverse()

    if (periods.length < 2) {
      periodASelect.innerHTML = '<option>Not enough data</option>'
      periodBSelect.innerHTML = '<option>Not enough data</option>'
      return
    }

    const optionsHtml = periods.map((p) => {
      const label = new Date(p + '-02').toLocaleString('default', { month: 'long', year: 'numeric' })
      return `<option value="${p}">${label}</option>`
    }).join('')

    periodASelect.innerHTML = optionsHtml
    periodBSelect.innerHTML = optionsHtml
    periodASelect.value = periods[1] || periods[0]
    periodBSelect.value = periods[0]

    await generatePremiumTimeFinance()
  }

  branchSelect.addEventListener('change', updatePeriodSelectors)
  periodASelect.addEventListener('change', generatePremiumTimeFinance)
  periodBSelect.addEventListener('change', generatePremiumTimeFinance)

  setupPageSummary({ pageId, analyzeUsingAI: getGeminiAnalysis })
  $store.setInitFlag('premiumTimeFinanceInitialized', true)
  await updatePeriodSelectors()
}

// Add these two new functions to src/analysis/premium/orchestrator.ts

async function generatePremiumTimeSales() {
  if (!currentUser) return

  const branchSelect = document.getElementById('premium-time-sales-branch-select') as HTMLSelectElement
  const rangeSelect = document.getElementById('premium-time-sales-range-select') as HTMLSelectElement
  const periodASelect = document.getElementById('premium-time-sales-period-a-select') as HTMLSelectElement
  const periodBSelect = document.getElementById('premium-time-sales-period-b-select') as HTMLSelectElement

  const selectedBranch = branchSelect.value
  const selectedRange = rangeSelect.value
  const periodA = periodASelect.value
  const periodB = periodBSelect.value

  if (!selectedBranch || !selectedRange || !periodA || !periodB) return

  // --- Filter Data for Both Periods ---
  const allSalesData = $store.getAllSalesData()
  let branchData = allSalesData
  if (selectedBranch !== 'ALL') {
    branchData = allSalesData.filter((s) => s.branches.includes(selectedBranch))
  }

  const parsePeriod = (period: string, range: string) => {
    const [year, part, dayPart] = period.split('-')
    let startDate: Date, endDate: Date
    // ... (insert the full date parsing logic from previous steps)
    switch (range) {
      case 'yearly': startDate = new Date(parseInt(year), 0, 1); endDate = new Date(parseInt(year), 11, 31, 23, 59, 59); break
      case 'quarterly': const q = parseInt(part.replace('Q', '')); const sm = (q - 1) * 3; startDate = new Date(parseInt(year), sm, 1); endDate = new Date(parseInt(year), sm + 3, 0, 23, 59, 59); break
      case 'monthly': startDate = new Date(parseInt(year), parseInt(part) - 1, 1); endDate = new Date(parseInt(year), parseInt(part), 0, 23, 59, 59); break
      case 'weekly': startDate = new Date(parseInt(year), parseInt(part) - 1, parseInt(dayPart)); endDate = new Date(startDate); endDate.setDate(startDate.getDate() + 6); endDate.setHours(23, 59, 59); break
      default: startDate = new Date(); endDate = new Date()
    }
    return { startDate, endDate }
  }

  const rangeA = parsePeriod(periodA, selectedRange)
  const rangeB = parsePeriod(periodB, selectedRange)

  const periodAData = branchData.filter((s) => s.date >= rangeA.startDate && s.date <= rangeA.endDate)
  const periodBData = branchData.filter((s) => s.date >= rangeB.startDate && s.date <= rangeB.endDate)

  // Update UI
  populateTimeComparisonKPIs(periodAData, periodBData)
  generatePremiumTimeComparisonChart(periodAData, periodBData, selectedRange, 'premium-time-sales-omzet-chart', 'totalOmzet')
  generatePremiumTimeComparisonChart(periodAData, periodBData, selectedRange, 'premium-time-sales-tc-apc-chart', 'apc') // Simplified to just show APC for comparison
  generateOmzetHeatmapFromSummaries(periodBData, 'premium-time-sales-heatmap-container') // Show heatmap for the more recent period (B)
}

async function setupPremiumTimeSales() {
  const pageId = 'premium-placeholder-waktu-penjualan'
  if ($store.getInitFlag('premiumTimeSalesInitialized')) {
    await generatePremiumTimeSales()
    return
  }
  if (!currentUser) return

  const branchSelect = document.getElementById('premium-time-sales-branch-select') as HTMLSelectElement
  const rangeSelect = document.getElementById('premium-time-sales-range-select') as HTMLSelectElement
  const periodASelect = document.getElementById('premium-time-sales-period-a-select') as HTMLSelectElement
  const periodBSelect = document.getElementById('premium-time-sales-period-b-select') as HTMLSelectElement

  const allSalesData = $store.getAllSalesData()
  const branches = [...new Set(allSalesData.flatMap((s) => s.branches))].sort()
  branchSelect.innerHTML = branches.map((b) => `<option value="${b}">${b}</option>`).join('')

  const updatePeriodSelectors = async () => {
    const range = rangeSelect.value
    const selectedBranch = branchSelect.value
    let branchData = allSalesData
    if (selectedBranch !== 'ALL') {
      branchData = allSalesData.filter((s) => s.branches.includes(selectedBranch))
    }
    const allDates = branchData.map((s) => s.date)

    if (allDates.length === 0) {
      periodASelect.innerHTML = '<option>No data available</option>'
      periodBSelect.innerHTML = '<option>No data available</option>'
      return
    }

    const periods = new Set<string>()

    // --- START: This is the corrected logic ---
    if (range === 'yearly') {
      allDates.forEach((d) => periods.add(String(d.getFullYear())))
    } else if (range === 'monthly') {
      allDates.forEach((d) => periods.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`))
    } else if (range === 'quarterly') {
      allDates.forEach((d) => {
        const quarter = Math.floor(d.getMonth() / 3) + 1
        periods.add(`${d.getFullYear()}-Q${quarter}`)
      })
    } else if (range === 'weekly') {
      const getMonday = (d: Date) => {
        const date = new Date(d)
        const day = date.getDay()
        const diff = date.getDate() - day + (day === 0 ? -6 : 1)
        return new Date(date.setDate(diff))
      }
      allDates.forEach((d) => {
        const monday = getMonday(d)
        const weekKey = `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`
        periods.add(weekKey)
      })
    }
    // --- END: This is the corrected logic ---

    const sortedPeriods = Array.from(periods).sort((a, b) => b.localeCompare(a))
    if (sortedPeriods.length < 2) {
      periodASelect.innerHTML = '<option>Not enough data</option>'
      periodBSelect.innerHTML = '<option>Not enough data</option>'
      return
    }

    const optionsHtml = sortedPeriods.map((p) => {
      if (range === 'yearly') {
        return `<option value="${p}">${p}</option>`
      }
      if (range === 'monthly') {
        const [year, month] = p.split('-')
        const label = new Date(parseInt(year), parseInt(month) - 1).toLocaleString('default', { month: 'long', year: 'numeric' })
        return `<option value="${p}">${label}</option>`
      }
      if (range === 'quarterly') {
        return `<option value="${p}">${p.replace('-Q', ' Q')}</option>`
      }
      if (range === 'weekly') {
        const [year, month, day] = p.split('-')
        const mondayDate = new Date(parseInt(year), parseInt(month) - 1, parseInt(day))
        const label = `Week of ${mondayDate.toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })}`
        return `<option value="${p}">${label}</option>`
      }
      return ''
    }).join('')

    periodASelect.innerHTML = optionsHtml
    periodBSelect.innerHTML = optionsHtml
    periodASelect.value = sortedPeriods[1] || sortedPeriods[0]
    periodBSelect.value = sortedPeriods[0]

    await generatePremiumTimeSales()
  }

  branchSelect.addEventListener('change', updatePeriodSelectors)
  rangeSelect.addEventListener('change', updatePeriodSelectors)
  periodASelect.addEventListener('change', generatePremiumTimeSales)
  periodBSelect.addEventListener('change', generatePremiumTimeSales)

  setupPageSummary({ pageId, analyzeUsingAI: getGeminiAnalysis })
  $store.setInitFlag('premiumTimeSalesInitialized', true)
  await updatePeriodSelectors()
}

// Add these two new functions to src/analysis/premium/orchestrator.ts

async function generatePremiumTimeProductChannel() {
  if (!currentUser) return

  const branchSelect = document.getElementById('premium-time-product-branch-select') as HTMLSelectElement
  const rangeSelect = document.getElementById('premium-time-product-range-select') as HTMLSelectElement
  const periodASelect = document.getElementById('premium-time-product-period-a-select') as HTMLSelectElement
  const periodBSelect = document.getElementById('premium-time-product-period-b-select') as HTMLSelectElement
  const slimSelectInstance = $store.getUIComponent('premiumTimeProductMenuSelect')

  const selectedBranch = branchSelect.value
  const selectedRange = rangeSelect.value
  const periodA = periodASelect.value
  const periodB = periodBSelect.value

  if (!selectedBranch || !selectedRange || !periodA || !periodB) return

  const allSalesData = $store.getAllSalesData()
  let branchData = allSalesData
  if (selectedBranch !== 'ALL') {
    branchData = allSalesData.filter((s) => s.branches.includes(selectedBranch))
  }

  const parsePeriod = (period: string, range: string) => {
    const [year, part, dayPart] = period.split('-')
    let startDate: Date, endDate: Date
    switch (range) {
      case 'yearly': startDate = new Date(parseInt(year), 0, 1); endDate = new Date(parseInt(year), 11, 31, 23, 59, 59); break
      case 'quarterly': const q = parseInt(part.replace('Q', '')); const sm = (q - 1) * 3; startDate = new Date(parseInt(year), sm, 1); endDate = new Date(parseInt(year), sm + 3, 0, 23, 59, 59); break
      case 'monthly': startDate = new Date(parseInt(year), parseInt(part) - 1, 1); endDate = new Date(parseInt(year), parseInt(part), 0, 23, 59, 59); break
      case 'weekly': startDate = new Date(parseInt(year), parseInt(part) - 1, parseInt(dayPart)); endDate = new Date(startDate); endDate.setDate(startDate.getDate() + 6); endDate.setHours(23, 59, 59); break
      default: startDate = new Date(); endDate = new Date()
    }
    return { startDate, endDate }
  }

  const rangeA = parsePeriod(periodA, selectedRange)
  const rangeB = parsePeriod(periodB, selectedRange)

  const periodAData = branchData.filter((s) => s.date >= rangeA.startDate && s.date <= rangeA.endDate)
  const periodBData = branchData.filter((s) => s.date >= rangeB.startDate && s.date <= rangeB.endDate)

  if (slimSelectInstance) {
    generatePremiumMenuTrendComparisonChart(periodAData, periodBData, selectedRange, 'premium-time-product-menu-trend-chart', slimSelectInstance.getSelected())
  }
  generateChannelComparisonChart(periodAData, periodBData, 'premium-time-product-channel-chart')
  generateCategoryComparisonChart(periodAData, periodBData, 'premium-time-product-category-chart')
  generateTop10ComparisonTable(periodAData, periodBData, 'premium-time-product-top-quantity-container', 'quantity')
  generateTop10ComparisonTable(periodAData, periodBData, 'premium-time-product-top-revenue-container', 'revenue')
}

async function setupPremiumTimeProductChannel() {
  const pageId = 'premium-placeholder-waktu-produk'
  if ($store.getInitFlag('premiumTimeProductInitialized')) {
    await generatePremiumTimeProductChannel()
    return
  }
  if (!currentUser) return

  // --- Setup Filters ---
  const branchSelect = document.getElementById('premium-time-product-branch-select') as HTMLSelectElement
  const rangeSelect = document.getElementById('premium-time-product-range-select') as HTMLSelectElement
  const periodASelect = document.getElementById('premium-time-product-period-a-select') as HTMLSelectElement
  const periodBSelect = document.getElementById('premium-time-product-period-b-select') as HTMLSelectElement

  const allSalesData = $store.getAllSalesData()
  const branches = [...new Set(allSalesData.flatMap((s) => s.branches))].sort()
  branchSelect.innerHTML = branches.map((b) => `<option value="${b}">${b}</option>`).join('')

  const updatePeriodSelectors = async () => {
    const range = rangeSelect.value
    const selectedBranch = branchSelect.value
    let branchData = allSalesData
    if (selectedBranch !== 'ALL') {
      branchData = allSalesData.filter((s) => s.branches.includes(selectedBranch))
    }

    const allDates = branchData.map((s) => new Date(s.date))

    if (allDates.length === 0) {
      periodASelect.innerHTML = '<option>No data available</option>'
      periodBSelect.innerHTML = '<option>No data available</option>'
      return
    }

    const periods = new Set<string>()

    if (range === 'yearly') {
      allDates.forEach((d) => { if (!isNaN(d.getTime())) periods.add(String(d.getFullYear())) })
    } else if (range === 'monthly') {
      allDates.forEach((d) => { if (!isNaN(d.getTime())) periods.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`) })
    } else if (range === 'quarterly') {
      allDates.forEach((d) => {
        if (isNaN(d.getTime())) return
        const quarter = Math.floor(d.getMonth() / 3) + 1
        periods.add(`${d.getFullYear()}-Q${quarter}`)
      })
    } else if (range === 'weekly') {
      const getMonday = (d: Date) => {
        const date = new Date(d)
        const day = date.getDay()
        const diff = date.getDate() - day + (day === 0 ? -6 : 1)
        return new Date(date.setDate(diff))
      }
      allDates.forEach((d) => {
        if (isNaN(d.getTime())) return
        const monday = getMonday(d)
        const weekKey = `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`
        periods.add(weekKey)
      })
    }

    const sortedPeriods = Array.from(periods).sort((a, b) => b.localeCompare(a))
    if (sortedPeriods.length < 2) {
      periodASelect.innerHTML = '<option>Not enough data</option>'
      periodBSelect.innerHTML = '<option>Not enough data</option>'
      return
    }

    const optionsHtml = sortedPeriods.map((p) => {
      if (range === 'yearly') return `<option value="${p}">${p}</option>`
      if (range === 'monthly') {
        const [year, month] = p.split('-')
        const label = new Date(parseInt(year), parseInt(month) - 1).toLocaleString('default', { month: 'long', year: 'numeric' })
        return `<option value="${p}">${label}</option>`
      }
      if (range === 'quarterly') return `<option value="${p}">${p.replace('-Q', ' Q')}</option>`
      if (range === 'weekly') {
        const [year, month, day] = p.split('-')
        const mondayDate = new Date(parseInt(year), parseInt(month) - 1, parseInt(day))
        const label = `Week of ${mondayDate.toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })}`
        return `<option value="${p}">${label}</option>`
      }
      return ''
    }).join('')

    periodASelect.innerHTML = optionsHtml
    periodBSelect.innerHTML = optionsHtml
    periodASelect.value = sortedPeriods[1] || sortedPeriods[0]
    periodBSelect.value = sortedPeriods[0]

    // --- Logic to find and set the Top 3 Menu Items by default ---
    const initialPeriodB = sortedPeriods[0]
    let initialDataB: any[] = []
    if (initialPeriodB) {
      const parsePeriod = (period: string, range: string) => { const [year, part, dayPart] = period.split('-'); let startDate: Date, endDate: Date; switch (range) { case 'yearly': startDate = new Date(parseInt(year), 0, 1); endDate = new Date(parseInt(year), 11, 31, 23, 59, 59); break; case 'quarterly': const q = parseInt(part.replace('Q', '')); const sm = (q - 1) * 3; startDate = new Date(parseInt(year), sm, 1); endDate = new Date(parseInt(year), sm + 3, 0, 23, 59, 59); break; case 'monthly': startDate = new Date(parseInt(year), parseInt(part) - 1, 1); endDate = new Date(parseInt(year), parseInt(part), 0, 23, 59, 59); break; case 'weekly': startDate = new Date(parseInt(year), parseInt(part) - 1, parseInt(dayPart)); endDate = new Date(startDate); endDate.setDate(startDate.getDate() + 6); endDate.setHours(23, 59, 59); break; default: startDate = new Date(); endDate = new Date() } return { startDate, endDate } }
      const rangeB = parsePeriod(initialPeriodB, range)
      initialDataB = branchData.filter((s) => s.date >= rangeB.startDate && s.date <= rangeB.endDate)
    }

    const menuQuantities = new Map<string, number>()
    initialDataB.forEach((summary) => {
      if (!summary.menuItemQuantities) return
      for (const category in summary.menuItemQuantities) {
        for (const itemName in summary.menuItemQuantities[category]) {
          const quantity = summary.menuItemQuantities[category][itemName]
          menuQuantities.set(itemName, (menuQuantities.get(itemName) || 0) + quantity)
        }
      }
    })

    const top3MenuNames = Array.from(menuQuantities.entries())
      .sort(([, qtyA], [, qtyB]) => qtyB - qtyA)
      .slice(0, 3)
      .map(([name]) => name)

    slimSelectInstance.setSelected(top3MenuNames)
  }

  // --- Setup Menu Multi-Select ---
  const menuSelectElement = document.getElementById('premium-time-product-menu-select') as HTMLSelectElement
  const allMenuItems = [...new Set(allSalesData.flatMap((s) => Object.keys(s.menuItemQuantities || {}).flatMap((cat) => Object.keys(s.menuItemQuantities[cat]))))].sort()
  menuSelectElement.innerHTML = allMenuItems.map((name) => `<option value="${name}">${name}</option>`).join('')

  const slimSelectInstance = new SlimSelect({
    select: '#premium-time-product-menu-select',
    events: { afterChange: () => generatePremiumTimeProductChannel() },
  })
  $store.setUIComponent('premiumTimeProductMenuSelect', slimSelectInstance)

  // Attach listeners
  branchSelect.addEventListener('change', updatePeriodSelectors)
  rangeSelect.addEventListener('change', updatePeriodSelectors)
  periodASelect.addEventListener('change', generatePremiumTimeProductChannel)
  periodBSelect.addEventListener('change', generatePremiumTimeProductChannel)

  setupPageSummary({ pageId, analyzeUsingAI: getGeminiAnalysis })
  $store.setInitFlag('premiumTimeProductInitialized', true)
  await updatePeriodSelectors()
}

// Add these two new functions to src/analysis/premium/orchestrator.ts

async function generatePremiumBranchFinance() {
  if (!currentUser) return

  const periodSelect = document.getElementById('premium-branch-finance-period-select') as HTMLSelectElement
  const branchASelect = document.getElementById('premium-branch-finance-branch-a-select') as HTMLSelectElement
  const branchBSelect = document.getElementById('premium-branch-finance-branch-b-select') as HTMLSelectElement

  const selectedPeriod = periodSelect.value
  const branchA = branchASelect.value
  const branchB = branchBSelect.value

  if (!selectedPeriod || !branchA || !branchB || branchA === branchB) return

  showLoading({ message: 'Comparing P&L data for branches...', value: 30 })

  const pnlReportsRef = collection(db, `users/${currentUser.uid}/pnlReports`)
  const q = query(pnlReportsRef, where('period', '==', selectedPeriod))
  const reportsSnap = await getDocs(q)

  const reportA = reportsSnap.docs.find((doc) => doc.data().branchName === branchA)?.data()
  const reportB = reportsSnap.docs.find((doc) => doc.data().branchName === branchB)?.data()

  generateBranchPnlComparisonTable(reportA, reportB, 'premium-branch-finance-pnl-comparison-container')
  generateBranchRatioComparisonChart(reportA, reportB, { canvasId: 'premium-branch-finance-cogs-chart', metric: 'Harga Pokok Produksi', title: 'COGS' })
  generateBranchRatioComparisonChart(reportA, reportB, { canvasId: 'premium-branch-finance-gpm-chart', metric: 'Laba Kotor (Gross Profit)', title: 'Gross Profit' })
  generatePremiumSubCategoryComparisonChart(reportA, reportB, { canvasId: 'premium-branch-finance-wages-chart', mainCategory: 'Beban Operasional (OPEX)', subCategory: 'Wages', title: 'Wages' })
  generatePremiumSubCategoryComparisonChart(reportA, reportB, { canvasId: 'premium-branch-finance-rent-chart', mainCategory: 'Beban Operasional (OPEX)', subCategory: 'Rent', title: 'Rent' })
  generatePremiumSubCategoryComparisonChart(reportA, reportB, { canvasId: 'premium-branch-finance-advertising-chart', mainCategory: 'Beban Non Operasional', subCategory: 'Advertising', title: 'Advertising' })
  generateBranchRatioComparisonChart(reportA, reportB, { canvasId: 'premium-branch-finance-npm-chart', metric: 'Pendapatan Bersih (Net Income)', title: 'Net Income' })

  hideLoading()
}

async function setupPremiumBranchFinance() {
  const pageId = 'premium-placeholder-cabang-keuangan'
  if ($store.getInitFlag('premiumBranchFinanceInitialized')) {
    await generatePremiumBranchFinance()
    return
  }
  if (!currentUser) return

  const periodSelect = document.getElementById('premium-branch-finance-period-select') as HTMLSelectElement
  const branchASelect = document.getElementById('premium-branch-finance-branch-a-select') as HTMLSelectElement
  const branchBSelect = document.getElementById('premium-branch-finance-branch-b-select') as HTMLSelectElement

  const reportsRef = collection(db, `users/${currentUser.uid}/pnlReports`)
  const reportsSnap = await getDocs(reportsRef)
  const allReports = reportsSnap.docs.map((doc) => doc.data())

  // --- START: MODIFIED LOGIC ---
  // 1. Group all reports by their period
  const reportsByPeriod = allReports.reduce((acc, report) => {
    const period = report.period
    if (!acc[period]) {
      acc[period] = []
    }
    (acc[period] as any[]).push(report)
    return acc
  }, {} as Record<string, any[]>)

  // 2. Filter out periods that have less than 2 branches
  const availablePeriods = Object.keys(reportsByPeriod)
    .filter((period) => {
      const branchesInPeriod = new Set(reportsByPeriod[period].map((r) => r.branchName))
      return branchesInPeriod.size >= 2
    })
    .sort()
    .reverse()
    // --- END: MODIFIED LOGIC ---

  if (availablePeriods.length === 0) {
    periodSelect.innerHTML = '<option>No periods with enough data for comparison</option>'
    branchASelect.innerHTML = ''
    branchBSelect.innerHTML = ''
    return
  }

  periodSelect.innerHTML = availablePeriods.map((p) => {
    const label = new Date(p + '-02').toLocaleString('default', { month: 'long', year: 'numeric' })
    return `<option value="${p}">${label}</option>`
  }).join('')

  const updateBranchSelectors = async () => {
    const selectedPeriod = periodSelect.value
    const branchesForPeriod = [...new Set(allReports.filter((r) => r.period === selectedPeriod).map((r) => r.branchName))].sort()

    if (branchesForPeriod.length < 2) {
      branchASelect.innerHTML = '<option>Not enough branches</option>'
      branchBSelect.innerHTML = '<option>Not enough branches</option>'
      // Clear charts if no comparison is possible
      // (You might want to add a function here to clear the chart area)
      return
    }

    const optionsHtml = branchesForPeriod.map((b) => `<option value="${b}">${b}</option>`).join('')
    branchASelect.innerHTML = optionsHtml
    branchBSelect.innerHTML = optionsHtml

    branchASelect.value = branchesForPeriod[0]
    branchBSelect.value = branchesForPeriod[1]

    await generatePremiumBranchFinance()
  }

  periodSelect.addEventListener('change', updateBranchSelectors)
  branchASelect.addEventListener('change', generatePremiumBranchFinance)
  branchBSelect.addEventListener('change', generatePremiumBranchFinance)

  setupPageSummary({ pageId, analyzeUsingAI: getGeminiAnalysis })
  $store.setInitFlag('premiumBranchFinanceInitialized', true)
  await updateBranchSelectors()
}

// Add these two new functions to src/analysis/premium/orchestrator.ts

async function generatePremiumBranchSales() {
  if (!currentUser) return

  const periodSelect = document.getElementById('premium-branch-sales-period-select') as HTMLSelectElement
  const branchASelect = document.getElementById('premium-branch-sales-branch-a-select') as HTMLSelectElement
  const branchBSelect = document.getElementById('premium-branch-sales-branch-b-select') as HTMLSelectElement

  const selectedPeriod = periodSelect.value
  const branchA = branchASelect.value
  const branchB = branchBSelect.value

  if (!selectedPeriod || !branchA || !branchB || branchA === branchB) return

  const allSalesData = $store.getAllSalesData()
  const periodData = allSalesData.filter((s) => s.date.toISOString().startsWith(selectedPeriod))

  if (periodData.length === 0) return

  populateBranchComparisonKPIs(periodData, branchA, branchB)
  generatePremiumBranchComparisonChart(periodData, branchA, branchB, 'premium-branch-sales-omzet-chart', 'totalOmzet')
  generatePremiumBranchComparisonChart(periodData, branchA, branchB, 'premium-branch-sales-tc-apc-chart', 'apc')
}

async function setupPremiumBranchSales() {
  const pageId = 'premium-placeholder-cabang-penjualan'
  if ($store.getInitFlag('premiumBranchSalesInitialized')) {
    await generatePremiumBranchSales()
    return
  }
  if (!currentUser) return

  const periodSelect = document.getElementById('premium-branch-sales-period-select') as HTMLSelectElement
  const branchASelect = document.getElementById('premium-branch-sales-branch-a-select') as HTMLSelectElement
  const branchBSelect = document.getElementById('premium-branch-sales-branch-b-select') as HTMLSelectElement

  const allSalesData = $store.getAllSalesData()

  const periodsWithMultipleBranches = Object.entries(
    allSalesData.reduce((acc, s) => {
      const period = s.date.toISOString().slice(0, 7)
      if (!acc[period]) acc[period] = new Set()
      s.branches.forEach((b) => acc[period].add(b))
      return acc
    }, {} as Record<string, Set<string>>),
  ).filter(([, branches]) => branches.size >= 2).map(([period]) => period)

  const sortedPeriods = periodsWithMultipleBranches.sort().reverse()

  if (sortedPeriods.length === 0) {
    periodSelect.innerHTML = '<option>No periods with enough data</option>'
    return
  }

  periodSelect.innerHTML = sortedPeriods.map((p) => {
    const [year, month] = p.split('-')
    const label = new Date(parseInt(year), parseInt(month) - 1).toLocaleString('default', { month: 'long', year: 'numeric' })
    return `<option value="${p}">${label}</option>`
  }).join('')

  const updateBranchSelectors = async () => {
    const selectedPeriod = periodSelect.value
    const branchesForPeriod = [...new Set(allSalesData.filter((s) => s.date.toISOString().startsWith(selectedPeriod)).flatMap((s) => s.branches))].sort()

    if (branchesForPeriod.length < 2) {
      branchASelect.innerHTML = '<option>Not enough branches</option>'
      branchBSelect.innerHTML = '<option>Not enough branches</option>'
      return
    }

    const optionsHtml = branchesForPeriod.map((b) => `<option value="${b}">${b}</option>`).join('')
    branchASelect.innerHTML = optionsHtml
    branchBSelect.innerHTML = optionsHtml
    branchASelect.value = branchesForPeriod[0]
    branchBSelect.value = branchesForPeriod[1]

    await generatePremiumBranchSales()
  }

  periodSelect.addEventListener('change', updateBranchSelectors)
  branchASelect.addEventListener('change', generatePremiumBranchSales)
  branchBSelect.addEventListener('change', generatePremiumBranchSales)

  setupPageSummary({ pageId, analyzeUsingAI: getGeminiAnalysis })
  $store.setInitFlag('premiumBranchSalesInitialized', true)
  await updateBranchSelectors()
}

// Add these two new functions to src/analysis/premium/orchestrator.ts

async function generatePremiumBranchProductChannel() {
  if (!currentUser) return

  const periodSelect = document.getElementById('premium-branch-product-period-select') as HTMLSelectElement
  const branchASelect = document.getElementById('premium-branch-product-branch-a-select') as HTMLSelectElement
  const branchBSelect = document.getElementById('premium-branch-product-branch-b-select') as HTMLSelectElement
  const slimSelectInstance = $store.getUIComponent('premiumBranchProductMenuSelect')

  const selectedPeriod = periodSelect.value
  const branchA = branchASelect.value
  const branchB = branchBSelect.value

  if (!selectedPeriod || !branchA || !branchB || branchA === branchB) return

  const allSalesData = $store.getAllSalesData()
  const periodData = allSalesData.filter((s) => s.date.toISOString().startsWith(selectedPeriod))
  const branchAData = periodData.filter((s) => s.branches.includes(branchA))
  const branchBData = periodData.filter((s) => s.branches.includes(branchB))

  // Populate charts and tables
  if (slimSelectInstance) {
    drawBranchMenuTrendChart(periodData, branchA, branchB, 'premium-branch-product-menu-trend-chart', slimSelectInstance)
  }
  generateBranchChannelComparisonChart(periodData, branchA, branchB, 'premium-branch-product-channel-chart')
  generateCategoryComparisonChart(branchAData, branchBData, 'premium-branch-product-category-chart')
  generateTop10ComparisonTable(branchAData, branchBData, 'premium-branch-product-top-quantity-container', 'quantity')
  generateTop10ComparisonTable(branchAData, branchBData, 'premium-branch-product-top-revenue-container', 'revenue')
}

async function setupPremiumBranchProductChannel() {
  const pageId = 'premium-placeholder-cabang-produk'
  if ($store.getInitFlag('premiumBranchProductInitialized')) {
    await generatePremiumBranchProductChannel()
    return
  }
  if (!currentUser) return

  const periodSelect = document.getElementById('premium-branch-product-period-select') as HTMLSelectElement
  const branchASelect = document.getElementById('premium-branch-product-branch-a-select') as HTMLSelectElement
  const branchBSelect = document.getElementById('premium-branch-product-branch-b-select') as HTMLSelectElement

  const allSalesData = $store.getAllSalesData()

  const menuSelectElement = document.getElementById('premium-branch-product-menu-select') as HTMLSelectElement
  const allMenuItems = [...new Set(allSalesData.flatMap((s) => Object.keys(s.menuItemQuantities || {}).flatMap((cat) => Object.keys(s.menuItemQuantities[cat]))))].sort()
  menuSelectElement.innerHTML = allMenuItems.map((name) => `<option value="${name}">${name}</option>`).join('')

  const slimSelectInstance = new SlimSelect({
    select: '#premium-branch-product-menu-select',
    events: { afterChange: () => generatePremiumBranchProductChannel() },
  })
  $store.setUIComponent('premiumBranchProductMenuSelect', slimSelectInstance)

  const updateBranchSelectors = async () => {
    const selectedPeriod = periodSelect.value
    const branchesForPeriod = [...new Set(allSalesData.filter((s) => s.date.toISOString().startsWith(selectedPeriod)).flatMap((s) => s.branches))].sort()

    if (branchesForPeriod.length < 2) {
      branchASelect.innerHTML = '<option>Not enough branches</option>'
      branchBSelect.innerHTML = '<option>Not enough branches</option>'
      return
    }

    const optionsHtml = branchesForPeriod.map((b) => `<option value="${b}">${b}</option>`).join('')
    branchASelect.innerHTML = optionsHtml
    branchBSelect.innerHTML = optionsHtml

    const initialBranchA = branchesForPeriod[0]
    const initialBranchB = branchesForPeriod[1]
    branchASelect.value = initialBranchA
    branchBSelect.value = initialBranchB

    const periodData = allSalesData.filter((s) => s.date.toISOString().startsWith(selectedPeriod))
    const branchAData = periodData.filter((s) => s.branches.includes(initialBranchA))

    const menuQuantities = new Map<string, number>()
    branchAData.forEach((summary) => {
      if (!summary.menuItemQuantities) return
      for (const category in summary.menuItemQuantities) {
        for (const itemName in summary.menuItemQuantities[category]) {
          const quantity = summary.menuItemQuantities[category][itemName]
          menuQuantities.set(itemName, (menuQuantities.get(itemName) || 0) + quantity)
        }
      }
    })

    const top3MenuNames = Array.from(menuQuantities.entries())
      .sort(([, qtyA], [, qtyB]) => qtyB - qtyA)
      .slice(0, 3)
      .map(([name]) => name)

    // --- START MODIFIED SECTION ---
    // Set the default selection WITHOUT triggering the 'afterChange' event.
    slimSelectInstance.setSelected(top3MenuNames, false)

    // Explicitly call the render function to guarantee a refresh.
    await generatePremiumBranchProductChannel()
    // --- END MODIFIED SECTION ---
  }

  const periodsWithMultipleBranches = Object.entries(
    allSalesData.reduce((acc, s) => {
      const period = s.date.toISOString().slice(0, 7)
      if (!acc[period]) acc[period] = new Set()
      s.branches.forEach((b) => acc[period].add(b))
      return acc
    }, {} as Record<string, Set<string>>),
  ).filter(([, branches]) => branches.size >= 2).map(([period]) => period)
  const sortedPeriods = periodsWithMultipleBranches.sort().reverse()

  if (sortedPeriods.length === 0) {
    periodSelect.innerHTML = '<option>No periods with enough data</option>'
    return
  }

  periodSelect.innerHTML = sortedPeriods.map((p) => {
    const [year, month] = p.split('-')
    const label = new Date(parseInt(year), parseInt(month) - 1).toLocaleString('default', { month: 'long', year: 'numeric' })
    return `<option value="${p}">${label}</option>`
  }).join('')

  // Attach listeners
  periodSelect.addEventListener('change', updateBranchSelectors)
  branchASelect.addEventListener('change', generatePremiumBranchProductChannel)
  branchBSelect.addEventListener('change', generatePremiumBranchProductChannel)

  setupPageSummary({ pageId, analyzeUsingAI: getGeminiAnalysis })
  $store.setInitFlag('premiumBranchProductInitialized', true)
  await updateBranchSelectors()
}
