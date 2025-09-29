// Contains all logic for the "Analisis Perbandingan Waktu > Aspek Keuangan" section.

import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/core/firebase';
import { currentUser } from '@/core/state';
import { showLoading, hideLoading } from '@/core/ui';
import * as $store from '@/store';
import { createAlsoStoreFn } from '../../utils/store-helpers';
import { generatePnlComparisonTable, generateRatioComparisonChart } from './finance/generators';

/**
 * Generates a detailed P&L comparison table between two periods,
 * formatted similarly to the P&L vs. Target table.
 */
// Generators moved to './finance/generators'

/**
 * Main orchestrator for the "Analisis Perbandingan Waktu > Aspek Keuangan" section.
 */
async function generateTimeFinance() {
    if (!currentUser) return;
    const periodA = (document.getElementById('waktu-keuangan-period-a') as HTMLSelectElement).value;
    const periodB = (document.getElementById('waktu-keuangan-period-b') as HTMLSelectElement).value;
    const selectedBranch = (document.getElementById('waktu-keuangan-branch-select') as HTMLSelectElement).value;

    if (!periodA || !periodB || !selectedBranch) return;

    showLoading({ message: 'Fetching P&L data for comparison...', value: 30 });

    $store.clearViewData('waktu-keuangan');
    $store.setActiveViewData('waktu-keuangan', {
        viewContext: {
            periodA,
            periodB,
            selectedBranch
        }
    }, { periodA, periodB, selectedBranch });
    const alsoStore = createAlsoStoreFn($store, 'waktu-keuangan');

    const pnlReportsRef = collection(db, `users/${currentUser.uid}/pnlReports`);
    const reportsSnap = await getDocs(pnlReportsRef);
    const allReports = reportsSnap.docs.map(doc => doc.data());

    const findReport = (period: string, branch: string) => allReports.find(r => r.period === period && r.branchName === branch);

    const reportA = findReport(periodA, selectedBranch);
    const reportB = findReport(periodB, selectedBranch);

    generatePnlComparisonTable(reportA, reportB, 'waktu-pnl-comparison-container', { alsoStore });
    generateRatioComparisonChart(reportA, reportB, { canvasId: 'waktu-cogs-comparison-chart', metric: 'Harga Pokok Produksi', title: 'COGS', alsoStore });
    generateRatioComparisonChart(reportA, reportB, { canvasId: 'waktu-gpm-comparison-chart', metric: 'Laba Kotor (Gross Profit)', title: 'Gross Profit', alsoStore });
    generateRatioComparisonChart(reportA, reportB, { canvasId: 'waktu-hr-comparison-chart', metric: 'Beban Operasional (OPEX)', title: 'OPEX', alsoStore });
    generateRatioComparisonChart(reportA, reportB, { canvasId: 'waktu-npm-comparison-chart', metric: 'Pendapatan Bersih (Net Income)', title: 'Net Income', alsoStore });

    hideLoading();
}

/**
 * Updates the Period A and Period B selectors based on the selected branch.
 */
async function updateTimeFinancePeriodSelectors(selectedBranch: string) {
    if (!currentUser) return;
    const selectA = document.getElementById('waktu-keuangan-period-a') as HTMLSelectElement;
    const selectB = document.getElementById('waktu-keuangan-period-b') as HTMLSelectElement;
    const container = document.getElementById('waktu-pnl-comparison-container');

    selectA.innerHTML = '<option>Loading periods...</option>';
    selectB.innerHTML = '<option>Loading periods...</option>';

    const pnlReportsRef = collection(db, `users/${currentUser.uid}/pnlReports`);
    const q = query(pnlReportsRef, where("branchName", "==", selectedBranch));
    const reportsSnap = await getDocs(q);
    const periods = reportsSnap.docs.map(doc => doc.data().period).filter(Boolean).sort().reverse();

    if (periods.length < 2) {
        selectA.innerHTML = '<option>Not enough data for comparison</option>';
        selectB.innerHTML = '<option>Not enough data for comparison</option>';
        if (container) container.innerHTML = '<p class="text-gray-500 p-4 text-center">This branch lacks sufficient P&L reports for comparison.</p>';
        return;
    }

    const periodOptionsHtml = periods.map(p => `<option value="${p}">${new Date(p + '-02').toLocaleString('default', { month: 'long', year: 'numeric' })}</option>`).join('');
    selectA.innerHTML = periodOptionsHtml;
    selectB.innerHTML = periodOptionsHtml;
    selectA.value = periods[1];
    selectB.value = periods[0];
    await generateTimeFinance();
}

/**
 * Sets up the period and branch selectors for the "Waktu > Keuangan" section.
 */
export async function setupTimeFinance() {
    if ($store.getInitFlag('waktuKeuanganSelectorsInitialized')) return;
    if (!currentUser) return;

    const selectA = document.getElementById('waktu-keuangan-period-a') as HTMLSelectElement;
    const selectB = document.getElementById('waktu-keuangan-period-b') as HTMLSelectElement;
    const branchSelect = document.getElementById('waktu-keuangan-branch-select') as HTMLSelectElement;

    const reportsRef = collection(db, `users/${currentUser.uid}/pnlReports`);
    const reportsSnap = await getDocs(reportsRef);
    const branches = [...new Set(reportsSnap.docs.map(doc => doc.data().branchName))].sort();

    if (branches.length === 0) {
        branchSelect.innerHTML = '<option>No branches found</option>';
        return;
    }

    branchSelect.innerHTML = branches.map(b => `<option value="${b}">${b}</option>`).join('');
    branchSelect.value = branches[0];

    const handler = () => generateTimeFinance();
    selectA.addEventListener('change', handler);
    selectB.addEventListener('change', handler);
    branchSelect.addEventListener('change', () => updateTimeFinancePeriodSelectors(branchSelect.value));

    $store.setInitFlag('waktuKeuanganSelectorsInitialized', true);
    await updateTimeFinancePeriodSelectors(branches[0]);
}
