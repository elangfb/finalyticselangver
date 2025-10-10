import { createChart } from '@/analysis/helpers';
import { chartTooltip, mergeChartOptions, shortenCurrency } from '@/analysis/utils/chart-formatters';
import { formatCurrency, formatIntBasedPercentage } from '@/utils/string';

// Reusable function to compare a specific sub-category between two P&L reports
export function generatePremiumSubCategoryComparisonChart(
  reportA: any,
  reportB: any,
  config: { canvasId: string; mainCategory: string; subCategory: string; title: string; }
) {
    const pnlDataA = reportA?.pnlData || {};
    const pnlDataB = reportB?.pnlData || {};

    const getValues = (pnlData: any) => {
        const revenue = Object.values(pnlData['Pendapatan (Revenue)'] || {}).reduce((s: number, v: number) => s + v, 0);
        const subCategoryValue = pnlData[config.mainCategory]?.[config.subCategory] || 0;
        const percentage = revenue > 0 ? (subCategoryValue / revenue) * 100 : 0;
        return { absolute: subCategoryValue, percentage };
    };

    const valuesA = getValues(pnlDataA);
    const valuesB = getValues(pnlDataB);

    const labels = [
        reportA ? new Date(reportA.period + '-02').toLocaleString('default', { month: 'short', year: 'numeric' }) : 'Period A',
        reportB ? new Date(reportB.period + '-02').toLocaleString('default', { month: 'short', year: 'numeric' }) : 'Period B',
    ];

    createChart(config.canvasId, 'bar', {
        labels,
        datasets: [
            { type: 'bar', label: `${config.title} (Rp)`, data: [valuesA.absolute, valuesB.absolute], backgroundColor: '#60A5FA', yAxisID: 'y-rp' },
            { type: 'line', label: `${config.title} (%)`, data: [valuesA.percentage, valuesB.percentage], borderColor: '#F97316', yAxisID: 'y-percent' },
        ],
    }, mergeChartOptions(
        ({
            scales: {
                'y-rp': { type: 'linear', position: 'left', title: { display: true, text: 'Value (Rp)' }, ticks: { callback: (n: number) => shortenCurrency(n) } },
                'y-percent': { type: 'linear', position: 'right', title: { display: true, text: 'Percentage (%)' }, grid: { drawOnChartArea: false }, ticks: { callback: (v: string | number) => `${Number(v).toFixed(1)}%` } },
            },
        } as any),
        chartTooltip({
            label: (context: any) => {
                let label = context.dataset.label || '';
                if (label) label += ': ';
                const value = context.parsed.y;
                if (context.dataset.yAxisID === 'y-rp') label += formatCurrency(value);
                else label += formatIntBasedPercentage(value, 2);
                return label;
            },
        }),
    ));
}