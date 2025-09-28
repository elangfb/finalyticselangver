// Contains functions for displaying and managing all modals related to the data hub.

import { collectionGroup, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/core/firebase';
import { currentUser } from '@/core/state';
import { hideLoading } from '@/core/ui';
import { calculateAllPnlMetrics } from '@/analysis/sections/general/finance';
import { AlsoStoreFn, createMaybeAlsoStoreFn } from '@/utils/also-store';
import * as $store from '@/store';

// --- Quick Upload Modal ---
const quickUploadModal = document.getElementById('quick-upload-modal');
const quickUploadTitle = document.getElementById('quick-upload-modal-title');
const typeDisplayNames = {
    salesData: 'Sales Data',
    salesTarget: 'Sales Target',
    pnlData: 'P&L Data',
    pnlTarget: 'P&L Target'
};

export function openQuickUploadModal(period: string, type: string) {
    if (!quickUploadModal || !quickUploadTitle) return;

    const [year, month] = period.split('-') as [string, string];
    const formattedPeriod = new Date(parseInt(year), parseInt(month) - 1, 1).toLocaleString('default', { month: 'long', year: 'numeric' });

    quickUploadTitle.textContent = `Upload ${typeDisplayNames[type as keyof typeof typeDisplayNames]} for ${formattedPeriod}`;
    quickUploadModal.dataset.period = period;
    quickUploadModal.dataset.type = type;

    // Reset modal state
    (document.getElementById('quick-upload-file-input') as HTMLInputElement).value = '';
    document.getElementById('quick-upload-error')?.classList.add('hidden');
    const confirmBtn = document.getElementById('quick-upload-confirm-btn') as HTMLButtonElement;
    confirmBtn.disabled = false;
    confirmBtn.textContent = 'Upload & Process';
    document.getElementById('quick-upload-progress-container')?.classList.add('hidden');
    const statusEl = document.getElementById('quick-upload-processing-status');
    if (statusEl) {
        statusEl.classList.add('hidden');
        statusEl.textContent = '';
    }
    quickUploadModal.classList.remove('hidden');
}

// --- View Choice Modal ---
const viewChoiceModal = document.getElementById('view-choice-modal');
export function openViewChoiceModal(uploadId: string, fileName: string) {
    if (!viewChoiceModal) return;
    viewChoiceModal.dataset.uploadId = uploadId;
    viewChoiceModal.dataset.fileName = fileName;
    viewChoiceModal.classList.remove('hidden');
}


// --- P&L Data Modal ---
/**
 * Displays a modal with a formatted Profit & Loss statement for a specific period.
 * @param {object} data - The P&L data object from Firestore.
 */
export function showPnlDataModal(data: any) {
    const modal = document.getElementById('pnl-data-modal');
    const titleEl = document.getElementById('pnl-data-modal-title');
    const bodyEl = document.getElementById('pnl-data-modal-body');

    if (!modal || !titleEl || !bodyEl) return;

    const period = data.period;
    const [year, month] = period.split('-');
    const formattedPeriod = new Date(parseInt(year), parseInt(month) - 1, 1).toLocaleString('default', { month: 'long', year: 'numeric' });
    titleEl.textContent = `P&L Statement for ${formattedPeriod}`;

    const pnlData = data.pnlData || {};
    const formatCurrency = (value: number) => `Rp${Math.round(value).toLocaleString('id-ID')}`;

    let totalRevenue = 0, totalHPP = 0, totalOpex = 0, totalNonOpex = 0;
    let totalDepresiasi = 0, totalBunga = 0, totalPajak = 0;

    const renderCategory = (categoryName: string) => {
        const categoryData = pnlData[categoryName] || {};
        const categoryTotal = Object.values(categoryData).reduce((sum, value) => (sum as number) + (value as number), 0) as number;

        // Assign to wider-scoped totals
        if (categoryName === "Pendapatan (Revenue)") totalRevenue = categoryTotal;
        if (categoryName === "Harga Pokok Produksi") totalHPP = categoryTotal;
        if (categoryName === "Beban Operasional (OPEX)") totalOpex = categoryTotal;
        if (categoryName === "Beban Non Operasional") totalNonOpex = categoryTotal;
        if (categoryName === "Depresiasi/ Amortisasi") totalDepresiasi = categoryTotal;
        if (categoryName === "Bunga") totalBunga = categoryTotal;
        if (categoryName === "Pajak (PB1)") totalPajak = categoryTotal;

        if (Object.keys(categoryData).length === 0) return '';

        const itemsHtml = Object.entries(categoryData).map(([name, value]) => `
            <div class="flex justify-between text-sm text-gray-600 pl-4">
                <span>${name}</span><span class="font-mono">${formatCurrency(value as number)}</span>
            </div>`).join('');

        return `
            <div class="mb-4">
                <h4 class="font-bold text-md text-gray-800">${categoryName}</h4>
                <div class="space-y-1 mt-2">${itemsHtml}</div>
                <div class="flex justify-between font-semibold pt-1 border-t mt-1">
                    <span>Total ${categoryName}</span><span class="font-mono">${formatCurrency(categoryTotal)}</span>
                </div>
            </div>`;
    };

    const renderSubtotal = (label: string, value: number, colorClass: string) => `
        <div class="flex justify-between font-bold text-lg py-2 my-2 ${colorClass} rounded-md px-4">
            <span>${label}</span><span class="font-mono">${formatCurrency(value)}</span>
        </div>`;

    // --- Build the HTML string in the correct financial statement order ---
    let finalHtml = '';
    finalHtml += renderCategory("Pendapatan (Revenue)");
    finalHtml += renderCategory("Harga Pokok Produksi");
    const grossProfit = totalRevenue - totalHPP;
    finalHtml += renderSubtotal("Laba Kotor (Gross Profit)", grossProfit, "bg-yellow-100 text-yellow-800");

    finalHtml += renderCategory("Beban Operasional (OPEX)");
    const netOperatingIncome = grossProfit - totalOpex;
    finalHtml += renderSubtotal("Pendapatan Bersih Operasional", netOperatingIncome, "bg-blue-100 text-blue-800");

    finalHtml += renderCategory("Beban Non Operasional");
    const ebitda = netOperatingIncome - totalNonOpex;
    finalHtml += renderSubtotal("EBITDA", ebitda, "bg-orange-100 text-orange-800");

    finalHtml += renderCategory("Depresiasi/ Amortisasi");
    finalHtml += renderCategory("Bunga");
    finalHtml += renderCategory("Pajak (PB1)");

    const netIncome = ebitda - totalDepresiasi - totalBunga - totalPajak;
    finalHtml += renderSubtotal("Pendapatan Bersih (Net Income)", netIncome, "bg-green-200 text-green-800");

    bodyEl.innerHTML = finalHtml;
    modal.classList.remove('hidden');
}


// --- Sales Target Modal ---
/**
 * Displays a modal with a table comparing sales targets to actual performance for a specific period.
 * @param {object} data - The sales target data object from Firestore.
 */
export async function showSalesTargetModal(data: any) {
    const modal = document.getElementById('sales-target-modal');
    const titleEl = document.getElementById('sales-target-modal-title');
    const bodyEl = document.getElementById('sales-target-modal-body');
    if (!modal || !titleEl || !bodyEl) return;
    if (!currentUser) return;

    bodyEl.innerHTML = '<p id="sales-target-loading-msg" class="text-center text-gray-500">Loading actual sales data...</p>';
    modal.classList.remove('hidden');

    const period = data.period;
    if (!period) {
        bodyEl.innerHTML = '<p class="text-center text-red-500">Error: Period not found in target data.</p>';
        return;
    }

    const [year, month] = period.split('-');
    const formattedPeriod = new Date(parseInt(year), parseInt(month) - 1, 1).toLocaleString('default', { month: 'long', year: 'numeric' });
    titleEl.textContent = `Sales Target vs Actual for ${formattedPeriod}`;

    try {
        const summariesQuery = query(
            collectionGroup(db, 'dailySummaries'),
            where('userId', '==', currentUser.uid)
        );
        const querySnapshot = await getDocs(summariesQuery);

        const periodSummaries: {
            totalOmzet: number;
            totalTransactions: number;
            totalItemsSold: number;
        }[] = [];
        querySnapshot.forEach(doc => {
            const summary = doc.data();
            if (summary.date && summary.date.startsWith(period)) {
                periodSummaries.push(summary as any);
            }
        });

        const actuals = periodSummaries.reduce((acc, summary) => {
            acc.totalOmzet += summary.totalOmzet || 0;
            acc.totalTransactions += summary.totalTransactions || 0;
            acc.totalItemsSold += summary.totalItemsSold || 0;
            return acc;
        }, {
            totalOmzet: 0,
            totalTransactions: 0,
            totalItemsSold: 0
        });

        const actualAvgPerTransaction = actuals.totalTransactions > 0
            ? actuals.totalOmzet / actuals.totalTransactions
            : 0;

        const actualValues = {
            'Total Omzet': actuals.totalOmzet,
            'Total Transaction': actuals.totalTransactions,
            'Total Items Sold': actuals.totalItemsSold,
            'Avg. Per Transaction': actualAvgPerTransaction
        };

        const targets = data.targets || {};
        const formatCurrency = (value: number) => `Rp${Math.round(value).toLocaleString('id-ID')}`;
        const formatNumber = (value: number) => Math.round(value).toLocaleString('id-ID');

        // --- FIX START: Define which metrics to show and which are currency ---
        const metricsToShow = [
            'Total Omzet',
            'Total Items Sold',
            'Total Transaction',
            'Avg. Per Transaction'
        ];

        // Define which metrics should have the "Rp" prefix
        const currencyMetrics = ['Total Omzet', 'Avg. Per Transaction'];
        // --- FIX END ---

        let tableHtml = `
            <div class="overflow-x-auto">
                <table class="min-w-full divide-y divide-gray-200">
                    <thead class="bg-gray-50">
                        <tr>
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Metric</th>
                            <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Target</th>
                            <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actual</th>
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Achievement</th>
                        </tr>
                    </thead>
                    <tbody class="bg-white divide-y divide-gray-200">
        `;

        // --- FIX START: Loop through the specified metrics only ---
        metricsToShow.forEach(metric => {
            if (!targets[metric]) return; // Skip if a target for this metric doesn't exist

            const targetValue = targets[metric];
            const actualValue = actualValues[metric as keyof typeof actualValues] || 0;
            const achievement = targetValue > 0 ? (actualValue / targetValue) * 100 : 0;

            // Use our new array to check if the metric is a currency value
            const isCurrency = currencyMetrics.includes(metric);

            tableHtml += `
                <tr>
                    <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">${metric}</td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-right font-mono">
                        ${isCurrency ? formatCurrency(targetValue) : formatNumber(targetValue)}
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-right font-mono">
                        ${isCurrency ? formatCurrency(actualValue) : formatNumber(actualValue)}
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        <div class="flex items-center">
                            <span class="font-semibold">${achievement.toFixed(1)}%</span>
                        </div>
                    </td>
                </tr>
            `;
        });
        // --- FIX END ---

        tableHtml += `
                    </tbody>
                </table>
            </div>
        `;
        bodyEl.innerHTML = tableHtml;

    } catch (error: any) {
        console.error("Error fetching or processing actuals for sales target:", error);
        bodyEl.innerHTML = `<p class="text-center text-red-500">Error: Could not load actual sales data. ${error.message}</p>`;
    }
}

// --- P&L Target Modal ---
/**
 * Displays a modal comparing P&L targets to actual performance for a specific period,
 * with a conditional "Achievement" column.
 */
export async function showPnlTargetModal(targetData: any, reportId: string, config?: { alsoStore?: AlsoStoreFn }) {
    const modal = document.getElementById('pnl-target-modal');
    const titleEl = document.getElementById('pnl-target-modal-title');
    const bodyEl = document.getElementById('pnl-target-modal-body');
    if (!modal || !titleEl || !bodyEl) return;
    if (!currentUser) return;

    bodyEl.innerHTML = '<p id="pnl-target-loading-msg" class="text-center text-gray-500">Loading actual P&L report for comparison...</p>';
    modal.classList.remove('hidden');

    const period = targetData.period;
    if (!period) {
        bodyEl.innerHTML = '<p class="text-center text-red-500">Error: Period not found in target data.</p>';
        return;
    }

    const [year, month] = period.split('-');
    const formattedPeriod = new Date(parseInt(year), parseInt(month) - 1, 1).toLocaleString('default', { month: 'long', year: 'numeric' });
    titleEl.textContent = `P&L Target vs Actual for ${formattedPeriod}`;

    try {
        const pnlDocRef = doc(db, `users/${currentUser.uid}/pnlReports`, reportId);
        const pnlDocSnap = await getDoc(pnlDocRef);

        let actualValues = {
            'Pendapatan (Revenue)': 0, 'Harga Pokok Produksi': 0, 'Beban Operasional (OPEX)': 0,
            'Beban Non Operasional': 0, 'Depresiasi/ Amortisasi': 0, 'Bunga': 0, 'Pajak (PB1)': 0,
            'Laba Kotor (Gross Profit)': 0, 'Pendapatan Bersih Operasional (Net Operating Income)': 0,
            'Pendapatan Bersih Sebelum Deprisiasi/Amortisasi, Bunga & Pajak (EBITDA)': 0,
            'Pendapatan Bersih (Net Income)': 0
        };

        if (pnlDocSnap.exists()) {
            const pnlData = pnlDocSnap.data().pnlData || {};
            const pnlMetrics = calculateAllPnlMetrics(pnlData);
            actualValues = { ...actualValues, ...pnlMetrics };
        }

        const targets = targetData.targets || {};
        const formatCurrency = (value: number) => `Rp${Math.round(value).toLocaleString('id-ID')}`;

        let tableHtml = `
            <div class="overflow-x-auto">
                <table class="min-w-full divide-y divide-gray-200">
                    <thead class="bg-gray-50">
                        <tr>
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Metric</th>
                            <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Target</th>
                            <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actual</th>
                            <th class="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Change (%)</th>
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase hidden">Achievement</th>
                        </tr>
                    </thead>
                    <tbody class="bg-white divide-y divide-gray-200">`;

        const metricOrder = [
            "Pendapatan (Revenue)", "Harga Pokok Produksi", "Laba Kotor (Gross Profit)",
            "Beban Operasional (OPEX)", "Pendapatan Bersih Operasional (Net Operating Income)",
            "Beban Non Operasional", "Pendapatan Bersih Sebelum Deprisiasi/Amortisasi, Bunga & Pajak (EBITDA)",
            "Depresiasi/ Amortisasi", "Bunga", "Pajak (PB1)", "Pendapatan Bersih (Net Income)"
        ];

        const alsoStore = createMaybeAlsoStoreFn(config?.alsoStore);

        metricOrder.forEach(metric => {
            const targetRevenue = targets['Pendapatan (Revenue)'];
            let targetValue = 0;

            if (targetRevenue) {
                if (metric === 'Pendapatan (Revenue)') {
                    targetValue = targetRevenue;
                } else if (targets[metric] !== undefined) {
                    targetValue = targetRevenue * targets[metric];
                }
            }

            const actualValue = actualValues[metric as keyof typeof actualValues] || 0;
            const achievement = targetValue > 0 ? (actualValue / targetValue) * 100 : 0;
            const isCost = metric.toLowerCase().includes('beban') || metric.toLowerCase().includes('harga pokok');

            const change = actualValue - targetValue;
            let percentageChangeText = 'N/A';
            if (targetValue !== 0) {
                const percentage = (change / targetValue) * 100;
                percentageChangeText = `${percentage >= 0 ? '+' : ''}${percentage.toFixed(1)}%`;
            } else if (change !== 0) {
                percentageChangeText = 'New';
            }

            let changeColor = 'text-gray-500';
            if (change > 0) changeColor = isCost ? 'text-red-600' : 'text-green-600';
            if (change < 0) changeColor = isCost ? 'text-green-600' : 'text-red-600';

            alsoStore(formatCurrency(targetValue), (v) => ({ monthlyPnL_vs_target: { targets: { [metric]: v } } }))
            alsoStore(formatCurrency(actualValue), (v) => ({ monthlyPnL_vs_target: { actuals: { [metric]: v } } }))
            alsoStore(percentageChangeText, (v) => ({ monthlyPnL_vs_target: { changes: { [metric]: v } } }))

            tableHtml += `
                <tr>
                    <td class="px-6 py-4 text-sm font-medium text-gray-900">${metric}</td>
                    <td class="px-6 py-4 text-sm text-gray-500 text-right font-mono">${formatCurrency(targetValue)}</td>
                    <td class="px-6 py-4 text-sm text-gray-500 text-right font-mono">${formatCurrency(actualValue)}</td>
                    <td class="px-6 py-4 text-sm text-center font-semibold ${changeColor}">${percentageChangeText}</td>
                    <td class="px-6 py-4 text-sm text-gray-500">

                        <div class="flex items-center hidden">
                            <span class="font-semibold">${achievement.toFixed(1)}%</span>
                        </div>

                    </td>
                </tr>`;
        });

        tableHtml += `</tbody></table></div>`;
        bodyEl.innerHTML = tableHtml;

    } catch (error: any) {
        console.error("Error processing P&L target view:", error);
        bodyEl.innerHTML = `<p class="text-center text-red-500">Error: Could not display P&L target comparison. ${error.message}</p>`;
    }
}

/** A helper function to render a P&L statement into a container element. */
function renderPnlResults(pnlData: any, container: HTMLElement) {
    $store.setCurrentPnlData(pnlData);
    container.innerHTML = '';
    const formatCurrency = (value: number) => `Rp${Math.round(value).toLocaleString('id-ID')}`;

    // Initialize all total variables we'll need for calculations
    let totalRevenue = 0;
    let totalHPP = 0;
    let totalOpex = 0;
    let totalNonOpex = 0;
    let totalDepresiasi = 0;
    let totalBunga = 0;
    let totalPajak = 0;

    // Helper function to render a category section and update its total
    const renderCategory = (categoryName: string) => {
        const data = pnlData[categoryName] || {};
        const categoryTotal = Object.values(data).reduce((sum, value) => (sum as number) + (value as number), 0) as number;

        // Update the corresponding total variable based on the category name
        if (categoryName === "Pendapatan (Revenue)") totalRevenue = categoryTotal;
        if (categoryName === "Harga Pokok Produksi") totalHPP = categoryTotal;
        if (categoryName === "Beban Operasional (OPEX)") totalOpex = categoryTotal;
        if (categoryName === "Beban Non Operasional") totalNonOpex = categoryTotal;
        if (categoryName === "Depresiasi/ Amortisasi") totalDepresiasi = categoryTotal;
        if (categoryName === "Bunga") totalBunga = categoryTotal;
        if (categoryName === "Pajak (PB1)") totalPajak = categoryTotal;

        const itemsHtml = Object.entries(data).map(([name, value]) => `
            <div class="flex justify-between text-sm text-gray-600 pl-4">
                <span>${name}</span>
                <span class="font-mono">${formatCurrency(value as number)}</span>
            </div>
        `).join('');

        // Don't show a total line if there are no items
        const totalHtml = Object.keys(data).length > 0 ? `
            <div class="flex justify-between font-semibold pt-1 border-t mt-1">
                <span>Total ${categoryName}</span>
                <span class="font-mono">${formatCurrency(categoryTotal)}</span>
            </div>
        ` : '';

        return `
            <div class="mb-4">
                <h4 class="font-bold text-md text-gray-800">${categoryName}</h4>
                <div class="space-y-1 mt-2">${itemsHtml}</div>
                ${totalHtml}
            </div>
        `;
    };

    // Helper function to render a calculated subtotal row with highlighting
    const renderSubtotal = (label: string, value: number, colorClass: string) => {
        return `
            <div class="flex justify-between font-bold text-lg py-2 my-2 ${colorClass} rounded-md px-4">
                <span>${label}</span>
                <span class="font-mono">${formatCurrency(value)}</span>
            </div>
        `;
    };

    // --- Build the HTML string in the correct financial statement order ---
    let finalHtml = '';

    finalHtml += renderCategory("Pendapatan (Revenue)");
    finalHtml += renderCategory("Harga Pokok Produksi");
    const grossProfit = totalRevenue - totalHPP;
    finalHtml += renderSubtotal("Laba Kotor (Gross Profit)", grossProfit, "bg-yellow-100");

    finalHtml += renderCategory("Beban Operasional (OPEX)");
    const netOperatingIncome = grossProfit - totalOpex;
    finalHtml += renderSubtotal("Pendapatan Bersih Operasional (Net Operating Income)", netOperatingIncome, "bg-blue-100");

    finalHtml += renderCategory("Beban Non Operasional");
    const ebitda = netOperatingIncome - totalNonOpex;
    finalHtml += renderSubtotal("Pendapatan Bersih Sebelum Deprisiasi/Amortisasi, Bunga & Pajak (EBITDA)", ebitda, "bg-orange-100");

    finalHtml += renderCategory("Depresiasi/ Amortisasi");
    finalHtml += renderCategory("Bunga");
    finalHtml += renderCategory("Pajak (PB1)");

    const netIncome = ebitda - totalDepresiasi - totalBunga - totalPajak;
    finalHtml += renderSubtotal("Pendapatan Bersih (Net Income)", netIncome, "bg-green-200");

    container.innerHTML = finalHtml;
}

/** Initializes listeners for all modal close buttons. */
export function initializeModalListeners(): void {
    document.getElementById('pnl-data-modal-close')?.addEventListener('click', () => document.getElementById('pnl-data-modal')?.classList.add('hidden'));
    document.getElementById('pnl-data-modal-ok-btn')?.addEventListener('click', () => document.getElementById('pnl-data-modal')?.classList.add('hidden'));
    document.getElementById('sales-target-modal-close')?.addEventListener('click', () => document.getElementById('sales-target-modal')?.classList.add('hidden'));
    document.getElementById('sales-target-modal-ok-btn')?.addEventListener('click', () => document.getElementById('sales-target-modal')?.classList.add('hidden'));
    document.getElementById('pnl-target-modal-close')?.addEventListener('click', () => document.getElementById('pnl-target-modal')?.classList.add('hidden'));
    document.getElementById('pnl-target-modal-ok-btn')?.addEventListener('click', () => document.getElementById('pnl-target-modal')?.classList.add('hidden'));
    document.getElementById('view-choice-modal-close')?.addEventListener('click', () => viewChoiceModal?.classList.add('hidden'));
    document.getElementById('view-choice-cancel-btn')?.addEventListener('click', () => viewChoiceModal?.classList.add('hidden'));
    document.getElementById('summary-modal-close')?.addEventListener('click', () => document.getElementById('summary-modal')?.classList.add('hidden'));
    document.getElementById('monthly-summary-modal-close')?.addEventListener('click', () => document.getElementById('monthly-summary-modal')?.classList.add('hidden'));
}
