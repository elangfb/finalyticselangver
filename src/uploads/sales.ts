// Contains logic for uploading and processing main Sales Data files (standard and Moka formats).

declare const XLSX: any
declare const pako: any

import { doc, setDoc } from 'firebase/firestore'
import { ref, uploadBytesResumable, UploadTask } from 'firebase/storage'
import { db, storage } from '@/core/firebase'
import { currentUser } from '@/core/state'
import { getPeriodRangeFromEsbData, getPeriodRangeFromMokaData, getPeriodFromFile, detectSalesDataFormat } from './utils';
import { listenForProcessingStatus } from './processing'
import type { WorkSheet } from 'xlsx'

/**
 * A unified handler for uploading sales data files (both ESB and Moka).
 * It now creates the job document BEFORE uploading to prevent a race condition.
 */
export async function handleSalesDataUpload(file: File, format: 'ESB' | 'MOKA') {
  if (!currentUser) return;

  const progressContainer = document.getElementById('upload-progress-container');
  const statusText = document.getElementById('upload-status-text');

  if (!progressContainer || !statusText) {
    console.error('Progress UI elements not found');
    return;
  }

  progressContainer.classList.remove('hidden');
  setTimeout(() => progressContainer.classList.add('show'), 10);
  statusText.textContent = `Analyzing and compressing ${format} file...`;

  try {
    const fileBuffer = await file.arrayBuffer();
    const compressedData = pako.gzip(fileBuffer);

    const workbook = XLSX.read(fileBuffer);
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];

    const { startPeriod, endPeriod } = format === 'MOKA'
      ? getPeriodRangeFromMokaData(worksheet)
      : getPeriodRangeFromEsbData(worksheet);

    const periodRangeText = startPeriod === endPeriod ? startPeriod : `${startPeriod} to ${endPeriod}`;
    statusText.textContent = `Period(s) ${periodRangeText} found. Preparing upload...`;

    const jobId = `job_${Date.now()}`;
    const jobDocRef = doc(db, `processingJobs`, jobId);
    await setDoc(jobDocRef, {
      userId: currentUser.uid,
      jobId: jobId,
      fileName: file.name,
      status: 'preparing',
      createdAt: new Date(),
      format: format,
      periodRange: periodRangeText,
    });

    listenForProcessingStatus(jobId);

    const storagePath = `user_uploads/${currentUser.uid}/${jobId}/${file.name}.gz`;
    const storageRef = ref(storage, storagePath);

    const metadata = {
      contentEncoding: 'gzip',
      customMetadata: {
        userId: currentUser.uid,
        jobId: jobId,
        format: format,
        startPeriod: startPeriod,
        endPeriod: endPeriod,
      },
    };

    const uploadTask = uploadBytesResumable(storageRef, compressedData, metadata);

    uploadTask.on('state_changed',
      (snapshot) => {
        const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
        console.log(`Upload is ${progress}% done`);
      },
      (error) => {
        console.error(`${format} upload failed:`, error);
        setDoc(jobDocRef, { 'status': 'error', 'progress.message': 'File upload failed.' }, { merge: true });
      },
      async () => {
        console.log('File upload complete. Backend is processing...');
        await setDoc(jobDocRef, { status: 'uploaded' }, { merge: true });
      },
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    if(statusText) statusText.textContent = `Error: ${errorMessage}`;
    setTimeout(() => {
      progressContainer?.classList.remove('show');
      setTimeout(() => progressContainer?.classList.add('hidden'), 300);
    }, 5000);
    alert(`Error processing ${format} file: ${errorMessage}`);
  }
}

function getPeriodFromSalesData(worksheet: WorkSheet): string {
  const periodCell = worksheet['B5']
  if (!periodCell || !periodCell.v) {
    throw new Error('Period data range not found in cell B5. Please ensure it is filled out correctly.')
  }

  const dateRangeString = periodCell.v.toString()
  const startDateString = dateRangeString.split(' - ')[0]
  if (!startDateString) {
    throw new Error(`Invalid date range format in cell B5: "${dateRangeString}".`)
  }

  const parts = startDateString.split('-')
  if (parts.length !== 3) {
    throw new Error(`Invalid date format for the start date: "${startDateString}". Expected "DD-MM-YYYY".`)
  }

  const month = parts[1]
  const year = parts[2]

  if (!/^\d{4}$/.test(year) || !/^\d{2}$/.test(month)) {
    throw new Error(`Could not correctly parse the year and month from "${startDateString}".`)
  }

  return `${year}-${month}`
}

/**
 * Handles uploading of sales data files from the modal with period validation.
 * This function closes the modal and uses the main progress UI.
 */
export async function handleModalSalesDataUpload(file: File, expectedPeriod: string) {
  if (!currentUser) {
    throw new Error('User not authenticated.')
  }

  // Immediately close the modal to use the main progress UI
  document.getElementById('quick-upload-modal')?.classList.add('hidden')

  // --- All main progress bar UI elements ---
  const progressContainer = document.getElementById('upload-progress-container')
  const progressBar = document.getElementById('upload-progress-bar')
  const progressPercent = document.getElementById('upload-progress-percent')
  const statusText = document.getElementById('upload-status-text')
  const filenameText = document.getElementById('upload-filename')
  const cancelBtn = document.getElementById('cancel-upload-btn') as HTMLButtonElement
  const uploadButton = document.getElementById('upload-btn') as HTMLButtonElement

  if (!progressContainer || !progressBar || !progressPercent || !statusText || !filenameText || !cancelBtn || !uploadButton) {
    console.error('Main progress UI elements not found')
    return
  }

  // --- Initialize the main progress UI ---
  filenameText.textContent = file.name
  statusText.textContent = 'Analyzing file...'
  progressBar.style.width = '0%'
  progressBar.classList.remove('bg-green-500', 'bg-red-500')
  progressBar.classList.add('bg-blue-600')
  progressPercent.textContent = '0%'
  progressContainer.classList.remove('hidden')
  setTimeout(() => progressContainer.classList.add('show'), 10)

  try {
    // 1. Read the file client-side to validate the period
    const data = await file.arrayBuffer()
    const workbook = XLSX.read(data)
    const worksheet = workbook.Sheets[workbook.SheetNames[0]] // Use the first sheet
    const actualPeriod = getPeriodFromSalesData(worksheet)

    // 2. CRITICAL: Validate the file's period against the expected period from the table row
    if (actualPeriod !== expectedPeriod) {
      throw new Error(`File period mismatch. Expected '${expectedPeriod}', but file contains '${actualPeriod}'.`)
    }

    statusText.textContent = `Period ${actualPeriod} found. Uploading...`

    // 3. If validation passes, proceed with the full upload process
    const storagePath = `users/${currentUser.uid}/${actualPeriod}/${file.name}`
    const storageRef = ref(storage, storagePath)
    const metadata = { customMetadata: { userId: currentUser.uid, period: actualPeriod } }
    const uploadTask = uploadBytesResumable(storageRef, file, metadata)

    const cancelUpload = () => uploadTask.cancel()
    cancelBtn.addEventListener('click', cancelUpload, { once: true })

    uploadTask.on('state_changed',
      (snapshot) => {
        const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100
        const percent = Math.round(progress)
        progressBar.style.width = `${percent}%`
        progressPercent.textContent = `${percent}%`
        statusText.textContent = `Uploading... (${(snapshot.bytesTransferred / 1024 / 1024).toFixed(2)} MB of ${(snapshot.totalBytes / 1024 / 1024).toFixed(2)} MB)`
      },
      (error) => {
        // This block is executed on upload failure
        console.error('Modal Sales Data upload failed:', error)
        statusText.textContent = 'Upload Failed!'
        progressBar.classList.add('bg-red-500')
        uploadButton.disabled = false // Re-enable main upload button
        setTimeout(() => {
          progressContainer.classList.remove('show')
          setTimeout(() => progressContainer.classList.add('hidden'), 300)
        }, 5000)
        cancelBtn.removeEventListener('click', cancelUpload)
      },
      async () => {
        if (!currentUser) {
          throw new Error('User not authenticated.')
        }
        // This block is executed on upload success
        statusText.textContent = 'Upload Complete! Waiting for server...'
        progressBar.classList.add('bg-green-500')
        progressPercent.textContent = '100%'
        cancelBtn.removeEventListener('click', cancelUpload)

        // Trigger backend processing by creating the signal document
        const docRef = doc(db, `artifacts/sales-app/users/${currentUser.uid}/uploads`, actualPeriod)
        await setDoc(docRef, {
          fileName: file.name,
          status: 'uploaded',
          period: actualPeriod,
          storagePath: storagePath,
          uploadedAt: new Date(),
        })

        // Listen for the backend processing status using the main UI
        listenForProcessingStatus(actualPeriod)
      },
    )
  } catch (error) {
    console.error('Upload initialization failed:', error)
    const errorMessage = error instanceof Error ? error.message : String(error)
    // Use the main progress UI to show the error
    statusText.textContent = `Error: ${errorMessage}`
    progressBar.classList.add('bg-red-500')
    uploadButton.disabled = false
    setTimeout(() => {
      progressContainer.classList.remove('show')
      setTimeout(() => progressContainer.classList.add('hidden'), 5000)
    }, 5000)
  }
}
