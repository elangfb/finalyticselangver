// Contains all logic for the "Analisis Perbandingan Waktu > Aspek Produk & Channel" section.

import * as $store from '@/store';
import { currentUser } from '@/core/state';
import { createChart } from '../../helpers';
import { chartTooltip, mergeChartOptions, chartYTicks, shortenNumber, currencyTooltipCallback } from '../../utils/chart-formatters';
import { AlsoStoreFn, createAlsoStoreFn, maybeAlsoStore } from '../../utils/store-helpers';
import { formatNumber, formatCurrencyUtil, formatNumberUtil } from '../../utils/string-formatters';
import { deepmerge } from 'deepmerge-ts';

declare const SlimSelect: any;

/**
 * Draws the menu trend comparison chart based on selected menus for two time periods.
 */
function drawTimeMenuTrendChart(periodAData: any[], periodBData: any[], config?: { alsoStore?: AlsoStoreFn }) {
    const waktuMenuSelect = $store.getUIComponent('waktuMenuTrendSelect');
    if (!waktuMenuSelect) return;

    const selectedMenus = waktuMenuSelect.getSelected() as string[];
    const labels = ['Week 1 (1-7)', 'Week 2 (8-14)', 'Week 3 (15-21)', 'Week 4 (22-28)', 'Week 5 (29-31)'];
    const colors = ['#3B82F6', '#10B981', '#F97316', '#8B5CF6', '#EF4444'];

    const getWeeklyMenuData = (data: any[], menuName: string) => {
        const weeklyQuantities = Array(5).fill(null);
        data.forEach(s => {
            const dayOfMonth = s.date.getDate();
            const weekIndex = Math.floor((dayOfMonth - 1) / 7);
            if (weekIndex < 5) {
                let qty = 0;
                if (s.menuItemQuantities) {
                    for (const category in s.menuItemQuantities) {
                        if (s.menuItemQuantities[category][menuName]) {
                            qty += s.menuItemQuantities[category][menuName];
                        }
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
            { label: `${menuName} (Period A)`, data: getWeeklyMenuData(periodAData, menuName), borderColor: color, borderDash: [5, 5], tension: 0.1, spanGaps: true, hidden: true },
            { label: `${menuName} (Period B)`, data: getWeeklyMenuData(periodBData, menuName), borderColor: color, borderDash: [], tension: 0.1, spanGaps: true }
        ];
    });

    config?.alsoStore?.(datasets, (v) => {
        const periodADatasets = v.filter(d => d.label.includes('(Period A)'));
        const periodBDatasets = v.filter(d => d.label.includes('(Period B)'));

        return {
            menuTrend: {
                periodA: deepmerge(...periodADatasets.map(d => ({
                    [d.label.replace(' (Period A)', '')]: deepmerge(...d.data.map((value, index) => ({
                        [labels[index]]: formatNumberUtil(value),
                    }))),
                }))),
                periodB: deepmerge(...periodBDatasets.map(d => ({
                    [d.label.replace(' (Period B)', '')]: deepmerge(...d.data.map((value, index) => ({
                        [labels[index]]: formatNumberUtil(value),
                    }))),
                })))
            }
        };
    });

    createChart('waktu-menu-trend-chart', 'line', { labels, datasets }, mergeChartOptions(
        { plugins: { tooltip: { mode: 'index', intersect: false } }, scales: { x: { title: { display: true, text: 'Week of Month' } }, y: { title: { display: true, text: 'Quantity Sold' } } } },
        chartYTicks(shortenNumber),
        chartTooltip({ label: (context: any) => `${context.dataset.label || ''}: ${formatNumber(context.parsed.y)} items` })
    ));
}

/**
 * Sets up the interactive multi-select menu trend chart for comparing two periods.
 */
function setupTimeMenuTrendChart(periodAData: any[], periodBData: any[], config?: { alsoStore?: AlsoStoreFn }) {
    const existingSelect = $store.getUIComponent('waktuMenuTrendSelect');
    if (existingSelect) existingSelect.destroy();

    const selectEl = document.getElementById('waktu-menu-trend-select') as HTMLSelectElement;
    const combinedData = [...periodAData, ...periodBData];
    const allMenuItems = [...new Set(combinedData.flatMap(s => Object.keys(s.menuItemQuantities || {}).flatMap(cat => Object.keys(s.menuItemQuantities[cat]))))].sort();

    selectEl.innerHTML = allMenuItems.map(name => `<option value="${name}">${name}</option>`).join('');

    $store.setUIComponent('waktuMenuTrendSelect',
      new SlimSelect({
        select: '#waktu-menu-trend-select',
        events: { afterChange: () => drawTimeMenuTrendChart(periodAData, periodBData, config) }
      }),
      ($select) => $select.setSelected(allMenuItems.slice(0, 3))
    );
}

/**
 * Generates a grouped bar chart comparing menu category quantities between two periods.
 */
function generateCategoryComparisonChart(periodAData: any[], periodBData: any[], canvasId: string, config?: { alsoStore?: AlsoStoreFn }) {
    const allCategories = [...new Set([...periodAData, ...periodBData].flatMap(s => Object.keys(s.menuCategories || {})))];
    const getData = (data: any[]) => allCategories.map(cat => data.reduce((sum, s) => sum + (s.menuCategories?.[cat]?.quantity || 0), 0));
    const periodAValues = getData(periodAData);
    const periodBValues = getData(periodBData);

    maybeAlsoStore(
        config?.alsoStore,
        { allCategories, periodAValues, periodBValues },
        (v) => ({
            categoryComparison: {
                periodA: deepmerge(...v.allCategories.map((category, index) => ({
                    [category]: formatNumberUtil(v.periodAValues[index])
                }))),
                periodB: deepmerge(...v.allCategories.map((category, index) => ({
                    [category]: formatNumberUtil(v.periodBValues[index])
                })))
            }
        })
    );

    createChart(canvasId, 'bar', {
        labels: allCategories,
        datasets: [
            { label: 'Period A', data: periodAValues, backgroundColor: '#9CA3AF' },
            { label: 'Period B', data: periodBValues, backgroundColor: '#4F46E5' }
        ]
    }, mergeChartOptions(chartYTicks(shortenNumber), chartTooltip({ label: (context: any) => `${context.dataset.label || ''}: ${formatNumber(context.parsed.y)} items` })));
}

/**
 * Generates a grouped bar chart comparing channel revenue between two periods.
 */
function generateChannelComparisonChart(periodAData: any[], periodBData: any[], canvasId: string, config?: { alsoStore?: AlsoStoreFn }) {
    const allChannels = [...new Set([...periodAData, ...periodBData].flatMap(s => Object.keys(s.revenueByVisitPurpose || {})))];
    const getData = (data: any[]) => allChannels.map(chan => data.reduce((sum, s) => sum + (s.revenueByVisitPurpose?.[chan] || 0), 0));
    const periodAValues = getData(periodAData);
    const periodBValues = getData(periodBData);

    maybeAlsoStore(
        config?.alsoStore,
        { allChannels, periodAValues, periodBValues },
        (v) => ({
            channelComparison: {
                periodA: deepmerge(...v.allChannels.map((channel, index) => ({
                    [channel]: formatCurrencyUtil(v.periodAValues[index])
                }))),
                periodB: deepmerge(...v.allChannels.map((channel, index) => ({
                    [channel]: formatCurrencyUtil(v.periodBValues[index])
                })))
            }
        })
    );

    createChart(canvasId, 'bar', {
        labels: allChannels,
        datasets: [
            { label: 'Period A', data: periodAValues, backgroundColor: '#9CA3AF' },
            { label: 'Period B', data: periodBValues, backgroundColor: '#4F46E5' }
        ]
    }, mergeChartOptions({ scales: { y: { ticks: { callback: shortenCurrency } } } }, chartTooltip({ label: currencyTooltipCallback })));
}


/**
 * Main orchestrator for the "Analisis Perbandingan Waktu > Aspek Produk dan Channel" section.
 */
async function generateTimeProductChannel() {
    if (!currentUser) return;
    const periodA = (document.getElementById('waktu-produk-period-a') as HTMLSelectElement).value;
    const periodB = (document.getElementById('waktu-produk-period-b') as HTMLSelectElement).value;
    const selectedBranch = (document.getElementById('waktu-produk-branch-select') as HTMLSelectElement).value;

    if (!periodA || !periodB || !selectedBranch) return;

    $store.clearViewData('waktu-produk-channel');
    $store.setActiveViewData('waktu-produk-channel', { viewContext: { periodA, periodB, selectedBranch } }, { periodA, periodB, selectedBranch });
    const alsoStore = createAlsoStoreFn($store, 'waktu-produk-channel');

    const branchData = $store.getAllSalesData().filter(s => s.branches.includes(selectedBranch));
    const periodAData = branchData.filter(s => s.date.toISOString().startsWith(periodA));
    const periodBData = branchData.filter(s => s.date.toISOString().startsWith(periodB));

    setupTimeMenuTrendChart(periodAData, periodBData, { alsoStore });
    generateCategoryComparisonChart(periodAData, periodBData, 'waktu-category-comparison-chart', { alsoStore });
    generateChannelComparisonChart(periodAData, periodBData, 'waktu-channel-comparison-chart', { alsoStore });
}

/**
 * Updates the Period A and Period B selectors based on the selected branch.
 */
async function updateTimeProductChannelPeriodSelectors(selectedBranch: string) {
    const selectA = document.getElementById('waktu-produk-period-a') as HTMLSelectElement;
    const selectB = document.getElementById('waktu-produk-period-b') as HTMLSelectElement;

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
    await generateTimeProductChannel();
}

/**
 * Sets up the selectors for the "Waktu > Produk dan Channel" section.
 */
export async function setupTimeProductChannel() {
    if ($store.getInitFlag('waktuProdukChannelSelectorsInitialized')) return;
    if (!currentUser) return;

    const selectA = document.getElementById('waktu-produk-period-a') as HTMLSelectElement;
    const selectB = document.getElementById('waktu-produk-period-b') as HTMLSelectElement;
    const branchSelect = document.getElementById('waktu-produk-branch-select') as HTMLSelectElement;

    const branches = [...new Set($store.getAllSalesData().flatMap(s => s.branches))].sort();
    if (branches.length === 0) {
        branchSelect.innerHTML = '<option>No branches found</option>';
        return;
    }
    branchSelect.innerHTML = branches.map(b => `<option value="${b}">${b}</option>`).join('');
    branchSelect.value = branches[0];

    selectA.addEventListener('change', () => generateTimeProductChannel());
    selectB.addEventListener('change', () => generateTimeProductChannel());
    branchSelect.addEventListener('change', async () => await updateTimeProductChannelPeriodSelectors(branchSelect.value));

    $store.setInitFlag('waktuProdukChannelSelectorsInitialized', true);
    await updateTimeProductChannelPeriodSelectors(branches[0]);
}
