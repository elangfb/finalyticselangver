// Contains all logic for the "Analisis General > Aspek Investasi" section.

import { collection, doc, getDoc, getDocs, limit, orderBy, query, setDoc, where } from 'firebase/firestore';
import { db } from '@/core/firebase';
import { currentUser } from '@/core/state';
import { showLoading, hideLoading } from '@/core/ui';
import * as $store from '@/store';
import { createChart } from '../../helpers';
import { AlsoStoreFn, createAlsoStoreFn } from '../../utils/store-helpers';
import { chartTooltip, mergeChartOptions, chartYTicks, shortenCurrency } from '../../utils/chart-formatters';
import { currencyTooltipCallback } from '../../utils/chart-formatters';
import { formatCurrency as formatCurrencyUtil, formatIntBasedPercentage } from '../../utils/string-formatters';
import { deepmerge } from 'deepmerge-ts';
import { calculateAllPnlMetrics } from '../general/finance';

/**
 * Saves new or updated investment data for a branch to Firestore.
 */
export async function saveInvestmentData() {
    if (!currentUser) {
        alert('You must be logged in to save data.');
        return;
    }
    const branchNameInput = document.getElementById('investment-branch-name') as HTMLInputElement;
    const amountInput = document.getElementById('investment-amount') as HTMLInputElement;
    const slotsInput = document.getElementById('investment-slots') as HTMLInputElement;
    const shareInput = document.getElementById('investment-share-percentage') as HTMLInputElement;
    const feedbackEl = document.getElementById('investment-feedback');
    if(!branchNameInput || !amountInput || !slotsInput || !shareInput || !feedbackEl) return;

    const branchName = branchNameInput.value.trim();
    const investmentAmount = parseFloat(amountInput.value);
    const investmentSlots = parseInt(slotsInput.value, 10);
    const investorSharePercentage = parseFloat(shareInput.value);

    if (!branchName || isNaN(investmentAmount) || isNaN(investmentSlots) || isNaN(investorSharePercentage) || investmentAmount <= 0 || investmentSlots <= 0 || investorSharePercentage < 0 || investorSharePercentage > 100) {
        feedbackEl.textContent = 'Please fill all fields with valid numbers (percentage must be between 0-100).';
        feedbackEl.className = 'text-sm mb-4 text-center text-red-600';
        feedbackEl.classList.remove('hidden');
        return;
    }

    feedbackEl.textContent = 'Saving...';
    feedbackEl.className = 'text-sm mb-4 text-center text-blue-600';
    feedbackEl.classList.remove('hidden');

    try {
        const investmentDocRef = doc(db, `users/${currentUser.uid}/investments`, branchName);
        await setDoc(investmentDocRef, {
            branchName,
            investmentAmount,
            investmentSlots,
            investorSharePercentage,
            lastUpdatedAt: new Date()
        }, { merge: true });

        feedbackEl.textContent = 'Investment data saved successfully!';
        feedbackEl.className = 'text-sm mb-4 text-center text-green-600';
        branchNameInput.value = '';
        amountInput.value = '';
        slotsInput.value = '';
        shareInput.value = '';
        await setupGeneralInvestment();
    } catch (error: any) {
        console.error("Error saving investment data:", error);
        feedbackEl.textContent = `Error: ${error.message}`;
        feedbackEl.className = 'text-sm mb-4 text-center text-red-600';
    }
}

/**
 * Generates the "Yield Bisnis per Bulan" chart.
 */
function generateBusinessYieldChart(monthlyProfits: any[], totalInvestment: number, config?: { alsoStore?: AlsoStoreFn }) {
    const labels = monthlyProfits.map(p => new Date(p.period + '-02').toLocaleString('default', { month: 'short', year: 'numeric' }));
    const profitData = monthlyProfits.map(p => p.profit);
    const yieldData = monthlyProfits.map(p => totalInvestment > 0 ? (p.profit / totalInvestment) * 100 : 0);

    config?.alsoStore?.({ profits: profitData, yields: yieldData }, (v) => ({ businessYieldChart: v }));

    createChart('business-yield-chart', 'bar', {
        labels,
        datasets: [
            { type: 'bar', label: 'Profit (Rp)', data: profitData, backgroundColor: '#10B981', yAxisID: 'y-rp' },
            { type: 'line', label: 'Yield (%)', data: yieldData, borderColor: '#F97316', yAxisID: 'y-percent', tension: 0.1 }
        ]
    }, mergeChartOptions({ scales: {
        'y-rp': { type: 'linear', position: 'left', title: { display: true, text: 'Profit Bulanan (Rp)' } },
        'y-percent': { type: 'linear', position: 'right', title: { display: true, text: 'Yield (%)' }, grid: { drawOnChartArea: false }, ticks: { callback: (v: string | number) => `${Number(v).toFixed(2)}%` } }
    }}, chartYTicks(shortenCurrency), chartTooltip({ label: (ctx:any) => `${ctx.dataset.label}: ${ctx.dataset.yAxisID === 'y-rp' ? formatCurrencyUtil(ctx.parsed.y) : formatIntBasedPercentage(ctx.parsed.y, 2)}` })));
}

/**
 * Generates the "Yield Investor per Bulan" chart.
 */
function generateInvestorYieldChart(monthlyProfits: any[], totalInvestment: number, slots: number, config?: { alsoStore?: AlsoStoreFn }) {
    if (slots === 0) return;
    const investmentPerSlot = totalInvestment / slots;
    const labels = monthlyProfits.map(p => new Date(p.period + '-02').toLocaleString('default', { month: 'short', year: 'numeric' }));
    const profitData = monthlyProfits.map(p => p.profit);
    const yieldData = monthlyProfits.map(p => investmentPerSlot > 0 ? (p.profit / investmentPerSlot) * 100 : 0);

    config?.alsoStore?.({ profits: profitData, yields: yieldData }, (v) => ({ investorYieldChart: v }));

    createChart('investor-yield-chart', 'bar', {
        labels,
        datasets: [
            { type: 'bar', label: 'Profit (Rp)', data: profitData, backgroundColor: '#10B981', yAxisID: 'y-rp' },
            { type: 'line', label: 'Yield per Slot (%)', data: yieldData, borderColor: '#F97316', yAxisID: 'y-percent', tension: 0.1 }
        ]
    }, mergeChartOptions({ scales: {
        'y-rp': { type: 'linear', position: 'left', title: { display: true, text: 'Profit Bulanan (Rp)' } },
        'y-percent': { type: 'linear', position: 'right', title: { display: true, text: 'Yield per Slot (%)' }, grid: { drawOnChartArea: false }, ticks: { callback: (v: string | number) => `${Number(v).toFixed(2)}%` } }
    }}, chartYTicks(shortenCurrency), chartTooltip({ label: (ctx:any) => `${ctx.dataset.label}: ${ctx.dataset.yAxisID === 'y-rp' ? formatCurrencyUtil(ctx.parsed.y) : formatIntBasedPercentage(ctx.parsed.y, 2)}` })));
}

/**
 * Generates the cumulative investor share chart.
 */
function generateCumulativeInvestorShareChart(monthlyProfits: any[], investorSharePercentage: number, config?: { alsoStore?: AlsoStoreFn }) {
    const labels = monthlyProfits.map(p => new Date(p.period + '-02').toLocaleString('default', { month: 'short', year: 'numeric' }));
    let cumulativeShare = 0;
    const cumulativeData = monthlyProfits.map(p => {
        const monthlyShare = p.profit * (investorSharePercentage / 100);
        cumulativeShare += monthlyShare;
        return cumulativeShare;
    });

    config?.alsoStore?.({ shares: cumulativeData }, (v) => ({ cumulativeInvestorShareChart: v }));

    createChart('cumulative-investor-share-chart', 'line', {
        labels,
        datasets: [{
            label: 'Akumulasi Bagi Hasil (Rp)',
            data: cumulativeData,
            borderColor: '#8B5CF6',
            backgroundColor: 'rgba(139, 92, 246, 0.2)',
            fill: true,
            tension: 0.1,
        }]
    }, mergeChartOptions({ scales: { y: { beginAtZero: true, title: { display: true, text: 'Total Akumulasi (Rp)' } } } }, chartYTicks(shortenCurrency), chartTooltip({ label: currencyTooltipCallback })));
}

/**
 * Main orchestrator function for the General Investment section.
 */
async function generateGeneralInvestment() {
    if (!currentUser) return;
    const branchSelect = document.getElementById('investasi-branch-select') as HTMLSelectElement;
    const selectedBranch = branchSelect.value;
    if (!selectedBranch || selectedBranch === 'No investment data saved') return;

    showLoading({ message: 'Calculating investment yield...', value: 30 });
    try {
        const investmentDocRef = doc(db, `users/${currentUser.uid}/investments`, selectedBranch);
        const pnlReportsRef = collection(db, `users/${currentUser.uid}/pnlReports`);
        const q = query(pnlReportsRef, where("branchName", "==", selectedBranch), orderBy("period", "desc"), limit(24));

        const [investmentSnap, reportsSnap] = await Promise.all([getDoc(investmentDocRef), getDocs(q)]);
        if (!investmentSnap.exists()) throw new Error(`Investment data for ${selectedBranch} not found.`);
        const investmentData = investmentSnap.data();

        const recentReports = reportsSnap.docs.map(doc => doc.data()).sort((a, b) => a.period.localeCompare(b.period));
        if (recentReports.length === 0) throw new Error(`No P&L reports found for ${selectedBranch}.`);

        const monthlyProfits = recentReports.map(report => ({
            period: report.period,
            profit: calculateAllPnlMetrics(report.pnlData || {})['Pendapatan Bersih (Net Income)'] || 0
        }));

        $store.clearViewData('general-investasi');
        $store.setActiveViewData('general-investasi', {
            viewContext: {
                selectedBranch,
                periodRange: monthlyProfits.length > 0 ?
                    `${monthlyProfits[0]!.period} to ${monthlyProfits[monthlyProfits.length - 1]!.period}` :
                    'No data',
                totalInvestment: investmentData.investmentAmount,
                investmentSlots: investmentData.investmentSlots,
                investorSharePercentage: investmentData.investorSharePercentage
            }
        }, { selectedBranch });
        const alsoStore = createAlsoStoreFn($store, 'general-investasi');

        generateBusinessYieldChart(monthlyProfits, investmentData.investmentAmount, { alsoStore });
        generateInvestorYieldChart(monthlyProfits, investmentData.investmentAmount, investmentData.investmentSlots, { alsoStore });
        generateCumulativeInvestorShareChart(monthlyProfits, investmentData.investorSharePercentage, { alsoStore });

    } catch (error: any) {
        console.error("Error generating investment analysis:", error);
        const chartContainer = document.getElementById('business-yield-chart')?.parentElement;
        if (chartContainer) chartContainer.innerHTML = `<p class="text-red-500 p-4 text-center">${error.message}</p>`;
        const investorChartContainer = document.getElementById('investor-yield-chart')?.parentElement;
        if (investorChartContainer) investorChartContainer.innerHTML = '';
    } finally {
        hideLoading();
    }
}

/**
 * Sets up the branch selector for the investment analysis section.
 */
export async function setupGeneralInvestment() {
    const branchSelect = document.getElementById('investasi-branch-select') as HTMLSelectElement;
    if (!currentUser || !branchSelect) return;
    branchSelect.innerHTML = '<option>Loading branches...</option>';
    try {
        const investmentsRef = collection(db, `users/${currentUser.uid}/investments`);
        const investmentSnap = await getDocs(investmentsRef);
        const branches = investmentSnap.docs.map(doc => doc.data().branchName).sort();
        if (branches.length === 0) {
            branchSelect.innerHTML = '<option>No investment data saved</option>';
            return;
        }
        branchSelect.innerHTML = branches.map(b => `<option value="${b}">${b}</option>`).join('');
        if (!$store.getInitFlag('generalInvestasiSelectorInitialized')) {
            branchSelect.addEventListener('change', generateGeneralInvestment);
            $store.setInitFlag('generalInvestasiSelectorInitialized', true);
        }
        await generateGeneralInvestment();
    } catch (error) {
        branchSelect.innerHTML = '<option>Error loading branches</option>';
    }
}

/**
 * Initializes the investment form save listener.
 */
export function initializeInvestmentForm(): void {
    document.getElementById('investment-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        await saveInvestmentData();
    });
}
