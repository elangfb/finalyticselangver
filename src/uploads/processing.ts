// Handles real-time feedback for backend file processing.

import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/core/firebase';
import { currentUser } from '@/core/state';
import { populateCompiledDataTable } from '../data-hub/table';

/**
 * Listens for real-time status updates on a Firestore document that signals
 * the progress of a backend data processing task.
 * @param period The period (YYYY-MM) which also serves as the document ID for the upload.
 */
export function listenForProcessingStatus(period: string) {
    if (!currentUser) return;

    const progressContainer = document.getElementById('upload-progress-container');
    const uploadView = document.getElementById('upload-view');
    const processingView = document.getElementById('processing-view');
    const processingFilename = document.getElementById('processing-filename');
    const processingStatusText = document.getElementById('processing-status-text');
    const processingProgressBar = document.getElementById('processing-progress-bar');
    const processingProgressPercent = document.getElementById('processing-progress-percent');

    if (!progressContainer || !uploadView || !processingView || !processingFilename || !processingStatusText || !processingProgressBar || !processingProgressPercent) {
        console.error("Could not find all processing UI elements.");
        return;
    }

    // Transition UI to "Processing" state
    uploadView.classList.add('hidden');
    processingView.classList.remove('hidden');
    processingFilename.textContent = `Processing for ${period}`;
    processingStatusText.textContent = 'Initializing on server...';
    (processingProgressBar as HTMLElement).style.width = '0%';
    processingProgressPercent.textContent = '0%';

    const docRef = doc(db, `artifacts/sales-app/users/${currentUser.uid}/uploads`, period);

    const unsubscribe = onSnapshot(docRef, (docSnap) => {
        if (!docSnap.exists()) return;

        const data = docSnap.data();
        const status = data?.processingStatus;

        if (status) {
            if (status.state === 'processing' && status.totalRows > 0) {
                const percent = Math.round((status.rowsProcessed / status.totalRows) * 100);
                (processingProgressBar as HTMLElement).style.width = `${percent}%`;
                processingProgressPercent.textContent = `${percent}%`;
                processingStatusText.textContent = `Processing row ${status.rowsProcessed.toLocaleString()} of ${status.totalRows.toLocaleString()}`;
            }
            else if (status.state === 'complete') {
                (processingProgressBar as HTMLElement).style.width = '100%';
                processingProgressPercent.textContent = '100%';
                processingStatusText.innerHTML = '<span class="text-green-600 font-semibold">Processing Complete!</span>';

                populateCompiledDataTable(); // Refresh the main data hub

                unsubscribe(); // Stop listening after completion
                setTimeout(() => {
                    progressContainer.classList.remove('show');
                    setTimeout(() => {
                        progressContainer.classList.add('hidden');
                        uploadView.classList.remove('hidden');
                        processingView.classList.add('hidden');
                    }, 300);
                }, 3000);
            }
            else if (status.state === 'error') {
                (processingProgressBar as HTMLElement).classList.replace('bg-blue-600', 'bg-red-500');
                processingStatusText.innerHTML = `<span class="text-red-600 font-semibold">Error: ${status.message || 'Processing failed'}</span>`;

                unsubscribe(); // Stop listening after error
                setTimeout(() => {
                    progressContainer.classList.remove('show');
                    setTimeout(() => {
                        progressContainer.classList.add('hidden');
                        uploadView.classList.remove('hidden');
                        processingView.classList.add('hidden');
                    }, 300);
                }, 5000);
            }
        }
    });
}
