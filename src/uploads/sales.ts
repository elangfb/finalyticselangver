// Contains logic for uploading and processing main Sales Data files (standard and Moka formats).

declare const XLSX: any;

import { doc, setDoc } from 'firebase/firestore';
import { ref, uploadBytesResumable, UploadTask } from 'firebase/storage';
import { db, storage } from '../core/firebase';
import { currentUser } from '../core/state';
import { getPeriodFromSalesData, getPeriodFromMokaData } from './utils';
import { listenForProcessingStatus } from './processing';

/**
 * A generic handler for uploading a sales data file, showing progress,
 * and triggering backend processing. This replaces the duplicated logic
 * from the original file.
 * @param file The file to upload.
 * @param format The format of the file ('STANDARD' or 'MOKA').
 * @param expectedPeriod An optional period string (YYYY-MM) for validation from modal uploads.
 */
export async function uploadSalesFile(file: File, format: 'STANDARD' | 'MOKA', expectedPeriod: string | null = null): Promise<void> {
    if (!currentUser) throw new Error("User not authenticated.");

    // --- All progress bar UI elements ---
    const progressContainer = document.getElementById('upload-progress-container');
    const progressBar = document.getElementById('upload-progress-bar');
    const progressPercent = document.getElementById('upload-progress-percent');
    const statusText = document.getElementById('upload-status-text');
    const filenameText = document.getElementById('upload-filename');
    const cancelBtn = document.getElementById('cancel-upload-btn');
    const uploadButton = document.getElementById('upload-btn') as HTMLButtonElement;

    if (!progressContainer || !progressBar || !progressPercent || !statusText || !filenameText || !cancelBtn) {
        console.error("Could not find all required progress UI elements.");
        alert("An unexpected UI error occurred. Please refresh the page.");
        return;
    }

    // --- Initialize the main progress UI ---
    filenameText.textContent = file.name;
    statusText.textContent = 'Analyzing file...';
    progressBar.style.width = '0%';
    progressBar.classList.remove('bg-green-500', 'bg-red-500');
    progressBar.classList.add('bg-blue-600');
    progressPercent.textContent = '0%';
    progressContainer.classList.remove('hidden');
    setTimeout(() => progressContainer.classList.add('show'), 10);

    try {
        const fileData = await file.arrayBuffer();
        const workbook = XLSX.read(fileData);
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];

        const period = format === 'STANDARD'
            ? getPeriodFromSalesData(worksheet)
            : getPeriodFromMokaData(worksheet);

        if (expectedPeriod && period !== expectedPeriod) {
            throw new Error(`File period mismatch. Expected '${expectedPeriod}', but file contains '${period}'.`);
        }

        statusText.textContent = `Period ${period} found. Uploading...`;

        const storagePath = `users/${currentUser.uid}/${period}/${file.name}`;
        const storageRef = ref(storage, storagePath);
        const metadata = { customMetadata: { userId: currentUser.uid, period, format } };
        const uploadTask: UploadTask = uploadBytesResumable(storageRef, file, metadata);

        const cancelUpload = () => uploadTask.cancel();
        cancelBtn.addEventListener('click', cancelUpload, { once: true });

        uploadTask.on('state_changed',
            (snapshot) => {
                const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                const percent = Math.round(progress);
                progressBar.style.width = `${percent}%`;
                progressPercent.textContent = `${percent}%`;
                statusText.textContent = `Uploading... (${(snapshot.bytesTransferred / 1024 / 1024).toFixed(2)} MB of ${(snapshot.totalBytes / 1024 / 1024).toFixed(2)} MB)`;
            },
            (error) => {
                console.error("Upload failed:", error);
                statusText.textContent = 'Upload Failed!';
                progressBar.classList.add('bg-red-500');
                if (uploadButton) uploadButton.disabled = false;
                setTimeout(() => {
                    progressContainer.classList.remove('show');
                    setTimeout(() => progressContainer.classList.add('hidden'), 300);
                }, 5000);
                cancelBtn.removeEventListener('click', cancelUpload);
            },
            async () => {
                statusText.textContent = 'Upload Complete! Waiting for server processing...';
                progressBar.classList.add('bg-green-500');
                progressPercent.textContent = '100%';
                if (uploadButton) uploadButton.disabled = false;
                cancelBtn.removeEventListener('click', cancelUpload);

                const docRef = doc(db, `artifacts/sales-app/users/${currentUser!.uid}/uploads`, period);
                await setDoc(docRef, {
                    fileName: file.name,
                    status: 'uploaded',
                    period: period,
                    storagePath: storagePath,
                    uploadedAt: new Date(),
                    format: format,
                });

                listenForProcessingStatus(period);
            }
        );

    } catch (error: any) {
        console.error("Upload initialization failed:", error);
        statusText.textContent = `Error: ${error.message}`;
        progressBar.classList.add('bg-red-500');
        if (uploadButton) uploadButton.disabled = false;
        setTimeout(() => {
            progressContainer.classList.remove('show');
            setTimeout(() => progressContainer.classList.add('hidden'), 5000);
        }, 5000);
    }
}
