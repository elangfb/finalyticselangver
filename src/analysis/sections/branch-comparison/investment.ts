// Contains all logic for the "Analisis Perbandingan Cabang > Aspek Investasi" section.

import * as $store from '@/store';
import { db } from '@/core/firebase';
import { currentUser } from '@/core/state';
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { showLoading, hideLoading } from '@/core/ui';
import { createChart } from '../../helpers';
import { chartTooltip, mergeChartOptions, shortenCurrency, chartYTicks } from '../../utils/chart-formatters';
import { AlsoStoreFn, createAlsoStoreFn, maybeAlsoStore } from '../../utils/store-helpers';
import { formatCurrencyUtil, formatNumberUtil } from '../../utils/string-formatters';
import { calculateAllPnlMetrics } from '../general/finance';
import { deepmerge } from 'deepmerge-ts';

/**
 * Renders the Business Yield comparison chart between two branches.
 */
function generateCabangBusinessYieldComparisonChart(dataA: any, dataB: any, config?: { alsoStore?: AlsoStoreFn }) {
    const allMonths = [...new Set([...dataA.monthlyProfits.map((p: any) => p.period), ...dataB.monthlyProfits.map((p: any) => p.period)])].sort();
    const profitMapA: Map<string, number> = new Map(dataA.monthlyProfits.map((p: any) => [p.period as string, Number(p.profit) || 0]));
    const profitMapB: Map<string, number> = new Map(dataB.monthlyProfits.map((p: any) => [p.period as string, Number(p.profit) || 0]));

    const yieldDataA = allMonths.map(month => {
        const profit = Number(profitMapA.get(month)) || 0;
        const denom = Number(dataA.investment.investmentAmount) || 0;
        return denom > 0 ? (profit / denom) * 100 : 0;
    });
    const yieldDataB = allMonths.map(month => {
        const profit = Number(profitMapB.get(month)) || 0;
        const denom = Number(dataB.investment.investmentAmount) || 0;
        return denom > 0 ? (profit / denom) * 100 : 0;
    });

    const chartLabels = allMonths.map(m => new Date(m + '-02').toLocaleString('default', { month: 'short', year: 'numeric' }));
    maybeAlsoStore(
        config?.alsoStore,
        { yieldDataA, yieldDataB, allMonths },
        (data) => ({
            businessYieldAnalysis: {
                branchComparison: `${dataA.investment.branchName} vs ${dataB.investment.branchName}`,
                investmentAmounts: {
                    [dataA.investment.branchName]: formatCurrencyUtil(dataA.investment.investmentAmount),
                    [dataB.investment.branchName]: formatCurrencyUtil(dataB.investment.investmentAmount)
                },
                averageYields: {
                    [dataA.investment.branchName]: `${(data.yieldDataA.reduce((sum, val) => sum + val, 0) / data.yieldDataA.length || 0).toFixed(2)}%`,
                    [dataB.investment.branchName]: `${(data.yieldDataB.reduce((sum, val) => sum + val, 0) / data.yieldDataB.length || 0).toFixed(2)}%`
                },
                bestPerformingMonths: deepmerge(
                    ...data.allMonths.slice(-3).map((month, index) => { // Last 3 months for analysis
                        const realIndex = data.allMonths.length - 3 + index;
                        if (realIndex >= 0) {
                            return {
                                [month]: {
                                    [dataA.investment.branchName]: `${(data.yieldDataA[realIndex] || 0).toFixed(2)}%`,
                                    [dataB.investment.branchName]: `${(data.yieldDataB[realIndex] || 0).toFixed(2)}%`
                                }
                            };
                        }
                        return {};
                    })
                ),
                betterPerformer: (data.yieldDataA.reduce((sum, val) => sum + val, 0) / data.yieldDataA.length) >
                               (data.yieldDataB.reduce((sum, val) => sum + val, 0) / data.yieldDataB.length)
                               ? dataA.investment.branchName : dataB.investment.branchName
            }
        })
    );

    createChart('cabang-business-yield-chart', 'bar', {
        labels: chartLabels,
        datasets: [
            { label: `Yield ${dataA.investment.branchName} (%)`, data: yieldDataA, backgroundColor: '#4F46E5' },
            { label: `Yield ${dataB.investment.branchName} (%)`, data: yieldDataB, backgroundColor: '#10B981' }
        ]
    }, { scales: { y: { title: { display: true, text: 'Business Yield (%)' }, ticks: { callback: (v: any) => `${Number(v).toFixed(2)}%` } } } });
}

/**
 * Renders the Investor Yield comparison chart between two branches.
 */
function generateCabangInvestorYieldComparisonChart(dataA: any, dataB: any, config?: { alsoStore?: AlsoStoreFn }) {
    const investmentPerSlotA = Number(dataA.investment.investmentSlots) > 0 ? Number(dataA.investment.investmentAmount) / Number(dataA.investment.investmentSlots) : 0;
    const investmentPerSlotB = Number(dataB.investment.investmentSlots) > 0 ? Number(dataB.investment.investmentAmount) / Number(dataB.investment.investmentSlots) : 0;
    const allMonths = [...new Set([...dataA.monthlyProfits.map((p: any) => p.period), ...dataB.monthlyProfits.map((p: any) => p.period)])].sort();
    const profitMapA = new Map(dataA.monthlyProfits.map((p: any) => [p.period, p.profit]));
    const profitMapB = new Map(dataB.monthlyProfits.map((p: any) => [p.period, p.profit]));

    const yieldDataA = allMonths.map(month => {
        const profit = Number(profitMapA.get(month)) || 0;
        return investmentPerSlotA > 0 ? (profit / investmentPerSlotA) * 100 : 0;
    });
    const yieldDataB = allMonths.map(month => {
        const profit = Number(profitMapB.get(month)) || 0;
        return investmentPerSlotB > 0 ? (profit / investmentPerSlotB) * 100 : 0;
    });

    const chartLabels = allMonths.map(m => new Date(m + '-02').toLocaleString('default', { month: 'short', year: 'numeric' }));
    maybeAlsoStore(
        config?.alsoStore,
        { yieldDataA, yieldDataB, investmentPerSlotA, investmentPerSlotB, allMonths },
        (data) => ({
            investorYieldAnalysis: {
                branchComparison: `${dataA.investment.branchName} vs ${dataB.investment.branchName}`,
                investmentDetails: {
                    [dataA.investment.branchName]: {
                        totalInvestment: formatCurrencyUtil(dataA.investment.investmentAmount),
                        slots: formatNumberUtil(dataA.investment.investmentSlots),
                        perSlot: formatCurrencyUtil(data.investmentPerSlotA)
                    },
                    [dataB.investment.branchName]: {
                        totalInvestment: formatCurrencyUtil(dataB.investment.investmentAmount),
                        slots: formatNumberUtil(dataB.investment.investmentSlots),
                        perSlot: formatCurrencyUtil(data.investmentPerSlotB)
                    }
                },
                averageYieldPerSlot: {
                    [dataA.investment.branchName]: `${(data.yieldDataA.reduce((sum, val) => sum + val, 0) / data.yieldDataA.length || 0).toFixed(2)}%`,
                    [dataB.investment.branchName]: `${(data.yieldDataB.reduce((sum, val) => sum + val, 0) / data.yieldDataB.length || 0).toFixed(2)}%`
                },
                recentPerformance: deepmerge(
                    ...data.allMonths.slice(-3).map((month, index) => { // Last 3 months for analysis
                        const realIndex = data.allMonths.length - 3 + index;
                        if (realIndex >= 0) {
                            return {
                                [month]: {
                                    [dataA.investment.branchName]: `${(data.yieldDataA[realIndex] || 0).toFixed(2)}%`,
                                    [dataB.investment.branchName]: `${(data.yieldDataB[realIndex] || 0).toFixed(2)}%`
                                }
                            };
                        }
                        return {};
                    })
                ),
                betterInvestorYield: (data.yieldDataA.reduce((sum, val) => sum + val, 0) / data.yieldDataA.length) >
                                   (data.yieldDataB.reduce((sum, val) => sum + val, 0) / data.yieldDataB.length)
                                   ? dataA.investment.branchName : dataB.investment.branchName
            }
        })
    );

    createChart('cabang-investor-yield-chart', 'bar', {
        labels: chartLabels,
        datasets: [
            { label: `Yield ${dataA.investment.branchName} (%)`, data: yieldDataA, backgroundColor: '#4F46E5' },
            { label: `Yield ${dataB.investment.branchName} (%)`, data: yieldDataB, backgroundColor: '#10B981' }
        ]
    }, { scales: { y: { title: { display: true, text: 'Investor Yield per Slot (%)' }, ticks: { callback: (v: any) => `${Number(v).toFixed(2)}%` } } } });
}

/**
 * Generates a cumulative return comparison chart between two branches over a selected period.
 */
function generateBranchCumulativeComparisonChart(dataA: any, dataB: any, startPeriod: string, endPeriod: string, config?: { alsoStore?: AlsoStoreFn }) {
    const allMonths: string[] = [];
    let currentDate = new Date(startPeriod + '-02');
    const lastDate = new Date(endPeriod + '-02');
    while (currentDate <= lastDate) {
        allMonths.push(currentDate.toISOString().slice(0, 7));
        currentDate.setMonth(currentDate.getMonth() + 1);
    }

    const profitMapA: Map<string, number> = new Map(dataA.monthlyProfits.map((p: any) => [p.period as string, Number(p.profit) || 0]));
    const profitMapB: Map<string, number> = new Map(dataB.monthlyProfits.map((p: any) => [p.period as string, Number(p.profit) || 0]));

    const calculateCumulative = (profitMap: Map<string, number>, investmentData: any) => {
        let cumulativeShare = 0;
        return allMonths.map(month => {
            const profit = profitMap.get(month) || 0;
            const monthlyShare = profit * (investmentData.investorSharePercentage / 100);
            cumulativeShare += monthlyShare;
            return cumulativeShare;
        });
    };

    const cumulativeDataA = calculateCumulative(profitMapA, dataA.investment);
    const cumulativeDataB = calculateCumulative(profitMapB, dataB.investment);
    const chartLabels = allMonths.map(m => new Date(m + '-02').toLocaleString('default', { month: 'short', year: 'numeric' }));

    maybeAlsoStore(
        config?.alsoStore,
        { cumulativeDataA, cumulativeDataB, chartLabels, allMonths },
        (data) => ({
            cumulativeAnalysis: {
                periodRange: `${startPeriod} to ${endPeriod}`,
                branchComparison: `${dataA.investment.branchName} vs ${dataB.investment.branchName}`,
                finalCumulativeValues: {
                    [dataA.investment.branchName]: formatCurrencyUtil(data.cumulativeDataA[data.cumulativeDataA.length - 1] || 0),
                    [dataB.investment.branchName]: formatCurrencyUtil(data.cumulativeDataB[data.cumulativeDataB.length - 1] || 0)
                },
                monthlyBreakdown: deepmerge(
                    ...data.allMonths.slice(-6).map((month, index) => { // Last 6 months for analysis
                        const realIndex = data.allMonths.length - 6 + index;
                        if (realIndex >= 0) {
                            return {
                                [month]: {
                                    [dataA.investment.branchName]: formatCurrencyUtil(data.cumulativeDataA[realIndex] || 0),
                                    [dataB.investment.branchName]: formatCurrencyUtil(data.cumulativeDataB[realIndex] || 0)
                                }
                            };
                        }
                        return {};
                    })
                ),
                winner: (data.cumulativeDataA[data.cumulativeDataA.length - 1] || 0) > (data.cumulativeDataB[data.cumulativeDataB.length - 1] || 0)
                    ? dataA.investment.branchName : dataB.investment.branchName
            }
        })
    );

    createChart('branch-cumulative-chart', 'line', {
        labels: chartLabels,
        datasets: [
            { label: `Akumulasi ${dataA.investment.branchName}`, data: cumulativeDataA, borderColor: '#4F46E5', backgroundColor: 'rgba(79, 70, 229, 0.1)', fill: true, tension: 0.1 },
            { label: `Akumulasi ${dataB.investment.branchName}`, data: cumulativeDataB, borderColor: '#10B981', backgroundColor: 'rgba(16, 185, 129, 0.1)', fill: true, tension: 0.1 }
        ]
    }, { scales: { y: { beginAtZero: true, title: { display: true, text: 'Total Akumulasi (Rp)' }, ticks: { callback: (v: string | number) => shortenCurrency(Number(v)) } } } });
}

/**
 * Main orchestrator for the "Analisis Perbandingan Cabang > Aspek Investasi" section.
 */
async function generateBranchInvestment() {
    if (!currentUser) return;
    const startPeriod = (document.getElementById('cabang-investasi-start-period') as HTMLSelectElement).value;
    const endPeriod = (document.getElementById('cabang-investasi-end-period') as HTMLSelectElement).value;
    const branchA = (document.getElementById('cabang-investasi-branch-a-select') as HTMLSelectElement).value;
    const branchB = (document.getElementById('cabang-investasi-branch-b-select') as HTMLSelectElement).value;

    const containerA = document.getElementById('cabang-business-yield-chart-container');
    const containerB = document.getElementById('cabang-investor-yield-chart-container');
    const containerC = document.getElementById('branch-cumulative-chart-container');

    const clearChartsAndShowError = (message: string) => {
        if (containerA) containerA.innerHTML = `<p class="text-center text-red-500 p-4">${message}</p>`;
        if (containerB) containerB.innerHTML = '';
        if (containerC) containerC.innerHTML = '';
    };

    if (containerA) containerA.innerHTML = '<canvas id="cabang-business-yield-chart"></canvas>';
    if (containerB) containerB.innerHTML = '<canvas id="cabang-investor-yield-chart"></canvas>';
    if (containerC) containerC.innerHTML = '<canvas id="branch-cumulative-chart"></canvas>';

    if (!startPeriod || !endPeriod || !branchA || !branchB) return;
    if (branchA === branchB) {
        clearChartsAndShowError('Please select two different branches to compare.');
        return;
    }
    if (startPeriod > endPeriod) {
        clearChartsAndShowError('Start Period cannot be after End Period.');
        return;
    }

    $store.clearViewData('cabang-investasi');

    showLoading({ message: 'Comparing cumulative returns...' });
    try {
        const fetchDataForBranch = async (branchName: string) => {
            const investmentRef = doc(db, `users/${currentUser!.uid}/investments`, branchName);
            const pnlReportsRef = collection(db, `users/${currentUser!.uid}/pnlReports`);
            const q = query(pnlReportsRef, where("branchName", "==", branchName), where("period", ">=", startPeriod), where("period", "<=", endPeriod));
            const [investmentSnap, pnlSnap] = await Promise.all([getDoc(investmentRef), getDocs(q)]);
            if (!investmentSnap.exists()) throw new Error(`Investment data not found for ${branchName}.`);
            const monthlyProfits = pnlSnap.docs
                .map(d => ({ period: d.data().period, profit: calculateAllPnlMetrics(d.data().pnlData).Profit }))
                .sort((a, b) => a.period.localeCompare(b.period));
            return { investment: investmentSnap.data(), monthlyProfits };
        };
        const [dataA, dataB] = await Promise.all([fetchDataForBranch(branchA), fetchDataForBranch(branchB)]);

        $store.setActiveViewData('cabang-investasi', {
            viewContext: {
                startPeriod: new Date(startPeriod + '-02').toLocaleString('default', { month: 'long', year: 'numeric' }),
                endPeriod: new Date(endPeriod + '-02').toLocaleString('default', { month: 'long', year: 'numeric' }),
                branchA,
                branchB,
                comparisonType: 'Branch Investment Analysis',
            }
        }, { startPeriod, endPeriod, branchA, branchB });
        const alsoStore = createAlsoStoreFn($store, 'cabang-investasi');

        generateCabangBusinessYieldComparisonChart(dataA, dataB, { alsoStore });
        generateCabangInvestorYieldComparisonChart(dataA, dataB, { alsoStore });
        generateBranchCumulativeComparisonChart(dataA, dataB, startPeriod, endPeriod, { alsoStore });
    } catch (error: any) {
        const message = error?.message || 'Unknown error';
        if (containerA) containerA.innerHTML = `<p class="text-center text-red-500 p-4">${message}</p>`;
        if (containerB) containerB.innerHTML = '';
        if (containerC) containerC.innerHTML = '';
    } finally {
        hideLoading();
    }
}

/**
 * Sets up the selectors for the "Cabang > Investasi" section.
 */
export async function setupBranchInvestment() {
    if ($store.getInitFlag('cabangInvestasiSelectorInitialized') || !currentUser) return;

    const startPeriodSelect = document.getElementById('cabang-investasi-start-period') as HTMLSelectElement;
    const endPeriodSelect = document.getElementById('cabang-investasi-end-period') as HTMLSelectElement;
    const branchASelect = document.getElementById('cabang-investasi-branch-a-select') as HTMLSelectElement;
    const branchBSelect = document.getElementById('cabang-investasi-branch-b-select') as HTMLSelectElement;

    try {
        const investmentsRef = collection(db, `users/${currentUser.uid}/investments`);
        const pnlReportsRef = collection(db, `users/${currentUser.uid}/pnlReports`);
        const [investmentSnap, pnlSnap] = await Promise.all([getDocs(investmentsRef), getDocs(pnlReportsRef)]);

        const branchesWithInvestment = investmentSnap.docs.map(doc => doc.data().branchName).sort();
        const availablePeriods = [...new Set(pnlSnap.docs.map(doc => doc.data().period))].sort();

        if (branchesWithInvestment.length < 2 || availablePeriods.length === 0) return;

        const branchOptionsHtml = branchesWithInvestment.map(b => `<option value="${b}">${b}</option>`).join('');
        branchASelect.innerHTML = branchOptionsHtml;
        branchBSelect.innerHTML = branchOptionsHtml;

        const periodOptionsHtml = availablePeriods.map(p => `<option value="${p}">${new Date(p + '-02').toLocaleString('default', { month: 'long', year: 'numeric' })}</option>`).join('');
        startPeriodSelect.innerHTML = periodOptionsHtml;
        endPeriodSelect.innerHTML = periodOptionsHtml;

        branchASelect.value = branchesWithInvestment[0];
        branchBSelect.value = branchesWithInvestment[1];
        startPeriodSelect.value = availablePeriods[0];
        endPeriodSelect.value = availablePeriods[availablePeriods.length - 1];

        const handler = () => generateBranchInvestment();
        startPeriodSelect.addEventListener('change', handler);
        endPeriodSelect.addEventListener('change', handler);
        branchASelect.addEventListener('change', handler);
        branchBSelect.addEventListener('change', handler);

        $store.setInitFlag('cabangInvestasiSelectorInitialized', true);
        await generateBranchInvestment();
    } catch (error) {
        // Handle error
    }
}
