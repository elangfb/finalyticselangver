const viewChoiceModal = document.getElementById('view-choice-modal')

export function openViewChoiceModal(uploadId: string, fileName: string) {
  if (!viewChoiceModal) return
  ;(viewChoiceModal as HTMLElement).dataset.uploadId = uploadId
  ;(viewChoiceModal as HTMLElement).dataset.fileName = fileName
  viewChoiceModal.classList.remove('hidden')
}
