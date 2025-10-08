// This file contains the core view-switching logic for the single-page application.

import * as $store from '@/store'
import {
  authView, analysisView, userManagementView, konfigurasiView,
  plAnalysisView, mainMenuview, salesDashboardView, pnlHistoryView, pnlComparisonView, premiumAnalysisView,
} from './ui'
import { currentView, setCurrentView, currentUserRole } from './state'
import { loadUsersForAdmin } from '@/admin/user-management'
import { setupConfigurationTab } from '@/config/gemini'

/**
 * Displays a specific application view while hiding all others.
 * It also handles role-based access for admin views and triggers necessary data loads.
 */
export function showView(viewName: string): void {
  // Reset analysis state when leaving the analysis view to prevent data leakage between sessions.
  if (currentView === 'analysis' && viewName !== 'analysis') {
    console.debug(`Leaving analysis view (${currentView} → ${viewName}), resetting analysis state`)
    $store.resetAnalysisState()
  }

  setCurrentView(viewName)

  // Hide all views first to ensure a clean slate.
  const allViews = [
    authView, mainMenuview, salesDashboardView, analysisView,
    userManagementView, konfigurasiView, plAnalysisView,
    pnlHistoryView, pnlComparisonView, premiumAnalysisView,
  ]
  allViews.forEach((v) => v?.classList.add('hidden'))

  // A map for simple view lookups.
  const viewMap: Record<string, HTMLElement | null> = {
    'auth': authView,
    'main-menu': mainMenuview,
    'sales-dashboard': salesDashboardView,
    'pl-analysis': plAnalysisView,
    'analysis': analysisView,
    'pnl-history': pnlHistoryView,
    'pnl-comparison': pnlComparisonView,
    'premium-analysis': premiumAnalysisView,
  }

  if (viewMap[viewName]) {
    viewMap[viewName]?.classList.remove('hidden')
  } else if (viewName === 'usermanagement') {
    // Handle admin-only view with a role check.
    if (currentUserRole === 'admin') {
      userManagementView?.classList.remove('hidden')
      loadUsersForAdmin() // Load data specific to this view.
    } else {
      alert('Access Denied')
      showView('main-menu') // Redirect non-admins.
    }
  } else if (viewName === 'konfigurasi') {
    // Handle another admin-only view.
    if (currentUserRole === 'admin') {
      konfigurasiView?.classList.remove('hidden')
      setupConfigurationTab() // Setup view-specific logic.
    } else {
      alert('Access Denied')
      showView('main-menu')
    }
  }
}
