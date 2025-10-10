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
export function generateOmzetQuarterlyChart(summaries: SalesSummary[], canvasId: string) {
    const quarterlyTotals = Array(4).fill(0);
    summaries.forEach(s => {
        const quarter = Math.floor(s.date.getMonth() / 3); // 0-3
        quarterlyTotals[quarter] += s.totalOmzet;
    });

    const labels = ['Q1', 'Q2', 'Q3', 'Q4'];
    createChart(canvasId, 'bar', {
        labels,
        datasets: [{
            label: 'Total Omzet',
            data: quarterlyTotals,
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