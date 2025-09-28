// src/analysis/sections/general/finance.ts
// Contains all logic for the "Analisis General > Aspek Keuangan" view.

import { collection, doc, getDoc, getDocs, orderBy, query, where } from 'firebase/firestore';
import { db } from '@/core/firebase';
import { currentUser } from '@/core/state';
import { showLoading, hideLoading } from '@/core/ui';
import * as $store from '@/store';
import { createChart } from '../../helpers';
import { AlsoStoreFn, createAlsoStoreFn, createMaybeAlsoStoreFn } from '../../utils/store-helpers';
import { chartTooltip, mergeChartOptions, shortenCurrency } from '../../utils/chart-formatters';
import { formatCurrency as formatCurrencyUtil, formatDecimalBasedPercentage, formatIntBasedPercentage, formatMachineYearMonth } from '../../utils/string-formatters';
import { deepmerge } from 'deepmerge-ts';
import { showPnlTargetModal } from '../../../data-hub/modals';

/**
 * Calculates all primary and derived P&L metrics from a raw pnlData object.
 * @param pnlData The P&L data object from Firestore.
 * @returns An object with calculated totals for all P&L metrics.
 */
export function calculateAllPnlMetrics(pnlData: any): { [key: string]: number } {
    const results: { [key: string]: number } = {};
    const categoryOrder = ["Pendapatan (Revenue)", "Harga Pokok Produksi", "Beban Operasional (OPEX)", "Beban Non Operasional", "Depresiasi/ Amortisasi", "Bunga", "Pajak (PB1)"];

    categoryOrder.forEach(cat => {
        results[cat] = Object.values(pnlData[cat] || {}).reduce((sum: number, val: any) => sum + val, 0);
    });

    results["Laba Kotor (Gross Profit)"] = (results["Pendapatan (Revenue)"] || 0) - (results["Harga Pokok Produksi"] || 0);
    results["Pendapatan Bersih Operasional (Net Operating Income)"] = results["Laba Kotor (Gross Profit)"] - (results["Beban Operasional (OPEX)"] || 0);
    results["Pendapatan Bersih Sebelum Deprisiasi/Amortisasi, Bunga & Pajak (EBITDA)"] = results["Pendapatan Bersih Operasional (Net Operating Income)"] - (results["Beban Non Operasional"] || 0);
    results["Pendapatan Bersih (Net Income)"] = results["Pendapatan Bersih Sebelum Deprisiasi/Amortisasi, Bunga & Pajak (EBITDA)"] - (results["Depresiasi/ Amortisasi"] || 0) - (results["Bunga"] || 0) - (results["Pajak (PB1)"] || 0);

    return results;
}

/**
 * Generates a P&L Target vs Actual comparison table for a single period.
 */
async function generatePnlTargetComparisonTable(period: string, branch: string, containerId: string, config?: { alsoStore?: AlsoStoreFn }) {
    const container = document.getElementById(containerId);
    if (!container || !currentUser) return;
    container.innerHTML = '<p class="text-gray-500">Loading P&L comparison...</p>';

    const targetId = `${period}_${branch.replace(/\s+/g, '_')}`;
    const reportId = `${period}_${branch.replace(/\s+/g, '_')}`;

    const targetRef = doc(db, `users/${currentUser.uid}/monthlyPnlTargets`, targetId);
    const targetSnap = await getDoc(targetRef);

    if (targetSnap.exists()) {
        await showPnlTargetModal(targetSnap.data(), reportId);
        const modalBody = document.getElementById('pnl-target-modal-body');
        if (modalBody) container.innerHTML = modalBody.innerHTML;
        document.getElementById('pnl-target-modal')?.classList.add('hidden');
    } else {
        container.innerHTML = `
            <div class="text-center p-4 border rounded-lg bg-gray-50">
                <p class="text-gray-500 mb-4">No target data found for this branch and period.</p>
                <button class="upload-compiled-btn bg-indigo-500 text-white text-sm font-bold py-2 px-4 rounded-lg hover:bg-indigo-600" data-period="${period}" data-type="pnlTarget" data-branch="${branch}">
                    Upload P&L Target
                </button>
            </div>`;
    }
}

/**
 * Generates a historical P&L table with expandable rows for sub-categories.
 */
function generateHistoricalPnlTable(reports: any[], theadId: string, tbodyId: string, config?: { alsoStore?: AlsoStoreFn }) {
    const thead = document.getElementById(theadId);
    const tbody = document.getElementById(tbodyId);
    if (!thead || !tbody) return;

    if (reports.length === 0) {
        thead.innerHTML = '';
        tbody.innerHTML = '<tr><td colspan="13" class="p-4 text-center text-gray-500">No P&L reports found for this period.</td></tr>';
        return;
    }

    const periodHeaders = reports.map(r => `<th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">${new Date(r.period + '-02').toLocaleString('default', { month: 'short', year: 'numeric' })}</th>`).join('');
    thead.innerHTML = `<tr><th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Metric</th>${periodHeaders}</tr>`;

    tbody.innerHTML = '';
    const allMetrics = ["Pendapatan (Revenue)", "Harga Pokok Produksi", "Laba Kotor (Gross Profit)", "Beban Operasional (OPEX)", "Pendapatan Bersih Operasional (Net Operating Income)", "Beban Non Operasional", "Pendapatan Bersih Sebelum Deprisiasi/Amortisasi, Bunga & Pajak (EBITDA)", "Depresiasi/ Amortisasi", "Bunga", "Pajak (PB1)", "Pendapatan Bersih (Net Income)"];
    const alsoStore = createMaybeAlsoStoreFn(config?.alsoStore);

    allMetrics.forEach(metricName => {
        const metrics = reports.map(report => calculateAllPnlMetrics(report.pnlData || {}));
        const isSubtotal = !reports[0]?.pnlData?.[metricName];
        const mainRow = document.createElement('tr');
        let mainRowHtml = '';

        if (!isSubtotal) {
            mainRow.className = 'pnl-main-category bg-gray-50 hover:bg-gray-100 cursor-pointer';
            const sanitizedMetricName = metricName.replace(/[^a-zA-Z0-9]/g, '');
            mainRow.dataset.target = `sub-items-of-${sanitizedMetricName}`;
            mainRowHtml += `<td class="px-6 py-4 whitespace-nowrap text-sm text-gray-700 font-semibold"><div class="flex items-center">${metricName}<svg class="w-4 h-4 ml-2 transform transition-transform chevron-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg></div></td>`;
        } else {
            mainRow.className = 'bg-white font-bold';
            mainRowHtml += `<td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${metricName}</td>`;
        }

        metrics.forEach((metricSet, index) => {
            const value = metricSet[metricName] || 0;
            alsoStore(value, (v) => ({ historicalPnl: { [formatMachineYearMonth(reports[index].period)]: { [metricName]: formatCurrencyUtil(v) } } }));
            mainRowHtml += `<td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-right font-mono">${shortenCurrency(value)}</td>`;
        });
        mainRow.innerHTML = mainRowHtml;
        tbody.appendChild(mainRow);

        if (!isSubtotal) {
            const sanitizedMetricName = metricName.replace(/[^a-zA-Z0-9]/g, '');
            const allSubKeys = new Set(reports.flatMap(r => Object.keys(r.pnlData?.[metricName] || {})));
            allSubKeys.forEach(subKey => {
                const subRow = document.createElement('tr');
                subRow.className = `pnl-sub-category sub-items-of-${sanitizedMetricName} hidden`;
                let subRowHtml = `<td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600 pl-8">${subKey}</td>`;
                reports.forEach(report => {
                    const subValue = report.pnlData?.[metricName]?.[subKey] || 0;
                    alsoStore(subValue, (v) => ({ historicalPnl: { [formatMachineYearMonth(report.period)]: { [metricName]: { [subKey]: formatCurrencyUtil(v) } } } }));
                    subRowHtml += `<td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-right font-mono">${shortenCurrency(subValue)}</td>`;
                });
                subRow.innerHTML = subRowHtml;
                tbody.appendChild(subRow);
            });
        }
    });
}

/**
 * Initializes the accordion-style expand/collapse functionality for the historical P&L table.
 */
export function initializePnlAccordionListener(): void {
    document.getElementById('general-pnl-history-tbody')?.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        const headerRow = target.closest('.pnl-main-category');
        if (headerRow) {
            const targetClass = (headerRow as HTMLElement).dataset.target;
            if (!targetClass) return;
            const subRows = document.querySelectorAll(`.${targetClass}`);
            const chevron = headerRow.querySelector('.chevron-icon');
            subRows.forEach(row => row.classList.toggle('hidden'));
            chevron?.classList.toggle('rotate-180');
        }
    });
}

/**
 * Generates a stacked bar chart with Omset, Expense, and Profit stacked in that order.
 */
function generatePnlOverviewChart(reports: any[], config?: { alsoStore?: AlsoStoreFn }) {
    const labels = reports.map(r => new Date(r.period + '-02').toLocaleString('default', { month: 'short', year: 'numeric' }));
    const revenueData: number[] = [];
    const expenseData: number[] = [];
    const profitData: number[] = [];

    reports.forEach(r => {
        const pnlData = r.pnlData;
        const allMetrics = calculateAllPnlMetrics(pnlData);

        const revenue = allMetrics["Pendapatan (Revenue)"] || 0;
        const profit = allMetrics["Pendapatan Bersih (Net Income)"] || 0;

        // FIX: Expense is now correctly calculated as everything that is not Net Profit.
        // This includes COGS, OPEX, Tax, etc.
        const expense = revenue - profit;

        revenueData.push(revenue);
        expenseData.push(expense);
        profitData.push(profit);
    });

    const alsoStore = createMaybeAlsoStoreFn(config?.alsoStore);

    createChart('general-pnl-overview-chart', 'bar', {
        labels,
        // FIX: The datasets now only include the components of the bar (Profit and Expense).
        // "Omset" is no longer a dataset because it's the total height of the stack.
        datasets: [
            {
                label: 'Profit',
                data: alsoStore(profitData, (v) => ({
                  pnlOverviewChart: deepmerge(...v.map((v, index) => ({
                    [formatMachineYearMonth(reports[index].period)]: {
                      profit: v,
                    },
                  }))),
                })),
                backgroundColor: '#10B981' // Green
            },
            {
                label: 'Expense',
                data: alsoStore(expenseData, (v) => ({
                  pnlOverviewChart: deepmerge(...v.map((v, index) => ({
                    [formatMachineYearMonth(reports[index].period)]: {
                      expense: v,
                    },
                  }))),
                })),
                backgroundColor: '#EF4444' // Red
            }
        ]
    }, {
        plugins: {
            tooltip: {
                callbacks: {
                    label: function(context) {
                        const label = context.dataset.label || '';
                        const value = context.raw as number;
                        const formattedValue = `Rp${Math.round(value).toLocaleString('id-ID')}`;

                        // The total revenue for this bar is still available from our revenueData array.
                        const totalRevenue = revenueData[context.dataIndex];

                        if (totalRevenue > 0) {
                            const percentage = (value / totalRevenue) * 100;
                            return `${label}: ${formattedValue} (${percentage.toFixed(1)}%)`;
                        }

                        return `${label}: ${formattedValue}`;
                    },
                    // FIX: The footer now correctly calculates the total by summing the stacks.
                    footer: function(tooltipItems) {
                        let sum = 0;
                        tooltipItems.forEach(function(tooltipItem) {
                            sum += tooltipItem.parsed.y;
                        });
                        const formattedSum = `Rp${Math.round(sum).toLocaleString('id-ID')}`;
                        return 'Total Stack (Omset): ' + formattedSum;
                    }
                }
            }
        },
        scales: {
            x: {
                stacked: true,
            },
            y: {
                stacked: true,
                ticks: {
                    callback: shortenCurrency
                }
            }
        }
    });
}

/**
 * Reusable function to generate dual-axis financial ratio charts.
 */
function generateFinancialRatioChart(reports: any[], config: { canvasId: string, metric: string, title: string, alsoStore?: AlsoStoreFn }) {
    const labels = reports.map(r => new Date(r.period + '-02').toLocaleString('default', { month: 'short', year: 'numeric' }));
    const barData = []; // This will hold the absolute value (Rp)
    const lineData = []; // This will hold the percentage of Revenue

    reports.forEach(r => {
        // FIX: Use the robust helper function to get all calculated metrics at once.
        const allMetrics = calculateAllPnlMetrics(r.pnlData);

        const revenue = allMetrics["Pendapatan (Revenue)"] || 0;

        // FIX: Directly get the correct metric value (e.g., Net Income) from the results.
        const absoluteValue = allMetrics[config.metric] || 0;

        barData.push(absoluteValue);
        lineData.push(revenue > 0 ? (absoluteValue / revenue) * 100 : 0);
    });

    config.alsoStore?.(barData, (v) => ({
      [`${config.title} Chart`]: deepmerge(...v.map((v, index) => ({
        [formatMachineYearMonth(reports[index].period)]: {
          inCurrency: formatCurrencyUtil(v),
        },
      }))),
    }));
    config.alsoStore?.(lineData, (v) => ({
      [`${config.title} Chart`]: deepmerge(...v.map((v, index) => ({
        [formatMachineYearMonth(reports[index].period)]: {
          inPercentage: formatDecimalBasedPercentage(v / 100),
        },
      }))),
    }));

    createChart(config.canvasId, 'bar', {
        labels,
        datasets: [
            { type: 'bar', label: `${config.title} (Rp)`, data: barData, backgroundColor: '#60A5FA', yAxisID: 'y-rp', order: 2 },
            { type: 'line', label: `${config.title} (%)`, data: lineData, borderColor: '#F97316', yAxisID: 'y-percent', order: 1}
        ]
    }, mergeChartOptions(
        {
            scales: {
                'y-rp': { type: 'linear', position: 'left', title: { display: true, text: 'Value (Rp)' }, ticks: { callback: shortenCurrency } },
                'y-percent': { type: 'linear', position: 'right', title: { display: true, text: 'Percentage (%)' }, grid: { drawOnChartArea: false }, ticks: { callback: (v) => `${Number(v).toFixed(1)}%` } }
            }
        },
        chartTooltip({
            label: (context) => {
                let label = context.dataset.label || '';
                if (label) {
                    label += ': ';
                }
                const value = context.parsed.y;
                if (context.dataset.yAxisID === 'y-rp') {
                    label += formatCurrencyUtil(value);
                } else {
                    label += formatIntBasedPercentage(value, 2); // Using the new helper
                }
                return label;
            }
        })
    ));
}

/**
 * Generates a dual-axis chart for a specific sub-category's value and its ratio to revenue.
 */
function generateSpecificSubCategoryRatioChart(
    reports: any[],
    config: {
        canvasId: string,
        mainCategory: string,
        subCategory: string,
        title: string,
        alsoStore?: AlsoStoreFn,
    }
) {
    const labels = reports.map(r => new Date(r.period + '-02').toLocaleString('default', { month: 'short', year: 'numeric' }));
    const barData = []; // This will hold the absolute value (e.g., Rp for Wages)
    const lineData = []; // This will hold the percentage of Revenue

    reports.forEach(r => {
        const pnlData = r.pnlData || {};
        const revenue = Object.values(pnlData["Pendapatan (Revenue)"] || {}).reduce((s: number, v: number) => s + v, 0);

        // Directly access the specific sub-category value
        const subCategoryValue = pnlData[config.mainCategory]?.[config.subCategory] || 0;

        barData.push(subCategoryValue);
        lineData.push(revenue > 0 ? (subCategoryValue / revenue) * 100 : 0);
    });

    config.alsoStore?.(barData, (v) => ({
      [`${config.title} Chart`]: deepmerge(...v.map((v, index) => ({
        [formatMachineYearMonth(reports[index].period)]: {
          inCurrency: formatCurrencyUtil(v),
        },
      }))),
    }));
    config.alsoStore?.(lineData, (v) => ({
      [`${config.title} Chart`]: deepmerge(...v.map((v, index) => ({
        [formatMachineYearMonth(reports[index].period)]: {
          inPercentage: formatDecimalBasedPercentage(v / 100),
        },
      }))),
    }));

    createChart(config.canvasId, 'bar', {
        labels,
        datasets: [
            { type: 'bar', label: `${config.title} (Rp)`, data: barData, backgroundColor: '#60A5FA', yAxisID: 'y-rp', order: 2},
            { type: 'line', label: `${config.title} (%)`, data: lineData, borderColor: '#F97316', yAxisID: 'y-percent', order: 1 }
        ]
    }, mergeChartOptions(
        {
            scales: {
                'y-rp': { type: 'linear', position: 'left', title: { display: true, text: 'Value (Rp)' }, ticks: { callback: shortenCurrency } },
                'y-percent': { type: 'linear', position: 'right', title: { display: true, text: 'Percentage (%)' }, grid: { drawOnChartArea: false }, ticks: { callback: (v) => `${Number(v).toFixed(1)}%` } }
            }
        },
        chartTooltip({
            label: (context) => {
                let label = context.dataset.label || '';
                if (label) {
                    label += ': ';
                }
                const value = context.parsed.y;
                if (context.dataset.yAxisID === 'y-rp') {
                    label += formatCurrencyUtil(value);
                } else {
                    label += formatIntBasedPercentage(value, 2);
                }
                return label;
            }
        })
    ));
}


/**
 * Orchestrator for the "Analisis General > Aspek Keuangan" section.
 * It fetches data based on the selected period and calls the specific
 * functions to generate each table and chart.
 */
export async function generateGeneralFinance() {
    if (!currentUser) return;
    const branchSelect = document.getElementById('general-keuangan-branch-select') as HTMLSelectElement;
    const periodSelect = document.getElementById('general-keuangan-period-select') as HTMLSelectElement;
    const selectedBranch = branchSelect.value;
    const selectedPeriod = periodSelect.value;

    if (!selectedPeriod || !selectedBranch) {
        return;
    }

    showLoading({ message: 'Fetching financial data...', value: 20 });

    const endDate = new Date(selectedPeriod + '-01T00:00:00');
    endDate.setMonth(endDate.getMonth() + 1);
    endDate.setDate(endDate.getDate() - 1);
    endDate.setHours(23, 59, 59, 999);

    const startDate = new Date(selectedPeriod + '-01T00:00:00');
    startDate.setMonth(startDate.getMonth() - 11);

    const reportsRef = collection(db, `users/${currentUser.uid}/pnlReports`);
    const q = query(reportsRef, where("branchName", "==", selectedBranch));
    const reportsSnap = await getDocs(q);

    const historicalReports = reportsSnap.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter(report => {
            const reportDate = new Date(report.period + '-02');
            return reportDate >= startDate && reportDate <= endDate;
        })
        .sort((a, b) => a.period.localeCompare(b.period));

    showLoading({ message: 'Generating tables and charts...', value: 50 });

    // Initialize view storage with context; further insights will be merged
    $store.clearViewData('general-keuangan');
    $store.setActiveViewData('general-keuangan', {
            viewContext: {
                selectedBranch,
                selectedPeriod,
                periodRange: historicalReports.length > 0 ?
                    `${historicalReports[0].period} to ${historicalReports[historicalReports.length - 1].period}` :
                    'No data'
            }
    }, { selectedBranch, selectedPeriod });

    const alsoStore = createAlsoStoreFn($store, 'general-keuangan');

    await generatePnlTargetComparisonTable(selectedPeriod, selectedBranch, 'general-pnl-target-container', { alsoStore });
    generateHistoricalPnlTable(historicalReports, 'general-pnl-history-thead', 'general-pnl-history-tbody', { alsoStore });
    generatePnlOverviewChart(historicalReports, { alsoStore });

    generateFinancialRatioChart(historicalReports, { canvasId: 'general-cogs-chart', metric: 'Harga Pokok Produksi', title: 'COGS', alsoStore });
    generateFinancialRatioChart(historicalReports, { canvasId: 'general-gpm-chart', metric: 'Laba Kotor (Gross Profit)', title: 'Gross Profit Margin', alsoStore });
    generateSpecificSubCategoryRatioChart(historicalReports, {
        canvasId: 'general-hr-chart',
        mainCategory: 'Beban Operasional (OPEX)',
        subCategory: 'Wages',
        title: 'Wages',
        alsoStore,
    });
    generateSpecificSubCategoryRatioChart(historicalReports, {
        canvasId: 'general-rent-chart',
        mainCategory: 'Beban Operasional (OPEX)',
        subCategory: 'Rent',
        title: 'Rent',
        alsoStore,
    });
    // --- FIX: Main Category for Advertising is now Beban Non Operasional ---
    generateSpecificSubCategoryRatioChart(historicalReports, {
        canvasId: 'general-advertising-chart',
        mainCategory: 'Beban Non Operasional', // Corrected Main Category
        subCategory: 'Advertising',
        title: 'Advertising',
        alsoStore,
    });
    // --- END OF FIX ---
    generateFinancialRatioChart(historicalReports, { canvasId: 'general-npm-chart', metric: 'Pendapatan Bersih (Net Income)', title: 'Net Profit Margin', alsoStore });

    hideLoading();
}

/**
 * Updates the available periods in the dropdown when the branch changes.
 * Renamed from: `updatePeriodSelectorsForGeneralKeuangan`.
 */
async function updatePeriodSelectorsForGeneralFinance(selectedBranch: string) {
    if (!currentUser) return;
    const periodSelect = document.getElementById('general-keuangan-period-select') as HTMLSelectElement;

    periodSelect.innerHTML = '<option>Loading periods...</option>';

    const pnlReportsRef = collection(db, `users/${currentUser.uid}/pnlReports`);
    const q = query(pnlReportsRef, where("branchName", "==", selectedBranch));
    const reportsSnap = await getDocs(q);

    const periods = reportsSnap.docs
        .map(doc => doc.data().period)
        .filter(Boolean)
        .toSorted()
        .reverse();

    if (periods.length === 0) {
        periodSelect.innerHTML = '<option>No P&L data for this branch</option>';
        return;
    }

    const periodOptionsHtml = periods.map(p => `<option value="${p}">${new Date(p + '-02').toLocaleString('default', { month: 'long', year: 'numeric' })}</option>`).join('');
    periodSelect.innerHTML = periodOptionsHtml;
    periodSelect.value = periods[0];

    await generateGeneralFinance();
}

/**
 * Sets up the period and branch selectors for the "Aspek Keuangan" section.
 * Renamed from: `setupGeneralKeuanganPeriodSelector`.
 */
export async function setupGeneralFinance() {
    if ($store.getInitFlag('generalKeuanganSelectorInitialized')) return;
    if (!currentUser) return;

    const periodSelect = document.getElementById('general-keuangan-period-select') as HTMLSelectElement;
    const branchSelect = document.getElementById('general-keuangan-branch-select') as HTMLSelectElement;

    const reportsRef = collection(db, `users/${currentUser.uid}/pnlReports`);
    const reportsSnap = await getDocs(reportsRef);
    const branches = [...new Set(reportsSnap.docs.map(doc => doc.data().branchName))].toSorted();

    if (branches.length === 0) {
        branchSelect.innerHTML = '<option>No branches with P&L data</option>';
        return;
    }

    branchSelect.innerHTML = branches.map(b => `<option value="${b}">${b}</option>`).join('');
    branchSelect.value = branches[0];

    branchSelect.addEventListener('change', async () => await updatePeriodSelectorsForGeneralFinance(branchSelect.value));
    periodSelect.addEventListener('change', () => generateGeneralFinance());

    $store.setInitFlag('generalKeuanganSelectorInitialized', true);

    await updatePeriodSelectorsForGeneralFinance(branches[0]);
}

/**
 * Generates the P&L comparison table for a single, specified period.
 * Now includes expandable/collapsible rows for sub-categories.
 */
async function generateAnalisaPnlTable(selectedPeriod: string) {
    if (!currentUser || !selectedPeriod) return;

    const thead = document.getElementById('analisa-pnl-thead');
    const tbody = document.getElementById('analisa-pnl-tbody');
    tbody.innerHTML = '<tr><td colspan="4" class="text-center p-4 text-gray-500">Loading P&L data for the selected period...</td></tr>';

    try {
        // --- MODIFICATION: Fetch single report and target for the selected period ---
        const reportRef = doc(db, `users/${currentUser.uid}/pnlReports`, selectedPeriod);
        const targetRef = doc(db, `users/${currentUser.uid}/monthlyPnlTargets`, selectedPeriod);

        const [reportSnap, targetSnap] = await Promise.all([
            getDoc(reportRef),
            getDoc(targetRef)
        ]);

        if (!reportSnap.exists()) {
            thead.innerHTML = '';
            tbody.innerHTML = `<tr><td colspan="4" class="text-center p-4 text-gray-500">No P&L report found for ${selectedPeriod}.</td></tr>`;
            return;
        }

        const report = reportSnap.data();
        const targetsByPeriod = targetSnap.exists() ? { [selectedPeriod]: targetSnap.data().targets } : {};
        const allReports = [report]; // Treat the single report as an array to reuse logic

        // --- (The rest of the function is largely the same but now operates on a single period) ---
        let periodHeaders = '';
        allReports.forEach(r => {
            const date = new Date(r.period + '-02');
            const headerDate = date.toLocaleString('default', { month: 'short', year: 'numeric' });
            periodHeaders += `
                <th scope="col" class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">${headerDate} (Actual)</th>
                <th scope="col" class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">(Target)</th>
                <th scope="col" class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">(% of Revenue)</th>
            `;
        });
        thead.innerHTML = `<tr>
            <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Metric</th>
            ${periodHeaders}
        </tr>`;

        tbody.innerHTML = '';
        const formatCurrency = (value) => (value || value === 0) ? `Rp${Math.round(value).toLocaleString('id-ID')}` : 'N/A';
        const formatPercent = (value) => (value || value === 0) ? `${(value * 100).toFixed(1)}%` : '';

        const allMetrics = [ "Pendapatan (Revenue)", "Harga Pokok Produksi", "Laba Kotor (Gross Profit)", "Beban Operasional (OPEX)", "Pendapatan Bersih Operasional (Net Operating Income)", "Beban Non Operasional", "Pendapatan Bersih Sebelum Deprisiasi/Amortisasi, Bunga & Pajak (EBITDA)", "Depresiasi/ Amortisasi", "Bunga", "Pajak (PB1)", "Pendapatan Bersih (Net Income)" ];
        const subtotals = {
            "Laba Kotor (Gross Profit)": (data) => (data["Pendapatan (Revenue)"] || 0) - (data["Harga Pokok Produksi"] || 0),
            "Pendapatan Bersih Operasional (Net Operating Income)": (data) => subtotals["Laba Kotor (Gross Profit)"](data) - (data["Beban Operasional (OPEX)"] || 0),
            "Pendapatan Bersih Sebelum Deprisiasi/Amortisasi, Bunga & Pajak (EBITDA)": (data) => subtotals["Pendapatan Bersih Operasional (Net Operating Income)"](data) - (data["Beban Non Operasional"] || 0),
            "Pendapatan Bersih (Net Income)": (data) => subtotals["Pendapatan Bersih Sebelum Deprisiasi/Amortisasi, Bunga & Pajak (EBITDA)"](data) - (data["Depresiasi/ Amortisasi"] || 0) - (data["Bunga"] || 0) - (data["Pajak (PB1)"] || 0),
        };

        const totalRevenueForPeriod = Object.values(report.pnlData["Pendapatan (Revenue)"] || {}).reduce((sum: number, val: number) => sum + val, 0);

        allMetrics.forEach(metricName => {
            const isSubtotal = !!subtotals[metricName];
            const hasSubcategories = !isSubtotal;
            const sanitizedMetricName = metricName.replace(/[^a-zA-Z0-9]/g, '');

            const mainRow = document.createElement('tr');
            mainRow.className = isSubtotal ? 'bg-white' : 'bg-gray-50 hover:bg-gray-100 cursor-pointer';
            if (hasSubcategories) {
                mainRow.classList.add('pnl-category-toggle');
                mainRow.dataset.target = `sub-category-of-${sanitizedMetricName}`;
            }

            let mainRowHtml = `<td class="px-6 py-4 whitespace-nowrap text-sm ${isSubtotal ? 'text-gray-900 font-bold' : 'text-gray-700 font-semibold'}"><div class="flex items-center">${metricName} ${hasSubcategories ? '<svg class="w-4 h-4 ml-2 transform transition-transform chevron-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>' : ''}</div></td>`;

            const categoryTotals = {};
            if (report.pnlData) {
                Object.keys(report.pnlData).forEach(cat => {
                    categoryTotals[cat] = Object.values(report.pnlData[cat] || {}).reduce((sum, val) => sum + val, 0);
                });
            }
            const actualValue = isSubtotal ? subtotals[metricName](categoryTotals) : categoryTotals[metricName] || 0;

            const periodTargets = targetsByPeriod[report.period] || {};
            const targetRevenue = periodTargets['Pendapatan (Revenue)'];
            let nominalTarget = null;
            if (targetRevenue) {
                if (metricName === 'Pendapatan (Revenue)') {
                    nominalTarget = targetRevenue;
                } else if (periodTargets[metricName] !== undefined) {
                    nominalTarget = targetRevenue * periodTargets[metricName];
                }
            }

            const percentageOfRevenue = totalRevenueForPeriod > 0 ? actualValue / totalRevenueForPeriod : null;

            mainRowHtml += `<td class="px-6 py-4 text-right text-sm text-gray-800 font-mono">${formatCurrency(actualValue)}</td>
                            <td class="px-6 py-4 text-right text-sm text-gray-500 font-mono">${formatCurrency(nominalTarget)}</td>
                            <td class="px-6 py-4 text-right text-sm text-blue-600 font-mono">${formatPercent(percentageOfRevenue)}</td>`;
            mainRow.innerHTML = mainRowHtml;
            tbody.appendChild(mainRow);

            if (hasSubcategories) {
                const subCategoryNames = new Set<string>();
                allReports.forEach(report => {
                    if (report.pnlData && report.pnlData[metricName]) {
                        Object.keys(report.pnlData[metricName]).forEach(subCat => subCategoryNames.add(subCat));
                    }
                });

                subCategoryNames.forEach(subCatName => {
                    const subRow = document.createElement('tr');
                    subRow.className = `pnl-subcategory hidden sub-category-of-${sanitizedMetricName}`;
                    let subRowHtml = `<td class="pl-10 pr-6 py-3 whitespace-nowrap text-sm text-gray-600">${subCatName}</td>`;

                    allReports.forEach(report => {
                        const actualValue = report.pnlData?.[metricName]?.[subCatName] || 0;
                        const totalRevenueForPeriod = totalRevenuesByPeriod[report.period];
                        const percentageOfRevenue = totalRevenueForPeriod > 0 ? actualValue / totalRevenueForPeriod : null;

                        subRowHtml += `<td class="px-6 py-3 text-right text-sm text-gray-500 font-mono">${formatCurrency(actualValue)}</td>
                                       <td class="px-6 py-3"></td> <td class="px-6 py-3 text-right text-sm text-blue-600 font-mono">${formatPercent(percentageOfRevenue)}</td>`;
                    });
                    subRow.innerHTML = subRowHtml;
                    tbody.appendChild(subRow);
                });
            }
        });

    } catch (error) {
        console.error("Error generating P&L table for period:", error);
        tbody.innerHTML = `<tr><td colspan="4" class="text-center p-4 text-red-500">Error: Could not load P&L data.</td></tr>`;
    }
}

/**
 * Fetches available P&L periods, populates the period selector dropdown,
 * and sets up an event listener to update the table on selection change.
 * Renamed from: `setupPnlPeriodSelector`.
 */
export async function setupAnalisaPnl() {
    if (!currentUser) return;
    const selectEl = document.getElementById('pnl-period-select') as HTMLSelectElement;
    selectEl.innerHTML = '<option>Loading periods...</option>';

    try {
        const reportsRef = collection(db, `users/${currentUser.uid}/pnlReports`);
        const reportsSnap = await getDocs(reportsRef);

        const periods = reportsSnap.docs
            .map(doc => doc.data().period)
            .filter(Boolean) // Remove any undefined periods
            .toSorted()
            .reverse(); // Show most recent first

        if (periods.length === 0) {
            selectEl.innerHTML = '<option>No P&L data found</option>';
            document.getElementById('analisa-pnl-tbody').innerHTML = '<tr><td colspan="4" class="text-center p-4 text-gray-500">No P&L reports have been saved yet.</td></tr>';
            document.getElementById('analisa-pnl-thead').innerHTML = '';
            return;
        }

        // Populate the dropdown with available periods
        selectEl.innerHTML = periods.map(period => {
            const [year, month] = period.split('-');
            const dateLabel = new Date(parseInt(year), parseInt(month) - 1).toLocaleString('default', { month: 'long', year: 'numeric' });
            return `<option value="${period}">${dateLabel}</option>`;
        }).join('');

        // Add event listener to redraw the table when the period changes
        selectEl.addEventListener('change', () => {
            const selectedPeriod = selectEl.value;
            generateAnalisaPnlTable(selectedPeriod);
        });

        // Initially, load the table for the most recent period
        generateAnalisaPnlTable(periods[0]);

    } catch (error) {
        console.error("Error setting up P&L period selector:", error);
        selectEl.innerHTML = '<option>Error loading periods</option>';
    }
}

/**
 * Generates the P&L table for the "Waktu P&L" (all-time) section.
 */
export async function generateAllTimePnlTable() {
    if (!currentUser) return;
    const thead = document.getElementById('waktu-pnl-thead');
    const tbody = document.getElementById('waktu-pnl-tbody');
    tbody.innerHTML = '<tr><td colspan="2" class="text-center p-4 text-gray-500">Loading P&L reports for the last 24 months...</td></tr>';

    try {
        const reportsRef = collection(db, `users/${currentUser.uid}/pnlReports`);
        const reportsSnap = await getDocs(reportsRef);

        // --- MODIFICATION: Filter reports for the last 24 months ---
        const twentyFourMonthsAgo = new Date();
        twentyFourMonthsAgo.setMonth(twentyFourMonthsAgo.getMonth() - 24);
        const twentyFourMonthsAgoPeriod = twentyFourMonthsAgo.toISOString().slice(0, 7); // "YYYY-MM"

        const recentReports = reportsSnap.docs
            .map(doc => ({ id: doc.id, ...doc.data() }))
            .filter(report => report.period && typeof report.period === 'string' && report.period >= twentyFourMonthsAgoPeriod)
            .toSorted((a, b) => a.period.localeCompare(b.period));

        if (recentReports.length === 0) {
            thead.innerHTML = '';
            tbody.innerHTML = '<tr><td colspan="2" class="text-center p-4 text-gray-500">No P&L reports found in the last 24 months.</td></tr>';
            return;
        }

        // --- MODIFICATION: Table Header now built from filtered reports ---
        const periodHeaders = recentReports.map(r => {
            const date = new Date(r.period + '-02');
            return `<th scope="col" class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">${date.toLocaleString('default', { month: 'short', year: 'numeric' })}</th>`;
        }).join('');
        thead.innerHTML = `<tr>
            <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Metric</th>
            ${periodHeaders}
        </tr>`;

        // --- (Table Body rendering logic remains the same, but now uses 'recentReports') ---
        tbody.innerHTML = '';
        const formatCurrency = (value) => value ? `Rp${Math.round(value).toLocaleString('id-ID')}` : 'Rp0';

        const categoryOrder = ["Pendapatan (Revenue)", "Harga Pokok Produksi", "Beban Operasional (OPEX)", "Beban Non Operasional", "Depresiasi/ Amortisasi", "Bunga", "Pajak (PB1)"];
        const subtotals = {
            "Laba Kotor (Gross Profit)": (data) => (data["Pendapatan (Revenue)"] || 0) - (data["Harga Pokok Produksi"] || 0),
            "Pendapatan Bersih Operasional (Net Operating Income)": (data) => subtotals["Laba Kotor (Gross Profit)"](data) - (data["Beban Operasional (OPEX)"] || 0),
            "Pendapatan Bersih Sebelum Deprisiasi/Amortisasi, Bunga & Pajak (EBITDA)": (data) => subtotals["Pendapatan Bersih Operasional (Net Operating Income)"](data) - (data["Beban Non Operasional"] || 0),
            "Pendapatan Bersih (Net Income)": (data) => subtotals["Pendapatan Bersih Sebelum Deprisiasi/Amortisasi, Bunga & Pajak (EBITDA)"](data) - (data["Depresiasi/ Amortisasi"] || 0) - (data["Bunga"] || 0) - (data["Pajak (PB1)"] || 0),
        };

        const allMetrics = [...categoryOrder, ...Object.keys(subtotals)];

        allMetrics.forEach(metricName => {
            const isSubtotal = !!subtotals[metricName];
            const tr = document.createElement('tr');
            tr.className = isSubtotal ? 'bg-gray-50 font-semibold' : '';

            let rowHtml = `<td class="px-6 py-4 whitespace-nowrap text-sm ${isSubtotal ? 'text-gray-900' : 'text-gray-700'}">${metricName}</td>`;

            recentReports.forEach(report => {
                let value = 0;
                if (isSubtotal) {
                    const categoryTotals = {};
                    categoryOrder.forEach(cat => {
                       categoryTotals[cat] = Object.values(report.pnlData[cat] || {}).reduce((sum: number, val: number) => sum + val, 0);
                    });
                    value = subtotals[metricName](categoryTotals);
                } else {
                    value = Object.values(report.pnlData[metricName] || {}).reduce((sum: number, val: number) => sum + val, 0);
                }
                rowHtml += `<td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-right font-mono">${formatCurrency(value)}</td>`;
            });
            tr.innerHTML = rowHtml;
            tbody.appendChild(tr);
        });

    } catch (error) {
        console.error("Error generating all-time P&L table:", error);
        tbody.innerHTML = `<tr><td colspan="2" class="text-center p-4 text-red-500">Error: Could not load P&L data.</td></tr>`;
    }
}
