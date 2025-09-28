// Handles all user navigation within the analysis view, including sidebar clicks and section initialization.

import * as $store from '@/store';
import { setupPageSummary } from '@/components/PageSummary';
import { getGeminiAnalysis } from '@/config/gemini';

// Import setup functions from their new, organized locations
import { setupGeneralFinance, setupAnalisaPnl, generateAllTimePnlTable } from './sections/general/finance';
import { setupGeneralInvestment } from './sections/general/investment';
import { setupGeneralProductChannel } from './sections/general/product-channel';
import { setupGeneralSales } from './sections/general/sales';
import { setupTimeFinance } from './sections/time-comparison/finance';
import { setupTimeProductChannel } from './sections/time-comparison/product-channel';
import { setupTimeSales } from './sections/time-comparison/sales';
import { setupBranchFinance } from './sections/branch-comparison/finance';
import { setupBranchInvestment } from './sections/branch-comparison/investment';
import { setupBranchProductChannel } from './sections/branch-comparison/product-channel';
import { setupBranchSales } from './sections/branch-comparison/sales';

/**
 * Initializes the main event listener for the analysis sidebar navigation.
 */
export function initializeAnalysisNavigation(): void {
    const analysisView = document.getElementById('analysis-view');
    if (!analysisView) return;

    analysisView.addEventListener('click', async (e) => {
        const target = e.target as HTMLElement;
        const link = target.closest<HTMLAnchorElement>('.sidebar-link');
        const toggleBtn = target.closest<HTMLButtonElement>('.submenu-toggle');

        // Handle submenu expand/collapse
        if (toggleBtn) {
            const submenu = toggleBtn.nextElementSibling as HTMLElement;
            const chevron = toggleBtn.querySelector('.chevron-icon');
            if (submenu && chevron) {
                submenu.classList.toggle('hidden');
                chevron.classList.toggle('rotate-180');
            }
        }

        // Handle section link clicks
        if (link) {
            e.preventDefault();
            const targetId = link.dataset.target;
            if (!targetId) return;

            // Update active states for sidebar links
            document.querySelectorAll('#analysis-view .sidebar-link, #analysis-view .submenu-toggle').forEach(el => el.classList.remove('active'));
            link.classList.add('active');
            const parentToggle = link.closest('.submenu-container')?.querySelector('.submenu-toggle');
            if (parentToggle) parentToggle.classList.add('active');

            // Show the target section and hide others
            document.querySelectorAll('.analysis-section').forEach(sec => sec.classList.remove('active'));
            const targetSection = document.getElementById(`${targetId}-section`);
            if (targetSection) {
                targetSection.classList.add('active');
                $store.resetActiveViewData();
                setupPageSummary({ pageId: targetSection.id, analyzeUsingAI: getGeminiAnalysis });
            }

            // Show/hide the main global date filters based on the selected section's needs
            const usesCustomFilters = [
                'general-penjualan', 'general-keuangan', 'general-investasi', 'general-produk-channel',
                'waktu-penjualan', 'waktu-keuangan', 'waktu-produk-channel',
                'cabang-penjualan', 'cabang-keuangan', 'cabang-investasi', 'cabang-produk-channel',
                'analisa-pnl', 'waktu-pnl'
            ].includes(targetId);
            const mainFilters = document.getElementById('main-filters');
            if (mainFilters) {
                mainFilters.style.display = usesCustomFilters ? 'none' : 'block';
            }

            // Use setTimeout to ensure the view is rendered before initializing its specific logic
            setTimeout(async () => {
                $store.trySetFromExistingViewData(targetId);

                const setupActions: { [key: string]: () => Promise<void> | void } = {
                    'general-keuangan': setupGeneralFinance,
                    'general-penjualan': setupGeneralSales,
                    'general-produk-channel': setupGeneralProductChannel,
                    'general-investasi': setupGeneralInvestment,
                    'waktu-keuangan': setupTimeFinance,
                    'waktu-penjualan': setupTimeSales,
                    'waktu-produk-channel': setupTimeProductChannel,
                    'cabang-keuangan': setupBranchFinance,
                    'cabang-penjualan': setupBranchSales,
                    'cabang-produk-channel': setupBranchProductChannel,
                    'cabang-investasi': setupBranchInvestment,
                    'waktu-pnl': generateAllTimePnlTable,
                    'analisa-pnl': setupAnalisaPnl,
                };

                if (setupActions[targetId]) {
                    await setupActions[targetId]();
                }
            }, 0);
        }
    });
}
