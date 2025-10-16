// The main entry point for the application. Its sole responsibility is to
// initialize all the different modules of the application in the correct order.

// --- Global Library Declarations ---
declare const XLSX: any
declare const SlimSelect: any

// --- Core Module Imports ---
import { getSummariesFromCache, saveSummariesToCache, clearSummariesCache } from './services/localCacheService';
import { collectionGroup, getDocs, query, where } from 'firebase/firestore';
import { showView } from './core/views'
import { currentUser } from './core/state'
import { showLoading, hideLoading } from './core/ui'
import { db } from './core/firebase'
import * as $store from './store'

// --- Feature Module Initializers ---
import { initializeAuth } from './auth/auth'
import { initializeAdminPanel } from './admin/user-management'
import { initializeUploadListeners } from './uploads/listeners'
import { initializeDataHubListeners } from './data-hub/listeners'
import { initializeModalListeners } from './data-hub/modals'
import { initializeAnalysisNavigation } from './analysis/navigation'
import { initializeInvestmentForm, setupGeneralInvestment } from './analysis/sections/general/investment'
import { initializePnlAccordionListener, setupGeneralFinance } from './analysis/sections/general/finance'
import { renderDynamicSidebar } from './core/sidebar.ts';
import { viewCompiledAnalysis } from './analysis/actions';

// --- Firestore Imports for top-level actions ---
import { collectionGroup, getDocs, query, where } from 'firebase/firestore'

// This function is defined here as it's a top-level action initiated from the main menu.
// In a larger application, this could be moved to a dedicated `actions.ts` file.
async function viewCompiledAnalysis(targetView: 'analysis' | 'premium-analysis' = 'analysis') {
  if (!currentUser) return;
  
  // Logic is now split: Caching only applies to the 'premium-analysis' view.
  if (targetView !== 'premium-analysis') {
    console.log("Bypassing cache for standard analysis view. Fetching fresh data...");
    showLoading({ message: 'Fetching all daily summaries...', value: 10 });
    try {
        const summariesQuery = query(collectionGroup(db, 'dailySummaries'), where('userId', '==', currentUser.uid));
        const querySnapshot = await getDocs(summariesQuery);
        const allSummaries = querySnapshot.docs.map(doc => ({...doc.data(), date: new Date(doc.data().date)}));
        const validSummaries = allSummaries.filter(s => s.date instanceof Date && !isNaN(s.date.getTime()));

        if (validSummaries.length === 0) {
            alert('No valid summarized data found. Please upload a file first.');
            hideLoading();
            return;
        }

        validSummaries.sort((a, b) => a.date.getTime() - b.date.getTime());
        $store.setAllSalesData(validSummaries);
        $store.setAiAnalysisResults({});
        document.getElementById('analysis-title')!.textContent = 'Compiled Financial Analysis';
        hideLoading();
        showView(targetView);

        const targetLink = document.querySelector('a.sidebar-link[data-target="general-keuangan"]') as HTMLElement;
        if (targetLink) targetLink.click();
        else await setupGeneralFinance();
        return;
    } catch (error: any) {
        console.error('Failed to compile analysis from summaries:', error);
        hideLoading();
        alert(`An error occurred while fetching your data: ${error.message}`);
        return;
    }
  }

  // --- Caching Logic for Premium View ---

  // 1. Try to load from IndexedDB cache first.
  showLoading({ message: 'Checking for cached data...', value: 20 });
  try {
    const cachedData = await getSummariesFromCache();
    if (cachedData) {
        console.log("%cCACHE HIT:", "color: #22c55e; font-weight: bold;", "Loading daily summaries from IndexedDB cache.");
        const summariesFromCache = cachedData.map((s: any) => ({ ...s, date: new Date(s.date) }));
        
        $store.setAllSalesData(summariesFromCache);
        hideLoading();
        showView(targetView);
        return; // Exit function after loading from cache
    }
  } catch (e) {
      console.error("Failed to read from IndexedDB. Clearing cache and fetching from DB.", e);
      await clearSummariesCache();
  }

  // 2. If cache is empty, fetch from Firestore and save to IndexedDB cache.
  console.log("%cCACHE MISS & SAVE:", "color: #f97316; font-weight: bold;", "Fetching from Firestore and saving to IndexedDB for premium view.");
  showLoading({ message: 'Fetching all daily summaries...', value: 10 });
  try {
    const summariesQuery = query(collectionGroup(db, 'dailySummaries'), where('userId', '==', currentUser.uid));
    const querySnapshot = await getDocs(summariesQuery);
    const allSummaries = querySnapshot.docs.map(doc => ({...doc.data(), id: doc.id, date: new Date(doc.data().date)}));
    const validSummaries = allSummaries.filter(s => s.date instanceof Date && !isNaN(s.date.getTime()));

    if (validSummaries.length === 0) {
      alert('No valid summarized data found. Please upload a file first.');
      hideLoading();
      return;
    }

    validSummaries.sort((a, b) => a.date.getTime() - b.date.getTime());

    try {
      await saveSummariesToCache(validSummaries);
      console.log("Daily summaries saved to IndexedDB cache.");
    } catch (e) {
      console.error("Failed to save data to IndexedDB.", e);
    }
    
    $store.setAllSalesData(validSummaries);
    hideLoading();
    showView(targetView);
  } catch (error: any) {
    console.error('Failed to compile analysis from summaries:', error);
    hideLoading();
    alert(`An error occurred while fetching your data: ${error.message}`);
  }
}

/**
 * Main application initializer.
 * This function orchestrates the setup of all modules.
 */
function initializeApp(): void {
  console.log('Initializing Finalytics Application...');

  // 1. Core application setup
  initializeAuth();

  // 2. Render dynamic UI components
  renderDynamicSidebar('new-analysis-sidebar');

  // 3. Initialize feature modules and their event listeners
  initializeAdminPanel();
  initializeUploadListeners();
  initializeDataHubListeners();
  initializeModalListeners();
  initializeAnalysisNavigation();

  // 4. Initialize top-level navigation buttons
  document.getElementById('goto-upload-data-btn')?.addEventListener('click', () => showView('sales-dashboard'));
  document.getElementById('goto-view-data-btn')?.addEventListener('click', () => viewCompiledAnalysis('analysis'));
  document.getElementById('goto-premium-analysis-btn')?.addEventListener('click', () => viewCompiledAnalysis('premium-analysis'));
  document.getElementById('back-to-main-menu-from-data-hub-btn')?.addEventListener('click', () => showView('main-menu'));
}

// --- Run the Application ---
initializeApp();