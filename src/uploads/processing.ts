// Handles real-time feedback for backend file processing.

import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '@/core/firebase'
import { currentUser } from '@/core/state'
import { populateCompiledDataTable } from '../data-hub/table'
import { clearSummariesCache } from '@/services/localCacheService'

/**
 * Listens for real-time status updates on a Firestore document that signals
 * the progress of a backend data processing task.
 */
export function listenForProcessingStatus(jobId: string) {
  if (!currentUser) return

  const progressContainer = document.getElementById('upload-progress-container')
  const uploadView = document.getElementById('upload-view')
  const processingView = document.getElementById('processing-view')
  const processingFilename = document.getElementById('processing-filename')
  const processingStatusText = document.getElementById('processing-status-text')
  const processingProgressBar = document.getElementById('processing-progress-bar')
  const processingProgressPercent = document.getElementById('processing-progress-percent')

  if (!progressContainer || !uploadView || !processingView || !processingFilename || !processingStatusText || !processingProgressBar || !processingProgressPercent) {
    console.error('Could not find all processing UI elements.')
    return
  }

  // Transition UI to "Processing" state
  uploadView.classList.add('hidden')
  processingView.classList.remove('hidden')
  processingFilename.textContent = `Processing Job: ${jobId}`
  processingStatusText.textContent = 'Initializing on server...'
  processingProgressBar.style.width = '0%'
  processingProgressPercent.textContent = '0%'

  const jobDocRef = doc(db, `processingJobs`, jobId)

  const unsubscribe = onSnapshot(jobDocRef, async (docSnap) => {
    if (!docSnap.exists()) {
      processingStatusText.innerHTML = `<span class="text-red-600 font-semibold">Error: Job document not found.</span>`
      unsubscribe()
      return
    }

    const jobData = docSnap.data()
    const status = jobData?.status
    const progress = jobData?.progress

    if (status === 'processing' && progress) {
      const percent = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0
      processingProgressBar.style.width = `${percent}%`
      processingProgressPercent.textContent = `${percent}%`
      processingStatusText.textContent = progress.message || 'Processing...'
    } else if (status === 'complete') {
      processingProgressBar.style.width = '100%'
      processingProgressPercent.textContent = '100%'
      processingStatusText.innerHTML = `<span class="text-green-600 font-semibold">${progress?.message || 'Processing Complete!'} Updating cache...</span>`

      // --- FIX STARTS HERE: Incremental Cache Update ---
      const newProcessedDates = jobData?.processedDates as string[] // Get dates from job doc

      if (newProcessedDates && newProcessedDates.length > 0) {
        try {
          console.log(`Processing complete. Fetching new summaries for dates:`, newProcessedDates)

          // 1. Get existing data from cache
          const existingSummaries = await getSummariesFromCache() || []
          console.log(`Found ${existingSummaries.length} summaries in cache.`)

          // 2. Fetch *only* the new summaries from Firestore
          const summariesQuery = query(
            collectionGroup(db, 'dailySummaries'),
            where('userId', '==', currentUser.uid),
            where('date', 'in', newProcessedDates), // Target only the processed dates
          )
          const querySnapshot = await getDocs(summariesQuery)
          const newSummaries = querySnapshot.docs.map((doc) => ({ ...doc.data(), id: doc.id, date: new Date(doc.data().date) }))
          console.log(`Fetched ${newSummaries.length} new summaries from Firestore.`)

          // 3. Merge and remove duplicates (simple approach based on date string)
          const combinedMap = new Map<string, any>()
          existingSummaries.forEach((s) => combinedMap.set(s.date.toISOString().split('T')[0], s))
          newSummaries.forEach((s) => combinedMap.set(s.date.toISOString().split('T')[0], s)) // Overwrite if date exists
          const mergedSummaries = Array.from(combinedMap.values())
          mergedSummaries.sort((a, b) => a.date.getTime() - b.date.getTime()) // Re-sort after merge

          // 4. Save the updated list back to cache
          await saveSummariesToCache(mergedSummaries)
          console.log(`Saved ${mergedSummaries.length} total summaries back to cache (IndexedDB).`)
          processingStatusText.innerHTML = `<span class="text-green-600 font-semibold">${progress?.message || 'Processing Complete!'} Cache updated.</span>`
        } catch (e) {
          console.error('Failed to incrementally update IndexedDB cache. Clearing instead.', e)
          // Fallback: Clear cache if update fails
          await clearSummariesCache()
          processingStatusText.innerHTML = `<span class="text-yellow-600 font-semibold">Processing Complete! Could not update cache incrementally, cache cleared.</span>`
        }
      } else {
        console.warn('Processing complete, but no processed dates found in job document. Skipping cache update.')
        processingStatusText.innerHTML = `<span class="text-green-600 font-semibold">${progress?.message || 'Processing Complete!'}</span>`
      }
      // --- FIX ENDS HERE ---

      populateCompiledDataTable();
      location.reload();
      unsubscribe()
      setTimeout(() => {
        progressContainer.classList.remove('show')
        setTimeout(() => {
          progressContainer.classList.add('hidden')
          uploadView.classList.remove('hidden')
          processingView.classList.add('hidden')
        }, 300)
      }, 3000) // Keep success message visible for 3 seconds
    } else if (status === 'error') {
      processingProgressBar.classList.replace('bg-green-500', 'bg-red-500')
      processingStatusText.innerHTML = `<span class="text-red-600 font-semibold">Error: ${progress?.message || 'Processing failed'}</span>`

      unsubscribe()
      setTimeout(() => {
        progressContainer.classList.remove('show')
        setTimeout(() => {
          progressContainer.classList.add('hidden')
          uploadView.classList.remove('hidden')
          processingView.classList.add('hidden')
        }, 300)
      }, 5000)
    }
  })
}
