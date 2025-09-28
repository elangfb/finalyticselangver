// Contains all logic for the "Analisis Perbandingan Waktu > Aspek Penjualan" section.

import * as $store from '@/store';
import { currentUser } from '@/core/state';
import { createChart } from '../../helpers';
import { chartTooltip, mergeChartOptions, chartYTicks, shortenNumber, shortenCurrency, currencyTooltipCallback } from '../../utils/chart-formatters';
import { AlsoStoreFn, createAlsoStoreFn, maybeAlsoStore } from '../../utils/store-helpers';
import { formatNumber, formatCurrencyUtil, formatNumberUtil } from '../../utils/string-formatters';
import { deepmerge } from 'deepmerge-ts';

/**
 * Reusable function to generate a line chart comparing a metric between two periods by week.
 */
function generatePeriodComparisonLineChart(periodAData: any[], periodBData: any[], config: { canvasId: string, metric: 'totalOmzet' | 'totalTransactions' | 'apc', title: string, alsoStore?: AlsoStoreFn }) {
    const labels = ['Week 1 (1-7)', 'Week 2 (8-14)', 'Week 3 (15-21)', 'Week 4 (22-28)', 'Week 5 (29-31)'];
    const getWeeklyData = (data: any[]) => {
        const weeklyTotals = Array(5).fill(null).map(() => ({ revenue: 0, transactions: 0 }));
        data.forEach(s => {
            const dayOfMonth = s.date.getDate();
            const weekIndex = Math.floor((dayOfMonth - 1) / 7);
            if (weekIndex < 5) {
                weeklyTotals[weekIndex].revenue += s.totalOmzet;
                weeklyTotals[weekIndex].transactions += s.totalTransactions;
            }
        });

        if (config.metric === 'apc') return weeklyTotals.map(week => week.transactions > 0 ? week.revenue / week.transactions : null);
        if (config.metric === 'totalTransactions') return weeklyTotals.map(week => week.transactions > 0 || week.revenue > 0 ? week.transactions : null);
        return weeklyTotals.map(week => week.transactions > 0 || week.revenue > 0 ? week.revenue : null);
    };

    const periodAWeekly = getWeeklyData(periodAData);
    const periodBWeekly = getWeeklyData(periodBData);

    maybeAlsoStore(
        config?.alsoStore,
        { periodAWeekly, periodBWeekly, metric: config.metric, labels },
        (v) => {
            const formatValue = config.metric === 'totalTransactions' ? formatNumberUtil : formatCurrencyUtil;
            return {
                [`${config.title}_Comparison`]: {
                    periodA: deepmerge(...v.periodAWeekly.map((value, index) =>
                        value !== null ? { [v.labels[index]]: formatValue(value) } : {}
                    )),
                    periodB: deepmerge(...v.periodBWeekly.map((value, index) =>
                        value !== null ? { [v.labels[index]]: formatValue(value) } : {}
                    )),
                }
            };
        }
    );

    createChart(config.canvasId, 'line', {
        labels,
        datasets: [
            { label: `${config.title} Period A`, data: periodAWeekly, borderColor: '#9CA3AF', tension: 0.1, spanGaps: true },
            { label: `${config.title} Period B`, data: periodBWeekly, borderColor: '#4F46E5', tension: 0.1, spanGaps: true }
        ]
    }, mergeChartOptions(
        chartYTicks(config.metric === 'totalTransactions' ? shortenNumber : shortenCurrency),
        chartTooltip({ label: (context: any) => `${context.dataset.label || ''}: ${config.metric === 'totalTransactions' ? formatNumber(context.parsed.y) : formatCurrencyUtil(context.parsed.y)}` })
    ));
}

/**
 * Generates a line chart comparing average sales by day of the week for two periods.
 */
function generateWeeklyTrendComparisonChart(periodAData: any[], periodBData: any[], canvasId: string, config?: { alsoStore?: AlsoStoreFn }) {
    const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const getAvgWeeklyData = (data: any[]) => {
        const weeklyTotals = Array(7).fill(0);
        const weeklyCounts = Array(7).fill(0);
        const seenDates = new Set();
        data.forEach(s => {
            const dateStr = s.date.toISOString().split('T')[0];
            const dayIndex = s.date.getDay();
            weeklyTotals[dayIndex] += s.totalOmzet;
            if (!seenDates.has(dateStr)) {
                weeklyCounts[dayIndex]++;
                seenDates.add(dateStr);
            }
        });
        return weeklyTotals.map((total, i) => weeklyCounts[i] > 0 ? total / weeklyCounts[i] : 0);
    };

    const periodAWeekly = getAvgWeeklyData(periodAData);
    const periodBWeekly = getAvgWeeklyData(periodBData);

    maybeAlsoStore(
        config?.alsoStore,
        { periodAWeekly, periodBWeekly, dayLabels },
        (v) => ({
            weeklyTrendComparison: {
                periodA: deepmerge(...v.periodAWeekly.map((value, index) => ({
                    [v.dayLabels[index] as string]: formatCurrencyUtil(value)
                }))),
                periodB: deepmerge(...v.periodBWeekly.map((value, index) => ({
                    [v.dayLabels[index] as string]: formatCurrencyUtil(value)
                })))
            }
        })
    );

    createChart(canvasId, 'line', {
        labels: dayLabels,
        datasets: [
            { label: `Avg Sales Period A`, data: periodAWeekly, borderColor: '#9CA3AF', tension: 0.1 },
            { label: `Avg Sales Period B`, data: periodBWeekly, borderColor: '#4F46E5', tension: 0.1 }
        ]
    }, mergeChartOptions(chartYTicks(shortenCurrency), chartTooltip({ label: currencyTooltipCallback })));
}

/**
 * Generates a YoY comparison by orchestrating a call to the period comparison chart.
 */
function generateYoYComparisonChart(periodB: string, selectedBranch: string, config?: { alsoStore?: AlsoStoreFn }) {
    const dateB = new Date(periodB + '-02');
    const yearB = dateB.getFullYear();
    const yearA = yearB - 1;
    const month = dateB.getMonth();
    const periodA = `${yearA}-${String(month + 1).padStart(2, '0')}`;

    const branchData = $store.getAllSalesData().filter(s => s.branches.includes(selectedBranch));
    const periodAData = branchData.filter(s => s.date.toISOString().startsWith(periodA));
    const periodBData = branchData.filter(s => s.date.toISOString().startsWith(periodB));

    maybeAlsoStore(config?.alsoStore, { periodA, periodB, yearA, yearB }, (v: any) => ({ yearOverYearContext: v }));

    generatePeriodComparisonLineChart(periodAData, periodBData, { canvasId: 'waktu-yoy-comparison-chart', metric: 'totalOmzet', title: 'YoY Omset', ...config });
}

/**
 * Main orchestrator for the "Analisis Perbandingan Waktu > Aspek Penjualan" section.
 */
async function generateTimeSales() {
    if (!currentUser) return;
    const periodA = (document.getElementById('waktu-penjualan-period-a') as HTMLSelectElement).value;
    const periodB = (document.getElementById('waktu-penjualan-period-b') as HTMLSelectElement).value;
    const selectedBranch = (document.getElementById('waktu-penjualan-branch-select') as HTMLSelectElement).value;
    if (!periodA || !periodB || !selectedBranch) return;

    $store.clearViewData('waktu-penjualan');
    $store.setActiveViewData('waktu-penjualan', { viewContext: { periodA, periodB, selectedBranch } }, { periodA, periodB, selectedBranch });
    const alsoStore = createAlsoStoreFn($store, 'waktu-penjualan');

    const branchData = $store.getAllSalesData().filter((s: any) => s.branches.includes(selectedBranch));
    const periodAData = branchData.filter((s: any) => s.date.toISOString().startsWith(periodA));
    const periodBData = branchData.filter(s => s.date.toISOString().startsWith(periodB));

    generatePeriodComparisonLineChart(periodAData, periodBData, { canvasId: 'waktu-omset-comparison-chart', metric: 'totalOmzet', title: 'Omset', alsoStore });
    generatePeriodComparisonLineChart(periodAData, periodBData, { canvasId: 'waktu-tc-comparison-chart', metric: 'totalTransactions', title: 'Total Check', alsoStore });
    generatePeriodComparisonLineChart(periodAData, periodBData, { canvasId: 'waktu-apc-comparison-chart', metric: 'apc', title: 'ATC', alsoStore });
    generateWeeklyTrendComparisonChart(periodAData, periodBData, 'waktu-weekly-trend-comparison-chart', { alsoStore });
    generateYoYComparisonChart(periodB, selectedBranch, { alsoStore });
}

/**
 * Updates the period selectors based on the selected branch for this section.
 */
async function updateTimeSalesPeriodSelectors(selectedBranch: string) {
    const selectA = document.getElementById('waktu-penjualan-period-a') as HTMLSelectElement;
    const selectB = document.getElementById('waktu-penjualan-period-b') as HTMLSelectElement;

    const branchData = $store.getAllSalesData().filter(s => s.branches.includes(selectedBranch));
    const periods = [...new Set(branchData.map(s => s.date.toISOString().slice(0, 7)))].sort().reverse();
    if (periods.length < 2) {
        selectA.innerHTML = '<option>Not enough data for comparison</option>';
        selectB.innerHTML = '<option>Not enough data for comparison</option>';
        return;
    }
    const periodOptionsHtml = periods.map(p => `<option value="${p}">${new Date(p + '-02').toLocaleString('default', { month: 'long', year: 'numeric' })}</option>`).join('');
    selectA.innerHTML = periodOptionsHtml;
    selectB.innerHTML = periodOptionsHtml;
    selectA.value = periods[1];
    selectB.value = periods[0];
    await generateTimeSales();
}

/**
 * Sets up the selectors for the "Waktu > Penjualan" section.
 */
export async function setupTimeSales() {
    if ($store.getInitFlag('waktuPenjualanSelectorsInitialized')) return;
    if (!currentUser) return;

    const selectA = document.getElementById('waktu-penjualan-period-a') as HTMLSelectElement;
    const selectB = document.getElementById('waktu-penjualan-period-b') as HTMLSelectElement;
    const branchSelect = document.getElementById('waktu-penjualan-branch-select') as HTMLSelectElement;

    const branches = [...new Set($store.getAllSalesData().flatMap(s => s.branches))].sort();
    if (branches.length === 0) {
        branchSelect.innerHTML = '<option>No branches found</option>';
        return;
    }
    branchSelect.innerHTML = branches.map(b => `<option value="${b}">${b}</option>`).join('');
    branchSelect.value = branches[0];

    selectA.addEventListener('change', () => generateTimeSales());
    selectB.addEventListener('change', () => generateTimeSales());
    branchSelect.addEventListener('change', async () => await updateTimeSalesPeriodSelectors(branchSelect.value));

    $store.setInitFlag('waktuPenjualanSelectorsInitialized', true);
    await updateTimeSalesPeriodSelectors(branches[0]);
}
