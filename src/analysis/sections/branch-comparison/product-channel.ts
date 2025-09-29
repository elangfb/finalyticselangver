// Contains all logic for the "Analisis Perbandingan Cabang > Aspek Produk & Channel" section.

import * as $store from '../../../store';
import { createChart } from '../../helpers';
import { chartTooltip, mergeChartOptions, chartYTicks, shortenNumber, currencyTooltipCallback } from '../../utils/chart-formatters';
import { AlsoStoreFn, createAlsoStoreFn, maybeAlsoStore } from '../../utils/store-helpers';
import { formatNumber, formatNumberUtil, formatCurrencyUtil } from '../../utils/string-formatters';
import { deepmerge } from 'deepmerge-ts';

declare const SlimSelect: any;

/**
 * Draws the menu trend chart comparing selected menus between two branches.
 */
function drawBranchMenuTrendChart(periodData: any[], branchA: string, branchB: string, config?: { alsoStore?: AlsoStoreFn }) {
    const cabangMenuSelect = $store.getUIComponent('cabangMenuTrendSelect');
    if (!cabangMenuSelect) return;

    const selectedMenus = cabangMenuSelect.getSelected() as string[];
    const labels = ['Week 1 (1-7)', 'Week 2 (8-14)', 'Week 3 (15-21)', 'Week 4 (22-28)', 'Week 5 (29-31)'];
    const colors = ['#3B82F6', '#10B981', '#F97316', '#8B5CF6', '#EF4444'];

    const getWeeklyMenuDataForBranch = (data: any[], branchName: string, menuName: string) => {
        const weeklyQuantities = Array(5).fill(null);
        const branchData = data.filter(s => s.revenueByBranch?.[branchName] !== undefined);
        branchData.forEach(s => {
            const dayOfMonth = s.date.getDate();
            const weekIndex = Math.floor((dayOfMonth - 1) / 7);
            if (weekIndex < 5) {
                let qty = 0;
                if (s.menuItemQuantities) {
                    for (const category in s.menuItemQuantities) {
                        if (s.menuItemQuantities[category][menuName]) qty += s.menuItemQuantities[category][menuName];
                    }
                }
                if (qty > 0) {
                    if (weeklyQuantities[weekIndex] === null) weeklyQuantities[weekIndex] = 0;
                    weeklyQuantities[weekIndex] += qty;
                }
            }
        });
        return weeklyQuantities;
    };

    const datasets = selectedMenus.flatMap((menuName, index) => {
        const color = colors[index % colors.length];
        return [
            { label: `${menuName} (${branchA})`, data: getWeeklyMenuDataForBranch(periodData, branchA, menuName), borderColor: color, borderDash: [5, 5], tension: 0.1, spanGaps: true },
            { label: `${menuName} (${branchB})`, data: getWeeklyMenuDataForBranch(periodData, branchB, menuName), borderColor: color, borderDash: [], tension: 0.1, spanGaps: true }
        ];
    });

    config?.alsoStore?.(datasets, (v) => {
        const branchADatasets = v.filter(d => d.label.includes(`(${branchA})`));
        const branchBDatasets = v.filter(d => d.label.includes(`(${branchB})`));

        return {
            menuTrend: {
                branches: {
                    [branchA]: deepmerge(...branchADatasets.map(d => ({
                        [d.label.replace(` (${branchA})`, '')]: deepmerge(...d.data.map((value, index) => ({
                            [labels[index]]: formatNumberUtil(value),
                        }))),
                    }))),
                    [branchB]: deepmerge(...branchBDatasets.map(d => ({
                        [d.label.replace(` (${branchB})`, '')]: deepmerge(...d.data.map((value, index) => ({
                            [labels[index]]: formatNumberUtil(value),
                        }))),
                    })))
                }
            }
        };
    });

    createChart('cabang-menu-trend-chart', 'line', { labels, datasets }, mergeChartOptions(
        { plugins: { tooltip: { mode: 'index', intersect: false } }, scales: { x: { title: { display: true, text: 'Week of Month' } }, y: { title: { display: true, text: 'Quantity Sold' } } } },
        chartYTicks(shortenNumber),
        chartTooltip({ label: (context: any) => `${context.dataset.label || ''}: ${formatNumber(context.parsed.y)} items` })
    ));
}

/**
 * Sets up the interactive multi-select menu trend chart for comparing two branches.
 */
function setupBranchMenuTrendChart(periodData: any[], branchA: string, branchB: string, config?: { alsoStore?: AlsoStoreFn }) {
    const existingSelect = $store.getUIComponent('cabangMenuTrendSelect');
    if (existingSelect) existingSelect.destroy();

    const selectEl = document.getElementById('cabang-menu-trend-select') as HTMLSelectElement;
    const branchAData = periodData.filter(s => s.revenueByBranch?.[branchA] !== undefined);
    const branchBData = periodData.filter(s => s.revenueByBranch?.[branchB] !== undefined);
    const combinedData = [...branchAData, ...branchBData];
    const allMenuItems = [...new Set(combinedData.flatMap(s => Object.keys(s.menuItemQuantities || {}).flatMap(cat => Object.keys(s.menuItemQuantities[cat]))))].sort();

    selectEl.innerHTML = allMenuItems.map(name => `<option value="${name}">${name}</option>`).join('');

    $store.setUIComponent('cabangMenuTrendSelect',
      new SlimSelect({
        select: '#cabang-menu-trend-select',
        events: { afterChange: () => drawBranchMenuTrendChart(periodData, branchA, branchB, config) }
      }),
      ($select) => $select.setSelected(allMenuItems.slice(0, 3))
    );
}

/**
 * Generates a grouped bar chart comparing the composition of orders between two branches.
 */
function generateOrderCompositionChart(dataA: any[], dataB: any[], labelA: string, labelB: string, canvasId: string, config?: { alsoStore?: AlsoStoreFn }) {
    const aggregateComposition = (summaries: any[]) => {
        return summaries.reduce((acc, s) => {
            if (s.orderComposition) {
                acc.foodOnly += s.orderComposition.foodOnly?.count || 0;
                acc.drinkOnly += s.orderComposition.drinkOnly?.count || 0;
                acc.mixed += s.orderComposition.mixed?.count || 0;
            }
            return acc;
        }, { foodOnly: 0, drinkOnly: 0, mixed: 0 });
    };

    const compositionA = aggregateComposition(dataA);
    const compositionB = aggregateComposition(dataB);
    const labels = ['Food Only Checks', 'Drink Only Checks', 'Mixed Checks'];
    const valuesA = [compositionA.foodOnly, compositionA.drinkOnly, compositionA.mixed];
    const valuesB = [compositionB.foodOnly, compositionB.drinkOnly, compositionB.mixed];

    maybeAlsoStore(
        config?.alsoStore,
        { labels, valuesA, valuesB },
        (v) => ({
            orderComposition: {
                [labelA]: {
                    [v.labels[0]]: formatNumberUtil(v.valuesA[0]),
                    [v.labels[1]]: formatNumberUtil(v.valuesA[1]),
                    [v.labels[2]]: formatNumberUtil(v.valuesA[2]),
                },
                [labelB]: {
                    [v.labels[0]]: formatNumberUtil(v.valuesB[0]),
                    [v.labels[1]]: formatNumberUtil(v.valuesB[1]),
                    [v.labels[2]]: formatNumberUtil(v.valuesB[2]),
                }
            }
        })
    );

    createChart(canvasId, 'bar', {
        labels,
        datasets: [ { label: labelA, data: valuesA, backgroundColor: '#9CA3AF' }, { label: labelB, data: valuesB, backgroundColor: '#4F46E5' } ]
    }, mergeChartOptions(chartYTicks(shortenNumber), chartTooltip({ label: (context: any) => `${context.dataset.label || ''}: ${formatNumber(context.parsed.y)} checks` })));
}

/**
 * Generates a grouped bar chart comparing channel revenue between two branches.
 */
function generateBranchChannelComparisonChart(periodData: any[], branchA: string, branchB: string, canvasId: string, config?: { alsoStore?: AlsoStoreFn }) {
    const branchAData = periodData.filter(s => s.revenueByBranch?.[branchA] !== undefined);
    const branchBData = periodData.filter(s => s.revenueByBranch?.[branchB] !== undefined);
    const allChannels = [...new Set([...branchAData, ...branchBData].flatMap(s => Object.keys(s.revenueByVisitPurpose || {})))];
    const getData = (data: any[]) => allChannels.map(chan => data.reduce((sum, s) => sum + (s.revenueByVisitPurpose?.[chan] || 0), 0));
    const branchAValues = getData(branchAData);
    const branchBValues = getData(branchBData);

    maybeAlsoStore(
        config?.alsoStore,
        { allChannels, branchAValues, branchBValues },
        (data) => ({
            channelComparison: {
                channels: data.allChannels,
                revenuePerformance: deepmerge(
                    ...data.allChannels.map((channel, index) => ({
                        [channel]: {
                            branches: {
                                [branchA]: formatCurrencyUtil(data.branchAValues[index]),
                                [branchB]: formatCurrencyUtil(data.branchBValues[index]),
                            },
                            leader: data.branchAValues[index] > data.branchBValues[index] ? branchA :
                                   data.branchBValues[index] > data.branchAValues[index] ? branchB : 'Equal'
                        }
                    }))
                ),
            }
        })
    );

    createChart(canvasId, 'bar', {
        labels: allChannels,
        datasets: [ { label: branchA, data: branchAValues, backgroundColor: '#9CA3AF' }, { label: branchB, data: branchBValues, backgroundColor: '#4F46E5' } ]
    }, mergeChartOptions({ scales: { y: { ticks: { callback: shortenCurrency } } } }, chartTooltip({ label: currencyTooltipCallback })));
}

/**
 * Main orchestrator for the "Analisis Perbandingan Cabang > Aspek Produk dan Channel" section.
 */
function generateBranchProductChannel() {
    const period = (document.getElementById('cabang-produk-channel-period-select') as HTMLSelectElement).value;
    const branchA = (document.getElementById('cabang-produk-channel-branch-a-select') as HTMLSelectElement).value;
    const branchB = (document.getElementById('cabang-produk-channel-branch-b-select') as HTMLSelectElement).value;
    if (!period || !branchA || !branchB || branchA === branchB) return;

    const periodData = $store.getAllSalesData().filter(s => s.date.toISOString().startsWith(period));
    $store.clearViewData('cabang-produk-channel');
    $store.setActiveViewData('cabang-produk-channel', { viewContext: { period, branchA, branchB } }, { period, branchA, branchB });
    const alsoStore = createAlsoStoreFn($store, 'cabang-produk-channel');

    const branchAData = periodData.filter(s => s.branches.includes(branchA));
    const branchBData = periodData.filter(s => s.branches.includes(branchB));

    setupBranchMenuTrendChart(periodData, branchA, branchB, { alsoStore });
    generateOrderCompositionChart(branchAData, branchBData, branchA, branchB, 'cabang-category-comparison-chart', { alsoStore });
    generateBranchChannelComparisonChart(periodData, branchA, branchB, 'cabang-channel-comparison-chart', { alsoStore });
}

/**
 * Sets up the selectors for the "Cabang > Produk dan Channel" section.
 */
export async function setupBranchProductChannel() {
    if ($store.getInitFlag('cabangProdukChannelSelectorsInitialized')) return;

    const periodSelect = document.getElementById('cabang-produk-channel-period-select') as HTMLSelectElement;
    const branchASelect = document.getElementById('cabang-produk-channel-branch-a-select') as HTMLSelectElement;
    const branchBSelect = document.getElementById('cabang-produk-channel-branch-b-select') as HTMLSelectElement;

    const periods = [...new Set($store.getAllSalesData().map(s => s.date.toISOString().slice(0, 7)))].sort().reverse();
    const branches = [...new Set($store.getAllSalesData().flatMap(s => Object.keys(s.revenueByBranch || {})))].sort();
    if (periods.length === 0 || branches.length < 2) return;

    periodSelect.innerHTML = periods.map(p => `<option value="${p}">${new Date(p + '-02').toLocaleString('default', { month: 'long', year: 'numeric' })}</option>`).join('');
    branchASelect.innerHTML = branches.map(b => `<option value="${b}">${b}</option>`).join('');
    branchBSelect.innerHTML = branches.map(b => `<option value="${b}">${b}</option>`).join('');

    branchASelect.value = branches[0];
    branchBSelect.value = branches[1];

    const handler = () => generateBranchProductChannel();
    periodSelect.addEventListener('change', handler);
    branchASelect.addEventListener('change', handler);
    branchBSelect.addEventListener('change', handler);

    $store.setInitFlag('cabangProdukChannelSelectorsInitialized', true);
    generateBranchProductChannel();
}
