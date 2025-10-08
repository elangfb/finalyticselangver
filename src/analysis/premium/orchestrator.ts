// [NEW FILE] src/analysis/premium/orchestrator.ts

import * as $store from '@/store'
import { generateRingkasanFromSummaries } from '@/analysis/sections/general/sales/ringkasan'
import type { SalesSummary } from '@/analysis/sections/general/sales/types'

import { generateTcApcHarianChartFromSummaries, generateOmzetHarianChartFromSummaries } from '@/analysis/sections/general/sales/charts'
import { generateOmzetHeatmapFromSummaries } from '@/analysis/sections/general/sales/heatmaps'
import { generateOmzetByOutletChart } from './charts'
import { showView } from '@/core/views'

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

/**
 * This function runs once to set up the view's selectors and listeners.
 */
export function setupPremiumAnalysisView() {
  // Prevent re-initialization
  if ($store.getInitFlag('premiumAnalysisInitialized')) {
    // If already initialized, just refresh the data
    generatePremiumAnalysis()
    return
  }

  const branchSelect = document.getElementById('premium-analysis-branch-select') as HTMLSelectElement
  if (!branchSelect) return

  // --- CORRECTED: View Switching Logic ---
  // This selector is now fixed to correctly find the dashboard's main content area.
  const dashboardContent = document.querySelector('#premium-analysis-view main:not(#premium-manage-data-content)');
  const manageDataContent = document.getElementById('premium-manage-data-content');
  const dashboardBtn = document.getElementById('premium-goto-dashboard-btn');
  const manageDataBtn = document.getElementById('premium-goto-manage-data-btn');

  const showDashboard = () => {
    dashboardContent?.classList.remove('hidden');
    manageDataContent?.classList.add('hidden');
    dashboardBtn?.classList.add('bg-gray-100', 'font-semibold');
    manageDataBtn?.classList.remove('bg-gray-100', 'font-semibold');
  };
  
  const showManageData = () => {
    dashboardContent?.classList.add('hidden');
    manageDataContent?.classList.remove('hidden');
    dashboardBtn?.classList.remove('bg-gray-100', 'font-semibold');
    manageDataBtn?.classList.add('bg-gray-100', 'font-semibold');
  };
  
  dashboardBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    showDashboard();
  });

  manageDataBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    showManageData();
  });
  
  document.getElementById('premium-back-to-main-menu-btn')?.addEventListener('click', (e) => {
      e.preventDefault();
      showView('main-menu');
  });
  // --- END CORRECTION ---

  // Populate the branch selector
  const allSalesData: SalesSummary[] = $store.getAllSalesData()
  const branches = [...new Set(allSalesData.flatMap((s) => s.branches))].sort()

  branchSelect.innerHTML = `<option value="ALL">All Branches</option>` + branches.map((b) => `<option value="${b}">${b}</option>`).join('')

  // Add event listener to update data on change
  branchSelect.addEventListener('change', generatePremiumAnalysis)

  // Mark as initialized and run for the first time
  $store.setInitFlag('premiumAnalysisInitialized', true)
  generatePremiumAnalysis()
}
