const loadingOverlay = document.getElementById('loading-overlay')
const loadingMessage = document.getElementById('loading-message')
const loadingProgressBar = document.getElementById('progress-bar')

export function showLoading({ value = 0, message = 'Loading...' }) {
  loadingOverlay?.classList.remove('hidden')
  if (loadingMessage) loadingMessage.textContent = message
  if (loadingProgressBar) loadingProgressBar.style.width = `${value}%`
}

export function hideLoading() {
  loadingOverlay?.classList.add('hidden')
}
