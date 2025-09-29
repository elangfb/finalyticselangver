export function initializeModalListeners(): void {
  document.getElementById('pnl-data-modal-close')?.addEventListener('click', () => document.getElementById('pnl-data-modal')?.classList.add('hidden'))
  document.getElementById('pnl-data-modal-ok-btn')?.addEventListener('click', () => document.getElementById('pnl-data-modal')?.classList.add('hidden'))
  document.getElementById('sales-target-modal-close')?.addEventListener('click', () => document.getElementById('sales-target-modal')?.classList.add('hidden'))
  document.getElementById('sales-target-modal-ok-btn')?.addEventListener('click', () => document.getElementById('sales-target-modal')?.classList.add('hidden'))
  document.getElementById('pnl-target-modal-close')?.addEventListener('click', () => document.getElementById('pnl-target-modal')?.classList.add('hidden'))
  document.getElementById('pnl-target-modal-ok-btn')?.addEventListener('click', () => document.getElementById('pnl-target-modal')?.classList.add('hidden'))
  document.getElementById('view-choice-modal-close')?.addEventListener('click', () => document.getElementById('view-choice-modal')?.classList.add('hidden'))
  document.getElementById('view-choice-cancel-btn')?.addEventListener('click', () => document.getElementById('view-choice-modal')?.classList.add('hidden'))
  document.getElementById('summary-modal-close')?.addEventListener('click', () => document.getElementById('summary-modal')?.classList.add('hidden'))
  document.getElementById('monthly-summary-modal-close')?.addEventListener('click', () => document.getElementById('monthly-summary-modal')?.classList.add('hidden'))
}
