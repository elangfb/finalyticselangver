const quickUploadModal = document.getElementById('quick-upload-modal')
const quickUploadTitle = document.getElementById('quick-upload-modal-title')
const typeDisplayNames = {
  salesData: 'Sales Data',
  salesTarget: 'Sales Target',
  pnlData: 'P&L Data',
  pnlTarget: 'P&L Target',
}

export function openQuickUploadModal(period: string, type: string) {
  if (!quickUploadModal || !quickUploadTitle) return

  const [year, month] = period.split('-') as [string, string]
  const formattedPeriod = new Date(parseInt(year), parseInt(month) - 1, 1).toLocaleString('default', { month: 'long', year: 'numeric' })

  quickUploadTitle.textContent = `Upload ${typeDisplayNames[type as keyof typeof typeDisplayNames]} for ${formattedPeriod}`
  ;(quickUploadModal as HTMLElement).dataset.period = period
  ;(quickUploadModal as HTMLElement).dataset.type = type

  ;(document.getElementById('quick-upload-file-input') as HTMLInputElement).value = ''
  document.getElementById('quick-upload-error')?.classList.add('hidden')
  const confirmBtn = document.getElementById('quick-upload-confirm-btn') as HTMLButtonElement
  confirmBtn.disabled = false
  confirmBtn.textContent = 'Upload & Process'
  document.getElementById('quick-upload-progress-container')?.classList.add('hidden')
  const statusEl = document.getElementById('quick-upload-processing-status')
  if (statusEl) {
    statusEl.classList.add('hidden')
    statusEl.textContent = ''
  }
  quickUploadModal.classList.remove('hidden')
}
