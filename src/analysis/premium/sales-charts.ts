import { createChart } from '@/analysis/helpers';
import { chartTooltip, currencyTooltipCallback, mergeChartOptions, shortenCurrency } from '@/analysis/utils/chart-formatters';
import type { SalesSummary } from '@/analysis/sections/general/sales/types';
import { formatCurrency, formatNumber } from '@/utils/string';

/**
 * Generates a yearly omzet chart, aggregating data by month.
 */
export function generateOmzetYearlyChart(summaries: SalesSummary[], canvasId: string) {
    const monthlyTotals = Array(12).fill(0);
    summaries.forEach(s => {
        const month = s.date.getMonth(); // 0-11
        monthlyTotals[month] += s.totalOmzet;
    });

    const labels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    createChart(canvasId, 'bar', {
        labels,
        datasets: [{
            label: 'Total Omzet',
            data: monthlyTotals,
            backgroundColor: '#4f46e5',
        }],
    }, mergeChartOptions(
        { scales: { y: { ticks: { callback: (n: any) => shortenCurrency(n) } } } },
        chartTooltip({ label: currencyTooltipCallback })
    ));
}

/**
 * Generates a quarterly omzet chart, aggregating data by quarter.
 */
/**
 * Generates a quarterly omzet chart, breaking down data by month within that quarter.
 */
export function generateOmzetQuarterlyChart(summaries: SalesSummary[], canvasId: string) {
    if (summaries.length === 0) {
        // Clear the chart if there's no data
        createChart(canvasId, 'bar', { labels: [], datasets: [] });
        return;
    }

    // Determine the quarter from the first data point
    const firstDate = summaries[0].date;
    const year = firstDate.getFullYear();
    const quarter = Math.floor(firstDate.getMonth() / 3); // 0 for Q1, 1 for Q2, etc.
    const startMonth = quarter * 3; // The starting month index (0 for Jan, 3 for Apr, etc.)

    const monthlyTotals = [0, 0, 0];
    const monthLabels = [
        new Date(year, startMonth).toLocaleString('default', { month: 'long' }),
        new Date(year, startMonth + 1).toLocaleString('default', { month: 'long' }),
        new Date(year, startMonth + 2).toLocaleString('default', { month: 'long' }),
    ];

    // Aggregate sales into the correct month bucket
    summaries.forEach(s => {
        const monthInQuarterIndex = s.date.getMonth() - startMonth; // Will be 0, 1, or 2
        if (monthInQuarterIndex >= 0 && monthInQuarterIndex < 3) {
            monthlyTotals[monthInQuarterIndex] += s.totalOmzet;
        }
    });

    createChart(canvasId, 'bar', {
        labels: monthLabels,
        datasets: [{
            label: 'Total Omzet',
            data: monthlyTotals,
            backgroundColor: '#4f46e5',
        }],
    }, mergeChartOptions(
        { scales: { y: { ticks: { callback: (n: any) => shortenCurrency(n) } } } },
        chartTooltip({ label: currencyTooltipCallback })
    ));
}

/**
 * Generates a weekly omzet chart, showing data for each day of the week.
 */
export function generateOmzetWeeklyChart(summaries: SalesSummary[], canvasId: string) {
    const dailyTotals = Array(7).fill(0); // 0=Sunday, 1=Monday, ...
    summaries.forEach(s => {
        const day = s.date.getDay();
        dailyTotals[day] += s.totalOmzet;
    });

    // Reorder to start from Monday
    const orderedTotals = [...dailyTotals.slice(1), dailyTotals[0]];
    const labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

    createChart(canvasId, 'line', {
        labels,
        datasets: [{
            label: 'Total Omzet',
            data: orderedTotals,
            borderColor: '#4f46e5',
            tension: 0.1,
        }],
    }, mergeChartOptions(
        { scales: { y: { beginAtZero: true, ticks: { callback: (n: any) => shortenCurrency(n) } } } },
        chartTooltip({ label: currencyTooltipCallback })
    ));
}

// Add these functions to the bottom of src/analysis/premium/sales-charts.ts

/**
 * Populates the two rows of KPI cards for Period A and Period B.
 */
export function populateTimeComparisonKPIs(periodAData: SalesSummary[], periodBData: SalesSummary[]) {
    const calculateTotals = (summaries: SalesSummary[]) => {
        const totals = summaries.reduce((acc, s) => {
            acc.omzet += s.totalOmzet;
            acc.checks += s.totalTransactions;
            return acc;
        }, { omzet: 0, checks: 0 });
        totals.avgCheck = totals.checks > 0 ? totals.omzet / totals.checks : 0;
        return totals;
    };

    const totalsA = calculateTotals(periodAData);
    const totalsB = calculateTotals(periodBData);

    const updateDom = (periodSuffix: 'a' | 'b', data: typeof totalsA) => {
        const omzetEl = document.getElementById(`premium-time-sales-total-omzet-${periodSuffix}`);
        const checkEl = document.getElementById(`premium-time-sales-total-check-${periodSuffix}`);
        const avgCheckEl = document.getElementById(`premium-time-sales-avg-check-${periodSuffix}`);
        if (omzetEl) omzetEl.textContent = formatCurrency(data.omzet);
        if (checkEl) checkEl.textContent = formatNumber(data.checks);
        if (avgCheckEl) avgCheckEl.textContent = formatCurrency(data.avgCheck);
    };

    updateDom('a', totalsA);
    updateDom('b', totalsB);
}

/**
 * Generates a flexible time-series comparison chart for Omzet, TC, or APC.
 */
export function generatePremiumTimeComparisonChart(
    periodAData: SalesSummary[],
    periodBData: SalesSummary[],
    range: string,
    canvasId: string,
    metric: 'totalOmzet' | 'totalTransactions' | 'apc'
) {

     if (range === 'quarterly') {
        const aggregateMonthly = (summaries: SalesSummary[]) => {
            const monthlyTotals = [0, 0, 0];
            if (summaries.length === 0) return monthlyTotals;
            
            const startMonth = Math.floor(summaries[0].date.getMonth() / 3) * 3; // 0 for Q1, 3 for Q2, etc.
            summaries.forEach(s => {
                const monthInQuarterIndex = s.date.getMonth() - startMonth;
                if (monthInQuarterIndex >= 0 && monthInQuarterIndex < 3) {
                    if (metric === 'apc') {
                        // For APC, we need to re-calculate, not just sum. This is a simplification.
                        // A more accurate way would be to sum total omzet and total transactions for the month.
                        monthlyTotals[monthInQuarterIndex] += s.totalOmzet / s.totalTransactions || 0;
                    } else {
                        monthlyTotals[monthInQuarterIndex] += s[metric] || 0;
                    }
                }
            });
            return monthlyTotals;
        };

        const totalsA = aggregateMonthly(periodAData);
        const totalsB = aggregateMonthly(periodBData);

        const labels = ["First Month of Quarter", "Second Month", "Third Month"];

        createChart(canvasId, 'bar', {
            labels,
            datasets: [
                { label: `Period A`, data: totalsA, backgroundColor: '#A5B4FC' },
                { label: `Period B`, data: totalsB, backgroundColor: '#4F46E5' },
            ],
        }, mergeChartOptions(
            { scales: { y: { beginAtZero: true, ticks: { callback: (n: any) => metric === 'totalOmzet' || metric === 'apc' ? shortenCurrency(n) : n } } } },
            chartTooltip({ label: (ctx: any) => `${ctx.dataset.label}: ${metric === 'totalOmzet' || metric === 'apc' ? formatCurrency(ctx.parsed.y) : formatNumber(ctx.parsed.y)}` })
        ));

    } else {

    let labels: string[] = [];
    const mapA = new Map<string, { value: number, count: number }>();
    const mapB = new Map<string, { value: number, count: number }>();

    // Helper to get the aggregation key and label based on range
    const getKeyAndLabel = (d: Date, r: string) => {
        let key = '';
        let label = '';
        if (r === 'yearly') { // Compare months within the year
            key = String(d.getMonth());
            label = d.toLocaleString('id-ID', { month: 'short' });
        } else if (r === 'quarterly' || r === 'monthly') { // Compare days within the month/quarter
            key = String(d.getDate());
            label = String(d.getDate());
        } else if (r === 'weekly') { // Compare days of the week
            const dayOfWeek = d.getDay(); // 0 = Sunday, 1 = Monday, ...
            key = String(dayOfWeek);
            label = d.toLocaleString('id-ID', { weekday: 'short' });
        }
        return { key, label };
    };

    // Aggregate data for a given period
    const aggregatePeriodData = (summaries: SalesSummary[], aggregationMap: Map<string, { value: number, count: number }>) => {
        summaries.forEach(s => {
            const { key } = getKeyAndLabel(s.date, range);
            if (key) {
                const current = aggregationMap.get(key) || { value: 0, count: 0 };
                current.value += s[metric] || 0;
                current.count += s.totalTransactions > 0 ? s.totalTransactions : 1; // Count for APC average
                aggregationMap.set(key, current);
            }
        });
    };

    // Populate aggregation maps
    aggregatePeriodData(periodAData, mapA);
    aggregatePeriodData(periodBData, mapB);

    // Determine common labels and extract data
    const allKeys = new Set<string>();
    periodAData.forEach(s => allKeys.add(getKeyAndLabel(s.date, range).key));
    periodBData.forEach(s => allKeys.add(getKeyAndLabel(s.date, range).key));

    const sortedKeys = Array.from(allKeys).sort((a, b) => parseInt(a) - parseInt(b));

    labels = sortedKeys.map(key => getKeyAndLabel(new Date(2000, parseInt(key), parseInt(key) + 1), range).label); // Dummy date for label formatting
    if (range === 'quarterly' || range === 'monthly') labels = sortedKeys; // For day-of-month, labels are just the day number
    if (range === 'yearly') labels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    if (range === 'weekly') labels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];


    const dataA = sortedKeys.map(key => {
        const aggregated = mapA.get(key);
        if (!aggregated) return null;
        return metric === 'apc' && aggregated.count > 0 ? aggregated.value / aggregated.count : aggregated.value;
    });

    const dataB = sortedKeys.map(key => {
        const aggregated = mapB.get(key);
        if (!aggregated) return null;
        return metric === 'apc' && aggregated.count > 0 ? aggregated.value / aggregated.count : aggregated.value;
    });
    
    // Ensure labels array is correctly aligned for the range
    if (range === 'yearly') {
        labels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    } else if (range === 'weekly') {
        labels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        // Reorder data to match 'Sun' first if necessary
        const reorderedDataA = new Array(7).fill(null);
        const reorderedDataB = new Array(7).fill(null);
        sortedKeys.forEach((key, index) => {
            reorderedDataA[parseInt(key)] = dataA[index];
            reorderedDataB[parseInt(key)] = dataB[index];
        });
        dataA.splice(0, dataA.length, ...reorderedDataA);
        dataB.splice(0, dataB.length, ...reorderedDataB);
    } else if (range === 'monthly' || range === 'quarterly') {
        // For daily comparison, labels should be 1, 2, 3...
        const maxDay = Math.max(...sortedKeys.map(k => parseInt(k)));
        labels = Array.from({length: maxDay}, (_, i) => String(i + 1));

        const fullMonthDataA = new Array(maxDay).fill(null);
        const fullMonthDataB = new Array(maxDay).fill(null);
        sortedKeys.forEach((key, index) => {
            fullMonthDataA[parseInt(key) - 1] = dataA[index];
            fullMonthDataB[parseInt(key) - 1] = dataB[index];
        });
        dataA.splice(0, dataA.length, ...fullMonthDataA);
        dataB.splice(0, dataB.length, ...fullMonthDataB);
    }


    createChart(canvasId, 'line', {
        labels,
        datasets: [
            { label: `Period A`, data: dataA, borderColor: '#A5B4FC', tension: 0.1, spanGaps: true, pointRadius: 3 },
            { label: `Period B`, data: dataB, borderColor: '#4F46E5', tension: 0.1, spanGaps: true, pointRadius: 3 },
        ],
    }, mergeChartOptions(
        { scales: { y: { beginAtZero: true, ticks: { callback: (n: any) => metric === 'totalOmzet' || metric === 'apc' ? shortenCurrency(n) : n } } } },
        chartTooltip({ label: (ctx: any) => `${ctx.dataset.label}: ${metric === 'totalOmzet' || metric === 'apc' ? formatCurrency(ctx.parsed.y) : formatNumber(ctx.parsed.y)}` })
    ));
}

}

// Add this new function to src/analysis/premium/sales-charts.ts
export function generatePremiumMenuTrendComparisonChart(
    periodAData: SalesSummary[],
    periodBData: SalesSummary[],
    range: string,
    canvasId: string,
    selectedMenus: string[]
) {
    if (selectedMenus.length === 0) {
        createChart(canvasId, 'line', { labels: [], datasets: [] });
        return;
    }

    const colors = ['#3B82F6', '#10B981', '#F97316', '#8B5CF6', '#EF4444'];
    let labels: string[] = [];
    const datasets: any[] = [];

    const aggregateDataForMenu = (summaries: SalesSummary[], menuName: string) => {
        const map = new Map<string, number>();
        summaries.forEach(s => {
            let key = '';
            const d = s.date;
            if (range === 'yearly') key = String(d.getMonth());
            else if (range === 'monthly' || range === 'quarterly') key = String(d.getDate());
            else if (range === 'weekly') key = String(d.getDay());

            if (key) {
                let quantity = 0;
                if (s.menuItemQuantities) {
                    for (const category in s.menuItemQuantities) {
                        if (s.menuItemQuantities[category][menuName]) {
                            quantity += s.menuItemQuantities[category][menuName];
                        }
                    }
                }
                if (quantity > 0) {
                    map.set(key, (map.get(key) || 0) + quantity);
                }
            }
        });
        return map;
    };

    if (range === 'yearly') {
        labels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    } else if (range === 'weekly') {
        labels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    } else { // monthly or quarterly (daily axis)
        const allDays = new Set<string>();
        periodAData.forEach(s => allDays.add(String(s.date.getDate())));
        periodBData.forEach(s => allDays.add(String(s.date.getDate())));
        const sortedDays = Array.from(allDays).sort((a, b) => parseInt(a) - parseInt(b));
        const maxDay = parseInt(sortedDays[sortedDays.length - 1] || '0');
        labels = Array.from({ length: maxDay }, (_, i) => String(i + 1));
    }

    selectedMenus.forEach((menuName, index) => {
        const color = colors[index % colors.length];
        const mapA = aggregateDataForMenu(periodAData, menuName);
        const mapB = aggregateDataForMenu(periodBData, menuName);

        const dataA = labels.map((_, i) => mapA.get(String(range === 'weekly' || range === 'yearly' ? i : i + 1)) || null);
        const dataB = labels.map((_, i) => mapB.get(String(range === 'weekly' || range === 'yearly' ? i : i + 1)) || null);

        datasets.push({ label: `${menuName} (A)`, data: dataA, borderColor: color, borderDash: [5, 5], tension: 0.1, spanGaps: true });
        datasets.push({ label: `${menuName} (B)`, data: dataB, borderColor: color, tension: 0.1, spanGaps: true });
    });

    createChart(canvasId, 'line', { labels, datasets }, mergeChartOptions(
        { plugins: { tooltip: { mode: 'index', intersect: false } } },
        chartTooltip({ label: (ctx: any) => `${ctx.dataset.label}: ${formatNumber(ctx.parsed.y)} items` })
    ));
}