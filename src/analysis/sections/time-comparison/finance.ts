// Contains all logic for the "Analisis Perbandingan Waktu > Aspek Keuangan" section.

import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/core/firebase';
import { currentUser } from '@/core/state';
import { showLoading, hideLoading } from '@/core/ui';
import * as $store from '@/store';
import { createChart } from '../../helpers';
import { AlsoStoreFn, createAlsoStoreFn, createMaybeAlsoStoreFn } from '../../utils/store-helpers';
import { chartTooltip, chartYTicks, mergeChartOptions, shortenCurrency } from '../../utils/chart-formatters';
import { formatCurrency as formatCurrencyUtil, formatIntBasedPercentage, formatDecimalBasedPercentage } from '../../utils/string-formatters';
import { calculateAllPnlMetrics } from '../general/finance';
import type { ChartDataset } from 'chart.js';

/**
 * Generates a detailed P&L comparison table between two periods,
 * formatted similarly to the P&L vs. Target table.
 */
function generatePnlComparisonTable(reportA: any, reportB: any, containerId: string, config?: { alsoStore?: AlsoStoreFn }) {
    const container = document.getElementById(containerId);
    if (!container) return; // Added a guard clause for safety
    container.innerHTML = '';

    try {
        const pnlDataA = reportA?.pnlData || {};
        const pnlDataB = reportB?.pnlData || {};

        const categoryOrder = ["Pendapatan (Revenue)", "Harga Pokok Produksi", "Beban Operasional (OPEX)", "Beban Non Operasional", "Depresiasi/ Amortisasi", "Bunga", "Pajak (PB1)"];
        const subtotals: Record<string, (data: Record<string, number>) => number> = {
            "Laba Kotor (Gross Profit)": (data) => (data["Pendapatan (Revenue)"] || 0) - (data["Harga Pokok Produksi"] || 0),
            "Pendapatan Bersih Operasional (Net Operating Income)": (data) => (subtotals["Laba Kotor (Gross Profit)"]?.(data) || 0) - (data["Beban Operasional (OPEX)"] || 0),
            "Pendapatan Bersih Sebelum Deprisiasi/Amortisasi, Bunga & Pajak (EBITDA)": (data) => (subtotals["Pendapatan Bersih Operasional (Net Operating Income)"]?.(data) || 0) - (data["Beban Non Operasional"] || 0),
            "Pendapatan Bersih (Net Income)": (data) => (subtotals["Pendapatan Bersih Sebelum Deprisiasi/Amortisasi, Bunga & Pajak (EBITDA)"]?.(data) || 0) - (data["Depresiasi/ Amortisasi"] || 0) - (data["Bunga"] || 0) - (data["Pajak (PB1)"] || 0),
        };
        const allMetrics = [...categoryOrder, ...Object.keys(subtotals)];

        const calculateAllMetrics = (pnlData: Record<string, Record<string, number>>) => {
            const results: Record<string, number> = {};
            const categoryTotals: Record<string, number> = {};
            categoryOrder.forEach(cat => {
                    const total = Object.values((pnlData?.[cat] ?? {}) as Record<string, number>).reduce((sum: number, val: number) => sum + val, 0);
                results[cat] = total;
                categoryTotals[cat] = total;
            });
            Object.keys(subtotals).forEach(sub => {
                    results[sub] = subtotals[sub]?.(categoryTotals) ?? 0;
            });
            return results;
        };

        const valuesA = calculateAllMetrics(pnlDataA);
        const valuesB = calculateAllMetrics(pnlDataB);

        const alsoStore = createMaybeAlsoStoreFn(config?.alsoStore);

    const formatCurrency = (value: number) => `Rp${Math.round(value).toLocaleString('id-ID')}`;
        const labelA = reportA ? new Date(reportA.period + '-02').toLocaleString('default', { month: 'short', year: 'numeric' }) : 'Period A';
        const labelB = reportB ? new Date(reportB.period + '-02').toLocaleString('default', { month: 'short', year: 'numeric' }) : 'Period B';

        let tableHtml = `
            <table class="min-w-full divide-y divide-gray-200">
                <thead class="bg-gray-50">
                    <tr>
                        <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Metric</th>
                        <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">${labelA}</th>
                        <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">${labelB}</th>
                        <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Change</th>
                    </tr>
                </thead>
                <tbody class="bg-white divide-y divide-gray-200">`;

        allMetrics.forEach(metric => {
            const valueA = valuesA[metric] || 0;
            const valueB = valuesB[metric] || 0;
            const change = valueB - valueA;
            const isCost = metric.toLowerCase().includes('beban') || metric.toLowerCase().includes('harga pokok produksi');

            // --- FIX START: Calculate percentage change and handle zero division ---
            let changeText: string;
            if (valueA === 0) {
                // If the initial value is 0, a percentage isn't meaningful.
                // We show the absolute change instead.
                changeText = `${change >= 0 ? '+' : ''}${formatCurrency(change)}`;
            } else {
                const percentage = (change / valueA) * 100;
                changeText = `${percentage >= 0 ? '+' : ''}${percentage.toFixed(1)}%`;
            }
            // --- FIX END ---

            let changeColor = 'text-gray-500'; // Default color for no change
            if (change > 0) changeColor = isCost ? 'text-red-600' : 'text-green-600';
            if (change < 0) changeColor = isCost ? 'text-green-600' : 'text-red-600';

            // The 'achievement' bar logic can be kept or removed based on your preference.
            // I've kept it here as it provides a nice visual indicator.
            let achievement = 0;
            if (valueA !== 0) {
                 achievement = isCost ? (valueA / valueB) * 100 : (valueB / valueA) * 100;
            } else if (valueB > 0) {
                 achievement = 100;
            }

            alsoStore(valueA, (v) => ({ pnlComparison: { reportA: { [metric]: formatCurrencyUtil(v) } } }));
            alsoStore(valueB, (v) => ({ pnlComparison: { reportB: { [metric]: formatCurrencyUtil(v) } } }));

            tableHtml += `
                <tr>
                    <td class="px-6 py-4 text-sm font-medium text-gray-900">${metric}</td>
                    <td class="px-6 py-4 text-sm text-gray-500 text-right font-mono">${formatCurrency(valueA)}</td>
                    <td class="px-6 py-4 text-sm text-gray-500 text-right font-mono">${formatCurrency(valueB)}</td>
                    <td class="px-6 py-4 text-sm text-gray-500 text-right">
                        <div class="flex items-center justify-end">
                            <span class="font-semibold ${changeColor} w-20 text-right">${changeText}</span>
                        </div>
                    </td>
                </tr>`;
        });

        tableHtml += `</tbody></table>`;
        container.innerHTML = tableHtml;

    } catch(error) {
        console.error("Error generating P&L comparison table:", error);
        container.innerHTML = `<p class="text-red-500 p-4">Error loading data for comparison. One of the selected periods may be missing a P&L report.</p>`;
    }
}

/**
 * Reusable function to generate a dual-axis comparison chart for a financial ratio.
 */
function generateRatioComparisonChart(reportA: any, reportB: any, config: { canvasId: string, metric: string, title: string, alsoStore?: AlsoStoreFn }) {
    const pnlDataA = reportA?.pnlData;
    const pnlDataB = reportB?.pnlData;

    const getMetricValue = (pnlData: Record<string, Record<string, number>> | undefined) => {
        const revenue = Object.values((pnlData?.["Pendapatan (Revenue)"] ?? {}) as Record<string, number>).reduce((s:number, v:number) => s + v, 0);
        if (!revenue) return 0;

        if (config.metric.includes('Profit') || config.metric.includes('Income')) {
            const hpp = Object.values((pnlData?.["Harga Pokok Produksi"] ?? {}) as Record<string, number>).reduce((s:number, v:number) => s + v, 0);
            return revenue - hpp;
        }
        return Object.values((pnlData?.[config.metric] ?? {}) as Record<string, number>).reduce((s:number, v:number) => s + v, 0);
    };

    const valueA = getMetricValue(pnlDataA);
    const valueB = getMetricValue(pnlDataB);
    const revenueA = Object.values((pnlDataA?.["Pendapatan (Revenue)"] ?? {}) as Record<string, number>).reduce((s:number,v:number)=>s+v,0);
    const revenueB = Object.values((pnlDataB?.["Pendapatan (Revenue)"] ?? {}) as Record<string, number>).reduce((s:number,v:number)=>s+v,0);
    const percentA = revenueA > 0 ? (valueA / revenueA) * 100 : 0;
    const percentB = revenueB > 0 ? (valueB / revenueB) * 100 : 0;

    config?.alsoStore?.([valueA, valueB] as const, ([a, b]) => ({
      [`${config.title} Chart`]: {
        periodA: { inCurrency: formatCurrencyUtil(a) },
        periodB: { inCurrency: formatCurrencyUtil(b) },
      },
    }));
    config?.alsoStore?.([percentA, percentB] as const, ([a, b]) => ({
      [`${config.title} Chart`]: {
        periodA: { inPercentage: formatDecimalBasedPercentage(a) },
        periodB: { inPercentage: formatDecimalBasedPercentage(b) },
      },
    }));

    const labels = [
        reportA ? new Date(reportA.period + '-02').toLocaleString('default', { month: 'short', year: 'numeric' }) : 'Period A',
        reportB ? new Date(reportB.period + '-02').toLocaleString('default', { month: 'short', year: 'numeric' }) : 'Period B'
    ];

    createChart(config.canvasId, 'bar', {
        labels,
        datasets: [
            { type: 'bar', label: `${config.title} (Rp)`, data: [valueA, valueB], backgroundColor: '#60A5FA', yAxisID: 'y-rp' },
            { type: 'line', label: `${config.title} (%)`, data: [percentA, percentB], borderColor: '#F97316', yAxisID: 'y-percent' }
        ]
    }, mergeChartOptions(
        ({
            scales: {
                'y-rp': { type: 'linear', position: 'left', title: { display: true, text: 'Value (Rp)' }, ticks: { callback: ((n: number) => shortenCurrency(n)) } },
                'y-percent': { type: 'linear', position: 'right', title: { display: true, text: 'Percentage (%)' }, grid: { drawOnChartArea: false }, ticks: { callback: ((v: string | number) => `${Number(v).toFixed(1)}%`) } }
            }
        } as any),
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
 * Main orchestrator for the "Analisis Perbandingan Waktu > Aspek Keuangan" section.
 */
async function generateTimeFinance() {
    if (!currentUser) return;
    const periodA = (document.getElementById('waktu-keuangan-period-a') as HTMLSelectElement).value;
    const periodB = (document.getElementById('waktu-keuangan-period-b') as HTMLSelectElement).value;
    const selectedBranch = (document.getElementById('waktu-keuangan-branch-select') as HTMLSelectElement).value;

    if (!periodA || !periodB || !selectedBranch) return;

    showLoading({ message: 'Fetching P&L data for comparison...', value: 30 });

    $store.clearViewData('waktu-keuangan');
    $store.setActiveViewData('waktu-keuangan', {
        viewContext: {
            periodA,
            periodB,
            selectedBranch
        }
    }, { periodA, periodB, selectedBranch });
    const alsoStore = createAlsoStoreFn($store, 'waktu-keuangan');

    const pnlReportsRef = collection(db, `users/${currentUser.uid}/pnlReports`);
    const reportsSnap = await getDocs(pnlReportsRef);
    const allReports = reportsSnap.docs.map(doc => doc.data());

    const findReport = (period: string, branch: string) => allReports.find(r => r.period === period && r.branchName === branch);

    const reportA = findReport(periodA, selectedBranch);
    const reportB = findReport(periodB, selectedBranch);

    generatePnlComparisonTable(reportA, reportB, 'waktu-pnl-comparison-container', { alsoStore });
    generateRatioComparisonChart(reportA, reportB, { canvasId: 'waktu-cogs-comparison-chart', metric: 'Harga Pokok Produksi', title: 'COGS', alsoStore });
    generateRatioComparisonChart(reportA, reportB, { canvasId: 'waktu-gpm-comparison-chart', metric: 'Laba Kotor (Gross Profit)', title: 'Gross Profit', alsoStore });
    generateRatioComparisonChart(reportA, reportB, { canvasId: 'waktu-hr-comparison-chart', metric: 'Beban Operasional (OPEX)', title: 'OPEX', alsoStore });
    generateRatioComparisonChart(reportA, reportB, { canvasId: 'waktu-npm-comparison-chart', metric: 'Pendapatan Bersih (Net Income)', title: 'Net Income', alsoStore });

    hideLoading();
}

/**
 * Updates the Period A and Period B selectors based on the selected branch.
 */
async function updateTimeFinancePeriodSelectors(selectedBranch: string) {
    if (!currentUser) return;
    const selectA = document.getElementById('waktu-keuangan-period-a') as HTMLSelectElement;
    const selectB = document.getElementById('waktu-keuangan-period-b') as HTMLSelectElement;
    const container = document.getElementById('waktu-pnl-comparison-container');

    selectA.innerHTML = '<option>Loading periods...</option>';
    selectB.innerHTML = '<option>Loading periods...</option>';

    const pnlReportsRef = collection(db, `users/${currentUser.uid}/pnlReports`);
    const q = query(pnlReportsRef, where("branchName", "==", selectedBranch));
    const reportsSnap = await getDocs(q);
    const periods = reportsSnap.docs.map(doc => doc.data().period).filter(Boolean).sort().reverse();

    if (periods.length < 2) {
        selectA.innerHTML = '<option>Not enough data for comparison</option>';
        selectB.innerHTML = '<option>Not enough data for comparison</option>';
        if (container) container.innerHTML = '<p class="text-gray-500 p-4 text-center">This branch lacks sufficient P&L reports for comparison.</p>';
        return;
    }

    const periodOptionsHtml = periods.map(p => `<option value="${p}">${new Date(p + '-02').toLocaleString('default', { month: 'long', year: 'numeric' })}</option>`).join('');
    selectA.innerHTML = periodOptionsHtml;
    selectB.innerHTML = periodOptionsHtml;
    selectA.value = periods[1];
    selectB.value = periods[0];
    await generateTimeFinance();
}

/**
 * Sets up the period and branch selectors for the "Waktu > Keuangan" section.
 */
export async function setupTimeFinance() {
    if ($store.getInitFlag('waktuKeuanganSelectorsInitialized')) return;
    if (!currentUser) return;

    const selectA = document.getElementById('waktu-keuangan-period-a') as HTMLSelectElement;
    const selectB = document.getElementById('waktu-keuangan-period-b') as HTMLSelectElement;
    const branchSelect = document.getElementById('waktu-keuangan-branch-select') as HTMLSelectElement;

    const reportsRef = collection(db, `users/${currentUser.uid}/pnlReports`);
    const reportsSnap = await getDocs(reportsRef);
    const branches = [...new Set(reportsSnap.docs.map(doc => doc.data().branchName))].sort();

    if (branches.length === 0) {
        branchSelect.innerHTML = '<option>No branches found</option>';
        return;
    }

    branchSelect.innerHTML = branches.map(b => `<option value="${b}">${b}</option>`).join('');
    branchSelect.value = branches[0];

    const handler = () => generateTimeFinance();
    selectA.addEventListener('change', handler);
    selectB.addEventListener('change', handler);
    branchSelect.addEventListener('change', () => updateTimeFinancePeriodSelectors(branchSelect.value));

    $store.setInitFlag('waktuKeuanganSelectorsInitialized', true);
    await updateTimeFinancePeriodSelectors(branches[0]);
}
