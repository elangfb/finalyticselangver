// This file declares DOM element constants and holds generic UI helper functions.

// --- DOM Element Constants (Exported for global access) ---
export const authView = document.getElementById('auth-view')
export const dashboardView = document.getElementById('dashboard-view')
export const analysisView = document.getElementById('analysis-view')
export const userManagementView = document.getElementById('user-management-view')
export const konfigurasiView = document.getElementById('konfigurasi-view')
export const plAnalysisView = document.getElementById('pl-analysis-view')
export const mainMenuview = document.getElementById('main-menu-view')
export const salesDashboardView = document.getElementById('sales-dashboard-view')
export const pnlHistoryView = document.getElementById('pnl-history-view')
export const pnlComparisonView = document.getElementById('pnl-comparison-view')

export const premiumAnalysisView = document.getElementById('premium-analysis-view')

export const authError = document.getElementById('auth-error')
export const signupError = document.getElementById('signup-error')
export const uploadError = document.getElementById('upload-error')
export const userListError = document.getElementById('user-list-error')
export const createUserFeedback = document.getElementById('create-user-feedback')
export const periodError = document.getElementById('period-error')

export const uploadHistoryList = document.getElementById('upload-history-list')
export const noUploadsMsg = document.getElementById('no-uploads-msg')
export const quickUploadModal = document.getElementById('quick-upload-modal')

export const loadingOverlay = document.getElementById('loading-overlay')
export const loadingMessage = document.getElementById('loading-message')
export const loadingProgressBar = document.getElementById('progress-bar')

// --- UI Helper Functions ---
/**
 * Shows the global loading overlay.
 * @param {object} options - Options for the loading display.
 * @param {number} [options.value=0] - The progress bar percentage.
 * @param {string} [options.message='Loading...'] - The message to display.
 */
export function showLoading({ value = 0, message = 'Loading...' }): void {
  if (loadingOverlay) loadingOverlay.classList.remove('hidden')
  if (loadingMessage) loadingMessage.textContent = message
  if (loadingProgressBar) (loadingProgressBar as HTMLElement).style.width = `${value}%`
}

/**
 * Hides the global loading overlay.
 */
export function hideLoading(): void {
  if (loadingOverlay) loadingOverlay.classList.add('hidden')
}
