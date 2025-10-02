// Centralizes all event listeners related to file uploads and template downloads.

import { populateCompiledDataTable } from '../data-hub/table'
import { handleSalesDataUpload, handleModalSalesDataUpload } from './sales'
import { downloadPnlTemplate, uploadAndProcessPnlFile } from './pnl'
import { handleTargetUpload, downloadPnlTargetTemplate, downloadSalesTargetTemplate, handleModalTargetUpload } from './targets'
import { showLoading, hideLoading, quickUploadModal } from '@/core/ui'
import { generateGeneralFinance } from '@/analysis/sections/general/finance'
import { currentUser } from '@/core/state'

/**
 * Attaches all event listeners for upload buttons, template downloads, and the quick upload modal.
 */
export function initializeUploadListeners(): void {
  // Listener for the main "Upload Standard Template" button
  document.getElementById('upload-btn')?.addEventListener('click', async () => {
    // It reads from the shared 'file-input'
    const fileInput = document.getElementById('file-input') as HTMLInputElement
    const file = fileInput.files?.[0]
    if (file) {
      (document.getElementById('upload-btn') as HTMLButtonElement).disabled = true
      // It calls the handler with the 'ESB' format
      await handleSalesDataUpload(file, 'ESB');
      (document.getElementById('upload-btn') as HTMLButtonElement).disabled = false
      fileInput.value = ''
    } else {
      alert('Please select a file first.')
    }
  })

  // Listener for the "Upload Moka Template" button
  document.getElementById('upload-moka-btn')?.addEventListener('click', async () => {
    // It also reads from the shared 'file-input'
    const fileInput = document.getElementById('file-input') as HTMLInputElement
    const file = fileInput.files?.[0]
    if (file) {
      (document.getElementById('upload-moka-btn') as HTMLButtonElement).disabled = true
      // It calls the same handler but with the 'MOKA' format
      await handleSalesDataUpload(file, 'MOKA');
      (document.getElementById('upload-moka-btn') as HTMLButtonElement).disabled = false
      fileInput.value = ''
    } else {
      alert('Please select a file first.')
    }
  })

  document.getElementById('refresh-data-hub-btn')?.addEventListener('click', async () => {
    const btn = document.getElementById('refresh-data-hub-btn') as HTMLButtonElement
    const icon = btn.querySelector('svg')

    if (!btn || !icon) return

    // Disable button and add spinning animation for feedback
    btn.disabled = true
    icon.classList.add('animate-spin')

    try {
      // Call the existing function to re-fetch and re-populate the table
      await populateCompiledDataTable()
    } catch (error) {
      console.error('Failed to refresh data hub:', error)
      alert('There was an error refreshing the data. Please check the console.')
    } finally {
      // Re-enable button and remove animation when done
      btn.disabled = false
      icon.classList.remove('animate-spin')
    }
  })

  // Listener for P&L Data upload button
  document.getElementById('upload-pnl-data-btn')?.addEventListener('click', async () => {
    const fileInput = document.getElementById('pnl-data-file-input') as HTMLInputElement
    const file = fileInput.files?.[0]
    if (!file || !currentUser) return
    showLoading({ message: 'Processing P&L file...' })
    try {
      await uploadAndProcessPnlFile(file)
      alert(`P&L Report has been successfully created!`)
      await populateCompiledDataTable()
    } catch (error: any) {
      alert(`Failed to process P&L file. Error: ${error.message}`)
    } finally {
      hideLoading()
      fileInput.value = ''
    }
  })

  // Listener for P&L Target upload button
  document.getElementById('upload-pnl-target-btn')?.addEventListener('click', async () => {
    const fileInput = document.getElementById('pnl-target-file-input') as HTMLInputElement
    const file = fileInput.files?.[0]
    if (!file || !currentUser) return
    showLoading({ message: 'Processing P&L target...' })
    try {
      await handleTargetUpload(file, 'pnl')
      alert('P&L target file uploaded successfully!')
      await populateCompiledDataTable()
    } catch (error: any) {
      alert(`Error: ${error.message}`)
    } finally {
      hideLoading()
      fileInput.value = ''
    }
  })

  // Listener for Sales Target upload button
  document.getElementById('upload-sales-target-btn')?.addEventListener('click', async () => {
    const fileInput = document.getElementById('sales-target-file-input') as HTMLInputElement
    const file = fileInput.files?.[0]
    if (!file || !currentUser) return
    showLoading({ message: 'Processing sales target...' })
    try {
      await handleTargetUpload(file, 'sales')
      alert('Sales target file uploaded successfully!')
      await populateCompiledDataTable()
    } catch (error: any) {
      alert(`Error: ${error.message}`)
    } finally {
      hideLoading()
      fileInput.value = ''
    }
  })

  // --- Template Download Listeners ---
  document.getElementById('download-pnl-template-btn')?.addEventListener('click', downloadPnlTemplate)
  document.getElementById('download-sales-target-template-btn')?.addEventListener('click', downloadSalesTargetTemplate)
  document.getElementById('download-pnl-target-template-btn')?.addEventListener('click', downloadPnlTargetTemplate)

  // --- Quick Upload Modal Logic ---
  const quickUploadConfirmBtn = document.getElementById('quick-upload-confirm-btn') as HTMLButtonElement
  quickUploadConfirmBtn?.addEventListener('click', async () => {
    if (!quickUploadModal) return
    const fileInput = document.getElementById('quick-upload-file-input') as HTMLInputElement
    const errorEl = document.getElementById('quick-upload-error')
    const statusEl = document.getElementById('quick-upload-processing-status')

    const file = fileInput.files?.[0]
    const period = quickUploadModal.dataset.period
    const type = quickUploadModal.dataset.type

    if (!file || !period || !type) {
      if (errorEl) errorEl.textContent = 'Please select a file.'
      errorEl?.classList.remove('hidden')
      return
    }

    if (errorEl) errorEl.classList.add('hidden')
    quickUploadConfirmBtn.disabled = true
    quickUploadConfirmBtn.textContent = 'Processing...'

    try {
      switch (type) {
        case 'salesData':
          await handleModalSalesDataUpload(file, period)
          break
        case 'salesTarget':
          await handleModalTargetUpload(file, period, 'sales')
          break
        case 'pnlData':
          await uploadAndProcessPnlFile(file, period)
          break
        case 'pnlTarget':
          await handleModalTargetUpload(file, period, 'pnl')
          break
      }

      if (statusEl) {
        statusEl.textContent = 'Success! The table will refresh shortly.'
        statusEl.className = 'mt-2 text-sm text-green-600'
        statusEl.classList.remove('hidden')
      }

      await populateCompiledDataTable()

      const generalKeuanganSection = document.getElementById('general-keuangan-section')
      if (generalKeuanganSection?.classList.contains('active')) {
        await generateGeneralFinance()
      }
      setTimeout(() => quickUploadModal?.classList.add('hidden'), 2000)
    } catch (error: any) {
      console.error('Quick upload failed:', error)
      if (errorEl) {
        errorEl.textContent = `Error: ${error.message}`
        errorEl.classList.remove('hidden')
      }
      quickUploadConfirmBtn.disabled = false
      quickUploadConfirmBtn.textContent = 'Upload & Process'
    }
  })

  // Close modal listeners
  quickUploadModal?.querySelector('#quick-upload-modal-close')?.addEventListener('click', () => quickUploadModal?.classList.add('hidden'))
  quickUploadModal?.querySelector('#quick-upload-cancel-btn')?.addEventListener('click', () => quickUploadModal?.classList.add('hidden'))
}
