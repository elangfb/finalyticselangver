// The main entry point for the application. Its sole responsibility is to
// initialize all the different modules of the application in the correct order.

// --- Global Library Declarations ---
declare const XLSX: any
declare const SlimSelect: any

// --- Core Module Imports ---
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

// --- Firestore Imports for top-level actions ---
import { collectionGroup, getDocs, query, where } from 'firebase/firestore'

// This function is defined here as it's a top-level action initiated from the main menu.
// In a larger application, this could be moved to a dedicated `actions.ts` file.
async function viewCompiledAnalysis(targetView: 'analysis' | 'premium-analysis' = 'analysis') {
  if (!currentUser) return
  showLoading({ message: 'Fetching all daily summaries...', value: 10 })
  try {
    const summariesQuery = query(collectionGroup(db, 'dailySummaries'), where('userId', '==', currentUser.uid))
    const querySnapshot = await getDocs(summariesQuery)

    const allSummaries = querySnapshot.docs.map((doc) => {
      const summary = doc.data()
      summary.date = new Date(summary.date)
      return summary
    })

    const validSummaries = allSummaries.filter((s) => s.date instanceof Date && !isNaN(s.date.getTime()))
    if (validSummaries.length === 0) {
      alert('No valid summarized data found. Please upload a file first.')
      hideLoading()
      return
    }

    validSummaries.sort((a, b) => a.date.getTime() - b.date.getTime())

    $store.setAllSalesData(validSummaries.map((d: any) => ({ ...d, date: new Date(d.date) })))
    $store.setAiAnalysisResults({})

    document.getElementById('analysis-title')!.textContent = 'Compiled Financial Analysis'
    hideLoading()

    // Use the targetView parameter to show the correct page
    showView(targetView)

    // This logic is specific to the original analysis view, so we'll guard it.
    if (targetView === 'analysis') {
      const targetLink = document.querySelector('a.sidebar-link[data-target="general-keuangan"]') as HTMLElement
      if (targetLink) {
        targetLink.click()
      } else {
        await setupGeneralFinance()
      }
    }
  } catch (error: any) {
    console.error('Failed to compile analysis from summaries:', error)
    hideLoading()
    alert(`An error occurred while fetching your data: ${error.message}`)
  }
}

/**
 * Main application initializer.
 * This function orchestrates the setup of all modules.
 */
function initializeApp(): void {
  console.log('Initializing Finalytics Application...')

  // 1. Core application setup (authentication is first)
  initializeAuth()

  // 2. Render dynamic UI components like the sidebar
  renderDynamicSidebar('new-analysis-sidebar');

  // 3. Initialize feature modules and their event listeners
  initializeAdminPanel()
  initializeUploadListeners()
  initializeDataHubListeners()
  initializeModalListeners()

  // 4. Initialize the complex analysis view and its sub-components
  initializeAnalysisNavigation()
  initializeInvestmentForm()
  initializePnlAccordionListener()

  // 5. Initialize top-level navigation buttons that don't belong to a specific module
  document.getElementById('goto-upload-data-btn')?.addEventListener('click', () => showView('sales-dashboard'))
  
  document.getElementById('goto-view-data-btn')?.addEventListener('click', () => viewCompiledAnalysis('analysis'))
  document.getElementById('goto-premium-analysis-btn')?.addEventListener('click', () => viewCompiledAnalysis('premium-analysis'))

  document.getElementById('back-to-main-menu-from-data-hub-btn')?.addEventListener('click', () => showView('main-menu'))
}

// --- Run the Application ---
initializeApp()
