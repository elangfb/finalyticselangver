// src/analysis/sections/branch-comparison/finance.ts
// Contains all logic for the "Analisis Perbandingan Cabang > Aspek Keuangan" section.

import * as $store from '../../../store';
import { db } from '../../../core/firebase';
import { currentUser } from '../../../core/state';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { showLoading, hideLoading } from '../../../core/ui';
import { createChart } from '../../helpers';
import { chartTooltip, mergeChartOptions, shortenCurrency } from '../../utils/chart-formatters';
import { AlsoStoreFn, createAlsoStoreFn, maybeAlsoStore } from '../../utils/store-helpers';
import { formatCurrencyUtil, formatDecimalBasedPercentage } from '../../utils/string-formatters';
import { deepmerge } from 'deepmerge-ts';

/**
 * A local helper to calculate key P&L metrics from a raw P&L data object.
 */
function calculatePnlMetrics(pnlData: any) {
    if (!pnlData) return {};
    const results: { [key: string]: number } = {};
    const categoryOrder = ["Pendapatan (Revenue)", "Harga Pokok Produksi", "Beban Operasional (OPEX)", "Beban Non Operasional", "Depresiasi/ Amortisasi", "Bunga", "Pajak (PB1)"];

    categoryOrder.forEach(cat => {
        results[cat] = Object.values(pnlData[cat] || {}).reduce((sum: number, val: any) => sum + val, 0);
    });

    results['Laba Kotor (Gross Profit)'] = (results["Pendapatan (Revenue)"] || 0) - (results["Harga Pokok Produksi"] || 0);
    results['Pendapatan Bersih (Net Income)'] = results['Laba Kotor (Gross Profit)'] - (results["Beban Operasional (OPEX)"] || 0) - (results["Beban Non Operasional"] || 0) - (results["Depresiasi/ Amortisasi"] || 0) - (results["Bunga"] || 0) - (results["Pajak (PB1)"] || 0);
    return results;
};

/**
 * Generates a comparison table for key P&L metrics between two branches.
 */
function generateBranchPnlComparisonTable(reportA: any, reportB: any, containerId: string, config?: { alsoStore?: AlsoStoreFn }) {
    const metricsA = calculatePnlMetrics(reportA?.pnlData);
    const metricsB = calculatePnlMetrics(reportB?.pnlData);
    const container = document.getElementById(containerId);
    if (!container) return;

    const metricsToShow = ["Pendapatan (Revenue)", "Harga Pokok Produksi", "Laba Kotor (Gross Profit)", "Beban Operasional (OPEX)", "Pendapatan Bersih (Net Income)"];
    maybeAlsoStore(
        config?.alsoStore,
        { metricsA, metricsB, metricsToShow, branchA: reportA?.branchName, branchB: reportB?.branchName },
        (v) => ({
            pnlComparison: {
                [v.branchA || 'Branch A']: deepmerge(...v.metricsToShow.map(metric => ({
                    [metric]: formatCurrencyUtil(v.metricsA[metric] || 0)
                }))),
                [v.branchB || 'Branch B']: deepmerge(...v.metricsToShow.map(metric => ({
                    [metric]: formatCurrencyUtil(v.metricsB[metric] || 0)
                })))
            }
        })
    );

    let tableHtml = `<table class="min-w-full divide-y divide-gray-200">
        <thead class="bg-gray-50"><tr>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Metric</th>
            <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">${reportA?.branchName || 'Branch A'}</th>
            <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">${reportB?.branchName || 'Branch B'}</th>
        </tr></thead><tbody class="bg-white divide-y divide-gray-200">`;

    metricsToShow.forEach(metric => {
        const valA = metricsA[metric as keyof typeof metricsA] || 0;
        const valB = metricsB[metric as keyof typeof metricsB] || 0;
        tableHtml += `<tr>
            <td class="px-6 py-4 text-sm font-medium text-gray-900">${metric}</td>
            <td class="px-6 py-4 text-sm text-gray-500 text-right font-mono">${shortenCurrency(valA)}</td>
            <td class="px-6 py-4 text-sm text-gray-500 text-right font-mono">${shortenCurrency(valB)}</td>
        </tr>`;
    });
    tableHtml += `</tbody></table>`;
    container.innerHTML = tableHtml;
}

/**
 * Generates a dual-axis chart comparing a financial ratio between two branches.
 */
function generateBranchRatioComparisonChart(reportA: any, reportB: any, config: { canvasId: string, metric: string, title: string, alsoStore?: AlsoStoreFn }) {
    const metricsA = calculatePnlMetrics(reportA?.pnlData);
    const metricsB = calculatePnlMetrics(reportB?.pnlData);
    const valueA = metricsA[config.metric as keyof typeof metricsA] || 0;
    const valueB = metricsB[config.metric as keyof typeof metricsB] || 0;
    const revenueA = metricsA['Pendapatan (Revenue)'] || 0;
    const revenueB = metricsB['Pendapatan (Revenue)'] || 0;
    const percentA = revenueA > 0 ? (valueA / revenueA) * 100 : 0;
    const percentB = revenueB > 0 ? (valueB / revenueB) * 100 : 0;

    maybeAlsoStore(
        config?.alsoStore,
        {
            valueA, valueB, percentA, percentB,
            branchA: reportA?.branchName, branchB: reportB?.branchName,
            metric: config.metric, title: config.title
        },
        (v) => ({
            [`${v.title.toLowerCase().replace(/\s+/g, '')}Comparison`]: {
                [v.branchA || 'Branch A']: {
                    absoluteValue: formatCurrencyUtil(v.valueA),
                    percentage: formatDecimalBasedPercentage(v.percentA / 100)
                },
                [v.branchB || 'Branch B']: {
                    absoluteValue: formatCurrencyUtil(v.valueB),
                    percentage: formatDecimalBasedPercentage(v.percentB / 100)
                },
                metric: v.metric
            }
        })
    );

    createChart(config.canvasId, 'bar', {
        labels: [reportA?.branchName || 'Branch A', reportB?.branchName || 'Branch B'],
        datasets: [
            { type: 'bar', label: `${config.title} (Rp)`, data: [valueA, valueB], backgroundColor: '#60A5FA', yAxisID: 'y-rp' },
            { type: 'line', label: `${config.title} (%)`, data: [percentA, percentB], borderColor: '#F97316', yAxisID: 'y-percent' }
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
                    label += `${Number(value).toFixed(2)}%`;
                }
                return label;
            }
        })
    ));
}

/**
 * Main orchestrator for the "Analisis Perbandingan Cabang > Aspek Keuangan" section.
 */
async function generateBranchFinance() {
    if (!currentUser) return;
    const period = (document.getElementById('cabang-keuangan-period-select') as HTMLSelectElement).value;
    const branchA = (document.getElementById('cabang-keuangan-branch-a-select') as HTMLSelectElement).value;
    const branchB = (document.getElementById('cabang-keuangan-branch-b-select') as HTMLSelectElement).value;
    if (!period || !branchA || !branchB || branchA === branchB) return;

    $store.clearViewData('cabang-keuangan');
    $store.setActiveViewData('cabang-keuangan', { viewContext: { period, branchA, branchB } }, { period, branchA, branchB });
    const alsoStore = createAlsoStoreFn($store, 'cabang-keuangan');
    showLoading({ message: 'Comparing P&L data...', value: 30 });

    const pnlReportsRef = collection(db, `users/${currentUser.uid}/pnlReports`);
    const q = query(pnlReportsRef, where("period", "==", period));
    const reportsSnap = await getDocs(q);
    const reportA = reportsSnap.docs.find(doc => doc.data().branchName === branchA)?.data();
    const reportB = reportsSnap.docs.find(doc => doc.data().branchName === branchB)?.data();

    generateBranchPnlComparisonTable(reportA, reportB, 'cabang-pnl-comparison-container', { alsoStore });
    generateBranchRatioComparisonChart(reportA, reportB, { canvasId: 'cabang-cogs-comparison-chart', metric: 'Harga Pokok Produksi', title: 'COGS', alsoStore });
    generateBranchRatioComparisonChart(reportA, reportB, { canvasId: 'cabang-gpm-comparison-chart', metric: 'Laba Kotor (Gross Profit)', title: 'Gross Profit', alsoStore });
    generateBranchRatioComparisonChart(reportA, reportB, { canvasId: 'cabang-npm-comparison-chart', metric: 'Pendapatan Bersih (Net Income)', title: 'Net Income', alsoStore });
    hideLoading();
}

/**
 * Sets up the selectors for the "Cabang > Keuangan" section.
 */
export async function setupBranchFinance() {
    if ($store.getInitFlag('cabangKeuanganSelectorsInitialized') || !currentUser) return;

    const periodSelect = document.getElementById('cabang-keuangan-period-select') as HTMLSelectElement;
    const branchASelect = document.getElementById('cabang-keuangan-branch-a-select') as HTMLSelectElement;
    const branchBSelect = document.getElementById('cabang-keuangan-branch-b-select') as HTMLSelectElement;

    const pnlReportsRef = collection(db, `users/${currentUser.uid}/pnlReports`);
    const reportsSnap = await getDocs(pnlReportsRef);
    const periods = [...new Set(reportsSnap.docs.map(doc => doc.data().period))].sort().reverse();
    const branches = [...new Set(reportsSnap.docs.map(doc => doc.data().branchName))].sort();

    if (periods.length === 0 || branches.length < 2) return;

    periodSelect.innerHTML = periods.map(p => `<option value="${p}">${new Date(p + '-02').toLocaleString('default', { month: 'long', year: 'numeric' })}</option>`).join('');
    branchASelect.innerHTML = branches.map(b => `<option value="${b}">${b}</option>`).join('');
    branchBSelect.innerHTML = branches.map(b => `<option value="${b}">${b}</option>`).join('');

    branchASelect.value = branches[0];
    branchBSelect.value = branches[1];

    const handler = () => generateBranchFinance();
    periodSelect.addEventListener('change', handler);
    branchASelect.addEventListener('change', handler);
    branchBSelect.addEventListener('change', handler);

    $store.setInitFlag('cabangKeuanganSelectorsInitialized', true);
    generateBranchFinance();
}
