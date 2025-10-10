import { createChart } from '@/analysis/helpers';
import { chartTooltip, currencyTooltipCallback, mergeChartOptions, shortenCurrency } from '@/analysis/utils/chart-formatters';
import type { SalesSummary } from '@/analysis/sections/general/sales/types';

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