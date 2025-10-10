// Handles real-time feedback for backend file processing.

import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/core/firebase';
import { currentUser } from '@/core/state';
import { populateCompiledDataTable } from '../data-hub/table';
import { clearSummariesCache } from '@/services/localCacheService';

/**
 * Listens for real-time status updates on a Firestore document that signals
 * the progress of a backend data processing task.
 */
export function listenForProcessingStatus(jobId: string) {
  if (!currentUser) return;

  const progressContainer = document.getElementById('upload-progress-container');
  const uploadView = document.getElementById('upload-view');
  const processingView = document.getElementById('processing-view');
  const processingFilename = document.getElementById('processing-filename');
  const processingStatusText = document.getElementById('processing-status-text');
  const processingProgressBar = document.getElementById('processing-progress-bar');
  const processingProgressPercent = document.getElementById('processing-progress-percent');

  if (!progressContainer || !uploadView || !processingView || !processingFilename || !processingStatusText || !processingProgressBar || !processingProgressPercent) {
    console.error('Could not find all processing UI elements.');
    return;
  }

  // Transition UI to "Processing" state
  uploadView.classList.add('hidden');
  processingView.classList.remove('hidden');
  processingFilename.textContent = `Processing Job: ${jobId}`;
  processingStatusText.textContent = 'Initializing on server...';
  processingProgressBar.style.width = '0%';
  processingProgressPercent.textContent = '0%';

  const jobDocRef = doc(db, `processingJobs`, jobId);

  const unsubscribe = onSnapshot(jobDocRef, async (docSnap) => {
    if (!docSnap.exists()) {
      processingStatusText.innerHTML = `<span class="text-red-600 font-semibold">Error: Job document not found.</span>`;
      unsubscribe();
      return;
    }

    const jobData = docSnap.data();
    const status = jobData?.status;
    const progress = jobData?.progress;

    if (status === 'processing' && progress) {
      const percent = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;
      processingProgressBar.style.width = `${percent}%`;
      processingProgressPercent.textContent = `${percent}%`;
      processingStatusText.textContent = progress.message || 'Processing...';
    } else if (status === 'complete') {
      processingProgressBar.style.width = '100%';
      processingProgressPercent.textContent = '100%';
      processingStatusText.innerHTML = `<span class="text-green-600 font-semibold">${progress?.message || 'Processing Complete!'}</span>`;

      // Clear the IndexedDB cache on a successful upload
      try {
        await clearSummariesCache();
        console.log('New data uploaded. Daily summaries cache (IndexedDB) cleared.');
      } catch (e) {
        console.error("Failed to clear IndexedDB cache.", e);
      }

      populateCompiledDataTable(); // Refresh the main data hub table
      unsubscribe();
      setTimeout(() => {
        progressContainer.classList.remove('show');
        setTimeout(() => {
          progressContainer.classList.add('hidden');
          uploadView.classList.remove('hidden');
          processingView.classList.add('hidden');
        }, 300);
      }, 3000);
    } else if (status === 'error') {
      processingProgressBar.classList.replace('bg-green-500', 'bg-red-500');
      processingStatusText.innerHTML = `<span class="text-red-600 font-semibold">Error: ${progress?.message || 'Processing failed'}</span>`;

      unsubscribe();
      setTimeout(() => {
        progressContainer.classList.remove('show');
        setTimeout(() => {
          progressContainer.classList.add('hidden');
          uploadView.classList.remove('hidden');
          processingView.classList.add('hidden');
        }, 300);
      }, 5000);
    }
  });
}
