// Centralizes event listeners for the main data hub table interactions.

import { doc, getDoc, getDocs, collectionGroup, query, where } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '@/core/firebase';
import { currentUser } from '@/core/state';
import { showLoading, hideLoading } from '@/core/ui';
import { populateCompiledDataTable } from './table';
import { openQuickUploadModal, openViewChoiceModal, showPnlDataModal, showSalesTargetModal, showPnlTargetModal } from './modals';

/**
 * Initializes the main event listener for the data hub table, handling clicks
 * on view, delete, and upload buttons via event delegation.
 */
export function initializeDataHubListeners(): void {
    const appElement = document.getElementById('app');
    if (!appElement) return;

    appElement.addEventListener('click', async (e) => {
        const target = e.target as HTMLElement;
        const viewBtn = target.closest('.view-compiled-btn');
        const deleteBtn = target.closest('.delete-compiled-btn');
        const uploadBtn = target.closest('.upload-compiled-btn');

        // --- Logic for the VIEW button ---
        if (viewBtn) {
            const id = (viewBtn as HTMLElement).dataset.id;
            const type = (viewBtn as HTMLElement).dataset.type;
            if (!id || !type || !currentUser) return;

            try {
                switch (type) {
                    case 'salesData': {
                        const salesDocRef = doc(db, `artifacts/sales-app/users/${currentUser.uid}/uploads`, id);
                        const salesDocSnap = await getDoc(salesDocRef);
                        if (salesDocSnap.exists()) {
                            const upload = salesDocSnap.data();
                            const fileName = upload.branchName ? `${upload.branchName} - ${upload.period}` : (upload.name || 'report');
                            openViewChoiceModal(id, fileName);
                        } else {
                            alert('Could not find the selected sales data.');
                        }
                        break;
                    }
                    case 'pnlData': {
                        showLoading({ message: 'Loading P&L report...' });
                        const pnlDocRef = doc(db, `users/${currentUser.uid}/pnlReports`, id);
                        const pnlDocSnap = await getDoc(pnlDocRef);
                        if (pnlDocSnap.exists()) {
                            showPnlDataModal(pnlDocSnap.data());
                        } else {
                            alert('Could not find the selected P&L data.');
                        }
                        hideLoading();
                        break;
                    }
                    case 'salesTarget': {
                        showLoading({ message: 'Fetching target data...' });
                        const targetDocRef = doc(db, `users/${currentUser.uid}/monthlySalesTargets`, id);
                        const targetDocSnap = await getDoc(targetDocRef);
                        if (targetDocSnap.exists()) {
                            await showSalesTargetModal(targetDocSnap.data());
                        } else {
                            alert('Could not find the selected sales target data.');
                        }
                        hideLoading();
                        break;
                    }
                    case 'pnlTarget': {
                        showLoading({ message: 'Fetching P&L target data...' });
                        const targetDocRef = doc(db, `users/${currentUser.uid}/monthlyPnlTargets`, id);
                        const targetDocSnap = await getDoc(targetDocRef);
                        if (targetDocSnap.exists()) {
                            const targetData = targetDocSnap.data();
                            const reportId = `${targetData.period}_${targetData.branchName.replace(/\s+/g, '_')}`;
                            await showPnlTargetModal(targetData, reportId);
                        } else {
                            alert('Could not find the selected P&L target data.');
                        }
                        hideLoading();
                        break;
                    }
                }
            } catch (error) {
                console.error(`Error viewing compiled data for type ${type}:`, error);
                alert('Could not load the selected item.');
                hideLoading();
            }
        }

        // --- Logic for the DELETE button ---
        if (deleteBtn) {
            const id = (deleteBtn as HTMLElement).dataset.id;
            const type = (deleteBtn as HTMLElement).dataset.type;
            if (!id || !type) return;

            const typeName = type.replace(/([A-Z])/g, ' $1').toLowerCase();
            if (!confirm(`Are you sure you want to permanently delete this ${typeName} record? This action cannot be undone.`)) {
                return;
            }

            (deleteBtn as HTMLButtonElement).disabled = true;
            deleteBtn.innerHTML = `<div class="w-4 h-4 border-2 border-t-transparent border-blue-500 rounded-full animate-spin"></div>`;

            try {
                let result;
                switch (type) {
                    case 'salesData':
                        const deleteUploadFunction = httpsCallable(functions, 'deleteUpload');
                        result = await deleteUploadFunction({ uploadId: id });
                        break;
                    case 'pnlData':
                        const deletePnlReportFunction = httpsCallable(functions, 'deletePnlReport');
                        result = await deletePnlReportFunction({ reportId: id });
                        break;
                    case 'salesTarget':
                        const deleteSalesTargetFunction = httpsCallable(functions, 'deleteSalesTarget');
                        result = await deleteSalesTargetFunction({ period: id });
                        break;
                    case 'pnlTarget':
                        const deletePnlTargetFunction = httpsCallable(functions, 'deletePnlTarget');
                        result = await deletePnlTargetFunction({ period: id });
                        break;
                    default:
                        throw new Error('Unknown data type to delete.');
                }
                console.log('Deletion successful:', result.data);
                await populateCompiledDataTable(); // Refresh the table
            } catch (error) {
                console.error(`Error deleting ${type}:`, error);
                alert(`Failed to delete the ${typeName}. Please try again.`);
                (deleteBtn as HTMLButtonElement).disabled = false;
                deleteBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>`;
            }
        }

        // --- Logic for the UPLOAD button in the table ---
        if (uploadBtn) {
            const period = (uploadBtn as HTMLElement).dataset.period;
            const type = (uploadBtn as HTMLElement).dataset.type;
            if (!period || !type) return;
            openQuickUploadModal(period, type);
        }
    });
}
