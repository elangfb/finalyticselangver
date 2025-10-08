// [NEW FILE] src/analysis/premium/orchestrator.ts

import * as $store from '@/store'
import { generateRingkasanFromSummaries } from '@/analysis/sections/general/sales/ringkasan'
import type { SalesSummary } from '@/analysis/sections/general/sales/types'

import { generateTcApcHarianChartFromSummaries, generateOmzetHarianChartFromSummaries } from '@/analysis/sections/general/sales/charts'
import { generateOmzetHeatmapFromSummaries } from '@/analysis/sections/general/sales/heatmaps'
import { generateOmzetByOutletChart } from './charts'
import { showView } from '@/core/views'

import { collection, getDocs } from 'firebase/firestore';
import { db } from '@/core/firebase';
import { currentUser } from '@/core/state';

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
    generatePremiumAnalysis();
    return;
  }

  const branchSelect = document.getElementById('premium-analysis-branch-select') as HTMLSelectElement;
  if (!branchSelect) return;

  const dashboardContent = document.querySelector('#premium-analysis-view main:not(#premium-manage-data-content)');
  const manageDataContent = document.getElementById('premium-manage-data-content');
  const dashboardBtn = document.getElementById('premium-goto-dashboard-btn');
  const manageDataBtn = document.getElementById('premium-goto-manage-data-btn');
  let hasLoadedManageData = false;

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
    // Only fetch and render the data the first time the user clicks the tab
    if (!hasLoadedManageData) {
        renderPremiumManageDataView();
        hasLoadedManageData = true;
    }
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

  const allSalesData: SalesSummary[] = $store.getAllSalesData();
  const branches = [...new Set(allSalesData.flatMap((s) => s.branches))].sort();

  branchSelect.innerHTML = `<option value="ALL">All Branches</option>` + branches.map((b) => `<option value="${b}">${b}</option>`).join('');

  branchSelect.addEventListener('change', generatePremiumAnalysis);

  $store.setInitFlag('premiumAnalysisInitialized', true);
  generatePremiumAnalysis();
}

/**
 * Fetches all user data and renders the "Manage Data" card grid.
 */
async function renderPremiumManageDataView() {
    if (!currentUser) return;
    const gridContainer = document.getElementById('premium-data-cards-grid');
    if (!gridContainer) return;

    gridContainer.innerHTML = '<p class="text-gray-500 col-span-4">Loading compiled data...</p>';

    try {
        const [salesSnap, salesTargetSnap, pnlSnap, pnlTargetSnap] = await Promise.all([
            getDocs(collection(db, `artifacts/sales-app/users/${currentUser.uid}/uploads`)),
            getDocs(collection(db, `users/${currentUser.uid}/monthlySalesTargets`)),
            getDocs(collection(db, `users/${currentUser.uid}/pnlReports`)),
            getDocs(collection(db, `users/${currentUser.uid}/monthlyPnlTargets`)),
        ]);

        const aggregatedData: Record<string, any> = {};

        const processSnap = (snap: any, type: string) => {
            snap.forEach((doc: any) => {
                const data = doc.data();
                const period = data.period || doc.id;
                if (!period || !/^\d{4}-\d{2}$/.test(period)) return;
                const branch = data.branchName || 'Company-Wide';
                const key = `${branch}|${period}`;
                if (!aggregatedData[key]) {
                    aggregatedData[key] = { branch: branch, period: period, count: 0, types: {} };
                }
                aggregatedData[key].types[type] = true;
                aggregatedData[key].count++;
            });
        };

        processSnap(salesSnap, 'Sales Data');
        processSnap(salesTargetSnap, 'Sales Target');
        processSnap(pnlSnap, 'P&L Data');
        processSnap(pnlTargetSnap, 'P&L Target');

        const sortedKeys = Object.keys(aggregatedData).sort((a, b) => {
            const [_branchA, periodA] = a.split('|') as [string, string];
            const [_branchB, periodB] = b.split('|') as [string, string];
            return periodB.localeCompare(periodA);
        });
        
        if (sortedKeys.length === 0) {
            gridContainer.innerHTML = '<p class="text-gray-500 col-span-4">No data found. Upload a file to get started.</p>';
            return;
        }

        gridContainer.innerHTML = sortedKeys.map(key => {
            const item = aggregatedData[key];
            const [year, month] = item.period.split('-');
            const formattedPeriod = new Date(parseInt(year), parseInt(month) - 1, 1).toLocaleString('default', { month: 'long', year: 'numeric' });
            const progress = (item.count / 4) * 100;
            const status = progress === 100 ? 'Complete' : 'In Progress';
            const statusColor = progress === 100 ? 'green' : 'yellow';

            const checkmarkIcon = `<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-green-500" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" /></svg>`;
            const circleIcon = `<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-gray-300" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM7 9a1 1 0 000 2h6a1 1 0 100-2H7z" clip-rule="evenodd" /></svg>`;

            const dataTypes = ['Sales Data', 'Sales Target', 'P&L Data', 'P&L Target'];

            return `
            <div class="bg-white p-4 rounded-lg shadow-md border border-gray-200">
                <div class="flex justify-between items-center mb-2">
                    <span class="text-xs font-semibold bg-${statusColor}-100 text-${statusColor}-800 px-2 py-0.5 rounded-full">${status}</span>
                    <button class="text-gray-400 hover:text-gray-600">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" /></svg>
                    </button>
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
                        ${dataTypes.map(type => `
                            <div class="flex items-center gap-2">${item.types[type] ? checkmarkIcon : circleIcon} ${type}</div>
                        `).join('')}
                    </div>
                </div>
            </div>
            `;
        }).join('');

    } catch (error) {
        console.error("Error populating premium manage data view:", error);
        gridContainer.innerHTML = '<p class="text-red-500 col-span-4">Failed to load data. Please try again.</p>';
    }
}