// Contains all logic for the "Analisis Perbandingan Cabang > Aspek Penjualan" section.

import * as $store from '@/store';
import { createChart } from '../../helpers';
import { chartTooltip, mergeChartOptions, chartYTicks, shortenNumber, shortenCurrency, currencyTooltipCallback } from '../../utils/chart-formatters';
import { AlsoStoreFn, createAlsoStoreFn, maybeAlsoStore } from '../../utils/store-helpers';
import { formatNumber, formatCurrencyUtil, formatNumberUtil } from '../../utils/string-formatters';
import { deepmerge } from 'deepmerge-ts';

/**
 * Reusable function to compare a weekly metric trend between two branches over a period.
 */
function generateBranchComparisonLineChart(periodData: any[], branchA: string, branchB: string, config: { canvasId: string, metric: 'totalOmzet' | 'totalTransactions' | 'apc', title: string, alsoStore?: AlsoStoreFn }) {
    const labels = ['Week 1 (1-7)', 'Week 2 (8-14)', 'Week 3 (15-21)', 'Week 4 (22-28)', 'Week 5 (29-31)'];
    const getWeeklyData = (branchName: string) => {
        const weeklyTotals = Array(5).fill(null).map(() => ({ revenue: 0, transactions: 0 }));
        const branchSummaries = periodData.filter(s => s.revenueByBranch?.[branchName] !== undefined);
        branchSummaries.forEach(s => {
            const dayOfMonth = s.date.getDate();
            const weekIndex = Math.floor((dayOfMonth - 1) / 7);
            if (weekIndex < 5) {
                weeklyTotals[weekIndex].revenue += s.revenueByBranch[branchName] || 0;
                weeklyTotals[weekIndex].transactions += s.transactionCountsByBranch?.[branchName] || 0;
            }
        });
        if (config.metric === 'apc') return weeklyTotals.map(week => week.transactions > 0 ? week.revenue / week.transactions : null);
        if (config.metric === 'totalTransactions') return weeklyTotals.map(week => week.transactions > 0 || week.revenue > 0 ? week.transactions : null);
        return weeklyTotals.map(week => week.transactions > 0 || week.revenue > 0 ? week.revenue : null);
    };

    const branchAData = getWeeklyData(branchA);
    const branchBData = getWeeklyData(branchB);

    maybeAlsoStore(
        config?.alsoStore,
        { branchAData, branchBData, branchA, branchB, metric: config.metric, title: config.title, labels },
        (v) => {
            const formatValue = config.metric === 'totalTransactions' ? formatNumberUtil : formatCurrencyUtil;

            return {
                [`${v.title.toLowerCase().replace(/\s+/g, '')}BranchComparison`]: {
                    [v.branchA]: deepmerge(...v.branchAData.map((value, index) =>
                        value !== null ? { [v.labels[index]]: formatValue(value) } : {}
                    )),
                    [v.branchB]: deepmerge(...v.branchBData.map((value, index) =>
                        value !== null ? { [v.labels[index]]: formatValue(value) } : {}
                    )),
                    metric: v.metric
                }
            };
        }
    );

    createChart(config.canvasId, 'line', {
        labels,
        datasets: [
            { label: `${config.title} ${branchA}`, data: branchAData, borderColor: '#9CA3AF', tension: 0.1, spanGaps: true },
            { label: `${config.title} ${branchB}`, data: branchBData, borderColor: '#4F46E5', tension: 0.1, spanGaps: true }
        ]
    }, mergeChartOptions(
        chartYTicks(config.metric === 'totalTransactions' ? shortenNumber : shortenCurrency),
        chartTooltip({ label: (context: any) => `${context.dataset.label || ''}: ${config.metric === 'totalTransactions' ? formatNumber(context.parsed.y) : formatCurrencyUtil(context.parsed.y)}` })
    ));
}

/**
 * Generates a chart comparing average sales by day of the week for two branches.
 */
function generateBranchWeeklyTrendComparisonChart(periodData: any[], branchA: string, branchB: string, canvasId: string, config?: { alsoStore?: AlsoStoreFn }) {
    const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const getAvgWeeklyData = (branchName: string) => {
        const weeklyTotals = Array(7).fill(0);
        const weeklyCounts = Array(7).fill(0);
        const seenDates = new Set();
        const branchSummaries = periodData.filter(s => s.revenueByBranch?.[branchName] !== undefined);
        branchSummaries.forEach(s => {
            const dateStr = s.date.toISOString().split('T')[0];
            const dayIndex = s.date.getDay();
            weeklyTotals[dayIndex] += s.revenueByBranch[branchName];
            if (!seenDates.has(dateStr)) {
                weeklyCounts[dayIndex]++;
                seenDates.add(dateStr);
            }
        });
        return weeklyTotals.map((total, i) => weeklyCounts[i] > 0 ? total / weeklyCounts[i] : 0);
    };

    const branchAWeekly = getAvgWeeklyData(branchA);
    const branchBWeekly = getAvgWeeklyData(branchB);

    maybeAlsoStore(
        config?.alsoStore,
        { branchAWeekly, branchBWeekly, branchA, branchB, dayLabels },
        (v) => ({
            weeklyTrendBranchComparison: {
                [v.branchA]: deepmerge(...v.branchAWeekly.map((value, index) => ({
                    [v.dayLabels[index] as string]: formatCurrencyUtil(value)
                }))),
                [v.branchB]: deepmerge(...v.branchBWeekly.map((value, index) => ({
                    [v.dayLabels[index] as string]: formatCurrencyUtil(value)
                })))
            }
        })
    );

    createChart(canvasId, 'line', {
        labels: dayLabels,
        datasets: [
            { label: `Avg Sales ${branchA}`, data: branchAWeekly, borderColor: '#9CA3AF', tension: 0.1 },
            { label: `Avg Sales ${branchB}`, data: branchBWeekly, borderColor: '#4F46E5', tension: 0.1 }
        ]
    }, mergeChartOptions(chartYTicks(shortenCurrency), chartTooltip({ label: currencyTooltipCallback })));
}

/**
 * Main orchestrator for the "Analisis Perbandingan Cabang > Aspek Penjualan" section.
 */
function generateBranchSales() {
    const period = (document.getElementById('cabang-penjualan-period-select') as HTMLSelectElement).value;
    const branchA = (document.getElementById('cabang-penjualan-branch-a-select') as HTMLSelectElement).value;
    const branchB = (document.getElementById('cabang-penjualan-branch-b-select') as HTMLSelectElement).value;
    if (!period || !branchA || !branchB || branchA === branchB) return;

    $store.clearViewData('cabang-penjualan');
    $store.setActiveViewData('cabang-penjualan', { viewContext: { period, branchA, branchB } }, { period, branchA, branchB });
    const alsoStore = createAlsoStoreFn($store, 'cabang-penjualan');

    const periodData = $store.getAllSalesData().filter((s: any) => s.date.toISOString().startsWith(period));

    generateBranchComparisonLineChart(periodData, branchA, branchB, { canvasId: 'cabang-omset-comparison-chart', metric: 'totalOmzet', title: 'Omset', alsoStore });
    generateBranchComparisonLineChart(periodData, branchA, branchB, { canvasId: 'cabang-tc-comparison-chart', metric: 'totalTransactions', title: 'Total Check', alsoStore });
    generateBranchComparisonLineChart(periodData, branchA, branchB, { canvasId: 'cabang-apc-comparison-chart', metric: 'apc', title: 'ATC', alsoStore });
    generateBranchWeeklyTrendComparisonChart(periodData, branchA, branchB, 'cabang-weekly-trend-comparison-chart', { alsoStore });
}

/**
 * Sets up the selectors for the "Cabang > Penjualan" section.
 */
export async function setupBranchSales() {
    if ($store.getInitFlag('cabangPenjualanSelectorsInitialized')) return;

    const periodSelect = document.getElementById('cabang-penjualan-period-select') as HTMLSelectElement;
    const branchASelect = document.getElementById('cabang-penjualan-branch-a-select') as HTMLSelectElement;
    const branchBSelect = document.getElementById('cabang-penjualan-branch-b-select') as HTMLSelectElement;

    const periods = [...new Set($store.getAllSalesData().map(s => s.date.toISOString().slice(0, 7)))].sort().reverse();
    const branches = [...new Set($store.getAllSalesData().flatMap(s => Object.keys(s.revenueByBranch || {})))].sort();

    if (periods.length === 0 || branches.length < 2) { return; }

    periodSelect.innerHTML = periods.map(p => `<option value="${p}">${new Date(p + '-02').toLocaleString('default', { month: 'long', year: 'numeric' })}</option>`).join('');
    branchASelect.innerHTML = branches.map(b => `<option value="${b}">${b}</option>`).join('');
    branchBSelect.innerHTML = branches.map(b => `<option value="${b}">${b}</option>`).join('');

    branchASelect.value = branches[0];
    branchBSelect.value = branches[1];

    const handler = () => generateBranchSales();
    periodSelect.addEventListener('change', handler);
    branchASelect.addEventListener('change', handler);
    branchBSelect.addEventListener('change', handler);

    $store.setInitFlag('cabangPenjualanSelectorsInitialized', true);
    generateBranchSales();
}
