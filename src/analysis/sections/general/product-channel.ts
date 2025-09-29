// Contains all logic for the "Analisis General > Aspek Produk & Channel" section.

import * as $store from '../../../store';
import { createChart } from '../../helpers';
import { chartTooltip, currencyTooltipCallback, chartXTicks, chartYTicks, mergeChartOptions, shortenDateTickCallback, shortenNumber } from '../../utils/chart-formatters';
import { AlsoStoreFn, createAlsoStoreFn } from '../../utils/store-helpers';
import { formatNumber, formatNumberUtil, formatCurrencyUtil, formatMachineYearMonthDay } from '../../utils/string-formatters';
import { deepmerge } from 'deepmerge-ts';

declare const SlimSelect: any;

/**
 * Generates the "Penjualan per Channel" doughnut chart.
 */
function generateChannelDonutChart(summaries: any[], canvasId: string, config?: { alsoStore?: AlsoStoreFn }) {
    const channelSales = summaries.reduce((acc, s) => {
        if (s.revenueByVisitPurpose) {
            for (const channel in s.revenueByVisitPurpose) {
                acc[channel] = (acc[channel] || 0) + s.revenueByVisitPurpose[channel];
            }
        }
        return acc;
    }, {});

    config?.alsoStore?.(channelSales, (v) => ({
      channelSales: Object.fromEntries(Object.entries(v).map(([channel, sales]) => (
        [channel, formatCurrencyUtil(sales as number)]
      ))),
    }));

    createChart(canvasId, 'doughnut', {
        labels: Object.keys(channelSales),
        datasets: [{
            data: Object.values(channelSales),
            backgroundColor: ['#3B82F6', '#10B981', '#F97316', '#8B5CF6', '#EC4444', '#F59E0B'],
        }],
    }, chartTooltip({ label: currencyTooltipCallback }));
}

/**
 * Generates an "Order by Menu Category" doughnut chart.
 */
function generateOrderByCategoryDonutChart(summaries: any[], canvasId: string, config?: { alsoStore?: AlsoStoreFn }) {
    const byMenuCategory = summaries.reduce((acc, s) => {
        if (s.menuCategories) {
            for (const category in s.menuCategories) {
                acc[category] = (acc[category] || 0) + s.menuCategories[category].quantity;
            }
        }
        return acc;
    }, {});

    config?.alsoStore?.(byMenuCategory, (v) => ({
      totalOrderByMenuCategory: Object.fromEntries(Object.entries(v).map(([category, totalOrder]) => (
        [category, formatNumberUtil(totalOrder as number)]
      ))),
    }));

    createChart(canvasId, 'doughnut', {
        labels: Object.keys(byMenuCategory),
        datasets: [{ data: Object.values(byMenuCategory), backgroundColor: ['#10B981', '#3B82F6', '#F97316', '#8B5CF6'] }],
    }, chartTooltip({
        label: (context: any) => {
            const label = context.label || '';
            const value = context.parsed;
            return `${label}: ${formatNumber(value)} items`;
        }
    }));
}

/**
 * Generates a "Top 5 Items" doughnut chart for a specific menu category, grouping others.
 */
function generateTopItemsDonutChart(summaries: any[], canvasId: string, categoryName: string, config?: { alsoStore?: AlsoStoreFn }) {
    const allItems = summaries.reduce((acc, s) => {
        if (s.menuItemQuantities && s.menuItemQuantities[categoryName]) {
            for (const menuName in s.menuItemQuantities[categoryName]) {
                if (!menuName.includes('(PACKAGE)')) {
                    acc[menuName] = (acc[menuName] || 0) + s.menuItemQuantities[categoryName][menuName];
                }
            }
        }
        return acc;
    }, {} as {[key: string]: number});

    const sortedItems = Object.entries(allItems).sort((a, b) => (b[1] as number) - (a[1] as number));
    const top5 = sortedItems.slice(0, 5);
    const othersCount = sortedItems.slice(5).reduce((sum, item) => sum + (item[1] as number), 0);

    const labels = top5.map(item => item[0]);
    const data = top5.map(item => item[1]);

    if (othersCount > 0) {
        labels.push('Others');
        data.push(othersCount);
    }

    // Storing for AI is complex here due to "Others", so we'll omit it for simplicity.

    createChart(canvasId, 'doughnut', {
        labels,
        datasets: [{ data, backgroundColor: ['#3B82F6', '#10B981', '#F97316', '#8B5CF6', '#EF4444', '#9CA3AF'] }]
    }, chartTooltip({
        label: (context: any) => {
            const label = context.label || '';
            const value = context.parsed;
            return `${label}: ${formatNumber(value)} items`;
        }
    }));
}

/**
 * Draws the general menu trend chart based on the current dropdown selection.
 */
function drawGeneralMenuTrendChart(summaries: any[], canvasId: string, config?: { alsoStore?: AlsoStoreFn }) {
    const menuSelect = $store.getUIComponent('generalMenuTrendSelect');
    if (!menuSelect) return;

    const selectedMenus = menuSelect.getSelected() as string[];
    const labels = [...new Set(summaries.map(s => s.date.toISOString().split('T')[0]))].sort();

    const datasets = selectedMenus.map((menuName, index) => {
        const dataPoints = labels.map(dateStr => {
            const summaryForDay = summaries.find(s => s.date.toISOString().startsWith(dateStr));
            let quantity = 0;
            if (summaryForDay && summaryForDay.menuItemQuantities) {
                for (const category in summaryForDay.menuItemQuantities) {
                    if (summaryForDay.menuItemQuantities[category][menuName]) {
                        quantity = summaryForDay.menuItemQuantities[category][menuName];
                        break;
                    }
                }
            }
            return quantity;
        });

        const colors = ['#3B82F6', '#10B981', '#F97316', '#8B5CF6', '#EF4444'];
        return {
            label: menuName,
            data: dataPoints,
            borderColor: colors[index % colors.length],
            tension: 0.1,
            fill: false
        };
    });

    config?.alsoStore?.(datasets, (v) => ({
        menuTrend: deepmerge(...v.map(d => ({
            [d.label]: deepmerge(...d.data.map((v, index) => ({
                [formatMachineYearMonthDay(labels[index])]: formatNumberUtil(v),
            }))),
        }))),
    }));

    createChart(canvasId, 'line', { labels, datasets }, mergeChartOptions(
        chartYTicks(shortenNumber),
        chartXTicks(shortenDateTickCallback),
        chartTooltip({
            label: (context: any) => `${context.dataset.label || ''}: ${formatNumber(context.parsed.y)} items`
        })
    ));
}

/**
 * Sets up the multi-select dropdown for the general menu trend chart.
 */
function setupGeneralMenuTrendChart(summaries: any[], selectId: string, canvasId: string, config?: { alsoStore?: AlsoStoreFn }) {
    if ($store.getUIComponent('generalMenuTrendSelect')) {
        drawGeneralMenuTrendChart(summaries, canvasId, config);
        return;
    }

    const menuSelectElement = document.getElementById(selectId) as HTMLSelectElement;
    const allMenuItems = new Set<string>();

    summaries.forEach(s => {
        if (s.menuItemQuantities) {
            for (const category in s.menuItemQuantities) {
                for (const menuName in s.menuItemQuantities[category]) {
                    if (!menuName.includes('(PACKAGE)')) allMenuItems.add(menuName);
                }
            }
        }
    });

    const sortedMenuItems = Array.from(allMenuItems).sort();
    if(sortedMenuItems.length === 0) {
        menuSelectElement.innerHTML = `<option disabled>No menu items found in this period</option>`;
        return;
    }
    menuSelectElement.innerHTML = sortedMenuItems.map(name => `<option value="${name}">${name}</option>`).join('');

    $store.setUIComponent('generalMenuTrendSelect',
      new SlimSelect({
        select: `#${selectId}`,
        settings: { placeholderText: 'Select menus...' },
        events: { afterChange: () => drawGeneralMenuTrendChart($store.getAllSalesData(), canvasId, config) }
      }),
      ($select) => $select.setSelected(sortedMenuItems.slice(0, 3))
    );
}

/**
 * Main orchestrator for the "Aspek Produk dan Channel" section.
 */
function generateGeneralProductChannel() {
    const branchSelect = document.getElementById('general-produk-channel-branch-select') as HTMLSelectElement;
    const selectedBranch = branchSelect?.value;

    const currentStartDate = new Date((document.getElementById('date-start') as HTMLInputElement).value);
    const currentEndDate = new Date((document.getElementById('date-end') as HTMLInputElement).value);
    currentEndDate.setHours(23, 59, 59, 999);

    let summaries = $store.getAllSalesData().filter((summary) => summary.date >= currentStartDate && summary.date <= currentEndDate);

    if (selectedBranch && selectedBranch !== 'ALL') {
        summaries = summaries.filter(s => s.branches.includes(selectedBranch));
    }

    const dates = summaries.map(s => s.date).sort((a, b) => a.getTime() - b.getTime());
    const minDate = dates.length > 0 ? dates[0].toISOString().split('T')[0] : 'N/A';
    const maxDate = dates.length > 0 ? dates[dates.length - 1].toISOString().split('T')[0] : 'N/A';

    $store.clearViewData('general-produk-channel');
    $store.setActiveViewData('general-produk-channel', {
        viewContext: {
            selectedBranch: selectedBranch || "All Branches",
            periodRange: summaries.length > 0 ? `${minDate} to ${maxDate}` : 'No data',
            dataSource: "Daily sales summaries with menu items, channels, and categories"
        }
    }, { selectedBranch });

    const alsoStore = createAlsoStoreFn($store, 'general-produk-channel');

    setupGeneralMenuTrendChart(summaries, 'general-menu-trend-select', 'general-menu-trend-chart', { alsoStore });
    generateChannelDonutChart(summaries, 'general-channel-donut-chart', { alsoStore });
    generateOrderByCategoryDonutChart(summaries, 'general-category-donut-chart', { alsoStore });
    generateTopItemsDonutChart(summaries, 'general-top-makanan-donut-chart', 'MAKANAN', { alsoStore });
    generateTopItemsDonutChart(summaries, 'general-top-minuman-donut-chart', 'MINUMAN', { alsoStore });
}

/**
 * Sets up the filters (Branch selector) for the General Product & Channel section.
 */
export async function setupGeneralProductChannelSelectors() {
    if ($store.getInitFlag('generalProdukChannelSelectorInitialized')) return;

    const branchSelect = document.getElementById('general-produk-channel-branch-select') as HTMLSelectElement;
    if (!branchSelect) return;

    const branches = [...new Set($store.getAllSalesData().flatMap(s => s.branches))].sort();
    branchSelect.innerHTML = `<option value="ALL">All Branches</option>` + branches.map(b => `<option value="${b}">${b}</option>`).join('');

    branchSelect.addEventListener('change', () => generateGeneralProductChannel());

    $store.setInitFlag('generalProdukChannelSelectorInitialized', true);
    generateGeneralProductChannel();
}
