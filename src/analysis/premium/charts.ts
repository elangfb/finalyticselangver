// [NEW FILE] src/analysis/premium/charts.ts

import { createChart } from '@/analysis/helpers'
import { chartTooltip, currencyTooltipCallback, mergeChartOptions, shortenCurrency, chartYTicks } from '@/analysis/utils/chart-formatters'
import type { SalesSummary } from '@/analysis/sections/general/sales/types'

export function generateOmzetByOutletChart(summaries: SalesSummary[], canvasId: string) {
    const omzetByBranch: Record<string, number> = {}

    // Aggregate total omzet for each branch from the provided summaries
    for (const summary of summaries) {
        if (summary.revenueByBranch) {
            for (const branchName in summary.revenueByBranch) {
                omzetByBranch[branchName] = (omzetByBranch[branchName] || 0) + summary.revenueByBranch[branchName]
            }
        }
    }

    // Sort branches by omzet in descending order
    const sortedBranches = Object.entries(omzetByBranch).sort(([, a], [, b]) => b - a)

    const labels = sortedBranches.map(([name]) => name)
    const data = sortedBranches.map(([, omzet]) => omzet)

    createChart(canvasId, 'bar', {
        labels,
        datasets: [{
            label: 'Total Omzet',
            data,
            backgroundColor: '#2dd4bf', // Teal color to match the premium theme
        }],
    }, mergeChartOptions(
        { indexAxis: 'y' }, // Make it a horizontal bar chart
        chartYTicks((value: string | number) => String(value)), // Use default labels for y-axis
        { scales: { x: { ticks: { callback: (n: string | number) => shortenCurrency(Number(n)) } } } }, // Format x-axis as currency
        chartTooltip({ label: currencyTooltipCallback })
    ))
}