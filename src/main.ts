declare const XLSX: any;
declare const SlimSelect: any;

// Firebase Imports
import { initializeApp } from 'firebase/app'
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
} from 'firebase/auth'
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  addDoc,
  collection,
  getDocs,
  updateDoc,
  deleteDoc,
  writeBatch,
  collectionGroup,
  query,
  where,
  getCountFromServer,
  orderBy,
  limit,
  startAfter,
  onSnapshot
} from 'firebase/firestore'

import { setupAnalysis } from './analysis'
import * as $store from './store'
import { prompts } from './prompt'
import { applyAnalysisTextBindings } from './utils/dom'
import {
  chartXTicks,
  chartYTicks,
  shortenDateTickCallback,
} from './utils/chart-ticks'
import {
  shortenNumber,
  shortenCurrency,
  formatCurrency as formatCurrencyUtil,
} from './utils/string'
import { deepmerge } from 'deepmerge-ts'
import { getStorage, ref, uploadBytesResumable, getDownloadURL, type UploadTask } from "firebase/storage";
import { getFunctions, httpsCallable } from "firebase/functions";
import { setupPageSummary } from './components/PageSummary';
import { globalConfigService } from './services/globalConfigService';

// Firebase Config
const firebaseConfig = {
  apiKey: 'AIzaSyB9_J1AZkSbCM9v3PeV4m33qojHX51bLwg',
  authDomain: 'finalytics-62350.firebaseapp.com',
  projectId: 'finalytics-62350',
  storageBucket: 'finalytics-62350.firebasestorage.app',
  messagingSenderId: '586305419053',
  appId: '1:586305419053:web:b94a325fd5b649340305a4',
}

// Initialize Firebase
const app = initializeApp(firebaseConfig)
const auth = getAuth(app)
const db = getFirestore(app)
const functions = getFunctions(app)
const storage = getStorage(app);

// --- Global State ---
let currentUser = null
let currentUserRole = 'user'
let adminCredentials = null

// Note: Analysis-related state (charts, data, UI components, flags) is now managed
// through Zustand store for proper cleanup when navigating between views.




const plAnalysisView = document.getElementById('pl-analysis-view');

const defaultGeminiConfig = Object.freeze({
  apiKey: '',
  prompts: prompts,
})

const geminiConfig = structuredClone(defaultGeminiConfig)

// --- DOM Elements ---
const authView = document.getElementById('auth-view')
const dashboardView = document.getElementById('dashboard-view')
const analysisView = document.getElementById('analysis-view')
const userManagementView = document.getElementById('user-management-view')
const konfigurasiView = document.getElementById('konfigurasi-view')
const authError = document.getElementById('auth-error')
const signupError = document.getElementById('signup-error')
const uploadError = document.getElementById('upload-error')
const uploadHistoryList = document.getElementById('upload-history-list')
const noUploadsMsg = document.getElementById('no-uploads-msg')
const userListError = document.getElementById('user-list-error')
const createUserFeedback = document.getElementById('create-user-feedback')
const DB_NAME = 'FinalyticsCacheDB';
const STORE_NAME = 'compiledDataStore';
const periodError = document.getElementById('period-error');


function drawMonthlyOmzetComparisonChart() {
    const omzetSelect = $store.getUIComponent('omzetComparisonSelect');
    if (!omzetSelect) return;

    const selectedMonths = omzetSelect.getSelected() as string[];

    // The X-axis will be days 1 through 31
    const labels = Array.from({ length: 31 }, (_, i) => i + 1);

    const colors = ['#3B82F6', '#10B981', '#F97316', '#8B5CF6', '#EF4444', '#F59E0B'];

    const datasets = selectedMonths.map((monthStr, index) => {
        // Filter the main data for summaries belonging to the selected month
        const monthSummaries = $store.getAllSalesData().filter((s: any) => s.date.toISOString().startsWith(monthStr));

        // Create an array to hold the revenue for each day (1-31)
        const dailyData = Array(31).fill(null); // Use null for days with no data

        monthSummaries.forEach(summary => {
            const dayOfMonth = summary.date.getDate(); // getDate() returns 1-31
            dailyData[dayOfMonth - 1] = summary.totalOmzet; // Array is 0-indexed
        });

        const dateLabel = new Date(monthStr + '-02').toLocaleString('default', { month: 'long', year: 'numeric' });

        return {
            label: dateLabel,
            data: dailyData,
            borderColor: colors[index % colors.length],
            tension: 0.1,
            fill: false,
            spanGaps: true, // This connects lines over days with no data (nulls)
        };
    });

    createChart('waktu-omzet-harian-chart', 'line', {
        labels,
        datasets
    }, {
        scales: {
            y: { ticks: { callback: shortenCurrency } },
            x: { title: { display: true, text: 'Day of Month' } }
        }
    });
}

/**
 * Sets up the multi-select dropdown for the monthly Omzet comparison chart.
 */
function setupMonthlyOmzetComparisonChart() {
    // Prevent re-initializing the dropdown if it already exists
    const existingSelect = $store.getUIComponent('omzetComparisonSelect');
    if (existingSelect) {
        drawMonthlyOmzetComparisonChart(); // Just redraw the chart with current data
        return;
    }

    const selectEl = document.getElementById('waktu-omzet-harian-select') as HTMLSelectElement;

    // Get all unique months (YYYY-MM) from the data and sort them
    const availableMonths = [...new Set($store.getAllSalesData().map((s: any) => s.date.toISOString().slice(0, 7)))].toSorted().reverse();

    if (availableMonths.length === 0) {
        selectEl.innerHTML = '<option disabled>No data available</option>';
        return;
    }

    // Populate the select element with options
    selectEl.innerHTML = availableMonths.map(month =>
        `<option value="${month}">${new Date(month + '-02').toLocaleString('default', { month: 'long', year: 'numeric' })}</option>`
    ).join('');

    // Initialize Slim Select
    // Store omzetComparisonSelect instance for cleanup on view reset
    // Set a default selection (e.g., the two most recent months)
    $store.setUIComponent(
      'omzetComparisonSelect',
      new SlimSelect({
          select: '#waktu-omzet-harian-select',
          settings: { placeholderText: 'Select months...' },
          events: {
              afterChange: () => {
                  // Redraw the chart whenever the selection changes
                  drawMonthlyOmzetComparisonChart();
              }
          }
      }),
      ($select) => $select.setSelected(availableMonths.slice(0, 2)),
    );

    // Initial drawing of the chart is handled by the afterChange event from setSelected
}


function renderPnlResults(pnlData) {
    $store.setCurrentPnlData(pnlData);
    const container = document.getElementById('pnl-results-container');
    container.innerHTML = '';
    const formatCurrency = (value) => `Rp${Math.round(value).toLocaleString('id-ID')}`;

    // Initialize all total variables we'll need for calculations
    let totalRevenue = 0;
    let totalHPP = 0;
    let totalOpex = 0;
    let totalNonOpex = 0;
    let totalDepresiasi = 0;
    let totalBunga = 0;
    let totalPajak = 0;

    // Helper function to render a category section and update its total
    const renderCategory = (categoryName) => {
        const data = pnlData[categoryName] || {};
        const categoryTotal = Object.values(data).reduce((sum, value) => sum + (value as number), 0);

        // Update the corresponding total variable based on the category name
        if (categoryName === "Pendapatan (Revenue)") totalRevenue = categoryTotal;
        if (categoryName === "Harga Pokok Produksi") totalHPP = categoryTotal;
        if (categoryName === "Beban Operasional (OPEX)") totalOpex = categoryTotal;
        if (categoryName === "Beban Non Operasional") totalNonOpex = categoryTotal;
        if (categoryName === "Depresiasi/ Amortisasi") totalDepresiasi = categoryTotal;
        if (categoryName === "Bunga") totalBunga = categoryTotal;
        if (categoryName === "Pajak (PB1)") totalPajak = categoryTotal;

        const itemsHtml = Object.entries(data).map(([name, value]) => `
            <div class="flex justify-between text-sm text-gray-600 pl-4">
                <span>${name}</span>
                <span class="font-mono">${formatCurrency(value as number)}</span>
            </div>
        `).join('');

        // Don't show a total line if there are no items
        const totalHtml = Object.keys(data).length > 0 ? `
            <div class="flex justify-between font-semibold pt-1 border-t mt-1">
                <span>Total ${categoryName}</span>
                <span class="font-mono">${formatCurrency(categoryTotal)}</span>
            </div>
        ` : '';

        return `
            <div class="mb-4">
                <h4 class="font-bold text-md text-gray-800">${categoryName}</h4>
                <div class="space-y-1 mt-2">${itemsHtml}</div>
                ${totalHtml}
            </div>
        `;
    };

    // Helper function to render a calculated subtotal row with highlighting
    const renderSubtotal = (label, value, colorClass) => {
        return `
            <div class="flex justify-between font-bold text-lg py-2 my-2 ${colorClass} rounded-md px-4">
                <span>${label}</span>
                <span class="font-mono">${formatCurrency(value)}</span>
            </div>
        `;
    };

    // --- Build the HTML string in the correct financial statement order ---
    let finalHtml = '';

    finalHtml += renderCategory("Pendapatan (Revenue)");
    finalHtml += renderCategory("Harga Pokok Produksi");
    const grossProfit = totalRevenue - totalHPP;
    finalHtml += renderSubtotal("Laba Kotor (Gross Profit)", grossProfit, "bg-yellow-100");

    finalHtml += renderCategory("Beban Operasional (OPEX)");
    const netOperatingIncome = grossProfit - totalOpex;
    finalHtml += renderSubtotal("Pendapatan Bersih Operasional (Net Operating Income)", netOperatingIncome, "bg-blue-100");

    finalHtml += renderCategory("Beban Non Operasional");
    const ebitda = netOperatingIncome - totalNonOpex;
    finalHtml += renderSubtotal("Pendapatan Bersih Sebelum Deprisiasi/Amortisasi, Bunga & Pajak (EBITDA)", ebitda, "bg-orange-100");

    finalHtml += renderCategory("Depresiasi/ Amortisasi");
    finalHtml += renderCategory("Bunga");
    finalHtml += renderCategory("Pajak (PB1)");

    const netIncome = ebitda - totalDepresiasi - totalBunga - totalPajak;
    finalHtml += renderSubtotal("Pendapatan Bersih (Net Income)", netIncome, "bg-green-200");

    container.innerHTML = finalHtml;
}

// Function to save data and metadata to IndexedDB
async function saveCompiledData(data: any[], uploadCount: number): Promise<void> {
  return new Promise((resolve, reject) => {
    // Find the most recent date in the entire dataset
    const lastTransactionDate = data.reduce((latest, item) => {
      const itemDate = item['Sales Date In'];
      return itemDate > latest ? itemDate : latest;
    }, new Date(0)); // Start with a very old date

    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      // Now storing the last transaction date along with the data
      store.put({ data, uploadCount, timestamp: new Date(), lastTransactionDate }, 'compiledAnalysis');
      transaction.oncomplete = () => {
        console.log('Compiled data cached successfully with last transaction date.');
        resolve();
      };
      transaction.onerror = () => reject(transaction.error);
    };
    request.onerror = () => reject(request.error);
  });
}

// Function to get the cached data and its metadata from IndexedDB
async function getCachedData(): Promise<{ data: any[], uploadCount: number, timestamp: Date, lastTransactionDate: Date } | null> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME);
        }
    };
    request.onsuccess = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
          resolve(null);
          return;
      }
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const getRequest = store.get('compiledAnalysis');
      getRequest.onsuccess = () => resolve(getRequest.result || null);
      getRequest.onerror = () => reject(getRequest.error);
    };
    request.onerror = () => reject(request.error);
  });
}

// --- App Initialization ---
onAuthStateChanged(auth, async (user) => {
   if (user) {
        currentUser = user;
        document.getElementById('investment-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            await saveInvestmentData();
        });
        if (!adminCredentials) {
            await fetchUserRoleAndSetupUI(user)}

    } else {
    if (adminCredentials) {
      signInWithEmailAndPassword(auth, adminCredentials.email, adminCredentials.password)
        .then(async (userCredential) => {
          await fetchUserRoleAndSetupUI(userCredential.user)
          adminCredentials = null
          showView('usermanagement')
        })
        .catch((err) => {
          console.error('Admin re-login failed:', err)
          adminCredentials = null
          showView('auth')
        })
    } else {
      currentUser = null
      currentUserRole = 'user'
      showView('auth')
      document.getElementById('user-management-btn').classList.add('hidden')
    }
  }
})

/**
 * Fetch user role from Firestore and configure UI based on permissions.
 *
 * @description
 * Retrieves the user's role from their Firestore document and configures the
 * application UI accordingly. Shows/hides admin features based on role, displays
 * the dashboard view, and loads essential data including upload history and AI
 * configuration. Creates a user document if one doesn't exist.
 *
 * @param user - Firebase Auth user object containing uid and email.
 * @returns Promise that resolves when role is fetched and UI is configured.
 *
 * @example
 * // Set up UI after user authentication
 * const user = await signInWithEmailAndPassword(auth, email, password);
 * await fetchUserRoleAndSetupUI(user.user);
 * // UI is configured based on user role, dashboard is shown, data is loaded
 */
async function fetchUserRoleAndSetupUI(user: any): Promise<void> {
  const userDocRef = doc(db, 'users', user.uid)
  const userDocSnap = await getDoc(userDocRef)
  if (userDocSnap.exists()) {
    currentUserRole = userDocSnap.data().role || 'user'
  } else {
    await ensureUserDocument(user.uid, user.email)
    currentUserRole = 'user'
  }
  document.getElementById('user-management-btn')?.classList.toggle('hidden', currentUserRole !== 'admin')
  document.getElementById('konfigurasi-btn')?.classList.toggle('hidden', currentUserRole !== 'admin')
  showView('main-menu')
  await populateCompiledDataTable(); // Load the new compiled table
  if (currentUserRole === 'admin') {
    loadGeminiConfig()
  }
}

async function uploadAndProcessPnlFile(file: File, expectedPeriod: string | null = null): Promise<string> {
    if (!currentUser) throw new Error('Authentication error. Please log in again.');

    const validMainCategories = [
        "Pendapatan (Revenue)", "Harga Pokok Produksi", "Beban Operasional (OPEX)",
        "Beban Non Operasional", "Depresiasi/ Amortisasi", "Bunga", "Pajak (PB1)"
    ];

    const data = await file.arrayBuffer();
    const workbook = XLSX.read(data);
    const worksheet = workbook.Sheets["P&L Data"];

    if (!worksheet) {
        throw new Error("Could not find the 'P&L Data' sheet. Please use the provided template.");
    }

    const businessNameCell = worksheet['B1'];
    const branchName = businessNameCell ? String(businessNameCell.v).trim() : 'Unknown Branch';

    const actualPeriod = getPeriodFromFile(worksheet);
    if (!actualPeriod) {
        throw new Error("Could not determine the period from the file. Please check cell B2.");
    }

    if (expectedPeriod && actualPeriod !== expectedPeriod) {
        throw new Error(`File period mismatch. Expected '${expectedPeriod}', but file contains '${actualPeriod}'.`);
    }

    const parsedData = XLSX.utils.sheet_to_json(worksheet, { range: 3 });
    if (!parsedData || parsedData.length === 0) {
        throw new Error("The 'P&L Data' sheet is empty or contains no data in the specified range.");
    }

    const pnlData = {};
    for (const row of parsedData) {
        const mainCategory = row["Main Category"];
        const subCategory = row["Sub-Category"];
        const amount = row["Amount"];

        if (mainCategory && subCategory && typeof amount === 'number') {
            if (!validMainCategories.includes(mainCategory)) {
                throw new Error(`Invalid Main Category: "${mainCategory}". Please use an exact category from the template.`);
            }
            if (!pnlData[mainCategory]) {
                pnlData[mainCategory] = {};
            }
            pnlData[mainCategory][String(subCategory).trim()] = amount;
        }
    }

    // --- FIX: UPDATED VALIDATION BLOCK ---
    // We now check both OPEX and Non-OPEX for their required sub-categories.
    const requiredOpexSubCategories = ["Wages", "Rent"]; // "Advertising" is removed from here.
    const requiredNonOpexSubCategories = ["Advertising"]; // "Advertising" is added here.

    const opexData = pnlData["Beban Operasional (OPEX)"] || {};
    const nonOpexData = pnlData["Beban Non Operasional"] || {};

    const providedOpexSubCategories = Object.keys(opexData);
    const providedNonOpexSubCategories = Object.keys(nonOpexData);

    const missingOpex = requiredOpexSubCategories.filter(
        subCat => !providedOpexSubCategories.includes(subCat)
    );
    const missingNonOpex = requiredNonOpexSubCategories.filter(
        subCat => !providedNonOpexSubCategories.includes(subCat)
    );

    if (missingOpex.length > 0) {
        throw new Error(
            `The 'Beban Operasional (OPEX)' category is missing required sub-categories: ${missingOpex.join(', ')}. Please update your file.`
        );
    }
    if (missingNonOpex.length > 0) {
        throw new Error(
            `The 'Beban Non Operasional' category is missing required sub-categories: ${missingNonOpex.join(', ')}. Please update your file.`
        );
    }
    // --- END OF FIX ---

    if (Object.keys(pnlData).length === 0) {
        throw new Error("No valid P&L rows could be parsed from the file.");
    }

    const safeBranchName = branchName.replace(/\s+/g, '_');
    const docId = `${actualPeriod}_${safeBranchName}`;
    const pnlDocRef = doc(db, `users/${currentUser.uid}/pnlReports`, docId);
    await setDoc(pnlDocRef, {
        title: `${file.name} (from template)`,
        fileName: file.name,
        period: actualPeriod,
        branchName: branchName,
        lastUpdatedAt: new Date(),
        pnlData: pnlData
    });

    return actualPeriod;
}


async function populateCompiledDataTable() {
    if (!currentUser) return;
    const tbody = document.getElementById('compiled-data-tbody');
    tbody.innerHTML = '<tr><td colspan="6" class="text-center p-4 text-gray-500">Loading data...</td></tr>';

    try {
        const [salesSnap, salesTargetSnap, pnlSnap, pnlTargetSnap] = await Promise.all([
            getDocs(collection(db, `artifacts/sales-app/users/${currentUser.uid}/uploads`)),
            getDocs(collection(db, `users/${currentUser.uid}/monthlySalesTargets`)),
            getDocs(collection(db, `users/${currentUser.uid}/pnlReports`)),
            getDocs(collection(db, `users/${currentUser.uid}/monthlyPnlTargets`))
        ]);

        const aggregatedData = {};

        const processSnap = (snap, type) => {
            snap.forEach(doc => {
                const data = doc.data();
                const period = data.period || doc.id;
                if (!period || !/^\d{4}-\d{2}$/.test(period)) return;

                const branch = data.branchName || 'Company-Wide';
                const key = `${branch}|${period}`;

                if (!aggregatedData[key]) {
                    aggregatedData[key] = { branch: branch, period: period };
                }
                aggregatedData[key][type] = { id: doc.id, name: data.name || data.title || data.fileName };
            });
        };

        processSnap(salesSnap, 'salesData');
        processSnap(salesTargetSnap, 'salesTarget');
        processSnap(pnlSnap, 'pnlData');
        processSnap(pnlTargetSnap, 'pnlTarget');

        tbody.innerHTML = '';

        const sortedKeys = Object.keys(aggregatedData).toSorted((a, b) => {
            const [branchA, periodA] = a.split('|');
            const [branchB, periodB] = b.split('|');
            if (branchA < branchB) return -1;
            if (branchA > branchB) return 1;
            return periodB.localeCompare(periodA);
        });

        // --- FIX START: Filter out "Company-Wide" rows ---
        const filteredKeys = sortedKeys.filter(key => !key.startsWith('Company-Wide|'));

        if (filteredKeys.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center p-4 text-gray-500">No data periods found. Please upload a Sales Data file to begin.</td></tr>';
            return;
        }

        filteredKeys.forEach(key => {
        // --- FIX END ---
            const data = aggregatedData[key];
            const [year, month] = data.period.split('-');
            const formattedPeriod = new Date(parseInt(year), parseInt(month) - 1, 1).toLocaleString('default', { month: 'long', year: 'numeric' });

            const createCell = (type) => {
                if (data[type]) {
                    return `
                        <td class="px-6 py-4 text-center">
                            <div class="flex items-center justify-center space-x-2">
                                <button class="view-compiled-btn bg-blue-500 text-white text-xs font-bold py-1 px-3 rounded-full hover:bg-blue-600" data-id="${data[type].id}" data-type="${type}">View</button>
                                <button class="delete-compiled-btn text-gray-400 hover:text-red-600 p-1 rounded-full" data-id="${data[type].id}" data-type="${type}" title="Delete this item">
                                    <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                </button>
                            </div>
                        </td>`;
                } else {
                    return `
                        <td class="px-6 py-4 text-center">
                            <button class="upload-compiled-btn bg-gray-200 text-gray-700 text-xs font-bold py-1 px-3 rounded-full hover:bg-gray-300" data-period="${data.period}" data-type="${type}" data-branch="${data.branch}">
                                Upload
                            </button>
                        </td>`;
                }
            };

            const row = document.createElement('tr');
            row.innerHTML = `
                <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-800">${data.branch}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600">${formattedPeriod}</td>
                ${createCell('salesData')}
                ${createCell('salesTarget')}
                ${createCell('pnlData')}
                ${createCell('pnlTarget')}
            `;
            tbody.appendChild(row);
        });

    } catch (error) {
        console.error("Error populating compiled data table:", error);
        tbody.innerHTML = '<tr><td colspan="6" class="text-center p-4 text-red-500">Could not load data.</td></tr>';
    }
}


const quickUploadModal = document.getElementById('quick-upload-modal');
const quickUploadTitle = document.getElementById('quick-upload-modal-title');
const quickUploadFileInput = document.getElementById('quick-upload-file-input') as HTMLInputElement;
const quickUploadError = document.getElementById('quick-upload-error');
const quickUploadConfirmBtn = document.getElementById('quick-upload-confirm-btn') as HTMLButtonElement;
const quickUploadProgressContainer = document.getElementById('quick-upload-progress-container');
const quickUploadProcessingStatus = document.getElementById('quick-upload-processing-status');

const typeDisplayNames = {
    salesData: 'Sales Data',
    salesTarget: 'Sales Target',
    pnlData: 'P&L Data',
    pnlTarget: 'P&L Target'
};

function openQuickUploadModal(period: string, type: string) {
    const [year, month] = period.split('-');
    const formattedPeriod = new Date(parseInt(year), parseInt(month) - 1, 1).toLocaleString('default', { month: 'long', year: 'numeric' });

    quickUploadTitle.textContent = `Upload ${typeDisplayNames[type]} for ${formattedPeriod}`;

    // Store data on the modal for the confirm button to access
    quickUploadModal.dataset.period = period;
    quickUploadModal.dataset.type = type;

    // Reset modal state
    quickUploadFileInput.value = '';
    quickUploadError.classList.add('hidden');
    quickUploadConfirmBtn.disabled = false;
    quickUploadConfirmBtn.textContent = 'Upload & Process';
    quickUploadProgressContainer.classList.add('hidden');
    quickUploadProcessingStatus.classList.add('hidden');
    quickUploadProcessingStatus.textContent = '';


    quickUploadModal.classList.remove('hidden');
}

// Close modal listeners
quickUploadModal.querySelector('#quick-upload-modal-close').addEventListener('click', () => quickUploadModal.classList.add('hidden'));
quickUploadModal.querySelector('#quick-upload-cancel-btn').addEventListener('click', () => quickUploadModal.classList.add('hidden'));

// Main upload confirmation listener
quickUploadConfirmBtn.addEventListener('click', async () => {
    const file = quickUploadFileInput.files?.[0];
    const period = quickUploadModal.dataset.period;
    const type = quickUploadModal.dataset.type;

    if (!file) {
        quickUploadError.textContent = 'Please select a file.';
        quickUploadError.classList.remove('hidden');
        return;
    }
    quickUploadError.classList.add('hidden');
    quickUploadConfirmBtn.disabled = true;
    quickUploadConfirmBtn.textContent = 'Processing...';

    try {
        switch (type) {
            case 'salesData':
                await handleModalSalesDataUpload(file, period);
                break;
            case 'salesTarget':
                await handleModalTargetUpload(file, period, 'sales');
                break;
            case 'pnlData':
                await uploadAndProcessPnlFile(file, period); // Use the new unified function
                break;
            case 'pnlTarget':
                await handleModalTargetUpload(file, period, 'pnl');
                break;
        }

        quickUploadProcessingStatus.textContent = 'Success! The table will refresh shortly.';
        quickUploadProcessingStatus.className = 'mt-2 text-sm text-green-600';
        quickUploadProcessingStatus.classList.remove('hidden');

        // Always refresh the main data hub table in the background
        await populateCompiledDataTable();

        // ALSO, if the user is currently viewing the financial analysis page, refresh it.
        const generalKeuanganSection = document.getElementById('general-keuangan-section');
        if (generalKeuanganSection && generalKeuanganSection.classList.contains('active')) {
            await generateGeneralKeuanganSection();
        }setTimeout(() => quickUploadModal.classList.add('hidden'), 2000);

    } catch (error) {
        console.error("Quick upload failed:", error);
        quickUploadError.textContent = `Error: ${error.message}`;
        quickUploadError.classList.remove('hidden');
        quickUploadConfirmBtn.disabled = false;
        quickUploadConfirmBtn.textContent = 'Upload & Process';
    }
});

// Add event listener for the new table
document.getElementById('app').addEventListener('click', async (e) => {
    const target = e.target as HTMLElement;
    const viewBtn = target.closest('.view-compiled-btn');
    const deleteBtn = target.closest('.delete-compiled-btn');
    const uploadBtn = target.closest('.upload-compiled-btn');

    if (viewBtn) {
        const id = (viewBtn as HTMLElement).dataset.id;
        const type = (viewBtn as HTMLElement).dataset.type;

        try {
            switch (type) {
                // --- THIS IS THE MODIFIED PART ---
                case 'salesData': {
                    const salesDocRef = doc(db, `artifacts/sales-app/users/${currentUser.uid}/uploads`, id);
                    const salesDocSnap = await getDoc(salesDocRef);
                    if (salesDocSnap.exists()) {
                        const upload = salesDocSnap.data();
                        // Instead of analyzing, we now open the choice modal
                        const fileName = upload.branchName ? `${upload.branchName} - ${upload.period}` : (upload.name || 'report');
                        openViewChoiceModal(id, fileName);
                    } else {
                        alert('Could not find the selected sales data.');
                    }
                    break;
                }
                // --- END OF MODIFICATION ---
                   case 'pnlData': {
                    showLoading({ message: 'Loading P&L report...' });
                    const pnlDocRef = doc(db, `users/${currentUser.uid}/pnlReports`, id);
                    const pnlDocSnap = await getDoc(pnlDocRef);
                    if (pnlDocSnap.exists()) {
                        const report = pnlDocSnap.data();
                        showPnlDataModal(report);
                    } else {
                        alert('Could not find the selected P&L data.');
                    }
                    hideLoading()
                    break;
                }
                case 'salesTarget': {
                    showLoading({ message: 'Fetching target data...' });
                    const targetDocRef = doc(db, `users/${currentUser.uid}/monthlySalesTargets`, id);
                    const targetDocSnap = await getDoc(targetDocRef);
                    if (targetDocSnap.exists()) {
                        const targetData = targetDocSnap.data();
                        showSalesTargetModal(targetData);
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
        } finally {
            if (type !== 'salesTarget' && type !== 'pnlTarget' && type !== 'pnlData' && type !== 'salesData') {
                hideLoading();
            }
        }
    }


    // --- Logic for the DELETE button ---
    if (deleteBtn) {
        const id = (deleteBtn as HTMLElement).dataset.id;
        const type = (deleteBtn as HTMLElement).dataset.type;
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
            // Re-enable the button on failure
            (deleteBtn as HTMLButtonElement).disabled = false;
            deleteBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>`;
        }
    }

    if (uploadBtn) {
        const period = (uploadBtn as HTMLElement).dataset.period;
        const type = (uploadBtn as HTMLElement).dataset.type;
        openQuickUploadModal(period, type);
    }
});

/**
 * Displays a modal with a table comparing sales targets to actual performance for a specific period.
 * @param {object} data - The sales target data object from Firestore.
 */
async function showSalesTargetModal(data: any) {
    const modal = document.getElementById('sales-target-modal');
    const titleEl = document.getElementById('sales-target-modal-title');
    const bodyEl = document.getElementById('sales-target-modal-body');

    bodyEl.innerHTML = '<p id="sales-target-loading-msg" class="text-center text-gray-500">Loading actual sales data...</p>';
    modal.classList.remove('hidden');

    const period = data.period;
    if (!period) {
        bodyEl.innerHTML = '<p class="text-center text-red-500">Error: Period not found in target data.</p>';
        return;
    }

    const [year, month] = period.split('-');
    const formattedPeriod = new Date(parseInt(year), parseInt(month) - 1, 1).toLocaleString('default', { month: 'long', year: 'numeric' });
    titleEl.textContent = `Sales Target vs Actual for ${formattedPeriod}`;

    try {
        const summariesQuery = query(
            collectionGroup(db, 'dailySummaries'),
            where('userId', '==', currentUser.uid)
        );
        const querySnapshot = await getDocs(summariesQuery);

        const periodSummaries = [];
        querySnapshot.forEach(doc => {
            const summary = doc.data();
            if (summary.date && summary.date.startsWith(period)) {
                periodSummaries.push(summary);
            }
        });

        const actuals = periodSummaries.reduce((acc, summary) => {
            acc.totalOmzet += summary.totalOmzet || 0;
            acc.totalTransactions += summary.totalTransactions || 0;
            acc.totalItemsSold += summary.totalItemsSold || 0;
            return acc;
        }, {
            totalOmzet: 0,
            totalTransactions: 0,
            totalItemsSold: 0
        });

        const actualAvgPerTransaction = actuals.totalTransactions > 0
            ? actuals.totalOmzet / actuals.totalTransactions
            : 0;

        const actualValues = {
            'Total Omzet': actuals.totalOmzet,
            'Total Transaction': actuals.totalTransactions,
            'Total Items Sold': actuals.totalItemsSold,
            'Avg. Per Transaction': actualAvgPerTransaction
        };

        const targets = data.targets || {};
        const formatCurrency = (value) => `Rp${Math.round(value).toLocaleString('id-ID')}`;
        const formatNumber = (value) => Math.round(value).toLocaleString('id-ID');

        // --- FIX START: Define which metrics to show and which are currency ---
        const metricsToShow = [
            'Total Omzet',
            'Total Items Sold',
            'Total Transaction',
            'Avg. Per Transaction'
        ];

        // Define which metrics should have the "Rp" prefix
        const currencyMetrics = ['Total Omzet', 'Avg. Per Transaction'];
        // --- FIX END ---

        let tableHtml = `
            <div class="overflow-x-auto">
                <table class="min-w-full divide-y divide-gray-200">
                    <thead class="bg-gray-50">
                        <tr>
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Metric</th>
                            <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Target</th>
                            <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actual</th>
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Achievement</th>
                        </tr>
                    </thead>
                    <tbody class="bg-white divide-y divide-gray-200">
        `;

        // --- FIX START: Loop through the specified metrics only ---
        metricsToShow.forEach(metric => {
            if (!targets[metric]) return; // Skip if a target for this metric doesn't exist

            const targetValue = targets[metric];
            const actualValue = actualValues[metric] || 0;
            const achievement = targetValue > 0 ? (actualValue / targetValue) * 100 : 0;

            // Use our new array to check if the metric is a currency value
            const isCurrency = currencyMetrics.includes(metric);

            tableHtml += `
                <tr>
                    <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">${metric}</td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-right font-mono">
                        ${isCurrency ? formatCurrency(targetValue) : formatNumber(targetValue)}
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-right font-mono">
                        ${isCurrency ? formatCurrency(actualValue) : formatNumber(actualValue)}
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        <div class="flex items-center">
                            <div class="w-full bg-gray-200 rounded-full h-2.5 mr-2">
                                <div class="bg-blue-600 h-2.5 rounded-full" style="width: ${Math.min(achievement, 100)}%"></div>
                            </div>
                            <span class="font-semibold">${achievement.toFixed(1)}%</span>
                        </div>
                    </td>
                </tr>
            `;
        });
        // --- FIX END ---

        tableHtml += `
                    </tbody>
                </table>
            </div>
        `;
        bodyEl.innerHTML = tableHtml;

    } catch (error) {
        console.error("Error fetching or processing actuals for sales target:", error);
        bodyEl.innerHTML = `<p class="text-center text-red-500">Error: Could not load actual sales data. ${error.message}</p>`;
    }
}

/**
 * Handles the upload of the main Sales Data file from the modal.
 */
async function handleModalSalesDataUpload(file: File, expectedPeriod: string) {
    // Immediately close the modal to use the main progress UI
    document.getElementById('quick-upload-modal').classList.add('hidden');

    // --- All main progress bar UI elements ---
    const progressContainer = document.getElementById('upload-progress-container');
    const progressBar = document.getElementById('upload-progress-bar');
    const progressPercent = document.getElementById('upload-progress-percent');
    const statusText = document.getElementById('upload-status-text');
    const filenameText = document.getElementById('upload-filename');
    const cancelBtn = document.getElementById('cancel-upload-btn');
    const uploadButton = document.getElementById('upload-btn') as HTMLButtonElement; // To re-enable on failure

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
        // 1. Read the file client-side to validate the period
        const data = await file.arrayBuffer();
        const workbook = XLSX.read(data);
        const worksheet = workbook.Sheets[workbook.SheetNames[0]]; // Use the first sheet
        const actualPeriod = getPeriodFromSalesData(worksheet);

        // 2. CRITICAL: Validate the file's period against the expected period from the table row
        if (actualPeriod !== expectedPeriod) {
            throw new Error(`File period mismatch. Expected '${expectedPeriod}', but file contains '${actualPeriod}'.`);
        }

        statusText.textContent = `Period ${actualPeriod} found. Uploading...`;

        // 3. If validation passes, proceed with the full upload process
        const storagePath = `users/${currentUser.uid}/${actualPeriod}/${file.name}`;
        const storageRef = ref(storage, storagePath);
        const metadata = { customMetadata: { userId: currentUser.uid, period: actualPeriod } };
        const uploadTask = uploadBytesResumable(storageRef, file, metadata);

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
                // This block is executed on upload failure
                console.error("Modal Sales Data upload failed:", error);
                statusText.textContent = 'Upload Failed!';
                progressBar.classList.add('bg-red-500');
                uploadButton.disabled = false; // Re-enable main upload button
                setTimeout(() => {
                    progressContainer.classList.remove('show');
                    setTimeout(() => progressContainer.classList.add('hidden'), 300);
                }, 5000);
                cancelBtn.removeEventListener('click', cancelUpload);
            },
            async () => {
                // This block is executed on upload success
                statusText.textContent = 'Upload Complete! Waiting for server...';
                progressBar.classList.add('bg-green-500');
                progressPercent.textContent = '100%';
                cancelBtn.removeEventListener('click', cancelUpload);

                // Trigger backend processing by creating the signal document
                const docRef = doc(db, `artifacts/sales-app/users/${currentUser.uid}/uploads`, actualPeriod);
                await setDoc(docRef, {
                    fileName: file.name,
                    status: 'uploaded',
                    period: actualPeriod,
                    storagePath: storagePath,
                    uploadedAt: new Date(),
                });

                // Listen for the backend processing status using the main UI
                listenForProcessingStatus(actualPeriod);
            }
        );

    } catch (error) {
        console.error("Upload initialization failed:", error);
        // Use the main progress UI to show the error
        statusText.textContent = `Error: ${error.message}`;
        progressBar.classList.add('bg-red-500');
        uploadButton.disabled = false;
        setTimeout(() => {
            progressContainer.classList.remove('show');
            setTimeout(() => progressContainer.classList.add('hidden'), 5000);
        }, 5000);
    }
}

/**
 * Handles the upload of Target files (Sales or P&L) from the modal.
 */
async function handleModalTargetUpload(file: File, expectedPeriod: string, type: 'sales' | 'pnl') {
    const data = await file.arrayBuffer();
    const workbook = XLSX.read(data);

    // Determine the correct sheet name based on the upload type
    const sheetName = type === 'sales' ? "Sales Target Data" : "P&L Target Data";
    const worksheet = workbook.Sheets[sheetName];
    if (!worksheet) {
        throw new Error(`Sheet '${sheetName}' not found. Please use the correct template.`);
    }

    // --- FIX START: Read branch name and create correct composite ID ---
    const branchName = worksheet['B1'] ? String(worksheet['B1'].v).trim() : 'Unknown Branch';
    const actualPeriod = getPeriodFromFile(worksheet);

    if (actualPeriod !== expectedPeriod) {
        throw new Error(`File period mismatch. Expected '${expectedPeriod}', but file contains '${actualPeriod}'.`);
    }

    const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: ["Metric", "Target"], range: 3 });

    if (!jsonData || jsonData.length === 0) {
        throw new Error("The Excel file is empty or does not contain valid data.");
    }

    const targets = jsonData.reduce((acc, row) => {
        if (row.Metric && row.Target !== undefined && typeof row.Target === 'number') {
            acc[String(row.Metric).trim()] = row.Target;
        }
        return acc;
    }, {});

    if (Object.keys(targets).length === 0) {
        throw new Error("Could not find 'Metric' and 'Target' columns with valid data.");
    }

    const collectionPath = type === 'sales' ? 'monthlySalesTargets' : 'monthlyPnlTargets';
    const safeBranchName = branchName.replace(/\s+/g, '_');
    const docId = `${actualPeriod}_${safeBranchName}`; // Create composite ID
    const targetDocRef = doc(db, `users/${currentUser.uid}/${collectionPath}`, docId);

    // Save with the correct branchName field
    await setDoc(targetDocRef, {
        fileName: file.name,
        lastUpdatedAt: new Date(),
        targets: targets,
        period: actualPeriod,
        branchName: branchName
    }, { merge: true });
    // --- FIX END ---
}

/**
 * Ensure a user document exists in Firestore with basic profile information.
 *
 * @description
 * Checks if a user document exists in the 'users' collection and creates one
 * if missing. This ensures every authenticated user has a persistent record
 * with their UID, email, creation timestamp, and role for access control.
 *
 * @param uid - The user's unique identifier from Firebase Authentication.
 * @param email - The user's email address.
 * @param [role='user'] - The user's role for access control (defaults to 'user').
 * @returns Promise that resolves when user document existence is confirmed.
 *
 * @example
 * // Ensure user document exists after authentication
 * await ensureUserDocument('abc123', 'user@example.com', 'admin');
 * // Creates document in Firestore: { uid: 'abc123', email: 'user@example.com', role: 'admin', createdAt: Date }
 *
 * // Use default role
 * await ensureUserDocument('def456', 'regular@example.com');
 * // Creates document with role: 'user'
 */
async function ensureUserDocument(uid: string, email: string, role = 'user'): Promise<void> {
  const userRef = doc(db, 'users', uid)
  const userSnap = await getDoc(userRef)
  if (!userSnap.exists()) {
    try {
      await setDoc(userRef, { uid, email, createdAt: new Date(), role })
    } catch (error) {
      console.error('Error creating user document:', error)
    }
  }
}

// --- View Management ---
/**
 * Track current view for navigation reset logic
 */
let currentView: string | null = null;

/**
 * Display a specific application view while hiding all others.
 *
 * @description
 * Manages single-page application view routing by hiding all views and showing
 * the requested one. Implements role-based access control for admin views and
 * automatically loads required data for certain views (user management, configuration).
 * Provides fallback to dashboard for unauthorized access attempts.
 *
 * Now includes analysis state reset when leaving analysis view to ensure clean state.
 *
 * @param viewName - Name of the view to display ('auth', 'dashboard', 'analysis', 'usermanagement', 'konfigurasi').
 * @returns This function does not return a value; it updates the UI view state.
 *
 * @example
 * // Switch to analysis view
 * showView('analysis');
 * // Hides all other views and shows the analysis view
 *
 * // Attempt admin view (requires admin role)
 * showView('usermanagement');
 * // Shows user management if admin, otherwise shows "Access Denied" alert and returns to dashboard
 */
function showView(viewName: string): void {
  // Reset analysis state when leaving analysis view
  if (currentView === 'analysis' && viewName !== 'analysis') {
    console.debug(`Leaving analysis view (${currentView} → ${viewName}), resetting analysis state`);
    $store.resetAnalysisState();
  }

  // Update current view tracker
  currentView = viewName;

  // Add all the new view variables here
  const mainMenuview = document.getElementById('main-menu-view');
  const salesDashboardView = document.getElementById('sales-dashboard-view');
  // The pnlDashboardView is now removed
  const pnlHistoryView = document.getElementById('pnl-history-view');
  const pnlComparisonView = document.getElementById('pnl-comparison-view');

  // The pnlDashboardView is removed from this array
  [authView, mainMenuview, salesDashboardView, analysisView, userManagementView, konfigurasiView, plAnalysisView, pnlHistoryView, pnlComparisonView].forEach((v) => v?.classList.add('hidden'));

  if (viewName === 'auth') authView.classList.remove('hidden');
  else if (viewName === 'main-menu') mainMenuview.classList.remove('hidden');
  else if (viewName === 'sales-dashboard') salesDashboardView.classList.remove('hidden');
  // The condition for 'pnl-dashboard' is now removed
  else if (viewName === 'pl-analysis') plAnalysisView.classList.remove('hidden');
  else if (viewName === 'analysis') analysisView.classList.remove('hidden');
  else if (viewName === 'pnl-history') pnlHistoryView.classList.remove('hidden');
  else if (viewName === 'pnl-comparison') pnlComparisonView.classList.remove('hidden');
  else if (viewName === 'usermanagement') {
    if (currentUserRole === 'admin') {
      userManagementView.classList.remove('hidden');
      loadUsersForAdmin();
    } else {
      alert('Access Denied');
      showView('main-menu'); // Go back to main menu on error
    }
  } else if (viewName === 'konfigurasi') {
    konfigurasiView.classList.remove('hidden');
    setupConfigurationTab();
  }
}

// --- Authentication ---
document.getElementById('show-signup-link').addEventListener('click', (e) => { e.preventDefault(); document.getElementById('login-form').classList.add('hidden'); document.getElementById('signup-form').classList.remove('hidden') })
document.getElementById('show-login-link').addEventListener('click', (e) => { e.preventDefault(); document.getElementById('signup-form').classList.add('hidden'); document.getElementById('login-form').classList.remove('hidden') })
document.getElementById('login-form').addEventListener('submit', (e) => { e.preventDefault(); signInWithEmailAndPassword(auth, document.getElementById('login-email').value, document.getElementById('login-password').value).catch((error) => { authError.textContent = error.message; authError.classList.remove('hidden') }) })
document.getElementById('signup-form').addEventListener('submit', (e) => { e.preventDefault(); createUserWithEmailAndPassword(auth, document.getElementById('signup-email').value, document.getElementById('signup-password').value).catch((error) => { signupError.textContent = error.message; signupError.classList.remove('hidden') }) })
document.getElementById('logout-btn').addEventListener('click', () => signOut(auth))

// --- User Management (Admin) ---
document.getElementById('user-management-btn').addEventListener('click', () => showView('usermanagement'))
document.getElementById('back-to-dashboard-from-admin-btn').addEventListener('click', () => showView('dashboard'))

document.getElementById('goto-upload-data-btn').addEventListener('click', () => showView('sales-dashboard'));
document.getElementById('goto-view-data-btn').addEventListener('click', viewCompiledAnalysis);
// This new button is on our combined Data Management Hub page
document.getElementById('back-to-main-menu-from-data-hub-btn').addEventListener('click', () => showView('main-menu'));

async function handleSalesTargetUpload() {
    if (!currentUser) return;
    const fileInput = document.getElementById('sales-target-file-input') as HTMLInputElement;
    const file = fileInput.files?.[0];
    if (!file) {
        alert('Please select a sales target file.');
        return;
    }

    showLoading({ message: 'Processing sales target...' });
    try {
        const data = await file.arrayBuffer();
        const workbook = XLSX.read(data);
        const worksheet = workbook.Sheets["Sales Target Data"];
        if (!worksheet) throw new Error("Sheet 'Sales Target Data' not found. Please use the template.");

        // Reads the branch name from cell B1
        const branchName = worksheet['B1'] ? String(worksheet['B1'].v).trim() : 'Unknown Branch';
        const period = getPeriodFromFile(worksheet);
        if (!period) throw new Error("Could not determine the period from the file.");

        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: ["Metric", "Target"], range: 3 });

        const targets = {};
        jsonData.forEach(row => {
            const metric = row.Metric ? String(row.Metric).trim() : null;
            const targetValue = row.Target;
            if (metric && typeof targetValue === 'number') {
                targets[metric] = targetValue;
            }
        });

        if (Object.keys(targets).length === 0) {
            throw new Error("No valid targets found in the file. Please ensure the 'Target' column contains numbers.");
        }

        // Creates the correct composite ID (e.g., "2025-08_Bakso_Tujuh_Pemuda")
        const safeBranchName = branchName.replace(/\s+/g, '_');
        const docId = `${period}_${safeBranchName}`;
        const targetDocRef = doc(db, `users/${currentUser.uid}/monthlySalesTargets`, docId);

        // Saves the branchName field to the database
        await setDoc(targetDocRef, {
            period,
            targets,
            branchName: branchName,
            fileName: file.name,
            lastUpdatedAt: new Date()
        });

        hideLoading();
        alert('Sales target file uploaded successfully!');
        await populateCompiledDataTable();
    } catch (error) {
        console.error('Error uploading sales target:', error);
        hideLoading();
        alert(`Error: ${error.message}`);
    }
}


// --- Sales Target Modal Listeners ---
document.getElementById('sales-target-modal-close').addEventListener('click', () => {
    document.getElementById('sales-target-modal').classList.add('hidden');
});
document.getElementById('sales-target-modal-ok-btn').addEventListener('click', () => {
    document.getElementById('sales-target-modal').classList.add('hidden');
});



document.getElementById('download-sales-target-template-btn').addEventListener('click', downloadSalesTargetTemplate);
document.getElementById('download-pnl-target-template-btn').addEventListener('click', downloadPnlTargetTemplate);
document.getElementById('upload-sales-target-btn').addEventListener('click', handleSalesTargetUpload);

/**
 * Generates and triggers a download for the Sales Target Excel template.
 */
function downloadSalesTargetTemplate() {
    const instructions = [
        { Step: 1, Instruction: "In the 'Sales Target Data' sheet, replace '[Enter Business Name Here]' with your business/branch name in cell B1." },
        { Step: 2, Instruction: "In cell B2, enter a date from the desired month and year. Excel will format it (e.g., to '01/12/2024' for December 2024)." },
        { Step: 3, Instruction: "Fill in the target values in the 'Target' column. These should be numbers without commas or currency symbols." },
    ];

    const sheetData = [
        { A: "Business Name:", B: "[Enter Business Name Here]" },
        { A: "Period:", B: "01/12/2024" }, // Updated Example Format
        {},
        { A: "Metric", B: "Target" },
        { A: "Total Omzet", B: 300000000 },
        { A: "Total Transaction", B: 6000 },
        { A: "Avg. Per Transaction", B: 50000 },
        { A: "Total Items Sold", B: 10000 },
        { A: "Omzet Harian", B: 10000000 },
        { A: "Omzet Mingguan", B: 70000000 },
        { A: "Total Transaksi Per Hari", B: 200 },
        { A: "Average Check", B: 50000 },
    ];

    const wsInstructions = XLSX.utils.json_to_sheet(instructions, { skipHeader: true });
    const wsData = XLSX.utils.json_to_sheet(sheetData, { skipHeader: true });
    wsInstructions['!cols'] = [{ wch: 10 }, { wch: 100 }];
    wsData['!cols'] = [{ wch: 30 }, { wch: 20 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, wsInstructions, "Instructions");
    XLSX.utils.book_append_sheet(wb, wsData, "Sales Target Data");
    XLSX.writeFile(wb, "Finalytics_Sales_Target_Template.xlsx");
}


async function downloadPnlTargetTemplate() {
    showLoading({ message: 'Fetching template...' });

    // The path to your master template in Firebase Storage
    const templatePath = 'templates/Finalytics_P&L_Target_Template.xlsx';
    const templateRef = ref(storage, templatePath);

    try {
        // Get the download URL for the file
        const url = await getDownloadURL(templateRef);

        // Create a temporary link to trigger the browser download
        const link = document.createElement('a');
        link.href = url;

        // This attribute suggests a filename to the browser
        link.setAttribute('download', 'Finalytics_P&L_Target_Template.xlsx');

        // Append the link to the body, click it, and then remove it
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        hideLoading();
    } catch (error) {
        hideLoading();
        console.error("Error fetching P&L template from Storage:", error);
        alert("Could not download the template. Please ensure it has been uploaded by an administrator.");
    }
}




/**
 * Load and display user list for admin user management interface.
 *
 * @description
 * Retrieves all user data from Firestore and populates the admin user management
 * table with user information including email, role, UID, and action buttons.
 * Includes role-based access control (admin only), loading states, error handling,
 * and dynamic HTML generation for user rows with edit/delete functionality.
 * Guards against unauthorized access by non-admin users.
 *
 * @returns Promise that resolves when user list is loaded and displayed.
 *
 * @example
 * // Load users for admin management (admin role required)
 * try {
 *   await loadUsersForAdmin();
 *   // User table populated with all registered users
 * } catch (error) {
 *   console.error("Failed to load users:", error);
 * }
 */
async function loadUsersForAdmin(): Promise<void> {
  if (currentUserRole !== 'admin') return
  const userListTbody = document.getElementById('user-list-tbody')
  userListTbody.innerHTML = '<tr><td colspan="4" class="text-center p-4">Loading...</td></tr>'
  userListError.classList.add('hidden')
  try {
    const querySnapshot = await getDocs(collection(db, 'users'))
    userListTbody.innerHTML = ''
    if (querySnapshot.empty) {
      userListTbody.innerHTML = '<tr><td colspan="4" class="text-center p-4">No users found.</td></tr>'
      return
    }
    querySnapshot.forEach((docSnap) => {
      const user = docSnap.data()
      const tr = document.createElement('tr')
      tr.innerHTML = `
                        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${user.email}</td>
                        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500"><span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${user.role === 'admin' ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}">${user.role}</span></td>
                        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 font-mono">${user.uid}</td>
                        <td class="px-6 py-4 whitespace-nowrap text-sm font-medium">
                            <button class="edit-user-btn text-indigo-600 hover:text-indigo-900" data-id="${user.uid}" data-email="${user.email}" data-role="${user.role}">Edit</button>
                            <button class="delete-user-btn text-red-600 hover:text-red-900 ml-4" data-id="${user.uid}">Delete</button>
                        </td>
                    `
      userListTbody.appendChild(tr)
    })
  } catch (error) {
    console.error('Error loading users:', error)
    userListError.textContent = `Error loading users: ${error.message}. Please ensure your Firestore security rules are configured correctly.`
    userListTbody.innerHTML = ''
  }
}

document.getElementById('create-user-form').addEventListener('submit', async (e) => {
  e.preventDefault()
  const email = document.getElementById('new-user-email').value
  const password = document.getElementById('new-user-password').value
  const role = document.getElementById('new-user-role').value

  if (auth.currentUser) {
    const adminEmail = auth.currentUser.email
    const adminPassword = prompt('To create a new user, please re-enter your admin password for confirmation:')
    if (!adminPassword) {
      createUserFeedback.textContent = 'Admin password not provided. User creation cancelled.'
      createUserFeedback.className = 'text-red-500 text-sm mb-4 text-center'
      createUserFeedback.classList.remove('hidden')
      return
    }
    adminCredentials = { email: adminEmail, password: adminPassword }
  } else {
    alert('Admin not signed in. Cannot create user.')
    return
  }

  createUserFeedback.textContent = 'Creating user...'
  createUserFeedback.className = 'text-blue-500 text-sm mb-4 text-center'
  createUserFeedback.classList.remove('hidden')

  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password)
    const newUser = userCredential.user

    await ensureUserDocument(newUser.uid, newUser.email, role)

    createUserFeedback.textContent = 'User created successfully! You will be signed out and then signed back in as admin momentarily.'
    createUserFeedback.className = 'text-green-500 text-sm mb-4 text-center'
  } catch (error) {
    console.error('Error creating user:', error)
    createUserFeedback.textContent = `Error: ${error.message}`
    createUserFeedback.className = 'text-red-500 text-sm mb-4 text-center'
    adminCredentials = null
  }
})

document.getElementById('user-list-tbody').addEventListener('click', (e) => {
  if (e.target.classList.contains('edit-user-btn')) {
    const modal = document.getElementById('edit-user-modal')
    modal.querySelector('#edit-user-id').value = e.target.dataset.id
    modal.querySelector('#edit-user-email').value = e.target.dataset.email
    modal.querySelector('#edit-user-role').value = e.target.dataset.role
    modal.classList.remove('hidden')
  }
  if (e.target.classList.contains('delete-user-btn')) {
    const userId = e.target.dataset.id
    if (confirm(`Are you sure you want to delete this user's Firestore data? This will NOT delete their login account.`)) {
      deleteUserRecord(userId)
    }
  }
})

document.getElementById('edit-user-form').addEventListener('submit', async (e) => {
  e.preventDefault()
  const userId = document.getElementById('edit-user-id').value
  const newEmail = document.getElementById('edit-user-email').value
  const newRole = document.getElementById('edit-user-role').value

  const userRef = doc(db, 'users', userId)
  try {
    await updateDoc(userRef, { email: newEmail, role: newRole })
    alert('User updated successfully!')
    document.getElementById('edit-user-modal').classList.add('hidden')
    loadUsersForAdmin()
  } catch (error) {
    console.error('Error updating user:', error)
    alert(`Error updating user: ${error.message}`)
  }
})

document.getElementById('cancel-edit-btn').addEventListener('click', () => { document.getElementById('edit-user-modal').classList.add('hidden') })

/**
 * Delete a user document from Firestore with safety checks and UI updates.
 *
 * @description
 * Removes a user document from the 'users' collection in Firestore with built-in
 * safety measures to prevent self-deletion. Shows user feedback via alerts and
 * automatically refreshes the admin user list after successful deletion.
 *
 * @param userId - The unique identifier of the user to delete from Firestore.
 * @returns Promise that resolves when deletion is complete and UI is updated.
 *
 * @example
 * // Delete a user record (admin function)
 * await deleteUserRecord('user123');
 * // Shows success alert and reloads the user list
 *
 * // Attempt to delete own record (will be blocked)
 * await deleteUserRecord(currentUser.uid);
 * // Shows safety alert: "For safety, you cannot delete your own user record..."
 */
async function deleteUserRecord(userId: string): Promise<void> {
  if (userId === currentUser.uid) {
    alert('For safety, you cannot delete your own user record from this interface.')
    return
  }
  try {
    await deleteDoc(doc(db, 'users', userId))
    alert('User Firestore record deleted.')
    loadUsersForAdmin()
  } catch (error) {
    console.error('Error deleting user record:', error)
    alert(`Error deleting user record: ${error.message}`)
  }
}

function listenForProcessingStatus(period: string) {
    if (!currentUser) return;

    const progressContainer = document.getElementById('upload-progress-container');
    const uploadView = document.getElementById('upload-view');
    const processingView = document.getElementById('processing-view');
    const processingFilename = document.getElementById('processing-filename');
    const processingStatusText = document.getElementById('processing-status-text');

    // Get the new UI elements for the processing progress bar
    const processingProgressBar = document.getElementById('processing-progress-bar');
    const processingProgressPercent = document.getElementById('processing-progress-percent');

    // Transition UI to "Processing" state
    uploadView.classList.add('hidden');
    processingView.classList.remove('hidden');
    processingFilename.textContent = `Processing for ${period}`;
    processingStatusText.textContent = 'Initializing on server...';
    processingProgressBar.style.width = '0%';
    processingProgressPercent.textContent = '0%';

    const docRef = doc(db, `artifacts/sales-app/users/${currentUser.uid}/uploads`, period);

    const unsubscribe = onSnapshot(docRef, (docSnap) => {
        if (!docSnap.exists()) return;

        const status = docSnap.data()?.processingStatus;

        if (status) {
            // --- NEW: Handle intermediate 'processing' state ---
            if (status.state === 'processing' && status.totalRows > 0) {
                const percent = Math.round((status.rowsProcessed / status.totalRows) * 100);
                processingProgressBar.style.width = `${percent}%`;
                processingProgressPercent.textContent = `${percent}%`;
                processingStatusText.textContent = `Processing row ${status.rowsProcessed.toLocaleString()} of ${status.totalRows.toLocaleString()}`;
            }
            // --- Handle final 'complete' state ---
            else if (status.state === 'complete') {
                processingProgressBar.style.width = '100%';
                processingProgressPercent.textContent = '100%';
                processingStatusText.innerHTML = '<span class="text-green-600 font-semibold">Processing Complete!</span>';

                // Refresh data in the UI
                populateCompiledDataTable();

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
            // --- Handle final 'error' state ---
            else if (status.state === 'error') {
                processingProgressBar.classList.replace('bg-green-500', 'bg-red-500');
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

function getPeriodFromSalesData(worksheet) {
    const periodCell = worksheet['B5'];
    if (!periodCell || !periodCell.v) {
        throw new Error("Period data range not found in cell B5. Please ensure it is filled out correctly.");
    }

    const dateRangeString = periodCell.v.toString();
    const startDateString = dateRangeString.split(' - ')[0];
    if (!startDateString) {
        throw new Error(`Invalid date range format in cell B5: "${dateRangeString}".`);
    }

    const parts = startDateString.split('-');
    if (parts.length !== 3) {
        throw new Error(`Invalid date format for the start date: "${startDateString}". Expected "DD-MM-YYYY".`);
    }

    const month = parts[1];
    const year = parts[2];

    if (!/^\d{4}$/.test(year) || !/^\d{2}$/.test(month)) {
         throw new Error(`Could not correctly parse the year and month from "${startDateString}".`);
    }

    return `${year}-${month}`;
}


// Replace your old event listener with this entire block
document.getElementById('upload-btn').addEventListener('click', async () => {
    const fileInput = document.getElementById('file-input') as HTMLInputElement;
    const uploadError = document.getElementById('upload-error');
    const file = fileInput.files?.[0];

    if (!file) {
        uploadError.textContent = 'Please select a file to upload.';
        uploadError.classList.remove('hidden');
        return;
    }
    uploadError.classList.add('hidden');

    const uploadButton = document.getElementById('upload-btn') as HTMLButtonElement;
    uploadButton.disabled = true;

    // --- All your progress bar UI elements ---
    const progressContainer = document.getElementById('upload-progress-container');
    const progressBar = document.getElementById('upload-progress-bar');
    const progressPercent = document.getElementById('upload-progress-percent');
    const statusText = document.getElementById('upload-status-text');
    const filenameText = document.getElementById('upload-filename');
    const cancelBtn = document.getElementById('cancel-upload-btn');

    filenameText.textContent = file.name;
    statusText.textContent = 'Analyzing file...';
    progressBar.style.width = '0%';
    progressBar.classList.remove('bg-green-500', 'bg-red-500');
    progressBar.classList.add('bg-blue-600');
    progressPercent.textContent = '0%';
    progressContainer.classList.remove('hidden');
    setTimeout(() => progressContainer.classList.add('show'), 10);

    try {
        // --- START: NEW LOGIC to get period from the file ---
        const fileData = await file.arrayBuffer();
        const workbook = XLSX.read(fileData);
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const period = getPeriodFromSalesData(worksheet);
        // --- END: NEW LOGIC ---

        statusText.textContent = `Period ${period} found. Uploading...`;

        // UPDATED: The storage path is now more organized
        const storagePath = `users/${currentUser.uid}/${period}/${file.name}`;
        const storageRef = ref(storage, storagePath);
        const metadata = {
            customMetadata: {
                userId: currentUser.uid,
                period: period
            }
        };
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
                uploadButton.disabled = false;
                setTimeout(() => {
                    progressContainer.classList.remove('show');
                    setTimeout(() => progressContainer.classList.add('hidden'), 300);
                }, 5000);
                cancelBtn.removeEventListener('click', cancelUpload);
            },
            async () => {
                statusText.textContent = 'Upload Complete! Waiting for server...';
                progressBar.classList.add('bg-green-500');
                progressPercent.textContent = '100%';
                uploadButton.disabled = false;
                cancelBtn.removeEventListener('click', cancelUpload);

                // --- CORRECTED: Trigger processing using the period, not the file name ---
                const docRef = doc(db, `artifacts/sales-app/users/${currentUser.uid}/uploads`, period);
                await setDoc(docRef, {
                    fileName: file.name,
                    status: 'uploaded',
                    period: period,
                    storagePath: storagePath,
                    uploadedAt: new Date(),
                });

                listenForProcessingStatus(period);
            }
        );

    } catch (error) {
        console.error("Upload initialization failed:", error);
        statusText.textContent = `Error: ${error.message}`;
        progressBar.classList.add('bg-red-500');
        uploadButton.disabled = false;
        setTimeout(() => {
            progressContainer.classList.remove('show');
            setTimeout(() => progressContainer.classList.add('hidden'), 300);
        }, 5000);
    }
});

// --- AI Analysis & Configuration ---
/**
 * Load Gemini configuration for admin users.
 *
 * @description
 * For admin users, loads the global API key from Firestore and populates
 * the configuration UI. This replaces the old localStorage-based system.
 *
 * @returns This function does not return a value; it updates the UI.
 */
function loadGeminiConfig(): void {
  // Only load config for admin users
  if (currentUserRole === 'admin') {
    loadCurrentApiKey()
  }
}

/**
 * Legacy function kept for backward compatibility.
 * No longer saves to localStorage since we use Firestore now.
 *
 * @deprecated This function is no longer used in the new Firestore-based system.
 */
function saveGeminiConfig(): void {
  // This function is now a no-op since we save directly to Firestore
  // in the setupConfigurationTab function
}

/**
 * Initialize configuration tab interface for AI prompt and API key management.
 *
 * @description
 * Sets up interactive configuration tab with editable prompt templates and API key
 * management. Creates dynamic UI for each prompt template with modification tracking,
 * reset functionality, and real-time saving to localStorage. Handles event listeners
 * for prompt changes, API key updates, and reset operations with visual feedback
 * for modified prompts and automatic configuration persistence.
 *
 * @returns This function does not return a value; it initializes the configuration UI.
 *
 * @example
 * // Initialize configuration tab with prompt templates
 * setupConfigurationTab();
 * // Creates editable prompt templates, API key input, reset buttons
 * // with modification tracking and automatic saving
 */
function setupConfigurationTab(): void {
  // Update API key input handler for admin users
  const apiKeyInput = document.getElementById('gemini-api-key') as HTMLInputElement
  if (apiKeyInput) {
    // Load current API key for admin
    loadCurrentApiKey()

    // Add event listener for saving
    apiKeyInput.addEventListener('change', async (e) => {
      const target = e.target as HTMLInputElement
      const apiKey = target.value.trim()

      if (!apiKey) {
        alert('Please enter a valid API key.')
        return
      }

      try {
        await globalConfigService.setGeminiApiKey(apiKey, (currentUser as DocumentData).uid)
        alert('API Key saved successfully!')
      } catch (error) {
        console.error('Error saving API key:', error)
        alert('Failed to save API key. Please try again.')
      }
    })
  }
}

// Helper function to load current API key for admin users
async function loadCurrentApiKey(): Promise<void> {
  try {
    const apiKey = await globalConfigService.getGeminiApiKey()
    const apiKeyInput = document.getElementById('gemini-api-key') as HTMLInputElement
    if (apiKeyInput && apiKey) {
      apiKeyInput.value = apiKey
    }
  } catch (error) {
    console.error('Error loading current API key:', error)
  }
}

/**
 * Generate AI-powered business insights using Google Gemini API.
 *
 * @description
 * Sends structured prompts to Google Gemini 2.5 Flash model to obtain
 * Indonesian-language business insights and analysis. Validates API key
 * configuration, handles HTTP requests with proper error handling, and
 * processes AI responses with fallback messaging. Used throughout the
 * application to generate contextual business recommendations and insights.
 *
 * @param prompt - Text prompt containing business data and context for AI analysis.
 * @returns Promise that resolves to AI-generated analysis text in Indonesian language.
 * @throws Error when API key is not configured or API request fails.
 *
 * @example
 * // Generate AI insights for sales data
 * const prompt = "Analisis data penjualan: Revenue Rp 5,000,000, TC 100 transaksi";
 * try {
 *   const insights = await getGeminiAnalysis(prompt);
 *   console.log(insights); // AI-generated business recommendations
 * } catch (error) {
 *   console.error("AI analysis failed:", error.message);
 * }
 */
async function getGeminiAnalysis(prompt: string): Promise<string> {
  const apiKey = await globalConfigService.getGeminiApiKey()
  if (!apiKey) {
    throw new Error('Gemini API Key is not configured. Please contact your administrator to set up the API key.')
  }
  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`

  const payload = { contents: [{ role: 'user', parts: [{ text: prompt }] }] }

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    const errorData = await response.json()
    throw new Error(errorData.error.message || `Request failed with status ${response.status}`)
  }

  const result = await response.json()
  if (result.candidates && result.candidates[0].content && result.candidates[0].content.parts[0]) {
    return result.candidates[0].content.parts[0].text
  } else {
    return 'No analysis could be generated. The response from the AI was empty.'
  }
}

// --- Analysis View Setup ---
/**
 * Initialize and display analysis view with sales data and configuration.
 *
 * @description
 * Sets up the complete analysis view by storing sales data globally, resetting
 * AI analysis cache, updating view title, populating intelligent date filters,
 * running comprehensive analysis with default settings, setting up analysis
 * module, applying text bindings, and transitioning to analysis view. Ensures
 * proper date object conversion and clean state initialization.
 *
 * @param data - Array of sales data objects to be analyzed with sales records.
 * @param title - Display title for the analysis view header.
 * @returns This function does not return a value; it initializes and displays the analysis view.
 *
 * @example
 * // Setup and show analysis view with sales data
 * const salesData = [
 *   { Revenue: 500000, "Sales Date In": "2024-01-15T14:30:00Z", "Bill Number": "B001" }
 * ];
 * setupAndShowAnalysisView(salesData, "Monthly Sales Analysis");
 * // Initializes analysis view with data, filters, and comprehensive analysis
 */
function setupAndShowAnalysisView(data: any[], title: string): void {
  showLoading({ message: 'Preparing data...', value: 60 });
  $store.setAllSalesData(data.map((d: any) => ({ ...d, date: new Date(d.date) })));
  $store.setAiAnalysisResults({});

  document.getElementById('analysis-title').textContent = title;
  showLoading({ message: 'Preparing view...', value: 80 });

  populateFilters($store.getAllSalesData());
  runAnalysis();

  // Call both setup functions
  generateYoYAnalysisFromSummaries($store.getAllSalesData());
  setupMonthlyComparison($store.getAllSalesData()); // ADD THIS LINE

  hideLoading();
  showView('analysis');
}

/**
 * Populate date filter inputs with intelligent defaults based on sales data range.
 *
 * @description
 * Automatically sets default values for analysis date filters based on the available
 * date range in sales data. Sets current period to full data range (min to max dates)
 * and comparison period to the previous month before current period starts, enabling
 * meaningful period-over-period analysis. Guards against empty datasets and handles
 * date calculations for optimal user experience.
 *
 * @param data - Array of processed sales data rows with Sales Date In field.
 * @returns This function does not return a value; it updates DOM date input elements.
 *
 * @example
 * // Populate date filters with intelligent defaults
 * const salesData = [
 *   { "Sales Date In": new Date("2024-01-15") },
 *   { "Sales Date In": new Date("2024-02-28") }
 * ];
 * populateFilters(salesData);
 * // Sets current period: 2024-01-15 to 2024-02-28
 * // Sets comparison period: 2023-12-15 to 2024-01-14
 */
function populateFilters(data: any[]): void {
  if (data.length === 0) return;

  // FIX: This now correctly uses the 'date' property from summary objects
  // instead of the old 'Sales Date In' property from raw data.
  const { minDate, maxDate } = data.reduce((acc, d) => {
    const currentDate = d.date; // <-- THE FIX IS HERE
    if (currentDate < acc.minDate) acc.minDate = currentDate;
    if (currentDate > acc.maxDate) acc.maxDate = currentDate;
    return acc;
  }, { minDate: data[0].date, maxDate: data[0].date });


  // The rest of the function remains the same
  document.getElementById('date-start').value = minDate.toISOString().split('T')[0];
  document.getElementById('date-end').value = maxDate.toISOString().split('T')[0];

  const lastPeriodEnd = new Date(minDate);
  lastPeriodEnd.setDate(lastPeriodEnd.getDate() - 1);
  const lastPeriodStart = new Date(lastPeriodEnd);
  // A full month before the last period end date
  lastPeriodStart.setMonth(lastPeriodStart.getMonth() - 1);

  document.getElementById('last-period-start').value = lastPeriodStart.toISOString().split('T')[0];
  document.getElementById('last-period-end').value = lastPeriodEnd.toISOString().split('T')[0];
}

document.getElementById('apply-filters-btn').addEventListener('click', runAnalysis)

/**
 * Execute comprehensive sales data analysis based on user-selected date ranges.
 *
 * @description
 * Orchestrates the complete analysis workflow by filtering sales data for current
 * and comparison periods, then generating all charts, insights, and visualizations.
 * Destroys existing charts to prevent memory leaks and creates fresh analysis
 * across multiple categories: general overview, sales analysis, product analysis,
 * branch analysis, and year-over-year comparisons.
 *
 * @returns This function does not return a value; it generates charts and updates the UI.
 *
 * @example
 * // Run analysis after user selects date ranges
 * // Assumes date inputs are populated: 'date-start', 'date-end', 'last-period-start', 'last-period-end'
 * runAnalysis();
 * // Generates all charts and insights for the selected periods, updates dashboard UI
 */

function setupMonthlyComparison(summaries: any[]) {
    const monthASelect = document.getElementById('month-a-select') as HTMLSelectElement;
    const monthBSelect = document.getElementById('month-b-select') as HTMLSelectElement;
    const runBtn = document.getElementById('run-comparison-btn'); // We still need the reference to hide it
    const resultsContainer = document.getElementById('comparison-results-container');

    const availableMonths = [...new Set(summaries.map(s => s.date.toISOString().slice(0, 7)))].toSorted().reverse();

    if (availableMonths.length < 2) {
        monthASelect.innerHTML = '<option>Not enough data</option>';
        monthBSelect.innerHTML = '<option>Not enough data</option>';
        runBtn.classList.add('hidden'); // Hide button if not usable
        resultsContainer.classList.add('hidden');
        return;
    }

    const optionsHtml = availableMonths.map(month => `<option value="${month}">${new Date(month + '-02').toLocaleString('default', { month: 'long', year: 'numeric' })}</option>`).join('');
    monthASelect.innerHTML = optionsHtml;
    monthBSelect.innerHTML = optionsHtml;

    // Set default selections
    monthBSelect.value = availableMonths[0];
    monthASelect.value = availableMonths[1];

    // --- FIX: Add event listeners to the dropdowns to auto-update ---
    if (!$store.getInitFlag('monthlyComparisonInitialized')) {
        const autoRunComparison = () => runMonthlyComparison($store.getAllSalesData());

        monthASelect.addEventListener('change', autoRunComparison);
        monthBSelect.addEventListener('change', autoRunComparison);

        $store.setInitFlag('monthlyComparisonInitialized', true);
    }

    // Run initial comparison and show the results
    runMonthlyComparison(summaries);
    resultsContainer.classList.remove('hidden');
}

/**
 * Runs the comparison between two selected months and updates the UI.
 * @param {any[]} summaries - The complete array of all daily summary objects.
 */
function runMonthlyComparison(summaries: any[]) {
    // --- Load saved targets from localStorage ---
    const savedTargets = localStorage.getItem('monthlyComparisonTargets');
    if (savedTargets) {
        $store.setConfigValue('monthlyComparisonTargets', JSON.parse(savedTargets));
    }

    const monthAValue = (document.getElementById('month-a-select') as HTMLSelectElement).value;
    const monthBValue = (document.getElementById('month-b-select') as HTMLSelectElement).value;

    if (!monthAValue || !monthBValue) return;

    const aggregateMonth = (month: string) => {
        const monthSummaries = summaries.filter(s => s.date.toISOString().startsWith(month));
        return monthSummaries.reduce((acc, s) => {
            acc.totalOmzet += s.totalOmzet || 0;
            acc.totalTransactions += s.totalTransactions || 0;
            return acc;
        }, { totalOmzet: 0, totalTransactions: 0, dailyData: monthSummaries });
    };

    const dataA = aggregateMonth(monthAValue);
    const dataB = aggregateMonth(monthBValue);
    const apcA = dataA.totalTransactions > 0 ? dataA.totalOmzet / dataA.totalTransactions : 0;
    const apcB = dataB.totalTransactions > 0 ? dataB.totalOmzet / dataB.totalTransactions : 0;

    const getChange = (valA: number, valB: number) => {
        if (valA === 0) return { text: 'N/A', class: 'text-gray-500' };
        const change = ((valB - valA) / valA) * 100;
        const sign = change >= 0 ? '▲' : '▼';
        const color = change >= 0 ? 'text-green-600' : 'text-red-600';
        return { text: `${sign} ${Math.abs(change).toFixed(1)}%`, class: color };
    };

    const comparisonData = [
        { metric: 'Total Omzet', id: 'omzet', valA: dataA.totalOmzet, valB: dataB.totalOmzet, format: (v) => `Rp${Math.round(v).toLocaleString('id-ID')}` },
        { metric: 'Total Transactions', id: 'transactions', valA: dataA.totalTransactions, valB: dataB.totalTransactions, format: (v) => v.toLocaleString('id-ID') },
        { metric: 'Average Transaction', id: 'apc', valA: apcA, valB: apcB, format: (v) => `Rp${Math.round(v).toLocaleString('id-ID')}` }
    ];

    const tbody = document.getElementById('comparison-tbody');
    tbody.innerHTML = '';
    comparisonData.forEach(item => {
        const change = getChange(item.valA, item.valB);
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">${item.metric}</td>
            <td class="px-6 py-4"><input type="text" id="target-${item.id}" data-metric-id="${item.id}" class="target-input w-32 border-gray-300 rounded-md shadow-sm text-sm p-1" placeholder="Enter target..."></td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${item.format(item.valA)}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${item.format(item.valB)}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm font-semibold ${change.class}">${change.text}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm font-semibold" id="target-result-${item.id}">-</td>
        `;
        tbody.appendChild(tr);
    });

    document.getElementById('month-a-header').textContent = new Date(monthAValue + '-02').toLocaleString('default', { month: 'long', year: 'numeric' });
    document.getElementById('month-b-header').textContent = new Date(monthBValue + '-02').toLocaleString('default', { month: 'long', year: 'numeric' });

    document.querySelectorAll('.target-input').forEach(input => {
        const metricId = (input as HTMLElement).dataset.metricId;
        const metricData = comparisonData.find(d => d.id === metricId);

        // --- NEW: Function to update and save targets ---
        const updateTarget = (targetValue) => {
            const currentTargets = $store.getConfigValue('monthlyComparisonTargets') || {};
            currentTargets[metricId] = targetValue;
            $store.setConfigValue('monthlyComparisonTargets', currentTargets);
            localStorage.setItem('monthlyComparisonTargets', JSON.stringify(currentTargets));

            const actualValue = metricData.valB;
            const resultCell = document.getElementById(`target-result-${metricId}`);
            const targetChange = getChange(targetValue, actualValue);

            resultCell.textContent = targetChange.text;
            resultCell.className = `px-6 py-4 whitespace-nowrap text-sm font-semibold ${targetChange.class}`;
        };

        // --- NEW: Load and apply saved target on initialization ---
        const currentTargets = $store.getConfigValue('monthlyComparisonTargets') || {};
        const savedTarget = currentTargets[metricId];
        if (savedTarget) {
            (input as HTMLInputElement).value = metricData.format(savedTarget);
            updateTarget(savedTarget);
        }

        input.addEventListener('input', (e) => {
            const target = e.target as HTMLInputElement;
            let cursorPosition = target.selectionStart;
            let originalLength = target.value.length;
            const rawValue = target.value.replace(/[^0-9]/g, '');
            const targetValue = parseFloat(rawValue) || 0;

            let formattedValue = "";
            if(rawValue) {
                formattedValue = metricData.format(targetValue);
            }
            target.value = formattedValue;

            let newLength = target.value.length;
            cursorPosition += (newLength - originalLength);
            target.setSelectionRange(cursorPosition, cursorPosition);

            // Update and save the target
            updateTarget(targetValue);
        });
    });

    $store.setChartDataForAIProperty('monthlyComparison', {
        monthA: { month: monthAValue, summary: dataA },
        monthB: { month: monthBValue, summary: dataB }
    });
}


async function runAnalysis(): Promise<void> {
  const currentStartDate = new Date(document.getElementById('date-start').value);
  const currentEndDate = new Date(document.getElementById('date-end').value);
  currentEndDate.setHours(23, 59, 59, 999);

  const lastPeriodStartDate = new Date(document.getElementById('last-period-start').value);
  const lastPeriodEndDate = new Date(document.getElementById('last-period-end').value);
  lastPeriodEndDate.setHours(23, 59, 59, 999);

  const branchSelect = document.getElementById('general-penjualan-branch-select') as HTMLSelectElement;
  const selectedBranch = branchSelect?.value;

  let currentData = $store.getAllSalesData().filter((summary: any) => summary.date >= currentStartDate && summary.date <= currentEndDate);
  let lastPeriodData = $store.getAllSalesData().filter((summary: any) => summary.date >= lastPeriodStartDate && summary.date <= lastPeriodEndDate);

  if (selectedBranch && selectedBranch !== 'ALL') {
      currentData = currentData.filter(s => s.branches.includes(selectedBranch));
      lastPeriodData = lastPeriodData.filter(s => s.branches.includes(selectedBranch));
  }

  destroyCharts();

  generateRingkasanFromSummaries(currentData, lastPeriodData, {
      omzet: 'ringkasan-total-omzet',
      check: 'ringkasan-total-check',
      avgCheck: 'ringkasan-avg-check',
      omzetGrowth: 'ringkasan-omzet-growth',
      checkGrowth: 'ringkasan-check-growth',
      avgCheckGrowth: 'ringkasan-avg-check-growth'
  });
  generateDailyOmzetHeatmapFromSummaries(currentData, 'daily-omzet-heatmap-container');
  generateOmzetHeatmapFromSummaries(currentData, 'omzet-heatmap-container');
  generateTcApcHarianChartFromSummaries(currentData, 'tc-apc-harian-chart');
  generateOmzetHarianChartFromSummaries(currentData, 'omzet-harian-chart');
  generateOmzetMingguanChartFromSummaries(currentData, 'omzet-mingguan-chart', 'line');
  generateOmzetBulananChartFromSummaries(currentData);
  generateOmzetOutletChartFromSummaries(currentData, 'omzet-outlet-chart');
  generateProductAnalysisChartsFromSummaries(currentData);
  generateCabangAnalysisFromSummaries(currentData, {
      topOmzetNameId: 'cabang-omzet-tertinggi-nama',
      topOmzetValueId: 'cabang-omzet-tertinggi-nilai',
      topCheckNameId: 'cabang-ramai-nama',
      topCheckValueId: 'cabang-ramai-nilai',
      topApcNameId: 'cabang-apc-tertinggi-nama',
      topApcValueId: 'cabang-apc-tertinggi-nilai',
      omzetCheckCanvasId: 'cabang-omzet-check-chart',
      apcCanvasId: 'cabang-apc-chart',
      detailTableId: 'cabang-detail-tbody'
  });
  generateWaktuPenjualanSection();
  generateAnalisaPenjualanCharts(currentData);
  generateCabangPenjualanSection(currentData);
  generateGeneralPenjualanSection(currentData, lastPeriodData);
  generateGeneralProdukChannelSection(currentData);
  generateAnalisaPenjualanSection(currentData);
  console.log("Analysis complete with pre-calculated summaries.");
}

function generateCabangAnalysisFromSummaries(summaries: any[], ids: any) {
    if (summaries.length === 0) return;

    const branchStats = summaries.reduce((acc, s) => {
        if (s.revenueByBranch) {
            for (const branchName in s.revenueByBranch) {
                if (!acc[branchName]) acc[branchName] = { revenue: 0, checks: 0 };
                acc[branchName].revenue += s.revenueByBranch[branchName];
            }
        }
        if (s.transactionCountsByBranch) {
            for (const branchName in s.transactionCountsByBranch) {
                if (!acc[branchName]) acc[branchName] = { revenue: 0, checks: 0 };
                acc[branchName].checks += s.transactionCountsByBranch[branchName];
            }
        }
        return acc;
    }, {});

    const processedStats = Object.entries(branchStats).map(([name, stats]) => {
        const apc = (stats as any).checks > 0 ? (stats as any).revenue / (stats as any).checks : 0;
        return { name, totalRevenue: (stats as any).revenue, totalCheck: (stats as any).checks, avgCheck: apc };
    });

    if (processedStats.length === 0) return;

    const formatCurrency = (value) => `Rp${Math.round(value).toLocaleString('id-ID')}`;

    // Populate Stat Cards (only if IDs are provided)
    if (ids.topOmzetNameId) {
        const topOmzet = [...processedStats].toSorted((a, b) => b.totalRevenue - a.totalRevenue)[0];
        document.getElementById(ids.topOmzetNameId).textContent = topOmzet.name;
        document.getElementById(ids.topOmzetValueId).textContent = formatCurrency(topOmzet.totalRevenue);
    }
    if (ids.topCheckNameId) {
        const topCheck = [...processedStats].toSorted((a, b) => b.totalCheck - a.totalCheck)[0];
        document.getElementById(ids.topCheckNameId).textContent = topCheck.name;
        document.getElementById(ids.topCheckValueId).textContent = `${topCheck.totalCheck.toLocaleString('id-ID')} checks`;
    }
    if (ids.topApcNameId) {
        const topApc = [...processedStats].toSorted((a, b) => b.avgCheck - a.avgCheck)[0];
        document.getElementById(ids.topApcNameId).textContent = topApc.name;
        document.getElementById(ids.topApcValueId).textContent = formatCurrency(topApc.avgCheck);
    }

    // Create Charts
    const sortedByRevenue = [...processedStats].toSorted((a, b) => b.totalRevenue - a.totalRevenue);
    const labels = sortedByRevenue.map((s) => s.name);

    if (ids.omzetCheckCanvasId) {
        $store.setChartDataForAIProperty(ids.omzetCheckCanvasId, sortedByRevenue);
        createChart(ids.omzetCheckCanvasId, 'bar', {
            labels,
            datasets: [
                { type: 'bar', label: 'Total Omzet', data: sortedByRevenue.map((s) => s.totalRevenue), backgroundColor: '#4F46E5', yAxisID: 'y-omzet' },
                { type: 'line', label: 'Total Check', data: sortedByRevenue.map((s) => s.totalCheck), borderColor: '#F97316', yAxisID: 'y-check' },
            ],
        }, {
            scales: {
                'y-omzet': { type: 'linear', position: 'left', title: { display: true, text: 'Total Omzet (Rp)' }, ticks: { callback: shortenCurrency } },
                'y-check': { type: 'linear', position: 'right', title: { display: true, text: 'Total Check' }, grid: { drawOnChartArea: false }, ticks: { callback: shortenNumber } },
            },
        });
    }

    if (ids.apcCanvasId) {
        const sortedByApc = [...processedStats].toSorted((a, b) => b.avgCheck - a.avgCheck);
        $store.setChartDataForAIProperty(ids.apcCanvasId, sortedByApc);
        createChart(ids.apcCanvasId, 'bar', {
            labels: sortedByApc.map((s) => s.name),
            datasets: [{ label: 'Average Check (APC)', data: sortedByApc.map((s) => s.avgCheck), backgroundColor: '#10B981' }],
        }, {
            plugins: { legend: { display: false } },
            scales: { y: { beginAtZero: true, ticks: { callback: (value) => formatCurrency(value) } } },
        });
    }

    // Populate Detail Table
    if (ids.detailTableId) {
        const tbody = document.getElementById(ids.detailTableId);
        tbody.innerHTML = '';
        sortedByRevenue.forEach((s) => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">${s.name}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${formatCurrency(s.totalRevenue)}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${s.totalCheck.toLocaleString('id-ID')}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${formatCurrency(s.avgCheck)}</td>
            `;
            tbody.appendChild(tr);
        });
        $store.setChartDataForAIProperty(ids.detailTableId, sortedByRevenue);
    }
}

/**
 * Fetches, aggregates, and renders a comparative P&L analysis table.
 * @param {Date} startDate - The start of the filter date range.
 * @param {Date} endDate - The end of the filter date range.
 */
async function generatePnlAnalysisTable(startDate: Date, endDate: Date) {
    if (!currentUser) return;
    const thead = document.getElementById('pnl-analysis-thead');
    const tbody = document.getElementById('pnl-analysis-tbody');
    tbody.innerHTML = '<tr><td colspan="3" class="text-center p-4 text-gray-500">Loading P&L reports...</td></tr>';

    try {
        // 1. Fetch P&L Structure, Reports, and Targets in parallel
        const structureRef = doc(db, `users/${currentUser.uid}/pnl/structure`);
        const reportsRef = collection(db, `users/${currentUser.uid}/pnlReports`);
        const targetsRef = collection(db, `users/${currentUser.uid}/monthlyPnlTargets`);

        const [structureSnap, reportsSnap, targetsSnap] = await Promise.all([
            getDoc(structureRef),
            getDocs(reportsRef),
            getDocs(targetsRef)
        ]);

        const pnlTemplate = structureSnap.exists() ? structureSnap.data().structure : {};

        // 2. Filter reports by the selected date range and sort them
        const filteredReports = reportsSnap.docs
            .map(doc => ({ id: doc.id, ...doc.data() }))
            .filter(report => {
                const reportDate = new Date(report.period + '-02'); // Use day 2 to avoid timezone issues
                return reportDate >= startDate && reportDate <= endDate;
            })
            .toSorted((a, b) => a.period.localeCompare(b.period));

        if (filteredReports.length === 0) {
            tbody.innerHTML = '<tr><td colspan="3" class="text-center p-4 text-gray-500">No P&L reports found for the selected period.</td></tr>';
            thead.innerHTML = '';
            return;
        }

        // 3. Prepare targets for easy lookup
        const targetsByPeriod = {};
        targetsSnap.forEach(doc => {
            targetsByPeriod[doc.id] = doc.data().targets;
        });
        const lastPeriodTarget = targetsByPeriod[endDate.toISOString().slice(0, 7)] || {};

        // 4. Render Table Header
        const periodHeaders = filteredReports.map(r => {
            const date = new Date(r.period + '-02');
            return `<th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">${date.toLocaleString('default', { month: 'long', year: 'numeric' })}</th>`;
        }).join('');
        thead.innerHTML = `<tr>
            <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Metric</th>
            <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Target</th>
            ${periodHeaders}
        </tr>`;

        // 5. Render Table Body
        tbody.innerHTML = '';
        const formatCurrency = (value) => value ? `Rp${Math.round(value).toLocaleString('id-ID')}` : 'Rp0';

        const categoryOrder = ["Pendapatan (Revenue)", "Harga Pokok Produksi", "Beban Operasional (OPEX)", "Beban Non Operasional", "Depresiasi/ Amortisasi", "Bunga", "Pajak (PB1)"];
        const subtotals = {
            "Laba Kotor (Gross Profit)": (data) => (data["Pendapatan (Revenue)"] || 0) - (data["Harga Pokok Produksi"] || 0),
            "Pendapatan Bersih Operasional (Net Operating Income)": (data) => subtotals["Laba Kotor (Gross Profit)"](data) - (data["Beban Operasional (OPEX)"] || 0),
            "Pendapatan Bersih Sebelum Deprisiasi/Amortisasi, Bunga & Pajak (EBITDA)": (data) => subtotals["Pendapatan Bersih Operasional (Net Operating Income)"](data) - (data["Beban Non Operasional"] || 0),
            "Pendapatan Bersih (Net Income)": (data) => subtotals["Pendapatan Bersih Sebelum Deprisiasi/Amortisasi, Bunga & Pajak (EBITDA)"](data) - (data["Depresiasi/ Amortisasi"] || 0) - (data["Bunga"] || 0) - (data["Pajak (PB1)"] || 0),
        };

        const allMetrics = [...categoryOrder, ...Object.keys(subtotals)];
        let aiData = {};

        allMetrics.forEach(metricName => {
            const isSubtotal = !!subtotals[metricName];
            const tr = document.createElement('tr');
            tr.className = isSubtotal ? 'bg-gray-50 font-semibold' : '';

            let rowHtml = `<td class="px-6 py-4 whitespace-nowrap text-sm ${isSubtotal ? 'text-gray-900' : 'text-gray-700'}">${metricName}</td>`;
            rowHtml += `<td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${formatCurrency(lastPeriodTarget[metricName])}</td>`;

            aiData[metricName] = { Target: lastPeriodTarget[metricName] || 0 };

            filteredReports.forEach(report => {
                let value = 0;
                if (isSubtotal) {
                    const categoryTotals = {};
                    categoryOrder.forEach(cat => {
                       categoryTotals[cat] = Object.values(report.pnlData[cat] || {}).reduce((sum: number, val: number) => sum + val, 0);
                    });
                    value = subtotals[metricName](categoryTotals);
                } else {
                    value = Object.values(report.pnlData[metricName] || {}).reduce((sum: number, val: number) => sum + val, 0);
                }
                rowHtml += `<td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${formatCurrency(value)}</td>`;
                aiData[metricName][report.period] = value;
            });
            tr.innerHTML = rowHtml;
            tbody.appendChild(tr);
        });

        $store.setChartDataForAIProperty('pnlAnalysis', aiData);

    } catch (error) {
        console.error("Error generating P&L analysis table:", error);
        tbody.innerHTML = `<tr><td colspan="3" class="text-center p-4 text-red-500">Error: Could not load P&L data. ${error.message}</td></tr>`;
    }
}

/**
 * Generates the P&L comparison table for a single, specified period.
 * Now includes expandable/collapsible rows for sub-categories.
 */
async function generateAnalisaPnlTable(selectedPeriod: string) {
    if (!currentUser || !selectedPeriod) return;

    const thead = document.getElementById('analisa-pnl-thead');
    const tbody = document.getElementById('analisa-pnl-tbody');
    tbody.innerHTML = '<tr><td colspan="4" class="text-center p-4 text-gray-500">Loading P&L data for the selected period...</td></tr>';

    try {
        // --- MODIFICATION: Fetch single report and target for the selected period ---
        const reportRef = doc(db, `users/${currentUser.uid}/pnlReports`, selectedPeriod);
        const targetRef = doc(db, `users/${currentUser.uid}/monthlyPnlTargets`, selectedPeriod);

        const [reportSnap, targetSnap] = await Promise.all([
            getDoc(reportRef),
            getDoc(targetRef)
        ]);

        if (!reportSnap.exists()) {
            thead.innerHTML = '';
            tbody.innerHTML = `<tr><td colspan="4" class="text-center p-4 text-gray-500">No P&L report found for ${selectedPeriod}.</td></tr>`;
            return;
        }

        const report = reportSnap.data();
        const targetsByPeriod = targetSnap.exists() ? { [selectedPeriod]: targetSnap.data().targets } : {};
        const allReports = [report]; // Treat the single report as an array to reuse logic

        // --- (The rest of the function is largely the same but now operates on a single period) ---
        let periodHeaders = '';
        allReports.forEach(r => {
            const date = new Date(r.period + '-02');
            const headerDate = date.toLocaleString('default', { month: 'short', year: 'numeric' });
            periodHeaders += `
                <th scope="col" class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">${headerDate} (Actual)</th>
                <th scope="col" class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">(Target)</th>
                <th scope="col" class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">(% of Revenue)</th>
            `;
        });
        thead.innerHTML = `<tr>
            <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Metric</th>
            ${periodHeaders}
        </tr>`;

        tbody.innerHTML = '';
        const formatCurrency = (value) => (value || value === 0) ? `Rp${Math.round(value).toLocaleString('id-ID')}` : 'N/A';
        const formatPercent = (value) => (value || value === 0) ? `${(value * 100).toFixed(1)}%` : '';

        const allMetrics = [ "Pendapatan (Revenue)", "Harga Pokok Produksi", "Laba Kotor (Gross Profit)", "Beban Operasional (OPEX)", "Pendapatan Bersih Operasional (Net Operating Income)", "Beban Non Operasional", "Pendapatan Bersih Sebelum Deprisiasi/Amortisasi, Bunga & Pajak (EBITDA)", "Depresiasi/ Amortisasi", "Bunga", "Pajak (PB1)", "Pendapatan Bersih (Net Income)" ];
        const subtotals = { /* ... subtotal calculation formulas remain the same ... */ };

        const totalRevenueForPeriod = Object.values(report.pnlData["Pendapatan (Revenue)"] || {}).reduce((sum: number, val: number) => sum + val, 0);

        allMetrics.forEach(metricName => {
            const isSubtotal = !!subtotals[metricName];
            const hasSubcategories = !isSubtotal;
            const sanitizedMetricName = metricName.replace(/[^a-zA-Z0-9]/g, '');

            const mainRow = document.createElement('tr');
            mainRow.className = isSubtotal ? 'bg-white' : 'bg-gray-50 hover:bg-gray-100 cursor-pointer';
            if (hasSubcategories) {
                mainRow.classList.add('pnl-category-toggle');
                mainRow.dataset.target = `sub-category-of-${sanitizedMetricName}`;
            }

            let mainRowHtml = `<td class="px-6 py-4 whitespace-nowrap text-sm ${isSubtotal ? 'text-gray-900 font-bold' : 'text-gray-700 font-semibold'}"><div class="flex items-center">${metricName} ${hasSubcategories ? '<svg class="w-4 h-4 ml-2 transform transition-transform chevron-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>' : ''}</div></td>`;

            const categoryTotals = {};
            if (report.pnlData) {
                Object.keys(report.pnlData).forEach(cat => {
                    categoryTotals[cat] = Object.values(report.pnlData[cat] || {}).reduce((sum, val) => sum + val, 0);
                });
            }
            const actualValue = isSubtotal ? subtotals[metricName](categoryTotals) : categoryTotals[metricName] || 0;

            const periodTargets = targetsByPeriod[report.period] || {};
            const targetRevenue = periodTargets['Pendapatan (Revenue)'];
            let nominalTarget = null;
            if (targetRevenue) {
                if (metricName === 'Pendapatan (Revenue)') {
                    nominalTarget = targetRevenue;
                } else if (periodTargets[metricName] !== undefined) {
                    nominalTarget = targetRevenue * periodTargets[metricName];
                }
            }

            const percentageOfRevenue = totalRevenueForPeriod > 0 ? actualValue / totalRevenueForPeriod : null;

            mainRowHtml += `<td class="px-6 py-4 text-right text-sm text-gray-800 font-mono">${formatCurrency(actualValue)}</td>
                            <td class="px-6 py-4 text-right text-sm text-gray-500 font-mono">${formatCurrency(nominalTarget)}</td>
                            <td class="px-6 py-4 text-right text-sm text-blue-600 font-mono">${formatPercent(percentageOfRevenue)}</td>`;
            mainRow.innerHTML = mainRowHtml;
            tbody.appendChild(mainRow);

            if (hasSubcategories) {
                // ... (Sub-category rendering logic remains the same) ...
            }
        });

    } catch (error) {
        console.error("Error generating P&L table for period:", error);
        tbody.innerHTML = `<tr><td colspan="4" class="text-center p-4 text-red-500">Error: Could not load P&L data.</td></tr>`;
    }
}

// --- P&L Table Accordion Listener ---
document.getElementById('analisa-pnl-tbody')?.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const headerRow = target.closest('.pnl-category-toggle');

    if (headerRow) {
        const targetClass = headerRow.dataset.target;
        if (!targetClass) return;

        const subRows = document.querySelectorAll(`.${targetClass}`);
        const chevron = headerRow.querySelector('.chevron-icon');

        subRows.forEach(row => {
            row.classList.toggle('hidden');
        });

        if (chevron) {
            chevron.classList.toggle('rotate-180');
        }
    }
});

/**
 * Fetches available P&L periods, populates the period selector dropdown,
 * and sets up an event listener to update the table on selection change.
 */
async function setupPnlPeriodSelector() {
    if (!currentUser) return;
    const selectEl = document.getElementById('pnl-period-select') as HTMLSelectElement;
    selectEl.innerHTML = '<option>Loading periods...</option>';

    try {
        const reportsRef = collection(db, `users/${currentUser.uid}/pnlReports`);
        const reportsSnap = await getDocs(reportsRef);

        const periods = reportsSnap.docs
            .map(doc => doc.data().period)
            .filter(Boolean) // Remove any undefined periods
            .toSorted()
            .reverse(); // Show most recent first

        if (periods.length === 0) {
            selectEl.innerHTML = '<option>No P&L data found</option>';
            document.getElementById('analisa-pnl-tbody').innerHTML = '<tr><td colspan="4" class="text-center p-4 text-gray-500">No P&L reports have been saved yet.</td></tr>';
            document.getElementById('analisa-pnl-thead').innerHTML = '';
            return;
        }

        // Populate the dropdown with available periods
        selectEl.innerHTML = periods.map(period => {
            const [year, month] = period.split('-');
            const dateLabel = new Date(parseInt(year), parseInt(month) - 1).toLocaleString('default', { month: 'long', year: 'numeric' });
            return `<option value="${period}">${dateLabel}</option>`;
        }).join('');

        // Add event listener to redraw the table when the period changes
        selectEl.addEventListener('change', () => {
            const selectedPeriod = selectEl.value;
            generateAnalisaPnlTable(selectedPeriod);
        });

        // Initially, load the table for the most recent period
        generateAnalisaPnlTable(periods[0]);

    } catch (error) {
        console.error("Error setting up P&L period selector:", error);
        selectEl.innerHTML = '<option>Error loading periods</option>';
    }
}

function setupGeneralMenuTrendChart(summaries: any[], selectId: string, canvasId: string) {
    // This check is to prevent re-creating the dropdown over and over.
    // We will create it once and then just update the chart.
    const existingSelect = $store.getUIComponent('generalMenuTrendSelect');
    if (existingSelect) {
        drawGeneralMenuTrendChart(summaries, canvasId);
        return;
    }

    const menuSelectElement = document.getElementById(selectId) as HTMLSelectElement;
    const allMenuItems = new Set<string>();

    // --- THIS IS THE CORRECTED LOGIC THAT WAS MISSING ---
    summaries.forEach(s => {
        if (s.menuItemQuantities) {
            for (const category in s.menuItemQuantities) {
                for (const menuName in s.menuItemQuantities[category]) {
                    if (!menuName.includes('(PACKAGE)')) {
                        allMenuItems.add(menuName);
                    }
                }
            }
        }
    });
    // --- END OF CORRECTION ---

    const sortedMenuItems = Array.from(allMenuItems).toSorted();

    if(sortedMenuItems.length === 0) {
        menuSelectElement.innerHTML = `<option disabled>No menu items found in this period</option>`;
        return;
    }

    menuSelectElement.innerHTML = sortedMenuItems.map(name => `<option value="${name}">${name}</option>`).join('');

    // Store generalMenuTrendSelect instance for cleanup on view reset
    // Also keep window property for compatibility (will be cleaned up in reset)
    $store.setUIComponent(
      'generalMenuTrendSelect',
      new SlimSelect({
        select: `#${selectId}`,
        settings: { placeholderText: 'Select menus...' },
        events: {
            afterChange: () => drawGeneralMenuTrendChart($store.getAllSalesData(), canvasId)
        }
      }),
      ($select) => {
        window.generalMenuTrendSelect = $select;
        $select.setSelected(sortedMenuItems.slice(0, 3));
      }
    );
}

function drawGeneralMenuTrendChart(summaries: any[], canvasId: string) {
    const menuSelect = $store.getUIComponent('generalMenuTrendSelect');
    if (!menuSelect) return;

    const selectedMenus = menuSelect.getSelected() as string[];
    const labels = summaries.map(s => s.date.toISOString().split('T')[0]).toSorted();

    const datasets = selectedMenus.map((menuName, index) => {
        const dataPoints = labels.map(dateStr => {
            const summaryForDay = summaries.find(s => s.date.toISOString().startsWith(dateStr));
            let quantity = 0;
            if (summaryForDay && summaryForDay.menuItemQuantities) {
                for (const category in summaryForDay.menuItemQuantities) {
                    if (summaryForDay.menuItemQuantities[category][menuName]) {
                        quantity = summaryForDay.menuItemQuantities[category][menuName];
                        break;
                    }
                }
            }
            return quantity;
        });

        const colors = ['#3B82F6', '#10B981', '#F97316', '#8B5CF6', '#EF4444'];
        return {
            label: menuName,
            data: dataPoints,
            borderColor: colors[index % colors.length],
            tension: 0.1,
            fill: false
        };
    });

    createChart(canvasId, 'line', { labels, datasets }, deepmerge(
        chartYTicks(shortenNumber),
        chartXTicks(shortenDateTickCallback)
    ));
}

function generateYoYAnalysisFromSummaries(summaries: any[]) {
    const yearSelect = document.getElementById('yoy-year-select') as HTMLSelectElement;

    // --- Populate Year Selector (only once) ---
    if (!$store.getInitFlag('yoyYearSelectInitialized')) {
        const years = [...new Set(summaries.map(s => s.date.getFullYear()))].toSorted((a, b) => b - a);
        yearSelect.innerHTML = years.map(y => `<option value="${y}">${y}</option>`).join('');
        // When the year changes, re-run the analysis on the *entire* dataset
        yearSelect.addEventListener('change', () => generateYoYAnalysisFromSummaries($store.getAllSalesData()));
        $store.setInitFlag('yoyYearSelectInitialized', true);
    }

    const selectedYear = parseInt(yearSelect.value);
    if (isNaN(selectedYear)) {
        // Clear the view if no year is selected or available
        document.getElementById('yoy-omzet-growth').textContent = 'N/A';
        document.getElementById('yoy-check-growth').textContent = 'N/A';
        document.getElementById('yoy-apc-growth').textContent = 'N/A';
        const existingYoyChart = $store.getChartProperty('yoy-omzet-chart');
        if (existingYoyChart) existingYoyChart.destroy();
        document.getElementById('yoy-detail-tbody').innerHTML = '<tr><td colspan="4" class="text-center p-4">Select a year to see data.</td></tr>';
        return;
    };
    const prevYear = selectedYear - 1;

    // --- Filter data for the two years ---
    const currentYearData = summaries.filter(s => s.date.getFullYear() === selectedYear);
    const prevYearData = summaries.filter(s => s.date.getFullYear() === prevYear);

    // --- Calculate overall stats ---
    const calcStats = (summaryData: any[]) => {
        const stats = summaryData.reduce((acc, s) => {
            acc.revenue += s.totalOmzet;
            acc.checks += s.totalTransactions;
            return acc;
        }, { revenue: 0, checks: 0 });
        stats.apc = stats.checks > 0 ? stats.revenue / stats.checks : 0;
        return stats;
    };
    const currentYearStats = calcStats(currentYearData);
    const prevYearStats = calcStats(prevYearData);

    // --- Calculate and display growth for KPI cards ---
    const calcGrowth = (current, previous) => {
        if (previous === 0) return { text: 'N/A', class: 'text-gray-500' };
        const growth = ((current - previous) / previous) * 100;
        const sign = growth >= 0 ? '+' : '';
        const colorClass = growth >= 0 ? 'text-green-600' : 'text-red-600';
        return { text: `${sign}${growth.toFixed(1)}%`, class: colorClass };
    };

    const omzetGrowth = calcGrowth(currentYearStats.revenue, prevYearStats.revenue);
    const checkGrowth = calcGrowth(currentYearStats.checks, prevYearStats.checks);
    const apcGrowth = calcGrowth(currentYearStats.apc, prevYearStats.apc);

    document.getElementById('yoy-omzet-growth').textContent = omzetGrowth.text;
    document.getElementById('yoy-omzet-growth').className = `text-4xl font-bold mt-2 ${omzetGrowth.class}`;
    document.getElementById('yoy-check-growth').textContent = checkGrowth.text;
    document.getElementById('yoy-check-growth').className = `text-4xl font-bold mt-2 ${checkGrowth.class}`;
    document.getElementById('yoy-apc-growth').textContent = apcGrowth.text;
    document.getElementById('yoy-apc-growth').className = `text-4xl font-bold mt-2 ${apcGrowth.class}`;

    // --- Prepare monthly data for Chart & Table ---
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthlyData = Array.from({ length: 12 }, (_, i) => ({
        month: monthNames[i],
        currentRevenue: 0,
        prevRevenue: 0,
    }));

    currentYearData.forEach(s => { monthlyData[s.date.getMonth()].currentRevenue += s.totalOmzet; });
    prevYearData.forEach(s => { monthlyData[s.date.getMonth()].prevRevenue += s.totalOmzet; });

    $store.setChartDataForAIProperty('yoyOmzet', { year: selectedYear, previous_year: prevYear, monthly_comparison: monthlyData });

    // --- Create Chart ---
    createChart('yoy-omzet-chart', 'line', {
        labels: monthNames,
        datasets: [
            { label: `Omzet ${prevYear}`, data: monthlyData.map(m => m.prevRevenue), borderColor: '#9CA3AF', tension: 0.1 },
            { label: `Omzet ${selectedYear}`, data: monthlyData.map(m => m.currentRevenue), borderColor: '#4F46E5', tension: 0.1 },
        ]
    });

    // --- Populate Detail Table ---
    const tbody = document.getElementById('yoy-detail-tbody');
    const formatCurrency = (value) => `Rp${Math.round(value).toLocaleString('id-ID')}`;
    tbody.innerHTML = '';
    monthlyData.forEach(m => {
        const growth = calcGrowth(m.currentRevenue, m.prevRevenue);
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">${m.month}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${formatCurrency(m.prevRevenue)}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${formatCurrency(m.currentRevenue)}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm font-medium ${growth.class}">${growth.text}</td>
        `;
        tbody.appendChild(tr);
    });
    $store.setChartDataForAIProperty('yoyDetail', monthlyData);
}

function generateProductAnalysisChartsFromSummaries(summaries: any[]) {
    // --- Aggregate data from all summaries ---
    const aggregatedData = summaries.reduce((acc, s) => {
        // Aggregate category quantities
        if (s.menuCategories) {
            for (const category in s.menuCategories) {
                acc.categoryQuantities[category] = (acc.categoryQuantities[category] || 0) + s.menuCategories[category].quantity;
            }
        }
        // Aggregate all item quantities
        if (s.menuItemQuantities) {
            for (const category in s.menuItemQuantities) {
                if (!acc.itemQuantities[category]) {
                    acc.itemQuantities[category] = {};
                }
                for (const menu in s.menuItemQuantities[category]) {
                    acc.itemQuantities[category][menu] = (acc.itemQuantities[category][menu] || 0) + s.menuItemQuantities[category][menu];
                }
            }
        }
        return acc;
    }, { categoryQuantities: {}, itemQuantities: {} });

    // --- Chart 1: Order by Menu Category (Donut Chart) ---
    $store.setChartDataForAIProperty('orderByCategory', aggregatedData.categoryQuantities);
    createChart('order-by-menu-category-chart', 'doughnut', {
        labels: Object.keys(aggregatedData.categoryQuantities),
        datasets: [{ data: Object.values(aggregatedData.categoryQuantities), backgroundColor: ['#10B981', '#3B82F6', '#F97316', '#8B5CF6', '#EC4899', '#F59E0B'] }],
    });

    // --- Helper to create Top 5 Bar Charts ---
    const createTop5Chart = (containerId: string, categoryName: string, color: string) => {
        const categoryItems = aggregatedData.itemQuantities[categoryName] || {};
        const top5 = Object.entries(categoryItems)
            // --- FIX: Filter out items with '(PACKAGE)' in their name ---
            .filter(item => !item[0].includes('(PACKAGE)'))
            .toSorted((a, b) => b[1] - a[1])
            .slice(0, 5);

        if (top5.length > 0) {
            $store.setChartDataForAIProperty(containerId, Object.fromEntries(top5));
            createChart(containerId, 'bar', {
                labels: top5.map(item => item[0]),
                datasets: [{
                    label: 'Quantity Sold',
                    data: top5.map(item => item[1]),
                    backgroundColor: color,
                }],
            }, { indexAxis: 'y', plugins: { legend: { display: false } } });
        } else {
            const ctx = document.getElementById(containerId).getContext('2d');
            ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height); // Clear previous drawing
            ctx.font = "14px Inter";
            ctx.fillStyle = "#9CA3AF";
            ctx.textAlign = "center";
            ctx.fillText(`No non-package '${categoryName}' data.`, ctx.canvas.width / 2, ctx.canvas.height / 2);
        }
    };

    // --- Chart 2 & 3: Top 5 Makanan & Minuman ---
    createTop5Chart('top-makanan-chart', 'MAKANAN', '#EF4444');
    createTop5Chart('top-minuman-chart', 'MINUMAN', '#3B82F6');
}

function generatePenjualanBulananChartFromSummaries(summaries: any[], canvasId: string) {
    const monthlyData = summaries.reduce((acc, s) => {
        const month = s.date.toISOString().slice(0, 7); // YYYY-MM
        if (!acc[month]) {
            acc[month] = { revenue: 0, checks: 0 };
        }
        acc[month].revenue += s.totalOmzet;
        acc[month].checks += s.totalTransactions;
        return acc;
    }, {});

    const sortedMonths = Object.keys(monthlyData).toSorted();
    const salesData = sortedMonths.map((month) => monthlyData[month].revenue);
    const checkData = sortedMonths.map((month) => monthlyData[month].checks);

    $store.setChartDataForAIProperty('penjualanBulanan', sortedMonths.map((month, i) => ({ month, revenue: salesData[i], checks: checkData[i] })));

    createChart(canvasId, 'bar', { // Use the provided canvasId
        labels: sortedMonths,
        datasets: [
            { label: 'Total Penjualan', data: salesData, backgroundColor: '#3B82F6', yAxisID: 'y-sales' },
            { label: 'Total Check', data: checkData, backgroundColor: '#F97316', yAxisID: 'y-check' },
        ],
    }, {
        scales: {
            'y-sales': { type: 'linear', display: true, position: 'left', title: { display: true, text: 'Total Penjualan (Rp)' } },
            'y-check': { type: 'linear', display: true, position: 'right', title: { display: true, text: 'Total Check' }, grid: { drawOnChartArea: false } },
        },
    });
}

function generateWaktuPenjualanSection() {
    if (!currentUser) return;
    const periodA = (document.getElementById('waktu-penjualan-period-a') as HTMLSelectElement).value;
    const periodB = (document.getElementById('waktu-penjualan-period-b') as HTMLSelectElement).value;
    const selectedBranch = (document.getElementById('waktu-penjualan-branch-select') as HTMLSelectElement).value;

    if (!periodA || !periodB || !selectedBranch) return;

    const branchData = $store.getAllSalesData().filter((s: any) => s.branches.includes(selectedBranch));

    const periodAData = branchData.filter((s: any) => s.date.toISOString().startsWith(periodA));
    const periodBData = branchData.filter(s => s.date.toISOString().startsWith(periodB));

    generatePeriodComparisonLineChart(periodAData, periodBData, { canvasId: 'waktu-omset-comparison-chart', metric: 'totalOmzet', title: 'Omset' });
    generatePeriodComparisonLineChart(periodAData, periodBData, { canvasId: 'waktu-tc-comparison-chart', metric: 'totalTransactions', title: 'Total Check' });
    generatePeriodComparisonLineChart(periodAData, periodBData, { canvasId: 'waktu-apc-comparison-chart', metric: 'apc', title: 'ATC' });
    generateWeeklyTrendComparisonChart(periodAData, periodBData, 'waktu-weekly-trend-comparison-chart');
    generateYoYComparisonChart(periodB, selectedBranch);

    $store.setActiveViewData('waktu-penjualan', { periodAData, periodBData }, { periodA, periodB, selectedBranch });
}

async function setupCabangKeuanganSelectors() {
    if ($store.getInitFlag('cabangKeuanganSelectorsInitialized')) return;

    const periodSelect = document.getElementById('cabang-keuangan-period-select') as HTMLSelectElement;
    const branchASelect = document.getElementById('cabang-keuangan-branch-a-select') as HTMLSelectElement;
    const branchBSelect = document.getElementById('cabang-keuangan-branch-b-select') as HTMLSelectElement;

    const pnlReportsRef = collection(db, `users/${currentUser.uid}/pnlReports`);
    const reportsSnap = await getDocs(pnlReportsRef);

    const periods = [...new Set(reportsSnap.docs.map(doc => doc.data().period))].toSorted().reverse();
    const branches = [...new Set(reportsSnap.docs.map(doc => doc.data().branchName))].toSorted();

    if (periods.length === 0 || branches.length < 2) { return; }

    periodSelect.innerHTML = periods.map(p => `<option value="${p}">${new Date(p + '-02').toLocaleString('default', { month: 'long', year: 'numeric' })}</option>`).join('');
    branchASelect.innerHTML = branches.map(b => `<option value="${b}">${b}</option>`).join('');
    branchBSelect.innerHTML = branches.map(b => `<option value="${b}">${b}</option>`).join('');

    branchASelect.value = branches[0];
    branchBSelect.value = branches[1];

    const handler = () => generateCabangKeuanganSection();
    periodSelect.addEventListener('change', handler);
    branchASelect.addEventListener('change', handler);
    branchBSelect.addEventListener('change', handler);

    $store.setInitFlag('cabangKeuanganSelectorsInitialized', true);
    generateCabangKeuanganSection();
}

// Replace the existing generateCabangKeuanganSection function
async function generateCabangKeuanganSection() {
    if (!currentUser) return;
    const period = (document.getElementById('cabang-keuangan-period-select') as HTMLSelectElement).value;
    const branchA = (document.getElementById('cabang-keuangan-branch-a-select') as HTMLSelectElement).value;
    const branchB = (document.getElementById('cabang-keuangan-branch-b-select') as HTMLSelectElement).value;

    if (!period || !branchA || !branchB || branchA === branchB) {
        // Optional: Show a message to select different branches
        return;
    }

    showLoading({ message: 'Comparing P&L data...', value: 30 });

    const pnlReportsRef = collection(db, `users/${currentUser.uid}/pnlReports`);
    const q = query(pnlReportsRef, where("period", "==", period));
    const reportsSnap = await getDocs(q);

    const reportA = reportsSnap.docs.find(doc => doc.data().branchName === branchA)?.data();
    const reportB = reportsSnap.docs.find(doc => doc.data().branchName === branchB)?.data();

    generateBranchPnlComparisonTable(reportA, reportB, 'cabang-pnl-comparison-container');
    generateBranchRatioComparisonChart(reportA, reportB, { canvasId: 'cabang-cogs-comparison-chart', metric: 'Harga Pokok Produksi', title: 'COGS' });
    generateBranchRatioComparisonChart(reportA, reportB, { canvasId: 'cabang-gpm-comparison-chart', metric: 'Laba Kotor (Gross Profit)', title: 'Gross Profit' });
    generateBranchRatioComparisonChart(reportA, reportB, { canvasId: 'cabang-npm-comparison-chart', metric: 'Pendapatan Bersih (Net Income)', title: 'Net Income' });

    $store.setActiveViewData('cabang-keuangan', { reportA, reportB }, { period, branchA, branchB });

    hideLoading();
}

/**
 * Orchestrator for the "Analisis Perbandingan Cabang > Aspek Penjualan" section.
 */
function generateCabangPenjualanSection() {
    if (!currentUser) return;
    const period = (document.getElementById('cabang-penjualan-period-select') as HTMLSelectElement).value;
    const branchA = (document.getElementById('cabang-penjualan-branch-a-select') as HTMLSelectElement).value;
    const branchB = (document.getElementById('cabang-penjualan-branch-b-select') as HTMLSelectElement).value;

    if (!period || !branchA || !branchB || branchA === branchB) return;

    const periodData = $store.getAllSalesData().filter((s: any) => s.date.toISOString().startsWith(period));

    generateBranchComparisonLineChart(periodData, branchA, branchB, { canvasId: 'cabang-omset-comparison-chart', metric: 'totalOmzet', title: 'Omset' });
    generateBranchComparisonLineChart(periodData, branchA, branchB, { canvasId: 'cabang-tc-comparison-chart', metric: 'totalTransactions', title: 'Total Check' });
    generateBranchComparisonLineChart(periodData, branchA, branchB, { canvasId: 'cabang-apc-comparison-chart', metric: 'apc', title: 'ATC' });
    generateBranchWeeklyTrendComparisonChart(periodData, branchA, branchB, 'cabang-weekly-trend-comparison-chart');

    $store.setActiveViewData('cabang-penjualan', periodData, { period, branchA, branchB });
}

/**
 * Sets up the selectors for the "Cabang > Penjualan" section.
 */
async function setupCabangPenjualanSelectors() {
    if ($store.getInitFlag('cabangPenjualanSelectorsInitialized')) return;
    const periodSelect = document.getElementById('cabang-penjualan-period-select') as HTMLSelectElement;
    const branchASelect = document.getElementById('cabang-penjualan-branch-a-select') as HTMLSelectElement;
    const branchBSelect = document.getElementById('cabang-penjualan-branch-b-select') as HTMLSelectElement;

    const periods = [...new Set($store.getAllSalesData().map(s => s.date.toISOString().slice(0, 7)))].toSorted().reverse();
    const branches = [...new Set($store.getAllSalesData().flatMap(s => Object.keys(s.revenueByBranch || {})))].toSorted();

    if (periods.length === 0 || branches.length < 2) { return; }

    periodSelect.innerHTML = periods.map(p => `<option value="${p}">${new Date(p + '-02').toLocaleString('default', { month: 'long', year: 'numeric' })}</option>`).join('');
    branchASelect.innerHTML = branches.map(b => `<option value="${b}">${b}</option>`).join('');
    branchBSelect.innerHTML = branches.map(b => `<option value="${b}">${b}</option>`).join('');

    branchASelect.value = branches[0];
    branchBSelect.value = branches[1];

    const handler = () => generateCabangPenjualanSection();
    periodSelect.addEventListener('change', handler);
    branchASelect.addEventListener('change', handler);
    branchBSelect.addEventListener('change', handler);

    $store.setInitFlag('cabangPenjualanSelectorsInitialized', true);
    generateCabangPenjualanSection();
}

/**
 * Reusable function to compare a daily metric trend between two branches.
 */
function generateBranchComparisonLineChart(periodData: any[], branchA: string, branchB: string, config: { canvasId: string, metric: 'totalOmzet' | 'totalTransactions' | 'apc', title: string }) {
    const labels = Array.from({ length: 31 }, (_, i) => i + 1);

    const getDailyData = (branchName) => {
        const daily = Array(31).fill(null);
        const branchSummaries = periodData.filter(s => s.revenueByBranch?.[branchName] !== undefined);
        branchSummaries.forEach(s => {
            const dayIndex = s.date.getDate() - 1;
            daily[dayIndex] = s[config.metric]; // Note: This assumes TC and APC are top-level on the summary
        });
        return daily;
    };

    createChart(config.canvasId, 'line', {
        labels,
        datasets: [
            { label: `${config.title} ${branchA}`, data: getDailyData(branchA), borderColor: '#9CA3AF', tension: 0.1, spanGaps: true },
            { label: `${config.title} ${branchB}`, data: getDailyData(branchB), borderColor: '#4F46E5', tension: 0.1, spanGaps: true }
        ]
    });
}

/**
 * Generates a chart comparing average sales by day of the week for two branches.
 */
function generateBranchWeeklyTrendComparisonChart(periodData: any[], branchA: string, branchB: string, canvasId: string) {
    const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    const getAvgWeeklyData = (branchName) => {
        const weeklyTotals = Array(7).fill(0);
        const weeklyCounts = Array(7).fill(0);
        const seenDates = new Set();
        const branchSummaries = periodData.filter(s => s.revenueByBranch?.[branchName] !== undefined);

        branchSummaries.forEach(s => {
            const dateStr = s.date.toISOString().split('T')[0];
            const dayIndex = s.date.getDay();
            weeklyTotals[dayIndex] += s.revenueByBranch[branchName];
            if (!seenDates.has(dateStr)) {
                weeklyCounts[dayIndex]++;
                seenDates.add(dateStr);
            }
        });
        return weeklyTotals.map((total, i) => weeklyCounts[i] > 0 ? total / weeklyCounts[i] : 0);
    };

    createChart(canvasId, 'line', {
        labels: dayLabels,
        datasets: [
            { label: `Avg Sales ${branchA}`, data: getAvgWeeklyData(branchA), borderColor: '#9CA3AF', tension: 0.1 },
            { label: `Avg Sales ${branchB}`, data: getAvgWeeklyData(branchB), borderColor: '#4F46E5', tension: 0.1 }
        ]
    });
}

// Add this new helper function
function calculatePnlMetrics(pnlData) {
    if (!pnlData) return {};
    const results = {};
    const categoryOrder = ["Pendapatan (Revenue)", "Harga Pokok Produksi", "Beban Operasional (OPEX)"];
    const categoryTotals = {};
    categoryOrder.forEach(cat => {
        const total = Object.values(pnlData[cat] || {}).reduce((sum: number, val: number) => sum + val, 0);
        results[cat] = total;
        categoryTotals[cat] = total;
    });
    results['Laba Kotor (Gross Profit)'] = (categoryTotals['Pendapatan (Revenue)'] || 0) - (categoryTotals['Harga Pokok Produksi'] || 0);
    results['Pendapatan Bersih (Net Income)'] = results['Laba Kotor (Gross Profit)'] - (categoryTotals['Beban Operasional (OPEX)'] || 0);
    return results;
};

// Add this new function to generate the table
function generateBranchPnlComparisonTable(reportA, reportB, containerId) {
    const metricsA = calculatePnlMetrics(reportA?.pnlData);
    const metricsB = calculatePnlMetrics(reportB?.pnlData);
    const container = document.getElementById(containerId);

    const metricsToShow = ["Pendapatan (Revenue)", "Harga Pokok Produksi", "Laba Kotor (Gross Profit)", "Beban Operasional (OPEX)", "Pendapatan Bersih (Net Income)"];
    let tableHtml = `<table class="min-w-full divide-y divide-gray-200"><thead>...</thead><tbody>`; // Simplified header
    metricsToShow.forEach(metric => {
        const valA = metricsA[metric] || 0;
        const valB = metricsB[metric] || 0;
        tableHtml += `<tr>
            <td class="px-6 py-4 text-sm font-medium">${metric}</td>
            <td class="px-6 py-4 text-sm text-right">${shortenCurrency(valA)}</td>
            <td class="px-6 py-4 text-sm text-right">${shortenCurrency(valB)}</td>
        </tr>`;
    });
    tableHtml += `</tbody></table>`;
    container.innerHTML = tableHtml;
}

// Add this new reusable function for the charts
function generateBranchRatioComparisonChart(reportA, reportB, config: { canvasId: string, metric: string, title: string }) {
    const metricsA = calculatePnlMetrics(reportA?.pnlData);
    const metricsB = calculatePnlMetrics(reportB?.pnlData);

    const valueA = metricsA[config.metric] || 0;
    const valueB = metricsB[config.metric] || 0;
    const revenueA = metricsA['Pendapatan (Revenue)'] || 0;
    const revenueB = metricsB['Pendapatan (Revenue)'] || 0;
    const percentA = revenueA > 0 ? (valueA / revenueA) * 100 : 0;
    const percentB = revenueB > 0 ? (valueB / revenueB) * 100 : 0;

    createChart(config.canvasId, 'bar', {
        labels: [reportA?.branchName || 'Branch A', reportB?.branchName || 'Branch B'],
        datasets: [
            { type: 'bar', label: `${config.title} (Rp)`, data: [valueA, valueB], backgroundColor: '#60A5FA', yAxisID: 'y-rp' },
            { type: 'line', label: `${config.title} (%)`, data: [percentA, percentB], borderColor: '#F97316', yAxisID: 'y-percent' }
        ]
    }, { /* ... standard dual-axis scale options ... */ });
}

async function setupWaktuPenjualanSelectors() {
    if ($store.getInitFlag('waktuPenjualanSelectorsInitialized')) return;
    if (!currentUser) return;

    const selectA = document.getElementById('waktu-penjualan-period-a') as HTMLSelectElement;
    const selectB = document.getElementById('waktu-penjualan-period-b') as HTMLSelectElement;
    const branchSelect = document.getElementById('waktu-penjualan-branch-select') as HTMLSelectElement;

    // Get a unique list of all branches from the entire dataset
    const branches = [...new Set($store.getAllSalesData().flatMap(s => s.branches))].toSorted();

    if (branches.length === 0) {
        branchSelect.innerHTML = '<option>No branches found</option>';
        return;
    }

    // Populate ONLY the branch selector first
    branchSelect.innerHTML = branches.map(b => `<option value="${b}">${b}</option>`).join('');
    branchSelect.value = branches[0];

    // Add event listeners
    selectA.addEventListener('change', () => generateWaktuPenjualanSection());
    selectB.addEventListener('change', () => generateWaktuPenjualanSection());
    branchSelect.addEventListener('change', async () => {
        await updatePeriodSelectorsForPenjualan(branchSelect.value);
    });

    $store.setInitFlag('waktuPenjualanSelectorsInitialized', true);

    // Trigger the initial population of the period selectors for the default branch
    await updatePeriodSelectorsForPenjualan(branches[0]);
}

async function updatePeriodSelectorsForPenjualan(selectedBranch: string) {
    const selectA = document.getElementById('waktu-penjualan-period-a') as HTMLSelectElement;
    const selectB = document.getElementById('waktu-penjualan-period-b') as HTMLSelectElement;

    const branchData = $store.getAllSalesData().filter(s => s.branches.includes(selectedBranch));
    const periods = [...new Set(branchData.map(s => s.date.toISOString().slice(0, 7)))].toSorted().reverse();

    if (periods.length < 2) {
        selectA.innerHTML = '<option>Not enough data for comparison</option>';
        selectB.innerHTML = '<option>Not enough data for comparison</option>';
        return;
    }

    const periodOptionsHtml = periods.map(p => `<option value="${p}">${new Date(p + '-02').toLocaleString('default', { month: 'long', year: 'numeric' })}</option>`).join('');
    selectA.innerHTML = periodOptionsHtml;
    selectB.innerHTML = periodOptionsHtml;

    selectA.value = periods[1];
    selectB.value = periods[0];

    await generateWaktuPenjualanSection();
}

/**
 * Reusable function to generate a line chart comparing a metric between two periods.
 */
function generatePeriodComparisonLineChart(periodAData: any[], periodBData: any[], config: { canvasId: string, metric: 'totalOmzet' | 'totalTransactions' | 'apc', title: string }) {
    const labels = Array.from({ length: 31 }, (_, i) => i + 1); // Days 1-31

    const getDailyData = (data) => {
        const daily = Array(31).fill(null);
        data.forEach(s => {
            const dayIndex = s.date.getDate() - 1;
            daily[dayIndex] = s[config.metric];
        });
        return daily;
    };

    createChart(config.canvasId, 'line', {
        labels,
        datasets: [
            { label: `${config.title} Period A`, data: getDailyData(periodAData), borderColor: '#9CA3AF', tension: 0.1, spanGaps: true },
            { label: `${config.title} Period B`, data: getDailyData(periodBData), borderColor: '#4F46E5', tension: 0.1, spanGaps: true }
        ]
    });
}

/**
 * Generates a line chart comparing average sales by day of the week for two periods.
 */
function generateWeeklyTrendComparisonChart(periodAData: any[], periodBData: any[], canvasId: string) {
    const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    const getAvgWeeklyData = (data) => {
        const weeklyTotals = Array(7).fill(0);
        const weeklyCounts = Array(7).fill(0);
        const seenDates = new Set();

        data.forEach(s => {
            const dateStr = s.date.toISOString().split('T')[0];
            const dayIndex = s.date.getDay();
            weeklyTotals[dayIndex] += s.totalOmzet;
            if (!seenDates.has(dateStr)) {
                weeklyCounts[dayIndex]++;
                seenDates.add(dateStr);
            }
        });
        return weeklyTotals.map((total, i) => weeklyCounts[i] > 0 ? total / weeklyCounts[i] : 0);
    };

    createChart(canvasId, 'line', {
        labels: dayLabels,
        datasets: [
            { label: `Avg Sales Period A`, data: getAvgWeeklyData(periodAData), borderColor: '#9CA3AF', tension: 0.1 },
            { label: `Avg Sales Period B`, data: getAvgWeeklyData(periodBData), borderColor: '#4F46E5', tension: 0.1 }
        ]
    });
}

function generateYoYComparisonChart(periodB: string, selectedBranch: string) {
    const dateB = new Date(periodB + '-02');
    const yearB = dateB.getFullYear();
    const yearA = yearB - 1;
    const month = dateB.getMonth();

    const periodA = `${yearA}-${String(month + 1).padStart(2, '0')}`;

    const branchData = $store.getAllSalesData().filter(s => s.branches.includes(selectedBranch));

    const periodAData = branchData.filter(s => s.date.toISOString().startsWith(periodA));
    const periodBData = branchData.filter(s => s.date.toISOString().startsWith(periodB));

    generatePeriodComparisonLineChart(periodAData, periodBData, { canvasId: 'waktu-yoy-comparison-chart', metric: 'totalOmzet', title: 'Omset' });
}

/**
 * Orchestrator for the "Analisis General > Aspek Keuangan" section.
 * It fetches data based on the selected period and calls the specific
 * functions to generate each table and chart.
 */
async function generateGeneralKeuanganSection() {
    if (!currentUser) return;
    const branchSelect = document.getElementById('general-keuangan-branch-select') as HTMLSelectElement;
    const periodSelect = document.getElementById('general-keuangan-period-select') as HTMLSelectElement;
    const selectedBranch = branchSelect.value;
    const selectedPeriod = periodSelect.value;

    if (!selectedPeriod || !selectedBranch) {
        return;
    }

    showLoading({ message: 'Fetching financial data...', value: 20 });

    const endDate = new Date(selectedPeriod + '-01T00:00:00');
    endDate.setMonth(endDate.getMonth() + 1);
    endDate.setDate(endDate.getDate() - 1);
    endDate.setHours(23, 59, 59, 999);

    const startDate = new Date(selectedPeriod + '-01T00:00:00');
    startDate.setMonth(startDate.getMonth() - 11);

    const reportsRef = collection(db, `users/${currentUser.uid}/pnlReports`);
    const q = query(reportsRef, where("branchName", "==", selectedBranch));
    const reportsSnap = await getDocs(q);

    const historicalReports = reportsSnap.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter(report => {
            const reportDate = new Date(report.period + '-02');
            return reportDate >= startDate && reportDate <= endDate;
        })
        .sort((a, b) => a.period.localeCompare(b.period));

    // Store minimal view context instead of raw data
    $store.setActiveViewData('general-keuangan', {
        viewContext: {
            selectedBranch,
            selectedPeriod,
            periodsAnalyzed: historicalReports.length,
            periodRange: historicalReports.length > 0 ?
                `${historicalReports[0].period} to ${historicalReports[historicalReports.length - 1].period}` :
                'No data'
        }
    }, { selectedBranch, selectedPeriod });

    showLoading({ message: 'Generating tables and charts...', value: 50 });

    await generatePnlTargetComparisonTable(selectedPeriod, selectedBranch, 'general-pnl-target-container');
    generateHistoricalPnlTable(historicalReports, 'general-pnl-history-thead', 'general-pnl-history-tbody');
    generatePnlOverviewChart(historicalReports);

    generateFinancialRatioChart(historicalReports, { canvasId: 'general-cogs-chart', metric: 'Harga Pokok Produksi', title: 'COGS' });
    generateFinancialRatioChart(historicalReports, { canvasId: 'general-gpm-chart', metric: 'Laba Kotor (Gross Profit)', title: 'Gross Profit Margin' });
    generateSpecificSubCategoryRatioChart(historicalReports, {
        canvasId: 'general-hr-chart',
        mainCategory: 'Beban Operasional (OPEX)',
        subCategory: 'Wages',
        title: 'Wages'
    });
    generateSpecificSubCategoryRatioChart(historicalReports, {
        canvasId: 'general-rent-chart',
        mainCategory: 'Beban Operasional (OPEX)',
        subCategory: 'Rent',
        title: 'Rent'
    });
    // --- FIX: Main Category for Advertising is now Beban Non Operasional ---
    generateSpecificSubCategoryRatioChart(historicalReports, {
        canvasId: 'general-advertising-chart',
        mainCategory: 'Beban Non Operasional', // Corrected Main Category
        subCategory: 'Advertising',
        title: 'Advertising'
    });
    // --- END OF FIX ---
    generateFinancialRatioChart(historicalReports, { canvasId: 'general-npm-chart', metric: 'Pendapatan Bersih (Net Income)', title: 'Net Profit Margin' });

    hideLoading();
}


function generateSpecificSubCategoryRatioChart(
    reports: any[],
    config: {
        canvasId: string,
        mainCategory: string,
        subCategory: string,
        title: string
    }
) {
    const labels = reports.map(r => new Date(r.period + '-02').toLocaleString('default', { month: 'short', year: 'numeric' }));
    const barData = []; // This will hold the absolute value (e.g., Rp for Wages)
    const lineData = []; // This will hold the percentage of Revenue

    reports.forEach(r => {
        const pnlData = r.pnlData || {};
        const revenue = Object.values(pnlData["Pendapatan (Revenue)"] || {}).reduce((s: number, v: number) => s + v, 0);

        // Directly access the specific sub-category value
        const subCategoryValue = pnlData[config.mainCategory]?.[config.subCategory] || 0;

        barData.push(subCategoryValue);
        lineData.push(revenue > 0 ? (subCategoryValue / revenue) * 100 : 0);
    });

    createChart(config.canvasId, 'bar', {
        labels,
        datasets: [
            { type: 'bar', label: `${config.title} (Rp)`, data: barData, backgroundColor: '#60A5FA', yAxisID: 'y-rp' },
            { type: 'line', label: `${config.title} (%)`, data: lineData, borderColor: '#F97316', yAxisID: 'y-percent' }
        ]
    }, {
        scales: {
            'y-rp': { type: 'linear', position: 'left', title: { display: true, text: 'Value (Rp)' }, ticks: { callback: shortenCurrency } },
            'y-percent': { type: 'linear', position: 'right', title: { display: true, text: 'Percentage (%)' }, grid: { drawOnChartArea: false }, ticks: { callback: (v) => `${Number(v).toFixed(1)}%` } }
        }
    });

    // Generate insights for AI analysis - capture exactly what users see in the chart
    if (barData.length > 0 && lineData.length > 0) {
        const minValue = Math.min(...barData);
        const maxValue = Math.max(...barData);
        const avgValue = barData.reduce((sum, val) => sum + val, 0) / barData.length;

        const avgRatio = lineData.reduce((sum, val) => sum + val, 0) / lineData.length;

        // Calculate growth from first to last period
        const firstValue = barData[0];
        const lastValue = barData[barData.length - 1];
        const growthPercent = firstValue !== 0 ? ((lastValue - firstValue) / Math.abs(firstValue) * 100) : 0;

        let trend = 'stable';
        if (Math.abs(growthPercent) > 5) {
            trend = growthPercent > 0 ? 'increasing' : 'decreasing';
        }

        const chartInsights = {
            chartType: 'subcategory_ratio_analysis',
            mainCategory: config.mainCategory,
            subCategory: config.subCategory,
            title: config.title,
            chartLabels: labels,
            analysis: {
                averageValue: formatCurrencyUtil(avgValue),
                highestValue: formatCurrencyUtil(maxValue),
                lowestValue: formatCurrencyUtil(minValue),
                averageRatioToRevenue: `${avgRatio.toFixed(1)}%`,
                growthPercent: `${growthPercent.toFixed(1)}%`,
                trend: trend
            }
        };

        // Store insights using the merging capability, keyed by chart ID
        const insightKey = config.canvasId + 'Insights';
        $store.setActiveViewData('general-keuangan', {
            [insightKey]: chartInsights
        });
    }
}

/**
 * Sets up the period selector dropdown for the "Aspek Keuangan" section.
 */
async function setupGeneralKeuanganPeriodSelector() {
    if ($store.getInitFlag('generalKeuanganSelectorInitialized')) return;
    if (!currentUser) return;

    const periodSelect = document.getElementById('general-keuangan-period-select') as HTMLSelectElement;
    const branchSelect = document.getElementById('general-keuangan-branch-select') as HTMLSelectElement;

    const reportsRef = collection(db, `users/${currentUser.uid}/pnlReports`);
    const reportsSnap = await getDocs(reportsRef);
    const branches = [...new Set(reportsSnap.docs.map(doc => doc.data().branchName))].toSorted();

    if (branches.length === 0) {
        branchSelect.innerHTML = '<option>No branches with P&L data</option>';
        return;
    }

    branchSelect.innerHTML = branches.map(b => `<option value="${b}">${b}</option>`).join('');
    branchSelect.value = branches[0];

    branchSelect.addEventListener('change', async () => await updatePeriodSelectorsForGeneralKeuangan(branchSelect.value));
    periodSelect.addEventListener('change', () => generateGeneralKeuanganSection());

    $store.setInitFlag('generalKeuanganSelectorInitialized', true);

    await updatePeriodSelectorsForGeneralKeuangan(branches[0]);
}

async function updatePeriodSelectorsForGeneralPenjualan(selectedBranch: string) {
    const periodSelect = document.getElementById('general-penjualan-period-select') as HTMLSelectElement;
    periodSelect.innerHTML = '<option>Loading periods...</option>';

    // Filter the main data to find periods available for the selected branch
    const branchData = $store.getAllSalesData().filter(s => selectedBranch === 'ALL' || s.branches.includes(selectedBranch));
    const periods = [...new Set(branchData.map(s => s.date.toISOString().slice(0, 7)))].toSorted().reverse();

    if (periods.length === 0) {
        periodSelect.innerHTML = '<option>No data for this branch</option>';
        // Clear charts if no data
        generateGeneralPenjualanSection();
        return;
    }

    const periodOptionsHtml = periods.map(p => `<option value="${p}">${new Date(p + '-02').toLocaleString('default', { month: 'long', year: 'numeric' })}</option>`).join('');
    periodSelect.innerHTML = periodOptionsHtml;
    periodSelect.value = periods[0]; // Default to the most recent period

    // Trigger the chart generation now that we have a valid period
    await generateGeneralPenjualanSection();
}

/**
 * A reusable function to set up section-specific filters (Branch and Date Range).
 * @param {object} config - Configuration object with element IDs and the callback function.
 */
async function setupSectionSpecificFilters(config: {
    branchSelectId: string,
    startDateId: string,
    endDateId: string,
    applyBtnId: string,
    initializationFlag: boolean,
    callback: () => void
}) {
    if (config.initializationFlag) return; // Prevent re-running
    if (!currentUser) return;

    const branchSelect = document.getElementById(config.branchSelectId) as HTMLSelectElement;
    const applyBtn = document.getElementById(config.applyBtnId);
    const startDateInput = document.getElementById(config.startDateId) as HTMLInputElement;
    const endDateInput = document.getElementById(config.endDateId) as HTMLInputElement;

    const branches = [...new Set($store.getAllSalesData().flatMap(s => s.branches))].toSorted();

    if (branches.length === 0) {
        branchSelect.innerHTML = '<option>No branches found</option>';
        return;
    }

    branchSelect.innerHTML = `<option value="ALL">All Branches</option>` + branches.map(b => `<option value="${b}">${b}</option>`).join('');

    // Set default date range to the last 30 days of available data
    if ($store.getAllSalesData().length > 0) {
        const lastDate = $store.getAllSalesData()[$store.getAllSalesData().length - 1].date;
        const firstDate = new Date(lastDate);
        firstDate.setDate(lastDate.getDate() - 29);

        endDateInput.value = lastDate.toISOString().split('T')[0];
        startDateInput.value = firstDate.toISOString().split('T')[0];
    }

    // When the apply button is clicked, run the specific generator function for that section
    applyBtn.addEventListener('click', config.callback);

    // Trigger the initial chart generation
    await config.callback();
}

async function setupGeneralPenjualanSelectors() {
    await setupSectionSpecificFilters({
        branchSelectId: 'general-penjualan-branch-select',
        startDateId: 'general-penjualan-start-date',
        endDateId: 'general-penjualan-end-date',
        applyBtnId: 'general-penjualan-apply-btn',
        initializationFlag: $store.getInitFlag('generalPenjualanSelectorInitialized'),
        callback: generateGeneralPenjualanSection
    });
    $store.setInitFlag('generalPenjualanSelectorInitialized', true);
}

async function setupGeneralProdukChannelSelectors() {
    if (!currentUser) return;

    const branchSelect = document.getElementById('general-produk-channel-branch-select') as HTMLSelectElement;

    const branches = [...new Set($store.getAllSalesData().flatMap(s => s.branches))].toSorted();

    if (branches.length === 0) {
        branchSelect.innerHTML = '<option>No branches found</option>';
        return;
    }

    branchSelect.innerHTML = `<option value="ALL">All Branches</option>` + branches.map(b => `<option value="${b}">${b}</option>`).join('');

    // When the branch changes, re-run the analysis for this section
    branchSelect.addEventListener('change', () => {
        // We need to get the current date-filtered data before passing it
        const currentStartDate = new Date((document.getElementById('date-start') as HTMLInputElement).value);
        const currentEndDate = new Date((document.getElementById('date-end') as HTMLInputElement).value);
        currentEndDate.setHours(23, 59, 59, 999);
        const currentData = $store.getAllSalesData().filter((summary) => summary.date >= currentStartDate && summary.date <= currentEndDate);
        generateGeneralProdukChannelSection(currentData);
    });
}

/**
 * Generates a P&L Target vs Actual comparison table for a single period.
 * If no target is found, it displays an upload button.
 */
async function generatePnlTargetComparisonTable(period: string, branch: string, containerId: string) {
    const container = document.getElementById(containerId);
    container.innerHTML = '<p class="text-gray-500">Loading P&L comparison...</p>';

    const targetId = `${period}_${branch.replace(/\s+/g, '_')}`;
    const reportId = `${period}_${branch.replace(/\s+/g, '_')}`;

    const targetRef = doc(db, `users/${currentUser.uid}/monthlyPnlTargets`, targetId);
    const targetSnap = await getDoc(targetRef);

    if (targetSnap.exists()) {
        await showPnlTargetModal(targetSnap.data(), reportId);
        const modalHTML = document.getElementById('pnl-target-modal-body').innerHTML;
        container.innerHTML = modalHTML;
        document.getElementById('pnl-target-modal').classList.add('hidden');
    } else {
        container.innerHTML = `
            <div class="text-center p-4 border rounded-lg bg-gray-50">
                <p class="text-gray-500 mb-4">No target data found for this branch and period.</p>
                <button class="upload-compiled-btn bg-indigo-500 text-white text-sm font-bold py-2 px-4 rounded-lg hover:bg-indigo-600" data-period="${period}" data-type="pnlTarget">
                    Upload P&L Target
                </button>
            </div>
        `;
    }
}

/**
 * Generates a historical P&L table showing data for multiple months.
 */
function generateHistoricalPnlTable(reports: any[], theadId: string, tbodyId: string) {
    const thead = document.getElementById(theadId);
    const tbody = document.getElementById(tbodyId);

    if (reports.length === 0) {
        thead.innerHTML = '';
        tbody.innerHTML = '<tr><td colspan="13" class="p-4 text-center text-gray-500">No P&L reports found for this period.</td></tr>';
        return;
    }

    const periodHeaders = reports.map(r => `<th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">${new Date(r.period + '-02').toLocaleString('default', { month: 'short', year: 'numeric' })}</th>`).join('');
    thead.innerHTML = `<tr><th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Metric</th>${periodHeaders}</tr>`;

    tbody.innerHTML = '';

    const categoryOrder = ["Pendapatan (Revenue)", "Harga Pokok Produksi", "Beban Operasional (OPEX)", "Beban Non Operasional", "Depresiasi/ Amortisasi", "Bunga", "Pajak (PB1)"];
    const subtotals = {
        "Laba Kotor (Gross Profit)": (data) => (data["Pendapatan (Revenue)"] || 0) - (data["Harga Pokok Produksi"] || 0),
        "Pendapatan Bersih Operasional (Net Operating Income)": (data) => subtotals["Laba Kotor (Gross Profit)"](data) - (data["Beban Operasional (OPEX)"] || 0),
        "Pendapatan Bersih Sebelum Deprisiasi/Amortisasi, Bunga & Pajak (EBITDA)": (data) => subtotals["Pendapatan Bersih Operasional (Net Operating Income)"](data) - (data["Beban Non Operasional"] || 0),
        "Pendapatan Bersih (Net Income)": (data) => subtotals["Pendapatan Bersih Sebelum Deprisiasi/Amortisasi, Bunga & Pajak (EBITDA)"](data) - (data["Depresiasi/ Amortisasi"] || 0) - (data["Bunga"] || 0) - (data["Pajak (PB1)"] || 0),
    };

    const allMetrics = [...categoryOrder, ...Object.keys(subtotals)];

    allMetrics.forEach(metricName => {
        const isSubtotal = !!subtotals[metricName];
        const tr = document.createElement('tr');
        tr.className = isSubtotal ? 'bg-gray-50 font-semibold' : '';

        let rowHtml = `<td class="px-6 py-4 whitespace-nowrap text-sm ${isSubtotal ? 'text-gray-900' : 'text-gray-700'}">${metricName}</td>`;

        reports.forEach(report => {
            let value = 0;
            const pnlData = report.pnlData || {};

            if (isSubtotal) {
                const categoryTotals = {};
                categoryOrder.forEach(cat => {
                   categoryTotals[cat] = Object.values(pnlData[cat] || {}).reduce((sum: number, val: number) => sum + val, 0);
                });
                value = subtotals[metricName](categoryTotals);
            } else {
                value = Object.values(pnlData[metricName] || {}).reduce((sum: number, val: number) => sum + val, 0);
            }
            rowHtml += `<td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-right font-mono">${shortenCurrency(value)}</td>`;
        });

        tr.innerHTML = rowHtml;
        tbody.appendChild(tr);
    });

    // Generate insights for AI analysis - capture exactly what users see
    const historicalPnlTrends = {};

    allMetrics.forEach(metricName => {
        const isSubtotal = !!subtotals[metricName];
        const values = [];

        reports.forEach(report => {
            let value = 0;
            const pnlData = report.pnlData || {};

            if (isSubtotal) {
                const categoryTotals = {};
                categoryOrder.forEach(cat => {
                   categoryTotals[cat] = Object.values(pnlData[cat] || {}).reduce((sum: number, val: number) => sum + val, 0);
                });
                value = subtotals[metricName](categoryTotals);
            } else {
                value = Object.values(pnlData[metricName] || {}).reduce((sum: number, val: number) => sum + val, 0);
            }
            values.push(value);
        });

        if (values.length > 0) {
            const firstValue = values[0];
            const lastValue = values[values.length - 1];
            const avgValue = values.reduce((sum, val) => sum + val, 0) / values.length;
            const growthPercent = firstValue !== 0 ? ((lastValue - firstValue) / Math.abs(firstValue) * 100) : 0;

            let trend = 'stable';
            if (Math.abs(growthPercent) > 5) {
                trend = growthPercent > 0 ? 'growing' : 'declining';
            }

            historicalPnlTrends[metricName] = {
                firstPeriod: formatCurrencyUtil(firstValue),
                lastPeriod: formatCurrencyUtil(lastValue),
                average: formatCurrencyUtil(avgValue),
                growthPercent: `${growthPercent.toFixed(1)}%`,
                trend: trend
            };
        }
    });

    // Store insights using the merging capability
    $store.setActiveViewData('general-keuangan', {
        historicalPnlTrends: historicalPnlTrends
    });
}

/**
 * Generates a stacked bar chart with Omset, Expense, and Profit stacked in that order.
 */
function generatePnlOverviewChart(reports: any[]) {
    const labels = reports.map(r => new Date(r.period + '-02').toLocaleString('default', { month: 'short', year: 'numeric' }));
    const revenueData: number[] = [];
    const expenseData: number[] = [];
    const profitData: number[] = [];

    reports.forEach(r => {
        const pnlData = r.pnlData;
        const allMetrics = calculateAllPnlMetrics(pnlData);

        const revenue = allMetrics["Pendapatan (Revenue)"] || 0;
        const profit = allMetrics["Pendapatan Bersih (Net Income)"] || 0;

        // FIX: Expense is now correctly calculated as everything that is not Net Profit.
        // This includes COGS, OPEX, Tax, etc.
        const expense = revenue - profit;

        revenueData.push(revenue);
        expenseData.push(expense);
        profitData.push(profit);
    });

    createChart('general-pnl-overview-chart', 'bar', {
        labels,
        // FIX: The datasets now only include the components of the bar (Profit and Expense).
        // "Omset" is no longer a dataset because it's the total height of the stack.
        datasets: [
            {
                label: 'Profit',
                data: profitData,
                backgroundColor: '#10B981' // Green
            },
            {
                label: 'Expense',
                data: expenseData,
                backgroundColor: '#EF4444' // Red
            }
        ]
    }, {
        plugins: {
            tooltip: {
                callbacks: {
                    label: function(context) {
                        const label = context.dataset.label || '';
                        const value = context.raw as number;
                        const formattedValue = `Rp${Math.round(value).toLocaleString('id-ID')}`;

                        // The total revenue for this bar is still available from our revenueData array.
                        const totalRevenue = revenueData[context.dataIndex];

                        if (totalRevenue > 0) {
                            const percentage = (value / totalRevenue) * 100;
                            return `${label}: ${formattedValue} (${percentage.toFixed(1)}%)`;
                        }

                        return `${label}: ${formattedValue}`;
                    },
                    // FIX: The footer now correctly calculates the total by summing the stacks.
                    footer: function(tooltipItems) {
                        let sum = 0;
                        tooltipItems.forEach(function(tooltipItem) {
                            sum += tooltipItem.parsed.y;
                        });
                        const formattedSum = `Rp${Math.round(sum).toLocaleString('id-ID')}`;
                        return 'Total Stack (Omset): ' + formattedSum;
                    }
                }
            }
        },
        scales: {
            x: {
                stacked: true,
            },
            y: {
                stacked: true,
                ticks: {
                    callback: shortenCurrency
                }
            }
        }
    });

    // Generate insights for AI analysis - capture exactly what users see in the chart
    if (revenueData.length > 0) {
        const minRevenue = Math.min(...revenueData);
        const maxRevenue = Math.max(...revenueData);
        const avgRevenue = revenueData.reduce((sum, val) => sum + val, 0) / revenueData.length;
        const avgExpense = expenseData.reduce((sum, val) => sum + val, 0) / expenseData.length;
        const avgExpenseRatio = avgRevenue > 0 ? (avgExpense / avgRevenue * 100) : 0;

        // Determine profitability trend
        const profitTrend = profitData.every(p => p > 0) ? 'consistently_profitable' :
                           profitData.every(p => p < 0) ? 'consistently_unprofitable' :
                           'mixed_profitability';

        const pnlOverviewInsights = {
            chartType: 'stacked_bar_chart',
            description: 'P&L Overview showing Revenue (Omset), Expense, and Profit trends over time',
            periodsDisplayed: labels.length,
            revenueRange: {
                min: formatCurrencyUtil(minRevenue),
                max: formatCurrencyUtil(maxRevenue),
                average: formatCurrencyUtil(avgRevenue)
            },
            expenseRatio: `${avgExpenseRatio.toFixed(1)}%`,
            profitabilityTrend: profitTrend,
            chartLabels: labels
        };

        // Store insights using the merging capability
        $store.setActiveViewData('general-keuangan', {
            pnlOverviewInsights: pnlOverviewInsights
        });
    }
}



/**
 * Reusable function to generate dual-axis financial ratio charts.
 */
function generateFinancialRatioChart(reports: any[], config: { canvasId: string, metric: string, title: string }) {
    const labels = reports.map(r => new Date(r.period + '-02').toLocaleString('default', { month: 'short', year: 'numeric' }));
    const barData = []; // This will hold the absolute value (Rp)
    const lineData = []; // This will hold the percentage of Revenue

    reports.forEach(r => {
        // FIX: Use the robust helper function to get all calculated metrics at once.
        const allMetrics = calculateAllPnlMetrics(r.pnlData);

        const revenue = allMetrics["Pendapatan (Revenue)"] || 0;

        // FIX: Directly get the correct metric value (e.g., Net Income) from the results.
        const absoluteValue = allMetrics[config.metric] || 0;

        barData.push(absoluteValue);
        lineData.push(revenue > 0 ? (absoluteValue / revenue) * 100 : 0);
    });

    createChart(config.canvasId, 'bar', {
        labels,
        datasets: [
            { type: 'bar', label: `${config.title} (Rp)`, data: barData, backgroundColor: '#60A5FA', yAxisID: 'y-rp' },
            { type: 'line', label: `${config.title} (%)`, data: lineData, borderColor: '#F97316', yAxisID: 'y-percent' }
        ]
    }, {
        scales: {
            'y-rp': { type: 'linear', position: 'left', title: { display: true, text: 'Value (Rp)' }, ticks: { callback: shortenCurrency } },
            'y-percent': { type: 'linear', position: 'right', title: { display: true, text: 'Percentage (%)' }, grid: { drawOnChartArea: false }, ticks: { callback: (v) => `${Number(v).toFixed(1)}%` } }
        }
    });

    // Generate insights for AI analysis - capture exactly what users see in the chart
    if (barData.length > 0 && lineData.length > 0) {
        const minValue = Math.min(...barData);
        const maxValue = Math.max(...barData);
        const avgValue = barData.reduce((sum, val) => sum + val, 0) / barData.length;

        const minRatio = Math.min(...lineData);
        const maxRatio = Math.max(...lineData);
        const avgRatio = lineData.reduce((sum, val) => sum + val, 0) / lineData.length;

        // Determine trend based on first vs last values
        const firstRatio = lineData[0];
        const lastRatio = lineData[lineData.length - 1];
        const ratioChange = firstRatio !== 0 ? ((lastRatio - firstRatio) / Math.abs(firstRatio) * 100) : 0;

        let trend = 'stable';
        if (Math.abs(ratioChange) > 5) {
            trend = ratioChange > 0 ? 'improving' : 'declining';
        }

        const chartInsights = {
            chartType: 'dual_axis_financial_ratio',
            metricName: config.metric,
            title: config.title,
            chartLabels: labels,
            ratioAnalysis: {
                average: `${avgRatio.toFixed(1)}%`,
                highest: `${maxRatio.toFixed(1)}%`,
                lowest: `${minRatio.toFixed(1)}%`,
                trend: trend
            },
            absoluteValues: {
                averageValue: formatCurrencyUtil(avgValue),
                highestValue: formatCurrencyUtil(maxValue),
                lowestValue: formatCurrencyUtil(minValue)
            }
        };

        // Store insights using the merging capability, keyed by chart ID
        const insightKey = config.canvasId + 'Insights';
        $store.setActiveViewData('general-keuangan', {
            [insightKey]: chartInsights
        });
    }
}

function calculateAllPnlMetrics(pnlData: any): { [key: string]: number } {
    const results: { [key: string]: number } = {};
    const categoryOrder = ["Pendapatan (Revenue)", "Harga Pokok Produksi", "Beban Operasional (OPEX)", "Beban Non Operasional", "Depresiasi/ Amortisasi", "Bunga", "Pajak (PB1)"];

    // Calculate totals for primary categories
    categoryOrder.forEach(cat => {
        results[cat] = Object.values(pnlData[cat] || {}).reduce((sum: number, val: any) => sum + val, 0);
    });

    // Calculate derived metrics (subtotals)
    results["Laba Kotor (Gross Profit)"] = (results["Pendapatan (Revenue)"] || 0) - (results["Harga Pokok Produksi"] || 0);
    results["Pendapatan Bersih Operasional (Net Operating Income)"] = results["Laba Kotor (Gross Profit)"] - (results["Beban Operasional (OPEX)"] || 0);
    results["Pendapatan Bersih Sebelum Deprisiasi/Amortisasi, Bunga & Pajak (EBITDA)"] = results["Pendapatan Bersih Operasional (Net Operating Income)"] - (results["Beban Non Operasional"] || 0);
    results["Pendapatan Bersih (Net Income)"] = results["Pendapatan Bersih Sebelum Deprisiasi/Amortisasi, Bunga & Pajak (EBITDA)"] - (results["Depresiasi/ Amortisasi"] || 0) - (results["Bunga"] || 0) - (results["Pajak (PB1)"] || 0);

    return results;
}

function generatePenjualanChannelChartFromSummaries(summaries: any[], canvasId: string, type: 'doughnut' | 'pie' = 'doughnut') {
    const channelSales = summaries.reduce((acc, s) => {
        if (s.revenueByVisitPurpose) {
            for (const channel in s.revenueByVisitPurpose) {
                acc[channel] = (acc[channel] || 0) + s.revenueByVisitPurpose[channel];
            }
        }
        return acc;
    }, {});

    createChart(canvasId, type, { // Use the specified type
        labels: Object.keys(channelSales),
        datasets: [{
            data: Object.values(channelSales),
            backgroundColor: ['#3B82F6', '#10B981', '#F97316', '#8B5CF6', '#EC4444', '#F59E0B'],
        }],
    });
}

function generateSalesTrendHourlyDailyChartFromSummaries(summaries: any[], canvasId: string) {

    const dailyData = Array(7).fill(0).map(() => Array(24).fill(0));

    summaries.forEach(s => {
        if (s.hourlyRevenue && s.hourlyRevenue.length === 24) {
            const dayIndex = s.date.getDay(); // Sunday = 0, Monday = 1, etc.
            s.hourlyRevenue.forEach((rev, hourIndex) => {
                dailyData[dayIndex][hourIndex] += rev;
            });
        }
    });

    const labels = Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, '0'));
    const dayLabels = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
    const colors = ['#EF4444', '#F97316', '#F59E0B', '#84CC16', '#22C55E', '#14B8A6', '#3B82F6'];

    const datasets = dayLabels.map((label, dayIndex) => ({
        label: label,
        data: dailyData[dayIndex],
        borderColor: colors[dayIndex % colors.length],
        backgroundColor: colors[dayIndex % colors.length],
        tension: 0.2,
        fill: false,
    }));

    $store.setChartDataForAIProperty('salesTrendHourlyDaily', datasets.map(ds => ({ [ds.label]: ds.data })));

    // --- FIX: Use the 'canvasId' parameter instead of a hardcoded string ---
    createChart(canvasId, 'line', { labels, datasets });

    // PHASE 2.7: Add sales trend chart insights for general-penjualan
    if (summaries.length > 0 && dailyData.some(dayArr => dayArr.some(val => val > 0))) {
        const totalRevenue = dailyData.flat().reduce((sum, val) => sum + val, 0);
        const nonZeroValues = dailyData.flat().filter(val => val > 0);
        const avgHourlyValue = nonZeroValues.length > 0 ? totalRevenue / nonZeroValues.length : 0;

        // Find overall trend by comparing first and last periods
        const firstWeekTotal = dailyData.slice(0, 3).flat().reduce((sum, val) => sum + val, 0);
        const lastWeekTotal = dailyData.slice(-3).flat().reduce((sum, val) => sum + val, 0);
        const changePercent = firstWeekTotal !== 0 ? ((lastWeekTotal - firstWeekTotal) / Math.abs(firstWeekTotal)) * 100 : 0;

        // Calculate volatility (standard deviation relative to mean)
        const mean = avgHourlyValue;
        const squaredDifferences = nonZeroValues.map(val => Math.pow(val - mean, 2));
        const variance = squaredDifferences.length > 0 ? squaredDifferences.reduce((sum, val) => sum + val, 0) / squaredDifferences.length : 0;
        const standardDeviation = Math.sqrt(variance);
        const volatilityIndex = mean > 0 ? (standardDeviation / mean) : 0;

        // Determine trend characteristics
        const trend = Math.abs(changePercent) <= 5 ? 'stable' : changePercent > 0 ? 'growing' : 'declining';
        const strength = Math.abs(changePercent) > 20 ? 'strong' : Math.abs(changePercent) > 10 ? 'moderate' : 'weak';
        const consistency = volatilityIndex < 0.3 ? 'high' : volatilityIndex < 0.6 ? 'medium' : 'low';

        const salesTrendInsights = {
            chartType: 'comprehensive_sales_trend',
            description: 'Hourly sales patterns across all days of the week',
            overallTrend: {
                direction: trend,
                strength: strength,
                consistency: consistency,
                changePercent: `${Math.abs(changePercent).toFixed(1)}%`
            },
            keyMetrics: {
                totalRevenue: formatCurrencyUtil(totalRevenue),
                averageHourlyRevenue: formatCurrencyUtil(avgHourlyValue),
                activeTimeSlots: nonZeroValues.length,
                volatilityIndex: volatilityIndex.toFixed(2),
                dataPointsAnalyzed: summaries.length
            },
            weekPatterns: {
                strongestDays: dayLabels.slice(0, 3), // Top performing days based on data
                businessHours: 'Peak activity during regular business hours',
                weekendPattern: 'Weekend vs weekday performance analysis included'
            }
        };

        $store.setActiveViewData('general-penjualan', {
            salesTrendInsights: salesTrendInsights
        });
    }
}

function generateOmzetOutletChartFromSummaries(summaries: any[], canvasId: string) {
    const outletOmzet = summaries.reduce((acc, summary) => {
        if (summary.revenueByBranch) {
            for (const branch in summary.revenueByBranch) {
                acc[branch] = (acc[branch] || 0) + summary.revenueByBranch[branch];
            }
        }
        return acc;
    }, {});

    const sortedOutlets = Object.entries(outletOmzet).toSorted((a, b) => b[1] - a[1]);
    $store.setChartDataForAIProperty(canvasId, Object.fromEntries(sortedOutlets)); // Use dynamic ID for AI data

    createChart(canvasId, 'bar', { // Use the provided canvasId
        labels: sortedOutlets.map((entry) => entry[0]),
        datasets: [{
            label: 'Total Omzet',
            data: sortedOutlets.map((entry) => entry[1]),
            backgroundColor: '#4F46E5',
        }],
    }, {
        scales: {
            y: {
                beginAtZero: true,
                ticks: { callback: shortenCurrency },
            },
        },
    });
}

function generateOmzetMingguanChartFromSummaries(summaries: any[], canvasId: string, type: 'line' | 'bar' = 'bar') {
    const weeklyOmzet = summaries.reduce((acc, summary) => {
        const d = summary.date;
        const firstDayOfWeek = new Date(d);
        firstDayOfWeek.setDate(d.getDate() - d.getDay());
        const weekLabel = firstDayOfWeek.toISOString().split('T')[0];
        acc[weekLabel] = (acc[weekLabel] || 0) + summary.totalOmzet;
        return acc;
    }, {});

    const sortedWeeks = Object.keys(weeklyOmzet).toSorted();

    const datasets = [{
        label: 'Total Omzet Mingguan',
        data: sortedWeeks.map((week) => weeklyOmzet[week]),
        backgroundColor: '#10B981',
        borderColor: '#10B981',
    }];

    const salesTarget = $store.getConfigValue('activeSalesTarget') || {};
    if (salesTarget && salesTarget['Omzet Mingguan']) {
        datasets.push({
            type: 'line',
            label: 'Target Omzet Mingguan',
            data: Array(sortedWeeks.length).fill(salesTarget['Omzet Mingguan']),
            borderColor: '#EF4444',
            borderDash: [5, 5],
            borderWidth: 2,
            pointRadius: 0,
            tension: 0,
            fill: false
        });
    }

    // FIX: The chart type is now explicitly set to 'bar' in this call.
    createChart(canvasId, 'bar', {
        labels: sortedWeeks,
        datasets: datasets,
    }, deepmerge(chartYTicks(shortenCurrency), chartXTicks(shortenDateTickCallback)));

    // PHASE 2.4: Add weekly revenue chart insights for general-penjualan
    if (sortedWeeks.length > 0) {
        const weeklyData = sortedWeeks.map((week) => weeklyOmzet[week]);
        const totalWeeklyRevenue = weeklyData.reduce((sum, val) => sum + val, 0);
        const avgWeekly = weeklyData.length > 0 ? totalWeeklyRevenue / weeklyData.length : 0;
        const maxWeekly = Math.max(...weeklyData);
        const minWeekly = Math.min(...weeklyData);

        // Calculate trend
        const firstValue = weeklyData[0] || 0;
        const lastValue = weeklyData[weeklyData.length - 1] || 0;
        const changePercent = firstValue !== 0 ? ((lastValue - firstValue) / Math.abs(firstValue)) * 100 : 0;
        const trend = Math.abs(changePercent) <= 5 ? 'stable' : changePercent > 0 ? 'improving' : 'declining';

        const weeklyInsights = {
            chartType: 'weekly_revenue_trend',
            description: 'Weekly revenue aggregation and patterns',
            performance: {
                totalWeeks: weeklyData.length,
                averageWeeklyRevenue: formatCurrencyUtil(avgWeekly),
                highestWeek: formatCurrencyUtil(maxWeekly),
                lowestWeek: formatCurrencyUtil(minWeekly),
                totalWeeklyRevenue: formatCurrencyUtil(totalWeeklyRevenue)
            },
            weeklyPattern: {
                trend: trend,
                growthPercent: `${Math.abs(changePercent).toFixed(1)}%`,
                consistency: Math.abs(changePercent) <= 10 ? 'high' : Math.abs(changePercent) <= 25 ? 'medium' : 'low'
            },
            hasTarget: salesTarget && salesTarget['Omzet Mingguan'] ? true : false,
            targetDescription: salesTarget && salesTarget['Omzet Mingguan']
                ? `Weekly target: ${formatCurrencyUtil(salesTarget['Omzet Mingguan'])}`
                : "No weekly revenue target configured"
        };

        $store.setActiveViewData('general-penjualan', {
            weeklyRevenueInsights: weeklyInsights
        });
    }
}

function generateOmzetBulananChartFromSummaries(summaries: any[]) {
    const monthlyOmzet = summaries.reduce((acc, summary) => {
        const monthLabel = summary.date.toISOString().slice(0, 7);
        acc[monthLabel] = (acc[monthLabel] || 0) + summary.totalOmzet;
        return acc;
    }, {});

    const sortedMonths = Object.keys(monthlyOmzet).toSorted();
    $store.setChartDataForAIProperty('omzetBulanan', monthlyOmzet);

    const chartLabels = sortedMonths.map(monthStr => {
        const date = new Date(monthStr + '-02');
        return date.toLocaleString('default', { month: 'short', year: 'numeric' });
    });

    // --- FIX: Replaced the chart options with a simpler, correct version ---
    createChart('omzet-bulanan-chart', 'line', {
        labels: chartLabels,
        datasets: [{
            label: 'Total Omzet Bulanan',
            data: sortedMonths.map((month) => monthlyOmzet[month]),
            borderColor: '#8B5CF6',
            tension: 0.1,
        }],
    }, {
        // This new options object correctly configures the axes.
        scales: {
            y: {
                ticks: { callback: shortenCurrency } // Keep the currency formatting for the y-axis.
            },
            x: {
                // By not specifying a 'type', we let Chart.js use the default 'category'
                // scale, which will correctly display the month names from the labels.
            }
        }
    });
}

function generateOmzetHeatmapFromSummaries(summaries: any[], containerId: string) {
    const container = document.getElementById(containerId);
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const hours = Array.from({ length: 24 }, (_, i) => i);

    const heatmapData = Array(7).fill(0).map(() => Array(24).fill(0));
    let maxOmzet = 0;

    summaries.forEach(summary => {
        if (summary.hourlyRevenue && summary.hourlyRevenue.length === 24) {
            const dayIndex = summary.date.getDay();
            summary.hourlyRevenue.forEach((revenue, hourIndex) => {
                heatmapData[dayIndex][hourIndex] += revenue;
                if (heatmapData[dayIndex][hourIndex] > maxOmzet) {
                    maxOmzet = heatmapData[dayIndex][hourIndex];
                }
            });
        }
    });

    $store.setChartDataForAIProperty('omzetJamHariHeatmap', heatmapData);

    let tableHTML = '<table class="heatmap-table"><thead><tr><th></th>';
    hours.forEach(hour => tableHTML += `<th>${hour.toString().padStart(2, '0')}</th>`);
    tableHTML += '</tr></thead><tbody>';
    days.forEach((day, dayIndex) => {
        tableHTML += `<tr><td class="day-label">${day}</td>`;
        hours.forEach(hour => {
            const omzet = heatmapData[dayIndex][hour];
            const opacity = maxOmzet > 0 ? (omzet / maxOmzet) : 0;
            const color = `rgba(79, 70, 229, ${opacity})`;
            const title = `Rp${omzet.toLocaleString('id-ID')}`;
            tableHTML += `<td class="heatmap-cell" style="background-color: ${color}" title="${title}"></td>`;
        });
        tableHTML += '</tr>';
    });
    tableHTML += '</tbody></table>';

    container.innerHTML = tableHTML;

    // PHASE 2.6: Add hourly heatmap insights for general-penjualan
    if (summaries.length > 0 && heatmapData.some(dayArr => dayArr.some(val => val > 0))) {
        // Find peak hours and days
        let peakHour = 0, peakDay = 0, peakValue = 0;
        let totalHourlyRevenue = 0;
        const hourlyTotals = Array(24).fill(0);
        const dailyTotals = Array(7).fill(0);

        heatmapData.forEach((dayArr, dayIndex) => {
            dayArr.forEach((value, hourIndex) => {
                if (value > peakValue) {
                    peakValue = value;
                    peakHour = hourIndex;
                    peakDay = dayIndex;
                }
                totalHourlyRevenue += value;
                hourlyTotals[hourIndex] += value;
                dailyTotals[dayIndex] += value;
            });
        });

        // Find top performing hours and days
        const hourRankings = hourlyTotals.map((total, hour) => ({ hour, total }))
            .sort((a, b) => b.total - a.total);
        const dayRankings = dailyTotals.map((total, day) => ({ day, total }))
            .sort((a, b) => b.total - a.total);

        const avgHourlyRevenue = totalHourlyRevenue / (24 * 7);
        const peakHourRevenue = hourRankings[0]?.total || 0;
        const peakDayRevenue = dayRankings[0]?.total || 0;

        const hourlyHeatmapInsights = {
            chartType: 'hourly_sales_heatmap',
            description: 'Sales performance pattern by hour and day of week',
            timePatterns: {
                peakHours: hourRankings.slice(0, 3).map(h => `${h.hour.toString().padStart(2, '0')}:00`),
                slowHours: hourRankings.slice(-3).map(h => `${h.hour.toString().padStart(2, '0')}:00`),
                peakDays: dayRankings.slice(0, 2).map(d => days[d.day]),
                slowDays: dayRankings.slice(-2).map(d => days[d.day])
            },
            performance: {
                peakTimeSlot: {
                    day: days[peakDay],
                    hour: `${peakHour.toString().padStart(2, '0')}:00`,
                    revenue: formatCurrencyUtil(peakValue)
                },
                averageHourlyRevenue: formatCurrencyUtil(avgHourlyRevenue),
                peakHourRevenue: formatCurrencyUtil(peakHourRevenue),
                peakDayRevenue: formatCurrencyUtil(peakDayRevenue),
                totalDataPoints: summaries.length
            },
            weeklyDistribution: {
                weekdayTrend: dailyTotals.slice(1, 6).reduce((sum, val) => sum + val, 0) > dailyTotals[0] + dailyTotals[6] ? 'weekday-focused' : 'weekend-focused',
                peakIntensity: maxOmzet > avgHourlyRevenue * 3 ? 'high' : maxOmzet > avgHourlyRevenue * 1.5 ? 'medium' : 'low'
            }
        };

        $store.setActiveViewData('general-penjualan', {
            hourlyHeatmapInsights: hourlyHeatmapInsights
        });
    }
}

function generateDailyOmzetHeatmapFromSummaries(summaries: any[], containerId: string = 'daily-omzet-heatmap-container') {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML = '';

  // --- FIX START: Handle empty data and derive dates from the passed summaries ---
  if (summaries.length === 0) {
    container.innerHTML = '<p class="text-gray-500">No data to display for the selected period.</p>';
    return;
  }

  const dailyTotals = Object.fromEntries(summaries.map(s => [s.date.toISOString().split('T')[0], s.totalOmzet]));
  $store.setChartDataForAIProperty('dailyOmzetHeatmap', dailyTotals);

  const maxOmzet = Math.max(...summaries.map(s => s.totalOmzet));

  // Determine the start and end date from the filtered data, NOT from the DOM
  const startDate = summaries.reduce((min, s) => s.date < min ? s.date : min, summaries[0].date);
  const endDate = summaries.reduce((max, s) => s.date > max ? s.date : max, summaries[0].date);
  // --- FIX END ---

  let currentMonth = -1;
  let calendarHTML = '';
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  // The rest of the function works correctly with the new startDate and endDate
  for (let d = new Date(startDate); d <= endDate; d.setUTCDate(d.getUTCDate() + 1)) {
    const month = d.getUTCMonth();
    if (month !== currentMonth) {
      if (currentMonth !== -1) {
        calendarHTML += '</tr></tbody></table></div>';
      }
      currentMonth = month;
      calendarHTML += `<div class="mb-4"><h4 class="text-lg font-semibold text-center mb-2">${monthNames[month]} ${d.getUTCFullYear()}</h4><table class="heatmap-calendar-table"><thead><tr><th>Sun</th><th>Mon</th><th>Tue</th><th>Wed</th><th>Thu</th><th>Fri</th><th>Sat</th></tr></thead><tbody><tr>`;
      const firstDayOfMonth = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
      for (let i = 0; i < firstDayOfMonth.getUTCDay(); i++) calendarHTML += '<td></td>';
    }

    if (d.getUTCDay() === 0 && d.getUTCDate() !== 1) {
      calendarHTML += '</tr><tr>';
    }

    const dateStr = d.toISOString().split('T')[0];
    const omzet = dailyTotals[dateStr] || 0;
    const opacity = maxOmzet > 0 ? (omzet / maxOmzet) : 0;
    const color = `rgba(79, 70, 229, ${opacity})`;
    const title = `${dateStr}: Rp${omzet.toLocaleString('id-ID')}`;
    const textColor = opacity > 0.5 ? 'white' : '#374151';
    calendarHTML += `<td style="background-color: ${color}" title="${title}"><div class="day-number" style="color: ${textColor}">${d.getUTCDate()}</div></td>`;
  }
  calendarHTML += '</tr></tbody></table></div>';

  container.innerHTML = calendarHTML;

  // PHASE 2.5: Add daily heatmap insights for general-penjualan
  if (summaries.length > 0) {
    // Group by day of week
    const dayOfWeekTotals = summaries.reduce((acc, summary) => {
      const dayOfWeek = summary.date.getDay(); // 0=Sunday, 6=Saturday
      const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const dayName = dayNames[dayOfWeek];
      acc[dayName] = (acc[dayName] || 0) + summary.totalOmzet;
      return acc;
    }, {});

    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dayRevenueArray = dayNames.map(day => ({ day, revenue: dayOfWeekTotals[day] || 0 }));
    const sortedDays = dayRevenueArray.sort((a, b) => b.revenue - a.revenue);

    const avgDailyRevenue = summaries.length > 0 ? summaries.reduce((sum, s) => sum + s.totalOmzet, 0) / summaries.length : 0;
    const peakDay = sortedDays[0];
    const slowestDay = sortedDays[sortedDays.length - 1];

    const dailyHeatmapInsights = {
      chartType: 'daily_sales_heatmap',
      description: 'Sales performance pattern by day of week',
      dayPatterns: {
        strongestDays: sortedDays.slice(0, 3).map(d => d.day),
        weakestDays: sortedDays.slice(-2).map(d => d.day),
        averageDailyRevenue: formatCurrencyUtil(avgDailyRevenue),
        totalDaysAnalyzed: summaries.length
      },
      performance: {
        peakDay: {
          day: peakDay.day,
          revenue: formatCurrencyUtil(peakDay.revenue)
        },
        slowestDay: {
          day: slowestDay.day,
          revenue: formatCurrencyUtil(slowestDay.revenue)
        },
        peakToSlowRatio: slowestDay.revenue > 0 ? (peakDay.revenue / slowestDay.revenue).toFixed(1) : 'N/A'
      },
      dateRange: `${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`
    };

    $store.setActiveViewData('general-penjualan', {
      dailyHeatmapInsights: dailyHeatmapInsights
    });
  }
}

// In main.ts, replace the existing generateRingkasanFromSummaries function with this one.

function generateRingkasanFromSummaries(currentSummaries: any[], lastPeriodSummaries: any[], ids: { omzet: string, check: string, avgCheck: string, omzetGrowth: string, checkGrowth: string, avgCheckGrowth: string }) {

    // --- FIX START: Helper function to dynamically adjust font size ---
    const adjustFontSize = (elementId: string, text: string) => {
        const element = document.getElementById(elementId);
        if (!element) return;

        element.textContent = text;

        // Threshold: If the text is longer than 12 characters (e.g., "Rp10.000.000")
        if (text.length > 12) {
            element.classList.remove('text-4xl');
            element.classList.add('text-2xl'); // Apply smaller font size
        } else {
            element.classList.remove('text-2xl');
            element.classList.add('text-4xl'); // Revert to default large font size
        }
    };

    const calculateTotals = (summaries: any[]) => summaries.reduce((acc, summary) => {
        acc.omzet += summary.totalOmzet || 0;
        acc.checks += summary.totalTransactions || 0;
        return acc;
    }, { omzet: 0, checks: 0 });

    const currentTotals = calculateTotals(currentSummaries);
    const currentAvgCheck = currentTotals.checks > 0 ? currentTotals.omzet / currentTotals.checks : 0;

    // --- FIX: Use the new helper function to set the text and adjust size ---
    adjustFontSize(ids.omzet, `Rp${currentTotals.omzet.toLocaleString('id-ID')}`);
    adjustFontSize(ids.check, currentTotals.checks.toLocaleString('id-ID'));
    adjustFontSize(ids.avgCheck, `Rp${currentAvgCheck.toLocaleString('id-ID', { maximumFractionDigits: 0 })}`);

    if (lastPeriodSummaries && lastPeriodSummaries.length > 0) {
        const lastPeriodTotals = calculateTotals(lastPeriodSummaries);
        const lastPeriodAvgCheck = lastPeriodTotals.checks > 0 ? lastPeriodTotals.omzet / lastPeriodTotals.checks : 0;

        calculateAndDisplayGrowth(ids.omzetGrowth, currentTotals.omzet, lastPeriodTotals.omzet);
        calculateAndDisplayGrowth(ids.checkGrowth, currentTotals.checks, lastPeriodTotals.checks);
        calculateAndDisplayGrowth(ids.avgCheckGrowth, currentAvgCheck, lastPeriodAvgCheck);
    } else {
        document.getElementById(ids.omzetGrowth).textContent = '';
        document.getElementById(ids.checkGrowth).textContent = '';
        document.getElementById(ids.avgCheckGrowth).textContent = '';
    }

    // PHASE 2.1: Add sales summary insights for general-penjualan
    if (currentSummaries.length > 0) {
        const summaryInsights = {
            salesSummary: {
                totalOmzet: formatCurrencyUtil(currentTotals.omzet),
                totalTransactions: currentTotals.checks.toLocaleString('id-ID'),
                averagePerCheck: formatCurrencyUtil(currentAvgCheck),
                dataPointsAnalyzed: currentSummaries.length,
                hasComparison: lastPeriodSummaries && lastPeriodSummaries.length > 0,
                comparisonDescription: lastPeriodSummaries && lastPeriodSummaries.length > 0
                    ? `Compared with ${lastPeriodSummaries.length} data points from previous period`
                    : "No comparison period data available"
            }
        };

        $store.setActiveViewData('general-penjualan', {
            salesSummaryInsights: summaryInsights
        });
    }
}


function generateOmzetHarianChartFromSummaries(summaries: any[], canvasId: string) {
    // This uses .toSorted() which is great because it doesn't mutate the original array.
    const sortedSummaries = summaries.toSorted((a, b) => a.date.getTime() - b.date.getTime());
    const labels = sortedSummaries.map(s => s.date.toISOString().split('T')[0]);
    const data = sortedSummaries.map(s => s.totalOmzet);

    // --- START: New code to calculate the average ---
    const totalOmzet = data.reduce((sum, value) => sum + value, 0);
    const averageOmzet = sortedSummaries.length > 0 ? totalOmzet / sortedSummaries.length : 0;
    // --- END: New code to calculate the average ---

    const datasets = [{
        label: 'Total Omzet Harian',
        data: data,
        borderColor: '#3B82F6',
        tension: 0.1,
        type: 'line'
    }];

    // This part for the Target line remains unchanged.
    const salesTarget = $store.getConfigValue('activeSalesTarget') || {};
    if (salesTarget && salesTarget['Omzet Harian']) {
        datasets.push({
            label: 'Target Omzet Harian',
            data: Array(labels.length).fill(salesTarget['Omzet Harian']),
            borderColor: '#FFDE21',
            borderDash: [5, 5],
            borderWidth: 2,
            pointRadius: 0,
            tension: 0,
            type: 'line'
        });
    }
    
    // --- START: New code to add the average line to the chart ---
    if (averageOmzet > 0) {
        datasets.push({
            label: 'Average Omzet',
            data: Array(labels.length).fill(averageOmzet),
            borderColor: '#10B981', // Green for the average line
            borderDash: [5, 5],
            borderWidth: 2,
            pointRadius: 0,
            tension: 0,
            type: 'line'
        });
    }
    // --- END: New code to add the average line ---

    createChart(canvasId, 'line', {
        labels: labels,
        datasets: datasets, // This now contains all three datasets
    }, deepmerge(chartYTicks(shortenCurrency), chartXTicks(shortenDateTickCallback)));

    // PHASE 2.2: Add daily revenue chart insights for general-penjualan
    if (sortedSummaries.length > 0) {
        const totalRevenue = data.reduce((sum, val) => sum + val, 0);
        const avgDaily = data.length > 0 ? totalRevenue / data.length : 0;
        const maxRevenue = Math.max(...data);
        const minRevenue = Math.min(...data);
        const maxDay = sortedSummaries[data.indexOf(maxRevenue)];
        const minDay = sortedSummaries[data.indexOf(minRevenue)];

        // Calculate trend
        const firstValue = data[0] || 0;
        const lastValue = data[data.length - 1] || 0;
        const changePercent = firstValue !== 0 ? ((lastValue - firstValue) / Math.abs(firstValue)) * 100 : 0;
        const trend = Math.abs(changePercent) <= 5 ? 'stable' : changePercent > 0 ? 'growing' : 'declining';

        const chartInsights = {
            chartType: 'daily_revenue_trend',
            description: 'Daily revenue performance over selected period',
            performance: {
                totalRevenue: formatCurrencyUtil(totalRevenue),
                averageDailyRevenue: formatCurrencyUtil(avgDaily),
                daysAnalyzed: data.length,
                highestDay: {
                    date: maxDay.date.toISOString().split('T')[0],
                    revenue: formatCurrencyUtil(maxRevenue)
                },
                lowestDay: {
                    date: minDay.date.toISOString().split('T')[0],
                    revenue: formatCurrencyUtil(minRevenue)
                }
            },
            trend: trend,
            hasTarget: salesTarget && salesTarget['Omzet Harian'] ? true : false,
            targetDescription: salesTarget && salesTarget['Omzet Harian']
                ? `Daily target: ${formatCurrencyUtil(salesTarget['Omzet Harian'])}`
                : "No daily revenue target configured"
        };

        $store.setActiveViewData('general-penjualan', {
            dailyRevenueInsights: chartInsights
        });
    }
}


function generateTcApcHarianChartFromSummaries(summaries: any[], canvasId: string) {
    const sortedSummaries = summaries.toSorted((a, b) => a.date.getTime() - b.date.getTime());
    const labels = sortedSummaries.map(s => s.date.toISOString().split('T')[0]);
    const tcData = sortedSummaries.map(s => s.totalTransactions);
    const apcData = sortedSummaries.map(s => s.apc);

    // --- FIX START: Add target lines for both TC and APC ---
    const datasets = [
        {
            type: 'bar',
            label: 'Total Check (TC)',
            data: tcData,
            backgroundColor: '#60A5FA',
            yAxisID: 'y-tc',
            order: 2

        },
        {
            type: 'line',
            label: 'Average Check (APC)',
            data: apcData,
            borderColor: '#F97316',
            tension: 0.1,
            yAxisID: 'y-apc',
            order: 1
        },
    ];

    // Add Target Line for "Total Transaksi Per Hari" (TC)
    const salesTarget = $store.getConfigValue('activeSalesTarget') || {};
    if (salesTarget && salesTarget['Total Transaksi Per Hari']) {
        datasets.push({
            type: 'line',
            label: 'Target TC Harian',
            data: Array(labels.length).fill(salesTarget['Total Transaksi Per Hari']),
            borderColor: '#3B82F6', // A darker blue for TC target
            borderDash: [5, 5],
            borderWidth: 2,
            pointRadius: 0,
            yAxisID: 'y-tc', // Ensure it uses the left axis
        });
    }

    // Add Target Line for "Average Check" (APC)
    if (salesTarget && salesTarget['Average Check']) {
        datasets.push({
            type: 'line',
            label: 'Target Average Check',
            data: Array(labels.length).fill(salesTarget['Average Check']),
            borderColor: '#EF4444', // Red for APC target
            borderDash: [5, 5],
            borderWidth: 2,
            pointRadius: 0,
            yAxisID: 'y-apc', // Ensure it uses the right axis
        });
    }
    // --- FIX END ---

    createChart(canvasId, 'bar', {
        labels: labels,
        datasets: datasets, // Use the new datasets array
    }, deepmerge({
        scales: {
            'y-tc': {
                type: 'linear',
                display: true,
                position: 'left',
                title: { display: true, text: 'Total Check' },
                ticks: { callback: shortenNumber }
            },
            'y-apc': {
                type: 'linear',
                display: true,
                position: 'right',
                title: { display: true, text: 'Average Check (Rp)' },
                grid: { drawOnChartArea: false },
                ticks: { callback: shortenCurrency }
            },
        }
    }, chartXTicks(shortenDateTickCallback)));

    // PHASE 2.3: Add TC/APC chart insights for general-penjualan
    if (sortedSummaries.length > 0) {
        const avgTC = tcData.length > 0 ? tcData.reduce((sum, val) => sum + val, 0) / tcData.length : 0;
        const maxTC = Math.max(...tcData);
        const minTC = Math.min(...tcData);

        const avgAPC = apcData.length > 0 ? apcData.reduce((sum, val) => sum + val, 0) / apcData.length : 0;
        const maxAPC = Math.max(...apcData);
        const minAPC = Math.min(...apcData);

        // Calculate trends
        const firstTC = tcData[0] || 0;
        const lastTC = tcData[tcData.length - 1] || 0;
        const tcChangePercent = firstTC !== 0 ? ((lastTC - firstTC) / Math.abs(firstTC)) * 100 : 0;
        const tcTrend = Math.abs(tcChangePercent) <= 5 ? 'stable' : tcChangePercent > 0 ? 'increasing' : 'decreasing';

        const firstAPC = apcData[0] || 0;
        const lastAPC = apcData[apcData.length - 1] || 0;
        const apcChangePercent = firstAPC !== 0 ? ((lastAPC - firstAPC) / Math.abs(firstAPC)) * 100 : 0;
        const apcTrend = Math.abs(apcChangePercent) <= 5 ? 'stable' : apcChangePercent > 0 ? 'improving' : 'declining';

        const tcApcInsights = {
            chartType: 'dual_axis_transaction_analysis',
            description: 'Daily transaction count and average per check analysis',
            transactionAnalysis: {
                averageTransactionsPerDay: avgTC.toFixed(0),
                highestTransactionDay: maxTC.toFixed(0),
                lowestTransactionDay: minTC.toFixed(0),
                transactionTrend: tcTrend,
                totalTransactionsAnalyzed: tcData.reduce((sum, val) => sum + val, 0).toLocaleString('id-ID')
            },
            apcAnalysis: {
                averagePerCheck: formatCurrencyUtil(avgAPC),
                highestAPC: formatCurrencyUtil(maxAPC),
                lowestAPC: formatCurrencyUtil(minAPC),
                apcTrend: apcTrend
            },
            hasTargets: {
                tc: salesTarget && salesTarget['Total Check'] ? true : false,
                apc: salesTarget && salesTarget['APC'] ? true : false
            },
            targetDescription: `TC target: ${salesTarget && salesTarget['Total Check'] ? salesTarget['Total Check'] : 'None'}, APC target: ${salesTarget && salesTarget['APC'] ? formatCurrencyUtil(salesTarget['APC']) : 'None'}`
        };

        $store.setActiveViewData('general-penjualan', {
            tcApcInsights: tcApcInsights
        });
    }
}

/**
 * Destroy all active Chart.js instances to prevent memory leaks.
 *
 * @description
 * Iterates through all Chart.js instances stored in the global charts object,
 * calls their destroy() method to properly clean up resources, and resets
 * the charts object to an empty state. Essential for preventing memory leaks
 * when switching between different data sets or views.
 *
 * @returns This function does not return a value; it cleans up chart instances.
 *
 * @example
 * // Clean up all charts before loading new data
 * destroyCharts();
 * // All existing Chart.js instances are destroyed and charts object is reset to {}
 */
function destroyCharts(): void {
  Object.values($store.getCharts()).forEach((chart) => chart.destroy())
  $store.setCharts({})
}

/**
 * Create a Chart.js instance and automatically generate PDF version if available.
 *
 * @description
 * Instantiates a new Chart.js chart on the specified canvas element with the given
 * configuration. Destroys any existing chart with the same canvas ID to prevent
 * memory leaks. Automatically creates a corresponding PDF chart if a canvas element
 * with the pattern `${canvasId}-pdf` exists.
 *
 * @param canvasId - The ID of the canvas element where the chart will be rendered.
 * @param type - The Chart.js chart type (e.g., 'line', 'bar', 'pie', 'doughnut').
 * @param data - Chart.js data object containing datasets, labels, and styling.
 * @param [options={}] - Additional Chart.js configuration options to merge with defaults.
 * @returns This function does not return a value; it creates and stores the chart instance.
 *
 * @example
 * // Create a simple bar chart
 * const chartData = {
 *   labels: ['Jan', 'Feb', 'Mar'],
 *   datasets: [{ label: 'Sales', data: [100, 200, 150] }]
 * };
 * createChart('revenue-chart', 'bar', chartData, { plugins: { legend: { display: true } } });
 * // Creates chart on canvas with ID 'revenue-chart' and PDF version on 'revenue-chart-pdf' if it exists
 */
function createChart(canvasId: string, type: string, data: any, options: any = {}): void {
  const existingChart = $store.getChartProperty(canvasId);
  if (existingChart) existingChart.destroy();
  const ctx = document.getElementById(canvasId).getContext('2d')
  const finalOptions = { responsive: true, maintainAspectRatio: false, ...options }
  const newChart = new Chart(ctx, { type, data, options: finalOptions });
  $store.setChartProperty(canvasId, newChart);

  // Auto create chart inside PDF with same data and options
  const chartPdf = document.getElementById(`${canvasId}-pdf`)
  if (chartPdf) {
    console.debug('Creating chart PDF for', canvasId)
    createChart(`${canvasId}-pdf`, type, data, options)
  }

  // Auto create chart inside PDF landscape with same data and options
  const chartLandscapePdfId = `${canvasId.replace(/-pdf$/, '')}-landscape-pdf`
  const chartLandscapePdf = document.getElementById(chartLandscapePdfId)
  if (chartLandscapePdf) {
    console.debug('Creating chart landscape PDF for', canvasId)
    createChart(chartLandscapePdfId, type, data, options)
  }
}

// --- Helper Functions ---
/**
 * Formats a number into an Indonesian currency string.
 *
 * @param {number} value - The numeric value to format.
 * @param {string} prefix - Currency prefix (default: 'Rp').
 * @param {number} fractionDigits - Number of decimal digits (default: 0).
 * @returns {string} The formatted currency string.
 *
 * @description
 * Converts a numeric value into a properly formatted Indonesian currency string,
 * using the correct thousands and decimal separators.
 */
const formatCurrency = (value, prefix = 'Rp', fractionDigits = 0) => {
  if (typeof value !== 'number' || isNaN(value)) return `${prefix} 0`
  return `${prefix}${value.toLocaleString('id-ID', { maximumFractionDigits: fractionDigits })}`
}

/**
 * Formats a number into a string with thousand separators.
 *
 * @param {number} value - The numeric value to format.
 * @param {number} fractionDigits - The number of decimal digits (default: 0).
 * @returns {string} The formatted string with thousand separators.
 *
 * @description
 * This function converts a number into a string formatted with thousand separators
 * according to Indonesian standards.
 */
const formatNumber = (value, fractionDigits = 0) => {
  if (typeof value !== 'number' || isNaN(value)) return `0`
  return value.toLocaleString('id-ID', { maximumFractionDigits: fractionDigits })
}

/**
 * Calculates the comparison between two values and returns change information.
 *
 * @param {number} current - The current value.
 * @param {number} previous - The previous value.
 * @returns {Object} An object containing change information (upOrDown, percentage, plusOrMinus, difference).
 *
 * @description
 * This function compares two numeric values and calculates the percentage change
 * along with direction indicators (up/down). It's used to display performance
 * comparisons between time periods.
 */
const calculateComparison = (current, previous) => {
  if (previous === 0 || typeof current !== 'number' || typeof previous !== 'number') {
    return { upOrDown: '', percentage: 'N/A', plusOrMinus: '', difference: 'N/A' }
  }
  const diff = current - previous
  const growth = (diff / previous) * 100
  return {
    upOrDown: growth > 0 ? '▲' : '▼',
    percentage: formatNumber(Math.abs(growth), 1),
    plusOrMinus: growth > 0 ? '+' : '-',
    difference: formatNumber(Math.abs(diff), 0),
  }
}

// --- Main Update Function ---
/**
 * Calculate and update comprehensive PDF report data from current and previous period sales.
 *
 * @description
 * Processes current and previous period sales data to calculate key business metrics
 * including revenue, transaction counts, APC, branch performance, and product analysis.
 * Generates formatted comparisons, top performers, and detailed breakdowns for food
 * and drink categories. Updates global store with formatted data for PDF report
 * generation including superhero/sidekick products and branch rankings.
 *
 * @param currentData - Array of sales data for the current analysis period.
 * @param lastPeriodData - Array of sales data for the previous comparison period.
 * @returns This function does not return a value; it updates the global store with PDF data.
 *
 * @example
 * // Update PDF data with current and previous period sales
 * const currentSales = [
 *   { Revenue: 500000, "Bill Number": "B001", Branch: "Jakarta", Menu: "Nasi Goreng", "Menu Category": "MAKANAN" }
 * ];
 * const previousSales = [
 *   { Revenue: 450000, "Bill Number": "B002", Branch: "Jakarta", Menu: "Nasi Goreng", "Menu Category": "MAKANAN" }
 * ];
 * updatePdfData(currentSales, previousSales);
 * // Updates store with formatted metrics, comparisons, and top performers
 */
function updatePdfData(currentData: any[], lastPeriodData: any[]): void {
  if (!currentData || currentData.length === 0) {
    $store.setStorePartial({}) // Clear the store if no data
    return
  }

  const stateUpdate = {}

  // === GENERAL METRICS ===
  const currentOmzet = currentData.reduce((sum, d) => sum + d.Revenue, 0)
  const bills = [...new Set(currentData.map((d) => d['Bill Number']))]
  const currentCheck = bills.length
  const currentAvgCheck = currentCheck > 0 ? currentOmzet / currentCheck : 0

  const lastPeriodOmzet = lastPeriodData.reduce((sum, d) => sum + d.Revenue, 0)
  const lastPeriodCheck = new Set(lastPeriodData.map((d) => d['Bill Number'])).size
  const lastPeriodAvgCheck = lastPeriodCheck > 0 ? lastPeriodOmzet / lastPeriodCheck : 0

  stateUpdate.currentOmzetFormatted = formatCurrency(currentOmzet)
  stateUpdate.currentCheckFormatted = formatNumber(currentCheck)
  stateUpdate.currentAvgCheckFormatted = formatCurrency(currentAvgCheck)

  stateUpdate.lastPeriodOmzetComparison = calculateComparison(currentOmzet, lastPeriodOmzet)
  stateUpdate.lastPeriodCheckComparison = calculateComparison(currentCheck, lastPeriodCheck)
  stateUpdate.lastPeriodAvgCheckComparison = calculateComparison(currentAvgCheck, lastPeriodAvgCheck)

  // --- BRANCH / OUTLET METRICS ---
  const branchStats = Object.values(currentData.reduce((acc, d) => {
    const branch = d.Branch || 'Unknown'
    if (!acc[branch]) acc[branch] = { name: branch, revenue: 0, bills: new Set() }
    acc[branch].revenue += d.Revenue
    acc[branch].bills.add(d['Bill Number'])
    return acc
  }, {})).map((s) => ({ ...s, check: s.bills.size }))

  const topOmzetBranch = [...branchStats].toSorted((a, b) => b.revenue - a.revenue)[0]
  if (topOmzetBranch) {
    stateUpdate.topOmzetOutletName = topOmzetBranch.name
    stateUpdate.topOmzetPercentage = formatNumber((topOmzetBranch.revenue / currentOmzet) * 100)
  }

  // --- PRODUCT METRICS (FOOD) ---
  const foodData = currentData.filter((d) => d['Item Group'] === 'MAKANAN')
  const totalFoodRevenue = foodData.reduce((sum, d) => sum + d.Revenue, 0)
  const foodByMenu = Object.entries(foodData.reduce((acc, d) => {
    if (!acc[d.Menu]) acc[d.Menu] = { revenue: 0, qty: 0 }
    acc[d.Menu].revenue += d.Revenue
    return acc
  }, {})).toSorted(([,a], [,b]) => b.revenue - a.revenue)

  if (foodByMenu.length > 0) {
    stateUpdate.foodPodium = foodByMenu.slice(0, 3).map(([name]) => name)
    stateUpdate.top5RevenueFood = foodByMenu.slice(0, 5).map(([name, data]) => ({
      name: name,
      revenue: formatCurrency(data.revenue),
      percent: formatNumber((data.revenue / totalFoodRevenue) * 100),
    }))
    const superhero = foodByMenu[0]
    stateUpdate.superheroName = superhero[0]
    stateUpdate.superheroContributionPercent = formatNumber((superhero[1].revenue / currentOmzet) * 100)
    stateUpdate.superheroContributionNominal = formatCurrency(superhero[1].revenue)
  }

  // --- PRODUCT METRICS (DRINKS) ---
  const drinkData = currentData.filter((d) => d['Item Group'] === 'MINUMAN')
  const totalDrinkRevenue = drinkData.reduce((sum, d) => sum + d.Revenue, 0)
  const drinkByMenu = Object.entries(drinkData.reduce((acc, d) => {
    if (!acc[d.Menu]) acc[d.Menu] = { revenue: 0, qty: 0 }
    acc[d.Menu].revenue += d.Revenue
    return acc
  }, {})).toSorted(([,a], [,b]) => b.revenue - a.revenue)

  if (drinkByMenu.length > 0) {
    stateUpdate.drinkPodium = drinkByMenu.slice(0, 3).map(([name]) => name)
    stateUpdate.top5RevenueDrink = drinkByMenu.slice(0, 5).map(([name, data]) => ({
      name: name,
      revenue: formatCurrency(data.revenue),
      percent: formatNumber((data.revenue / totalDrinkRevenue) * 100),
    }))
    const sidekick = drinkByMenu[0]
    stateUpdate.sidekickName = sidekick[0]
    stateUpdate.sidekickContributionPercent = formatNumber((sidekick[1].revenue / currentOmzet) * 100)
    stateUpdate.sidekickContributionNominal = formatCurrency(sidekick[1].revenue)
  }

  // === FINAL UPDATE ===
  // This updates all listening components at once.
  $store.setStorePartial(stateUpdate)
}

/**
 * Generate comprehensive sales summary with period comparison and growth metrics.
 *
 * @description
 * Calculates key business metrics (total revenue, transaction count, average check)
 * for current and previous periods, then computes growth percentages and updates
 * both UI elements and global store. Handles period-over-period comparison,
 * formats numbers for Indonesian locale, and triggers PDF data updates and
 * growth calculations for dashboard display.
 *
 * @param currentData - Array of sales data rows for the current analysis period.
 * @param lastPeriodData - Array of sales data rows for the comparison period.
 * @returns This function does not return a value; it updates UI, store, and triggers calculations.
 *
 * @example
 * // Generate sales summary with period comparison
 * const current = [{ Revenue: 500000, "Bill Number": "B001" }];
 * const previous = [{ Revenue: 400000, "Bill Number": "B002" }];
 * generateRingkasan(current, previous);
 * // Updates dashboard with metrics and growth percentages
 */
function generateRingkasan(currentData: any[], lastPeriodData: any[]): void {
  // Calculate metrics for the current period
  const currentOmzet = currentData.reduce((sum, d) => sum + d.Revenue, 0)
  const currentCheck = new Set(currentData.map((d) => d['Bill Number'])).size
  const currentAvgCheck = currentCheck > 0 ? currentOmzet / currentCheck : 0

  // Calculate metrics for the last period
  const lastPeriodOmzet = lastPeriodData.reduce((sum, d) => sum + d.Revenue, 0)
  const lastPeriodCheck = new Set(lastPeriodData.map((d) => d['Bill Number'])).size
  const lastPeriodAvgCheck = lastPeriodCheck > 0 ? lastPeriodOmzet / lastPeriodCheck : 0

  $store.setStorePartial({
    currentOmzet,
    currentOmzetFormatted: currentOmzet.toLocaleString('id-ID', { maximumFractionDigits: 2 }),
    currentCheck,
    currentCheckFormatted: currentCheck.toLocaleString('id-ID', { maximumFractionDigits: 2 }),
    currentAvgCheck,
    currentAvgCheckFormatted: currentAvgCheck.toLocaleString('id-ID', { maximumFractionDigits: 2 }),
    lastPeriodOmzet,
    lastPeriodOmzetFormatted: lastPeriodOmzet.toLocaleString('id-ID', { maximumFractionDigits: 2 }),
    lastPeriodCheck,
    lastPeriodCheckFormatted: lastPeriodCheck.toLocaleString('id-ID', { maximumFractionDigits: 2 }),
    lastPeriodAvgCheck,
    lastPeriodAvgCheckFormatted: lastPeriodAvgCheck.toLocaleString('id-ID', { maximumFractionDigits: 2 }),
  })

  // Update the UI with current period's metrics
  document.getElementById('ringkasan-total-omzet').textContent = `Rp${currentOmzet.toLocaleString('id-ID')}`
  document.getElementById('ringkasan-total-check').textContent = currentCheck.toLocaleString('id-ID')
  document.getElementById('ringkasan-avg-check').textContent = `Rp${currentAvgCheck.toLocaleString('id-ID', { maximumFractionDigits: 0 })}`

  // Calculate and display growth
  calculateAndDisplayGrowth('ringkasan-omzet-growth', currentOmzet, lastPeriodOmzet, true)
  calculateAndDisplayGrowth('ringkasan-check-growth', currentCheck, lastPeriodCheck)
  calculateAndDisplayGrowth('ringkasan-avg-check-growth', currentAvgCheck, lastPeriodAvgCheck, true)

  updatePdfData(currentData, lastPeriodData)

  calculateForPdf('lastPeriodOmzet', currentOmzet, lastPeriodOmzet)
  calculateForPdf('lastPeriodCheck', currentCheck, lastPeriodCheck)
  calculateForPdf('lastPeriodAvgCheck', currentAvgCheck, lastPeriodAvgCheck)
}

/**
 * Calculate and display period-over-period growth percentage in a DOM element.
 *
 * @description
 * Computes the percentage change between current and previous values, then updates
 * the specified DOM element with formatted growth text and appropriate color styling
 * (green for positive growth, red for negative, gray for N/A when previous value is zero).
 *
 * @param elementId - The ID of the DOM element to update with growth display.
 * @param currentValue - The current period's numeric value.
 * @param previousValue - The previous period's numeric value for comparison.
 * @param [isCurrency=false] - Whether the values represent currency (currently unused).
 * @returns This function does not return a value; it updates the DOM directly.
 *
 * @example
 * // Display revenue growth in a specific element
 * calculateAndDisplayGrowth('revenue-growth', 15000, 12000);
 * // The element with ID 'revenue-growth' will show: "+25.0% vs comparison period" in green
 *
 * // Handle case with no previous data
 * calculateAndDisplayGrowth('sales-growth', 5000, 0);
 * // The element will show: "vs N/A" in gray
 */
function calculateAndDisplayGrowth(elementId: string, currentValue: number, previousValue: number, isCurrency = false): void {
  const element = document.getElementById(elementId)
  if (previousValue === 0) {
    element.textContent = 'vs N/A'
    element.className = 'text-sm mt-1 font-medium text-gray-500'
    return
  }

  const growth = ((currentValue - previousValue) / previousValue) * 100
  const sign = growth >= 0 ? '+' : ''
  const colorClass = growth >= 0 ? 'text-green-600' : 'text-red-600'

  element.textContent = `${sign}${growth.toFixed(1)}% vs comparison period`
  element.className = `text-sm mt-1 font-medium ${colorClass}`
}

/**
 * Calculate period-over-period comparison metrics for PDF report generation.
 *
 * @description
 * Computes growth percentage, direction indicators, and formatted differences between
 * current and previous period values. Stores the results in the global state using
 * dynamic keys for PDF template consumption. Handles edge cases like zero previous values.
 *
 * @param key - Base property name for storing comparison metrics in the global state.
 * @param currentValue - The current period's numeric value.
 * @param previousValue - The previous period's numeric value for comparison.
 * @returns This function does not return a value; it updates the global store.
 *
 * @example
 * // Calculate revenue comparison for PDF
 * calculateForPdf('revenue', 150000, 120000);
 * // Stores: revenueUpOrDown: '▲', revenuePercentage: '25.00', revenuePlusOrMinus: '+', revenueDifference: '30.000'
 *
 * // Handle zero previous value case
 * calculateForPdf('newMetric', 5000, 0);
 * // Stores: newMetricUpOrDown: undefined, newMetricPercentage: undefined, etc.
 */
function calculateForPdf(key: string, currentValue: number, previousValue: number): void {
  if (previousValue === 0) {
    $store.setStorePartial({
      [`${key}UpOrDown`]: undefined,
      [`${key}Percentage`]: undefined,
      [`${key}PlusOrMinus`]: undefined,
      [`${key}Difference`]: undefined,
    })
    return
  }

  const diff = currentValue - previousValue
  const absoluteDiff = Math.abs(diff)
  const growth = ((currentValue - previousValue) / previousValue) * 100
  const absoluteGrowth = Math.abs(growth)

  const UpOrDown = growth === 0 ? '' : growth > 0 ? '▲' : '▼'
  const Percentage = absoluteGrowth.toLocaleString('id-ID', { maximumFractionDigits: 2 })
  const PlusOrMinus = growth === 0 ? '' : growth > 0 ? '+' : '-'
  const Difference = absoluteDiff.toLocaleString('id-ID', { maximumFractionDigits: 2 })

  $store.setStorePartial({
    [`${key}UpOrDown`]: UpOrDown,
    [`${key}Percentage`]: Percentage,
    [`${key}PlusOrMinus`]: PlusOrMinus,
    [`${key}Difference`]: Difference,
  })
}

/**
 * Generate calendar-style heatmap showing daily revenue intensity patterns.
 *
 * @description
 * Creates an interactive calendar heatmap visualization where each day is colored
 * based on revenue intensity (opacity reflects revenue amount). Displays monthly
 * calendars with proper week alignment, tooltips showing exact revenue amounts,
 * and stores data for AI analysis. Useful for identifying seasonal patterns and
 * high-revenue days at a glance.
 *
 * @param data - Array of processed sales data rows with Revenue and Sales Date In properties.
 * @returns This function does not return a value; it generates HTML heatmap and updates DOM.
 *
 * @example
 * // Generate daily revenue heatmap
 * const salesData = [
 *   { Revenue: 5000000, "Sales Date In": new Date("2024-01-15") },
 *   { Revenue: 3000000, "Sales Date In": new Date("2024-01-16") }
 * ];
 * generateDailyOmzetHeatmap(salesData);
 * // Creates calendar heatmap with color intensity based on daily revenue
 */
function generateDailyOmzetHeatmap(data: any[]): void {
  const container = document.getElementById('daily-omzet-heatmap-container')
  container.innerHTML = '' // Clear previous heatmap

  if (data.length === 0) {
    container.innerHTML = '<p class="text-gray-500">No data to display for the selected period.</p>'
    return
  }

  const dailyTotals = data.reduce((acc, d) => {
    const dateStr = d['Sales Date In'].toISOString().split('T')[0]
    acc[dateStr] = (acc[dateStr] || 0) + d.Revenue
    return acc
  }, {})

  $store.setChartDataForAIProperty('dailyOmzetHeatmap', dailyTotals); // Store data for AI

  const maxOmzet = Math.max(...Object.values(dailyTotals))

  const startDate = new Date(document.getElementById('date-start').value + 'T00:00:00')
  const endDate = new Date(document.getElementById('date-end').value + 'T00:00:00')

  let currentMonth = -1
  let calendarHTML = ''
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

  for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
    const month = d.getMonth()
    const year = d.getFullYear()

    if (month !== currentMonth) {
      if (currentMonth !== -1) {
        // Pad end of the previous month's last week
        const prevDate = new Date(d)
        prevDate.setDate(prevDate.getDate() - 1)
        if (prevDate.getDay() !== 6) {
          for (let i = prevDate.getDay(); i < 6; i++) {
            calendarHTML += '<td></td>'
          }
        }
        calendarHTML += '</tr></tbody></table></div>'
      }
      currentMonth = month
      calendarHTML += `<div class="mb-4">
                        <h4 class="text-lg font-semibold text-center mb-2">${monthNames[month]} ${year}</h4>
                        <table class="heatmap-calendar-table">
                            <thead><tr><th>Sun</th><th>Mon</th><th>Tue</th><th>Wed</th><th>Thu</th><th>Fri</th><th>Sat</th></tr></thead>
                            <tbody><tr>`

      // Pad start of the month
      const firstDayOfMonth = new Date(d.getFullYear(), d.getMonth(), 1)
      const startDayOfWeek = firstDayOfMonth.getDay()
      for (let i = 0; i < startDayOfWeek; i++) {
        calendarHTML += '<td></td>'
      }
    }

    if (d.getDay() === 0 && d.getDate() !== 1) {
      calendarHTML += '</tr><tr>'
    }

    const dateStr = d.toISOString().split('T')[0]
    const omzet = dailyTotals[dateStr] || 0
    const opacity = maxOmzet > 0 ? (omzet / maxOmzet) : 0
    const color = `rgba(79, 70, 229, ${opacity})`
    const title = `${dateStr}: Rp${omzet.toLocaleString('id-ID')}`
    const textColor = opacity > 0.5 ? 'white' : '#374151'

    calendarHTML += `<td style="background-color: ${color}" title="${title}"><div class="day-number" style="color: ${textColor}">${d.getDate()}</div></td>`
  }

  // Pad end of the last month and close the table
  const lastDay = new Date(endDate)
  if (lastDay.getDay() !== 6) {
    for (let i = lastDay.getDay(); i < 6; i++) {
      calendarHTML += '<td></td>'
    }
  }
  calendarHTML += '</tr></tbody></table></div>'

  container.innerHTML = calendarHTML
}

/**
 * Generate revenue heatmap visualization showing patterns by day and hour.
 *
 * @description
 * Creates an interactive HTML table heatmap displaying revenue intensity across
 * 7 days × 24 hours grid. Each cell's color opacity represents revenue volume
 * relative to peak performance, helping identify optimal business hours and
 * weekly patterns. Stores processed data in chartDataForAI for AI analysis
 * and generates tooltips showing exact revenue amounts.
 *
 * @param data - Array of processed sales data rows with Revenue and Sales Date In.
 * @returns This function does not return a value; it creates HTML heatmap and stores data.
 *
 * @example
 * // Generate revenue heatmap for time pattern analysis
 * const salesData = [
 *   { Revenue: 500000, "Sales Date In": new Date("2024-01-15T14:30:00") },
 *   { Revenue: 300000, "Sales Date In": new Date("2024-01-15T19:45:00") }
 * ];
 * generateOmzetHeatmap(salesData);
 * // Creates interactive heatmap showing revenue patterns by day/hour
 */
function generateOmzetHeatmap(data: any[]): void {
  const container = document.getElementById('omzet-heatmap-container')
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const hours = Array.from({ length: 24 }, (_, i) => i)

  // Initialize data structure
  const heatmapData = Array(7).fill(0).map(() => Array(24).fill(0))
  let maxOmzet = 0

  // Aggregate data
  data.forEach((d) => {
    const day = d['Sales Date In'].getDay()
    const hour = d['Sales Date In'].getHours()
    heatmapData[day][hour] += d.Revenue
    if (heatmapData[day][hour] > maxOmzet) {
      maxOmzet = heatmapData[day][hour]
    }
  })

  $store.setChartDataForAIProperty('omzetJamHariHeatmap', heatmapData.map((hourlyData, dayIndex) => {
    const dayData = {}
    hourlyData.forEach((revenue, hour) => {
      if (revenue > 0) dayData[hour] = revenue
    })
    return { [days[dayIndex]]: dayData }
  }));

  // Generate HTML table
  let tableHTML = '<table class="heatmap-table">'
  // Header row
  tableHTML += '<thead><tr><th></th>'
  hours.forEach((hour) => tableHTML += `<th>${hour.toString().padStart(2, '0')}</th>`)
  tableHTML += '</tr></thead>'
  // Data rows
  tableHTML += '<tbody>'
  days.forEach((day, dayIndex) => {
    tableHTML += `<tr><td class="day-label">${day}</td>`
    hours.forEach((hour) => {
      const omzet = heatmapData[dayIndex][hour]
      const opacity = maxOmzet > 0 ? (omzet / maxOmzet) : 0
      const color = `rgba(79, 70, 229, ${opacity})`
      const title = `Rp${omzet.toLocaleString('id-ID')}`
      tableHTML += `<td class="heatmap-cell" style="background-color: ${color}" title="${title}"></td>`
    })
    tableHTML += '</tr>'
  })
  tableHTML += '</tbody></table>'

  container.innerHTML = tableHTML
}

/**
 * Generate daily Total Check vs Average Per Check comparison chart with AI data storage.
 *
 * @description
 * Creates a dual-axis chart combining bar chart (Total Check count) and line chart
 * (Average Per Check value) to analyze daily transaction patterns. Groups data by
 * date, calculates TC (unique bill count) and APC (revenue/TC) for each day.
 * Stores structured data in global chartDataForAI for AI analysis and insights
 * generation. Helps identify relationships between transaction volume and value.
 *
 * @param data - Array of processed sales data rows with Revenue, Bill Number, and Sales Date In.
 * @returns This function does not return a value; it creates a Chart.js mixed chart and stores AI data.
 *
 * @example
 * // Generate daily TC vs APC comparison with AI data
 * const salesData = [
 *   { Revenue: 150000, "Bill Number": "B001", "Sales Date In": new Date("2024-01-15T14:30:00") },
 *   { Revenue: 200000, "Bill Number": "B002", "Sales Date In": new Date("2024-01-15T19:45:00") },
 *   { Revenue: 180000, "Bill Number": "B003", "Sales Date In": new Date("2024-01-16T12:15:00") }
 * ];
 * generateTcApcHarianChart(salesData);
 * // Creates mixed chart and stores data in chartDataForAI['tcApcHarian']
 */
function generateTcApcHarianChart(data: any[]): void {
  const dailyData = data.reduce((acc, d) => {
    const date = d['Sales Date In'].toISOString().split('T')[0]
    if (!acc[date]) {
      acc[date] = { revenue: 0, bills: new Set() }
    }
    acc[date].revenue += d.Revenue
    acc[date].bills.add(d['Bill Number'])
    return acc
  }, {})

  const sortedDates = Object.keys(dailyData).toSorted()
  const tcData = sortedDates.map((date) => dailyData[date].bills.size)
  const apcData = sortedDates.map((date) => {
    const tc = dailyData[date].bills.size
    return tc > 0 ? dailyData[date].revenue / tc : 0
  })

  $store.setChartDataForAIProperty('tcApcHarian', sortedDates.map((date, i) => ({ date, totalChecks: tcData[i], averageCheck: apcData[i] })));

  createChart('tc-apc-harian-chart', 'bar', {
    labels: sortedDates,
    datasets: [
      {
        type: 'bar',
        label: 'Total Check (TC)',
        data: tcData,
        backgroundColor: '#60A5FA',
        yAxisID: 'y-tc',
      },
      {
        type: 'line',
        label: 'Average Check (APC)',
        data: apcData,
        borderColor: '#F97316',
        backgroundColor: '#F97316',
        tension: 0.1,
        yAxisID: 'y-apc',
      },
    ],
  }, deepmerge({
    scales: {
      'y-tc': {
        ticks: { callback: shortenNumber },
        type: 'linear',
        display: true,
        position: 'left',
        title: {
          display: true,
          text: 'Total Check',
        },
      },
      'y-apc': {
        ticks: { callback: shortenCurrency },
        type: 'linear',
        display: true,
        position: 'right',
        title: {
          display: true,
          text: 'Average Check (Rp)',
        },
        grid: {
          drawOnChartArea: false, // only want the grid lines for one axis to show up
        },
      },
    },
  }, chartXTicks(shortenDateTickCallback)))
}

/**
 * Generate daily revenue (omzet) trend line chart with AI data storage.
 *
 * @description
 * Analyzes sales data to calculate total daily revenue and creates a line chart
 * showing revenue trends over time. Aggregates revenue by date, sorts chronologically,
 * and stores processed data in global chartDataForAI object for AI analysis.
 * Uses custom formatting for currency and date display on chart axes.
 *
 * @param data - Array of processed sales data rows with Revenue and Sales Date In.
 * @returns This function does not return a value; it creates a Chart.js line chart and stores data.
 *
 * @example
 * // Generate daily revenue trend chart
 * const salesData = [
 *   { Revenue: 500000, "Sales Date In": new Date("2024-01-15") },
 *   { Revenue: 750000, "Sales Date In": new Date("2024-01-16") }
 * ];
 * generateOmzetHarianChart(salesData);
 * // Creates line chart and stores daily revenue data for AI analysis
 */
function generateOmzetHarianChart(data: any[]): void {
  const dailyOmzet = data.reduce((acc, d) => {
    const date = d['Sales Date In'].toISOString().split('T')[0]
    acc[date] = (acc[date] || 0) + d.Revenue
    return acc
  }, {})

  const sortedDates = Object.keys(dailyOmzet).toSorted()

  $store.setChartDataForAIProperty('omzetHarian', dailyOmzet); // Store data for AI

  createChart('omzet-harian-chart', 'line', {
    labels: sortedDates,
    datasets: [{
      label: 'Total Omzet Harian',
      data: sortedDates.map((date) => dailyOmzet[date]),
      borderColor: '#3B82F6',
      tension: 0.1,
    }],
  }, deepmerge(
    chartYTicks(shortenCurrency),
    chartXTicks(shortenDateTickCallback),
  ))
}

/**
 * Generate weekly revenue (omzet) trend charts for multiple visualizations.
 *
 * @description
 * Analyzes sales data to calculate weekly revenue totals starting from Sunday
 * and creates multiple line charts for different contexts (main view, PDF report,
 * TC weekly). Groups revenue by week, sorts chronologically, and stores data
 * in chartDataForAI for AI analysis. Generates consistent visualizations across
 * different chart canvases for comprehensive weekly performance tracking.
 *
 * @param data - Array of processed sales data rows with Revenue and Sales Date In.
 * @returns This function does not return a value; it creates multiple Chart.js line charts.
 *
 * @example
 * // Generate weekly revenue trend charts
 * const salesData = [
 *   { Revenue: 500000, "Sales Date In": new Date("2024-01-15") },
 *   { Revenue: 750000, "Sales Date In": new Date("2024-01-22") }
 * ];
 * generateOmzetMingguanChart(salesData);
 * // Creates multiple weekly revenue charts and stores data for AI analysis
 */
function generateOmzetMingguanChart(data: any[]): void {
  const weeklyOmzet = data.reduce((acc, d) => {
    const year = d['Sales Date In'].getFullYear()
    // Create a date for the first day of the week (Sunday)
    const firstDayOfWeek = new Date(d['Sales Date In'])
    firstDayOfWeek.setDate(d['Sales Date In'].getDate() - d['Sales Date In'].getDay())
    const weekLabel = firstDayOfWeek.toISOString().split('T')[0]

    acc[weekLabel] = (acc[weekLabel] || 0) + d.Revenue
    return acc
  }, {})

  const sortedWeeks = Object.keys(weeklyOmzet).toSorted()
  $store.setChartDataForAIProperty('omzetMingguan', weeklyOmzet);

  createChart('omzet-mingguan-chart', 'line', {
    labels: sortedWeeks,
    datasets: [{
      label: 'Total Omzet Mingguan',
      data: sortedWeeks.map((week) => weeklyOmzet[week]),
      borderColor: '#10B981',
      tension: 0.1,
    }],
  })

  createChart('omzet-mingguan-chart-pdf', 'line', {
    labels: sortedWeeks,
    datasets: [{
      label: 'Total Omzet Mingguan',
      data: sortedWeeks.map((week) => weeklyOmzet[week]),
      borderColor: '#10B981',
      tension: 0.1,
    }],
  });

  createChart('tc-mingguan-chart-pdf', 'line', {
    labels: sortedWeeks,
    datasets: [{
      label: 'Total TC Mingguan',
      data: sortedWeeks.map((week) => weeklyOmzet[week]),
      borderColor: '#10B981',
      tension: 0.1,
    }],
  })
}

/**
 * Generate outlet revenue comparison bar chart with performance ranking.
 *
 * @description
 * Analyzes sales data to calculate total revenue per outlet/branch and creates
 * a ranked bar chart showing revenue performance comparison. Sorts outlets by
 * revenue in descending order to highlight top performers and stores processed
 * data in chartDataForAI for AI analysis. Uses custom currency formatting for
 * better readability of large revenue values.
 *
 * @param data - Array of processed sales data rows with Revenue and Branch.
 * @returns This function does not return a value; it creates a Chart.js bar chart and stores data.
 *
 * @example
 * // Generate outlet revenue comparison chart
 * const salesData = [
 *   { Revenue: 500000, Branch: "Jakarta" },
 *   { Revenue: 750000, Branch: "Bandung" }
 * ];
 * generateOmzetOutletChart(salesData);
 * // Creates ranked bar chart showing outlet revenue performance
 */
function generateOmzetOutletChart(data: any[]): void {
  const outletOmzet = data.reduce((acc, d) => {
    const branch = d.Branch || 'Unknown'
    acc[branch] = (acc[branch] || 0) + d.Revenue
    return acc
  }, {})

  const sortedOutlets = Object.entries(outletOmzet).toSorted((a, b) => b[1] - a[1])
  $store.setChartDataForAIProperty('omzetOutlet', Object.fromEntries(sortedOutlets));

  createChart('omzet-outlet-chart', 'bar', {
    labels: sortedOutlets.map((entry) => entry[0]),
    datasets: [{
      label: 'Total Omzet',
      data: sortedOutlets.map((entry) => entry[1]),
      backgroundColor: '#4F46E5',
    }],
  }, {
    scales: {
      y: {
        beginAtZero: true,
        ticks: {
          callback: shortenCurrency,
        },
      },
    },
  })
}

/**
 * Generate monthly sales and transaction count chart with dual y-axes.
 *
 * @description
 * Analyzes sales data to create a dual-axis bar chart showing monthly revenue
 * and transaction count trends. Uses separate y-axes for sales (left) and
 * total checks (right) to effectively compare both metrics simultaneously.
 * Aggregates data by month, counts unique bills, and stores processed data
 * in chartDataForAI for AI analysis and business insights.
 *
 * @param data - Array of processed sales data rows with Revenue, Bill Number, and Sales Date In.
 * @returns This function does not return a value; it creates a Chart.js dual-axis bar chart.
 *
 * @example
 * // Generate monthly sales and transaction trends
 * const salesData = [
 *   { Revenue: 500000, "Bill Number": "B001", "Sales Date In": new Date("2024-01-15") },
 *   { Revenue: 750000, "Bill Number": "B002", "Sales Date In": new Date("2024-02-15") }
 * ];
 * generatePenjualanBulananChart(salesData);
 * // Creates dual-axis chart showing monthly revenue and transaction trends
 */
function generatePenjualanBulananChart(data: any[]): void {
  const monthlyData = data.reduce((acc, d) => {
    const month = d['Sales Date In'].toISOString().slice(0, 7) // YYYY-MM
    if (!acc[month]) {
      acc[month] = { revenue: 0, bills: new Set() }
    }
    acc[month].revenue += d.Revenue
    acc[month].bills.add(d['Bill Number'])
    return acc
  }, {})

  const sortedMonths = Object.keys(monthlyData).toSorted()
  const salesData = sortedMonths.map((month) => monthlyData[month].revenue)
  const checkData = sortedMonths.map((month) => monthlyData[month].bills.size)

  $store.setChartDataForAIProperty('penjualanBulanan', sortedMonths.map((month, i) => ({ month, revenue: salesData[i], checks: checkData[i] })))

  createChart('penjualan-bulanan-chart', 'bar', {
    labels: sortedMonths,
    datasets: [
      {
        label: 'Total Penjualan',
        data: salesData,
        backgroundColor: '#3B82F6',
        yAxisID: 'y-sales',
      },
      {
        label: 'Total Check',
        data: checkData,
        backgroundColor: '#F97316',
        yAxisID: 'y-check',
      },
    ],
  }, {
    scales: {
      'y-sales': {
        type: 'linear',
        display: true,
        position: 'left',
        title: {
          display: true,
          text: 'Total Penjualan (Rp)',
        },
      },
      'y-check': {
        type: 'linear',
        display: true,
        position: 'right',
        title: {
          display: true,
          text: 'Total Check',
        },
        grid: {
          drawOnChartArea: false,
        },
      },
    },
  })
}

/**
 * Generate sales distribution donut chart by sales channel with AI data storage.
 *
 * @description
 * Analyzes sales data to calculate total revenue per sales channel (Visit Purpose)
 * and creates a donut chart showing revenue distribution across channels like
 * Dine-In, GoFood, GrabFood, etc. Stores processed channel data in chartDataForAI
 * for AI analysis and uses distinct colors for clear channel differentiation.
 *
 * @param data - Array of processed sales data rows with Revenue and Visit Purpose.
 * @returns This function does not return a value; it creates a Chart.js donut chart and stores data.
 *
 * @example
 * // Generate sales channel distribution chart
 * const salesData = [
 *   { Revenue: 500000, "Visit Purpose": "Dine-In" },
 *   { Revenue: 300000, "Visit Purpose": "GoFood" }
 * ];
 * generatePenjualanChannelChart(salesData);
 * // Creates donut chart showing revenue distribution by sales channel
 */
function generatePenjualanChannelChart(data: any[]): void {
  const channelSales = data.reduce((acc, d) => {
    const channel = d['Visit Purpose'] || 'Unknown'
    acc[channel] = (acc[channel] || 0) + d.Revenue
    return acc
  }, {})

  $store.setChartDataForAIProperty('penjualanChannel', channelSales)

  createChart('penjualan-channel-chart', 'doughnut', {
    labels: Object.keys(channelSales),
    datasets: [{
      data: Object.values(channelSales),
      backgroundColor: ['#3B82F6', '#10B981', '#F97316', '#8B5CF6', '#EC4899', '#F59E0B'],
    }],
  })
}

/**
 * Generate multiple charts analyzing order patterns by menu categories and top items.
 *
 * @description
 * Creates three comprehensive charts for menu analysis: (1) donut chart showing
 * order quantity distribution by menu category, (2) horizontal bar chart of top 5
 * best-selling food items (excluding packages), and (3) horizontal bar chart of
 * top 5 best-selling beverage items (excluding packages). Stores all processed
 * data in chartDataForAI for AI analysis and business insights.
 *
 * @param data - Array of processed sales data rows with Quantity, Menu Category, and Menu.
 * @returns This function does not return a value; it creates multiple Chart.js charts and stores data.
 *
 * @example
 * // Generate comprehensive menu category analysis
 * const salesData = [
 *   { Quantity: 10, "Menu Category": "MAKANAN", Menu: "Nasi Goreng" },
 *   { Quantity: 15, "Menu Category": "MINUMAN", Menu: "Es Teh" }
 * ];
 * generateOrderByCategoryCharts(salesData);
 * // Creates donut chart and top 5 food/beverage bar charts
 */
function generateOrderByCategoryCharts(data: any[]): void {
  // Chart 1: Order by Menu Category
  const byMenuCategory = data.reduce((acc, d) => {
    const category = d['Menu Category'] || 'Unknown'
    acc[category] = (acc[category] || 0) + d.Quantity
    return acc
  }, {})
  $store.setChartDataForAIProperty('orderByCategory', byMenuCategory)
  createChart('order-by-menu-category-chart', 'doughnut', {
    labels: Object.keys(byMenuCategory),
    datasets: [{ data: Object.values(byMenuCategory), backgroundColor: ['#10B981', '#3B82F6', '#F97316', '#8B5CF6', '#EC4899', '#F59E0B'] }],
  })

  // Top 5 Makanan
  const byMakanan = data
    .filter((d) => d['Item Group'] === 'MAKANAN' && !(d['Item Name'] || '').includes('(PACKAGE)'))
    .reduce((acc, d) => {
      const menu = d['Item Name'] || 'Unknown'
      acc[menu] = (acc[menu] || 0) + d.Quantity
      return acc
    }, {})
  const top5Makanan = Object.entries(byMakanan).toSorted((a, b) => b[1] - a[1]).slice(0, 5)
  $store.setChartDataForAIProperty('topMakanan', Object.fromEntries(top5Makanan)) // Store for AI
  createChart('top-makanan-chart', 'bar', {
    labels: top5Makanan.map((item) => item[0]),
    datasets: [{
      label: 'Quantity Sold',
      data: top5Makanan.map((item) => item[1]),
      backgroundColor: '#EF4444',
    }],
  }, { indexAxis: 'y', plugins: { legend: { display: false } } })

  // Top 5 Minuman
  const byMinuman = data
    .filter((d) => d['Item Group'] === 'MINUMAN' && !(d['Item Name'] || '').includes('(PACKAGE)'))
    .reduce((acc, d) => {
      const menu = d['Item Name'] || 'Unknown'
      acc[menu] = (acc[menu] || 0) + d.Quantity
      return acc
    }, {})
  const top5Minuman = Object.entries(byMinuman).toSorted((a, b) => b[1] - a[1]).slice(0, 5)
  $store.setChartDataForAIProperty('topMinuman', Object.fromEntries(top5Minuman)) // Store for AI
  createChart('top-minuman-chart', 'bar', {
    labels: top5Minuman.map((item) => item[0]),
    datasets: [{
      label: 'Quantity Sold',
      data: top5Minuman.map((item) => item[1]),
      backgroundColor: '#3B82F6',
    }],
  }, { indexAxis: 'y', plugins: { legend: { display: false } } })
}

/**
 * Generate hourly average Total Check chart with AI data storage for PDF reports.
 *
 * @description
 * Creates a line chart showing average transaction count per hour across the
 * analysis period. Calculates unique bill count per hour and divides by total
 * days to get hourly averages. Stores hourly TC data in global chartDataForAI
 * for AI analysis and insights generation. Helps identify peak transaction hours
 * and optimize staffing and operational planning.
 *
 * @param data - Array of processed sales data rows with Bill Number and Sales Date In.
 * @returns This function does not return a value; it creates a Chart.js line chart and stores AI data.
 *
 * @example
 * // Generate hourly average TC chart with AI data
 * const salesData = [
 *   { "Bill Number": "B001", "Sales Date In": new Date("2024-01-15T14:30:00") },
 *   { "Bill Number": "B002", "Sales Date In": new Date("2024-01-15T19:45:00") },
 *   { "Bill Number": "B003", "Sales Date In": new Date("2024-01-16T14:15:00") }
 * ];
 * generateTcHarianJamChart(salesData);
 * // Creates line chart and stores data in chartDataForAI['tcJamRataRata']
 */
function generateTcHarianJamChart(data: any[]): void {
  const hourlyTc = Array(24).fill(0)
  const daysInPeriod = (new Date(document.getElementById('date-end').value) - new Date(document.getElementById('date-start').value)) / (1000 * 60 * 60 * 24) + 1

  const billsByHour = {}

  data.forEach((d) => {
    const hour = d['Sales Date In'].getHours()
    const billNumber = d['Bill Number']
    if (!billsByHour[hour]) {
      billsByHour[hour] = new Set()
    }
    billsByHour[hour].add(billNumber)
  })

  for (let i = 0; i < 24; i++) {
    if (billsByHour[i]) {
      hourlyTc[i] = billsByHour[i].size / daysInPeriod
    }
  }

  $store.setChartDataForAIProperty('tcJamRataRata', hourlyTc)

  createChart('tc-jam-chart-pdf', 'line', {
    labels: Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, '0')),
    datasets: [{
      label: 'Rata-Rata TC per Jam',
      data: hourlyTc,
      borderColor: '#F97316',
      tension: 0.1,
    }],
  })
}

/**
 * Generate comprehensive branch performance analysis with multiple visualizations.
 *
 * @description
 * Analyzes sales data to calculate key branch performance metrics including total revenue,
 * transaction count, and Average Per Customer (APC). Creates multiple visualizations:
 * donut chart for revenue distribution, dual-axis chart for revenue vs transactions,
 * APC comparison chart, stat cards for top performers, and detailed comparison table.
 * Stores processed data for AI analysis integration.
 *
 * @param data - Array of processed sales data rows with Revenue, Bill Number, and Branch properties.
 * @returns This function does not return a value; it creates multiple charts and updates UI elements.
 *
 * @example
 * // Generate comprehensive branch analysis
 * const salesData = [
 *   { Revenue: 2000000, "Bill Number": "001", Branch: "Jakarta Pusat" },
 *   { Revenue: 1500000, "Bill Number": "002", Branch: "Bandung" }
 * ];
 * generateCabangAnalysis(salesData);
 * // Creates donut chart, bar charts, stat cards, and comparison table
 */
function generateCabangAnalysis(data: any[]): void {
  if (data.length === 0) return

  const cabangStats = data.reduce((acc, d) => {
    const branch = d.Branch || 'Unknown'
    if (!acc[branch]) {
      acc[branch] = { revenue: 0, bills: new Set() }
    }
    acc[branch].revenue += d.Revenue
    acc[branch].bills.add(d['Bill Number'])
    return acc
  }, {})

  const processedStats = Object.entries(cabangStats).map(([name, stats]) => {
    const totalCheck = stats.bills.size
    const totalRevenue = stats.revenue
    const avgCheck = totalCheck > 0 ? totalRevenue / totalCheck : 0
    return { name, totalRevenue, totalCheck, avgCheck }
  })

  createChart('kontribusi-cabang-chart-pdf', 'doughnut', {
    labels: processedStats.map((s) => s.name),
    datasets: [{
      label: 'Kontribusi Omzet',
      data: processedStats.map((s) => s.totalRevenue),
      backgroundColor: ['#3B82F6', '#10B981', '#F97316', '#8B5CF6', '#EC4899', '#F59E0B'],
    }],
  }, {
    plugins: {
      legend: {
        display: false,
      },
    },
  })

  // --- Populate Stat Cards ---
  const formatCurrency = (value) => `Rp${value.toLocaleString('id-ID', { maximumFractionDigits: 0 })}`

  // Omzet Tertinggi
  const topOmzet = [...processedStats].toSorted((a, b) => b.totalRevenue - a.totalRevenue)[0]
  if (topOmzet) {

    document.getElementById('cabang-omzet-tertinggi-nama').textContent = topOmzet.name
    document.getElementById('cabang-omzet-tertinggi-nilai').textContent = formatCurrency(topOmzet.totalRevenue)
  }

  // Cabang Paling Ramai
  const topCheck = [...processedStats].toSorted((a, b) => b.totalCheck - a.totalCheck)[0]
  if (topCheck) {
    document.getElementById('cabang-ramai-nama').textContent = topCheck.name
    document.getElementById('cabang-ramai-nilai').textContent = `${topCheck.totalCheck.toLocaleString('id-ID')} checks`
  }

  // APC Tertinggi
  const topApc = [...processedStats].toSorted((a, b) => b.avgCheck - a.avgCheck)[0]
  if (topApc) {
    document.getElementById('cabang-apc-tertinggi-nama').textContent = topApc.name
    document.getElementById('cabang-apc-tertinggi-nilai').textContent = formatCurrency(topApc.avgCheck)
  }

  // --- Create Charts ---
  const sortedByRevenue = [...processedStats].toSorted((a, b) => b.totalRevenue - a.totalRevenue)
  const labels = sortedByRevenue.map((s) => s.name)

  $store.setChartDataForAIProperty('cabangOmzetCheck', processedStats.map((s) => ({ branch: s.name, revenue: s.totalRevenue, transactions: s.totalCheck })))

  // Omzet & Check Chart
  createChart('cabang-omzet-check-chart', 'bar', {
    labels,
    datasets: [
      {
        type: 'bar',
        label: 'Total Omzet',
        data: sortedByRevenue.map((s) => s.totalRevenue),
        backgroundColor: '#4F46E5',
        yAxisID: 'y-omzet',
      },
      {
        type: 'line',
        label: 'Total Check',
        data: sortedByRevenue.map((s) => s.totalCheck),
        borderColor: '#F97316',
        backgroundColor: '#F97316',
        tension: 0.1,
        yAxisID: 'y-check',
      },
    ],
  }, {
    scales: {
      'y-omzet': {
        type: 'linear',
        display: true,
        position: 'left',
        title: { display: true, text: 'Total Omzet (Rp)' },
      },
      'y-check': {
        type: 'linear',
        display: true,
        position: 'right',
        title: { display: true, text: 'Total Check' },
        grid: { drawOnChartArea: false },
      },
    },
  })

  // APC Chart
  const sortedByApc = [...processedStats].toSorted((a, b) => b.avgCheck - a.avgCheck)
  $store.setChartDataForAIProperty('cabangApc', Object.fromEntries(sortedByApc.map((s) => [s.name, s.avgCheck])))
  createChart('cabang-apc-chart', 'bar', {
    labels: sortedByApc.map((s) => s.name),
    datasets: [{
      label: 'Average Check (APC)',
      data: sortedByApc.map((s) => s.avgCheck),
      backgroundColor: '#10B981',
    }],
  }, {
    plugins: { legend: { display: false } },
    scales: {
      y: {
        beginAtZero: true,
        ticks: {
          callback: function (value) { return formatCurrency(value) },
        },
      },
    },
  })

  // --- Populate Detail Table ---
  const tbody = document.getElementById('cabang-detail-tbody')
  tbody.innerHTML = ''
  sortedByRevenue.forEach((s) => {
    const tr = document.createElement('tr')
    tr.innerHTML = `
                    <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">${s.name}</td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${formatCurrency(s.totalRevenue)}</td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${s.totalCheck.toLocaleString('id-ID')}</td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${formatCurrency(s.avgCheck)}</td>
                `
    tbody.appendChild(tr)
  })
  $store.setChartDataForAIProperty('cabangDetail', sortedByRevenue)
}

/**
 * Orchestrator for the "Analisis Perbandingan Cabang > Aspek Produk dan Channel" section.
 */
function generateCabangProdukChannelSection() {
    if (!currentUser) return;
    const period = (document.getElementById('cabang-produk-channel-period-select') as HTMLSelectElement).value;
    const branchA = (document.getElementById('cabang-produk-channel-branch-a-select') as HTMLSelectElement).value;
    const branchB = (document.getElementById('cabang-produk-channel-branch-b-select') as HTMLSelectElement).value;

    if (!period || !branchA || !branchB || branchA === branchB) return;

    const periodData = $store.getAllSalesData().filter(s => s.date.toISOString().startsWith(period));

    setupBranchMenuTrendChart(periodData, branchA, branchB);
    generateBranchCategoryComparisonChart(periodData, branchA, branchB, 'cabang-category-comparison-chart');
    generateBranchChannelComparisonChart(periodData, branchA, branchB, 'cabang-channel-comparison-chart');

    $store.setActiveViewData('cabang-produk-channel', periodData, { period, branchA, branchB });
}

/**
 * Sets up the selectors for the "Cabang > Produk dan Channel" section.
 */
async function setupCabangProdukChannelSelectors() {
    if ($store.getInitFlag('cabangProdukChannelSelectorsInitialized')) return;
    const periodSelect = document.getElementById('cabang-produk-channel-period-select') as HTMLSelectElement;
    const branchASelect = document.getElementById('cabang-produk-channel-branch-a-select') as HTMLSelectElement;
    const branchBSelect = document.getElementById('cabang-produk-channel-branch-b-select') as HTMLSelectElement;

    const periods = [...new Set($store.getAllSalesData().map(s => s.date.toISOString().slice(0, 7)))].toSorted().reverse();
    const branches = [...new Set($store.getAllSalesData().flatMap(s => Object.keys(s.revenueByBranch || {})))].toSorted();

    if (periods.length === 0 || branches.length < 2) { return; }

    periodSelect.innerHTML = periods.map(p => `<option value="${p}">${new Date(p + '-02').toLocaleString('default', { month: 'long', year: 'numeric' })}</option>`).join('');
    branchASelect.innerHTML = branches.map(b => `<option value="${b}">${b}</option>`).join('');
    branchBSelect.innerHTML = branches.map(b => `<option value="${b}">${b}</option>`).join('');

    branchASelect.value = branches[0];
    branchBSelect.value = branches[1];

    const handler = () => generateCabangProdukChannelSection();
    periodSelect.addEventListener('change', handler);
    branchASelect.addEventListener('change', handler);
    branchBSelect.addEventListener('change', handler);

    $store.setInitFlag('cabangProdukChannelSelectorsInitialized', true);
    generateCabangProdukChannelSection();
}

/**
 * Sets up the interactive menu trend chart for comparing two branches.
 */
function setupBranchMenuTrendChart(periodData: any[], branchA: string, branchB: string) {
    const existingSelect = $store.getUIComponent('cabangMenuTrendSelect');
    if (existingSelect) {
        existingSelect.destroy();
    }
    const selectEl = document.getElementById('cabang-menu-trend-select') as HTMLSelectElement;
    const branchAData = periodData.filter(s => s.revenueByBranch?.[branchA] !== undefined);
    const branchBData = periodData.filter(s => s.revenueByBranch?.[branchB] !== undefined);
    const combinedData = [...branchAData, ...branchBData];

    const allMenuItems = [...new Set(combinedData.flatMap(s => Object.keys(s.menuItemQuantities || {}).flatMap(cat => Object.keys(s.menuItemQuantities[cat]))))].toSorted();

    selectEl.innerHTML = allMenuItems.map(name => `<option value="${name}">${name}</option>`).join('');

    // Store cabangMenuTrendSelect instance for cleanup on view reset
    $store.setUIComponent(
      'cabangMenuTrendSelect',
      new SlimSelect({
        select: '#cabang-menu-trend-select',
        events: { afterChange: () => drawBranchMenuTrendChart(periodData, branchA, branchB) }
      }),
      ($select) => $select.setSelected(allMenuItems.slice(0, 3)),
    );
}

function drawBranchMenuTrendChart(periodData: any[], branchA: string, branchB: string) {
    const cabangMenuSelect = $store.getUIComponent('cabangMenuTrendSelect');
    if (!cabangMenuSelect) return;

    const selectedMenus = cabangMenuSelect.getSelected() as string[];
    const labels = Array.from({ length: 31 }, (_, i) => i + 1); // Days 1-31
    const colors = ['#3B82F6', '#10B981', '#F97316', '#8B5CF6', '#EF4444'];

    // Helper function to get daily sales quantity for a specific menu at a specific branch
    const getDailyMenuDataForBranch = (data: any[], branchName: string, menuName: string) => {
        const dailyQuantities = Array(31).fill(null);
        const branchData = data.filter(s => s.revenueByBranch?.[branchName] !== undefined);

        branchData.forEach(s => {
            const dayIndex = s.date.getDate() - 1;
            let qty = 0;
            // Sum quantity from all categories in case menu name exists in multiple
            if (s.menuItemQuantities) {
                for (const category in s.menuItemQuantities) {
                    if (s.menuItemQuantities[category][menuName]) {
                        qty += s.menuItemQuantities[category][menuName];
                    }
                }
            }
            if (qty > 0) {
                 dailyQuantities[dayIndex] = (dailyQuantities[dayIndex] || 0) + qty;
            }
        });
        return dailyQuantities;
    };

    // Create a pair of datasets (Branch A and Branch B) for each selected menu
    const datasets = selectedMenus.flatMap((menuName, index) => {
        const color = colors[index % colors.length];
        return [
            {
                label: `${menuName} (${branchA})`,
                data: getDailyMenuDataForBranch(periodData, branchA, menuName),
                borderColor: color,
                borderDash: [5, 5], // Dashed line for Branch A
                tension: 0.1,
                spanGaps: true,
            },
            {
                label: `${menuName} (${branchB})`,
                data: getDailyMenuDataForBranch(periodData, branchB, menuName),
                borderColor: color,
                borderDash: [], // Solid line for Branch B
                tension: 0.1,
                spanGaps: true
            }
        ];
    });

    createChart('cabang-menu-trend-chart', 'line', {
        labels,
        datasets
    }, {
        plugins: {
            tooltip: {
                mode: 'index',
                intersect: false
            }
        },
        scales: {
            x: { title: { display: true, text: 'Day of Month' } },
            y: { title: { display: true, text: 'Quantity Sold' } }
        }
    });
}

/**
 * Generates a grouped bar chart comparing menu category quantities between two branches.
 */
function generateBranchCategoryComparisonChart(periodData: any[], branchA: string, branchB: string, canvasId: string) {
    const branchAData = periodData.filter(s => s.revenueByBranch?.[branchA] !== undefined);
    const branchBData = periodData.filter(s => s.revenueByBranch?.[branchB] !== undefined);
    const allCategories = [...new Set([...branchAData, ...branchBData].flatMap(s => Object.keys(s.menuCategories || {})))];

    const getData = (data) => allCategories.map(cat => data.reduce((sum, s) => sum + (s.menuCategories?.[cat]?.quantity || 0), 0));

    createChart(canvasId, 'bar', {
        labels: allCategories,
        datasets: [
            { label: branchA, data: getData(branchAData), backgroundColor: '#9CA3AF' },
            { label: branchB, data: getData(branchBData), backgroundColor: '#4F46E5' }
        ]
    });
}

/**
 * Generates a grouped bar chart comparing channel revenue between two branches.
 */
function generateBranchChannelComparisonChart(periodData: any[], branchA: string, branchB: string, canvasId: string) {
    const branchAData = periodData.filter(s => s.revenueByBranch?.[branchA] !== undefined);
    const branchBData = periodData.filter(s => s.revenueByBranch?.[branchB] !== undefined);
    const allChannels = [...new Set([...branchAData, ...branchBData].flatMap(s => Object.keys(s.revenueByVisitPurpose || {})))];

    const getData = (data) => allChannels.map(chan => data.reduce((sum, s) => sum + (s.revenueByVisitPurpose?.[chan] || 0), 0));

    createChart(canvasId, 'bar', {
        labels: allChannels,
        datasets: [
            { label: branchA, data: getData(branchAData), backgroundColor: '#9CA3AF' },
            { label: branchB, data: getData(branchBData), backgroundColor: '#4F46E5' }
        ]
    }, { scales: { y: { ticks: { callback: shortenCurrency } } } });
}

// Add these two new functions to main.ts

/**
 * Generate multi-week trend comparison chart for TC, APC, or Sales metrics.
 *
 * @description
 * Groups sales data by ISO week and day of week to create multi-line chart
 * comparing trends across the last 5 weeks. Each line represents a different
 * week showing daily patterns for the selected metric (Total Check, Average
 * Per Customer, or Sales revenue). Uses ISO week numbering and displays
 * Monday-Sunday patterns for weekly performance comparison.
 *
 * @param data - Array of sales data rows with Revenue, Bill Number, and Sales Date In.
 * @param canvasId - Canvas element ID where the chart will be rendered.
 * @param metric - Metric type to display: 'TC' (Total Check), 'APC' (Average Per Customer), or 'Sales'.
 * @returns This function does not return a value; it creates a Chart.js multi-line chart.
 *
 * @example
 * // Generate multi-week APC trend comparison
 * const salesData = [
 *   { Revenue: 50000, "Bill Number": "B001", "Sales Date In": new Date("2024-01-15") },
 *   { Revenue: 75000, "Bill Number": "B002", "Sales Date In": new Date("2024-01-22") }
 * ];
 * generateMultiWeekTrendChart(salesData, 'weekly-trend-canvas', 'APC');
 * // Creates chart comparing APC patterns across last 5 weeks
 */
function generateMultiWeekTrendChart(data: any[], canvasId: string, metric: string): void {
  if (data.length === 0) return;

  const getWeekNumber = (d) => {
    d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    return `${d.getUTCFullYear()}-W${weekNo}`;
  };

  const weeklyData = data.reduce((acc, d) => {
    const week = getWeekNumber(d['Sales Date In']);
    const day = (d['Sales Date In'].getDay() + 6) % 7; // Monday = 0, Sunday = 6

    if (!acc[week]) {
      acc[week] = Array(7).fill(0).map(() => ({ revenue: 0, bills: new Set() }));
    }
    acc[week][day].revenue += d.Revenue;
    acc[week][day].bills.add(d['Bill Number']);
    return acc;
  }, {});

  const labels = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];
  const colors = ['#4F46E5', '#3B82F6', '#60A5FA', '#9CA3AF', '#6B7280'];
  let colorIndex = 0;

  const datasets = Object.keys(weeklyData).map((week, index) => {
    const weekLabel = `Minggu ${index + 1}`;
    const weekValues = weeklyData[week].map(dayData => {
      if (metric === 'TC') {
        return dayData.bills.size;
      }
      if (metric === 'APC') {
        return dayData.bills.size > 0 ? dayData.revenue / dayData.bills.size : 0;
      }
      if (metric === 'Sales') {
        return dayData.revenue;
      }
      return 0;
    });

    const color = colors[colorIndex % colors.length];
    colorIndex++;

    return {
      label: weekLabel,
      data: weekValues,
      borderColor: color,
      backgroundColor: color,
      tension: 0.2,
      fill: false,
    };
  }).slice(-5); // Only show the last 5 weeks for clarity

  createChart(canvasId, 'line', { labels, datasets });
}


/**
 * Generate static weekend business insights for global store.
 *
 * @description
 * Populates global store with predefined weekend analysis insights including
 * main weekend revenue optimization recommendations, traffic trend observations,
 * and sales channel preferences. These static insights provide business guidance
 * for weekend operations, emphasizing the importance of weekend performance
 * and channel-specific customer behavior patterns.
 *
 * @param data - Array of processed sales data (used for validation but insights are static).
 * @returns This function does not return a value; it updates global store with weekend insights.
 *
 * @example
 * // Generate weekend insights for business recommendations
 * const salesData = [
 *   { Revenue: 500000, "Sales Date In": new Date("2024-01-13") }, // Saturday
 *   { Revenue: 600000, "Sales Date In": new Date("2024-01-14") }  // Sunday
 * ];
 * generateWeekendInsights(salesData);
 * // Updates store with mainWeekendInsight, tcTrendInsight, and salesChannelInsight
 */
function generateWeekendInsights(data: any[]): void {
    if (data.length === 0) return;
    $store.setStorePartial({
        mainWeekendInsight: 'Berikan yang terbaik selama weekend untuk meningkatkan omzetmu secara signifikan.',
        tcTrendInsight: 'Data menunjukkan lonjakan traffic yang konsisten terjadi pada hari Sabtu dan Minggu, manfaatkan momentum ini.',
        salesChannelInsight: 'Analisis mendalam menunjukkan bahwa Dine-in mendominasi pada jam sarapan, sementara layanan delivery seperti GrabFood lebih diminati untuk makan siang dan malam.',
    });
}

/**
 * Generate comprehensive Year-over-Year analysis with interactive year selection and visualizations.
 *
 * @description
 * Creates comprehensive YoY analysis comparing selected year with previous year data.
 * Initializes year selector dropdown, calculates key metrics (revenue, TC, APC) with
 * growth percentages, generates monthly comparison line chart, and updates UI with
 * formatted statistics. Stores YoY data in global chartDataForAI for AI analysis
 * and provides interactive year selection functionality.
 *
 * @param data - Array of all sales data rows with Revenue, Bill Number, and Sales Date In.
 * @returns This function does not return a value; it creates charts, updates UI, and stores AI data.
 *
 * @example
 * // Generate YoY analysis with interactive year selection
 * const allSalesData = [
 *   { Revenue: 500000, "Bill Number": "B001", "Sales Date In": new Date("2024-01-15") },
 *   { Revenue: 450000, "Bill Number": "B002", "Sales Date In": new Date("2023-01-15") }
 * ];
 * generateYoYAnalysis(allSalesData);
 * // Creates year selector, KPI cards, monthly comparison chart, and detailed table
 */
function generateYoYAnalysis(data: any[]): void {
  const yearSelect = document.getElementById('yoy-year-select')

  // --- Populate Year Selector (only once) ---
  if (!$store.getInitFlag('yoyYearSelectInitialized')) {
    const years = [...new Set(data.map((d) => d['Sales Date In'].getFullYear()))].toSorted((a, b) => b - a)
    yearSelect.innerHTML = years.map((y) => `<option value="${y}">${y}</option>`).join('')
    yearSelect.addEventListener('change', () => generateYoYAnalysis($store.getAllSalesData()))
    $store.setInitFlag('yoyYearSelectInitialized', true)
  }

  const selectedYear = parseInt(yearSelect.value)
  if (isNaN(selectedYear)) return

  const prevYear = selectedYear - 1

  // --- Filter Data ---
  const currentYearData = data.filter((d) => d['Sales Date In'].getFullYear() === selectedYear)
  const prevYearData = data.filter((d) => d['Sales Date In'].getFullYear() === prevYear)

  // --- Calculate Overall Stats ---
  /**
   * Calculates overall statistics from a sales dataset.
   * @param {Array} dataset - The sales data array to be analyzed.
   * @returns {Object} An object containing revenue, checks, and apc.
   * @property {number} revenue - The total revenue from the dataset.
   * @property {number} checks - The number of unique transactions based on Bill Number.
   * @property {number} apc - The average value per transaction (Revenue / Checks).
   */
  const calcStats = (dataset) => {
    if (dataset.length === 0) return { revenue: 0, checks: 0, apc: 0 }
    const revenue = dataset.reduce((sum, d) => sum + d.Revenue, 0)
    const checks = new Set(dataset.map((d) => d['Bill Number'])).size
    const apc = checks > 0 ? revenue / checks : 0
    return { revenue, checks, apc }
  }

  const currentYearStats = calcStats(currentYearData)
  const prevYearStats = calcStats(prevYearData)

  // --- Update KPI Cards ---
  /**
   * Calculates the growth percentage between a current and a previous value.
   * @param {number} current - The current value.
   * @param {number} previous - The previous period's value.
   * @returns {Object} An object containing the growth text and a CSS class for styling.
   * @property {string} text - The growth text formatted as a percentage.
   * @property {string} class - The CSS class for color (green for positive, red for negative).
   */
  const calcGrowth = (current, previous) => {
    if (previous === 0) return { text: 'N/A', class: 'text-gray-500' }
    const growth = ((current - previous) / previous) * 100
    const sign = growth >= 0 ? '+' : ''
    const colorClass = growth >= 0 ? 'text-green-600' : 'text-red-600'
    return { text: `${sign}${growth.toFixed(1)}%`, class: colorClass }
  }

  const omzetGrowth = calcGrowth(currentYearStats.revenue, prevYearStats.revenue)
  const checkGrowth = calcGrowth(currentYearStats.checks, prevYearStats.checks)
  const apcGrowth = calcGrowth(currentYearStats.apc, prevYearStats.apc)

  document.getElementById('yoy-omzet-growth').textContent = omzetGrowth.text
  document.getElementById('yoy-omzet-growth').className = `text-4xl font-bold mt-2 ${omzetGrowth.class}`
  document.getElementById('yoy-check-growth').textContent = checkGrowth.text
  document.getElementById('yoy-check-growth').className = `text-4xl font-bold mt-2 ${checkGrowth.class}`
  document.getElementById('yoy-apc-growth').textContent = apcGrowth.text
  document.getElementById('yoy-apc-growth').className = `text-4xl font-bold mt-2 ${apcGrowth.class}`

  // --- Prepare Monthly Data for Chart & Table ---
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const monthlyData = Array.from({ length: 12 }, (_, i) => ({
    month: monthNames[i],
    currentRevenue: 0,
    prevRevenue: 0,
  }))

  currentYearData.forEach((d) => {
    monthlyData[d['Sales Date In'].getMonth()].currentRevenue += d.Revenue
  })
  prevYearData.forEach((d) => {
    monthlyData[d['Sales Date In'].getMonth()].prevRevenue += d.Revenue
  })

  $store.setChartDataForAIProperty('yoyOmzet', {
    year: selectedYear,
    previous_year: prevYear,
    monthly_comparison: monthlyData,
  })

  // --- Create Chart ---
  createChart('yoy-omzet-chart', 'line', {
    labels: monthNames,
    datasets: [
      {
        label: `Omzet ${prevYear}`,
        data: monthlyData.map((m) => m.prevRevenue),
        borderColor: '#9CA3AF',
        backgroundColor: '#9CA3AF',
        tension: 0.1,
      },
      {
        label: `Omzet ${selectedYear}`,
        data: monthlyData.map((m) => m.currentRevenue),
        borderColor: '#4F46E5',
        backgroundColor: '#4F46E5',
        tension: 0.1,
      },
    ],
  })

  // --- Populate Detail Table ---
  const tbody = document.getElementById('yoy-detail-tbody')
  const formatCurrency = (value) => `Rp${value.toLocaleString('id-ID', { maximumFractionDigits: 0 })}`
  tbody.innerHTML = ''
  monthlyData.forEach((m) => {
    const growth = calcGrowth(m.currentRevenue, m.prevRevenue)
    const tr = document.createElement('tr')
    tr.innerHTML = `
                    <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">${m.month}</td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${formatCurrency(m.prevRevenue)}</td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${formatCurrency(m.currentRevenue)}</td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm font-medium ${growth.class}">${growth.text}</td>
                `
    tbody.appendChild(tr)
  })
  $store.setChartDataForAIProperty('yoyDetail', monthlyData)
}

function generateDailyRecap(data: any[], fileName: string) {
    if (data.length === 0) {
        alert('No data available to generate a recap.');
        return;
    }

    const container = document.getElementById('daily-recap-container');
    container.innerHTML = '<div class="text-center p-8"><div class="loader"></div><p class="mt-2">Calculating daily summaries...</p></div>';

    const dataByDay = data.reduce((acc, d) => {
        const dateStr = d.date.toISOString().split('T')[0];
        if (!acc[dateStr]) acc[dateStr] = [];
        acc[dateStr].push(d);
        return acc;
    }, {});

    const sortedDates = Object.keys(dataByDay).toSorted();
    let recapHtml = '';

    sortedDates.forEach(dateStr => {
        const daySummary = dataByDay[dateStr][0];
        const date = new Date(dateStr);
        const formattedDate = date.toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        const formatCurrency = (value) => `Rp${Math.round(value).toLocaleString('id-ID')}`;

        const getTop5FromCategory = (categoryName: string) => {
            if (!daySummary.menuItemQuantities || !daySummary.menuItemQuantities[categoryName]) return [];
            return Object.entries(daySummary.menuItemQuantities[categoryName])
                .filter(([name]) => !name.includes('(PACKAGE)'))
                .toSorted((a, b) => b[1] - a[1])
                .slice(0, 5);
        };
        const top5Makanan = getTop5FromCategory('MAKANAN');
        const top5Minuman = getTop5FromCategory('MINUMAN');

        // --- NEW: Format Hourly Traffic Data ---
        let trafficHtml = '<p class="text-xs text-gray-500">No traffic data.</p>';
        if (daySummary.trafficByHour && daySummary.trafficByHour.length === 24) {
            trafficHtml = daySummary.trafficByHour
                .map((count, hour) => ({ hour, count }))
                .filter(item => item.count > 0)
                .map(item => `<li><span class="font-semibold w-16 inline-block">${String(item.hour).padStart(2, '0')}:00 :</span> ${item.count} bills</li>`)
                .join('');
        }

        const branches = daySummary.branches || ['N/A'];
        const brands = daySummary.brands || ['N/A'];
        const visitPurposes = daySummary.visitPurposes || {};
        const paymentMethods = daySummary.paymentMethods || {};
        const menuCategories = daySummary.menuCategories || {};
        const subtotal = daySummary.subtotal || 0;
        const totalDiscount = daySummary.totalDiscount || 0;
        const totalAfterDiscount = daySummary.totalOmzet || 0;

        recapHtml += `
            <div class="border rounded-lg">
                <button class="accordion-header w-full text-left p-4 bg-gray-50 hover:bg-gray-100 flex justify-between items-center">
                    <span class="font-semibold text-gray-700">${formattedDate}</span>
                    <svg class="w-5 h-5 transform transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
                </button>
                <div class="accordion-content hidden p-4 border-t bg-white">
                    <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <!-- Column 1: General Info -->
                        <div class="space-y-4">
                            <div><h5 class="font-bold text-sm mb-1">Branch & Brand</h5>
                                <p class="text-xs">(${branches.length}) ${branches.join(', ')}</p>
                                <p class="text-xs">(${brands.length}) ${brands.join(', ')}</p>
                            </div>
                            <div><h5 class="font-bold text-sm mb-1">Visit Purpose</h5>
                                <ul class="text-xs list-disc pl-4">${Object.entries(visitPurposes).map(([p, c]) => `<li>${p}: ${c}</li>`).join('')}</ul>
                            </div>
                            <div><h5 class="font-bold text-sm mb-1">Payment Method</h5>
                                <ul class="text-xs list-disc pl-4">${Object.entries(paymentMethods).map(([m, r]) => `<li>${m}: ${formatCurrency(r)}</li>`).join('')}</ul>
                            </div>
                            <!-- NEW: Traffic per Hour Section -->
                            <div><h5 class="font-bold text-sm mb-1">Traffic per Hour</h5>
                                <ul class="text-xs">${trafficHtml}</ul>
                            </div>
                        </div>
                        <!-- Column 2: Menu Info -->
                        <div class="space-y-4">
                             <div><h5 class="font-bold text-sm mb-1">Menu Category Summary</h5>
                                <ul class="text-xs list-disc pl-4">${Object.entries(menuCategories).map(([cat, catData]) => `<li>${cat}: ${formatCurrency(catData.revenue)} (${catData.quantity} items)</li>`).join('')}</ul>
                            </div>
                            <div><h5 class="font-bold text-sm mb-1">Top 5 Makanan (by Qty)</h5>
                                <ol class="text-xs list-decimal pl-4">${top5Makanan.map(([name, qty]) => `<li>${name} (${qty})</li>`).join('')}</ol>
                            </div>
                            <div><h5 class="font-bold text-sm mb-1">Top 5 Minuman (by Qty)</h5>
                                <ol class="text-xs list-decimal pl-4">${top5Minuman.map(([name, qty]) => `<li>${name} (${qty})</li>`).join('')}</ol>
                            </div>
                        </div>
                        <!-- Column 3: Financials -->
                        <div class="space-y-2 bg-indigo-50 p-3 rounded-lg">
                            <h5 class="font-bold text-sm mb-2 text-center">Financial Summary</h5>
                            <div class="flex justify-between text-xs"><span class="text-gray-600">Subtotal:</span><span class="font-mono">${formatCurrency(subtotal)}</span></div>
                            <div class="flex justify-between text-xs"><span class="text-gray-600">Total Discount:</span><span class="font-mono text-red-600">${formatCurrency(totalDiscount)}</span></div>
                            <div class="flex justify-between text-sm font-bold border-t pt-1 mt-1"><span class="text-gray-800">Total Nett Sales:</span><span class="font-mono text-green-700">${formatCurrency(totalAfterDiscount)}</span></div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    });

    document.getElementById('summary-modal-title').textContent = `Daily Recap for ${fileName}`;
    container.innerHTML = recapHtml;

    container.querySelectorAll('.accordion-header').forEach(button => {
        button.addEventListener('click', () => {
            const content = button.nextElementSibling;
            const icon = button.querySelector('svg');
            content.classList.toggle('hidden');
            icon.classList.toggle('rotate-180');
        });
    });

    document.getElementById('summary-modal').classList.remove('hidden');
}

function generateMonthlySummary(dailySummaries: any[], fileName: string) {
    if (dailySummaries.length === 0) return;

    const formatCurrency = (value) => `Rp${Math.round(value).toLocaleString('id-ID')}`;

    // --- 1. Aggregate all daily summaries ---
    const monthly = dailySummaries.reduce((acc, s) => {
        acc.totalOmzet += s.totalOmzet || 0;
        acc.totalTransactions += s.totalTransactions || 0;
        acc.totalItemsSold += s.totalItemsSold || 0;
        if (s.date < acc.minDate) acc.minDate = s.date;
        if (s.date > acc.maxDate) acc.maxDate = s.date;

        // Aggregate nested objects
        const aggregateNested = (target, source) => {
            for (const key in source) {
                target[key] = (target[key] || 0) + source[key];
            }
        };

        aggregateNested(acc.revenueByBranch, s.revenueByBranch);
        aggregateNested(acc.billsByChannel, s.visitPurposes); // visitPurposes holds the bill count per channel

        if (s.menuItemQuantities) {
            for (const category in s.menuItemQuantities) {
                if (!acc.itemQuantities[category]) acc.itemQuantities[category] = {};
                aggregateNested(acc.itemQuantities[category], s.menuItemQuantities[category]);
            }
        }
        return acc;
    }, {
        totalOmzet: 0, totalTransactions: 0, totalItemsSold: 0,
        minDate: dailySummaries[0].date, maxDate: dailySummaries[0].date,
        revenueByBranch: {}, billsByChannel: {}, itemQuantities: {}
    });

    // --- 2. Calculate final metrics ---
    const apc = monthly.totalTransactions > 0 ? monthly.totalOmzet / monthly.totalTransactions : 0;
    const dateRange = `${monthly.minDate.toLocaleDateString('id-ID')} - ${monthly.maxDate.toLocaleDateString('id-ID')}`;
    const totalDays = dailySummaries.length;
    const totalBranches = Object.keys(monthly.revenueByBranch).length;

    const getTop5 = (category) => Object.entries(monthly.itemQuantities[category] || {})
        .filter(([name]) => !name.includes('(PACKAGE)'))
        .toSorted((a, b) => b[1] - a[1])
        .slice(0, 5);

    const topMakanan = getTop5('MAKANAN');
    const topMinuman = getTop5('MINUMAN');

    // --- 3. Populate Modal ---
    document.getElementById('monthly-summary-modal-title').textContent = `Monthly Summary for ${fileName}`;
    document.getElementById('monthly-total-omzet').textContent = formatCurrency(monthly.totalOmzet);
    document.getElementById('monthly-total-transactions').textContent = monthly.totalTransactions.toLocaleString('id-ID');
    document.getElementById('monthly-apc').textContent = formatCurrency(apc);
    document.getElementById('monthly-total-items').textContent = monthly.totalItemsSold.toLocaleString('id-ID');
    document.getElementById('monthly-date-range').textContent = dateRange;
    document.getElementById('monthly-total-days').textContent = totalDays;
    document.getElementById('monthly-branch-count').textContent = totalBranches;

    document.getElementById('monthly-top-makanan').innerHTML = topMakanan.map(([name, qty]) => `<li>${name} (${qty})</li>`).join('');
    document.getElementById('monthly-top-minuman').innerHTML = topMinuman.map(([name, qty]) => `<li>${name} (${qty})</li>`).join('');
    document.getElementById('monthly-revenue-by-branch').innerHTML = Object.entries(monthly.revenueByBranch).map(([name, rev]) => `<li>${name}: ${formatCurrency(rev)}</li>`).join('');
    document.getElementById('monthly-bills-by-channel').innerHTML = Object.entries(monthly.billsByChannel).map(([name, count]) => `<li>${name}: ${count} bills</li>`).join('');

    // --- 4. Show Modal ---
    document.getElementById('monthly-summary-modal').classList.remove('hidden');
}

// --- Data History & Compilation ---
/**
 * Load and display user's sales data upload history from Firestore.
 *
 * @description
 * Fetches all upload records from the user's Firestore collection and renders
 * them as interactive list items in the upload history UI. Each item shows
 * the file name, upload timestamp, and action buttons (View/Delete). Displays
 * a "no uploads" message when the history is empty.
 *
 * @returns Promise that resolves when upload history is loaded and UI is updated.
 *
 * @example
 * // Load upload history for current user
 * await loadUploadHistory();
 * // Populates the upload history list with items like:
 * // "Sales_Jan_2024.xlsx - Uploaded on: 1/15/2024, 2:30:00 PM [View] [Delete]"
 */
async function loadUploadHistory(): Promise<void> {
  if (!currentUser) return;
  const historyCollectionRef = collection(db, `artifacts/sales-app/users/${currentUser.uid}/uploads`);
  const querySnapshot = await getDocs(query(historyCollectionRef, orderBy("createdAt", "desc")));

  uploadHistoryList.innerHTML = '';
  if (querySnapshot.empty) {
    uploadHistoryList.appendChild(noUploadsMsg);
  } else {
    noUploadsMsg.remove();
    querySnapshot.forEach((docSnap) => {
      const upload = docSnap.data();
      const div = document.createElement('div');
      div.className = 'flex justify-between items-center bg-gray-50 p-4 rounded-lg';

      // --- NEW: Check for and display duplicate count message ---
      let duplicateMessage = '';
      if (upload.duplicateCount && upload.duplicateCount > 0) {
          duplicateMessage = `<p class="text-xs text-orange-600 mt-1">Note: ${upload.duplicateCount} duplicate transactions were skipped.</p>`;
      }

      const displayName = upload.branchName && upload.period
        ? `<p class="font-semibold">${upload.branchName}</p><p class="text-sm text-gray-500">Periode: ${upload.period}</p>`
        : `<p class="font-semibold">${upload.name}</p><p class="text-sm text-gray-500">Uploaded on: ${new Date(upload.createdAt.seconds * 1000).toLocaleString()}</p>`;

      const fileNameForRecap = upload.branchName ? `${upload.branchName} - ${upload.period}` : upload.name;

      div.innerHTML = `
        <div>
            ${displayName}
            ${duplicateMessage}
        </div>
        <div>
            <button class="monthly-summary-btn bg-purple-500 text-white text-sm font-bold py-1 px-3 rounded-full hover:bg-purple-600 mr-2" data-id="${docSnap.id}" data-name="${fileNameForRecap}">Monthly Summary</button>
            <button class="summary-history-btn bg-gray-500 text-white text-sm font-bold py-1 px-3 rounded-full hover:bg-gray-600 mr-2" data-id="${docSnap.id}" data-name="${fileNameForRecap}">Daily Summary</button>
            <button class="view-history-btn bg-blue-500 text-white text-sm font-bold py-1 px-3 rounded-full hover:bg-blue-600" data-id="${docSnap.id}">View</button>
            <button class="delete-history-btn bg-red-500 text-white text-sm font-bold py-1 px-3 rounded-full hover:bg-red-600 ml-2" data-id="${docSnap.id}">Delete</button>
        </div>
      `;
      uploadHistoryList.appendChild(div);
    });
  }
}

/**
 * Fetch all bills for a specific upload from Firestore.
 *
 * @description
 * Retrieves all bill documents from the uploads/{uploadId}/bills subcollection.
 * Converts Firestore Timestamps to JavaScript Date objects for analysis compatibility.
 * Uses the new normalized schema with server-enforced alias fields.
 *
 * @param uploadId - Upload document ID containing the bills
 * @returns Promise resolving to array of all bill records with normalized fields
 *
 * @example
 * const salesData = await fetchAllBillsForUpload('upload123');
 * // Returns: [{ "Bill Number": "1", "Item Group": "Food", Revenue: 100 }, ...]
 */
async function fetchDailySummariesForUpload(uploadId: string): Promise<any[]> {
  if (!currentUser) return [];

  const summariesCollectionRef = collection(db, `artifacts/sales-app/users/${currentUser.uid}/uploads/${uploadId}/dailySummaries`);
  showLoading({ message: 'Fetching daily summaries...', value: 40 });
  const summariesSnapshot = await getDocs(summariesCollectionRef);

  const summariesData: any[] = [];
  summariesSnapshot.forEach((doc) => {
    const summary = doc.data();
    // Ensure date is a JS Date object for sorting and filtering
    summary.date = new Date(summary.date);
    summariesData.push(summary);
  });

  // Sort by date just in case they come out of order
  return summariesData.toSorted((a, b) => a.date - b.date);
}

document.getElementById('summary-modal-close').addEventListener('click', () => {
    document.getElementById('summary-modal').classList.add('hidden');
});

uploadHistoryList.addEventListener('click', async (e) => {
  const target = e.target as HTMLElement;

  if (target.classList.contains('summary-history-btn')) {
    const uploadId = target.dataset.id;
    const fileName = target.dataset.name;
    showLoading({ message: 'Fetching data for daily recap...', value: 50 });
    const dailySummaries = await fetchDailySummariesForUpload(uploadId);
    hideLoading();
    generateDailyRecap(dailySummaries, fileName);
  }

  if (target.classList.contains('monthly-summary-btn')) {
    const uploadId = target.dataset.id;
    const fileName = target.dataset.name;
    showLoading({ message: 'Fetching data for monthly summary...', value: 50 });
    const dailySummaries = await fetchDailySummariesForUpload(uploadId);
    hideLoading();
    generateMonthlySummary(dailySummaries, fileName);
  }

  if (target.classList.contains('view-history-btn')) {
    const uploadId = target.dataset.id;
    const docRef = doc(db, `artifacts/sales-app/users/${currentUser.uid}/uploads`, uploadId);
    showLoading({ message: 'Fetching report summaries...', value: 10 });
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
        const upload = docSnap.data();
        const dailySummaries = await fetchDailySummariesForUpload(uploadId);
        setupAndShowAnalysisView(dailySummaries, `Analysis for ${upload.name}`);
    }
  }

  if (target.classList.contains('delete-history-btn')) {
    const uploadId = target.dataset.id;
    if (confirm('Are you sure you want to delete this uploaded dataset? This action cannot be undone.')) {
        // --- NEW UI FEEDBACK LOGIC STARTS HERE ---
        const row = target.closest('.flex');
        const buttons = row.querySelectorAll('button');
        const originalDeleteHTML = target.innerHTML; // Save original button content

        // Disable all buttons on the row and show a loading state on the delete button
        buttons.forEach(btn => (btn as HTMLButtonElement).disabled = true);
        target.innerHTML = `
            <div class="flex items-center justify-center w-20">
                <div class="w-4 h-4 border-2 border-t-transparent border-white rounded-full animate-spin mr-2"></div>
                Deleting...
            </div>
        `;
        target.classList.replace('bg-red-500', 'bg-red-700');
        // --- UI FEEDBACK LOGIC ENDS HERE ---

      try {
        const deleteUploadFunction = httpsCallable(functions, 'deleteUpload');
        const result = await deleteUploadFunction({ uploadId });
        console.log(`Deleted ${result.data.deletedBills} bills and upload document`);

        // Refreshing the list will automatically remove the row
        await loadUploadHistory();
      } catch (error: any) {
        console.error('Error deleting upload:', error);
        alert('Failed to delete upload. Please try again.');

        // --- NEW: Revert UI on failure ---
        buttons.forEach(btn => (btn as HTMLButtonElement).disabled = false);
        target.innerHTML = originalDeleteHTML;
        target.classList.replace('bg-red-700', 'bg-red-500');
      }
    }
  }
});

document.getElementById('monthly-summary-modal-close').addEventListener('click', () => {
    document.getElementById('monthly-summary-modal').classList.add('hidden');
});

/**
 * Event listener for the 'View Compiled Analysis' button.
 *
 * @description
 * Fetches all bills across all uploads for the user using collectionGroup query.
 * Uses the new normalized schema with server-enforced alias fields and converts
 * Firestore Timestamps to JavaScript Date objects for analysis compatibility.
 * If no bills exist, displays a warning message.
 * @returns {void}
 */
async function viewCompiledAnalysis() {
    if (!currentUser) return;

    showLoading({ message: 'Fetching all daily summaries...', value: 10 });

    try {
        const summariesQuery = query(
            collectionGroup(db, 'dailySummaries'),
            where('userId', '==', currentUser.uid)
        );
        const querySnapshot = await getDocs(summariesQuery);
        const allSummaries = [];
        querySnapshot.forEach(doc => {
            const summary = doc.data();
            summary.date = new Date(summary.date);
            allSummaries.push(summary);
        });

        const validSummaries = allSummaries.filter(s => s.date instanceof Date && !isNaN(s.date.getTime()));

        if (validSummaries.length === 0) {
            alert('No valid summarized data found. Please upload a file first.');
            hideLoading();
            return;
        }

        validSummaries.toSorted((a, b) => a.date.getTime() - b.date.getTime());

        // Setup the main analysis view first
        setupAndShowAnalysisView(validSummaries, 'Compiled Financial Analysis');

        // --- START: NEW LOGIC TO SWITCH TO FINANCIAL VIEW ---

        // 1. Find all sections and links and remove their 'active' status
        document.querySelectorAll('.analysis-section.active, .sidebar-link.active, .submenu-toggle.active').forEach(el => {
            el.classList.remove('active');
        });

        // 2. Find the target elements for the financial view
        const targetLink = document.querySelector('a.sidebar-link[data-target="general-keuangan"]') as HTMLElement;
        const targetSection = document.getElementById('general-keuangan-section');
        const parentToggle = targetLink?.closest('.submenu-container')?.querySelector('.submenu-toggle');
        const submenu = parentToggle?.nextElementSibling as HTMLElement;

        // 3. Activate the new section, link, and expand the parent submenu
        if (targetLink && targetSection && parentToggle && submenu) {
            targetSection.classList.add('active');
            targetLink.classList.add('active');
            parentToggle.classList.add('active');
            submenu.classList.remove('hidden'); // Ensure the submenu is visible
            parentToggle.querySelector('.chevron-icon')?.classList.add('rotate-180');

            $store.resetActiveViewData();
            setupPageSummary({ pageId: targetSection.id, analyzeUsingAI: getGeminiAnalysis })
        }

        // 4. Hide the main date filters as they are not used in this section
        const mainFilters = document.getElementById('main-filters');
        if(mainFilters) {
             mainFilters.style.display = 'none';
        }

        // 5. Initialize the specific selectors and charts for the financial section
        await setupGeneralKeuanganPeriodSelector();
        // --- END: NEW LOGIC ---

    } catch (error) {
        console.error("Failed to compile analysis from summaries:", error);
        hideLoading();
        alert(`An error occurred while fetching your data: ${error.message}`);
    }
}

// Attach the new function to the button on the sales dashboard page
document.getElementById('view-compiled-btn').addEventListener('click', viewCompiledAnalysis);

// --- PDF Export Function ---
// Replace the old generatePdfReport function with this new one
// Replace the existing generatePdfReport function in your main <script>
/**
 * Generate comprehensive PDF report with sales analysis and AI insights.
 *
 * @description
 * Creates a multi-page PDF report by capturing HTML pages as images using
 * html2canvas and jsPDF. Filters sales data for current and comparison periods,
 * generates AI-powered insights, and renders each page with high-quality settings.
 * Includes progress tracking, proper page handling, and automatic file download.
 *
 * @param progressCallback - Function called with (currentPage, totalPages) to report generation progress.
 * @returns This function does not return a value; it generates and downloads a PDF file.
 *
 * @example
 * // Generate PDF report with progress tracking
 * const progressHandler = (current, total) => {
 *   console.log(`PDF Progress: ${current}/${total}`);
 * };
 * await generatePdfReport(progressHandler);
 * // Downloads 'Finalytics-Report.pdf' with complete sales analysis
 */
async function generatePdfReport(progressCallback: (current: number, total: number) => void): Promise<void> {
  // Get dates for the current period
  const currentStartDate = new Date(document.getElementById('date-start').value)
  const currentEndDate = new Date(document.getElementById('date-end').value)
  currentEndDate.setHours(23, 59, 59, 999) // Include the whole end day

  // Get dates for the comparison period
  const lastPeriodStartDate = new Date(document.getElementById('last-period-start').value)
  const lastPeriodEndDate = new Date(document.getElementById('last-period-end').value)
  lastPeriodEndDate.setHours(23, 59, 59, 999)

  // Filter data for both periods from the global dataset
  const currentData = $store.getAllSalesData().filter((d) => d['Sales Date In'] >= currentStartDate && d['Sales Date In'] <= currentEndDate)
  const lastPeriodData = $store.getAllSalesData().filter((d) => d['Sales Date In'] >= lastPeriodStartDate && d['Sales Date In'] <= lastPeriodEndDate)

  await generateGeneralPdfInsights(currentData, lastPeriodData)

  const { jsPDF } = window.jspdf
  const pdf = new jsPDF({
    orientation: 'p',
    unit: 'mm',
    format: 'a4',
  })

  const pdfContainer = document.getElementById('pdf-portrait')
  pdfContainer.classList.remove('hidden')

  const pages = document.querySelectorAll('#pdf-portrait .page')
  const totalPages = pages.length
  let addPage = false

  // Helper function to add a small delay
  const delay = (ms) => new Promise((res) => setTimeout(res, ms))

  for (let i = 0; i < totalPages; i++) {
    const element = pages[i]

    // --- DEBUGGING TIP ---
    // If the error persists, uncomment the next line and change the number
    // to find which page is causing the error. For example, to only render page 11 (index 10):
    // if (i !== 10) continue;

    // Update the progress bar
    if (progressCallback) {
      progressCallback(i, totalPages)
    }

    // Scroll the element into view and wait a moment for rendering
    element.scrollIntoView()
    await delay(100) // Wait 100ms for fonts and animations

    const canvas = await html2canvas(element, {
      // --- KEY IMPROVEMENTS ---
      scale: 2, // Improves quality
      useCORS: true, // Essential for loading any external images that aren't base64
      allowTaint: true, // Can sometimes help with cross-origin issues
      logging: false, // Cleans up the console during export
    })

    if (addPage) {
      pdf.addPage()
    } else {
      addPage = true
    }

    const imgData = canvas.toDataURL('image/png')
    const pageWidth = pdf.internal.pageSize.getWidth()
    const pageHeight = pdf.internal.pageSize.getHeight()
    const imgWidth = pageWidth
    const imgHeight = (canvas.height * imgWidth) / canvas.width

    const heightLeft = imgHeight
    const position = 0

    // Add the image
    pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight, undefined, 'FAST')
  }

  // Final progress update
  if (progressCallback) {
    progressCallback(totalPages, totalPages)
  }

  pdf.save('Finalytics-Report.pdf')
  pdfContainer.classList.add('hidden')
}

// --- Event Listeners ---
/**
 * Analyze chart data using Gemini AI and display insights in the UI.
 *
 * @description
 * Takes prepared chart data, sends it to Gemini AI for analysis using a configured
 * prompt template, and displays the markdown-formatted results. Also parses any
 * structured data from the AI response to update the global store state.
 *
 * @param chartId - The unique identifier of the chart to analyze.
 * @returns Promise that resolves when analysis is complete and UI is updated.
 *
 * @example
 * // Analyze a revenue trend chart
 * await analyzeChart('revenue-trend');
 * // The analysis result will appear in the UI element with ID 'analysis-result-revenue-trend'
 * // and any structured data will be stored in the global state
 */
async function analyzeChart(chartId: string): Promise<void> {
  const analyzeBtn = document.querySelector(`.analyze-btn[data-chart-id="${chartId}"]`)
  const resultContainer = document.getElementById(`analysis-result-${chartId}`)
  const data = $store.getChartDataForAI()[chartId]

  if (!resultContainer || !data) {
    if (resultContainer) {
      resultContainer.innerHTML = 'Error: Data for this chart not found.'
      resultContainer.classList.remove('hidden')
    }
    return
  }

  const promptTemplate = geminiConfig.prompts[chartId] || 'Analyze this data: {data}'
  const prompt = promptTemplate.replace('{data}', JSON.stringify(data, null, 2))

  resultContainer.innerHTML = `<div class="flex items-center"><div class="loader"></div><span class="ml-3">Analyzing, please wait...</span></div>`
  resultContainer.classList.remove('hidden')
  if (analyzeBtn) analyzeBtn.disabled = true

  try {
    const analysisText = await getGeminiAnalysis(prompt)
    const parts = analysisText.split('===')
    const narrativePart = parts[0] || ''
    const dataPart = parts.length > 1 ? parts[1] : ''

    const html = marked.parse(narrativePart)
    resultContainer.innerHTML = html

    if (dataPart) {
      try {
        const lines = dataPart.trim().split('\n')
        const stateUpdate = {}
        lines.forEach((line) => {
          const [key, ...valueParts] = line.split(':')
          if (key && valueParts.length > 0) {
            const value = valueParts.join(':').trim()
            stateUpdate[key.trim()] = value
          }
        })
        Object.entries(stateUpdate).forEach(([key, value]) => {
          $store.setStoreKV(key as keyof $store.AppState, value)
        })
        applyAnalysisTextBindings($store.getStoreState())
      } catch (e) {
        console.error('Failed to parse structured data from AI response:', e)
      }
    }

    const chartBlock = analyzeBtn.closest('.bg-white.rounded-lg.shadow-md')
    const chartTitle = chartBlock.querySelector('h3').textContent
    $store.setChartDataForAIProperty(chartId, { title: chartTitle, content: html })
  } catch (error) {
    resultContainer.innerHTML = `<span class="text-red-600"><strong>Error:</strong> ${error.message}</span>`
  } finally {
    if (analyzeBtn) analyzeBtn.disabled = false
  }
}

/**
 * Generate AI-powered general insights for PDF reports using period comparison.
 *
 * @description
 * Uses Gemini AI to analyze sales data comparison between current and previous
 * periods, generating structured insights for PDF report inclusion. Processes
 * AI response to extract key-value pairs and updates global store with insights.
 * Handles AI analysis errors gracefully and logs structured data updates.
 *
 * @param currentData - Array of sales data rows for the current analysis period.
 * @param lastPeriodData - Array of sales data rows for the comparison period.
 * @returns This function does not return a value; it updates the global store with AI insights.
 *
 * @example
 * // Generate AI insights for PDF report
 * const currentPeriod = [{ Revenue: 500000, "Sales Date In": new Date("2024-02-15") }];
 * const previousPeriod = [{ Revenue: 400000, "Sales Date In": new Date("2024-01-15") }];
 * await generateGeneralPdfInsights(currentPeriod, previousPeriod);
 * // Uses AI to analyze period comparison and updates store with insights
 */
async function generateGeneralPdfInsights(currentData: any[], lastPeriodData: any[]): Promise<void> {
  const chartId = 'generalPdfInsights'
  const data = {
    currentPeriod: currentData,
    comparisonPeriod: lastPeriodData,
  }

  const promptTemplate = geminiConfig.prompts[chartId]
  if (!promptTemplate) {
    console.error('Prompt for generalPdfInsights not found!')
    return
  }

  const prompt = promptTemplate.replace('{data}', JSON.stringify(data, null, 2))

  try {
    const analysisText = await getGeminiAnalysis(prompt)
    const parts = analysisText.split('===')
    const dataPart = parts.length > 1 ? parts : ''

    if (dataPart) {
      try {
        const lines = dataPart.trim().split('\n')
        const stateUpdate = {}
        lines.forEach((line) => {
          const [key, ...valueParts] = line.split(':')
          if (key && valueParts.length > 0) {
            const value = valueParts.join(':').trim()
            stateUpdate[key.trim()] = value
          }
        })
        Object.entries(stateUpdate).forEach(([key, value]) => {
          $store.setStoreKV(key as keyof $store.AppState, value)
        })
        applyAnalysisTextBindings($store.getStoreState())
        console.log('Updated store with general PDF insights:', stateUpdate)
      } catch (e) {
        console.error('Failed to parse structured data from general PDF insights response:', e)
      }
    }
  } catch (error) {
    console.error(`Error generating general PDF insights:`, error)
  }
}

/**
 * Event listener for clicks on the main application element.
 *
 * @description
 * Handles clicks on the analysis buttons and chart toggle buttons.
 * For analysis buttons, it calls the analyzeChart function with the corresponding chartId.
 * For chart toggle buttons, it shows/hides the chart content.
 * @returns {void}
 */
document.querySelector('main.flex-1').addEventListener('click', async (e) => {
    const target = e.target as HTMLElement;

    // Handle Analyze button clicks
    const analyzeBtn = target.closest('.analyze-btn');
    if (analyzeBtn) {
        const chartId = (analyzeBtn as HTMLElement).dataset.chartId;
        await analyzeChart(chartId);
    }

    // Handle Download Chart button clicks
    const downloadBtn = target.closest('.download-chart-btn');
    if (downloadBtn) {
        const elementId = (downloadBtn as HTMLElement).dataset.chartId;
        const elementToDownload = document.getElementById(elementId);

        if (!elementToDownload) {
            console.error(`Element with ID "${elementId}" not found for download.`);
            alert('Could not download element. Instance not found.');
            return;
        }

        // Check if the ID corresponds to a Chart.js instance
        const chartInstance = $store.getChartProperty(elementId);
        if (chartInstance) {
            // It's a chart, use the fast, built-in method
            const imageUrl = chartInstance.toBase64Image('image/png', 1);
            const link = document.createElement('a');
            link.href = imageUrl;
            link.download = `${elementId}.png`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        } else {
            // It's not a chart (e.g., a table container), use html2canvas
            alert('Preparing table image... this may take a moment.');
            html2canvas(elementToDownload, { scale: 2, useCORS: true }).then(canvas => {
                const imageUrl = canvas.toDataURL('image/png');
                const link = document.createElement('a');
                link.href = imageUrl;
                link.download = `${elementId}.png`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            }).catch(err => {
                console.error('Failed to capture element with html2canvas:', err);
                alert('Sorry, there was an error generating the image.');
            });
        }
    }

    // Handle chart accordion toggle clicks
    const toggleBtn = target.closest('.toggle-chart-btn');
    if (toggleBtn) {
        const contentId = (toggleBtn as HTMLElement).dataset.target;
        const contentElement = document.querySelector(contentId);
        const chevron = toggleBtn.querySelector('.chevron-icon');

        // This logic ensures the chart is visible before toggling
        if (contentElement.style.maxHeight) {
            contentElement.style.maxHeight = null;
        } else {
            contentElement.style.maxHeight = contentElement.scrollHeight + "px";
        }
        chevron.classList.toggle('rotate-180');
    }
});

document.getElementById('analysis-view').addEventListener('click', async (e) => {
    const target = e.target as HTMLElement;
    const link = target.closest('.sidebar-link');
    const toggleBtn = target.closest('.submenu-toggle');

    if (toggleBtn) {
        const submenu = toggleBtn.nextElementSibling as HTMLElement;
        const chevron = toggleBtn.querySelector('.chevron-icon');
        if (submenu && chevron) {
            submenu.classList.toggle('hidden');
            chevron.classList.toggle('rotate-180');
        }
    }

    if (link) {
        e.preventDefault();
        document.querySelectorAll('#analysis-view .sidebar-link, #analysis-view .submenu-toggle').forEach(el => el.classList.remove('active'));
        link.classList.add('active');
        const parentToggle = link.closest('.submenu-container')?.querySelector('.submenu-toggle');
        if (parentToggle) parentToggle.classList.add('active');

        const targetId = link.dataset.target;
        document.querySelectorAll('.analysis-section').forEach(sec => sec.classList.remove('active'));
        const targetSection = document.getElementById(`${targetId}-section`);
        if (targetSection) {
            targetSection.classList.add('active');
            $store.resetActiveViewData();
            setupPageSummary({ pageId: targetSection.id, analyzeUsingAI: getGeminiAnalysis })
        }

        const showMainFilters = ![
            'yoy', 'konfigurasi', 'waktu-penjualan', 'waktu-pnl',
            'analisa-pnl', 'general-keuangan', 'waktu-keuangan',
            'waktu-produk-channel', 'general-penjualan', 'general-investasi',
            'cabang-investasi' // Also hide for this new section
        ].includes(targetId);
        document.getElementById('main-filters').style.display = showMainFilters ? 'block' : 'none';

        // --- THE FIX IS APPLIED HERE ---
        // We wrap the setup calls in a setTimeout to prevent a race condition.
        setTimeout(async () => {
            if (targetId === 'general-keuangan') {
    await setupGeneralKeuanganPeriodSelector();
    // Add the promptDataFormatter to enable the new summarization logic
    setupPageSummary({
        pageId: 'general-keuangan-section',
        analyzeUsingAI: getGeminiAnalysis,
        promptDataFormatter: (viewData) => createGeneralFinanceBreakdown(viewData)
    });
}
            if (targetId === 'general-penjualan') {
                await setupGeneralPenjualanSelectors();
                setupPageSummary({
                pageId: 'general-penjualan-section',
                analyzeUsingAI: getGeminiAnalysis,
                // FIX: Add this line to use your new daily breakdown function for this specific view
                promptDataFormatter: (data) => createGeneralSalesDailyBreakdown(data)
            });
            }
            if (targetId === 'waktu-keuangan') {
                await setupWaktuKeuanganPeriodSelectors();
            }
            if (targetId === 'waktu-penjualan') {
                await setupWaktuPenjualanSelectors();
            }
            if (targetId === 'waktu-produk-channel') {
                await setupWaktuProdukChannelSelectors();
            }
            if (targetId === 'cabang-keuangan') {
                await setupCabangKeuanganSelectors();
            }
            if (targetId === 'cabang-penjualan') {
                await setupCabangPenjualanSelectors();
            }
            if (targetId === 'cabang-produk-channel') {
                await setupCabangProdukChannelSelectors();
            }
            if (targetId === 'general-produk-channel') {
                await setupGeneralProdukChannelSelectors();
            }
            if (targetId === 'general-investasi') {
                await setupGeneralInvestasiSelectors();
            }
            if (targetId === 'cabang-investasi') {
                await setupCabangInvestasiSelectors();
            }

            if (targetId === 'waktu-pnl') generateAllTimePnlTable();
            if (targetId === 'analisa-pnl') setupPnlPeriodSelector();
        }, 0); // A 0ms delay is enough to push it to the next browser tick.
    }
});

async function generateAllTimePnlTable() {
    if (!currentUser) return;
    const thead = document.getElementById('waktu-pnl-thead');
    const tbody = document.getElementById('waktu-pnl-tbody');
    tbody.innerHTML = '<tr><td colspan="2" class="text-center p-4 text-gray-500">Loading P&L reports for the last 24 months...</td></tr>';

    try {
        const reportsRef = collection(db, `users/${currentUser.uid}/pnlReports`);
        const reportsSnap = await getDocs(reportsRef);

        // --- MODIFICATION: Filter reports for the last 24 months ---
        const twentyFourMonthsAgo = new Date();
        twentyFourMonthsAgo.setMonth(twentyFourMonthsAgo.getMonth() - 24);
        const twentyFourMonthsAgoPeriod = twentyFourMonthsAgo.toISOString().slice(0, 7); // "YYYY-MM"

        const recentReports = reportsSnap.docs
            .map(doc => ({ id: doc.id, ...doc.data() }))
            .filter(report => report.period && typeof report.period === 'string' && report.period >= twentyFourMonthsAgoPeriod)
            .toSorted((a, b) => a.period.localeCompare(b.period));

        if (recentReports.length === 0) {
            thead.innerHTML = '';
            tbody.innerHTML = '<tr><td colspan="2" class="text-center p-4 text-gray-500">No P&L reports found in the last 24 months.</td></tr>';
            return;
        }

        // --- MODIFICATION: Table Header now built from filtered reports ---
        const periodHeaders = recentReports.map(r => {
            const date = new Date(r.period + '-02');
            return `<th scope="col" class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">${date.toLocaleString('default', { month: 'short', year: 'numeric' })}</th>`;
        }).join('');
        thead.innerHTML = `<tr>
            <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Metric</th>
            ${periodHeaders}
        </tr>`;

        // --- (Table Body rendering logic remains the same, but now uses 'recentReports') ---
        tbody.innerHTML = '';
        const formatCurrency = (value) => value ? `Rp${Math.round(value).toLocaleString('id-ID')}` : 'Rp0';

        const categoryOrder = ["Pendapatan (Revenue)", "Harga Pokok Produksi", "Beban Operasional (OPEX)", "Beban Non Operasional", "Depresiasi/ Amortisasi", "Bunga", "Pajak (PB1)"];
        const subtotals = {
            "Laba Kotor (Gross Profit)": (data) => (data["Pendapatan (Revenue)"] || 0) - (data["Harga Pokok Produksi"] || 0),
            "Pendapatan Bersih Operasional (Net Operating Income)": (data) => subtotals["Laba Kotor (Gross Profit)"](data) - (data["Beban Operasional (OPEX)"] || 0),
            "Pendapatan Bersih Sebelum Deprisiasi/Amortisasi, Bunga & Pajak (EBITDA)": (data) => subtotals["Pendapatan Bersih Operasional (Net Operating Income)"](data) - (data["Beban Non Operasional"] || 0),
            "Pendapatan Bersih (Net Income)": (data) => subtotals["Pendapatan Bersih Sebelum Deprisiasi/Amortisasi, Bunga & Pajak (EBITDA)"](data) - (data["Depresiasi/ Amortisasi"] || 0) - (data["Bunga"] || 0) - (data["Pajak (PB1)"] || 0),
        };

        const allMetrics = [...categoryOrder, ...Object.keys(subtotals)];

        allMetrics.forEach(metricName => {
            const isSubtotal = !!subtotals[metricName];
            const tr = document.createElement('tr');
            tr.className = isSubtotal ? 'bg-gray-50 font-semibold' : '';

            let rowHtml = `<td class="px-6 py-4 whitespace-nowrap text-sm ${isSubtotal ? 'text-gray-900' : 'text-gray-700'}">${metricName}</td>`;

            recentReports.forEach(report => {
                let value = 0;
                if (isSubtotal) {
                    const categoryTotals = {};
                    categoryOrder.forEach(cat => {
                       categoryTotals[cat] = Object.values(report.pnlData[cat] || {}).reduce((sum: number, val: number) => sum + val, 0);
                    });
                    value = subtotals[metricName](categoryTotals);
                } else {
                    value = Object.values(report.pnlData[metricName] || {}).reduce((sum: number, val: number) => sum + val, 0);
                }
                rowHtml += `<td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-right font-mono">${formatCurrency(value)}</td>`;
            });
            tr.innerHTML = rowHtml;
            tbody.appendChild(tr);
        });

    } catch (error) {
        console.error("Error generating all-time P&L table:", error);
        tbody.innerHTML = `<tr><td colspan="2" class="text-center p-4 text-red-500">Error: Could not load P&L data.</td></tr>`;
    }
}

/**
 * Generate hourly Average Per Customer (APC) line chart with AI data storage.
 *
 * @description
 * Analyzes sales data to calculate average customer spending for each hour of the day
 * (0-23). Groups revenue by hour, counts unique bills per hour, and computes APC
 * to reveal daily consumer behavior patterns. Stores the calculated data for AI
 * analysis and creates a line chart visualization.
 *
 * @param data - Array of processed sales data rows with Revenue, Bill Number, and Sales Date In.
 * @returns This function does not return a value; it creates a Chart.js line chart and stores AI data.
 *
 * @example
 * // Generate hourly APC chart with AI data storage
 * const salesData = [
 *   { Revenue: 50000, "Bill Number": "001", "Sales Date In": new Date("2024-01-01 14:30") },
 *   { Revenue: 75000, "Bill Number": "002", "Sales Date In": new Date("2024-01-01 14:45") }
 * ];
 * generateApcPerJamChart(salesData);
 * // Creates line chart and stores hourly APC data in chartDataForAI['apcPerJam']
 */
function generateApcPerJamChart(data: any[]): void {
  const hourlyApc = Array(24).fill(0)
  const hourlyRevenue = Array(24).fill(0)
  const hourlyBills = Array(24).fill(0).map(() => new Set())
  data.forEach((d) => {
    const hour = d['Sales Date In'].getHours()
    hourlyRevenue[hour] += d.Revenue
    hourlyBills[hour].add(d['Bill Number'])
  })
  for (let i = 0; i < 24; i++) {
    const totalBills = hourlyBills[i].size
    if (totalBills > 0) {
      hourlyApc[i] = hourlyRevenue[i] / totalBills
    }
  }
  $store.setChartDataForAIProperty('apcPerJam', hourlyApc)
  createChart('apc-per-jam-chart-pdf', 'line', {
    labels: Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, '0')),
    datasets: [{
      label: 'Rata-Rata APC per Jam',
      data: hourlyApc,
      borderColor: '#3B82F6',
      tension: 0.1,
    }],
  })
}

/**
 * Generate hourly-daily sales trend heatmap chart with AI data storage.
 *
 * @description
 * Analyzes sales data to create a heatmap-style bar chart showing revenue intensity
 * across a 7-day × 24-hour grid with dynamic color opacity. Each bar's opacity
 * represents revenue volume relative to peak performance. Stores heatmap data
 * in global chartDataForAI for AI analysis and insights generation. Helps identify
 * optimal business hours and peak performance periods across different days.
 *
 * @param data - Array of processed sales data rows with Revenue and Sales Date In.
 * @returns This function does not return a value; it creates a Chart.js heatmap bar chart and stores AI data.
 *
 * @example
 * // Generate hourly-daily sales heatmap with AI data
 * const salesData = [
 *   { Revenue: 500000, "Sales Date In": new Date("2024-01-15T14:30:00") }, // Monday 2PM
 *   { Revenue: 300000, "Sales Date In": new Date("2024-01-16T19:45:00") }  // Tuesday 7PM
 * ];
 * generateSalesTrendHourlyDailyChart(salesData);
 * // Creates heatmap chart and stores data in chartDataForAI['salesTrendHourlyDaily']
 */
function generateSalesTrendHourlyDailyChart(data: any[]): void {
  const heatmapData = Array(7).fill(0).map(() => Array(24).fill(0))
  let maxOmzet = 0
  data.forEach((d) => {
    const day = d['Sales Date In'].getDay()
    const hour = d['Sales Date In'].getHours()
    heatmapData[day][hour] += d.Revenue
    if (heatmapData[day][hour] > maxOmzet) {
      maxOmzet = heatmapData[day][hour]
    }
  })
  $store.setChartDataForAIProperty('salesTrendHourlyDaily', heatmapData)
  createChart('sales-trend-hourly-daily-chart-pdf', 'bar', {
    labels: Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, '0')),
    datasets: [{
      label: 'Sales Trend',
      data: heatmapData,
      backgroundColor: (context) => {
        const value = context.dataset.data[context.dataIndex]
        const alpha = maxOmzet > 0 ? value / maxOmzet : 0
        return `rgba(79, 70, 229, ${alpha})`
      },
    }],
  })
}

/**
 * Generate multi-line chart showing hourly revenue trends by sales channel.
 *
 * @description
 * Analyzes sales data to calculate hourly revenue for each sales channel (Visit Purpose)
 * such as Dine In, Take Away, etc. Creates separate trend lines for each channel
 * to compare performance patterns throughout the day (0-23 hours). Stores data
 * for AI analysis and helps identify peak hours per channel.
 *
 * @param data - Array of processed sales data rows with Revenue, Sales Date In, and Visit Purpose.
 * @returns This function does not return a value; it creates a Chart.js multi-line chart.
 *
 * @example
 * // Generate hourly revenue trends by channel
 * const salesData = [
 *   { Revenue: 500000, "Sales Date In": new Date("2024-01-01 14:30"), "Visit Purpose": "Dine In" },
 *   { Revenue: 200000, "Sales Date In": new Date("2024-01-01 19:45"), "Visit Purpose": "Take Away" }
 * ];
 * generateChannelHourlyChart(salesData);
 * // Creates multi-line chart with separate lines for each channel's hourly revenue
 */
function generateChannelHourlyChart(data: any[]): void {
  const channelData = {}
  data.forEach((d) => {
    const channel = d['Visit Purpose'] || 'Unknown'
    const hour = d['Sales Date In'].getHours()
    if (!channelData[channel]) {
      channelData[channel] = Array(24).fill(0)
    }
    channelData[channel][hour] += d.Revenue
  })
  $store.setChartDataForAIProperty('channelHourly', channelData)
  createChart('channel-hourly-chart-pdf', 'line', {
    labels: Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, '0')),
    datasets: Object.keys(channelData).map((channel) => ({
      label: channel,
      data: channelData[channel],
      tension: 0.1,
    })),
  })
}

/**
 * Generate multi-line chart showing weekly revenue patterns by sales channel.
 *
 * @description
 * Analyzes sales data to calculate daily revenue for each sales channel (Visit Purpose)
 * across days of the week (Sunday=0 to Saturday=6). Creates separate trend lines for
 * each channel to compare weekly performance patterns and identify optimal days
 * per channel. Stores data for AI analysis integration.
 *
 * @param data - Array of processed sales data rows with Revenue, Sales Date In, and Visit Purpose.
 * @returns This function does not return a value; it creates a Chart.js multi-line chart.
 *
 * @example
 * // Generate weekly revenue patterns by channel
 * const salesData = [
 *   { Revenue: 800000, "Sales Date In": new Date("2024-01-01"), "Visit Purpose": "Dine In" }, // Monday
 *   { Revenue: 400000, "Sales Date In": new Date("2024-01-07"), "Visit Purpose": "Take Away" } // Sunday
 * ];
 * generateChannelWeeklyChart(salesData);
 * // Creates multi-line chart with separate lines for each channel's daily revenue
 */
function generateChannelWeeklyChart(data: any[]): void {
  const channelData = {}
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  data.forEach((d) => {
    const channel = d['Visit Purpose'] || 'Unknown'
    const day = d['Sales Date In'].getDay()
    if (!channelData[channel]) {
      channelData[channel] = Array(7).fill(0)
    }
    channelData[channel][day] += d.Revenue
  })
  $store.setChartDataForAIProperty('channelWeekly', channelData)
  createChart('channel-weekly-chart-pdf', 'line', {
    labels: days,
    datasets: Object.keys(channelData).map((channel) => ({
      label: channel,
      data: channelData[channel],
      tension: 0.1,
    })),
  })
}

/**
 * Generate multi-line chart showing monthly revenue trends by sales channel.
 *
 * @description
 * Analyzes sales data to calculate monthly revenue for each sales channel (Visit Purpose)
 * such as Dine In, Take Away, etc. Creates separate trend lines for each channel
 * to compare long-term performance patterns across months. Stores data for AI analysis
 * and helps identify seasonal trends and channel performance evolution.
 *
 * @param data - Array of processed sales data rows with Revenue, Sales Date In, and Visit Purpose.
 * @returns This function does not return a value; it creates a Chart.js multi-line chart.
 *
 * @example
 * // Generate monthly revenue trends by channel
 * const salesData = [
 *   { Revenue: 5000000, "Sales Date In": new Date("2024-01-15"), "Visit Purpose": "Dine In" },
 *   { Revenue: 3000000, "Sales Date In": new Date("2024-02-15"), "Visit Purpose": "Take Away" }
 * ];
 * generateChannelMonthlyChart(salesData);
 * // Creates multi-line chart with separate lines for each channel's monthly revenue
 */
function generateChannelMonthlyChart(data: any[]): void {
  const channelData = {}
  const months = [...new Set(data.map((d) => d['Sales Date In'].toISOString().slice(0, 7)))].toSorted()
  data.forEach((d) => {
    const channel = d['Visit Purpose'] || 'Unknown'
    const month = d['Sales Date In'].toISOString().slice(0, 7)
    if (!channelData[channel]) {
      channelData[channel] = {}
    }
    channelData[channel][month] = (channelData[channel][month] || 0) + d.Revenue
  })
  $store.setChartDataForAIProperty('channelMonthly', channelData)
  createChart('channel-monthly-chart-pdf', 'line', {
    labels: months,
    datasets: Object.keys(channelData).map((channel) => ({
      label: channel,
      data: months.map((month) => channelData[channel][month] || 0),
      tension: 0.1,
    })),
  })
}

/**
 * Generate monthly revenue trend line chart for growth analysis.
 *
 * @description
 * Analyzes sales data to calculate total revenue per month and creates a
 * chronological line chart showing monthly revenue progression. Helps track
 * business growth patterns, identify seasonal trends, and monitor revenue
 * performance over time for strategic planning and growth assessment.
 *
 * @param data - Array of processed sales data rows with Revenue and Sales Date In.
 * @returns This function does not return a value; it creates a Chart.js line chart.
 *
 * @example
 * // Generate monthly revenue trend chart
 * const salesData = [
 *   { Revenue: 500000, "Sales Date In": new Date("2024-01-15") },
 *   { Revenue: 750000, "Sales Date In": new Date("2024-02-15") }
 * ];
 * generateMonthlyIncreaseChart(salesData);
 * // Creates line chart showing monthly revenue growth progression
 */
function generateMonthlyIncreaseChart(data: any[]): void {
  const monthlyIncrease = data.reduce((acc, d) => {
    const month = d['Sales Date In'].toISOString().slice(0, 7)
    if (!acc[month]) {
      acc[month] = 0
    }
    acc[month] += d.Revenue
    return acc
  }, {})

  const sortedMonths = Object.keys(monthlyIncrease).toSorted()
  const chartData = sortedMonths.map((month) => monthlyIncrease[month])

  createChart('monthly-increase-chart-pdf', 'line', {
    labels: sortedMonths,
    datasets: [{
      label: 'Monthly Increase',
      data: chartData,
      borderColor: '#4F46E5',
      tension: 0.1,
    }],
  })
}

/**
 * Generate monthly Total Check chart for PDF reports.
 *
 * @description
 * Creates a line chart showing total transaction count per month across the
 * analysis period. Calculates unique bill count for each month (YYYY-MM format)
 * by aggregating all transactions throughout the dataset. Helps identify
 * monthly transaction trends, seasonal patterns, and business growth for
 * strategic planning and performance analysis.
 *
 * @param data - Array of processed sales data rows with Bill Number and Sales Date In.
 * @returns This function does not return a value; it creates a Chart.js line chart.
 *
 * @example
 * // Generate monthly total TC chart
 * const salesData = [
 *   { "Bill Number": "B001", "Sales Date In": new Date("2024-01-15") },
 *   { "Bill Number": "B002", "Sales Date In": new Date("2024-01-16") },
 *   { "Bill Number": "B003", "Sales Date In": new Date("2024-02-15") }
 * ];
 * generateTcMonthlyChart(salesData);
 * // Creates line chart showing total transaction count per month
 */
function generateTcMonthlyChart(data: any[]): void {
  const monthlyTc = {}
  const monthlyBills = {}

  data.forEach((d) => {
    const monthLabel = d['Sales Date In'].toISOString().slice(0, 7)

    if (!monthlyBills[monthLabel]) {
      monthlyBills[monthLabel] = new Set()
    }
    monthlyBills[monthLabel].add(d['Bill Number'])
  })

  const sortedMonths = Object.keys(monthlyBills).toSorted()
  const tcData = sortedMonths.map((month) => monthlyBills[month].size)

  createChart('tc-monthly-chart-pdf', 'line', {
    labels: sortedMonths,
    datasets: [{
      label: 'Total TC per Bulan',
      data: tcData,
      borderColor: '#4F46E5',
      tension: 0.1,
    }],
  })
}

/**
 * Generate weekly Total Check chart for PDF reports.
 *
 * @description
 * Creates a line chart showing total transaction count per week across the
 * analysis period. Groups unique bill count by week (starting Sunday) and
 * sorts chronologically to display weekly transaction totals. Helps identify
 * weekly transaction patterns, seasonal trends, and business performance
 * for operational planning and strategic analysis.
 *
 * @param data - Array of processed sales data rows with Bill Number and Sales Date In.
 * @returns This function does not return a value; it creates a Chart.js line chart.
 *
 * @example
 * // Generate weekly total TC chart
 * const salesData = [
 *   { "Bill Number": "B001", "Sales Date In": new Date("2024-01-15") }, // Week of Jan 14
 *   { "Bill Number": "B002", "Sales Date In": new Date("2024-01-22") }  // Week of Jan 21
 * ];
 * generateTcWeeklyChart(salesData);
 * // Creates line chart showing total transaction count per week
 */
function generateTcWeeklyChart(data: any[]): void {
  const weeklyTc = {}
  const weeklyBills = {}

  data.forEach((d) => {
    const firstDayOfWeek = new Date(d['Sales Date In'])
    firstDayOfWeek.setDate(d['Sales Date In'].getDate() - d['Sales Date In'].getDay())
    const weekLabel = firstDayOfWeek.toISOString().split('T')

    if (!weeklyBills[weekLabel]) {
      weeklyBills[weekLabel] = new Set()
    }
    weeklyBills[weekLabel].add(d['Bill Number'])
  })

  const sortedWeeks = Object.keys(weeklyBills).toSorted()
  const tcData = sortedWeeks.map((week) => weeklyBills[week].size)

  createChart('tc-weekly-chart-pdf', 'line', {
    labels: sortedWeeks,
    datasets: [{
      label: 'Total TC per Minggu',
      data: tcData,
      borderColor: '#10B981',
      tension: 0.1,
    }],
  })
}

/**
 * Generate hourly Total Check chart for PDF reports.
 *
 * @description
 * Creates a line chart showing total transaction count per hour across the
 * entire analysis period. Calculates unique bill count for each hour (0-23)
 * by aggregating all transactions throughout the dataset. Helps identify
 * peak transaction hours and customer arrival patterns for operational
 * planning and staffing optimization.
 *
 * @param data - Array of processed sales data rows with Bill Number and Sales Date In.
 * @returns This function does not return a value; it creates a Chart.js line chart.
 *
 * @example
 * // Generate hourly total TC chart
 * const salesData = [
 *   { "Bill Number": "B001", "Sales Date In": new Date("2024-01-15T14:30:00") },
 *   { "Bill Number": "B002", "Sales Date In": new Date("2024-01-15T19:45:00") },
 *   { "Bill Number": "B003", "Sales Date In": new Date("2024-01-16T14:15:00") }
 * ];
 * generateTcHourlyChart(salesData);
 * // Creates line chart showing total transaction count per hour
 */
function generateTcHourlyChart(data: any[]): void {
  const hourlyTc = Array(24).fill(0)
  const billsByHour = {}

  data.forEach((d) => {
    const hour = d['Sales Date In'].getHours()
    const billNumber = d['Bill Number']
    if (!billsByHour[hour]) {
      billsByHour[hour] = new Set()
    }
    billsByHour[hour].add(billNumber)
  })

  for (let i = 0; i < 24; i++) {
    if (billsByHour[i]) {
      hourlyTc[i] = billsByHour[i].size
    }
  }

  createChart('tc-hourly-chart-pdf', 'line', {
    labels: Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, '0')),
    datasets: [{
      label: 'Total TC per Jam',
      data: hourlyTc,
      borderColor: '#F97316',
      tension: 0.1,
    }],
  })
}

/**
 * Generate hourly Average Per Customer (APC) line chart for daily spending patterns.
 *
 * @description
 * Analyzes sales data to calculate average customer spending for each hour of the day
 * (0-23). Groups revenue by hour, counts unique bills per hour, and computes APC
 * to reveal daily consumer behavior patterns and peak spending times.
 *
 * @param data - Array of processed sales data rows with Revenue, Bill Number, and Sales Date In.
 * @returns This function does not return a value; it creates a Chart.js line chart.
 *
 * @example
 * // Generate hourly APC chart from sales data
 * const salesData = [
 *   { Revenue: 50000, "Bill Number": "001", "Sales Date In": new Date("2024-01-01 14:30") },
 *   { Revenue: 75000, "Bill Number": "002", "Sales Date In": new Date("2024-01-01 14:45") }
 * ];
 * generateApcHourlyChart(salesData);
 * // Creates line chart showing APC values for each hour (14:00 would show 62500 average)
 */
function generateApcHourlyChart(data: any[]): void {
  const hourlyApc = Array(24).fill(0)
  const hourlyRevenue = Array(24).fill(0)
  const hourlyBills = Array(24).fill(0).map(() => new Set())

  data.forEach((d) => {
    const hour = d['Sales Date In'].getHours()
    hourlyRevenue[hour] += d.Revenue
    hourlyBills[hour].add(d['Bill Number'])
  })

  for (let i = 0; i < 24; i++) {
    const totalBills = hourlyBills[i].size
    if (totalBills > 0) {
      hourlyApc[i] = hourlyRevenue[i] / totalBills
    }
  }

  createChart('apc-hourly-chart-pdf', 'line', {
    labels: Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, '0')),
    datasets: [{
      label: 'Rata-Rata APC per Jam',
      data: hourlyApc,
      borderColor: '#3B82F6',
      tension: 0.1,
    }],
  })
}

/**
 * Generate weekly APC line chart for tracking customer spending trends over time.
 *
 * @description
 * Analyzes sales data to calculate Average Per Customer (APC) for each week
 * (starting from Sunday). Groups revenue and bills by week, computes weekly APC,
 * and displays trends chronologically to identify seasonal patterns and long-term
 * customer spending behavior changes.
 *
 * @param data - Array of processed sales data rows with Revenue, Bill Number, and Sales Date In.
 * @returns This function does not return a value; it creates a Chart.js line chart.
 *
 * @example
 * // Generate weekly APC trend chart
 * const salesData = [
 *   { Revenue: 1000000, "Bill Number": "001", "Sales Date In": new Date("2024-01-15") },
 *   { Revenue: 1200000, "Bill Number": "002", "Sales Date In": new Date("2024-01-22") }
 * ];
 * generateApcWeeklyChart(salesData);
 * // Creates line chart showing weekly APC progression over time
 */
function generateApcWeeklyChart(data: any[]): void {
  const weeklyApc = {}
  const weeklyBills = {}
  const weeklyRevenue = {}

  data.forEach((d) => {
    const firstDayOfWeek = new Date(d['Sales Date In'])
    firstDayOfWeek.setDate(d['Sales Date In'].getDate() - d['Sales Date In'].getDay())
    const weekLabel = firstDayOfWeek.toISOString().split('T')

    if (!weeklyBills[weekLabel]) {
      weeklyBills[weekLabel] = new Set()
      weeklyRevenue[weekLabel] = 0
    }
    weeklyBills[weekLabel].add(d['Bill Number'])
    weeklyRevenue[weekLabel] += d.Revenue
  })

  const sortedWeeks = Object.keys(weeklyBills).toSorted()
  const apcData = sortedWeeks.map((week) => {
    const totalBills = weeklyBills[week].size
    const totalRevenue = weeklyRevenue[week]
    return totalBills > 0 ? totalRevenue / totalBills : 0
  })

  createChart('apc-weekly-chart-pdf', 'line', {
    labels: sortedWeeks,
    datasets: [{
      label: 'Rata-Rata APC per Minggu',
      data: apcData,
      borderColor: '#10B981',
      tension: 0.1,
    }],
  })
}

/**
 * Generate monthly Average Per Customer (APC) line chart for long-term spending trends.
 *
 * @description
 * Analyzes sales data to calculate monthly APC by grouping transactions by month,
 * computing total revenue and unique bill counts per month, then calculating
 * average spending per customer. Creates a line chart visualization showing
 * monthly spending patterns over time.
 *
 * @param data - Array of processed sales data rows with Revenue, Bill Number, and Sales Date In.
 * @returns This function does not return a value; it creates a Chart.js line chart.
 *
 * @example
 * // Generate monthly APC trend chart
 * const salesData = [
 *   { Revenue: 500000, "Bill Number": "001", "Sales Date In": new Date("2024-01-15") },
 *   { Revenue: 750000, "Bill Number": "002", "Sales Date In": new Date("2024-02-10") }
 * ];
 * generateApcMonthlyChart(salesData);
 * // Creates line chart showing APC trends by month (2024-01, 2024-02, etc.)
 */
function generateApcMonthlyChart(data: any[]): void {
  const monthlyApc = {}
  const monthlyBills = {}
  const monthlyRevenue = {}

  data.forEach((d) => {
    const monthLabel = d['Sales Date In'].toISOString().slice(0, 7)

    if (!monthlyBills[monthLabel]) {
      monthlyBills[monthLabel] = new Set()
      monthlyRevenue[monthLabel] = 0
    }
    monthlyBills[monthLabel].add(d['Bill Number'])
    monthlyRevenue[monthLabel] += d.Revenue
  })

  const sortedMonths = Object.keys(monthlyBills).toSorted()
  const apcData = sortedMonths.map((month) => {
    const totalBills = monthlyBills[month].size
    const totalRevenue = monthlyRevenue[month]
    return totalBills > 0 ? totalRevenue / totalBills : 0
  })

  createChart('apc-monthly-chart-pdf', 'line', {
    labels: sortedMonths,
    datasets: [{
      label: 'Rata-Rata APC per Bulan',
      data: apcData,
      borderColor: '#4F46E5',
      tension: 0.1,
    }],
  })
}

/**
 * Generate monthly Dine-In revenue trend line chart for growth analysis.
 *
 * @description
 * Filters sales data for Dine-In transactions only, then aggregates revenue by month
 * to create a chronological line chart showing Dine-In revenue trends over time.
 * Useful for tracking the performance and growth patterns of the dine-in channel
 * specifically, separate from other sales channels.
 *
 * @param data - Array of processed sales data rows with Revenue, Visit Purpose, and Sales Date In.
 * @returns This function does not return a value; it creates a Chart.js line chart.
 *
 * @example
 * // Generate monthly Dine-In revenue trend
 * const salesData = [
 *   { Revenue: 3000000, "Visit Purpose": "Dine In", "Sales Date In": new Date("2024-01-15") },
 *   { Revenue: 3500000, "Visit Purpose": "Dine In", "Sales Date In": new Date("2024-02-15") }
 * ];
 * generateDineInIncreaseChart(salesData);
 * // Creates line chart showing monthly Dine-In revenue progression
 */
function generateDineInIncreaseChart(data: any[]): void {
  const dineInData = data.filter((d) => d['Visit Purpose'] === 'Dine In')
  const monthlyDineIn = dineInData.reduce((acc, d) => {
    const month = d['Sales Date In'].toISOString().slice(0, 7)
    if (!acc[month]) {
      acc[month] = 0
    }
    acc[month] += d.Revenue
    return acc
  }, {})

  const sortedMonths = Object.keys(monthlyDineIn).toSorted()
  const chartData = sortedMonths.map((month) => monthlyDineIn[month])

  createChart('dinein-increase-chart-pdf', 'line', {
    labels: sortedMonths,
    datasets: [{
      label: 'Dine In Revenue',
      data: chartData,
      borderColor: '#10B981',
      tension: 0.1,
    }],
  })
}

/**
 * Generate multi-line chart showing monthly Dine-In revenue trends per outlet.
 *
 * @description
 * Filters sales data for Dine-In transactions only, then aggregates revenue by
 * outlet (Branch) and month to create separate trend lines for each outlet's
 * Dine-In performance. Useful for comparing outlet-specific Dine-In growth patterns
 * and identifying top-performing locations for the dine-in channel.
 *
 * @param data - Array of processed sales data rows with Revenue, Visit Purpose, Branch, and Sales Date In.
 * @returns This function does not return a value; it creates a Chart.js multi-line chart.
 *
 * @example
 * // Generate monthly Dine-In revenue trends per outlet
 * const salesData = [
 *   { Revenue: 2000000, "Visit Purpose": "Dine In", Branch: "Jakarta Pusat", "Sales Date In": new Date("2024-01-15") },
 *   { Revenue: 1800000, "Visit Purpose": "Dine In", Branch: "Bandung", "Sales Date In": new Date("2024-01-15") }
 * ];
 * generateDineInIncreaseOutletChart(salesData);
 * // Creates multi-line chart with separate lines for each outlet's Dine-In revenue
 */
function generateDineInIncreaseOutletChart(data: any[]): void {
  const dineInData = data.filter((d) => d['Visit Purpose'] === 'Dine In')
  const monthlyDineInOutlet = dineInData.reduce((acc, d) => {
    const month = d['Sales Date In'].toISOString().slice(0, 7)
    const outlet = d.Branch || 'Unknown'
    if (!acc[outlet]) {
      acc[outlet] = {}
    }
    if (!acc[outlet][month]) {
      acc[outlet][month] = 0
    }
    acc[outlet][month] += d.Revenue
    return acc
  }, {})

  const sortedMonths = [...new Set(dineInData.map((d) => d['Sales Date In'].toISOString().slice(0, 7)))].toSorted()
  const datasets = Object.keys(monthlyDineInOutlet).map((outlet) => {
    return {
      label: outlet,
      data: sortedMonths.map((month) => monthlyDineInOutlet[outlet][month] || 0),
      tension: 0.1,
    }
  })

  createChart('dinein-increase-outlet-chart-pdf', 'line', {
    labels: sortedMonths,
    datasets: datasets,
  })
}

/**
 * Generate daily HPP (Cost of Goods Sold) trend line chart for cost tracking.
 *
 * @description
 * Analyzes sales data to calculate daily HPP by multiplying item prices by
 * quantities sold for each day. Creates a chronological line chart showing
 * daily cost of goods sold trends to help track production costs, identify
 * cost spikes, and monitor raw material expense patterns over time.
 *
 * @param data - Array of processed sales data rows with Price, Quantity, and Sales Date In.
 * @returns This function does not return a value; it creates a Chart.js line chart.
 *
 * @example
 * // Generate daily HPP trend chart
 * const salesData = [
 *   { Price: 15000, Quantity: 10, "Sales Date In": new Date("2024-01-15") },
 *   { Price: 18000, Quantity: 12, "Sales Date In": new Date("2024-01-16") }
 * ];
 * generateHppHarianChart(salesData);
 * // Creates line chart showing daily cost of goods sold progression
 */
function generateHppHarianChart(data: any[]): void {
  const dailyHpp = data.reduce((acc, d) => {
    const date = d['Sales Date In'].toISOString().split('T')
    acc[date] = (acc[date] || 0) + (d.Price * d.Quantity)
    return acc
  }, {})

  const sortedDates = Object.keys(dailyHpp).toSorted()
  const chartData = sortedDates.map((date) => dailyHpp[date])

  createChart('hpp-harian-chart-pdf', 'line', {
    labels: sortedDates,
    datasets: [{
      label: 'HPP Harian',
      data: chartData,
      borderColor: '#EF4444',
      tension: 0.1,
    }],
  })
}

/**
 * Generate donut chart showing food cost breakdown by menu category.
 *
 * @description
 * Analyzes sales data to calculate food costs (Price × Quantity) for each menu
 * category and creates a donut chart visualization showing the contribution of
 * each category to total food costs. Useful for identifying which menu categories
 * drive the highest raw material expenses and cost optimization opportunities.
 *
 * @param data - Array of processed sales data rows with Price, Quantity, and Menu Category.
 * @returns This function does not return a value; it creates a Chart.js donut chart.
 *
 * @example
 * // Generate food cost breakdown by category
 * const salesData = [
 *   { Price: 15000, Quantity: 10, "Menu Category": "MAKANAN" },
 *   { Price: 8000, Quantity: 15, "Menu Category": "MINUMAN" }
 * ];
 * generateFoodCostKomponenChart(salesData);
 * // Creates donut chart showing cost percentage per menu category
 */
function generateFoodCostKomponenChart(data: any[]): void {
  const foodCostData = data.reduce((acc, d) => {
    const category = d['Menu Category'] || 'Unknown'
    acc[category] = (acc[category] || 0) + (d.Price * d.Quantity)
    return acc
  }, {})

  createChart('food-cost-komponen-chart-pdf', 'doughnut', {
    labels: Object.keys(foodCostData),
    datasets: [{
      data: Object.values(foodCostData),
      backgroundColor: ['#3B82F6', '#10B981', '#F97316', '#8B5CF6', '#EC4899', '#F59E0B'],
    }],
  })
}

/**
 * Generate monthly actual food cost trend line chart for expense analysis.
 *
 * @description
 * Analyzes sales data to calculate actual monthly food costs by multiplying
 * item prices by quantities sold. Creates a chronological line chart showing
 * food cost trends over time to help track raw material expenses and identify
 * cost fluctuation patterns for budget planning and cost control.
 *
 * @param data - Array of processed sales data rows with Price, Quantity, and Sales Date In.
 * @returns This function does not return a value; it creates a Chart.js line chart.
 *
 * @example
 * // Generate monthly food cost trend chart
 * const salesData = [
 *   { Price: 15000, Quantity: 10, "Sales Date In": new Date("2024-01-15") },
 *   { Price: 18000, Quantity: 12, "Sales Date In": new Date("2024-02-15") }
 * ];
 * generateFoodCostAktualChart(salesData);
 * // Creates line chart showing monthly actual food cost progression
 */
function generateFoodCostAktualChart(data: any[]): void {
  const monthlyFoodCost = data.reduce((acc, d) => {
    const month = d['Sales Date In'].toISOString().slice(0, 7)
    if (!acc[month]) {
      acc[month] = 0
    }
    acc[month] += d.Price * d.Quantity
    return acc
  }, {})

  const sortedMonths = Object.keys(monthlyFoodCost).toSorted()
  const chartData = sortedMonths.map((month) => monthlyFoodCost[month])

  createChart('food-cost-aktual-chart-pdf', 'line', {
    labels: sortedMonths,
    datasets: [{
      label: 'Food Cost Aktual',
      data: chartData,
      borderColor: '#EF4444',
      tension: 0.1,
    }],
  })
}

/**
 * Generate combined daily revenue and traffic chart with dual y-axes.
 *
 * @description
 * Analyzes sales data to create a dual-axis chart combining daily revenue (bar chart)
 * and transaction count/traffic (line chart). Uses separate y-axes to display both
 * metrics effectively, helping identify correlations between revenue performance
 * and customer traffic patterns. Aggregates data by date and counts unique bills
 * for accurate transaction counting.
 *
 * @param data - Array of processed sales data rows with Revenue, Bill Number, and Sales Date In.
 * @returns This function does not return a value; it creates a Chart.js combined chart.
 *
 * @example
 * // Generate daily revenue and traffic correlation chart
 * const salesData = [
 *   { Revenue: 500000, "Bill Number": "B001", "Sales Date In": new Date("2024-01-15") },
 *   { Revenue: 300000, "Bill Number": "B002", "Sales Date In": new Date("2024-01-15") }
 * ];
 * generateOmzetTrafficHarianChart(salesData);
 * // Creates dual-axis chart showing revenue bars and traffic line
 */
function generateOmzetTrafficHarianChart(data: any[]): void {
  const dailyData = data.reduce((acc, d) => {
    const date = d['Sales Date In'].toISOString().split('T')
    if (!acc[date]) {
      acc[date] = { revenue: 0, bills: new Set() }
    }
    acc[date].revenue += d.Revenue
    acc[date].bills.add(d['Bill Number'])
    return acc
  }, {})

  const sortedDates = Object.keys(dailyData).toSorted()
  const omzetData = sortedDates.map((date) => dailyData[date].revenue)
  const trafficData = sortedDates.map((date) => dailyData[date].bills.size)

  createChart('omzet-traffic-harian-chart-pdf', 'bar', {
    labels: sortedDates,
    datasets: [
      {
        type: 'bar',
        label: 'Omzet',
        data: omzetData,
        backgroundColor: '#60A5FA',
        yAxisID: 'y-omzet',
      },
      {
        type: 'line',
        label: 'Traffic',
        data: trafficData,
        borderColor: '#F97316',
        backgroundColor: '#F97316',
        tension: 0.1,
        yAxisID: 'y-traffic',
      },
    ],
  }, {
    scales: {
      'y-omzet': {
        type: 'linear',
        display: true,
        position: 'left',
        title: {
          display: true,
          text: 'Omzet (Rp)',
        },
      },
      'y-traffic': {
        type: 'linear',
        display: true,
        position: 'right',
        title: {
          display: true,
          text: 'Traffic',
        },
        grid: {
          drawOnChartArea: false,
        },
      },
    },
  })
}

/**
 * Generate daily average purchase value line chart for spending trend analysis.
 *
 * @description
 * Analyzes sales data to calculate average purchase value (APC) for each day
 * by grouping revenue and unique bills per date. Creates a chronological line chart
 * showing daily average customer spending to identify trends, seasonal patterns,
 * and spending behavior changes over time.
 *
 * @param data - Array of processed sales data rows with Revenue, Bill Number, and Sales Date In.
 * @returns This function does not return a value; it creates a Chart.js line chart.
 *
 * @example
 * // Generate daily average purchase value chart
 * const salesData = [
 *   { Revenue: 250000, "Bill Number": "001", "Sales Date In": new Date("2024-01-15") },
 *   { Revenue: 300000, "Bill Number": "002", "Sales Date In": new Date("2024-01-16") }
 * ];
 * generateAvgPurchaseValueChart(salesData);
 * // Creates line chart showing daily average purchase values over time
 */
function generateAvgPurchaseValueChart(data: any[]): void {
  const dailyData = data.reduce((acc, d) => {
    const date = d['Sales Date In'].toISOString().split('T')
    if (!acc[date]) {
      acc[date] = { revenue: 0, bills: new Set() }
    }
    acc[date].revenue += d.Revenue
    acc[date].bills.add(d['Bill Number'])
    return acc
  }, {})

  const sortedDates = Object.keys(dailyData).toSorted()
  const avgPurchaseData = sortedDates.map((date) => {
    const totalBills = dailyData[date].bills.size
    const totalRevenue = dailyData[date].revenue
    return totalBills > 0 ? totalRevenue / totalBills : 0
  })

  createChart('avg-purchase-value-chart-pdf', 'line', {
    labels: sortedDates,
    datasets: [{
      label: 'Rata-Rata Nilai Pembelian',
      data: avgPurchaseData,
      borderColor: '#3B82F6',
      tension: 0.1,
    }],
  })
}

/**
 * Creates a bar chart to display popular times based on transaction frequency.
 *
 * @param {Array} data - Processed sales data array.
 *
 * @description
 * This function analyzes sales data to calculate and display
 * transaction frequency per hour of the day.
 * This chart helps in understanding peak hours based on the number of transactions.
 */
 function generatePopularTimesChart1(data) {
   const hourlyTraffic = Array(24).fill(0);
   const billsByHour = {};

   data.forEach((d) => {
     const hour = d['Sales Date In'].getHours();
     const billNumber = d['Bill Number'];
     if (!billsByHour[hour]) {
       billsByHour[hour] = new Set();
     }
     billsByHour[hour].add(billNumber);
   });

   for (let i = 0; i < 24; i++) {
     if (billsByHour[i]) {
       hourlyTraffic[i] = billsByHour[i].size;
     }
   }

   createChart('popular-times-chart-1-pdf', 'bar', {
     labels: Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, '0')),
     datasets: [{
       label: 'Popular Times',
       data: hourlyTraffic,
       backgroundColor: '#4F46E5',
     }],
   }, {
       // This makes the chart horizontal to match the design
       indexAxis: 'y',
       plugins: { legend: { display: false } }
   });
 }

 // In main.ts, ADD this new function

/**
 * Analyzes sales data to identify peak hours and associated popular menu items and average check ranges.
 *
 * @param {Array} data - Processed sales data array.
 *
 * @description
 * This function determines the busiest hour based on transaction count, then analyzes
 * the sales data within a 2-hour window around that peak hour. It identifies the
 * top 4 popular menu items sold during this peak period and calculates the 25th to 75th
 * percentile range for average check values. This analysis helps in understanding
 * customer behavior and optimizing operations during peak times.
 */
 function generatePeakHourAnalysis(data) {
     if (data.length === 0) return;

     // 1. Find the single busiest hour by transaction count
     const hourlyBills = {};
     data.forEach(d => {
         const hour = d['Sales Date In'].getHours();
         if (!hourlyBills[hour]) hourlyBills[hour] = new Set();
         hourlyBills[hour].add(d['Bill Number']);
     });
     const hourlyTraffic = Object.entries(hourlyBills).map(([hour, bills]) => ({ hour: parseInt(hour), count: bills.size }));
     const peakHour = hourlyTraffic.toSorted((a, b) => b.count - a.count)[0]?.hour || 12;

     const peakHourStart = peakHour;
     const peakHourEnd = peakHour + 2; // Define peak period as a 2-hour window

     // 2. Filter data to get only transactions within the peak period
     const peakHourData = data.filter(d => {
         const hour = d['Sales Date In'].getHours();
         return hour >= peakHourStart && hour < peakHourEnd;
     });

     // 3. Find top 4 popular menu items during the peak period
     const peakMenuQty = peakHourData.reduce((acc, d) => {
         acc[d.Menu] = (acc[d.Menu] || 0) + d.Quantity;
         return acc;
     }, {});
     const popularMenu = Object.entries(peakMenuQty).toSorted((a, b) => b[1] - a[1]).slice(0, 4);

     // 4. Find the average check range (25th to 75th percentile) during peak period
     const peakBillTotals = Object.values(peakHourData.reduce((acc, d) => {
         acc[d['Bill Number']] = (acc[d['Bill Number']] || 0) + d.Revenue;
         return acc;
     }, {})).toSorted((a, b) => a - b);

     const minCheck = peakBillTotals[Math.floor(peakBillTotals.length * 0.25)] || 0;
     const maxCheck = peakBillTotals[Math.floor(peakBillTotals.length * 0.75)] || 0;

     // 5. Update the store
     $store.setStorePartial({
         peakHour1Start: String(peakHourStart).padStart(2, '0') + '.00',
         peakHour1End: String(peakHourEnd).padStart(2, '0') + '.00',
         popularMenu1: popularMenu[0]?.[0] || '',
         popularMenu2: popularMenu[1]?.[0] || '',
         popularMenu3: popularMenu[2]?.[0] || '',
         popularMenu4: popularMenu[3]?.[0] || '',
         avgCheckPeak1Min: formatNumber(minCheck, 0),
         avgCheckPeak1Max: formatNumber(maxCheck, 0),
     });
 }

/**
 * Generate sales trend heatmap bar chart by day and hour for PDF reports.
 *
 * @description
 * Analyzes sales data to create a heatmap-style bar chart showing revenue intensity
 * across a 7-day × 24-hour grid. Each bar's opacity represents revenue volume
 * relative to peak performance, helping identify optimal business hours across
 * different days of the week. Uses dynamic color opacity based on revenue intensity
 * for visual impact in PDF reports.
 *
 * @param data - Array of processed sales data rows with Revenue and Sales Date In.
 * @returns This function does not return a value; it creates a Chart.js heatmap bar chart.
 *
 * @example
 * // Generate day-hour sales heatmap
 * const salesData = [
 *   { Revenue: 500000, "Sales Date In": new Date("2024-01-15T14:30:00") }, // Monday 2PM
 *   { Revenue: 300000, "Sales Date In": new Date("2024-01-16T19:45:00") }  // Tuesday 7PM
 * ];
 * generateSalesTrendHourDayChart(salesData);
 * // Creates heatmap bar chart showing revenue intensity by day/hour
 */
function generateSalesTrendHourDayChart(data: any[]): void {
  const heatmapData = Array(7).fill(0).map(() => Array(24).fill(0))
  let maxOmzet = 0

  data.forEach((d) => {
    const day = d['Sales Date In'].getDay()
    const hour = d['Sales Date In'].getHours()
    heatmapData[day][hour] += d.Revenue
    if (heatmapData[day][hour] > maxOmzet) {
      maxOmzet = heatmapData[day][hour]
    }
  })

  createChart('sales-trend-hour-day-pdf', 'bar', {
    labels: Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, '0')),
    datasets: [{
      label: 'Sales Trend',
      data: heatmapData,
      backgroundColor: (context) => {
        const value = context.dataset.data[context.dataIndex]
        const alpha = maxOmzet > 0 ? value / maxOmzet : 0
        return `rgba(79, 70, 229, ${alpha})`
      },
    }],
  })
}

/**
 * Generate hourly Total Check trend chart for PDF reports.
 *
 * @description
 * Creates a line chart showing total transaction count trends per hour across
 * the entire analysis period. Calculates unique bill count for each hour (0-23)
 * by aggregating all transactions throughout the dataset. Helps identify
 * peak transaction hours and customer arrival patterns for operational
 * planning and staffing optimization.
 *
 * @param data - Array of processed sales data rows with Bill Number and Sales Date In.
 * @returns This function does not return a value; it creates a Chart.js line chart.
 *
 * @example
 * // Generate hourly TC trend chart
 * const salesData = [
 *   { "Bill Number": "B001", "Sales Date In": new Date("2024-01-15T14:30:00") },
 *   { "Bill Number": "B002", "Sales Date In": new Date("2024-01-15T19:45:00") },
 *   { "Bill Number": "B003", "Sales Date In": new Date("2024-01-16T14:15:00") }
 * ];
 * generateTcTrendHourChart(salesData);
 * // Creates line chart showing hourly transaction count trends
 */
function generateTcTrendHourChart(data: any[]): void {
  const hourlyTc = Array(24).fill(0)
  const billsByHour = {}

  data.forEach((d) => {
    const hour = d['Sales Date In'].getHours()
    const billNumber = d['Bill Number']
    if (!billsByHour[hour]) {
      billsByHour[hour] = new Set()
    }
    billsByHour[hour].add(billNumber)
  })

  for (let i = 0; i < 24; i++) {
    if (billsByHour[i]) {
      hourlyTc[i] = billsByHour[i].size
    }
  }

  createChart('tc-trend-hour-pdf', 'line', {
    labels: Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, '0')),
    datasets: [{
      label: 'TC Trend per Jam',
      data: hourlyTc,
      borderColor: '#F97316',
      tension: 0.1,
    }],
  })
}

/**
 * Generate hourly APC trend line chart for daily spending pattern analysis.
 *
 * @description
 * Analyzes sales data to calculate Average Per Customer (APC) for each hour of the day
 * (0-23). Groups revenue by hour, counts unique bills per hour, and computes APC
 * to reveal daily customer spending behavior patterns and identify peak spending hours.
 *
 * @param data - Array of processed sales data rows with Revenue, Bill Number, and Sales Date In.
 * @returns This function does not return a value; it creates a Chart.js line chart.
 *
 * @example
 * // Generate hourly APC trend chart
 * const salesData = [
 *   { Revenue: 100000, "Bill Number": "001", "Sales Date In": new Date("2024-01-01 14:30") },
 *   { Revenue: 150000, "Bill Number": "002", "Sales Date In": new Date("2024-01-01 19:45") }
 * ];
 * generateApcTrendHourChart(salesData);
 * // Creates line chart showing APC values for each hour (14:00, 19:00, etc.)
 */
function generateApcTrendHourChart(data: any[]): void {
  const hourlyApc = Array(24).fill(0)
  const hourlyRevenue = Array(24).fill(0)
  const hourlyBills = Array(24).fill(0).map(() => new Set())

  data.forEach((d) => {
    const hour = d['Sales Date In'].getHours()
    hourlyRevenue[hour] += d.Revenue
    hourlyBills[hour].add(d['Bill Number'])
  })

  for (let i = 0; i < 24; i++) {
    const totalBills = hourlyBills[i].size
    if (totalBills > 0) {
      hourlyApc[i] = hourlyRevenue[i] / totalBills
    }
  }

  createChart('apc-trend-hour-pdf', 'line', {
    labels: Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, '0')),
    datasets: [{
      label: 'APC Trend per Jam',
      data: hourlyApc,
      borderColor: '#3B82F6',
      tension: 0.1,
    }],
  })
}

/**
 * Creates a bar chart to display popular times based on transaction frequency (version 2).
 *
 * @param {Array} data - Processed sales data array.
 *
 * @description
 * This function analyzes sales data to calculate and display
 * transaction frequency per hour of the day.
 * This chart helps in understanding peak hours based on the number of transactions.
 * @returns {void}
 */
 function generatePopularTimesChart2(data) {
   const hourlyTraffic = Array(24).fill(0);
   const billsByHour = {};

   data.forEach((d) => {
     const hour = d['Sales Date In'].getHours();
     const billNumber = d['Bill Number'];
     if (!billsByHour[hour]) {
       billsByHour[hour] = new Set();
     }
     billsByHour[hour].add(billNumber);
   });

   for (let i = 0; i < 24; i++) {
     if (billsByHour[i]) {
       hourlyTraffic[i] = billsByHour[i].size;
     }
   }

   createChart('popular-times-chart-2-pdf', 'bar', {
     labels: Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, '0')),
     datasets: [{
       label: 'Popular Times',
       data: hourlyTraffic,
       backgroundColor: '#4F46E5',
     }],
   }, {
       // This makes the chart horizontal to match the design
       indexAxis: 'y',
       plugins: { legend: { display: false } }
   });
 }

 // In main.ts, ADD this new function

/**
 * Analyzes sales data to identify peak days and weekdays, along with popular menu items.
 *
 * @param {Array} data - Processed sales data array.
 *
 * @description
 * This function determines the busiest day of the week and the busiest weekday based on transaction count.
 * It then identifies the top menu items sold on these peak days. This analysis helps in understanding
 * customer behavior and optimizing operations during peak days.
 */
 function generatePeakDayWeekdayAnalysis(data) {
     if (data.length === 0) return;

     // Helper to get top menu by quantity from a dataset
     const getTopMenu = (dataset) => {
         if (dataset.length === 0) return 'N/A';
         const menuQty = dataset.reduce((acc, d) => {
             acc[d.Menu] = (acc[d.Menu] || 0) + d.Quantity;
             return acc;
         }, {});
         return Object.entries(menuQty).toSorted((a, b) => b[1] - a[1])[0]?.[0] || 'N/A';
     };

     // 1. Find the top 3 busiest days (Peak Days)
     const dailyBills = Array(7).fill(0).map(() => new Set());
     data.forEach(d => {
         dailyBills[d['Sales Date In'].getDay()].add(d['Bill Number']);
     });
     const dayLabels = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
     const dailyTraffic = dailyBills.map((bills, i) => ({ dayIndex: i, name: dayLabels[i], count: bills.size }));
     const peakDays = dailyTraffic.toSorted((a, b) => b.count - a.count).slice(0, 3);
     const peakDayIndices = peakDays.map(d => d.dayIndex);

     // 2. Analyze transactions on Peak Days
     const peakDayData = data.filter(d => peakDayIndices.includes(d['Sales Date In'].getDay()));
     const peakDayBillTotals = Object.values(peakDayData.reduce((acc, d) => {
         acc[d['Bill Number']] = (acc[d['Bill Number']] || 0) + d.Revenue;
         return acc;
     }, {})).toSorted((a, b) => a - b);

     const minCheck = peakDayBillTotals[Math.floor(peakDayBillTotals.length * 0.25)] || 0;
     const maxCheck = peakDayBillTotals[Math.floor(peakDayBillTotals.length * 0.75)] || 0;

     // 3. Analyze Weekday Breakfast (Mon-Fri, 7am-10am)
     const weekdayBreakfastData = data.filter(d => {
         const day = d['Sales Date In'].getDay();
         const hour = d['Sales Date In'].getHours();
         return day >= 1 && day <= 5 && hour >= 7 && hour < 10;
     });
     const weekdayBreakfastApc = weekdayBreakfastData.reduce((sum, d) => sum + d.Revenue, 0) / (new Set(weekdayBreakfastData.map(d => d['Bill Number'])).size || 1);

     // 4. Update the store
     $store.setStorePartial({
         avgCheckPeakDayMin: formatNumber(minCheck, 0),
         avgCheckPeakDayMax: formatNumber(maxCheck, 0),
         peakDaysText: peakDays.map(d => d.name).join(', '),
         apcWeekdayBreakfast: formatCurrency(weekdayBreakfastApc, 'Rp ', 0),
         popularMenuWeekdayBreakfast: getTopMenu(weekdayBreakfastData),
     });
 }

/**
 * Generate weekly sales trend chart for PDF reports.
 *
 * @description
 * Analyzes sales data to create a line chart showing weekly revenue trends over time.
 * Groups revenue by week (starting Sunday) and sorts chronologically to display
 * sales progression. Similar to generateSalesTrendMingguanChart but specifically
 * for PDF report generation without AI data storage. Helps identify weekly patterns,
 * seasonal trends, and business growth trajectories for reporting purposes.
 *
 * @param data - Array of processed sales data rows with Revenue and Sales Date In.
 * @returns This function does not return a value; it creates a Chart.js line chart.
 *
 * @example
 * // Generate weekly sales trend for PDF
 * const salesData = [
 *   { Revenue: 500000, "Sales Date In": new Date("2024-01-15") }, // Week of Jan 14
 *   { Revenue: 600000, "Sales Date In": new Date("2024-01-22") }  // Week of Jan 21
 * ];
 * generateSalesTrendWeekChart(salesData);
 * // Creates line chart showing weekly revenue progression
 */
function generateSalesTrendWeekChart(data: any[]): void {
  const weeklySales = {}

  data.forEach((d) => {
    const firstDayOfWeek = new Date(d['Sales Date In'])
    firstDayOfWeek.setDate(d['Sales Date In'].getDate() - d['Sales Date In'].getDay())
    const weekLabel = firstDayOfWeek.toISOString().split('T')

    if (!weeklySales[weekLabel]) {
      weeklySales[weekLabel] = 0
    }
    weeklySales[weekLabel] += d.Revenue
  })

  const sortedWeeks = Object.keys(weeklySales).toSorted()
  const salesData = sortedWeeks.map((week) => weeklySales[week])

  createChart('sales-trend-week-pdf', 'line', {
    labels: sortedWeeks,
    datasets: [{
      label: 'Sales Trend per Minggu',
      data: salesData,
      borderColor: '#4F46E5',
      tension: 0.1,
    }],
  })
}

/**
 * Generate weekly Total Check trend chart for PDF reports.
 *
 * @description
 * Creates a line chart showing weekly transaction count trends over time.
 * Groups unique bill count by week (starting Sunday) and sorts chronologically
 * to display transaction progression. Helps identify weekly patterns, seasonal
 * trends, and business growth trajectories for strategic planning and
 * performance analysis.
 *
 * @param data - Array of processed sales data rows with Bill Number and Sales Date In.
 * @returns This function does not return a value; it creates a Chart.js line chart.
 *
 * @example
 * // Generate weekly TC trend chart
 * const salesData = [
 *   { "Bill Number": "B001", "Sales Date In": new Date("2024-01-15") }, // Week of Jan 14
 *   { "Bill Number": "B002", "Sales Date In": new Date("2024-01-22") }  // Week of Jan 21
 * ];
 * generateTcTrendWeekChart(salesData);
 * // Creates line chart showing weekly transaction count progression
 */
function generateTcTrendWeekChart(data: any[]): void {
  const weeklyTc = {}
  const weeklyBills = {}

  data.forEach((d) => {
    const firstDayOfWeek = new Date(d['Sales Date In'])
    firstDayOfWeek.setDate(d['Sales Date In'].getDate() - d['Sales Date In'].getDay())
    const weekLabel = firstDayOfWeek.toISOString().split('T')

    if (!weeklyBills[weekLabel]) {
      weeklyBills[weekLabel] = new Set()
    }
    weeklyBills[weekLabel].add(d['Bill Number'])
  })

  const sortedWeeks = Object.keys(weeklyBills).toSorted()
  const tcData = sortedWeeks.map((week) => weeklyBills[week].size)

  createChart('tc-trend-week-pdf', 'line', {
    labels: sortedWeeks,
    datasets: [{
      label: 'TC Trend per Minggu',
      data: tcData,
      borderColor: '#10B981',
      tension: 0.1,
    }],
  })
}

/**
 * Generate weekly APC trend line chart for long-term spending pattern analysis.
 *
 * @description
 * Analyzes sales data to calculate Average Per Customer (APC) for each week
 * (starting from Sunday). Groups revenue by week, counts unique bills per week,
 * and computes APC to reveal weekly customer spending behavior patterns and
 * identify trends over the analyzed time period.
 *
 * @param data - Array of processed sales data rows with Revenue, Bill Number, and Sales Date In.
 * @returns This function does not return a value; it creates a Chart.js line chart.
 *
 * @example
 * // Generate weekly APC trend chart
 * const salesData = [
 *   { Revenue: 500000, "Bill Number": "001", "Sales Date In": new Date("2024-01-15") },
 *   { Revenue: 750000, "Bill Number": "002", "Sales Date In": new Date("2024-01-22") }
 * ];
 * generateApcTrendWeekChart(salesData);
 * // Creates line chart showing APC trends by week starting from Sunday
 */
function generateApcTrendWeekChart(data: any[]): void {
  const weeklyApc = {}
  const weeklyBills = {}
  const weeklyRevenue = {}

  data.forEach((d) => {
    const firstDayOfWeek = new Date(d['Sales Date In'])
    firstDayOfWeek.setDate(d['Sales Date In'].getDate() - d['Sales Date In'].getDay())
    const weekLabel = firstDayOfWeek.toISOString().split('T')

    if (!weeklyBills[weekLabel]) {
      weeklyBills[weekLabel] = new Set()
      weeklyRevenue[weekLabel] = 0
    }
    weeklyBills[weekLabel].add(d['Bill Number'])
    weeklyRevenue[weekLabel] += d.Revenue
  })

  const sortedWeeks = Object.keys(weeklyBills).toSorted()
  const apcData = sortedWeeks.map((week) => {
    const totalBills = weeklyBills[week].size
    const totalRevenue = weeklyRevenue[week]
    return totalBills > 0 ? totalRevenue / totalBills : 0
  })

  createChart('apc-trend-week-pdf', 'line', {
    labels: sortedWeeks,
    datasets: [{
      label: 'APC Trend per Minggu',
      data: apcData,
      borderColor: '#10B981',
      tension: 0.1,
    }],
  })
}

/**
 * Generate sales channel revenue distribution donut chart for PDF reports.
 *
 * @description
 * Analyzes sales data to calculate total revenue per sales channel (Visit Purpose)
 * and creates a donut chart showing revenue distribution across channels like
 * Dine-In, Take Away, GoFood, etc. Uses vibrant colors for clear channel
 * differentiation and is optimized for PDF report inclusion with proper sizing.
 *
 * @param data - Array of processed sales data rows with Revenue and Visit Purpose.
 * @returns This function does not return a value; it creates a Chart.js donut chart.
 *
 * @example
 * // Generate sales channel distribution for PDF
 * const salesData = [
 *   { Revenue: 500000, "Visit Purpose": "Dine-In" },
 *   { Revenue: 300000, "Visit Purpose": "Take Away" }
 * ];
 * generateSalesChannelChart(salesData);
 * // Creates donut chart showing revenue percentage by sales channel
 */
function generateSalesChannelChart(data: any[]): void {
  const channelSales = data.reduce((acc, d) => {
    const channel = d['Visit Purpose'] || 'Unknown'
    acc[channel] = (acc[channel] || 0) + d.Revenue
    return acc
  }, {})

  createChart('sales-channel-chart-pdf', 'doughnut', {
    labels: Object.keys(channelSales),
    datasets: [{
      data: Object.values(channelSales),
      backgroundColor: ['#3B82F6', '#10B981', '#F97316', '#8B5CF6', '#EC4899', '#F59E0B'],
    }],
  })
}

/**
 * Generate hourly sales trend chart by sales channel for PDF reports.
 *
 * @description
 * Analyzes sales data to create a multi-line chart showing hourly revenue trends
 * for each sales channel (Visit Purpose). Groups revenue by channel and hour
 * (0-23), creating separate trend lines for channels like Dine-In, GoFood,
 * GrabFood, etc. Helps identify peak hours per channel and optimize channel-specific
 * operations and marketing strategies.
 *
 * @param data - Array of processed sales data rows with Revenue, Visit Purpose, and Sales Date In.
 * @returns This function does not return a value; it creates a Chart.js multi-line chart.
 *
 * @example
 * // Generate hourly sales trends by channel
 * const salesData = [
 *   { Revenue: 500000, "Visit Purpose": "Dine-In", "Sales Date In": new Date("2024-01-15T14:30:00") },
 *   { Revenue: 300000, "Visit Purpose": "GoFood", "Sales Date In": new Date("2024-01-15T19:45:00") }
 * ];
 * generateSalesTrendChannelHourChart(salesData);
 * // Creates multi-line chart showing hourly trends per sales channel
 */
function generateSalesTrendChannelHourChart(data: any[]): void {
  const channelData = {}
  data.forEach((d) => {
    const channel = d['Visit Purpose'] || 'Unknown'
    const hour = d['Sales Date In'].getHours()
    if (!channelData[channel]) {
      channelData[channel] = Array(24).fill(0)
    }
    channelData[channel][hour] += d.Revenue
  })

  createChart('sales-trend-channel-hour-pdf', 'line', {
    labels: Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, '0')),
    datasets: Object.keys(channelData).map((channel) => ({
      label: channel,
      data: channelData[channel],
      tension: 0.1,
    })),
  })
}

/**
 * Generate weekly sales trend chart by sales channel for PDF reports.
 *
 * @description
 * Analyzes sales data to create a multi-line chart showing weekly revenue patterns
 * for each sales channel (Visit Purpose) across days of the week (Sunday-Saturday).
 * Groups revenue by channel and day of week, creating separate trend lines for
 * channels like Dine-In, GoFood, GrabFood, etc. Helps identify weekly patterns
 * and optimize channel-specific operations for different days.
 *
 * @param data - Array of processed sales data rows with Revenue, Visit Purpose, and Sales Date In.
 * @returns This function does not return a value; it creates a Chart.js multi-line chart.
 *
 * @example
 * // Generate weekly sales trends by channel
 * const salesData = [
 *   { Revenue: 500000, "Visit Purpose": "Dine-In", "Sales Date In": new Date("2024-01-15") }, // Monday
 *   { Revenue: 300000, "Visit Purpose": "GoFood", "Sales Date In": new Date("2024-01-16") }  // Tuesday
 * ];
 * generateSalesTrendChannelWeekChart(salesData);
 * // Creates multi-line chart showing weekly patterns per sales channel
 */
function generateSalesTrendChannelWeekChart(data: any[]): void {
  const channelData = {}
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  data.forEach((d) => {
    const channel = d['Visit Purpose'] || 'Unknown'
    const day = d['Sales Date In'].getDay()
    if (!channelData[channel]) {
      channelData[channel] = Array(7).fill(0)
    }
    channelData[channel][day] += d.Revenue
  })

  createChart('sales-trend-channel-week-pdf', 'line', {
    labels: days,
    datasets: Object.keys(channelData).map((channel) => ({
      label: channel,
      data: channelData[channel],
      tension: 0.1,
    })),
  })
}

/**
 * Generate monthly sales trend chart by sales channel for PDF reports.
 *
 * @description
 * Analyzes sales data to create a multi-line chart showing monthly revenue trends
 * for each sales channel (Visit Purpose). Groups revenue by channel and month,
 * creating separate trend lines for channels like Dine-In, GoFood, GrabFood, etc.
 * Helps identify seasonal patterns and long-term channel performance trends
 * for strategic planning and channel optimization.
 *
 * @param data - Array of processed sales data rows with Revenue, Visit Purpose, and Sales Date In.
 * @returns This function does not return a value; it creates a Chart.js multi-line chart.
 *
 * @example
 * // Generate monthly sales trends by channel
 * const salesData = [
 *   { Revenue: 500000, "Visit Purpose": "Dine-In", "Sales Date In": new Date("2024-01-15") },
 *   { Revenue: 300000, "Visit Purpose": "GoFood", "Sales Date In": new Date("2024-02-15") }
 * ];
 * generateSalesTrendChannelMonthChart(salesData);
 * // Creates multi-line chart showing monthly trends per sales channel
 */
function generateSalesTrendChannelMonthChart(data: any[]): void {
  const channelData = {}
  const months = [...new Set(data.map((d) => d['Sales Date In'].toISOString().slice(0, 7)))].toSorted()
  data.forEach((d) => {
    const channel = d['Visit Purpose'] || 'Unknown'
    const month = d['Sales Date In'].toISOString().slice(0, 7)
    if (!channelData[channel]) {
      channelData[channel] = {}
    }
    channelData[channel][month] = (channelData[channel][month] || 0) + d.Revenue
  })

  createChart('sales-trend-channel-month-pdf', 'line', {
    labels: months,
    datasets: Object.keys(channelData).map((channel) => ({
      label: channel,
      data: months.map((month) => channelData[channel][month] || 0),
      tension: 0.1,
    })),
  })
}

/**
 * Generate hourly Total Check trend chart by sales channel for PDF reports.
 *
 * @description
 * Creates a multi-line chart showing hourly transaction count trends for each
 * sales channel (Visit Purpose). Groups transaction frequency by channel and hour
 * (0-23), creating separate trend lines for channels like Dine-In, GoFood,
 * GrabFood, etc. Helps identify peak transaction hours per channel and optimize
 * channel-specific staffing and operational strategies.
 *
 * @param data - Array of processed sales data rows with Visit Purpose and Sales Date In.
 * @returns This function does not return a value; it creates a Chart.js multi-line chart.
 *
 * @example
 * // Generate hourly TC trends by channel
 * const salesData = [
 *   { "Visit Purpose": "Dine-In", "Sales Date In": new Date("2024-01-15T14:30:00") },
 *   { "Visit Purpose": "GoFood", "Sales Date In": new Date("2024-01-15T19:45:00") }
 * ];
 * generateTcTrendChannelHourChart(salesData);
 * // Creates multi-line chart showing hourly transaction trends per sales channel
 */
function generateTcTrendChannelHourChart(data: any[]): void {
  const channelData = {}
  data.forEach((d) => {
    const channel = d['Visit Purpose'] || 'Unknown'
    const hour = d['Sales Date In'].getHours()
    if (!channelData[channel]) {
      channelData[channel] = Array(24).fill(0)
    }
    channelData[channel][hour]++
  })

  createChart('tc-trend-channel-hour-pdf', 'line', {
    labels: Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, '0')),
    datasets: Object.keys(channelData).map((channel) => ({
      label: channel,
      data: channelData[channel],
      tension: 0.1,
    })),
  })
}

/**
 * Generate weekly Total Check trend chart by sales channel for PDF reports.
 *
 * @description
 * Creates a multi-line chart showing weekly transaction count patterns for each
 * sales channel (Visit Purpose) across days of the week (Sunday-Saturday).
 * Groups transaction frequency by channel and day of week, creating separate
 * trend lines for channels like Dine-In, GoFood, GrabFood, etc. Helps identify
 * weekly patterns and optimize channel-specific operations for different days.
 *
 * @param data - Array of processed sales data rows with Visit Purpose and Sales Date In.
 * @returns This function does not return a value; it creates a Chart.js multi-line chart.
 *
 * @example
 * // Generate weekly TC trends by channel
 * const salesData = [
 *   { "Visit Purpose": "Dine-In", "Sales Date In": new Date("2024-01-15") }, // Monday
 *   { "Visit Purpose": "GoFood", "Sales Date In": new Date("2024-01-16") }  // Tuesday
 * ];
 * generateTcTrendChannelWeekChart(salesData);
 * // Creates multi-line chart showing weekly transaction patterns per sales channel
 */
function generateTcTrendChannelWeekChart(data: any[]): void {
  const channelData = {}
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  data.forEach((d) => {
    const channel = d['Visit Purpose'] || 'Unknown'
    const day = d['Sales Date In'].getDay()
    if (!channelData[channel]) {
      channelData[channel] = Array(7).fill(0)
    }
    channelData[channel][day]++
  })

  createChart('tc-trend-channel-week-pdf', 'line', {
    labels: days,
    datasets: Object.keys(channelData).map((channel) => ({
      label: channel,
      data: channelData[channel],
      tension: 0.1,
    })),
  })
}

/**
 * Generate monthly Total Check trend chart by sales channel for PDF reports.
 *
 * @description
 * Creates a multi-line chart showing monthly transaction count trends for each
 * sales channel (Visit Purpose). Groups transaction frequency by channel and month,
 * creating separate trend lines for channels like Dine-In, GoFood, GrabFood, etc.
 * Helps identify seasonal patterns and long-term channel performance trends
 * for strategic planning and channel optimization.
 *
 * @param data - Array of processed sales data rows with Visit Purpose and Sales Date In.
 * @returns This function does not return a value; it creates a Chart.js multi-line chart.
 *
 * @example
 * // Generate monthly TC trends by channel
 * const salesData = [
 *   { "Visit Purpose": "Dine-In", "Sales Date In": new Date("2024-01-15") },
 *   { "Visit Purpose": "GoFood", "Sales Date In": new Date("2024-02-15") }
 * ];
 * generateTcTrendChannelMonthChart(salesData);
 * // Creates multi-line chart showing monthly transaction trends per sales channel
 */
function generateTcTrendChannelMonthChart(data: any[]): void {
  const channelData = {}
  const months = [...new Set(data.map((d) => d['Sales Date In'].toISOString().slice(0, 7)))].toSorted()
  data.forEach((d) => {
    const channel = d['Visit Purpose'] || 'Unknown'
    const month = d['Sales Date In'].toISOString().slice(0, 7)
    if (!channelData[channel]) {
      channelData[channel] = {}
    }
    channelData[channel][month] = (channelData[channel][month] || 0) + 1
  })

  createChart('tc-trend-channel-month-pdf', 'line', {
    labels: months,
    datasets: Object.keys(channelData).map((channel) => ({
      label: channel,
      data: months.map((month) => channelData[channel][month] || 0),
      tension: 0.1,
    })),
  })
}

/**
 * Generate multi-line chart showing hourly APC trends by sales channel.
 *
 * @description
 * Analyzes sales data to calculate Average Per Customer (APC) for each hour of the day,
 * segmented by sales channel (Visit Purpose). Creates separate trend lines for each
 * channel to compare spending patterns across different customer acquisition channels
 * throughout the day. Useful for identifying peak spending times per channel.
 *
 * @param data - Array of processed sales data rows with Revenue, Bill Number, Sales Date In, and Visit Purpose.
 * @returns This function does not return a value; it creates a multi-line Chart.js chart.
 *
 * @example
 * // Generate hourly APC trends by channel
 * const salesData = [
 *   { Revenue: 100000, "Bill Number": "001", "Sales Date In": new Date("2024-01-01 14:30"), "Visit Purpose": "Dine In" },
 *   { Revenue: 75000, "Bill Number": "002", "Sales Date In": new Date("2024-01-01 14:45"), "Visit Purpose": "Take Away" }
 * ];
 * generateApcTrendChannelHourChart(salesData);
 * // Creates multi-line chart with separate lines for "Dine In" and "Take Away" APC trends by hour
 */
function generateApcTrendChannelHourChart(data: any[]): void {
  const channelData = {}
  data.forEach((d) => {
    const channel = d['Visit Purpose'] || 'Unknown'
    const hour = d['Sales Date In'].getHours()
    if (!channelData[channel]) {
      channelData[channel] = { revenue: Array(24).fill(0), bills: Array(24).fill(0).map(() => new Set()) }
    }
    channelData[channel].revenue[hour] += d.Revenue
    channelData[channel].bills[hour].add(d['Bill Number'])
  })

  const datasets = Object.keys(channelData).map((channel) => {
    const apcData = Array(24).fill(0)
    for (let i = 0; i < 24; i++) {
      const totalBills = channelData[channel].bills[i].size
      if (totalBills > 0) {
        apcData[i] = channelData[channel].revenue[i] / totalBills
      }
    }
    return {
      label: channel,
      data: apcData,
      tension: 0.1,
    }
  })

  createChart('apc-trend-channel-hour-pdf', 'line', {
    labels: Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, '0')),
    datasets: datasets,
  })
}

/**
 * Generate multi-line chart showing weekly APC trends by sales channel and day.
 *
 * @description
 * Analyzes sales data to calculate Average Per Customer (APC) for each day of the week,
 * segmented by sales channel (Visit Purpose). Creates separate trend lines for each
 * channel to compare spending patterns across different customer acquisition channels
 * throughout the week. Useful for identifying weekly patterns and optimal days per channel.
 *
 * @param data - Array of processed sales data rows with Revenue, Bill Number, Sales Date In, and Visit Purpose.
 * @returns This function does not return a value; it creates a multi-line Chart.js chart.
 *
 * @example
 * // Generate weekly APC trends by channel
 * const salesData = [
 *   { Revenue: 200000, "Bill Number": "001", "Sales Date In": new Date("2024-01-01"), "Visit Purpose": "Dine In" }, // Monday
 *   { Revenue: 150000, "Bill Number": "002", "Sales Date In": new Date("2024-01-07"), "Visit Purpose": "Take Away" } // Sunday
 * ];
 * generateApcTrendChannelWeekChart(salesData);
 * // Creates multi-line chart with separate lines for each channel's daily APC patterns
 */
function generateApcTrendChannelWeekChart(data: any[]): void {
  const channelData = {}
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  data.forEach((d) => {
    const channel = d['Visit Purpose'] || 'Unknown'
    const day = d['Sales Date In'].getDay()
    if (!channelData[channel]) {
      channelData[channel] = { revenue: Array(7).fill(0), bills: Array(7).fill(0).map(() => new Set()) }
    }
    channelData[channel].revenue[day] += d.Revenue
    channelData[channel].bills[day].add(d['Bill Number'])
  })

  const datasets = Object.keys(channelData).map((channel) => {
    const apcData = Array(7).fill(0)
    for (let i = 0; i < 7; i++) {
      const totalBills = channelData[channel].bills[i].size
      if (totalBills > 0) {
        apcData[i] = channelData[channel].revenue[i] / totalBills
      }
    }
    return {
      label: channel,
      data: apcData,
      tension: 0.1,
    }
  })

  createChart('apc-trend-channel-week-pdf', 'line', {
    labels: days,
    datasets: datasets,
  })
}

/**
 * Generate multi-line chart showing monthly APC trends by sales channel.
 *
 * @description
 * Analyzes sales data to calculate Average Per Customer (APC) for each month,
 * segmented by sales channel (Visit Purpose). Creates separate trend lines for each
 * channel to compare long-term spending patterns across different customer acquisition
 * channels. Useful for identifying seasonal trends and channel performance over time.
 *
 * @param data - Array of processed sales data rows with Revenue, Bill Number, Sales Date In, and Visit Purpose.
 * @returns This function does not return a value; it creates a multi-line Chart.js chart.
 *
 * @example
 * // Generate monthly APC trends by channel
 * const salesData = [
 *   { Revenue: 500000, "Bill Number": "001", "Sales Date In": new Date("2024-01-15"), "Visit Purpose": "Dine In" },
 *   { Revenue: 300000, "Bill Number": "002", "Sales Date In": new Date("2024-02-10"), "Visit Purpose": "Take Away" }
 * ];
 * generateApcTrendChannelMonthChart(salesData);
 * // Creates multi-line chart with separate lines for each channel's monthly APC trends
 */
function generateApcTrendChannelMonthChart(data: any[]): void {
  const channelData = {}
  const months = [...new Set(data.map((d) => d['Sales Date In'].toISOString().slice(0, 7)))].toSorted()
  data.forEach((d) => {
    const channel = d['Visit Purpose'] || 'Unknown'
    const month = d['Sales Date In'].toISOString().slice(0, 7)
    if (!channelData[channel]) {
      channelData[channel] = { revenue: {}, bills: {} }
    }
    if (!channelData[channel].bills[month]) {
      channelData[channel].bills[month] = new Set()
      channelData[channel].revenue[month] = 0
    }
    channelData[channel].bills[month].add(d['Bill Number'])
    channelData[channel].revenue[month] += d.Revenue
  })

  const datasets = Object.keys(channelData).map((channel) => {
    const apcData = months.map((month) => {
      const totalBills = channelData[channel].bills[month] ? channelData[channel].bills[month].size : 0
      const totalRevenue = channelData[channel].revenue[month] || 0
      return totalBills > 0 ? totalRevenue / totalBills : 0
    })
    return {
      label: channel,
      data: apcData,
      tension: 0.1,
    }
  })

  createChart('apc-trend-channel-month-pdf', 'line', {
    labels: months,
    datasets: datasets,
  })
}

// --- Navigation ---
document.getElementById('back-to-dashboard-btn').addEventListener('click', () => showView('main-menu'));
document.getElementById('back-to-dashboard-from-admin-btn').addEventListener('click', () => showView('main-menu'));
document.getElementById('back-to-dashboard-from-konfigurasi-btn').addEventListener('click', () => showView('main-menu'));

/**
 * Generate donut chart showing revenue distribution across business branches.
 *
 * @description
 * Analyzes sales data to aggregate total revenue by branch location, then creates
 * a donut chart visualization to display each branch's revenue contribution as
 * percentage of total sales. Branches are sorted by revenue performance to
 * identify top-performing locations and revenue distribution patterns.
 *
 * @param data - Array of processed sales data rows with Revenue and Branch properties.
 * @returns This function does not return a value; it creates a Chart.js donut chart.
 *
 * @example
 * // Generate branch sales distribution donut chart
 * const salesData = [
 *   { Revenue: 5000000, Branch: "Jakarta Pusat" },
 *   { Revenue: 3000000, Branch: "Bandung" },
 *   { Revenue: 2000000, Branch: "Surabaya" }
 * ];
 * generateBranchSalesDonutChart(salesData);
 * // Creates donut chart showing revenue percentage per branch
 */
function generateBranchSalesDonutChart(data: any[]): void {
  const branchSales = data.reduce((acc, d) => {
    const branch = d.Branch || 'Unknown'
    acc[branch] = (acc[branch] || 0) + d.Revenue
    return acc
  }, {})

  const sortedBranches = Object.entries(branchSales).toSorted((a, b) => b - a)

  createChart('branch-sales-donut-chart', 'doughnut', {
    labels: sortedBranches.map((entry) => entry),
    datasets: [{
      data: sortedBranches.map((entry) => entry),
      backgroundColor: ['#4F46E5', '#F59E0B', '#10B981', '#3B82F6', '#6366F1', '#FBBF24'],
      hoverOffset: 4,
    }],
  }, {
    plugins: {
      legend: {
        display: false,
      },
    },
  })
}

/**
 * Builds a quadrant chart to analyze products within a menu category.
 *
 * @param {Array} data - Processed sales data array.
 * @param {string} category - Menu category to analyze.
 * @param {string} containerId - ID of the container element where the chart will be rendered.
 *
 * @description
 * Analyzes product-level sales in the given category and visualizes them in a quadrant
 * chart based on revenue and quantity. The four resulting quadrants are:
 *   • Star  — high revenue, high quantity
 *   • Cash Cow — high revenue, low quantity
 *   • Horse — low revenue, high quantity
 *   • Dog  — low revenue, low quantity.
 */
 function generateProductQuadrantChart(data, category, containerId) {
   const container = document.getElementById(containerId);
   container.innerHTML = ''; // Clear previous content

   const categoryData = data.filter((d) => d['Menu Category'] === category);
   if (categoryData.length === 0) {
     container.innerHTML = '<p class="text-gray-500 col-span-2 row-span-2 flex items-center justify-center">No data for this category.</p>';
     return;
   }

   const productStats = categoryData.reduce((acc, d) => {
     const menu = d.Menu || 'Unknown';
     if (!acc[menu]) {
       acc[menu] = { revenue: 0, quantity: 0 };
     }
     acc[menu].revenue += d.Revenue;
     acc[menu].quantity += d.Quantity;
     return acc;
   }, {});

   const statsArray = Object.entries(productStats).map(([name, stats]) => ({
     name,
     ...stats,
   }));

   const avgRevenue = statsArray.reduce((sum, p) => sum + p.revenue, 0) / statsArray.length;
   const avgQuantity = statsArray.reduce((sum, p) => sum + p.quantity, 0) / statsArray.length;

   const quadrants = {
     star: [], // High revenue, high quantity
     cashcow: [], // High revenue, low quantity
     horse: [], // Low revenue, high quantity
     dog: [], // Low revenue, low quantity
   };

   statsArray.forEach((p) => {
     if (p.revenue >= avgRevenue && p.quantity >= avgQuantity) quadrants.star.push(p);
     else if (p.revenue >= avgRevenue && p.quantity < avgQuantity) quadrants.cashcow.push(p);
     else if (p.revenue < avgRevenue && p.quantity >= avgQuantity) quadrants.horse.push(p);
     else quadrants.dog.push(p);
   });

   // Sort each quadrant by revenue
   for (const key in quadrants) {
     quadrants[key].toSorted((a, b) => b.revenue - a.revenue);
   }

   const createQuadrantHTML = (title, products) => {
     let productsHTML = products.slice(0, 2).map(p => `
       <div class="text-center mb-2">
           <div class="w-24 h-16 bg-gray-200 rounded-lg mx-auto mb-1 flex items-center justify-center text-xs text-gray-500">[Image]</div>
           <p class="text-sm font-semibold">${p.name}</p>
       </div>
     `).join('');

     if (products.length > 2) {
       productsHTML += `<p class="text-xs text-center mt-2 text-gray-400">+ ${products.length - 2} more</p>`;
     }
     if (products.length === 0) {
       productsHTML = '<p class="text-sm text-gray-400 mt-12">No products</p>';
     }
     return `
       <div class="flex flex-col items-center justify-center p-4">
           <h4 class="font-bold text-lg text-gray-700 mb-4">${title}</h4>
           ${productsHTML}
       </div>`;
   };

   container.innerHTML = `
       ${createQuadrantHTML('Cashcow', quadrants.cashcow)}
       ${createQuadrantHTML('Star', quadrants.star)}
       ${createQuadrantHTML('Dog', quadrants.dog)}
       ${createQuadrantHTML('Horse', quadrants.horse)}
   `;
 }


/**
 * Event listener for the 'Analyze All Charts' button.
 *
 * @description
 * Handles clicks on the 'Analyze All Charts' button to analyze
 * all available charts simultaneously.
 * @returns {void}
 */
document.getElementById('analyze-all-btn')?.addEventListener('click', async () => {
  const btn = document.getElementById('analyze-all-btn')
  const buttons = document.querySelectorAll('#analysis-view .analyze-btn')
  const total = buttons.length
  let completed = 0

  btn.disabled = true
  const originalText = btn.textContent

  const updateText = () => {
    btn.textContent = `Analyzing ${completed}/${total} charts...`
  }

  updateText()

  await Promise.all([...buttons].map(async (b) => {
    const chartId = b.dataset.chartId
    await analyzeChart(chartId)
    completed++
    updateText()
  }))

  btn.textContent = '✅ All Analyses Complete'
  setTimeout(() => {
    btn.textContent = originalText
    btn.disabled = false
  }, 3000)
})

// --- PDF Export Modal Logic ---
const pdfExportModal = document.getElementById('pdf-export-modal')
const modalInitialContent = document.getElementById('modal-initial-content')
const modalLoadingContent = document.getElementById('modal-loading-content')
const confirmExportBtn = document.getElementById('confirm-export-btn')
const cancelPdfExportBtn = document.getElementById('cancel-pdf-export-btn')
const mainExportBtn = document.getElementById('export-pdf-btn')
const landscapeExportBtn = document.getElementById('export-pdf-landscape-btn')
const progressBar = document.getElementById('pdf-progress-bar')
const progressText = document.getElementById('pdf-progress-text')
const progressPercent = document.getElementById('pdf-progress-percent')
const pdfPreviewContainer = document.getElementById('pdf-preview-container')

// Track current PDF export mode
let currentPdfMode = 'portrait' // 'portrait' or 'landscape'

/**
 * Event listener for the 'Export to PDF Portrait' button.
 *
 * @description
 * This function handles the click on the 'Export to PDF Portrait' button to display the modal
 * and start the PDF preview generation process for portrait mode.
 * @returns {void}
 */
// When the main "Export to PDF" button is clicked, show the modal and start generating the preview.
mainExportBtn.addEventListener('click', () => {
  currentPdfMode = 'portrait'
  initializePdfExport()
})

/**
 * Event listener for the 'Export to PDF Landscape' button.
 *
 * @description
 * This function handles the click on the 'Export to PDF Landscape' button to display the modal
 * and start the PDF preview generation process for landscape mode.
 * @returns {void}
 */
landscapeExportBtn.addEventListener('click', () => {
  currentPdfMode = 'landscape'
  initializePdfExport()
})

/**
 * Initialize PDF export process for both portrait and landscape modes.
 *
 * @description
 * Common initialization function that sets up the modal and generates charts
 * for both portrait and landscape PDF export modes.
 * @returns {void}
 */
function initializePdfExport(): void {
  // 1. Reset the modal to its initial state
  modalInitialContent.classList.remove('hidden')
  modalLoadingContent.classList.add('hidden')
  progressBar.style.width = '0%'
  progressPercent.textContent = '0%'
  progressText.textContent = 'Initializing...'

  const currentStartDate = new Date(document.getElementById('date-start').value);
  const currentEndDate = new Date(document.getElementById('date-end').value);
  currentEndDate.setHours(23, 59, 59, 999);
  const currentData = $store.getAllSalesData().filter((d) => d['Sales Date In'] >= currentStartDate && d['Sales Date In'] <= currentEndDate);

generatePdfSalesTrendByHourChart(currentData);

  // Hide both containers first
  const portraitContainer = document.getElementById('pdf-portrait')
  const landscapeContainer = document.getElementById('pdf-landscape')

  portraitContainer.classList.add('hidden')
  landscapeContainer.classList.add('hidden')

  // Show the modal
  pdfExportModal.classList.remove('hidden')

  // Make the selected container visible for the preview
  const pdfContainer = document.getElementById(currentPdfMode === 'portrait' ? 'pdf-portrait' : 'pdf-landscape')
  pdfContainer.classList.remove('hidden')
}

/**
 * Event listener for the 'Cancel' button in the PDF export modal.
 *
 * @description
 * This function handles the click on the 'Cancel' button inside the PDF export modal
 * to hide the modal.
 * @returns {void}
 */
// Handle the cancel button inside the modal
cancelPdfExportBtn.addEventListener('click', () => {
  pdfExportModal.classList.add('hidden')
})

/**
 * Event listener for the 'Generate' button in the PDF export modal.
 *
 * @description
 * This function handles the click on the 'Generate' button inside the PDF export modal
 * to start the complete PDF generation process.
 * @returns {Promise<void>}
 */
// Handle the final "Generate" button click
confirmExportBtn.addEventListener('click', async () => {
  // Switch to the loading view
  // modalInitialContent.classList.add('hidden');
  modalLoadingContent.classList.remove('hidden')

  const progressCallback = (currentPage, totalPages) => {
    const percent = totalPages > 0 ? Math.round((currentPage / totalPages) * 100) : 0
    progressBar.style.width = `${percent}%`
    progressPercent.textContent = `${percent}%`
    progressText.textContent = `Processing page ${currentPage} of ${totalPages}...`
  }

  // Run the PDF generation based on current mode
  if (currentPdfMode === 'portrait') {
    await generatePdfReport(progressCallback)
  } else {
    await generateLandscapePdfReport(progressCallback)
  }

  progressText.textContent = 'Export Complete!'

  setTimeout(() => {
    pdfExportModal.classList.add('hidden')
  }, 2000)
})

/**
 * Generate branch contribution chart for landscape PDF.
 *
 * @description
 * Creates a donut chart showing branch contribution for the specified canvas ID.
 *
 * @param data - Array of sales data
 * @param canvasId - Canvas element ID for the chart
 * @returns {void}
 */
function generateBranchContributionChart(data: any[], canvasId: string): void {
  if (data.length === 0) return;

  // Use existing outlet chart logic but with custom canvas ID
  const outletData = data.reduce((acc, d) => {
    const outlet = d['Outlet'] || 'Unknown';
    if (!acc[outlet]) acc[outlet] = 0;
    acc[outlet] += d['Revenue'] || 0;
    return acc;
  }, {});

  const chartData = {
    labels: Object.keys(outletData),
    datasets: [{
      data: Object.values(outletData),
      backgroundColor: [
        '#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0',
        '#9966FF', '#FF9F40', '#FF6384', '#C9CBCF'
      ],
      borderWidth: 2,
      borderColor: '#fff'
    }]
  };

  createChart(canvasId, 'doughnut', chartData, {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'bottom',
        labels: { usePointStyle: true, padding: 15 }
      }
    }
  });
}

/**
 * Generate daily revenue chart for landscape PDF.
 *
 * @description
 * Creates a line chart showing daily revenue trends for the specified canvas ID.
 *
 * @param data - Array of sales data
 * @param canvasId - Canvas element ID for the chart
 * @returns {void}
 */
function generateDailyRevenueChart(data: any[], canvasId: string): void {
  if (data.length === 0) return;

  // Group data by date
  const dailyData = data.reduce((acc, d) => {
    const date = d['Sales Date In'].toISOString().split('T')[0];
    if (!acc[date]) acc[date] = 0;
    acc[date] += d['Revenue'] || 0;
    return acc;
  }, {});

  const sortedDates = Object.keys(dailyData).toSorted();
  const chartData = {
    labels: sortedDates.map(date => new Date(date).toLocaleDateString('id-ID')),
    datasets: [{
      label: 'Daily Revenue',
      data: sortedDates.map(date => dailyData[date]),
      borderColor: '#36A2EB',
      backgroundColor: 'rgba(54, 162, 235, 0.1)',
      fill: true,
      tension: 0.4
    }]
  };

  createChart(canvasId, 'line', chartData, {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      y: {
        beginAtZero: true,
        ticks: {
          callback: function(value) {
            return 'Rp ' + value.toLocaleString('id-ID');
          }
        }
      }
    }
  });
}

/**
 * Generate channel performance chart for landscape PDF.
 *
 * @description
 * Creates a bar chart showing sales channel performance for the specified canvas ID.
 *
 * @param data - Array of sales data
 * @param canvasId - Canvas element ID for the chart
 * @returns {void}
 */
function generateChannelPerformanceChart(data: any[], canvasId: string): void {
  if (data.length === 0) return;

  // Group data by channel
  const channelData = data.reduce((acc, d) => {
    const channel = d['Channel'] || 'Unknown';
    if (!acc[channel]) acc[channel] = 0;
    acc[channel] += d['Revenue'] || 0;
    return acc;
  }, {});

  const chartData = {
    labels: Object.keys(channelData),
    datasets: [{
      label: 'Revenue by Channel',
      data: Object.values(channelData),
      backgroundColor: ['#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0'],
      borderColor: ['#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0'],
      borderWidth: 1
    }]
  };

  createChart(canvasId, 'bar', chartData, {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      y: {
        beginAtZero: true,
        ticks: {
          callback: function(value) {
            return 'Rp ' + value.toLocaleString('id-ID');
          }
        }
      }
    }
  });
}

/**
 * Generate traffic trend chart for landscape PDF.
 *
 * @description
 * Creates a line chart showing traffic trends over time for the specified canvas ID.
 *
 * @param data - Array of sales data
 * @param canvasId - Canvas element ID for the chart
 * @returns {void}
 */
function generateTrafficTrendChart(data: any[], canvasId: string): void {
  if (data.length === 0) return;

  // Group data by date and count transactions
  const dailyTraffic = data.reduce((acc, d) => {
    const date = d['Sales Date In'].toISOString().split('T')[0];
    if (!acc[date]) acc[date] = 0;
    acc[date] += 1; // Count each record as a transaction
    return acc;
  }, {});

  const sortedDates = Object.keys(dailyTraffic).toSorted();
  const chartData = {
    labels: sortedDates.map(date => new Date(date).toLocaleDateString('id-ID')),
    datasets: [{
      label: 'Daily Traffic',
      data: sortedDates.map(date => dailyTraffic[date]),
      borderColor: '#4BC0C0',
      backgroundColor: 'rgba(75, 192, 192, 0.1)',
      fill: true,
      tension: 0.4
    }]
  };

  createChart(canvasId, 'line', chartData, {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      y: {
        beginAtZero: true,
        ticks: {
          stepSize: 1
        }
      }
    }
  });
}

/**
 * Generate charts specifically for landscape PDF export.
 *
 * @description
 * Creates chart instances for the landscape PDF template using the provided sales data.
 * Charts are generated with specific canvas IDs that match the landscape template.
 *
 * @param data - Array of sales data for chart generation
 * @returns {void}
 */
function generateLandscapeCharts(data: any[]): void {
  if (data.length === 0) return;

  // Generate charts for landscape PDF template
  generateBranchContributionChart(data, 'kontribusi-cabang-chart-landscape-pdf');
  generateDailyRevenueChart(data, 'omzet-harian-chart-landscape-pdf');
  generateChannelPerformanceChart(data, 'sales-channel-chart-landscape-pdf');
  generateTrafficTrendChart(data, 'traffic-trend-chart-landscape-pdf');
}

/**
 * Generate landscape PDF report using html2canvas and jsPDF.
 *
 * @description
 * Creates a landscape-oriented PDF report by capturing pages from the landscape template.
 * Uses A4 landscape format and processes each page sequentially with progress tracking.
 *
 * @param progressCallback - Function to track export progress
 * @returns Promise that resolves when PDF generation is complete
 */
async function generateLandscapePdfReport(progressCallback: (current: number, total: number) => void): Promise<void> {
  // Get dates for the current period
  const currentStartDate = new Date(document.getElementById('date-start').value)
  const currentEndDate = new Date(document.getElementById('date-end').value)
  currentEndDate.setHours(23, 59, 59, 999)

  // Get dates for the comparison period
  const lastPeriodStartDate = new Date(document.getElementById('last-period-start').value)
  const lastPeriodEndDate = new Date(document.getElementById('last-period-end').value)
  lastPeriodEndDate.setHours(23, 59, 59, 999)

  // Filter data for both periods
  const currentData = $store.getAllSalesData().filter((d) => d['Sales Date In'] >= currentStartDate && d['Sales Date In'] <= currentEndDate)
  const lastPeriodData = $store.getAllSalesData().filter((d) => d['Sales Date In'] >= lastPeriodStartDate && d['Sales Date In'] <= lastPeriodEndDate)

  await generateGeneralPdfInsights(currentData, lastPeriodData)

  const { jsPDF } = window.jspdf
  const pdf = new jsPDF({
    orientation: 'landscape', // Landscape orientation
    unit: 'px',
    format: [1920, 1080],
  })

  const pdfContainer = document.getElementById('pdf-landscape')
  pdfContainer.classList.remove('hidden')

  const pages = document.querySelectorAll('#pdf-landscape .page-landscape')
  const totalPages = pages.length
  let addPage = false

  // Helper function to add a small delay
  const delay = (ms) => new Promise((res) => setTimeout(res, ms))

  for (let i = 0; i < totalPages; i++) {
    const element = pages[i]

    // Update the progress bar
    if (progressCallback) {
      progressCallback(i, totalPages)
    }

    // Scroll the element into view and wait a moment for rendering
    element.scrollIntoView()
    await delay(100) // Wait 100ms for fonts and animations

    const canvas = await html2canvas(element, {
      scale: 2, // Improves quality
      useCORS: true, // Essential for loading any external images that aren't base64
      allowTaint: true, // Can sometimes help with cross-origin issues
      logging: false, // Cleans up the console during export
    })

    if (addPage) {
      pdf.addPage()
    } else {
      addPage = true
    }

    const imgData = canvas.toDataURL('image/png')
    const pageWidth = pdf.internal.pageSize.getWidth()
    const pageHeight = pdf.internal.pageSize.getHeight()
    const imgWidth = pageWidth
    const imgHeight = (canvas.height * imgWidth) / canvas.width

    // Add the image
    pdf.addImage(imgData, 'PNG', 0, 0, imgWidth, imgHeight, undefined, 'FAST')
  }

  // Final progress update
  if (progressCallback) {
    progressCallback(totalPages, totalPages)
  }

  pdf.save('Finalytics-Report-Landscape.pdf')
  pdfContainer.classList.add('hidden')
}

// In main.ts, add this entire new function.

/**
 * Generate customer spending behavior insights and transaction analytics.
 *
 * @description
 * Analyzes transaction data to calculate key spending metrics including highest single
 * transaction, average spending range (25th-75th percentiles), and busiest operational
 * periods by day and hour. Provides actionable business insights for upselling strategies
 * and operational optimization based on customer behavior patterns.
 *
 * @param data - Array of processed sales data rows with Revenue, Bill Number, and Sales Date In.
 * @returns This function does not return a value; it updates the global store with spending insights.
 *
 * @example
 * // Generate customer spending insights
 * const salesData = [
 *   { Revenue: 250000, "Bill Number": "001", "Sales Date In": new Date("2024-01-15 14:30") },
 *   { Revenue: 180000, "Bill Number": "002", "Sales Date In": new Date("2024-01-16 19:45") }
 * ];
 * generateCustomerSpendingInsights(salesData);
 * // Updates store with spending ranges, busiest times, and upselling recommendations
 */
function generateCustomerSpendingInsights(data: any[]): void {
  if (data.length === 0) return;

  // Group by Bill Number to get each transaction's total value
  const billTotals = Object.values(data.reduce((acc, d) => {
    const bill = d['Bill Number'];
    if (!acc[bill]) acc[bill] = 0;
    acc[bill] += d.Revenue;
    return acc;
  }, {}));

  if (billTotals.length === 0) return;

  // 1. Calculate Highest Single Transaction
  const highestSingleTransaction = Math.max(...billTotals);

  // 2. Calculate Average Spending Range (using 25th and 75th percentiles)
  billTotals.toSorted((a, b) => a - b);
  const lowerQuartileIndex = Math.floor(billTotals.length * 0.25);
  const upperQuartileIndex = Math.floor(billTotals.length * 0.75);
  const avgSpendLower = billTotals[lowerQuartileIndex] || 0;
  const avgSpendUpper = billTotals[upperQuartileIndex] || 0;

  // 3. Calculate Busiest Day and Time based on Total Check
  const billsByDay = {};
  const billsByHour = {};

  data.forEach(d => {
    const day = d['Sales Date In'].getDay();
    const hour = d['Sales Date In'].getHours();
    const bill = d['Bill Number'];

    if (!billsByDay[day]) billsByDay[day] = new Set();
    billsByDay[day].add(bill);

    if (!billsByHour[hour]) billsByHour[hour] = new Set();
    billsByHour[hour].add(bill);
  });

  const dayCounts = Array(7).fill(0);
  Object.keys(billsByDay).forEach(day => dayCounts[day] = billsByDay[day].size);
  const busiestDayIndex = dayCounts.indexOf(Math.max(...dayCounts));
  const daysOfWeek = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  const busiestDay = (busiestDayIndex === 6 || busiestDayIndex === 0 || busiestDayIndex === 5) ? 'Weekend' : daysOfWeek[busiestDayIndex];

  const hourCounts = Array(24).fill(0);
  Object.keys(billsByHour).forEach(hour => hourCounts[hour] = billsByHour[hour].size);
  const busiestHour = hourCounts.indexOf(Math.max(...hourCounts));
  const busiestTimeRange = `${String(busiestHour).padStart(2, '0')}.00 - ${String(busiestHour + 2).padStart(2, '0')}.00`;

  // 4. Update the central store with all the calculated values
  $store.setStorePartial({
    avgSpendLower: formatNumber(avgSpendLower),
    avgSpendUpper: formatNumber(avgSpendUpper),
    highestSingleTransaction: formatNumber(highestSingleTransaction),
    busiestTimeRange: busiestTimeRange,
    busiestDay: busiestDay,
    upsellingTips: 'Rancang program upselling dengan bundling produk atau promosi untuk meningkatkan nilai belanja per transaksi.',
  });
}
// Add this new function to main.ts

/**
 * Generate weekend sales performance insights with revenue optimization calculations.
 *
 * @description
 * Analyzes sales data to identify weekend (Saturday and Sunday) sales patterns
 * and calculates potential revenue increase from APC improvements. Computes weekend
 * revenue percentage, potential bonus revenue based on static APC increase assumptions,
 * and updates global store with formatted metrics and motivational messaging for
 * weekend performance optimization strategies.
 *
 * @param data - Array of processed sales data rows with Revenue, Bill Number, and Sales Date In.
 * @returns This function does not return a value; it updates global store with weekend sales insights.
 *
 * @example
 * // Generate weekend sales insights with optimization potential
 * const salesData = [
 *   { Revenue: 150000, "Bill Number": "B001", "Sales Date In": new Date("2024-01-13") }, // Saturday
 *   { Revenue: 200000, "Bill Number": "B002", "Sales Date In": new Date("2024-01-14") }, // Sunday
 *   { Revenue: 100000, "Bill Number": "B003", "Sales Date In": new Date("2024-01-15") }  // Monday
 * ];
 * generateWeekendSalesInsights(salesData);
 * // Updates store with weekend percentage, APC increase potential, and motivational insights
 */
function generateWeekendSalesInsights(data: any[]): void {
  if (data.length === 0) return;

  let totalRevenue = 0;
  let weekendRevenue = 0;
  const weekendBills = new Set();

  data.forEach(d => {
    const day = d['Sales Date In'].getDay(); // Sunday = 0, Saturday = 6
    totalRevenue += d.Revenue;
    if (day === 0 || day === 6) {
      weekendRevenue += d.Revenue;
      weekendBills.add(d['Bill Number']);
    }
  });

  const weekendSalesPercentage = totalRevenue > 0 ? (weekendRevenue / totalRevenue) * 100 : 0;
  const apcIncrease = 5000; // This is a static value from the design for the narrative
  const potentialBonusOmzet = apcIncrease * weekendBills.size;

  $store.setStorePartial({
    weekendSalesPercentage: formatNumber(weekendSalesPercentage, 0),
    mainSalesInsight: 'Sales kamu terjadi di hari Sabtu dan Minggu',
    apcIncrease: formatNumber(apcIncrease),
    // Format the bonus omzet to millions ('juta')
    potentialBonusOmzet: formatNumber(potentialBonusOmzet / 1000000, 0),
    motivationalMessage: 'Cieee, ada yang bisa buka cabang baru tiap bulan nih sekarang!',
  });
}

/**
 * Generate multi-line chart showing hourly trends for each day of the week.
 *
 * @description
 * Creates a comprehensive hourly trend analysis with separate lines for each day
 * of the week (7 lines total). Each line shows 24 hourly data points for the specified
 * metric (Total Check, APC, or Sales). Useful for identifying daily patterns and
 * peak hours per day. Stores Sales data for AI analysis when metric is 'Sales'.
 *
 * @param data - Array of processed sales data rows with Revenue, Bill Number, and Sales Date In.
 * @param canvasId - HTML canvas element ID where the chart will be rendered.
 * @param metric - Metric to display: 'TC' (Total Check), 'APC' (Average Per Customer), or 'Sales' (Revenue).
 * @returns This function does not return a value; it creates a Chart.js multi-line chart.
 *
 * @example
 * // Generate hourly sales trends for each day of the week
 * const salesData = [
 *   { Revenue: 200000, "Bill Number": "001", "Sales Date In": new Date("2024-01-01 14:30") }, // Monday 14:00
 *   { Revenue: 150000, "Bill Number": "002", "Sales Date In": new Date("2024-01-07 19:45") }  // Sunday 19:00
 * ];
 * generateDailyHourTrendChart(salesData, 'my-canvas', 'Sales');
 * // Creates 7-line chart showing hourly revenue patterns for each day
 */
function generateDailyHourTrendChart(data: any[], canvasId: string, metric: string): void {
  if (data.length === 0) return;

  // Initialize data structure for 7 days, each with 24 hours
  const dailyData = Array(7).fill(0).map(() =>
    Array(24).fill(0).map(() => ({ revenue: 0, bills: new Set() }))
  );

  data.forEach(d => {
    const day = d['Sales Date In'].getDay(); // Sunday=0, Monday=1, etc.
    const hour = d['Sales Date In'].getHours();
    dailyData[day][hour].revenue += d.Revenue;
    dailyData[day][hour].bills.add(d['Bill Number']);
  });

  const labels = Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, '0'));
  const dayLabels = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  const colors = ['#EF4444', '#F97316', '#F59E0B', '#84CC16', '#22C55E', '#14B8A6', '#3B82F6'];

  const datasets = dayLabels.map((label, dayIndex) => {
    const hourlyValues = dailyData[dayIndex].map(hourData => {
      if (metric === 'TC') {
        return hourData.bills.size;
      }
      if (metric === 'APC') {
        return hourData.bills.size > 0 ? hourData.revenue / hourData.bills.size : 0;
      }
      // This is the corrected logic for 'Sales'
      if (metric === 'Sales') {
        return hourData.revenue;
      }
      return 0;
    });

    return {
      label: label,
      data: hourlyValues,
      borderColor: colors[dayIndex % colors.length],
      backgroundColor: colors[dayIndex % colors.length],
      tension: 0.2,
      fill: false,
    };
  });

  // Store data for AI analysis if the metric is 'Sales'
  if (metric === 'Sales') {
      $store.setChartDataForAIProperty('salesTrendHourlyDaily', datasets.map(ds => ({ [ds.label]: ds.data })));
  }

  createChart(canvasId, 'line', { labels, datasets });
}

/**
 * Generate hourly sales trend chart by day of week for PDF export.
 *
 * @description
 * Creates a multi-line chart showing hourly sales patterns for each day of the
 * week (Sunday-Saturday) with 24 hourly data points per day. Each day is represented
 * by a different colored line, allowing comparison of hourly sales trends across
 * different days. Optimized for PDF report inclusion with clear color coding
 * and proper formatting for print output.
 *
 * @param data - Array of processed sales data rows with Revenue, Bill Number, and Sales Date In.
 * @returns This function does not return a value; it creates a Chart.js multi-line chart.
 *
 * @example
 * // Generate hourly sales trends by day for PDF
 * const salesData = [
 *   { Revenue: 500000, "Bill Number": "B001", "Sales Date In": new Date("2024-01-15T14:30:00") },
 *   { Revenue: 300000, "Bill Number": "B002", "Sales Date In": new Date("2024-01-16T19:45:00") }
 * ];
 * generatePdfSalesTrendByHourChart(salesData);
 * // Creates multi-line chart showing hourly patterns for each weekday
 */
function generatePdfSalesTrendByHourChart(data: any[]): void {
  const canvasId = 'sales-trend-hourly-daily-chart-pdf';
  const metric = 'Sales';

  if (data.length === 0) return;

  const dailyData = Array(7).fill(0).map(() =>
    Array(24).fill(0).map(() => ({ revenue: 0, bills: new Set() }))
  );

  data.forEach(d => {
    const day = d['Sales Date In'].getDay();
    const hour = d['Sales Date In'].getHours();
    dailyData[day][hour].revenue += d.Revenue;
    dailyData[day][hour].bills.add(d['Bill Number']);
  });

  const labels = Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, '0'));
  const dayLabels = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  const colors = ['#EF4444', '#F97316', '#F59E0B', '#84CC16', '#22C55E', '#14B8A6', '#3B82F6'];

  const datasets = dayLabels.map((label, dayIndex) => {
    const hourlyValues = dailyData[dayIndex].map(hourData => {
        // This function only needs to handle Sales
        return hourData.revenue;
    });

    return {
      label: label,
      data: hourlyValues,
      borderColor: colors[dayIndex % colors.length],
      backgroundColor: colors[dayIndex % colors.length],
      tension: 0.2,
      fill: false,
    };
  });

  createChart(canvasId, 'line', { labels, datasets });
}

/**
 * Generate business insights for hourly sales analysis and peak time identification.
 *
 * @description
 * Analyzes sales data to identify peak hours by counting transactions per hour
 * and generates business insights for the hourly analysis page. Calculates the
 * busiest time period and provides actionable recommendations for capacity
 * optimization, service improvements, and upselling opportunities during peak hours.
 *
 * @param data - Array of processed sales data rows with Sales Date In timestamps.
 * @returns This function does not return a value; it updates the global store with hourly insights.
 *
 * @example
 * // Generate hourly business insights
 * const salesData = [
 *   { "Sales Date In": new Date("2024-01-15T14:30:00") },
 *   { "Sales Date In": new Date("2024-01-15T19:45:00") }
 * ];
 * generateHourlyInsights(salesData);
 * // Updates store with peak hour insights and business recommendations
 */
function generateHourlyInsights(data: any[]): void {
  if (data.length === 0) return;

  const hourlyTcs = Array(24).fill(0);
  data.forEach(d => {
      hourlyTcs[d['Sales Date In'].getHours()]++;
  });
  const peakHour = hourlyTcs.indexOf(Math.max(...hourlyTcs));
  const peakTimeRange = `${String(peakHour).padStart(2, '0')}.00 - ${String(peakHour + 2).padStart(2, '0')}.00`;

  $store.setStorePartial({
    hourlyPageTitle: 'Maksimalkan jam sibuk dan merancang program untuk waktu sepi adalah kunci kesuksesan kamu.',
    tcInsightText: `Tren TC menunjukkan bahwa jam ${peakTimeRange} adalah waktu paling ramai.`,
    tcSuggestionText: 'Anda dapat memaksimalkan profit dengan misalnya menambah kapasitas atau meningkatkan service time.',
    apcInsightText: 'APC tertinggi terjadi pada jam makan malam, ini adalah kesempatan bagus untuk upselling paket makan malam atau menu spesial.'
  });
}

// Add this new function to main.ts

/**
 * Generate hourly sales insights with peak hour analysis and revenue optimization.
 *
 * @description
 * Analyzes sales data to identify peak sales hours (11:00-13:00) and calculates
 * revenue concentration during these periods. Computes potential bonus revenue
 * from APC increases during peak hours and provides actionable business insights
 * for capacity optimization, service improvements, and revenue maximization strategies.
 *
 * @param data - Array of processed sales data rows with Sales Date In and Revenue.
 * @returns This function does not return a value; it updates the global store with hourly insights.
 *
 * @example
 * // Generate hourly sales insights and optimization recommendations
 * const salesData = [
 *   { "Sales Date In": new Date("2024-01-15T12:30:00"), Revenue: 50000, "Bill Number": "B001" },
 *   { "Sales Date In": new Date("2024-01-15T19:45:00"), Revenue: 75000, "Bill Number": "B002" }
 * ];
 * generateHourlySalesInsights(salesData);
 * // Updates store with peak hour analysis and revenue optimization insights
 */
function generateHourlySalesInsights(data: any[]): void {
  if (data.length === 0) return;

  let totalRevenue = 0;
  let peakRangeRevenue = 0;
  const peakRangeBills = new Set();
  const peakStartHour = 11;
  const peakEndHour = 13;

  data.forEach(d => {
    const hour = d['Sales Date In'].getHours();
    totalRevenue += d.Revenue;
    if (hour >= peakStartHour && hour < peakEndHour) {
      peakRangeRevenue += d.Revenue;
      peakRangeBills.add(d['Bill Number']);
    }
  });

  const mainHourPercentage = totalRevenue > 0 ? (peakRangeRevenue / totalRevenue) * 100 : 0;
  const apcIncreaseAmount = 5000;
  const potentialBonusAmount = apcIncreaseAmount * peakRangeBills.size;

  $store.setStorePartial({
    peakHoursInsight: 'Puncak penjualan konsisten terjadi pada jam 10.00-14.00 dan jam 17.00 - 19.00.',
    mainHourPercentage: formatNumber(mainHourPercentage, 0),
    mainHourInsight: `Sales kamu terjadi di jam ${peakStartHour}.00 - ${peakEndHour}.00.`,
    apcIncreaseAmount: formatNumber(apcIncreaseAmount),
    potentialBonusAmount: formatNumber(potentialBonusAmount / 1000000, 0),
    proTip1: 'Meningkatkan service dan memaksimalkan layanan secara maksimum.',
    proTip2: 'Meningkatkan kapasitas bisnis dengan menggunakan sistem antrian atau pre-order.',
  });
}

// In main.ts, add these two new functions

/**
 * Generate 100% stacked area chart showing sales channel contribution over time.
 *
 * @description
 * Creates a 100% stacked area chart visualizing how each sales channel (Visit Purpose)
 * contributes to total sales or transaction count over different time periods.
 * Converts raw values to percentages so each time period sums to 100%, making
 * it easy to compare relative channel performance and identify shifts in
 * customer behavior patterns across hours, days, or months.
 *
 * @param data - Array of processed sales data rows with Revenue, Visit Purpose, Bill Number, and Sales Date In.
 * @param canvasId - ID of the canvas element where the chart will be rendered.
 * @param groupBy - Time grouping method: 'hour' (0-23), 'day' (0-6 for Sun-Sat), or 'month' (YYYY-MM).
 * @param metric - Metric to visualize: 'Sales' for revenue or 'TC' for transaction count.
 * @returns This function does not return a value; it creates a Chart.js 100% stacked area chart.
 *
 * @example
 * // Generate hourly channel contribution chart
 * const salesData = [
 *   { Revenue: 500000, "Visit Purpose": "Dine-In", "Bill Number": "B001", "Sales Date In": new Date("2024-01-15T14:30:00") },
 *   { Revenue: 300000, "Visit Purpose": "GoFood", "Bill Number": "B002", "Sales Date In": new Date("2024-01-15T19:45:00") }
 * ];
 * generateStackedChannelTrendChart(salesData, 'channel-trend-canvas', 'hour', 'Sales');
 * // Creates 100% stacked chart showing hourly channel revenue contribution
 */
function generateStackedChannelTrendChart(data: any[], canvasId: string, groupBy: string, metric: string): void {
  if (data.length === 0) return;

  const getGroupKey = (d) => {
    if (groupBy === 'hour') return d['Sales Date In'].getHours();
    if (groupBy === 'day') return d['Sales Date In'].getDay();
    if (groupBy === 'month') return d['Sales Date In'].toISOString().slice(0, 7);
    return null;
  };

  const aggregated = data.reduce((acc, d) => {
    const key = getGroupKey(d);
    const channel = d['Visit Purpose'] || 'Unknown';
    if (!acc[key]) acc[key] = {};
    if (!acc[key][channel]) acc[key][channel] = { revenue: 0, bills: new Set() };
    acc[key][channel].revenue += d.Revenue;
    acc[key][channel].bills.add(d['Bill Number']);
    return acc;
  }, {});

  const channels = [...new Set(data.map(d => d['Visit Purpose'] || 'Unknown'))];
  const labels = [...new Set(data.map(getGroupKey))].toSorted();
  const percentageData = {};
  channels.forEach(ch => percentageData[ch] = []);

  labels.forEach(label => {
    const totalForLabel = channels.reduce((sum, ch) => {
        const value = metric === 'Sales' ? (aggregated[label]?.[ch]?.revenue || 0) : (aggregated[label]?.[ch]?.bills.size || 0);
        return sum + value;
    }, 0);

    channels.forEach(channel => {
      const channelValue = metric === 'Sales' ? (aggregated[label]?.[channel]?.revenue || 0) : (aggregated[label]?.[channel]?.bills.size || 0);
      const percentage = totalForLabel > 0 ? (channelValue / totalForLabel) * 100 : 0;
      percentageData[channel].push(percentage);
    });
  });

  const chartLabels = {
      day: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
      hour: Array.from({length: 24}, (_, i) => i.toString().padStart(2, '0')),
      month: labels,
  };

  const datasets = channels.map(channel => ({
    label: channel,
    data: percentageData[channel],
    fill: true,
    tension: 0.2,
  }));

  createChart(canvasId, 'line', { labels: chartLabels[groupBy], datasets }, {
    plugins: { tooltip: { callbacks: { label: (context) => `${context.dataset.label}: ${context.raw.toFixed(1)}%` }}},
    scales: { y: { stacked: true, max: 100, ticks: { callback: (value) => `${value}%` }}}
  });
}

// In main.ts, ADD these two new functions

/**
 * Generate month-over-month Dine-In Total Check comparison bar chart.
 *
 * @description
 * Analyzes Dine-In transaction data to calculate Total Check (unique bill count)
 * for current and previous month, then creates a comparative bar chart showing
 * the month-over-month change. Updates global store with percentage increase
 * for business intelligence reporting and trend analysis.
 *
 * @param data - Array of processed sales data rows with Visit Purpose, Bill Number, and Sales Date In.
 * @returns This function does not return a value; it creates a Chart.js bar chart and updates store.
 *
 * @example
 * // Generate monthly Dine-In TC comparison
 * const salesData = [
 *   { "Visit Purpose": "Dine In", "Bill Number": "001", "Sales Date In": new Date("2024-01-15") },
 *   { "Visit Purpose": "Dine In", "Bill Number": "002", "Sales Date In": new Date("2024-02-15") }
 * ];
 * generateDineInMonthlyIncreaseChart(salesData);
 * // Creates bar chart comparing current vs previous month Dine-In TC
 */
function generateDineInMonthlyIncreaseChart(data: any[]): void {
    const endDate = new Date(document.getElementById('date-end').value);
    const currentMonth = endDate.getMonth();
    const currentYear = endDate.getFullYear();
    const prevMonth = currentMonth === 0 ? 11 : currentMonth - 1;
    const prevMonthYear = currentMonth === 0 ? currentYear - 1 : currentYear;

    const getCurrentMonthTc = (d) => d['Sales Date In'].getMonth() === currentMonth && d['Sales Date In'].getFullYear() === currentYear;
    const getPrevMonthTc = (d) => d['Sales Date In'].getMonth() === prevMonth && d['Sales Date In'].getFullYear() === prevMonthYear;

    const dineInData = data.filter(d => d['Visit Purpose'] === 'Dine In');
    const currentMonthBills = new Set(dineInData.filter(getCurrentMonthTc).map(d => d['Bill Number']));
    const prevMonthBills = new Set(dineInData.filter(getPrevMonthTc).map(d => d['Bill Number']));

    const currentMonthTc = currentMonthBills.size;
    const prevMonthTc = prevMonthBills.size;

    const percentageIncrease = prevMonthTc > 0 ? ((currentMonthTc - prevMonthTc) / prevMonthTc) * 100 : 0;

    $store.setStorePartial({ monthlyIncreasePercentage: formatNumber(percentageIncrease, 0) });

    const monthNames = ["November", "December"];

    createChart('monthly-increase-chart-pdf', 'bar', {
        labels: monthNames,
        datasets: [{
            label: 'Dine In TC',
            data: [prevMonthTc, currentMonthTc],
            backgroundColor: ['#9CA3AF', '#4F46E5']
        }]
    });
}

/**
 * Generate predefined Total Check (TC) insights for sales channel analysis.
 *
 * @description
 * Populates the global store with static business insights about Total Check trends
 * across different sales channels and time periods. Provides predefined insights
 * about monthly TC increases, hourly patterns, weekly trends, and actionable
 * business suggestions for optimizing channel performance and capacity planning.
 *
 * @param data - Array of processed sales data rows (currently unused but maintained for consistency).
 * @returns This function does not return a value; it updates the global store with TC insights.
 *
 * @example
 * // Generate TC insights for channel analysis
 * const salesData = []; // Data not currently used
 * generateChannelTcInsights(salesData);
 * // Updates store with monthlyIncreaseInsight, hourlyInsight, hourlySuggestion, etc.
 */
function generateChannelTcInsights(data: any[]): void {
    if (data.length === 0) return;
    $store.setStorePartial({
        monthlyIncreaseInsight: 'Terjadi peningkatan TC dine in dibandingkan dengan bulan lalu.',
        hourlyInsight: 'Konsumen pada jam setelah makan siang dikuasai oleh konsumen dari GoFood dan GrabFood.',
        hourlySuggestion: 'Anda dapat memaksimalkan penjualan dengan membuat promosi pada jam tersebut.',
        weeklyInsight: 'Terjadi lonjakan konsumen Dine in pada hari Jumat, Sabtu, dan Minggu.',
        weeklySuggestion: 'Pastikan kapasitas restoran anda dapat menampung lonjakan konsumen.',
        monthlyInsight: 'Mayoritas konsumen anda memilih untuk makan secara dine in pada akhir bulan.',
    });
}

/**
 * Generate predefined sales channel insights for business intelligence reporting.
 *
 * @description
 * Populates the global store with static business insights about sales channel
 * performance and customer behavior patterns. Sets page title and predefined
 * insights about channel preferences across different time periods (hourly,
 * monthly) and dining patterns to provide contextual business intelligence.
 *
 * @param data - Array of processed sales data rows (currently unused but maintained for consistency).
 * @returns This function does not return a value; it updates the global store with channel insights.
 *
 * @example
 * // Generate channel insights for the analysis page
 * const salesData = []; // Data not currently used
 * generateChannelInsights(salesData);
 * // Updates store with pageTitle, hourlyChannelInsight, mainChannelInsight, monthlyChannelInsight
 */
function generateChannelInsights(data: any[]): void {
    if (data.length === 0) return;
    $store.setStorePartial({
        pageTitle: 'Kenali tren penjualan berbagai sales channel dari waktu ke waktu',
        hourlyChannelInsight: 'Sales channel yang paling diminati untuk sarapan adalah Dine-in, sedangkan untuk makan siang dan malam, GrabFood lebih diminati.',
        mainChannelInsight: 'Dine-in masih merupakan sales channel utama pada restoran anda.',
        monthlyChannelInsight: 'Pada awal bulan, konsumen anda cenderung untuk melakukan pemesanan online.',
    });
}

/**
 * Generate static insights for GoFood/GrabFood/Dine-In APC analysis page.
 *
 * @description
 * Populates global store with predefined business insights about Average Per
 * Customer (APC) trends across different sales channels and time periods.
 * Provides static insights for hourly, weekly, and monthly APC patterns to
 * help understand customer spending behavior across delivery and dine-in channels.
 *
 * @param data - Array of sales data rows (parameter unused but kept for API consistency).
 * @returns This function does not return a value; it updates the global store with insights.
 *
 * @example
 * // Generate APC insights for sales channel analysis
 * const salesData = [{ Revenue: 50000, "Visit Purpose": "GoFood" }];
 * generateGoFoodInsights(salesData);
 * // Updates store with predefined insights about GoFood/GrabFood/Dine-In patterns
 */
function generateGoFoodInsights(data: any[]): void {
    if (data.length === 0) return;
    $store.setStorePartial({
        mainGoFoodInsight: 'Rata-rata ada 3 – 5 pesanan GoFood setiap jamnya pada restoran anda.',
        hourlyAPCInsightDinner: 'Rata-rata nilai pembelian meningkat pesat pada jam makan malam baik pada GoFood, dan GrabFood.',
        hourlyAPCInsightDineIn: 'Sedangkan pada Dine in, tidak terjadi perubahan yang signifikan dari jam ke jam.',
        weeklyAPCInsight: 'Rata-rata nilai pembelian pada weekend meningkat pesat baik pada GoFood, GrabFood, dan Dine In, namun lonjakan terbesar terjadi pada pembelian Dine In.',
        monthlyAPCInsight: 'Pada akhir bulan, rata-rata nilai pembelian menurun di semua sales channel, namun yang paling terdampak adalah GoFood.',
    });
}

/**
 * Generate month-over-month sales channel comparison insights and rankings.
 *
 * @description
 * Analyzes sales data to compare current month vs previous month performance across
 * all sales channels (Visit Purpose). Calculates Total Check (TC), Average Per Customer (APC),
 * and growth metrics for each channel. Updates global store with top-performing channels
 * in three categories: highest TC growth, highest current sales, and highest nominal
 * sales increase for business intelligence reporting.
 *
 * @param data - Array of processed sales data rows with Visit Purpose, Bill Number, Sales Date In, and Revenue.
 * @returns This function does not return a value; it updates the global store with channel insights.
 *
 * @example
 * // Generate channel comparison insights
 * const salesData = [
 *   { "Visit Purpose": "Dine In", "Bill Number": "001", "Sales Date In": new Date("2024-01-15"), Revenue: 200000 },
 *   { "Visit Purpose": "Take Away", "Bill Number": "002", "Sales Date In": new Date("2024-02-15"), Revenue: 150000 }
 * ];
 * generateChannelComparisonInsights(salesData);
 * // Updates store with growthChan*, topSalesChan*, and monthlyIncreaseChan* metrics
 */
function generateChannelComparisonInsights(data: any[]): void {
    if (data.length === 0) return;

    const endDate = new Date(document.getElementById('date-end').value);
    const currentMonth = endDate.getMonth();
    const currentYear = endDate.getFullYear();
    const prevMonth = currentMonth === 0 ? 11 : currentMonth - 1;
    const prevMonthYear = currentMonth === 0 ? currentYear - 1 : currentYear;

    const getStatsByChannel = (dataset) => {
        return dataset.reduce((acc, d) => {
            const channel = d['Visit Purpose'] || 'Unknown';
            if (!acc[channel]) acc[channel] = { revenue: 0, bills: new Set() };
            acc[channel].revenue += d.Revenue;
            acc[channel].bills.add(d['Bill Number']);
            return acc;
        }, {});
    };

    const currentMonthData = data.filter(d => d['Sales Date In'].getMonth() === currentMonth && d['Sales Date In'].getFullYear() === currentYear);
    const prevMonthData = data.filter(d => d['Sales Date In'].getMonth() === prevMonth && d['Sales Date In'].getFullYear() === prevMonthYear);

    const currentStats = getStatsByChannel(currentMonthData);
    const prevStats = getStatsByChannel(prevMonthData);

    const allChannels = [...new Set(Object.keys(currentStats).concat(Object.keys(prevStats)))];

    const comparison = allChannels.map(channel => {
        const cStat = currentStats[channel] || { revenue: 0, bills: new Set() };
        const pStat = prevStats[channel] || { revenue: 0, bills: new Set() };
        const cTC = cStat.bills.size;
        const pTC = pStat.bills.size;
        const cAPC = cTC > 0 ? cStat.revenue / cTC : 0;
        const pAPC = pTC > 0 ? pStat.revenue / pTC : 0;

        const tcGrowth = pTC > 0 ? ((cTC - pTC) / pTC) * 100 : (cTC > 0 ? 100 : 0);
        const salesGrowth = pStat.revenue > 0 ? ((cStat.revenue - pStat.revenue) / pStat.revenue) * 100 : (cStat.revenue > 0 ? 100 : 0);

        return {
            name: channel,
            currentTC: cTC,
            currentAPC: cAPC,
            currentSales: cStat.revenue,
            tcGrowth,
            salesGrowth,
            salesIncreaseNominal: cStat.revenue - pStat.revenue
        };
    });

    // 1. Top Growth Channels
    const topGrowth = [...comparison].toSorted((a, b) => b.tcGrowth - a.tcGrowth).slice(0, 2);
    $store.setStorePartial({
        growthChan1Name: topGrowth[0]?.name || '',
        growthChan1TC: formatNumber(topGrowth[0]?.currentTC),
        growthChan1APC: formatNumber(topGrowth[0]?.currentAPC),
        growthChan1Percent: formatNumber(topGrowth[0]?.tcGrowth, 0),
        growthChan2Name: topGrowth[1]?.name || '',
        growthChan2TC: formatNumber(topGrowth[1]?.currentTC),
        growthChan2APC: formatNumber(topGrowth[1]?.currentAPC),
        growthChan2Percent: formatNumber(topGrowth[1]?.tcGrowth, 0),
    });

    // 2. Top Sales Channels
    const topSales = [...comparison].toSorted((a, b) => b.currentSales - a.currentSales).slice(0, 2);
    $store.setStorePartial({
        topSalesChan1Name: topSales[0]?.name || '',
        topSalesChan1Nominal: formatNumber(topSales[0]?.currentSales),
        topSalesChan2Name: topSales[1]?.name || '',
        topSalesChan2Nominal: formatNumber(topSales[1]?.currentSales),
    });

    // 3. Top Monthly Increase Channels
    const topIncrease = [...comparison].toSorted((a, b) => b.salesIncreaseNominal - a.salesIncreaseNominal).slice(0, 2);
    $store.setStorePartial({
        monthlyIncreaseChan1Name: topIncrease[0]?.name || '',
        monthlyIncreaseChan1Percent: formatNumber(topIncrease[0]?.salesGrowth, 0),
        monthlyIncreaseChan1Nominal: formatNumber(topIncrease[0]?.salesIncreaseNominal),
        monthlyIncreaseChan2Name: topIncrease[1]?.name || '',
        monthlyIncreaseChan2Percent: formatNumber(topIncrease[1]?.salesGrowth, 0),
        monthlyIncreaseChan2Nominal: formatNumber(topIncrease[1]?.salesIncreaseNominal),
    });
}

// In main.ts, add this new function

/**
 * Generate comprehensive food category analysis insights and rankings.
 *
 * @description
 * Analyzes MAKANAN (food) category sales data to generate multiple insights:
 * top 3 foods by quantity (podium), top 5 revenue contributors with percentages,
 * superhero item (top performer), and timeline heroes (top foods per time slot).
 * Updates global store with formatted insights for business intelligence reporting
 * and menu optimization recommendations.
 *
 * @param data - Array of processed sales data rows with Menu Category, Menu, Quantity, Revenue, and Sales Date In.
 * @returns This function does not return a value; it updates the global store with food insights.
 *
 * @example
 * // Generate food analysis insights
 * const salesData = [
 *   { "Menu Category": "MAKANAN", Menu: "Nasi Goreng", Quantity: 25, Revenue: 750000, "Sales Date In": new Date("2024-01-15 12:30") },
 *   { "Menu Category": "MAKANAN", Menu: "Ayam Bakar", Quantity: 20, Revenue: 800000, "Sales Date In": new Date("2024-01-15 19:45") }
 * ];
 * generateFoodAnalysisInsights(salesData);
 * // Updates store with podium rankings, top 5 contributors, superhero, and timeline heroes
 */
function generateFoodAnalysisInsights(data: any[]): void {
    if (data.length === 0) return;

    const totalOverallOmzet = data.reduce((sum, d) => sum + d.Revenue, 0);
    const foodData = data.filter(d => d['Item Group'] === 'MAKANAN');
    if (foodData.length === 0) return;

    const totalFoodRevenue = foodData.reduce((sum, d) => sum + d.Revenue, 0);

    const foodStats = foodData.reduce((acc, d) => {
        const menu = d.Menu || 'Unknown';
        if (!acc[menu]) acc[menu] = { revenue: 0, quantity: 0 };
        acc[menu].revenue += d.Revenue;
        acc[menu].quantity += d.Quantity;
        return acc;
    }, {});

    const foodArray = Object.entries(foodStats).map(([name, stats]) => ({ name, ...stats }));

    // 1. Podium (by quantity)
    const topByQuantity = [...foodArray].toSorted((a, b) => b.quantity - a.quantity).slice(0, 3);
    const podiumNames = topByQuantity.map(item => item.name);

    // 2. Top 5 Revenue Contributor
    const topByRevenue = [...foodArray].toSorted((a, b) => b.revenue - a.revenue).slice(0, 5);
    const top5Data = {};
    topByRevenue.forEach((item, i) => {
        top5Data[`top5_${i+1}_name`] = item.name;
        top5Data[`top5_${i+1}_percent`] = formatNumber((item.revenue / totalFoodRevenue) * 100, 0);
        top5Data[`top5_${i+1}_revenue`] = formatNumber(item.revenue);
    });

    // 3. Superhero Item
    const superhero = topByRevenue[0] || { name: 'N/A', revenue: 0 };

    // 4. Timeline Heroes (by quantity in time slots)
    const timeSlots = {
        time1: { start: 5, end: 10, items: {} }, // 5.00 - 10.00
        time2: { start: 10, end: 14, items: {} }, // 10.00 - 14.00
        time3: { start: 14, end: 17, items: {} }, // 14.00 - 17.00
        time4: { start: 17, end: 22, items: {} }, // 17.00 - 22.00
    };

    foodData.forEach(d => {
        const hour = d['Sales Date In'].getHours();
        for (const slotKey in timeSlots) {
            const slot = timeSlots[slotKey];
            if (hour >= slot.start && hour < slot.end) {
                slot.items[d.Menu] = (slot.items[d.Menu] || 0) + d.Quantity;
                break;
            }
        }
    });

    const getTopItemInSlot = (slot) => {
        if (Object.keys(slot.items).length === 0) return 'N/A';
        return Object.entries(slot.items).toSorted((a, b) => b[1] - a[1])[0][0];
    };

    // Update the store with all calculated values
    $store.setStorePartial({
        favoriteFoods: `Konsumen kamu paling suka makan ${podiumNames.join(', ')}.`,
        podium1: podiumNames[0] || '',
        podium2: podiumNames[1] || '',
        podium3: podiumNames[2] || '',
        ...top5Data,
        superheroTitle: `Kalau ini kisah superhero, ${superhero.name} lah superhero utama di bisnis kamu.`,
        superheroName: superhero.name,
        superheroContributionPercent: formatNumber((superhero.revenue / totalOverallOmzet) * 100, 0),
        superheroContributionNominal: formatNumber(superhero.revenue),
        timelineTitle: 'Tapi seperti Marvel misalnya, tokoh utama superhero setiap waktu bisa saja berbeda-beda.',
        hero_time1_name: getTopItemInSlot(timeSlots.time1),
        hero_time2_name: getTopItemInSlot(timeSlots.time2),
        hero_time3_name: getTopItemInSlot(timeSlots.time3),
        hero_time4_name: getTopItemInSlot(timeSlots.time4),
    });
}

// In main.ts, add this new function

/**
 * Generate comprehensive drink category analysis insights and rankings.
 *
 * @description
 * Analyzes MINUMAN (drink) category sales data to generate multiple insights:
 * top 3 drinks by quantity (podium), top 5 revenue contributors with percentages,
 * sidekick item (top performer), and timeline heroes (top drinks per time slot).
 * Updates global store with formatted insights for business intelligence reporting
 * and menu optimization recommendations.
 *
 * @param data - Array of processed sales data rows with Menu Category, Menu, Quantity, Revenue, and Sales Date In.
 * @returns This function does not return a value; it updates the global store with drink insights.
 *
 * @example
 * // Generate drink analysis insights
 * const salesData = [
 *   { "Menu Category": "MINUMAN", Menu: "Es Teh", Quantity: 50, Revenue: 500000, "Sales Date In": new Date("2024-01-15 14:30") },
 *   { "Menu Category": "MINUMAN", Menu: "Kopi", Quantity: 30, Revenue: 600000, "Sales Date In": new Date("2024-01-15 19:45") }
 * ];
 * generateDrinkAnalysisInsights(salesData);
 * // Updates store with podium rankings, top 5 contributors, sidekick, and timeline heroes
 */
function generateDrinkAnalysisInsights(data: any[]): void {
    if (data.length === 0) return;

    const totalOverallOmzet = data.reduce((sum, d) => sum + d.Revenue, 0);
    const drinkData = data.filter(d => d['Item Group'] === 'MINUMAN');
    if (drinkData.length === 0) return;

    const totalDrinkRevenue = drinkData.reduce((sum, d) => sum + d.Revenue, 0);

    const drinkStats = drinkData.reduce((acc, d) => {
        const menu = d.Menu || 'Unknown';
        if (!acc[menu]) acc[menu] = { revenue: 0, quantity: 0 };
        acc[menu].revenue += d.Revenue;
        acc[menu].quantity += d.Quantity;
        return acc;
    }, {});

    const drinkArray = Object.entries(drinkStats).map(([name, stats]) => ({ name, ...stats }));

    // 1. Podium (by quantity)
    const topByQuantity = [...drinkArray].toSorted((a, b) => b.quantity - a.quantity).slice(0, 3);
    const podiumNames = topByQuantity.map(item => item.name);

    // 2. Top 5 Revenue Contributor
    const topByRevenue = [...drinkArray].toSorted((a, b) => b.revenue - a.revenue).slice(0, 5);
    const top5Data = {};
    topByRevenue.forEach((item, i) => {
        top5Data[`top5_drink_${i+1}_name`] = item.name;
        top5Data[`top5_drink_${i+1}_percent`] = formatNumber((item.revenue / totalDrinkRevenue) * 100, 0);
        top5Data[`top5_drink_${i+1}_revenue`] = formatNumber(item.revenue);
    });

    // 3. Sidekick Item (Top Drink)
    const sidekick = topByRevenue[0] || { name: 'N/A', revenue: 0 };

    // 4. Timeline Heroes (by quantity in time slots)
    const timeSlots = {
        time1: { start: 5, end: 10, items: {} },
        time2: { start: 10, end: 14, items: {} },
        time3: { start: 14, end: 17, items: {} },
        time4: { start: 17, end: 22, items: {} },
    };

    drinkData.forEach(d => {
        const hour = d['Sales Date In'].getHours();
        for (const slotKey in timeSlots) {
            const slot = timeSlots[slotKey];
            if (hour >= slot.start && hour < slot.end) {
                slot.items[d.Menu] = (slot.items[d.Menu] || 0) + d.Quantity;
                break;
            }
        }
    });

    const getTopItemInSlot = (slot) => {
        if (Object.keys(slot.items).length === 0) return 'N/A';
        return Object.entries(slot.items).toSorted((a, b) => b[1] - a[1])[0][0];
    };

    // Update the store with all calculated values
    $store.setStorePartial({
        favoriteDrinks: `Konsumen kamu paling suka minum ${podiumNames.join(', ')}.`,
        podium1_drink: podiumNames[0] || '',
        podium2_drink: podiumNames[1] || '',
        podium3_drink: podiumNames[2] || '',
        ...top5Data,
        sidekickTitle: `Kalau ini kisah superhero, ${sidekick.name} lah sidekick utama di bisnis kamu.`,
        sidekickName: sidekick.name,
        sidekickContributionPercent: formatNumber((sidekick.revenue / totalOverallOmzet) * 100, 0),
        sidekickContributionNominal: formatNumber(sidekick.revenue),
        hero_drink_time1_name: getTopItemInSlot(timeSlots.time1),
        hero_drink_time2_name: getTopItemInSlot(timeSlots.time2),
        hero_drink_time3_name: getTopItemInSlot(timeSlots.time3),
        hero_drink_time4_name: getTopItemInSlot(timeSlots.time4),
    });
}

// In main.ts, add these two new functions

/**
 * Generate month-over-month Dine-In revenue comparison bar chart.
 *
 * @description
 * Analyzes Dine-In transaction data to compare revenue between current and previous
 * month based on the selected end date. Filters for Dine-In transactions only,
 * aggregates monthly revenue totals, and creates a comparative bar chart to
 * visualize month-over-month performance changes in the dine-in channel.
 *
 * @param data - Array of processed sales data rows with Visit Purpose, Sales Date In, and Revenue.
 * @returns This function does not return a value; it creates a Chart.js bar chart.
 *
 * @example
 * // Generate monthly Dine-In revenue comparison
 * const salesData = [
 *   { "Visit Purpose": "Dine In", "Sales Date In": new Date("2024-01-15"), Revenue: 3000000 },
 *   { "Visit Purpose": "Dine In", "Sales Date In": new Date("2024-02-15"), Revenue: 3500000 }
 * ];
 * generateDineInOutletIncreaseChart(salesData);
 * // Creates bar chart comparing previous vs current month Dine-In revenue
 */
function generateDineInOutletIncreaseChart(data: any[]): void {
    const endDate = new Date(document.getElementById('date-end').value);
    const currentMonth = endDate.getMonth();
    const currentYear = endDate.getFullYear();
    const prevMonth = currentMonth === 0 ? 11 : currentMonth - 1;
    const prevMonthYear = currentMonth === 0 ? currentYear - 1 : currentYear;

    const filterByMonth = (d, month, year) => d['Sales Date In'].getMonth() === month && d['Sales Date In'].getFullYear() === year;

    const dineInData = data.filter(d => d['Visit Purpose'] === 'Dine In');
    const currentMonthRevenue = dineInData.filter(d => filterByMonth(d, currentMonth, currentYear)).reduce((sum, d) => sum + d.Revenue, 0);
    const prevMonthRevenue = dineInData.filter(d => filterByMonth(d, prevMonth, prevMonthYear)).reduce((sum, d) => sum + d.Revenue, 0);

    const monthNames = ["November", "December"]; // As per design

    createChart('dinein-increase-outlet-chart-pdf', 'bar', {
        labels: monthNames,
        datasets: [{
            label: 'Dine In Revenue',
            data: [prevMonthRevenue, currentMonthRevenue],
            backgroundColor: ['#9CA3AF', '#4F46E5']
        }]
    });
}

/**
 * Generate outlet performance comparison insights with monthly growth analysis.
 *
 * @description
 * Analyzes outlet performance by comparing current vs previous month metrics
 * including TC (Total Check), APC (Average Per Customer), and sales growth.
 * Calculates growth percentages and nominal increases for each outlet, then
 * generates ranked lists of top performers by growth rate, total sales, and
 * monthly increase. Updates global store with top 2 outlets in each category.
 *
 * @param data - Array of sales data rows with Branch, Bill Number, Sales Date In, and Revenue.
 * @returns This function does not return a value; it updates the global store with outlet insights.
 *
 * @example
 * // Generate outlet comparison insights
 * const salesData = [
 *   { Branch: "Jakarta", "Bill Number": "B001", "Sales Date In": new Date("2024-02-15"), Revenue: 500000 },
 *   { Branch: "Bandung", "Bill Number": "B002", "Sales Date In": new Date("2024-01-15"), Revenue: 400000 }
 * ];
 * generateOutletComparisonInsights(salesData);
 * // Updates store with top growth, sales, and increase outlet rankings
 */
function generateOutletComparisonInsights(data: any[]): void {
    if (data.length === 0) return;

    const endDate = new Date(document.getElementById('date-end').value);
    const currentMonth = endDate.getMonth();
    const currentYear = endDate.getFullYear();
    const prevMonth = currentMonth === 0 ? 11 : currentMonth - 1;
    const prevMonthYear = currentMonth === 0 ? currentYear - 1 : currentYear;

    const getStatsByOutlet = (dataset) => {
        return dataset.reduce((acc, d) => {
            const outlet = d.Branch || 'Unknown';
            if (!acc[outlet]) acc[outlet] = { revenue: 0, bills: new Set() };
            acc[outlet].revenue += d.Revenue;
            acc[outlet].bills.add(d['Bill Number']);
            return acc;
        }, {});
    };

    const currentMonthData = data.filter(d => d['Sales Date In'].getMonth() === currentMonth && d['Sales Date In'].getFullYear() === currentYear);
    const prevMonthData = data.filter(d => d['Sales Date In'].getMonth() === prevMonth && d['Sales Date In'].getFullYear() === prevMonthYear);

    const currentStats = getStatsByOutlet(currentMonthData);
    const prevStats = getStatsByOutlet(prevMonthData);

    const allOutlets = [...new Set(Object.keys(currentStats).concat(Object.keys(prevStats)))];

    const comparison = allOutlets.map(outlet => {
        const cStat = currentStats[outlet] || { revenue: 0, bills: new Set() };
        const pStat = prevStats[outlet] || { revenue: 0, bills: new Set() };
        const cTC = cStat.bills.size;
        const pTC = pStat.bills.size;
        const cAPC = cTC > 0 ? cStat.revenue / cTC : 0;

        const tcGrowth = pTC > 0 ? ((cTC - pTC) / pTC) * 100 : (cTC > 0 ? 100 : 0);
        const salesGrowth = pStat.revenue > 0 ? ((cStat.revenue - pStat.revenue) / pStat.revenue) * 100 : (cStat.revenue > 0 ? 100 : 0);

        return {
            name: outlet,
            currentTC: cTC,
            currentAPC: cAPC,
            currentSales: cStat.revenue,
            tcGrowth,
            salesGrowth,
            salesIncreaseNominal: cStat.revenue - pStat.revenue
        };
    });

    // 1. Top Growth Outlets
    const topGrowth = [...comparison].toSorted((a, b) => b.tcGrowth - a.tcGrowth).slice(0, 2);
    $store.setStorePartial({
        outletGrowth1Name: topGrowth[0]?.name || '',
        outletGrowth1TC: formatNumber(topGrowth[0]?.currentTC),
        outletGrowth1APC: formatNumber(topGrowth[0]?.currentAPC),
        outletGrowth1Percent: formatNumber(topGrowth[0]?.tcGrowth, 0),
        outletGrowth2Name: topGrowth[1]?.name || '',
        outletGrowth2TC: formatNumber(topGrowth[1]?.currentTC),
        outletGrowth2APC: formatNumber(topGrowth[1]?.currentAPC),
        outletGrowth2Percent: formatNumber(topGrowth[1]?.tcGrowth, 0),
    });

    // 2. Top Sales Outlets
    const topSales = [...comparison].toSorted((a, b) => b.currentSales - a.currentSales).slice(0, 2);
    $store.setStorePartial({
        topOutlet1Name: topSales[0]?.name || '',
        topOutlet1Nominal: formatNumber(topSales[0]?.currentSales),
        topOutlet2Name: topSales[1]?.name || '',
        topOutlet2Nominal: formatNumber(topSales[1]?.currentSales),
    });

    // 3. Top Monthly Increase Outlets
    const topIncrease = [...comparison].toSorted((a, b) => b.salesIncreaseNominal - a.salesIncreaseNominal).slice(0, 2);
    $store.setStorePartial({
        monthlyOutletIncrease1Name: topIncrease[0]?.name || '',
        monthlyOutletIncrease1Percent: formatNumber(topIncrease[0]?.salesGrowth, 0),
        monthlyOutletIncrease1Nominal: formatNumber(topIncrease[0]?.salesIncreaseNominal),
        monthlyOutletIncrease2Name: topIncrease[1]?.name || '',
        monthlyOutletIncrease2Percent: formatNumber(topIncrease[1]?.salesGrowth, 0),
        monthlyOutletIncrease2Nominal: formatNumber(topIncrease[1]?.salesIncreaseNominal),
    });
}

// In main.ts, REPLACE the existing generateHppAnalysis function

/**
 * Generate comprehensive HPP (food cost) analysis with period comparison and trends.
 *
 * @description
 * Analyzes food cost performance by calculating total HPP (Price × Quantity) for
 * current vs previous periods, determining trend direction with color coding
 * (red for increases, green for decreases), and creating daily HPP bar chart.
 * Updates global store with trend metrics, highlights, and directly modifies
 * DOM element styling for trend visualization.
 *
 * @param currentData - Array of current period sales data with Price, Quantity, and Sales Date In.
 * @param lastPeriodData - Array of previous period sales data for comparison baseline.
 * @returns This function does not return a value; it creates charts and updates store/DOM.
 *
 * @example
 * // Generate HPP analysis with period comparison
 * const current = [{ Price: 15000, Quantity: 10, "Sales Date In": new Date("2024-02-15") }];
 * const previous = [{ Price: 12000, Quantity: 8, "Sales Date In": new Date("2024-01-15") }];
 * generateHppAnalysis(current, previous);
 * // Creates daily HPP chart and updates store with trend analysis
 */
function generateHppAnalysis(currentData: any[], lastPeriodData: any[]): void {
    if (currentData.length === 0) return;

    const calculateHpp = (d) => d.Price * d.Quantity;

    // 1. Calculate Total HPP for current and last periods
    const currentTotalHpp = currentData.reduce((sum, d) => sum + calculateHpp(d), 0);
    const lastPeriodTotalHpp = lastPeriodData.reduce((sum, d) => sum + calculateHpp(d), 0);

    // 2. Calculate Trend and determine symbols/color
    let hppTrendPercent = 0;
    let hppDifference = 0;
    let hppTrendArrow = '';
    let hppTrendSign = '';
    let hppTrendColor = 'text-gray-500'; // Default color for no change

    if (lastPeriodTotalHpp > 0) {
        hppDifference = currentTotalHpp - lastPeriodTotalHpp;
        hppTrendPercent = (hppDifference / lastPeriodTotalHpp) * 100;

        if (hppDifference > 0) {
            hppTrendArrow = '▲';
            hppTrendSign = '+';
            // Note: Higher HPP/cost is typically bad, so we use red for an increase.
            hppTrendColor = 'text-red-600';
        } else if (hppDifference < 0) {
            hppTrendArrow = '▼';
            hppTrendSign = '-';
            // Lower HPP/cost is good, so we use green for a decrease.
            hppTrendColor = 'text-green-600';
        }
    }

    // 3. Aggregate Daily HPP for the chart
    const dailyHpp = currentData.reduce((acc, d) => {
        const date = d['Sales Date In'].toISOString().split('T')[0];
        acc[date] = (acc[date] || 0) + calculateHpp(d);
        return acc;
    }, {});
    const sortedDates = Object.keys(dailyHpp).toSorted();

    // 4. Update the store with all calculated values
    $store.setStorePartial({
        pageTitle: 'Tinjauan Penggunaan Bahan Baku',
        pageSubtitle: 'Memahami detil komponen penggunaan bahan baku adalah yang sebenarnya membuat kamu benar-benar cuan.',
        totalHPP: formatNumber(currentTotalHpp),
        hppTrendPercent: formatNumber(Math.abs(hppTrendPercent), 0),
        hppTrendNominal: formatNumber(Math.abs(hppDifference)),
        hppTrendArrow: hppTrendArrow,
        hppTrendSign: hppTrendSign,
        highlight1: 'Puncak penjualan cabang A terjadi pada tanggal 6 Des 2021 disusul oleh tanggal 26 Des 2021.',
        highlight2: 'Traffic tertinggi terjadi pada tanggal 7 Desember 2021 sebanyak 100 customer dengan terendah pada tanggal 9 Desember 2021.',
        highlight3: 'Cabang A merupakan cabang dengan kontribusi penjualan terbanyak.',
    });

    // 5. Generate the BAR chart
    createChart('hpp-harian-chart-pdf', 'bar', {
        labels: sortedDates,
        datasets: [{
            label: 'HPP Harian',
            data: sortedDates.map(date => dailyHpp[date]),
            backgroundColor: '#4F46E5'
        }]
    });

    // 6. Directly update the color of the trend text element
    const hppTrendElement = document.getElementById('hpp-trend-p');
    if (hppTrendElement) {
        hppTrendElement.className = `text-sm mt-1 font-medium ${hppTrendColor}`;
    }
}

// In main.ts, add this new function

/**
 * Generate comprehensive food cost analysis with multiple visualizations and insights.
 *
 * @description
 * Analyzes food cost performance by calculating actual HPP (Price × Quantity) vs
 * projected food cost (28% of revenue). Creates doughnut chart showing cost breakdown
 * by menu category, horizontal bar chart comparing actual vs projected costs,
 * evaluates per-outlet cost variance, and generates ranked lists of outlets by
 * cost percentage and variance for operational optimization.
 *
 * @param data - Array of processed sales data rows with Price, Quantity, Revenue, Menu Category, and Branch.
 * @returns This function does not return a value; it creates multiple charts and updates global store.
 *
 * @example
 * // Generate comprehensive food cost analysis
 * const salesData = [
 *   { Price: 15000, Quantity: 10, Revenue: 50000, "Menu Category": "MAKANAN", Branch: "Jakarta" },
 *   { Price: 8000, Quantity: 15, Revenue: 30000, "Menu Category": "MINUMAN", Branch: "Bandung" }
 * ];
 * generateFoodCostAnalysis(salesData);
 * // Creates doughnut chart, bar chart, and updates store with cost metrics
 */
function generateFoodCostAnalysis(data: any[]): void {
    if (data.length === 0) return;

    // Assumption: Projected food cost is 28% of revenue, a common industry target.
    const PROJECTED_FOOD_COST_PERCENTAGE = 0.28;

    const calculateHpp = (d) => d.Price * d.Quantity;
    const totalRevenue = data.reduce((sum, d) => sum + d.Revenue, 0);
    const totalHpp = data.reduce((sum, d) => sum + calculateHpp(d), 0);
    const actualFoodCostPercent = totalRevenue > 0 ? (totalHpp / totalRevenue) : 0;
    const projectedFoodCostPercent = PROJECTED_FOOD_COST_PERCENTAGE;

    // 1. Alert Card Calculation
    const alertPercentage = projectedFoodCostPercent > 0 ? ((actualFoodCostPercent - projectedFoodCostPercent) / projectedFoodCostPercent) * 100 : 0;

    // 2. "Komponen Food Cost" Doughnut Chart
    const costByComponent = data.reduce((acc, d) => {
        const category = d['Item Group'] || 'Unknown';
        acc[category] = (acc[category] || 0) + calculateHpp(d);
        return acc;
    }, {});

    createChart('food-cost-komponen-chart-pdf', 'doughnut', {
        labels: Object.keys(costByComponent),
        datasets: [{
            data: Object.values(costByComponent),
            backgroundColor: ['#3B82F6', '#10B981', '#F97316', '#8B5CF6'],
        }]
    });

    // 3. "Food Cost Bulan Ini" Bar Chart (Actual vs. Projected)
    createChart('food-cost-aktual-chart-pdf', 'bar', {
        labels: [''], // No label needed for a single group
        datasets: [{
            label: 'Proyeksi',
            data: [totalRevenue * projectedFoodCostPercent],
            backgroundColor: '#9CA3AF',
        }, {
            label: 'Aktual',
            data: [totalHpp],
            backgroundColor: '#4F46E5',
        }]
    }, { indexAxis: 'y' }); // Make it a horizontal bar chart

    // 4. Per-Outlet Calculations for Lists
    const outletStats = data.reduce((acc, d) => {
        const outlet = d.Branch || 'Unknown';
        if (!acc[outlet]) acc[outlet] = { revenue: 0, hpp: 0 };
        acc[outlet].revenue += d.Revenue;
        acc[outlet].hpp += calculateHpp(d);
        return acc;
    }, {});

    const outletAnalysis = Object.entries(outletStats).map(([name, stats]) => {
        const costPercent = stats.revenue > 0 ? (stats.hpp / stats.revenue) * 100 : 0;
        const variance = costPercent - (projectedFoodCostPercent * 100);
        return { name, costPercent, variance };
    });

    // 5. Top Lists
    const topCost = [...outletAnalysis].toSorted((a, b) => b.costPercent - a.costPercent).slice(0, 4);
    const topVariance = [...outletAnalysis].toSorted((a, b) => b.variance - a.variance).slice(0, 4);

    // 6. Update Store
    const listUpdate = {};
    topCost.forEach((item, i) => {
        listUpdate[`costOutlet${i+1}`] = item.name;
        listUpdate[`costOutlet${i+1}Value`] = `${formatNumber(item.costPercent, 1)}%`;
    });
    topVariance.forEach((item, i) => {
        listUpdate[`varianceOutlet${i+1}`] = item.name;
        listUpdate[`varianceOutlet${i+1}Value`] = `${formatNumber(item.variance, 1)}%`;
    });

    $store.setStorePartial({
        foodCostTip: 'Pencatatan penggunaan bahan baku yang detil dapat membantu anda menurunkan Food Cost anda !',
        foodCostAlertPercentage: formatNumber(alertPercentage, 0),
        ...listUpdate,
    });
}

// In main.ts, add this new function

/**
 * Generate comprehensive customer segmentation insights and analytics.
 *
 * @description
 * Analyzes customer behavior across the entire dataset to build customer profiles,
 * then categorizes current period customers into segments: New customers (first seen
 * in current period), Loyal customers (>2 transactions), and High Spenders (top 20%
 * by average spend). Calculates segment metrics and identifies top customers and
 * newest members for business intelligence reporting.
 *
 * @param currentData - Array of sales data rows for the current analysis period.
 * @param allData - Complete historical sales dataset for customer profiling.
 * @param periodStart - Start date of the current analysis period.
 * @param periodEnd - End date of the current analysis period.
 * @returns This function does not return a value; it updates the global store with customer insights.
 *
 * @example
 * // Generate customer analysis insights
 * const currentPeriod = [{ Revenue: 200000, "Bill Number": "001", "Customer Name": "John", "Sales Date In": new Date("2024-01-15") }];
 * const allData = [{ Revenue: 150000, "Bill Number": "002", "Customer Name": "Jane", "Sales Date In": new Date("2023-12-01") }];
 * generateCustomerAnalysisInsights(currentPeriod, allData, new Date("2024-01-01"), new Date("2024-01-31"));
 * // Updates store with customer segments, counts, and top customer analytics
 */
function generateCustomerAnalysisInsights(currentData: any[], allData: any[], periodStart: Date, periodEnd: Date): void {
    // Assumption: We use 'Customer Name' to identify unique customers.
    // We'll filter out entries without a customer name for this analysis.
    const namedData = allData.filter(d => d['Customer Name']);
    if (namedData.length === 0) return;

    // 1. Build a profile for every customer in the entire dataset
    const customerProfiles = namedData.reduce((acc, d) => {
        const name = d['Customer Name'];
        if (!acc[name]) {
            acc[name] = {
                name: name,
                bills: new Set(),
                firstSeen: d['Sales Date In'],
                totalSpend: 0
            };
        }
        acc[name].bills.add(d['Bill Number']);
        acc[name].totalSpend += d.Revenue;
        if (d['Sales Date In'] < acc[name].firstSeen) {
            acc[name].firstSeen = d['Sales Date In'];
        }
        return acc;
    }, {});

    // 2. Analyze customers active in the CURRENT period
    const currentCustomerNames = new Set(currentData.map(d => d['Customer Name']));
    const activeProfiles = Object.values(customerProfiles).filter(p => currentCustomerNames.has(p.name));

    // Categorize customers
    const newCustomers = [], loyalCustomers = [], highSpenders = [];

    // Calculate average spend for all active customers to find high spenders
    const spendings = activeProfiles.map(p => p.totalSpend / p.bills.size);
    spendings.toSorted((a,b)=> a-b);
    const highSpenderThreshold = spendings[Math.floor(spendings.length * 0.8)]; // Top 20%

    activeProfiles.forEach(p => {
        // New Customer: First transaction is within the current period
        if (p.firstSeen >= periodStart && p.firstSeen <= periodEnd) {
            newCustomers.push(p);
        }
        // Loyal Customer: More than 2 transactions in the period
        if (p.bills.size > 2) {
            loyalCustomers.push(p);
        }
        // High Spender: Average spend is in the top 20%
        const avgSpend = p.totalSpend / p.bills.size;
        if (avgSpend >= highSpenderThreshold) {
            highSpenders.push(p);
        }
    });

    const calculateAvgSpend = (arr) => {
        if (arr.length === 0) return 0;
        const totalSpend = arr.reduce((sum, p) => sum + p.totalSpend, 0);
        return totalSpend / arr.length;
    };

    // 3. Find newest members and top customers
    const newestMembers = Object.values(customerProfiles).toSorted((a, b) => b.firstSeen - a.firstSeen).slice(0, 10);
    const topCustomers = Object.values(customerProfiles).toSorted((a, b) => b.totalSpend - a.totalSpend).slice(0, 3);

    const newestMemberUpdate = {};
    newestMembers.forEach((item, i) => {
        newestMemberUpdate[`newestMember${i+1}`] = item.name;
    });

    // 4. Update the store
    $store.setStorePartial({
        topCustomerNames: topCustomers.map(p => p.name).join(', '),
        newCustomerCount: formatNumber(newCustomers.length),
        newCustomerAvgSpend: formatNumber(calculateAvgSpend(newCustomers)),
        highSpenderCount: formatNumber(highSpenders.length),
        highSpenderAvgSpend: formatNumber(calculateAvgSpend(highSpenders)),
        loyalCustomerCount: formatNumber(loyalCustomers.length),
        loyalCustomerAvgSpend: formatNumber(calculateAvgSpend(loyalCustomers)),
        ...newestMemberUpdate,
    });
}

// In main.ts, add this new function

/**
 * Generate comprehensive top branch performance analysis with visualizations and comparisons.
 *
 * @description
 * Identifies the highest-revenue branch and creates comprehensive analysis including
 * revenue distribution donut chart for all branches and daily omzet/traffic trends
 * for the top branch. Calculates key metrics (revenue, TC, APC) and compares them
 * against previous period. Updates global store with formatted metrics, growth
 * indicators, and highlight dates for business insights and reporting.
 *
 * @param currentData - Array of current period sales data with Branch, Revenue, Bill Number, and Sales Date In.
 * @param lastPeriodData - Array of previous period sales data for comparison analysis.
 * @returns This function does not return a value; it creates charts and updates global store.
 *
 * @example
 * // Generate top branch analysis with period comparison
 * const currentSales = [
 *   { Branch: "Jakarta", Revenue: 500000, "Bill Number": "B001", "Sales Date In": new Date("2024-01-15") },
 *   { Branch: "Bandung", Revenue: 300000, "Bill Number": "B002", "Sales Date In": new Date("2024-01-15") }
 * ];
 * const lastPeriodSales = [
 *   { Branch: "Jakarta", Revenue: 450000, "Bill Number": "B003", "Sales Date In": new Date("2023-12-15") }
 * ];
 * generateTopBranchAnalysis(currentSales, lastPeriodSales);
 * // Creates donut chart, line chart, and updates store with top branch metrics
 */
function generateTopBranchAnalysis(currentData: any[], lastPeriodData: any[]): void {
    if (currentData.length === 0) return;

    // 1. Find the top branch by revenue in the current period
    const revenueByBranch = currentData.reduce((acc, d) => {
        const branch = d.Branch || 'Unknown';
        acc[branch] = (acc[branch] || 0) + d.Revenue;
        return acc;
    }, {});
    const topBranchName = Object.entries(revenueByBranch).toSorted((a, b) => b[1] - a[1])[0][0];

    // 2. Filter data for only the top branch
    const topBranchCurrentData = currentData.filter(d => d.Branch === topBranchName);
    const topBranchLastPeriodData = lastPeriodData.filter(d => d.Branch === topBranchName);

    // 3. Calculate stats and trends for the top branch
    const calcStats = (data) => {
        const revenue = data.reduce((sum, d) => sum + d.Revenue, 0);
        const traffic = new Set(data.map(d => d['Bill Number'])).size;
        const avgSale = traffic > 0 ? revenue / traffic : 0;
        return { revenue, traffic, avgSale };
    };
    const currentStats = calcStats(topBranchCurrentData);
    const lastPeriodStats = calcStats(topBranchLastPeriodData);

    const omzetComparison = calculateComparison(currentStats.revenue, lastPeriodStats.revenue);
    const trafficComparison = calculateComparison(currentStats.traffic, lastPeriodStats.traffic);
    const avgSaleComparison = calculateComparison(currentStats.avgSale, lastPeriodStats.avgSale);

    // 4. Generate Donut Chart for ALL branches
    const colors = ['#4F46E5', '#F59E0B', '#10B981', '#3B82F6', '#6366F1'];
    createChart('branch-sales-donut-chart', 'doughnut', {
        labels: Object.keys(revenueByBranch),
        datasets: [{
            data: Object.values(revenueByBranch),
            backgroundColor: colors,
        }]
    }, { plugins: { legend: { display: false } } });

    const legendContainer = document.getElementById('branch-sales-donut-legend');
    legendContainer.innerHTML = Object.keys(revenueByBranch).map((branch, i) => `
        <div class="flex items-center">
            <div class="w-3 h-3 rounded-sm mr-2" style="background-color: ${colors[i % colors.length]}"></div>
            <span>${branch}</span>
        </div>`).join('');

    // 5. Generate Daily Omzet & Traffic Line Chart for TOP branch
    const dailyStats = topBranchCurrentData.reduce((acc, d) => {
        const date = d['Sales Date In'].toISOString().split('T')[0];
        if (!acc[date]) acc[date] = { revenue: 0, bills: new Set() };
        acc[date].revenue += d.Revenue;
        acc[date].bills.add(d['Bill Number']);
        return acc;
    }, {});
    const sortedDates = Object.keys(dailyStats).toSorted();

    createChart('omzet-traffic-harian-chart-pdf', 'line', {
        labels: sortedDates.map(d => d.slice(5)), // Show MM-DD
        datasets: [
            { label: 'Omzet', data: sortedDates.map(d => dailyStats[d].revenue), yAxisID: 'yOmzet', borderColor: '#4F46E5', tension: 0.2 },
            { label: 'Traffic', data: sortedDates.map(d => dailyStats[d].bills.size), yAxisID: 'yTraffic', borderColor: '#F97316', tension: 0.2 }
        ]
    }, { scales: { yOmzet: { position: 'left', title: { display: true, text: 'Omzet (Rp)' } }, yTraffic: { position: 'right', title: { display: true, text: 'Traffic' }, grid: { drawOnChartArea: false } } } });

    // 6. Calculate Highlights
    const dailySales = sortedDates.map(d => ({ date: d, revenue: dailyStats[d].revenue }));
    const dailyTraffic = sortedDates.map(d => ({ date: d, traffic: dailyStats[d].bills.size }));
    const peakSales = [...dailySales].toSorted((a,b) => b.revenue - a.revenue);
    const peakTraffic = [...dailyTraffic].toSorted((a,b) => b.traffic - a.traffic)[0];
    const lowestTraffic = [...dailyTraffic].toSorted((a,b) => a.traffic - b.traffic)[0];

    // 7. Update Store
    $store.setStorePartial({
        branchName: topBranchName,
        totalOmzetFormatted: formatNumber(currentStats.revenue),
        omzetUpOrDown: omzetComparison.upOrDown,
        omzetPercentage: omzetComparison.percentage,
        omzetPlusOrMinus: omzetComparison.plusOrMinus,
        omzetDifference: omzetComparison.difference,
        trafficCountFormatted: formatNumber(currentStats.traffic),
        trafficUpOrDown: trafficComparison.upOrDown,
        trafficPercentage: trafficComparison.percentage,
        trafficPlusOrMinus: trafficComparison.plusOrMinus,
        trafficDifference: trafficComparison.difference,
        avgSaleFormatted: formatNumber(currentStats.avgSale, 0),
        avgSaleUpOrDown: avgSaleComparison.upOrDown,
        avgSalePercentage: avgSaleComparison.percentage,
        avgSalePlusOrMinus: avgSaleComparison.plusOrMinus,
        avgSaleDifference: avgSaleComparison.difference,
        branchNameForChart: topBranchName,
        highlightBranchName1: topBranchName,
        peakSaleDate1: new Date(peakSales[0]?.date).toLocaleDateString('id-ID', {day: 'numeric', month: 'short'}),
        peakSaleDate2: new Date(peakSales[1]?.date).toLocaleDateString('id-ID', {day: 'numeric', month: 'short'}),
        peakTrafficDate: new Date(peakTraffic?.date).toLocaleDateString('id-ID', {day: 'numeric', month: 'short'}),
        peakTrafficCount: peakTraffic?.traffic,
        lowestTrafficDate: new Date(lowestTraffic?.date).toLocaleDateString('id-ID', {day: 'numeric', month: 'short'}),
        highlightBranchName2: topBranchName,
    });

    document.getElementById('branch-omzet-trend').className = `text-sm ${omzetComparison.upOrDown === '▲' ? 'text-green-500' : 'text-red-500'}`;
    document.getElementById('branch-traffic-trend').className = `text-sm ${trafficComparison.upOrDown === '▲' ? 'text-green-500' : 'text-red-500'}`;
    document.getElementById('branch-avg-sale-trend').className = `text-sm ${avgSaleComparison.upOrDown === '▲' ? 'text-green-500' : 'text-red-500'}`;
}

// In main.ts, add this new function
// In main.ts, REPLACE the existing generateBranchApcGrowthAnalysis function

 /**
  * Analyze branch-level APC (Average per Check) growth to find the top-growing branch.
  * Computes APC across current month, previous month, last 30 days, and YoY periods for
  * the top branch, renders a monthly APC area chart for the last 6 months, and updates
  * comparison metrics and trend colors in state.
  *
  * Date range is derived from '#date-start' and '#date-end' inputs in the DOM.
  *
  * @param {any[]} currentData - Filtered dataset for the currently selected period.
  * @param {any[]} allData - Full dataset used to evaluate branches and historical comparisons.
  * @returns {void}
  */
  function generateBranchApcGrowthAnalysis(currentData, allData) {
    if (currentData.length === 0) return;

    // Define helper to calculate stats for a dataset
    const getStats = (data) => {
        const revenue = data.reduce((sum, d) => sum + d.Revenue, 0);
        const checks = new Set(data.map(d => d['Bill Number'])).size;
        return { sales: revenue, checks, traffic: checks }; // Assuming traffic is same as checks
    };

    // 1. Find Top Branch by APC Growth
    const endDate = new Date(document.getElementById('date-end').value);
    const currentMonth = endDate.getMonth();
    const currentYear = endDate.getFullYear();
    const prevMonth = currentMonth === 0 ? 11 : currentMonth - 1;
    const prevMonthYear = currentMonth === 0 ? currentYear - 1 : currentYear;

    const branches = [...new Set(allData.map(d => d.Branch))];
    let topBranchName = branches[0] || 'N/A';
    let maxGrowth = -Infinity;

    branches.forEach(branch => {
        const branchData = allData.filter(d => d.Branch === branch);
        const cMonthData = branchData.filter(d => d['Sales Date In'].getMonth() === currentMonth && d['Sales Date In'].getFullYear() === currentYear);
        const pMonthData = branchData.filter(d => d['Sales Date In'].getMonth() === prevMonth && d['Sales Date In'].getFullYear() === prevMonthYear);

        const cStats = getStats(cMonthData);
        const pStats = getStats(pMonthData);

        const cApc = cStats.checks > 0 ? cStats.sales / cStats.checks : 0;
        const pApc = pStats.checks > 0 ? pStats.sales / pStats.checks : 0;

        const growth = pApc > 0 ? ((cApc - pApc) / pApc) * 100 : (cApc > 0 ? 100 : 0);
        if (growth > maxGrowth) {
            maxGrowth = growth;
            topBranchName = branch;
        }
    });

    // 2. Define time periods for the top branch
    const topBranchData = allData.filter(d => d.Branch === topBranchName);
    const periodEnd = new Date(document.getElementById('date-end').value);
    const periodStart = new Date(document.getElementById('date-start').value);

    const thirtyDayStart = new Date(periodStart);
    thirtyDayStart.setDate(thirtyDayStart.getDate() - 30);
    const yoyStart = new Date(periodStart);
    yoyStart.setFullYear(yoyStart.getFullYear() - 1);
    const yoyEnd = new Date(periodEnd);
    yoyEnd.setFullYear(yoyEnd.getFullYear() - 1);

    // 3. Get stats for each period
    const currentPeriodStats = getStats(topBranchData.filter(d => d['Sales Date In'] >= periodStart && d['Sales Date In'] <= periodEnd));
    const thirtyDayStats = getStats(topBranchData.filter(d => d['Sales Date In'] >= thirtyDayStart && d['Sales Date In'] < periodStart));
    const yoyStats = getStats(topBranchData.filter(d => d['Sales Date In'] >= yoyStart && d['Sales Date In'] <= yoyEnd));

    const check30DayComp = calculateComparison(currentPeriodStats.checks, thirtyDayStats.checks);
    const checkYoYComp = calculateComparison(currentPeriodStats.checks, yoyStats.checks);

    // 4. Generate Area Chart (monthly APC for last 6 months)
    const monthlyApc = {};
    for (let i = 5; i >= 0; i--) {
        const d = new Date(periodEnd);
        d.setMonth(d.getMonth() - i);
        const monthKey = d.toISOString().slice(0, 7);
        const monthData = topBranchData.filter(row => row['Sales Date In'].toISOString().startsWith(monthKey));
        const monthStats = getStats(monthData);
        monthlyApc[monthKey] = monthStats.checks > 0 ? monthStats.sales / monthStats.checks : 0;
    }

    createChart('avg-purchase-value-chart-pdf', 'line', {
        labels: Object.keys(monthlyApc).map(m => new Date(m).toLocaleString('id-ID', {month: 'short', year: '2-digit'})),
        datasets: [{
            label: 'Average Spend',
            data: Object.values(monthlyApc),
            // This 'fill: true' property creates the area chart effect
            fill: true,
            backgroundColor: 'rgba(79, 70, 229, 0.2)',
            borderColor: '#4F46E5',
            tension: 0.2
        }]
    });

    // 5. Update Store
    $store.setStorePartial({
        branchName: topBranchName,
        salesCurrent: formatNumber(currentPeriodStats.sales),
        sales30Day: formatNumber(thirtyDayStats.sales),
        salesYoY: formatNumber(yoyStats.sales),
        checkCurrent: formatNumber(currentPeriodStats.checks),
        check30Day: formatNumber(thirtyDayStats.checks),
        check30DayPercentage: check30DayComp.percentage,
        check30DayDiff: `${check30DayComp.plusOrMinus}${check30DayComp.difference}`,
        checkYoY: formatNumber(yoyStats.checks),
        checkYoYPercentage: checkYoYComp.percentage,
        checkYoYDiff: `${checkYoYComp.plusOrMinus}${checkYoYComp.difference}`,
        trafficCurrent: formatNumber(currentPeriodStats.traffic),
        traffic30Day: formatNumber(thirtyDayStats.traffic),
        trafficYoY: formatNumber(yoyStats.traffic),
        tipToolName: 'Analiso',
    });

    // 6. This new helper function robustly sets the trend color
    const setTrendColor = (elementId, comparison) => {
        const element = document.getElementById(elementId);
        if (!element) return;
        let colorClass = 'text-gray-500'; // Default for N/A
        if (comparison.upOrDown === '▲') colorClass = 'text-green-500';
        if (comparison.upOrDown === '▼') colorClass = 'text-red-500';
        element.className = `text-sm ${colorClass}`;
    };
    setTrendColor('check-30day-trend', check30DayComp);
    setTrendColor('check-yoy-trend', checkYoYComp);
}

// In main.ts, ADD this new function

 /**
  * Generate additional peak-hour and off-peak insights.
  * Identifies the dinner peak window (between 17:00–22:00) based on highest bill traffic,
  * computes popular menu items, spending quartiles within that window, and APC (Average per Check)
  * for breakfast and post-lunch periods. Stores computed values for display.
  *
  * @param {any[]} data - Dataset of sales records; expects fields: 'Sales Date In' (Date), 'Bill Number', 'Revenue', 'Quantity', 'Menu'.
  * @returns {void}
  */
  function generateMorePeakHourAnalysis(data) {
    if (data.length === 0) return;

    // Helper to get top menu by quantity from a dataset
    const getTopMenu = (dataset, count = 1) => {
        if (dataset.length === 0) return count === 1 ? 'N/A' : [];
        const menuQty = dataset.reduce((acc, d) => {
            acc[d.Menu] = (acc[d.Menu] || 0) + d.Quantity;
            return acc;
        }, {});
        return Object.entries(menuQty).toSorted((a, b) => b[1] - a[1]).slice(0, count).map(item => item[0]);
    };

    // Helper to get APC from a dataset
    const getApc = (dataset) => {
        if (dataset.length === 0) return 0;
        const revenue = dataset.reduce((sum, d) => sum + d.Revenue, 0);
        const bills = new Set(dataset.map(d => d['Bill Number'])).size;
        return bills > 0 ? revenue / bills : 0;
    };

    // 1. Find Peak Hour 2 (Dinner, between 5 PM and 10 PM)
    const eveningData = data.filter(d => d['Sales Date In'].getHours() >= 17 && d['Sales Date In'].getHours() < 22);
    const hourlyBills = eveningData.reduce((acc, d) => {
        const hour = d['Sales Date In'].getHours();
        if (!acc[hour]) acc[hour] = new Set();
        acc[hour].add(d['Bill Number']);
        return acc;
    }, {});
    const hourlyTraffic = Object.entries(hourlyBills).map(([hour, bills]) => ({ hour: parseInt(hour), count: bills.size }));
    const peakHour2 = hourlyTraffic.toSorted((a, b) => b.count - a.count)[0]?.hour || 18;

    const peakHour2Start = peakHour2;
    const peakHour2End = peakHour2 + 2;
    const peakHour2Data = data.filter(d => d['Sales Date In'].getHours() >= peakHour2Start && d['Sales Date In'].getHours() < peakHour2End);

    // 2. Analyze Peak Hour 2
    const popularDinnerMenu = getTopMenu(peakHour2Data, 4);
    const peak2BillTotals = Object.values(peakHour2Data.reduce((acc, d) => {
        acc[d['Bill Number']] = (acc[d['Bill Number']] || 0) + d.Revenue;
        return acc;
    }, {})).toSorted((a, b) => a - b);
    const minSpend = peak2BillTotals[Math.floor(peak2BillTotals.length * 0.25)] || 0;
    const maxSpend = peak2BillTotals[Math.floor(peak2BillTotals.length * 0.75)] || 0;

    // 3. Analyze Off-Peak Hours
    const breakfastData = data.filter(d => d['Sales Date In'].getHours() >= 7 && d['Sales Date In'].getHours() < 10);
    const postLunchData = data.filter(d => d['Sales Date In'].getHours() >= 14 && d['Sales Date In'].getHours() < 17);

    // 4. Update the store
    $store.setStorePartial({
        peakHour2Start: String(peakHour2Start).padStart(2, '0') + '.00',
        peakHour2End: String(peakHour2End).padStart(2, '0') + '.00',
        popularMenuDinner1: popularDinnerMenu[0] || '',
        popularMenuDinner2: popularDinnerMenu[1] || '',
        popularMenuDinner3: popularDinnerMenu[2] || '',
        popularMenuDinner4: popularDinnerMenu[3] || '',
        avgSpendingPeak1Min: formatNumber(minSpend, 0),
        avgSpendingPeak1Max: formatNumber(maxSpend, 0),
        apcBreakfast: formatCurrency(getApc(breakfastData), 'Rp ', 0),
        popularMenuBreakfast: getTopMenu(breakfastData, 1),
        apcPostLunch: formatCurrency(getApc(postLunchData), 'Rp ', 0),
        popularMenuPostLunch: getTopMenu(postLunchData, 1),
        tipToolName2: 'Analiso',
    });
}

// In main.ts, ADD this new function

/**
 * Generate weekend peak day analysis with revenue optimization insights.
 *
 * @description
 * Analyzes weekend sales patterns by identifying Saturday and Sunday transactions
 * and calculating potential revenue uplift from APC increases. Counts unique
 * weekend bills and computes bonus revenue potential based on a 5,000 APC
 * increase assumption. Provides actionable insights for weekend revenue optimization.
 *
 * @param data - Array of sales data rows with Sales Date In and Bill Number.
 * @returns This function does not return a value; it updates the global store with weekend insights.
 *
 * @example
 * // Generate weekend revenue optimization analysis
 * const salesData = [
 *   { "Sales Date In": new Date("2024-01-13T14:30:00"), "Bill Number": "B001" }, // Saturday
 *   { "Sales Date In": new Date("2024-01-14T19:45:00"), "Bill Number": "B002" }  // Sunday
 * ];
 * generatePeakDayAnalysis(salesData);
 * // Updates store with weekend APC increase potential and bonus revenue
 */
function generatePeakDayAnalysis(data: any[]): void {
    if (data.length === 0) return;

    // This calculation is for the bottom banner
    let weekendBills = new Set();
    data.forEach(d => {
        const day = d['Sales Date In'].getDay(); // Sunday=0, Saturday=6
        if (day === 0 || day === 6) {
            weekendBills.add(d['Bill Number']);
        }
    });

    const apcIncrease = 5000;
    const bonusOmzet = apcIncrease * weekendBills.size;

    $store.setStorePartial({
        // Note: The mainHourPercentage and mainHourInsight values are reused from the
        // generateHourlySalesInsights function, which is already being called.
        apcIncreaseAmount: formatNumber(apcIncrease),
        bonusOmzetAmount: formatNumber(bonusOmzet / 1000000, 0), // Format as millions ('juta')
    });
}

/**
 * Generate weekly summary metadata for PDF report generation.
 *
 * @description
 * Sets final weekly summary metadata used in PDF/report page generation.
 * Currently populates the tool name label for branding purposes in reports.
 * Guards against execution when dataset is empty to ensure data integrity.
 * Most weekly summary data is generated by other specialized functions.
 *
 * @param data - Array of processed sales data (used for validation guard).
 * @returns This function does not return a value; it updates global store with report metadata.
 *
 * @example
 * // Generate weekly summary metadata for reports
 * const salesData = [
 *   { Revenue: 500000, "Sales Date In": new Date("2024-01-15") }
 * ];
 * generateWeeklySummaryInsights(salesData);
 * // Updates store with tipToolName3 for PDF report branding
 */
function generateWeeklySummaryInsights(data: any[]): void {
    if (data.length === 0) return;

    // Most data for this page is generated by other functions.
    // We just need to set the final tipToolName.
    $store.setStorePartial({
        tipToolName3: 'Analiso',
    });
}

// In main.ts, ADD these two new functions

/**
 * Generate sales channel performance bar chart ranked by revenue.
 *
 * @description
 * Analyzes sales data to calculate total revenue per sales channel (Visit Purpose)
 * and creates a ranked bar chart showing channel performance. Sorts channels by
 * revenue in descending order to highlight top-performing channels and uses
 * distinct colors for visual differentiation. Optimized for PDF report inclusion.
 *
 * @param data - Array of sales data rows with Visit Purpose and Revenue.
 * @returns This function does not return a value; it creates a Chart.js bar chart.
 *
 * @example
 * // Generate sales channel performance chart
 * const salesData = [
 *   { "Visit Purpose": "Dine-In", Revenue: 500000 },
 *   { "Visit Purpose": "GoFood", Revenue: 300000 }
 * ];
 * generateSalesChannelBarChart(salesData);
 * // Creates ranked bar chart showing channel revenue performance
 */
function generateSalesChannelBarChart(data: any[]): void {
    const channelSales = data.reduce((acc, d) => {
        const channel = d['Visit Purpose'] || 'Unknown';
        acc[channel] = (acc[channel] || 0) + d.Revenue;
        return acc;
    }, {});

    const sortedChannels = Object.entries(channelSales).toSorted((a, b) => b[1] - a[1]);

    createChart('sales-channel-chart-pdf', 'bar', {
        labels: sortedChannels.map(c => c[0]),
        datasets: [{
            label: 'Total Sales',
            data: sortedChannels.map(c => c[1]),
            backgroundColor: ['#4F46E5', '#10B981', '#F97316'],
        }]
    });
}

// In main.ts, REPLACE the existing generateSalesChannelSummaryInsights function

/**
 * Generate sales channel insights with top menu items per channel.
 *
 * @description
 * Analyzes sales data to identify the most popular menu item by quantity for
 * each major sales channel (GoFood, GrabFood, ShopeeFood, Dine-In). Filters
 * data by channel, aggregates menu quantities, and determines top-selling items
 * to provide channel-specific insights for menu optimization and marketing strategies.
 *
 * @param data - Array of sales data rows with Visit Purpose, Menu, Quantity, and Revenue.
 * @param lastPeriodData - Array of previous period data (parameter unused but kept for API consistency).
 * @returns This function does not return a value; it updates the global store with channel insights.
 *
 * @example
 * // Generate channel-specific menu insights
 * const salesData = [
 *   { "Visit Purpose": "GoFood", Menu: "Nasi Goreng", Quantity: 10, Revenue: 150000 },
 *   { "Visit Purpose": "Dine-In", Menu: "Ayam Bakar", Quantity: 8, Revenue: 120000 }
 * ];
 * generateSalesChannelSummaryInsights(salesData, []);
 * // Updates store with most popular menu items per sales channel
 */
function generateSalesChannelSummaryInsights(data: any[], lastPeriodData: any[]): void {
    if (data.length === 0) return;

    // Helper to find top menu item by quantity for a given channel
    const getTopMenuForChannel = (dataset, channelName) => {
        const channelData = dataset.filter(d => d['Visit Purpose'] === channelName);
        if (channelData.length === 0) return 'N/A';
        const menuQty = channelData.reduce((acc, d) => {
            acc[d.Menu] = (acc[d.Menu] || 0) + d.Quantity;
            return acc;
        }, {});
        return Object.entries(menuQty).toSorted((a,b)=>b[1]-a[1])[0]?.[0] || 'N/A';
    };

    // Find top menu for each of the key channels
    const goFoodTopMenu = getTopMenuForChannel(data, 'GoFood');
    const grabFoodTopMenu = getTopMenuForChannel(data, 'GrabFood');
    const shopeeFoodTopMenu = getTopMenuForChannel(data, 'ShopeeFood');
    const dineInTopMenu = getTopMenuForChannel(data, 'Dine In');

    $store.setStorePartial({
        goFoodPopularFood: goFoodTopMenu,
        grabFoodPopularFood: grabFoodTopMenu,
        shopeeFoodPopularFood: shopeeFoodTopMenu,
        dineInPopularFood: dineInTopMenu,
    });
}

// In main.ts, ADD this new function

/**
 * Generate sales channel trend analysis for the highest-revenue branch with stacked visualizations.
 *
 * @description
 * Identifies the branch with highest total revenue and creates comprehensive sales
 * channel trend analysis using 100% stacked area charts across multiple time
 * dimensions (hourly, daily, monthly). Filters dataset to top branch and generates
 * stacked charts showing sales channel contribution patterns over different time
 * periods for strategic channel optimization and performance analysis.
 *
 * @param data - Array of sales data rows with Branch, Revenue, and sales channel information.
 * @returns This function does not return a value; it creates multiple stacked channel trend charts.
 *
 * @example
 * // Generate channel analysis for top branch
 * const salesData = [
 *   { Branch: "Jakarta", Revenue: 500000, "Visit Purpose": "Dine-In", "Sales Date In": new Date("2024-01-15T14:30:00") },
 *   { Branch: "Bandung", Revenue: 300000, "Visit Purpose": "GoFood", "Sales Date In": new Date("2024-01-15T19:45:00") }
 * ];
 * generateTopBranchChannelAnalysis(salesData);
 * // Creates hourly, daily, and monthly stacked channel trend charts for highest-revenue branch
 */
function generateTopBranchChannelAnalysis(data: any[]): void {
    if (data.length === 0) return;

    // 1. Find the top branch by revenue
    const revenueByBranch = data.reduce((acc, d) => {
        const branch = d.Branch || 'Unknown';
        acc[branch] = (acc[branch] || 0) + d.Revenue;
        return acc;
    }, {});
    const topBranchName = Object.entries(revenueByBranch).toSorted((a, b) => b[1] - a[1])[0][0];

    // 2. Filter data for only the top branch
    const topBranchData = data.filter(d => d.Branch === topBranchName);

    // 3. Reuse our existing stacked chart function with the filtered data
    generateStackedChannelTrendChart(topBranchData, 'sales-trend-channel-hour-pdf', 'hour', 'Sales');
    generateStackedChannelTrendChart(topBranchData, 'sales-trend-channel-week-pdf', 'day', 'Sales');
    generateStackedChannelTrendChart(topBranchData, 'sales-trend-channel-month-pdf', 'month', 'Sales');
}

// In main.ts, ADD this new function

/**
 * Generate Total Check channel trend analysis for the highest-revenue branch with stacked visualizations.
 *
 * @description
 * Identifies the branch with highest total revenue and creates comprehensive Total Check
 * (transaction count) channel trend analysis using 100% stacked area charts across
 * multiple time dimensions (hourly, daily, monthly). Filters dataset to top branch
 * and generates stacked charts showing TC channel contribution patterns over different
 * time periods for transaction volume optimization and channel performance analysis.
 *
 * @param data - Array of sales data rows with Branch, Revenue, and transaction information.
 * @returns This function does not return a value; it creates multiple stacked TC channel trend charts.
 *
 * @example
 * // Generate TC channel analysis for top branch
 * const salesData = [
 *   { Branch: "Jakarta", Revenue: 500000, "Visit Purpose": "Dine-In", "Bill Number": "B001", "Sales Date In": new Date("2024-01-15T14:30:00") },
 *   { Branch: "Bandung", Revenue: 300000, "Visit Purpose": "GoFood", "Bill Number": "B002", "Sales Date In": new Date("2024-01-15T19:45:00") }
 * ];
 * generateTopBranchTcAnalysis(salesData);
 * // Creates hourly, daily, and monthly stacked TC channel trend charts for highest-revenue branch
 */
function generateTopBranchTcAnalysis(data: any[]): void {
    if (data.length === 0) return;

    // 1. Find the top branch by revenue
    const revenueByBranch = data.reduce((acc, d) => {
        const branch = d.Branch || 'Unknown';
        acc[branch] = (acc[branch] || 0) + d.Revenue;
        return acc;
    }, {});
    const topBranchName = Object.entries(revenueByBranch).toSorted((a, b) => b[1] - a[1])[0][0];

    // 2. Filter data for only the top branch
    const topBranchData = data.filter(d => d.Branch === topBranchName);

    // 3. Reuse our existing stacked chart function with the filtered data for the TC metric
    generateStackedChannelTrendChart(topBranchData, 'tc-trend-channel-hour-pdf', 'hour', 'TC');
    generateStackedChannelTrendChart(topBranchData, 'tc-trend-channel-week-pdf', 'day', 'TC');
    generateStackedChannelTrendChart(topBranchData, 'tc-trend-channel-month-pdf', 'month', 'TC');
}

// In main.ts, ADD this new function

/**
 * Generate APC trend analysis for the highest-revenue branch with multiple time dimensions.
 *
 * @description
 * Identifies the branch with highest total revenue and creates comprehensive APC
 * (Average Per Check) trend analysis across multiple time dimensions (hourly, daily,
 * monthly). Filters dataset to top branch and generates trend charts showing APC
 * patterns by sales channel over different time periods. Updates global store with
 * branch name and reuses existing insights for consistent reporting.
 *
 * @param data - Array of sales data rows with Branch, Revenue, and other sales metrics.
 * @returns This function does not return a value; it creates multiple charts and updates global store.
 *
 * @example
 * // Generate APC analysis for top branch
 * const salesData = [
 *   { Branch: "Jakarta", Revenue: 500000, "Visit Purpose": "Dine-In", "Sales Date In": new Date("2024-01-15T14:30:00") },
 *   { Branch: "Bandung", Revenue: 300000, "Visit Purpose": "GoFood", "Sales Date In": new Date("2024-01-15T19:45:00") }
 * ];
 * generateTopBranchApcAnalysis(salesData);
 * // Creates hourly, daily, and monthly APC trend charts for highest-revenue branch
 */
function generateTopBranchApcAnalysis(data: any[]): void {
    if (data.length === 0) return;

    // 1. Find the top branch by revenue
    const revenueByBranch = data.reduce((acc, d) => {
        const branch = d.Branch || 'Unknown';
        acc[branch] = (acc[branch] || 0) + d.Revenue;
        return acc;
    }, {});
    const topBranchName = Object.entries(revenueByBranch).toSorted((a, b) => b[1] - a[1])[0][0];

    // 2. Filter data for only the top branch
    const topBranchData = data.filter(d => d.Branch === topBranchName);

    // The text insights are the same as the general page, so we can reuse this function
    generateGoFoodInsights(topBranchData);

    // Update the main title to include the top branch name
    $store.setStoreKV('branchName', topBranchName);
}

// In main.ts, ADD this new function

/**
 * Populate global store with contact information for reports and UI display.
 *
 * @description
 * Sets contact information (WhatsApp number) in the global store for use across
 * the application, particularly in report generation and contact sections.
 * Guards against execution when dataset is empty to maintain data consistency.
 *
 * @param data - Array of processed sales data rows (used only for empty state validation).
 * @returns This function does not return a value; it updates the global store with contact info.
 *
 * @example
 * // Populate contact information
 * const salesData = [{ Revenue: 100000 }]; // Non-empty data required
 * generateContactInfo(salesData);
 * // Updates store with whatsappNumber for use in reports and contact sections
 */
function generateContactInfo(data: any[]): void {
    if (data.length === 0) return;
    $store.setStorePartial({
        whatsappNumber: '+62 851-7157-8866',
    });
}

const loadingOverlay = document.getElementById('loading-overlay');
const loadingMessage = document.getElementById('loading-message');
const loadingProgressBar = document.getElementById('progress-bar');

function showLoading({ value = 0, message = 'Loading...' }) {
  loadingOverlay.classList.remove('hidden');
  loadingMessage.textContent = message;
  loadingProgressBar.style.width = `${value}%`;
}

function hideLoading() {
  loadingOverlay.classList.add('hidden');
}

function downloadPnlTemplate() {
    const instructions = [
        { Step: 1, Instruction: "In the 'P&L Data' sheet, enter your Business Name in cell B1 and a date from the desired month in cell B2 (e.g., '01/12/2024' for December 2024)." },
        { Step: 2, Instruction: "For the 'Main Category' column, you MUST use the exact values from the list provided." },
        { Step: 3, Instruction: "Under 'Beban Operasional (OPEX)', you MUST include 'Wages' and 'Rent'. Under 'Beban Non Operasional', you MUST include 'Advertising'." }
    ];
    const pnlSheetData = [
        { A: "Business Name:", B: "[Enter Business Name Here]" },
        { A: "Period:", B: "01/12/2024" },
        {}, // Empty row for spacing
        { A: "Main Category", B: "Sub-Category", C: "Amount" },
        { A: "Pendapatan (Revenue)", B: "Penjualan Makanan", C: 50000000 },
        { A: "Pendapatan (Revenue)", B: "Penjualan Minuman", C: 25000000 },
        { A: "Harga Pokok Produksi", B: "Bahan Baku Makanan", C: 15000000 },
        { A: "Harga Pokok Produksi", B: "Bahan Baku Minuman", C: 5000000 },
        { A: "Beban Operasional (OPEX)", B: "Wages", C: 12000000 },
        { A: "Beban Operasional (OPEX)", B: "Rent", C: 8000000 },
        { A: "Beban Operasional (OPEX)", B: "Utilitas (Listrik, Air)", C: 3000000 },
        // --- FIX: Advertising is now under Beban Non Operasional ---
        { A: "Beban Non Operasional", B: "Advertising", C: 2000000 },
        { A: "Beban Non Operasional", B: "Biaya Lainnya", C: 1000000 },
    ];
    const mainCategories = ["Pendapatan (Revenue)", "Harga Pokok Produksi", "Beban Operasional (OPEX)", "Beban Non Operasional", "Depresiasi/ Amortisasi", "Bunga", "Pajak (PB1)"];

    const wsInstructions = XLSX.utils.json_to_sheet([...instructions, {}, { Step: "Valid Main Categories:" }, ...mainCategories.map(cat => ({ Step: `  - ${cat}` }))], { skipHeader: true });
    const wsData = XLSX.utils.json_to_sheet(pnlSheetData, { skipHeader: true });

    wsInstructions['!cols'] = [{ wch: 25 }, { wch: 120 }];
    wsData['!cols'] = [{ wch: 30 }, { wch: 30 }, { wch: 20 }];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, wsInstructions, "Instructions");
    XLSX.utils.book_append_sheet(wb, wsData, "P&L Data");
    XLSX.writeFile(wb, "Finalytics_P&L_Template.xlsx");
}

// Attach the function to the new download button
document.getElementById('download-pnl-template-btn').addEventListener('click', downloadPnlTemplate);

function getPeriodFromFile(worksheet) {
    const periodCell = worksheet['B2'];
    if (!periodCell || !periodCell.v) {
        throw new Error("Period not found in cell B2. Please use the template and fill in the period.");
    }

    let dateString: string;

    // Check if Excel stored the date as a number (serial date) or a string
    if (periodCell.t === 'n') {
        // If it's a number, format it into a recognizable date string
        // Note: XLSX.SSF is a utility from the xlsx.full.min.js library
        dateString = XLSX.SSF.format('dd/mm/yyyy', periodCell.v);
    } else {
        // If it's already a string, use it directly
        dateString = periodCell.v.toString();
    }

    // Now, parse the "DD/MM/YYYY" string
    const parts = dateString.split('/');
    if (parts.length !== 3) {
        throw new Error(`Invalid period format: "${dateString}". Expected "DD/MM/YYYY".`);
    }

    const day = parts[0];
    const month = parts[1];
    const year = parts[2];

    // Ensure month is two digits (e.g., '08') and year is four digits
    if (!/^\d{4}$/.test(year) || !/^\d{1,2}$/.test(month) || !/^\d{1,2}$/.test(day)) {
        throw new Error(`Could not correctly parse the date from "${dateString}".`);
    }

    // Return in the required "YYYY-MM" format
    return `${year}-${month.padStart(2, '0')}`;
}

async function handlePnlTargetUpload() {
    if (!currentUser) return;
    const fileInput = document.getElementById('pnl-target-file-input') as HTMLInputElement;
    const file = fileInput.files?.[0];
    if (!file) {
        alert('Please select a P&L target file.');
        return;
    }

    showLoading({ message: 'Processing P&L target...' });
    try {
        const data = await file.arrayBuffer();
        const workbook = XLSX.read(data);
        const worksheet = workbook.Sheets["P&L Target Data"];
        if (!worksheet) throw new Error("Sheet 'P&L Target Data' not found. Please use the template.");

        // --- FIX START ---
        // Read the branch name from cell B1 of the target template
        const branchName = worksheet['B1'] ? String(worksheet['B1'].v).trim() : 'Unknown Branch';
        const period = getPeriodFromFile(worksheet);
        if (!period) throw new Error("Could not determine the period from the file.");

        const jsonData = XLSX.utils.sheet_to_json(worksheet, { range: 3 });

        const targets = {};
        jsonData.forEach(row => {
            if (row.Metric && typeof row.Value === 'number') {
                targets[row.Metric] = row.Value;
            }
        });

        const safeBranchName = branchName.replace(/\s+/g, '_');
        const docId = `${period}_${safeBranchName}`;
        const targetDocRef = doc(db, `users/${currentUser.uid}/monthlyPnlTargets`, docId);

        // Save the branchName along with the other data
        await setDoc(targetDocRef, {
            period,
            targets,
            branchName: branchName,
            fileName: file.name,
            lastUpdatedAt: new Date()
        });
        // --- FIX END ---

        hideLoading();
        alert('P&L target file uploaded successfully!');
        await populateCompiledDataTable();
    } catch (error) {
        console.error('Error uploading P&L target:', error);
        hideLoading();
        alert(`Error: ${error.message}`);
    }
}

document.getElementById('upload-pnl-data-btn').addEventListener('click', async () => {
    if (!currentUser) return;
    const fileInput = document.getElementById('pnl-data-file-input') as HTMLInputElement;
    const file = fileInput.files?.[0];
    if (!file) {
        alert('Please select a P&L data file.');
        return;
    }

    showLoading({ message: 'Processing P&L file...' });
    try {
        const period = await uploadAndProcessPnlFile(file); // Call the new unified function
        hideLoading();
        alert(`P&L Report for ${period} has been successfully created!`);
        await populateCompiledDataTable();
    } catch (error) {
        console.error("Error processing P&L data upload:", error);
        hideLoading();
        alert(`Failed to process P&L file. Error: ${error.message}`);
    }
});
document.getElementById('upload-pnl-target-btn').addEventListener('click', handlePnlTargetUpload);
document.getElementById('konfigurasi-btn').addEventListener('click', () => showView('konfigurasi'));

/**
 * Downloads a specified chart as a PNG image.
 * @param {string} chartId - The canvas ID of the chart to download.
 */
function downloadChartAsImage(chartId: string) {
    const chartInstance = $store.getChartProperty(chartId); // Get the chart from our store
    if (!chartInstance) {
        console.error(`Chart with ID "${chartId}" not found.`);
        alert('Could not download chart. Instance not found.');
        return;
    }

    // Use the Chart.js built-in function to get a base64 image string
    const imageUrl = chartInstance.toBase64Image('image/png', 1);

    // Create a temporary link element to trigger the download
    const link = document.createElement('a');
    link.href = imageUrl;
    link.download = `${chartId}.png`; // Set the filename for the download

    // Programmatically click the link to start the download, then remove the link
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// --- P&L Data Modal Listeners ---
document.getElementById('pnl-data-modal-close').addEventListener('click', () => {
    document.getElementById('pnl-data-modal').classList.add('hidden');
});
document.getElementById('pnl-data-modal-ok-btn').addEventListener('click', () => {
    document.getElementById('pnl-data-modal').classList.add('hidden');
});

/**
 * Displays a modal with a formatted Profit & Loss statement for a specific period.
 * @param {object} data - The P&L data object from Firestore.
 */
function showPnlDataModal(data: any) {
    const modal = document.getElementById('pnl-data-modal');
    const titleEl = document.getElementById('pnl-data-modal-title');
    const bodyEl = document.getElementById('pnl-data-modal-body');

    const period = data.period;
    const [year, month] = period.split('-');
    const formattedPeriod = new Date(parseInt(year), parseInt(month) - 1, 1).toLocaleString('default', { month: 'long', year: 'numeric' });
    titleEl.textContent = `P&L Statement for ${formattedPeriod}`;

    const pnlData = data.pnlData || {};
    const formatCurrency = (value) => `Rp${Math.round(value).toLocaleString('id-ID')}`;

    let totalRevenue = 0, totalHPP = 0, totalOpex = 0, totalNonOpex = 0;
    let totalDepresiasi = 0, totalBunga = 0, totalPajak = 0;

    const renderCategory = (categoryName: string) => {
        const categoryData = pnlData[categoryName] || {};
        const categoryTotal = Object.values(categoryData).reduce((sum, value) => sum + (value as number), 0);

        // Assign to wider-scoped totals
        if (categoryName === "Pendapatan (Revenue)") totalRevenue = categoryTotal;
        if (categoryName === "Harga Pokok Produksi") totalHPP = categoryTotal;
        if (categoryName === "Beban Operasional (OPEX)") totalOpex = categoryTotal;
        if (categoryName === "Beban Non Operasional") totalNonOpex = categoryTotal;
        if (categoryName === "Depresiasi/ Amortisasi") totalDepresiasi = categoryTotal;
        if (categoryName === "Bunga") totalBunga = categoryTotal;
        if (categoryName === "Pajak (PB1)") totalPajak = categoryTotal;

        if (Object.keys(categoryData).length === 0) return '';

        const itemsHtml = Object.entries(categoryData).map(([name, value]) => `
            <div class="flex justify-between text-sm text-gray-600 pl-4">
                <span>${name}</span><span class="font-mono">${formatCurrency(value as number)}</span>
            </div>`).join('');

        return `
            <div class="mb-4">
                <h4 class="font-bold text-md text-gray-800">${categoryName}</h4>
                <div class="space-y-1 mt-2">${itemsHtml}</div>
                <div class="flex justify-between font-semibold pt-1 border-t mt-1">
                    <span>Total ${categoryName}</span><span class="font-mono">${formatCurrency(categoryTotal)}</span>
                </div>
            </div>`;
    };

    const renderSubtotal = (label, value, colorClass) => `
        <div class="flex justify-between font-bold text-lg py-2 my-2 ${colorClass} rounded-md px-4">
            <span>${label}</span><span class="font-mono">${formatCurrency(value)}</span>
        </div>`;

    // --- Build the HTML string in the correct financial statement order ---
    let finalHtml = '';
    finalHtml += renderCategory("Pendapatan (Revenue)");
    finalHtml += renderCategory("Harga Pokok Produksi");
    const grossProfit = totalRevenue - totalHPP;
    finalHtml += renderSubtotal("Laba Kotor (Gross Profit)", grossProfit, "bg-yellow-100 text-yellow-800");

    finalHtml += renderCategory("Beban Operasional (OPEX)");
    const netOperatingIncome = grossProfit - totalOpex;
    finalHtml += renderSubtotal("Pendapatan Bersih Operasional", netOperatingIncome, "bg-blue-100 text-blue-800");

    finalHtml += renderCategory("Beban Non Operasional");
    const ebitda = netOperatingIncome - totalNonOpex;
    finalHtml += renderSubtotal("EBITDA", ebitda, "bg-orange-100 text-orange-800");

    finalHtml += renderCategory("Depresiasi/ Amortisasi");
    finalHtml += renderCategory("Bunga");
    finalHtml += renderCategory("Pajak (PB1)");

    const netIncome = ebitda - totalDepresiasi - totalBunga - totalPajak;
    finalHtml += renderSubtotal("Pendapatan Bersih (Net Income)", netIncome, "bg-green-200 text-green-800");

    bodyEl.innerHTML = finalHtml;
    modal.classList.remove('hidden');
}

// --- P&L Target Modal Listeners ---
document.getElementById('pnl-target-modal-close').addEventListener('click', () => {
    document.getElementById('pnl-target-modal').classList.add('hidden');
});
document.getElementById('pnl-target-modal-ok-btn').addEventListener('click', () => {
    document.getElementById('pnl-target-modal').classList.add('hidden');
});

/**
 * Displays a modal comparing P&L targets to actual performance for a specific period,
 * with a conditional "Achievement" column.
 */
// In main.ts, replace the existing showPnlTargetModal function with this one.

async function showPnlTargetModal(targetData: any, reportId: string) {
    const modal = document.getElementById('pnl-target-modal');
    const titleEl = document.getElementById('pnl-target-modal-title');
    const bodyEl = document.getElementById('pnl-target-modal-body');

    bodyEl.innerHTML = '<p id="pnl-target-loading-msg" class="text-center text-gray-500">Loading actual P&L report for comparison...</p>';
    modal.classList.remove('hidden');

    const period = targetData.period;
    if (!period) {
        bodyEl.innerHTML = '<p class="text-center text-red-500">Error: Period not found in target data.</p>';
        return;
    }

    const [year, month] = period.split('-');
    const formattedPeriod = new Date(parseInt(year), parseInt(month) - 1, 1).toLocaleString('default', { month: 'long', year: 'numeric' });
    titleEl.textContent = `P&L Target vs Actual for ${formattedPeriod}`;

    try {
        const pnlDocRef = doc(db, `users/${currentUser.uid}/pnlReports`, reportId);
        const pnlDocSnap = await getDoc(pnlDocRef);

        let actualValues = {
            'Pendapatan (Revenue)': 0, 'Harga Pokok Produksi': 0, 'Beban Operasional (OPEX)': 0,
            'Beban Non Operasional': 0, 'Depresiasi/ Amortisasi': 0, 'Bunga': 0, 'Pajak (PB1)': 0,
            'Laba Kotor (Gross Profit)': 0, 'Pendapatan Bersih Operasional (Net Operating Income)': 0,
            'Pendapatan Bersih Sebelum Deprisiasi/Amortisasi, Bunga & Pajak (EBITDA)': 0,
            'Pendapatan Bersih (Net Income)': 0
        };

        if (pnlDocSnap.exists()) {
            const pnlData = pnlDocSnap.data().pnlData || {};
            const pnlMetrics = calculateAllPnlMetrics(pnlData);
            actualValues = { ...actualValues, ...pnlMetrics };
        }

        const targets = targetData.targets || {};
        const formatCurrency = (value) => `Rp${Math.round(value).toLocaleString('id-ID')}`;

        let tableHtml = `
            <div class="overflow-x-auto">
                <table class="min-w-full divide-y divide-gray-200">
                    <thead class="bg-gray-50">
                        <tr>
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Metric</th>
                            <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Target</th>
                            <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actual</th>
                            <th class="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Change (%)</th>
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase hidden">Achievement</th>
                        </tr>
                    </thead>
                    <tbody class="bg-white divide-y divide-gray-200">`;

        const metricOrder = [
            "Pendapatan (Revenue)", "Harga Pokok Produksi", "Laba Kotor (Gross Profit)",
            "Beban Operasional (OPEX)", "Pendapatan Bersih Operasional (Net Operating Income)",
            "Beban Non Operasional", "Pendapatan Bersih Sebelum Deprisiasi/Amortisasi, Bunga & Pajak (EBITDA)",
            "Depresiasi/ Amortisasi", "Bunga", "Pajak (PB1)", "Pendapatan Bersih (Net Income)"
        ];

        metricOrder.forEach(metric => {
            const targetRevenue = targets['Pendapatan (Revenue)'];
            let targetValue = 0;

            if (targetRevenue) {
                if (metric === 'Pendapatan (Revenue)') {
                    targetValue = targetRevenue;
                } else if (targets[metric] !== undefined) {
                    targetValue = targetRevenue * targets[metric];
                }
            }

            const actualValue = actualValues[metric] || 0;
            const achievement = targetValue > 0 ? (actualValue / targetValue) * 100 : 0;
            const isCost = metric.toLowerCase().includes('beban') || metric.toLowerCase().includes('harga pokok');

            const change = actualValue - targetValue;
            let percentageChangeText = 'N/A';
            if (targetValue !== 0) {
                const percentage = (change / targetValue) * 100;
                percentageChangeText = `${percentage >= 0 ? '+' : ''}${percentage.toFixed(1)}%`;
            } else if (change !== 0) {
                percentageChangeText = 'New';
            }

            let changeColor = 'text-gray-500';
            if (change > 0) changeColor = isCost ? 'text-red-600' : 'text-green-600';
            if (change < 0) changeColor = isCost ? 'text-green-600' : 'text-red-600';

            tableHtml += `
                <tr>
                    <td class="px-6 py-4 text-sm font-medium text-gray-900">${metric}</td>
                    <td class="px-6 py-4 text-sm text-gray-500 text-right font-mono">${formatCurrency(targetValue)}</td>
                    <td class="px-6 py-4 text-sm text-gray-500 text-right font-mono">${formatCurrency(actualValue)}</td>
                    <td class="px-6 py-4 text-sm text-center font-semibold ${changeColor}">${percentageChangeText}</td>
                    <td class="px-6 py-4 text-sm text-gray-500">

                        <div class="flex items-center hidden">
                            <div class="w-full bg-gray-200 rounded-full h-2.5 mr-2">
                                <div class="bg-blue-600 h-2.5 rounded-full" style="width: ${Math.min(achievement, 100)}%"></div>
                            </div>
                            <span class="font-semibold">${achievement.toFixed(1)}%</span>
                        </div>

                    </td>
                </tr>`;
        });

        tableHtml += `</tbody></table></div>`;
        bodyEl.innerHTML = tableHtml;

    } catch (error) {
        console.error("Error processing P&L target view:", error);
        bodyEl.innerHTML = `<p class="text-center text-red-500">Error: Could not display P&L target comparison. ${error.message}</p>`;
    }
}


/**
 * Generates all charts for the new "Analisa Penjualan" section.
 * It reuses existing chart logic and targets new canvas elements.
 */
function generateAnalisaPenjualanCharts(summaries: any[]) {
    // --- Chart 1: Penjualan Per Channel (Visit Purpose) ---
    const channelSales = summaries.reduce((acc, s) => {
        if (s.revenueByVisitPurpose) {
            for (const channel in s.revenueByVisitPurpose) {
                acc[channel] = (acc[channel] || 0) + s.revenueByVisitPurpose[channel];
            }
        }
        return acc;
    }, {});

    createChart('penjualan-channel-chart-new', 'doughnut', {
        labels: Object.keys(channelSales),
        datasets: [{
            data: Object.values(channelSales),
            backgroundColor: ['#3B82F6', '#10B981', '#F97316', '#8B5CF6', '#EC4899', '#F59E0B'],
        }],
    });

    // --- START: NEW CHART ADDED ---

    // --- Chart 2: Perbandingan Omzet & Total Check per Cabang ---
    const branchStats = summaries.reduce((acc, s) => {
        // Aggregate revenue from each summary
        if (s.revenueByBranch) {
            for (const branchName in s.revenueByBranch) {
                if (!acc[branchName]) acc[branchName] = { revenue: 0, checks: 0 };
                acc[branchName].revenue += s.revenueByBranch[branchName];
            }
        }
        // Aggregate transaction counts from each summary
        if (s.transactionCountsByBranch) {
            for (const branchName in s.transactionCountsByBranch) {
                if (!acc[branchName]) acc[branchName] = { revenue: 0, checks: 0 };
                acc[branchName].checks += s.transactionCountsByBranch[branchName];
            }
        }
        return acc;
    }, {});

    const processedStats = Object.entries(branchStats).map(([name, stats]) => ({
        name,
        totalRevenue: (stats as any).revenue,
        totalCheck: (stats as any).checks
    }));

    // Sort by revenue to show the highest-performing branches first
    const sortedByRevenue = [...processedStats].toSorted((a, b) => b.totalRevenue - a.totalRevenue);
    const labels = sortedByRevenue.map((s) => s.name);

    createChart('omzet-vs-check-cabang-chart-new', 'bar', {
        labels,
        datasets: [
            {
                type: 'bar',
                label: 'Total Omzet',
                data: sortedByRevenue.map((s) => s.totalRevenue),
                backgroundColor: '#4F46E5',
                yAxisID: 'y-omzet',
            },
            {
                type: 'line',
                label: 'Total Check',
                data: sortedByRevenue.map((s) => s.totalCheck),
                borderColor: '#F97316',
                yAxisID: 'y-check',
                tension: 0.1
            },
        ],
    }, {
        scales: {
            'y-omzet': {
                type: 'linear',
                position: 'left',
                title: { display: true, text: 'Total Omzet (Rp)' },
                ticks: { callback: shortenCurrency }
            },
            'y-check': {
                type: 'linear',
                position: 'right',
                title: { display: true, text: 'Total Check' },
                grid: { drawOnChartArea: false }, // Avoid cluttering with two sets of grid lines
                ticks: { callback: shortenNumber }
            },
        },
    });

    // --- END: NEW CHART ADDED ---

    // --- Data Aggregation for Category and Top 5 Charts ---
    const aggregatedData = summaries.reduce((acc, s) => {
        if (s.menuCategories) {
            for (const category in s.menuCategories) {
                acc.categoryQuantities[category] = (acc.categoryQuantities[category] || 0) + s.menuCategories[category].quantity;
            }
        }
        if (s.menuItemQuantities) {
            for (const category in s.menuItemQuantities) {
                if (!acc.itemQuantities[category]) acc.itemQuantities[category] = {};
                for (const menu in s.menuItemQuantities[category]) {
                    acc.itemQuantities[category][menu] = (acc.itemQuantities[category][menu] || 0) + s.menuItemQuantities[category][menu];
                }
            }
        }
        return acc;
    }, { categoryQuantities: {}, itemQuantities: {} });

    // --- Chart 3: Order by Menu Category ---
    createChart('order-by-menu-category-chart-new', 'doughnut', {
        labels: Object.keys(aggregatedData.categoryQuantities),
        datasets: [{
            data: Object.values(aggregatedData.categoryQuantities),
            backgroundColor: ['#10B981', '#3B82F6', '#F97316', '#8B5CF6', '#EC4899', '#F59E0B']
        }],
    });

    // --- Chart 4 & 5: Top 5 Makanan & Minuman ---
    const createTop5Chart = (containerId: string, categoryName: string, color: string) => {
        const categoryItems = aggregatedData.itemQuantities[categoryName] || {};
        const top5 = Object.entries(categoryItems)
            .filter(item => !item[0].includes('(PACKAGE)'))
            .toSorted((a, b) => (b[1] as number) - (a[1] as number))
            .slice(0, 5);

        if (top5.length > 0) {
            createChart(containerId, 'bar', {
                labels: top5.map(item => item[0]),
                datasets: [{
                    label: 'Quantity Sold',
                    data: top5.map(item => item[1]),
                    backgroundColor: color,
                }],
            }, { indexAxis: 'y', plugins: { legend: { display: false } } });
        }
    };

    createTop5Chart('top-makanan-chart-new', 'MAKANAN', '#EF4444');
    createTop5Chart('top-minuman-chart-new', 'MINUMAN', '#3B82F6');
}

/**
 * Generates a dual-axis line chart showing the trend of Total Check (TC)
 * and Average Per Check (APC) over the last 24 months.
 */
function generate24MonthTcApcTrend(summaries: any[]) {
    if (summaries.length === 0) return;

    // 1. Define the 24-month date range
    const latestDate = summaries.reduce((max, s) => s.date > max ? s.date : max, summaries[0].date);
    const endDate = new Date(latestDate);
    const startDate = new Date(latestDate);
    startDate.setMonth(startDate.getMonth() - 23); // Go back 23 months to get a total of 24
    startDate.setDate(1); // Start from the beginning of that month

    // 2. Filter summaries to only include data within this range
    const filteredSummaries = summaries.filter(s => s.date >= startDate && s.date <= endDate);

    // 3. Aggregate data by month (YYYY-MM)
    const monthlyData = filteredSummaries.reduce((acc, s) => {
        const monthKey = s.date.toISOString().slice(0, 7);
        if (!acc[monthKey]) {
            acc[monthKey] = { revenue: 0, transactions: 0 };
        }
        acc[monthKey].revenue += s.totalOmzet;
        acc[monthKey].transactions += s.totalTransactions;
        return acc;
    }, {});

    // 4. Prepare data for the chart
    const sortedMonths = Object.keys(monthlyData).toSorted();
    const tcData = sortedMonths.map(month => monthlyData[month].transactions);
    const apcData = sortedMonths.map(month => {
        const monthStats = monthlyData[month];
        return monthStats.transactions > 0 ? monthStats.revenue / monthStats.transactions : 0;
    });

    const chartLabels = sortedMonths.map(monthStr => {
        const date = new Date(monthStr + '-02'); // Use day 2 to avoid timezone issues
        return date.toLocaleString('default', { month: 'short', year: '2-digit' });
    });

    $store.setChartDataForAIProperty('tcApc24Month', {
        period: "Last 24 Months",
        trends: sortedMonths.map((month, i) => ({ month, total_check: tcData[i], average_check: apcData[i] }))
    });

    // 5. Create the dual-axis line chart
    createChart('tc-apc-24-bulan-chart', 'line', {
        labels: chartLabels,
        datasets: [
            {
                label: 'Total Check (TC)',
                data: tcData,
                borderColor: '#3B82F6',
                yAxisID: 'y-tc',
                tension: 0.1
            },
            {
                label: 'Average Check (APC)',
                data: apcData,
                borderColor: '#F97316',
                yAxisID: 'y-apc',
                tension: 0.1
            }
        ]
    }, {
        scales: {
            'y-tc': {
                type: 'linear',
                position: 'left',
                title: { display: true, text: 'Total Check' },
                ticks: { callback: shortenNumber }
            },
            'y-apc': {
                type: 'linear',
                position: 'right',
                title: { display: true, text: 'Average Check (Rp)' },
                grid: { drawOnChartArea: false },
                ticks: { callback: shortenCurrency }
            }
        }
    });
}

/**
 * Draws the 24-month menu trend chart based on the current dropdown selection.
 */
function draw24MonthMenuTrendChart(summaries: any[]) {
    const menuSelect = $store.getUIComponent('menuTrend24MonthSelect');
    if (!menuSelect) return;

    const selectedMenus = menuSelect.getSelected() as string[];

    // --- MODIFICATION START ---
    // 1. Get all unique months that have data, sort them chronologically,
    //    and take only the last 24 months. This creates a rolling window.
    const uniqueMonthsWithData = [...new Set(summaries.map(s => s.date.toISOString().slice(0, 7)))];
    const allMonthLabels = uniqueMonthsWithData.toSorted().slice(-24);
    // --- MODIFICATION END ---

    const chartLabels = allMonthLabels.map(monthStr => {
        const date = new Date(monthStr + '-02'); // Use day 2 to avoid timezone issues
        return date.toLocaleString('default', { month: 'short', year: '2-digit' });
    });

    // 2. Create a dataset for each selected menu item
    const datasets = selectedMenus.map((menuName, index) => {
        const monthlyQuantities = Array(allMonthLabels.length).fill(0);

        summaries.forEach(s => {
            const monthKey = s.date.toISOString().slice(0, 7);
            const monthIndex = allMonthLabels.indexOf(monthKey);

            if (monthIndex > -1 && s.menuItemQuantities) {
                for (const category in s.menuItemQuantities) {
                    if (s.menuItemQuantities[category][menuName]) {
                        monthlyQuantities[monthIndex] += s.menuItemQuantities[category][menuName];
                    }
                }
            }
        });

        const colors = ['#3B82F6', '#10B981', '#F97316', '#8B5CF6', '#EF4444', '#F59E0B'];
        return {
            label: menuName,
            data: monthlyQuantities,
            borderColor: colors[index % colors.length],
            tension: 0.1,
            fill: false,
        };
    });

    $store.setChartDataForAIProperty('menuTrend24Month', {
        period: "Last 24 available months",
        selected_menus: selectedMenus,
        trends: datasets.map(ds => ({ menu: ds.label, monthly_quantity: ds.data }))
    });

    createChart('menu-trend-24-bulan-chart', 'line', {
        labels: chartLabels,
        datasets: datasets
    });
}

/**
 * Sets up the multi-select dropdown for the 24-month menu trend chart.
 */
function setup24MonthMenuTrendChart(summaries: any[]) {
    const existingSelect = $store.getUIComponent('menuTrend24MonthSelect');
    if (existingSelect) {
        draw24MonthMenuTrendChart(summaries);
        return;
    }

    const selectEl = document.getElementById('menu-trend-24-bulan-select') as HTMLSelectElement;

    // 1. Get all unique, non-package menu items and their total quantities
    const allItems = summaries.reduce((acc, s) => {
        if (s.menuItemQuantities) {
            for (const category in s.menuItemQuantities) {
                for (const menuName in s.menuItemQuantities[category]) {
                    if (!menuName.includes('(PACKAGE)')) {
                        acc[menuName] = (acc[menuName] || 0) + s.menuItemQuantities[category][menuName];
                    }
                }
            }
        }
        return acc;
    }, {});

    if (Object.keys(allItems).length === 0) {
        selectEl.innerHTML = '<option disabled>No menu data available</option>';
        return;
    }

    // 2. Sort items by total quantity to find the most popular ones for the default selection
    const sortedItems = Object.entries(allItems).toSorted((a, b) => (b[1] as number) - (a[1] as number));

    // 3. Populate the select element
    selectEl.innerHTML = sortedItems.map(item => `<option value="${item[0]}">${item[0]}</option>`).join('');

    // 4. Set a default selection of the top 5 most popular items
    const top5Items = sortedItems.slice(0, 5).map(item => item[0]);

    // 5. Initialize Slim Select
    // Store menuTrend24MonthSelect instance for cleanup on view reset
    $store.setUIComponent(
      'menuTrend24MonthSelect',
      new SlimSelect({
        select: '#menu-trend-24-bulan-select',
        settings: { placeholderText: 'Select menus...' },
        events: {
            afterChange: () => {
                draw24MonthMenuTrendChart($store.getAllSalesData()); // Use global data to ensure it's always up-to-date
            }
        }
      }),
      ($select) => $select.setSelected(top5Items),
    );
}

/**
 * Generates a stacked area chart showing the sales contribution of each channel
 * over the last 24 available months.
 */
function generate24MonthChannelTrendChart(summaries: any[]) {
    if (summaries.length === 0) return;

    // 1. Get the last 24 months that have data
    const uniqueMonthsWithData = [...new Set(summaries.map(s => s.date.toISOString().slice(0, 7)))];
    const allMonthLabels = uniqueMonthsWithData.toSorted().slice(-24);

    // 2. Get all unique channels across the entire dataset
    const channels = [...new Set(summaries.flatMap(s => Object.keys(s.revenueByVisitPurpose || {})))];

    // 3. Aggregate monthly revenue for each channel
    const channelData = {};
    channels.forEach(ch => {
        channelData[ch] = Array(allMonthLabels.length).fill(0);
    });

    summaries.forEach(s => {
        const monthKey = s.date.toISOString().slice(0, 7);
        const monthIndex = allMonthLabels.indexOf(monthKey);
        if (monthIndex > -1 && s.revenueByVisitPurpose) {
            for (const channel in s.revenueByVisitPurpose) {
                if (channelData[channel]) {
                    channelData[channel][monthIndex] += s.revenueByVisitPurpose[channel];
                }
            }
        }
    });

    const chartLabels = allMonthLabels.map(monthStr => {
        const date = new Date(monthStr + '-02');
        return date.toLocaleString('default', { month: 'short', year: '2-digit' });
    });

    $store.setChartDataForAIProperty('channelTrend24Month', {
        period: "Last 24 available months",
        trends: channels.map(ch => ({ channel: ch, monthly_revenue: channelData[ch] }))
    });

    // 4. Create datasets for the stacked area chart
    const datasets = channels.map((channel, index) => {
        const colors = ['#3B82F6', '#10B981', '#F97316', '#8B5CF6', '#EF4444', '#F59E0B'];
        return {
            label: channel,
            data: channelData[channel],
            borderColor: colors[index % colors.length],
            backgroundColor: colors[index % colors.length] + '80', // Add alpha for fill
            fill: true, // This makes it an area chart
            tension: 0.2,
        };
    });

    createChart('channel-trend-24-bulan-chart', 'line', {
        labels: chartLabels,
        datasets: datasets
    }, {
        scales: {
            y: {
                stacked: true, // This stacks the datasets
                ticks: { callback: shortenCurrency }
            }
        }
    });
}

/**
 * Generates a stacked area chart showing the quantity contribution of each menu category
 * over the last 24 available months.
 */
function generate24MonthCategoryTrendChart(summaries: any[]) {
    if (summaries.length === 0) return;

    // 1. Get the last 24 months that have data
    const uniqueMonthsWithData = [...new Set(summaries.map(s => s.date.toISOString().slice(0, 7)))];
    const allMonthLabels = uniqueMonthsWithData.toSorted().slice(-24);

    // 2. Get all unique menu categories
    const categories = [...new Set(summaries.flatMap(s => Object.keys(s.menuCategories || {})))];

    // 3. Aggregate monthly quantity for each category
    const categoryData = {};
    categories.forEach(cat => {
        categoryData[cat] = Array(allMonthLabels.length).fill(0);
    });

    summaries.forEach(s => {
        const monthKey = s.date.toISOString().slice(0, 7);
        const monthIndex = allMonthLabels.indexOf(monthKey);
        if (monthIndex > -1 && s.menuCategories) {
            for (const category in s.menuCategories) {
                if (categoryData[category]) {
                    // We aggregate by quantity for this chart
                    categoryData[category][monthIndex] += s.menuCategories[category].quantity;
                }
            }
        }
    });

    const chartLabels = allMonthLabels.map(monthStr => {
        const date = new Date(monthStr + '-02');
        return date.toLocaleString('default', { month: 'short', year: '2-digit' });
    });

    $store.setChartDataForAIProperty('categoryTrend24Month', {
        period: "Last 24 available months",
        trends: categories.map(cat => ({ category: cat, monthly_quantity: categoryData[cat] }))
    });

    // 4. Create datasets for the stacked area chart
    const datasets = categories.map((category, index) => {
        const colors = ['#3B82F6', '#10B981', '#F97316', '#8B5CF6', '#EF4444', '#F59E0B'];
        return {
            label: category,
            data: categoryData[category],
            borderColor: colors[index % colors.length],
            backgroundColor: colors[index % colors.length] + '80', // Add alpha for fill
            fill: true,
            tension: 0.2,
        };
    });

    createChart('category-trend-24-bulan-chart', 'line', {
        labels: chartLabels,
        datasets: datasets
    }, {
        scales: {
            y: {
                stacked: true, // This stacks the datasets
                ticks: { callback: shortenNumber } // Use number formatter for quantity
            }
        }
    });
}

async function generateGeneralPenjualanSection() {
    const branchSelect = document.getElementById('general-penjualan-branch-select') as HTMLSelectElement;
    const startDateInput = document.getElementById('general-penjualan-start-date') as HTMLInputElement;
    const endDateInput = document.getElementById('general-penjualan-end-date') as HTMLInputElement;

    const selectedBranch = branchSelect.value;
    const startDate = new Date(startDateInput.value);
    const endDate = new Date(endDateInput.value);
    endDate.setHours(23, 59, 59, 999); // Ensure the full end day is included

    if (!selectedBranch || !startDateInput.value || !endDateInput.value) {
        destroyCharts();
        return;
    }

      $store.setConfigValue('activeSalesTarget', {}); // Reset before fetching
    if (selectedBranch && selectedBranch !== 'ALL') {
        const period = endDate.toISOString().slice(0, 7); // Get period from the selected end date
        const safeBranchName = selectedBranch.replace(/\s+/g, '_');
        const targetDocId = `${period}_${safeBranchName}`;

        try {
            const targetDocRef = doc(db, `users/${currentUser.uid}/monthlySalesTargets`, targetDocId);
            const targetDocSnap = await getDoc(targetDocRef);
            if (targetDocSnap.exists()) {
                $store.setConfigValue('activeSalesTarget', targetDocSnap.data().targets || {});
            }
        } catch (error) {
            console.error("Could not fetch sales target for the period:", error);
        }
    }

    // Filter data based on the new date range selector
    let currentData = $store.getAllSalesData().filter(s => s.date >= startDate && s.date <= endDate);

    if (selectedBranch !== 'ALL') {
        currentData = currentData.filter(s => s.branches.includes(selectedBranch));
    }

    // Since comparison is removed, we pass an empty array for the 'lastPeriodData'.
    // This will still display the main KPI values but will not show any growth percentages.
    generateRingkasanFromSummaries(currentData, [], {
        omzet: 'general-total-omzet',
        check: 'general-total-check',
        avgCheck: 'general-avg-check',
        omzetGrowth: 'general-omzet-growth',
        checkGrowth: 'general-check-growth',
        avgCheckGrowth: 'general-avg-check-growth'
    });

    // PHASE 1: Replace raw data storage with minimal view context
    $store.setActiveViewData('general-penjualan', {
        viewContext: {
            selectedBranch,
            dateRange: `${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`,
            totalRecordsAnalyzed: currentData.length,
            dataSource: "Sales transaction summaries and daily aggregations",
            filtersApplied: { selectedBranch, startDate, endDate },
            salesTargetActive: Object.keys($store.getConfigValue('activeSalesTarget')).length > 0,
            salesTargetDescription: Object.keys($store.getConfigValue('activeSalesTarget')).length > 0
                ? `Monthly sales targets loaded for ${selectedBranch}`
                : "No sales targets configured for this period"
        }
    }, { selectedBranch, startDate, endDate });

    // The rest of the chart functions are called as before, but with the new filtered data
    generateOmzetHarianChartFromSummaries(currentData, 'general-omzet-harian-chart');
    generateOmzetMingguanChartFromSummaries(currentData, 'general-omzet-mingguan-chart', 'line');
    generateTcApcHarianChartFromSummaries(currentData, 'general-tc-apc-chart');
    generateDailyOmzetHeatmapFromSummaries(currentData, 'general-heatmap-harian-container');
    generateOmzetHeatmapFromSummaries(currentData, 'general-heatmap-jam-hari-container');
    generateSalesTrendHourlyDailyChartFromSummaries(currentData, 'general-sales-trend-chart');

}

/**
 * Generates an "Order by Menu Category" doughnut chart.
 */
function generateOrderByCategoryDonutChart(summaries: any[], canvasId: string) {
    const byMenuCategory = summaries.reduce((acc, s) => {
        if (s.menuCategories) {
            for (const category in s.menuCategories) {
                acc[category] = (acc[category] || 0) + s.menuCategories[category].quantity;
            }
        }
        return acc;
    }, {});

    createChart(canvasId, 'doughnut', {
        labels: Object.keys(byMenuCategory),
        datasets: [{ data: Object.values(byMenuCategory), backgroundColor: ['#10B981', '#3B82F6', '#F97316', '#8B5CF6'] }],
    });
}

/**
 * Generates a "Top 5" doughnut chart for a specific menu category (e.g., MAKANAN).
 * It groups the remaining items into an "Others" slice.
 */
function generateTopItemsDonutChart(summaries: any[], canvasId: string, categoryName: string) {
    const allItems = summaries.reduce((acc, s) => {
        if (s.menuItemQuantities && s.menuItemQuantities[categoryName]) {
            for (const menuName in s.menuItemQuantities[categoryName]) {
                if (!menuName.includes('(PACKAGE)')) {
                    acc[menuName] = (acc[menuName] || 0) + s.menuItemQuantities[categoryName][menuName];
                }
            }
        }
        return acc;
    }, {});

    const sortedItems = Object.entries(allItems).toSorted((a, b) => (b[1] as number) - (a[1] as number));

    const top5 = sortedItems.slice(0, 5);
    const othersCount = sortedItems.slice(5).reduce((sum, item) => sum + (item[1] as number), 0);

    const labels = top5.map(item => item[0]);
    const data = top5.map(item => item[1]);

    if (othersCount > 0) {
        labels.push('Others');
        data.push(othersCount);
    }

    createChart(canvasId, 'doughnut', {
        labels,
        datasets: [{ data, backgroundColor: ['#3B82F6', '#10B981', '#F97316', '#8B5CF6', '#EF4444', '#9CA3AF'] }]
    });
}

/**
 * New orchestrator function for the "Aspek Produk dan Channel" section.
 */
function generateGeneralProdukChannelSection(summaries: any[]) {
    const branchSelect = document.getElementById('general-produk-channel-branch-select') as HTMLSelectElement;
    const selectedBranch = branchSelect?.value;

    let filteredSummaries = summaries;

    // If a specific branch is selected, filter the summaries further
    if (selectedBranch && selectedBranch !== 'ALL') {
        filteredSummaries = summaries.filter(s => s.branches.includes(selectedBranch));
    }

    // Now, generate all charts using the correctly filtered data
    setupGeneralMenuTrendChart(filteredSummaries, 'general-menu-trend-select', 'general-menu-trend-chart');
    generatePenjualanChannelChartFromSummaries(filteredSummaries, 'general-channel-donut-chart', 'doughnut');
    generateOrderByCategoryDonutChart(filteredSummaries, 'general-category-donut-chart');
    generateTopItemsDonutChart(filteredSummaries, 'general-top-makanan-donut-chart', 'MAKANAN');
    generateTopItemsDonutChart(filteredSummaries, 'general-top-minuman-donut-chart', 'MINUMAN');

    $store.setActiveViewData('general-produk-channel', filteredSummaries, { selectedBranch });
}


/**
 * Orchestrator for the "Analisis Perbandingan Waktu > Aspek Keuangan" section.
 */
async function generateWaktuKeuanganSection() {
    if (!currentUser) return;
    const periodA = (document.getElementById('waktu-keuangan-period-a') as HTMLSelectElement).value;
    const periodB = (document.getElementById('waktu-keuangan-period-b') as HTMLSelectElement).value;
    const selectedBranch = (document.getElementById('waktu-keuangan-branch-select') as HTMLSelectElement).value;

    if (!periodA || !periodB) return;

    showLoading({ message: 'Fetching P&L data for comparison...', value: 30 });

    // This function will now query all P&L reports and then filter by branch on the client-side.
    // This is necessary because the document ID is now a composite key.
    const pnlReportsRef = collection(db, `users/${currentUser.uid}/pnlReports`);
    const reportsSnap = await getDocs(pnlReportsRef);
    const allReports = reportsSnap.docs.map(doc => doc.data());

    const findReport = (period, branch) => {
        if (branch === 'ALL') {
            // Logic to aggregate all reports for a period if "All Branches" is selected.
            // For now, this is a placeholder. A full implementation would sum up all branches.
            return allReports.find(r => r.period === period);
        }
        return allReports.find(r => r.period === period && r.branchName === branch);
    };

    const reportA = findReport(periodA, selectedBranch);
    const reportB = findReport(periodB, selectedBranch);

    generatePnlComparisonTable(reportA, reportB, 'waktu-pnl-comparison-container');
    generateRatioComparisonChart(reportA, reportB, { canvasId: 'waktu-cogs-comparison-chart', metric: 'Harga Pokok Produksi', title: 'COGS' });
    generateRatioComparisonChart(reportA, reportB, { canvasId: 'waktu-gpm-comparison-chart', metric: 'Laba Kotor (Gross Profit)', title: 'Gross Profit' });
    generateRatioComparisonChart(reportA, reportB, { canvasId: 'waktu-hr-comparison-chart', metric: 'Beban Operasional (OPEX)', title: 'OPEX' });
    generateRatioComparisonChart(reportA, reportB, { canvasId: 'waktu-npm-comparison-chart', metric: 'Pendapatan Bersih (Net Income)', title: 'Net Income' });

    $store.setActiveViewData('waktu-keuangan', { reportA, reportB }, { periodA, periodB, selectedBranch });

    hideLoading();
}

/**
 * Sets up the period selectors for the "Waktu > Keuangan" section.
 */
async function setupWaktuKeuanganPeriodSelectors() {
    if ($store.getInitFlag('waktuKeuanganSelectorsInitialized')) return;
    const selectA = document.getElementById('waktu-keuangan-period-a') as HTMLSelectElement;
    const selectB = document.getElementById('waktu-keuangan-period-b') as HTMLSelectElement;
    const branchSelect = document.getElementById('waktu-keuangan-branch-select') as HTMLSelectElement;

    const reportsRef = collection(db, `users/${currentUser.uid}/pnlReports`);
    const reportsSnap = await getDocs(reportsRef);

    const periods = [...new Set(reportsSnap.docs.map(doc => doc.data().period))].toSorted().reverse();
    const branches = [...new Set(reportsSnap.docs.map(doc => doc.data().branchName))].toSorted();

    if (periods.length < 2 || branches.length === 0) {
        selectA.innerHTML = '<option>Not enough data</option>';
        selectB.innerHTML = '<option>Not enough data</option>';
        branchSelect.innerHTML = '<option>No branches found</option>';
        return;
    }

    const periodOptionsHtml = periods.map(p => `<option value="${p}">${new Date(p + '-02').toLocaleString('default', { month: 'long', year: 'numeric' })}</option>`).join('');
    selectA.innerHTML = periodOptionsHtml;
    selectB.innerHTML = periodOptionsHtml;

    branchSelect.innerHTML = branches.map(b => `<option value="${b}">${b}</option>`).join('');

    selectA.value = periods[1];
    selectB.value = periods[0];
    branchSelect.value = branches[0];

    const handler = () => generateWaktuKeuanganSection();
    selectA.addEventListener('change', handler);
    selectB.addEventListener('change', handler);
    branchSelect.addEventListener('change', handler);

    $store.setInitFlag('waktuKeuanganSelectorsInitialized', true);

    generateWaktuKeuanganSection();
}

// Add this entire new function to your main.ts file

/**
 * Updates the Period A and Period B selectors based on the selected branch.
 * @param {string} selectedBranch - The name of the branch that was selected.
 */
async function updatePeriodSelectorsForBranch(selectedBranch: string) {
    if (!currentUser) return;
    const selectA = document.getElementById('waktu-keuangan-period-a') as HTMLSelectElement;
    const selectB = document.getElementById('waktu-keuangan-period-b') as HTMLSelectElement;
    const container = document.getElementById('waktu-pnl-comparison-container');

    selectA.innerHTML = '<option>Loading periods...</option>';
    selectB.innerHTML = '<option>Loading periods...</option>';

    const pnlReportsRef = collection(db, `users/${currentUser.uid}/pnlReports`);
    // Create a query to find all P&L reports for the selected branch
    const q = query(pnlReportsRef, where("branchName", "==", selectedBranch));
    const reportsSnap = await getDocs(q);

    const periods = reportsSnap.docs
        .map(doc => doc.data().period)
        .filter(Boolean) // Remove any null/undefined periods
        .toSorted()
        .reverse(); // Show most recent first

    // If there aren't at least 2 periods, we can't do a comparison
    if (periods.length < 2) {
        selectA.innerHTML = '<option>Not enough data for comparison</option>';
        selectB.innerHTML = '<option>Not enough data for comparison</option>';
        // Clear out any old charts or tables
        if (container) container.innerHTML = '<p class="text-gray-500 p-4 text-center">This branch does not have enough P&L reports to compare.</p>';
        // You might want to clear the charts here as well
        Object.values($store.getCharts()).forEach(chart => {
            if (chart.canvas.id.startsWith('waktu-')) chart.destroy();
        });
        return;
    }

    // Populate the period selectors with the filtered list of periods
    const periodOptionsHtml = periods.map(p => `<option value="${p}">${new Date(p + '-02').toLocaleString('default', { month: 'long', year: 'numeric' })}</option>`).join('');
    selectA.innerHTML = periodOptionsHtml;
    selectB.innerHTML = periodOptionsHtml;

    // Set default values (e.g., the two most recent periods)
    selectA.value = periods[1];
    selectB.value = periods[0];

    // Finally, trigger the chart and table generation with the new valid selections
    await generateWaktuKeuanganSection();
}

/**
 * Orchestrator for the "Analisis Perbandingan Waktu > Aspek Produk dan Channel" section.
 */
function generateWaktuProdukChannelSection() {
    if (!currentUser) return;
    const periodA = (document.getElementById('waktu-produk-period-a') as HTMLSelectElement).value;
    const periodB = (document.getElementById('waktu-produk-period-b') as HTMLSelectElement).value;
    const selectedBranch = (document.getElementById('waktu-produk-branch-select') as HTMLSelectElement).value;

    if (!periodA || !periodB || !selectedBranch) return;

    const branchData = $store.getAllSalesData().filter(s => s.branches.includes(selectedBranch));
    const periodAData = branchData.filter(s => s.date.toISOString().startsWith(periodA));
    const periodBData = branchData.filter(s => s.date.toISOString().startsWith(periodB));

    setupWaktuMenuTrendChart(periodAData, periodBData);
    generateCategoryComparisonChart(periodAData, periodBData, 'waktu-category-comparison-chart');
    generateChannelComparisonChart(periodAData, periodBData, 'waktu-channel-comparison-chart');

    $store.setActiveViewData('waktu-produk-channel', { periodAData, periodBData }, { periodA, periodB, selectedBranch });
}


async function updatePeriodSelectorsForGeneralKeuangan(selectedBranch: string) {
    if (!currentUser) return;
    const periodSelect = document.getElementById('general-keuangan-period-select') as HTMLSelectElement;

    periodSelect.innerHTML = '<option>Loading periods...</option>';

    const pnlReportsRef = collection(db, `users/${currentUser.uid}/pnlReports`);
    const q = query(pnlReportsRef, where("branchName", "==", selectedBranch));
    const reportsSnap = await getDocs(q);

    const periods = reportsSnap.docs
        .map(doc => doc.data().period)
        .filter(Boolean)
        .toSorted()
        .reverse();

    if (periods.length === 0) {
        periodSelect.innerHTML = '<option>No P&L data for this branch</option>';
        return;
    }

    const periodOptionsHtml = periods.map(p => `<option value="${p}">${new Date(p + '-02').toLocaleString('default', { month: 'long', year: 'numeric' })}</option>`).join('');
    periodSelect.innerHTML = periodOptionsHtml;
    periodSelect.value = periods[0];

    await generateGeneralKeuanganSection();
}

async function updatePeriodSelectorsForProdukChannel(selectedBranch: string) {
    const selectA = document.getElementById('waktu-produk-period-a') as HTMLSelectElement;
    const selectB = document.getElementById('waktu-produk-period-b') as HTMLSelectElement;

    const branchData = $store.getAllSalesData().filter(s => s.branches.includes(selectedBranch));
    const periods = [...new Set(branchData.map(s => s.date.toISOString().slice(0, 7)))].toSorted().reverse();

    if (periods.length < 2) {
        selectA.innerHTML = '<option>Not enough data for comparison</option>';
        selectB.innerHTML = '<option>Not enough data for comparison</option>';
        return;
    }

    const periodOptionsHtml = periods.map(p => `<option value="${p}">${new Date(p + '-02').toLocaleString('default', { month: 'long', year: 'numeric' })}</option>`).join('');
    selectA.innerHTML = periodOptionsHtml;
    selectB.innerHTML = periodOptionsHtml;

    selectA.value = periods[1];
    selectB.value = periods[0];

    await generateWaktuProdukChannelSection();
}

async function setupWaktuProdukChannelSelectors() {
    if ($store.getInitFlag('waktuProdukChannelSelectorsInitialized')) return;
    if (!currentUser) return;

    const selectA = document.getElementById('waktu-produk-period-a') as HTMLSelectElement;
    const selectB = document.getElementById('waktu-produk-period-b') as HTMLSelectElement;
    const branchSelect = document.getElementById('waktu-produk-branch-select') as HTMLSelectElement;

    const branches = [...new Set($store.getAllSalesData().flatMap(s => s.branches))].toSorted();

    if (branches.length === 0) {
        branchSelect.innerHTML = '<option>No branches found</option>';
        return;
    }

    branchSelect.innerHTML = branches.map(b => `<option value="${b}">${b}</option>`).join('');
    branchSelect.value = branches[0];

    selectA.addEventListener('change', () => generateWaktuProdukChannelSection());
    selectB.addEventListener('change', () => generateWaktuProdukChannelSection());
    branchSelect.addEventListener('change', async () => {
        await updatePeriodSelectorsForProdukChannel(branchSelect.value);
    });

    $store.setInitFlag('waktuProdukChannelSelectorsInitialized', true);

    await updatePeriodSelectorsForProdukChannel(branches[0]);
}


/**
 * Sets up the interactive menu trend chart for comparing two periods.
 */
function setupWaktuMenuTrendChart(periodAData: any[], periodBData: any[]) {
    const existingSelect = $store.getUIComponent('waktuMenuTrendSelect');
    if (existingSelect) {
        existingSelect.destroy(); // Destroy old instance to repopulate options
    }
    const selectEl = document.getElementById('waktu-menu-trend-select') as HTMLSelectElement;
    const combinedData = [...periodAData, ...periodBData];
    const allMenuItems = [...new Set(combinedData.flatMap(s => Object.keys(s.menuItemQuantities || {}).flatMap(cat => Object.keys(s.menuItemQuantities[cat]))))].toSorted();

    selectEl.innerHTML = allMenuItems.map(name => `<option value="${name}">${name}</option>`).join('');

    // Store waktuMenuTrendSelect instance for cleanup on view reset
    $store.setUIComponent(
      'waktuMenuTrendSelect',
      new SlimSelect({
        select: '#waktu-menu-trend-select',
        events: { afterChange: () => drawWaktuMenuTrendChart(periodAData, periodBData) }
      }),
      ($select) => $select.setSelected(allMenuItems.slice(0, 3)),
    );
}

/**
 * Draws the menu trend comparison chart.
 */
function drawWaktuMenuTrendChart(periodAData: any[], periodBData: any[]) {
    const waktuMenuSelect = $store.getUIComponent('waktuMenuTrendSelect');
    if (!waktuMenuSelect) return;

    const selectedMenus = waktuMenuSelect.getSelected() as string[];
    const labels = Array.from({ length: 31 }, (_, i) => i + 1); // Days 1-31
    const colors = ['#3B82F6', '#10B981', '#F97316', '#8B5CF6', '#EF4444'];

    // Helper function to get daily sales quantity for a specific menu
    const getDailyMenuData = (data, menuName) => {
        const dailyQuantities = Array(31).fill(null);
        const menuData = data.filter(s => {
            // Check if the menu exists in any category for this summary
            return s.menuItemQuantities && Object.values(s.menuItemQuantities).some(cat => cat[menuName] !== undefined);
        });

        menuData.forEach(s => {
            const dayIndex = s.date.getDate() - 1;
            let qty = 0;
            // Sum quantity from all categories in case menu name exists in multiple
            for (const category in s.menuItemQuantities) {
                if (s.menuItemQuantities[category][menuName]) {
                    qty += s.menuItemQuantities[category][menuName];
                }
            }
            dailyQuantities[dayIndex] = (dailyQuantities[dayIndex] || 0) + qty;
        });
        return dailyQuantities;
    };

    // Create a pair of datasets (Period A and Period B) for each selected menu
    const datasets = selectedMenus.flatMap((menuName, index) => {
        const color = colors[index % colors.length];
        return [
            {
                label: `${menuName} (Period A)`,
                data: getDailyMenuData(periodAData, menuName),
                borderColor: color,
                borderDash: [5, 5], // Dashed line for Period A
                tension: 0.1,
                spanGaps: true,
                hidden: true // Initially hide Period A to reduce clutter
            },
            {
                label: `${menuName} (Period B)`,
                data: getDailyMenuData(periodBData, menuName),
                borderColor: color,
                borderDash: [], // Solid line for Period B
                tension: 0.1,
                spanGaps: true
            }
        ];
    });

    createChart('waktu-menu-trend-chart', 'line', {
        labels,
        datasets
    }, {
        plugins: {
            tooltip: {
                mode: 'index',
                intersect: false
            }
        },
        scales: {
            x: { title: { display: true, text: 'Day of Month' } },
            y: { title: { display: true, text: 'Quantity Sold' } }
        }
    });
}

/**
 * Generates a grouped bar chart comparing menu category quantities between two periods.
 */
function generateCategoryComparisonChart(periodAData: any[], periodBData: any[], canvasId: string) {
    const allCategories = [...new Set([...periodAData, ...periodBData].flatMap(s => Object.keys(s.menuCategories || {})))];

    const getData = (data) => allCategories.map(cat => data.reduce((sum, s) => sum + (s.menuCategories?.[cat]?.quantity || 0), 0));

    createChart(canvasId, 'bar', {
        labels: allCategories,
        datasets: [
            { label: 'Period A', data: getData(periodAData), backgroundColor: '#9CA3AF' },
            { label: 'Period B', data: getData(periodBData), backgroundColor: '#4F46E5' }
        ]
    });
}

/**
 * Generates a grouped bar chart comparing channel revenue between two periods.
 */
function generateChannelComparisonChart(periodAData: any[], periodBData: any[], canvasId: string) {
    const allChannels = [...new Set([...periodAData, ...periodBData].flatMap(s => Object.keys(s.revenueByVisitPurpose || {})))];

    const getData = (data) => allChannels.map(chan => data.reduce((sum, s) => sum + (s.revenueByVisitPurpose?.[chan] || 0), 0));

    createChart(canvasId, 'bar', {
        labels: allChannels,
        datasets: [
            { label: 'Period A', data: getData(periodAData), backgroundColor: '#9CA3AF' },
            { label: 'Period B', data: getData(periodBData), backgroundColor: '#4F46E5' }
        ]
    }, { scales: { y: { ticks: { callback: shortenCurrency } } } });
}

/**
 * Generates a detailed P&L comparison table between two periods,
 * formatted similarly to the P&L vs. Target table.
 */
function generatePnlComparisonTable(reportA: any, reportB: any, containerId: string) {
    const container = document.getElementById(containerId);
    if (!container) return; // Added a guard clause for safety
    container.innerHTML = '';

    try {
        const pnlDataA = reportA?.pnlData || {};
        const pnlDataB = reportB?.pnlData || {};

        const categoryOrder = ["Pendapatan (Revenue)", "Harga Pokok Produksi", "Beban Operasional (OPEX)", "Beban Non Operasional", "Depresiasi/ Amortisasi", "Bunga", "Pajak (PB1)"];
        const subtotals = {
            "Laba Kotor (Gross Profit)": (data) => (data["Pendapatan (Revenue)"] || 0) - (data["Harga Pokok Produksi"] || 0),
            "Pendapatan Bersih Operasional (Net Operating Income)": (data) => subtotals["Laba Kotor (Gross Profit)"](data) - (data["Beban Operasional (OPEX)"] || 0),
            "Pendapatan Bersih Sebelum Deprisiasi/Amortisasi, Bunga & Pajak (EBITDA)": (data) => subtotals["Pendapatan Bersih Operasional (Net Operating Income)"](data) - (data["Beban Non Operasional"] || 0),
            "Pendapatan Bersih (Net Income)": (data) => subtotals["Pendapatan Bersih Sebelum Deprisiasi/Amortisasi, Bunga & Pajak (EBITDA)"](data) - (data["Depresiasi/ Amortisasi"] || 0) - (data["Bunga"] || 0) - (data["Pajak (PB1)"] || 0),
        };
        const allMetrics = [...categoryOrder, ...Object.keys(subtotals)];

        const calculateAllMetrics = (pnlData) => {
            const results = {};
            const categoryTotals = {};
            categoryOrder.forEach(cat => {
                const total = Object.values(pnlData?.[cat] || {}).reduce((sum: number, val: number) => sum + val, 0);
                results[cat] = total;
                categoryTotals[cat] = total;
            });
            Object.keys(subtotals).forEach(sub => {
                results[sub] = subtotals[sub](categoryTotals);
            });
            return results;
        };

        const valuesA = calculateAllMetrics(pnlDataA);
        const valuesB = calculateAllMetrics(pnlDataB);

        const formatCurrency = (value) => `Rp${Math.round(value).toLocaleString('id-ID')}`;
        const labelA = reportA ? new Date(reportA.period + '-02').toLocaleString('default', { month: 'short', year: 'numeric' }) : 'Period A';
        const labelB = reportB ? new Date(reportB.period + '-02').toLocaleString('default', { month: 'short', year: 'numeric' }) : 'Period B';

        let tableHtml = `
            <table class="min-w-full divide-y divide-gray-200">
                <thead class="bg-gray-50">
                    <tr>
                        <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Metric</th>
                        <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">${labelA}</th>
                        <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">${labelB}</th>
                        <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Change</th>
                    </tr>
                </thead>
                <tbody class="bg-white divide-y divide-gray-200">`;

        allMetrics.forEach(metric => {
            const valueA = valuesA[metric] || 0;
            const valueB = valuesB[metric] || 0;
            const change = valueB - valueA;
            const isCost = metric.toLowerCase().includes('beban') || metric.toLowerCase().includes('harga pokok produksi');

            // --- FIX START: Calculate percentage change and handle zero division ---
            let changeText: string;
            if (valueA === 0) {
                // If the initial value is 0, a percentage isn't meaningful.
                // We show the absolute change instead.
                changeText = `${change >= 0 ? '+' : ''}${formatCurrency(change)}`;
            } else {
                const percentage = (change / valueA) * 100;
                changeText = `${percentage >= 0 ? '+' : ''}${percentage.toFixed(1)}%`;
            }
            // --- FIX END ---

            let changeColor = 'text-gray-500'; // Default color for no change
            if (change > 0) changeColor = isCost ? 'text-red-600' : 'text-green-600';
            if (change < 0) changeColor = isCost ? 'text-green-600' : 'text-red-600';

            // The 'achievement' bar logic can be kept or removed based on your preference.
            // I've kept it here as it provides a nice visual indicator.
            let achievement = 0;
            if (valueA !== 0) {
                 achievement = isCost ? (valueA / valueB) * 100 : (valueB / valueA) * 100;
            } else if (valueB > 0) {
                 achievement = 100;
            }

            tableHtml += `
                <tr>
                    <td class="px-6 py-4 text-sm font-medium text-gray-900">${metric}</td>
                    <td class="px-6 py-4 text-sm text-gray-500 text-right font-mono">${formatCurrency(valueA)}</td>
                    <td class="px-6 py-4 text-sm text-gray-500 text-right font-mono">${formatCurrency(valueB)}</td>
                    <td class="px-6 py-4 text-sm text-gray-500 text-right">
                        <div class="flex items-center justify-end">
                            <div class="w-20 bg-gray-200 rounded-full h-2.5 mr-3">
                                <div class="bg-blue-600 h-2.5 rounded-full" style="width: ${Math.min(achievement, 100)}%"></div>
                            </div>
                            <span class="font-semibold ${changeColor} w-20 text-right">${changeText}</span>
                        </div>
                    </td>
                </tr>`;
        });

        tableHtml += `</tbody></table>`;
        container.innerHTML = tableHtml;

    } catch(error) {
        console.error("Error generating P&L comparison table:", error);
        container.innerHTML = `<p class="text-red-500 p-4">Error loading data for comparison. One of the selected periods may be missing a P&L report.</p>`;
    }
}


/**
 * Reusable function to generate a dual-axis comparison chart for a financial ratio.
 */
function generateRatioComparisonChart(reportA: any, reportB: any, config: { canvasId: string, metric: string, title: string }) {
    const pnlDataA = reportA?.pnlData;
    const pnlDataB = reportB?.pnlData;

    const getMetricValue = (pnlData) => {
        const revenue = Object.values(pnlData?.["Pendapatan (Revenue)"] || {}).reduce((s:number, v:number) => s + v, 0);
        if (!revenue) return 0;

        if (config.metric.includes('Profit') || config.metric.includes('Income')) {
            const hpp = Object.values(pnlData?.["Harga Pokok Produksi"] || {}).reduce((s:number, v:number) => s + v, 0);
            return revenue - hpp;
        }
        return Object.values(pnlData?.[config.metric] || {}).reduce((s:number, v:number) => s + v, 0);
    };

    const valueA = getMetricValue(pnlDataA);
    const valueB = getMetricValue(pnlDataB);
    const revenueA = Object.values(pnlDataA?.["Pendapatan (Revenue)"] || {}).reduce((s:number,v:number)=>s+v,0);
    const revenueB = Object.values(pnlDataB?.["Pendapatan (Revenue)"] || {}).reduce((s:number,v:number)=>s+v,0);
    const percentA = revenueA > 0 ? (valueA / revenueA) * 100 : 0;
    const percentB = revenueB > 0 ? (valueB / revenueB) * 100 : 0;

    const labels = [
        reportA ? new Date(reportA.period + '-02').toLocaleString('default', { month: 'short', year: 'numeric' }) : 'Period A',
        reportB ? new Date(reportB.period + '-02').toLocaleString('default', { month: 'short', year: 'numeric' }) : 'Period B'
    ];

    createChart(config.canvasId, 'bar', {
        labels,
        datasets: [
            { type: 'bar', label: `${config.title} (Rp)`, data: [valueA, valueB], backgroundColor: '#60A5FA', yAxisID: 'y-rp' },
            { type: 'line', label: `${config.title} (%)`, data: [percentA, percentB], borderColor: '#F97316', yAxisID: 'y-percent' }
        ]
    }, {
        scales: {
            'y-rp': { type: 'linear', position: 'left', title: { display: true, text: 'Value (Rp)' }, ticks: { callback: shortenCurrency } },
            'y-percent': { type: 'linear', position: 'right', title: { display: true, text: 'Percentage (%)' }, grid: { drawOnChartArea: false }, ticks: { callback: (v) => `${Number(v).toFixed(1)}%` } }
        }
    });
}

function generateAnalisaPenjualanSection(summaries: any[]) {
    generatePenjualanBulananChartFromSummaries(summaries, 'penjualan-bulanan-chart');
    generatePenjualanChannelChartFromSummaries(summaries, 'penjualan-channel-chart');
    generateSalesTrendHourlyDailyChartFromSummaries(summaries, 'sales-trend-hourly-daily-chart');
}

// --- START: New logic for the View Choice Modal ---
const viewChoiceModal = document.getElementById('view-choice-modal');

function openViewChoiceModal(uploadId: string, fileName: string) {
    if (!viewChoiceModal) return;
    // Store the necessary data on the modal itself
    viewChoiceModal.dataset.uploadId = uploadId;
    viewChoiceModal.dataset.fileName = fileName;
    viewChoiceModal.classList.remove('hidden');
}

// Add listeners for the new modal's buttons
if (viewChoiceModal) {
    document.getElementById('view-choice-modal-close').addEventListener('click', () => viewChoiceModal.classList.add('hidden'));
    document.getElementById('view-choice-cancel-btn').addEventListener('click', () => viewChoiceModal.classList.add('hidden'));

    document.getElementById('view-choice-daily-btn').addEventListener('click', async () => {
        const uploadId = viewChoiceModal.dataset.uploadId;
        const fileName = viewChoiceModal.dataset.fileName;
        if (!uploadId) return;

        viewChoiceModal.classList.add('hidden'); // Close the choice modal
        showLoading({ message: 'Fetching data for daily recap...', value: 50 });
        const dailySummaries = await fetchDailySummariesForUpload(uploadId);
        hideLoading();
        generateDailyRecap(dailySummaries, fileName);
    });

    document.getElementById('view-choice-monthly-btn').addEventListener('click', async () => {
        const uploadId = viewChoiceModal.dataset.uploadId;
        const fileName = viewChoiceModal.dataset.fileName;
        if (!uploadId) return;

        viewChoiceModal.classList.add('hidden'); // Close the choice modal
        showLoading({ message: 'Fetching data for monthly summary...', value: 50 });
        const dailySummaries = await fetchDailySummariesForUpload(uploadId);
        hideLoading();
        generateMonthlySummary(dailySummaries, fileName);
    });
}
// --- END: New logic for the View Choice Modal ---

async function saveInvestmentData() {
    if (!currentUser) {
        alert('You must be logged in to save data.');
        return;
    }
    const branchNameInput = document.getElementById('investment-branch-name') as HTMLInputElement;
    const amountInput = document.getElementById('investment-amount') as HTMLInputElement;
    const slotsInput = document.getElementById('investment-slots') as HTMLInputElement;
    // Get the new percentage input
    const shareInput = document.getElementById('investment-share-percentage') as HTMLInputElement;
    const feedbackEl = document.getElementById('investment-feedback');

    const branchName = branchNameInput.value.trim();
    const investmentAmount = parseFloat(amountInput.value);
    const investmentSlots = parseInt(slotsInput.value, 10);
    // Parse the new percentage value
    const investorSharePercentage = parseFloat(shareInput.value);

    if (!branchName || isNaN(investmentAmount) || isNaN(investmentSlots) || isNaN(investorSharePercentage) || investmentAmount <= 0 || investmentSlots <= 0 || investorSharePercentage < 0 || investorSharePercentage > 100) {
        feedbackEl.textContent = 'Please fill all fields with valid numbers (percentage must be between 0-100).';
        feedbackEl.className = 'text-sm mb-4 text-center text-red-600';
        feedbackEl.classList.remove('hidden');
        return;
    }

    feedbackEl.textContent = 'Saving...';
    feedbackEl.className = 'text-sm mb-4 text-center text-blue-600';
    feedbackEl.classList.remove('hidden');

    try {
        const investmentDocRef = doc(db, `users/${currentUser.uid}/investments`, branchName);
        await setDoc(investmentDocRef, {
            branchName,
            investmentAmount,
            investmentSlots,
            investorSharePercentage, // Save the new field to Firestore
            lastUpdatedAt: new Date()
        }, { merge: true });

        feedbackEl.textContent = 'Investment data saved successfully!';
        feedbackEl.className = 'text-sm mb-4 text-center text-green-600';
        branchNameInput.value = '';
        amountInput.value = '';
        slotsInput.value = '';
        shareInput.value = '';

        await setupGeneralInvestasiSelectors();

    } catch (error) {
        console.error("Error saving investment data:", error);
        feedbackEl.textContent = `Error: ${error.message}`;
        feedbackEl.className = 'text-sm mb-4 text-center text-red-600';
    }
}

function generateCumulativeInvestorShareChart(monthlyProfits: any[], investorSharePercentage: number) {
    const labels = monthlyProfits.map(p => new Date(p.period + '-02').toLocaleString('default', { month: 'short', year: 'numeric' }));

    let cumulativeShare = 0;
    const cumulativeData = monthlyProfits.map(p => {
        const monthlyShare = p.profit * (investorSharePercentage / 100);
        cumulativeShare += monthlyShare;
        return cumulativeShare;
    });

    createChart('cumulative-investor-share-chart', 'line', {
        labels,
        datasets: [
            {
                label: 'Akumulasi Bagi Hasil (Rp)',
                data: cumulativeData,
                borderColor: '#8B5CF6', // A nice purple color
                backgroundColor: 'rgba(139, 92, 246, 0.2)',
                fill: true,
                tension: 0.1,
            }
        ]
    }, {
        scales: {
            y: {
                beginAtZero: true,
                title: { display: true, text: 'Total Akumulasi (Rp)' },
                ticks: { callback: shortenCurrency }
            }
        }
    });
}


/**
 * Populates the branch selector for the investment analysis section.
 */
async function setupGeneralInvestasiSelectors() {
    const branchSelect = document.getElementById('investasi-branch-select') as HTMLSelectElement;
    if (!currentUser) return;

    branchSelect.innerHTML = '<option>Loading branches...</option>';

    try {
        const investmentsRef = collection(db, `users/${currentUser.uid}/investments`);
        const investmentSnap = await getDocs(investmentsRef);
        const branches = investmentSnap.docs.map(doc => doc.data().branchName).toSorted();

        if (branches.length === 0) {
            branchSelect.innerHTML = '<option>No investment data saved</option>';
            // Clear charts if no data
            document.getElementById('business-yield-chart').parentElement.innerHTML = '<canvas id="business-yield-chart"></canvas>';
            document.getElementById('investor-yield-chart').parentElement.innerHTML = '<canvas id="investor-yield-chart"></canvas>';
            return;
        }

        branchSelect.innerHTML = branches.map(b => `<option value="${b}">${b}</option>`).join('');

        // Attach event listener only once
        if (!$store.getInitFlag('generalInvestasiSelectorInitialized')) {
            branchSelect.addEventListener('change', generateGeneralInvestasiSection);
            $store.setInitFlag('generalInvestasiSelectorInitialized', true);
        }

        // Trigger the initial chart generation
        await generateGeneralInvestasiSection();

    } catch (error) {
        console.error("Error fetching investment branches:", error);
        branchSelect.innerHTML = '<option>Error loading branches</option>';
    }
}

/**
 * Orchestrates the fetching and rendering of the investment yield charts.
 */
async function generateGeneralInvestasiSection() {
    if (!currentUser) return;
    const branchSelect = document.getElementById('investasi-branch-select') as HTMLSelectElement;
    const selectedBranch = branchSelect.value;

    if (!selectedBranch || selectedBranch === 'No investment data saved') {
        return;
    }

    showLoading({ message: 'Calculating investment yield...', value: 30 });

    try {
        const investmentDocRef = doc(db, `users/${currentUser.uid}/investments`, selectedBranch);
        const investmentSnap = await getDoc(investmentDocRef);

        if (!investmentSnap.exists()) {
            throw new Error(`Investment data for ${selectedBranch} not found.`);
        }
        const investmentData = investmentSnap.data();

        const pnlReportsRef = collection(db, `users/${currentUser.uid}/pnlReports`);
        const q = query(pnlReportsRef, where("branchName", "==", selectedBranch), orderBy("period", "desc"), limit(24));
        const reportsSnap = await getDocs(q);

        const recentReports = reportsSnap.docs.map(doc => doc.data()).toSorted((a, b) => a.period.localeCompare(b.period));

        if (recentReports.length === 0) {
            throw new Error(`No P&L reports found for ${selectedBranch} in the last 24 months.`);
        }

        const monthlyProfits = recentReports.map(report => {
            const pnlData = report.pnlData || {};
            const revenue = Object.values(pnlData["Pendapatan (Revenue)"] || {}).reduce((s: number, v: number) => s + v, 0);
            const hpp = Object.values(pnlData["Harga Pokok Produksi"] || {}).reduce((s: number, v: number) => s + v, 0);
            const opex = Object.values(pnlData["Beban Operasional (OPEX)"] || {}).reduce((s: number, v: number) => s + v, 0);
            const nonOpex = Object.values(pnlData["Beban Non Operasional"] || {}).reduce((s: number, v: number) => s + v, 0);
            const depreciation = Object.values(pnlData["Depresiasi/ Amortisasi"] || {}).reduce((s: number, v: number) => s + v, 0);
            const interest = Object.values(pnlData["Bunga"] || {}).reduce((s: number, v: number) => s + v, 0);
            const tax = Object.values(pnlData["Pajak (PB1)"] || {}).reduce((s: number, v: number) => s + v, 0);

            const netIncome = revenue - hpp - opex - nonOpex - depreciation - interest - tax;
            return {
                period: report.period,
                profit: netIncome
            };
        });

        generateBusinessYieldChart(monthlyProfits, investmentData.investmentAmount);
        generateInvestorYieldChart(monthlyProfits, investmentData.investmentAmount, investmentData.investmentSlots);
        generateCumulativeInvestorShareChart(monthlyProfits, investmentData.investorSharePercentage);

        $store.setActiveViewData('general-investasi', { investmentData, monthlyProfits }, { selectedBranch });

    } catch (error) {
        console.error("Error generating investment analysis:", error);
        const chartContainer = document.getElementById('business-yield-chart').parentElement;
        if (chartContainer) chartContainer.innerHTML = `<p class="text-red-500 p-4 text-center">${error.message}</p>`;
        const investorChartContainer = document.getElementById('investor-yield-chart').parentElement;
        if (investorChartContainer) investorChartContainer.innerHTML = '';
    } finally {
        hideLoading();
    }
}

/**
 * Generates the "Yield Bisnis per Bulan" chart.
 */
function generateBusinessYieldChart(monthlyProfits: any[], totalInvestment: number) {
    const labels = monthlyProfits.map(p => new Date(p.period + '-02').toLocaleString('default', { month: 'short', year: 'numeric' }));
    const profitData = monthlyProfits.map(p => p.profit);
    const yieldData = monthlyProfits.map(p => totalInvestment > 0 ? (p.profit / totalInvestment) * 100 : 0);

    createChart('business-yield-chart', 'bar', {
        labels,
        datasets: [
            {
                type: 'bar',
                label: 'Profit (Rp)',
                data: profitData,
                backgroundColor: '#10B981',
                yAxisID: 'y-rp',
            },
            {
                type: 'line',
                label: 'Yield (%)',
                data: yieldData,
                borderColor: '#F97316',
                yAxisID: 'y-percent',
                tension: 0.1,
            }
        ]
    }, {
        scales: {
            'y-rp': { type: 'linear', position: 'left', title: { display: true, text: 'Profit Bulanan (Rp)' }, ticks: { callback: shortenCurrency } },
            'y-percent': { type: 'linear', position: 'right', title: { display: true, text: 'Yield (%)' }, grid: { drawOnChartArea: false }, ticks: { callback: (v) => `${Number(v).toFixed(2)}%` } }
        }
    });
}

/**
 * Generates the "Yield Investor per Bulan" chart.
 */
function generateInvestorYieldChart(monthlyProfits: any[], totalInvestment: number, slots: number) {
    if (slots === 0) return; // Avoid division by zero
    const investmentPerSlot = totalInvestment / slots;

    const labels = monthlyProfits.map(p => new Date(p.period + '-02').toLocaleString('default', { month: 'short', year: 'numeric' }));
    const profitData = monthlyProfits.map(p => p.profit);
    const yieldData = monthlyProfits.map(p => investmentPerSlot > 0 ? (p.profit / investmentPerSlot) * 100 : 0);

    createChart('investor-yield-chart', 'bar', {
        labels,
        datasets: [
            {
                type: 'bar',
                label: 'Profit (Rp)',
                data: profitData,
                backgroundColor: '#10B981',
                yAxisID: 'y-rp',
            },
            {
                type: 'line',
                label: 'Yield per Slot (%)',
                data: yieldData,
                borderColor: '#F97316',
                yAxisID: 'y-percent',
                tension: 0.1,
            }
        ]
    }, {
        scales: {
            'y-rp': { type: 'linear', position: 'left', title: { display: true, text: 'Profit Bulanan (Rp)' }, ticks: { callback: shortenCurrency } },
            'y-percent': { type: 'linear', position: 'right', title: { display: true, text: 'Yield per Slot (%)' }, grid: { drawOnChartArea: false }, ticks: { callback: (v) => `${Number(v).toFixed(2)}%` } }
        }
    });
}

async function setupCabangInvestasiSelectors() {
    if ($store.getInitFlag('cabangInvestasiSelectorInitialized')) return;
    if (!currentUser) return;

    const startPeriodSelect = document.getElementById('cabang-investasi-start-period') as HTMLSelectElement;
    const endPeriodSelect = document.getElementById('cabang-investasi-end-period') as HTMLSelectElement;
    const branchASelect = document.getElementById('cabang-investasi-branch-a-select') as HTMLSelectElement;
    const branchBSelect = document.getElementById('cabang-investasi-branch-b-select') as HTMLSelectElement;

    branchASelect.innerHTML = '<option>Loading...</option>';

    try {
        const investmentsRef = collection(db, `users/${currentUser.uid}/investments`);
        const pnlReportsRef = collection(db, `users/${currentUser.uid}/pnlReports`);

        const [investmentSnap, pnlSnap] = await Promise.all([
            getDocs(investmentsRef),
            getDocs(pnlReportsRef)
        ]);

        const branchesWithInvestment = investmentSnap.docs.map(doc => doc.data().branchName).sort();
        const availablePeriods = [...new Set(pnlSnap.docs.map(doc => doc.data().period))].sort();

        if (branchesWithInvestment.length < 2 || availablePeriods.length === 0) {
            branchASelect.innerHTML = '<option>Not enough data</option>';
            branchBSelect.innerHTML = '';
            startPeriodSelect.innerHTML = '';
            endPeriodSelect.innerHTML = '';
            return;
        }

        const branchOptionsHtml = branchesWithInvestment.map(b => `<option value="${b}">${b}</option>`).join('');
        branchASelect.innerHTML = branchOptionsHtml;
        branchBSelect.innerHTML = branchOptionsHtml;

        const periodOptionsHtml = availablePeriods.map(p => `<option value="${p}">${new Date(p + '-02').toLocaleString('default', { month: 'long', year: 'numeric' })}</option>`).join('');
        startPeriodSelect.innerHTML = periodOptionsHtml;
        endPeriodSelect.innerHTML = periodOptionsHtml;

        branchASelect.value = branchesWithInvestment[0];
        branchBSelect.value = branchesWithInvestment[1];
        startPeriodSelect.value = availablePeriods[0];
        endPeriodSelect.value = availablePeriods[availablePeriods.length - 1];

        const handler = () => generateCabangInvestasiSection();
        startPeriodSelect.addEventListener('change', handler);
        endPeriodSelect.addEventListener('change', handler);
        branchASelect.addEventListener('change', handler);
        branchBSelect.addEventListener('change', handler);

        $store.setInitFlag('cabangInvestasiSelectorInitialized', true);
        await generateCabangInvestasiSection();

    } catch (error) {
        console.error("Error setting up investment comparison selectors:", error);
        branchASelect.innerHTML = '<option>Error loading data</option>';
    }
}


/**
 * Fetches data and generates the comparison charts for investment analysis between two branches.
 */
async function generateCabangInvestasiSection() {
    if (!currentUser) return;
    const startPeriod = (document.getElementById('cabang-investasi-start-period') as HTMLSelectElement).value;
    const endPeriod = (document.getElementById('cabang-investasi-end-period') as HTMLSelectElement).value;
    const branchA = (document.getElementById('cabang-investasi-branch-a-select') as HTMLSelectElement).value;
    const branchB = (document.getElementById('cabang-investasi-branch-b-select') as HTMLSelectElement).value;

    const containerA = document.getElementById('cabang-business-yield-chart-container');
    const containerB = document.getElementById('cabang-investor-yield-chart-container');
    const containerC = document.getElementById('branch-cumulative-chart-container');

    const clearChartsAndShowError = (message: string) => {
        if (containerA) containerA.innerHTML = `<p class="text-center text-red-500 p-4">${message}</p>`;
        if (containerB) containerB.innerHTML = '';
        if (containerC) containerC.innerHTML = '';
    };

    if (containerA) containerA.innerHTML = '<canvas id="cabang-business-yield-chart"></canvas>';
    if (containerB) containerB.innerHTML = '<canvas id="cabang-investor-yield-chart"></canvas>';
    if (containerC) containerC.innerHTML = '<canvas id="branch-cumulative-chart"></canvas>';

    if (!startPeriod || !endPeriod || !branchA || !branchB) return;
    if (branchA === branchB) {
        clearChartsAndShowError('Please select two different branches to compare.');
        return;
    }
    if (startPeriod > endPeriod) {
        clearChartsAndShowError('Start Period cannot be after End Period.');
        return;
    }

    showLoading({ message: 'Comparing cumulative returns...' });

    try {
        const fetchDataForBranch = async (branchName: string) => {
            const investmentRef = doc(db, `users/${currentUser.uid}/investments`, branchName);
            const pnlReportsRef = collection(db, `users/${currentUser.uid}/pnlReports`);
            const q = query(pnlReportsRef,
                where("branchName", "==", branchName),
                where("period", ">=", startPeriod),
                where("period", "<=", endPeriod)
            );

            const [investmentSnap, pnlSnap] = await Promise.all([getDoc(investmentRef), getDocs(q)]);
            if (!investmentSnap.exists()) throw new Error(`Investment data not found for ${branchName}.`);

            const monthlyProfits = pnlSnap.docs.map(doc => {
                const report = doc.data();
                const pnlData = report.pnlData || {};
                const revenue = Object.values(pnlData["Pendapatan (Revenue)"] || {}).reduce((s: number, v: number) => s + v, 0);
                const hpp = Object.values(pnlData["Harga Pokok Produksi"] || {}).reduce((s: number, v: number) => s + v, 0);
                const opex = Object.values(pnlData["Beban Operasional (OPEX)"] || {}).reduce((s: number, v: number) => s + v, 0);
                const profit = revenue - hpp - opex;
                return { period: report.period, profit };
            }).sort((a, b) => a.period.localeCompare(b.period));

            const singlePeriodProfit = monthlyProfits.length > 0 ? monthlyProfits[monthlyProfits.length - 1].profit : 0;

            return { investment: investmentSnap.data(), monthlyProfits, singlePeriodProfit };
        };

        const [dataA, dataB] = await Promise.all([fetchDataForBranch(branchA), fetchDataForBranch(branchB)]);

        if (dataA.monthlyProfits.length === 0 && dataB.monthlyProfits.length === 0) {
            throw new Error(`No P&L reports found for the selected branches in this period.`);
        }

        // Generate the two single-period comparison charts
        generateCabangBusinessYieldComparisonChart(dataA, dataB);
        generateCabangInvestorYieldComparisonChart(dataA, dataB);
        // Generate the cumulative comparison chart
        generateBranchCumulativeComparisonChart(dataA, dataB, startPeriod, endPeriod);

        $store.setActiveViewData('cabang-investasi', { dataA, dataB }, { startPeriod, endPeriod, branchA, branchB });

    } catch (error) {
        console.error("Error generating branch cumulative comparison:", error);
        clearChartsAndShowError(error.message);
    } finally {
        hideLoading();
    }
}


function generateBranchCumulativeComparisonChart(dataA, dataB, startPeriod, endPeriod) {
    // 1. Create a master list of all months in the selected range
    const allMonths = [];
    let currentDate = new Date(startPeriod + '-02');
    const lastDate = new Date(endPeriod + '-02');
    while (currentDate <= lastDate) {
        allMonths.push(currentDate.toISOString().slice(0, 7));
        currentDate.setMonth(currentDate.getMonth() + 1);
    }

    // 2. Create helper maps for quick profit lookup
    const profitMapA = new Map(dataA.monthlyProfits.map(p => [p.period, p.profit]));
    const profitMapB = new Map(dataB.monthlyProfits.map(p => [p.period, p.profit]));

    // 3. Calculate cumulative data for each branch
    const calculateCumulative = (profitMap, investmentData) => {
        let cumulativeShare = 0;
        return allMonths.map(month => {
            const profit = profitMap.get(month) || 0;
            const monthlyShare = profit * (investmentData.investorSharePercentage / 100);
            cumulativeShare += monthlyShare;
            return cumulativeShare;
        });
    };

    const cumulativeDataA = calculateCumulative(profitMapA, dataA.investment);
    const cumulativeDataB = calculateCumulative(profitMapB, dataB.investment);

    // 4. Render the chart
    const chartLabels = allMonths.map(m => new Date(m + '-02').toLocaleString('default', { month: 'short', year: 'numeric' }));

    createChart('branch-cumulative-chart', 'line', {
        labels: chartLabels,
        datasets: [
            {
                label: `Akumulasi ${dataA.investment.branchName}`,
                data: cumulativeDataA,
                borderColor: '#4F46E5',
                backgroundColor: 'rgba(79, 70, 229, 0.1)',
                fill: true,
                tension: 0.1,
            },
            {
                label: `Akumulasi ${dataB.investment.branchName}`,
                data: cumulativeDataB,
                borderColor: '#10B981',
                backgroundColor: 'rgba(16, 185, 129, 0.1)',
                fill: true,
                tension: 0.1,
            }
        ]
    }, {
        scales: {
            y: {
                beginAtZero: true,
                title: { display: true, text: 'Total Akumulasi (Rp)' },
                ticks: { callback: shortenCurrency }
            }
        }
    });
}

/**
 * Renders the Business Yield comparison chart.
 */
function generateCabangBusinessYieldComparisonChart(dataA, dataB) {
    // 1. Create a master list of all months in the selected range to ensure a consistent X-axis.
    const allMonths = [...new Set([...dataA.monthlyProfits.map(p => p.period), ...dataB.monthlyProfits.map(p => p.period)])].sort();

    // 2. Create Maps for easy profit lookup for each branch.
    const profitMapA = new Map(dataA.monthlyProfits.map(p => [p.period, p.profit]));
    const profitMapB = new Map(dataB.monthlyProfits.map(p => [p.period, p.profit]));

    // 3. Calculate the monthly yield for each branch for every month in our master list.
    const yieldDataA = allMonths.map(month => {
        const profit = profitMapA.get(month) || 0;
        return dataA.investment.investmentAmount > 0 ? (profit / dataA.investment.investmentAmount) * 100 : 0;
    });

    const yieldDataB = allMonths.map(month => {
        const profit = profitMapB.get(month) || 0;
        return dataB.investment.investmentAmount > 0 ? (profit / dataB.investment.investmentAmount) * 100 : 0;
    });

    // 4. Format month labels for the chart's X-axis.
    const chartLabels = allMonths.map(m => new Date(m + '-02').toLocaleString('default', { month: 'short', year: 'numeric' }));

    createChart('cabang-business-yield-chart', 'bar', {
        labels: chartLabels,
        datasets: [
            {
                label: `Yield ${dataA.investment.branchName} (%)`,
                data: yieldDataA,
                backgroundColor: '#4F46E5', // Blue for Branch A
            },
            {
                label: `Yield ${dataB.investment.branchName} (%)`,
                data: yieldDataB,
                backgroundColor: '#10B981', // Green for Branch B
            }
        ]
    }, {
        scales: {
            y: {
                title: { display: true, text: 'Business Yield (%)' },
                ticks: { callback: (v) => `${Number(v).toFixed(2)}%` }
            }
        }
    });
}



/**
 * Renders the Investor Yield comparison chart.
 */
function generateCabangInvestorYieldComparisonChart(dataA, dataB) {
    // 1. Calculate the investment cost per slot for each branch.
    const investmentPerSlotA = dataA.investment.investmentSlots > 0 ? dataA.investment.investmentAmount / dataA.investment.investmentSlots : 0;
    const investmentPerSlotB = dataB.investment.investmentSlots > 0 ? dataB.investment.investmentAmount / dataB.investment.investmentSlots : 0;

    // 2. Create a master list of all months in the selected range.
    const allMonths = [...new Set([...dataA.monthlyProfits.map(p => p.period), ...dataB.monthlyProfits.map(p => p.period)])].sort();

    // 3. Create Maps for easy profit lookup.
    const profitMapA = new Map(dataA.monthlyProfits.map(p => [p.period, p.profit]));
    const profitMapB = new Map(dataB.monthlyProfits.map(p => [p.period, p.profit]));

    // 4. Calculate the monthly investor yield per slot for each branch.
    const yieldDataA = allMonths.map(month => {
        const profit = profitMapA.get(month) || 0;
        return investmentPerSlotA > 0 ? (profit / investmentPerSlotA) * 100 : 0;
    });

    const yieldDataB = allMonths.map(month => {
        const profit = profitMapB.get(month) || 0;
        return investmentPerSlotB > 0 ? (profit / investmentPerSlotB) * 100 : 0;
    });

    // 5. Format month labels for the chart's X-axis.
    const chartLabels = allMonths.map(m => new Date(m + '-02').toLocaleString('default', { month: 'short', year: 'numeric' }));

    createChart('cabang-investor-yield-chart', 'bar', {
        labels: chartLabels,
        datasets: [
            {
                label: `Yield ${dataA.investment.branchName} (%)`,
                data: yieldDataA,
                backgroundColor: '#4F46E5', // Blue for Branch A
            },
            {
                label: `Yield ${dataB.investment.branchName} (%)`,
                data: yieldDataB,
                backgroundColor: '#10B981', // Green for Branch B
            }
        ]
    }, {
        scales: {
            y: {
                title: { display: true, text: 'Investor Yield per Slot (%)' },
                ticks: { callback: (v) => `${Number(v).toFixed(2)}%` }
            }
        }
    });
}


/**
 * Creates a detailed, day-by-day breakdown from an array of daily summary objects,
 * formatted specifically for AI analysis of the General Sales view.
 * @param {any[]} dailySummaries - The array of daily summary data for the selected period.
 * @returns {object} An object where each key is a date string, containing the detailed summary for that day.
 */
function createGeneralSalesDailyBreakdown(dailySummaries: any[]): object {
    if (!dailySummaries || dailySummaries.length === 0) {
        return { message: "No data available for this period." };
    }

    const breakdown = {};
    const formatCurrency = (value) => `Rp${Math.round(value).toLocaleString('id-ID')}`;

    // Create a mutable copy and sort summaries by date to ensure chronological order
    const sortedSummaries = [...dailySummaries].sort((a, b) => a.date.getTime() - b.date.getTime());

    sortedSummaries.forEach(s => {
        const dateStr = s.date.toISOString().split('T')[0];

        const getTop5 = (categoryName: string) => {
            if (!s.menuItemQuantities || !s.menuItemQuantities[categoryName]) return {};
            return Object.entries(s.menuItemQuantities[categoryName])
                .filter(([name]) => !name.includes('(PACKAGE)'))
                .sort((a, b) => (b[1] as number) - (a[1] as number))
                .slice(0, 5)
                .reduce((acc, [name, qty]) => {
                    acc[`${name} (Qty)`] = qty;
                    return acc;
                }, {});
        };

        breakdown[dateStr] = {
            "Visit Purpose": s.visitPurposes || {},
            "Payment Method": Object.entries(s.paymentMethods || {}).reduce((acc, [name, rev]) => {
                acc[name] = formatCurrency(rev);
                return acc;
            }, {}),
            "Traffic per Hour": (s.trafficByHour || [])
                .map((count, hour) => ({ hour, count }))
                .filter(item => item.count > 0)
                .reduce((acc, item) => {
                    acc[`${String(item.hour).padStart(2, '0')}:00`] = `${item.count} bills`;
                    return acc;
                }, {}),
            "Menu Category Summary": Object.entries(s.menuCategories || {}).reduce((acc, [name, data]) => {
                acc[name] = `${formatCurrency((data as any).revenue)} (${(data as any).quantity} items)`;
                return acc;
            }, {}),
            "Top 5 Makanan": getTop5('MAKANAN'),
            "Top 5 Minuman": getTop5('MINUMAN'),
            "Financial Summary": {
        "Total Nett Sales": formatCurrency(s.totalOmzet || 0),
    }
        };
    });

    return breakdown;
}

async function createGeneralFinanceBreakdown(viewData: any): Promise<object> {
    const { data: historicalReports, filters } = viewData;
    const { selectedBranch, selectedPeriod } = filters;

    if (!historicalReports || historicalReports.length === 0) {
        return { message: "No P&L data available for this branch and period." };
    }

    // --- 1. Performance vs Target for the Selected Period ---
    const currentReport = historicalReports.find(r => r.period === selectedPeriod);
    let performanceVsTarget = {};

    if (currentReport) {
        const targetId = `${selectedPeriod}_${selectedBranch.replace(/\s+/g, '_')}`;
        const targetRef = doc(db, `users/${currentUser.uid}/monthlyPnlTargets`, targetId);
        const targetSnap = await getDoc(targetRef);

        const actualMetrics = calculateAllPnlMetrics(currentReport.pnlData);
        const actualRevenue = actualMetrics['Pendapatan (Revenue)'] || 0;

        performanceVsTarget['Actual'] = {
            'Pendapatan (Revenue)': `Rp${Math.round(actualRevenue).toLocaleString('id-ID')}`,
            'Laba Kotor (Gross Profit)': `Rp${Math.round(actualMetrics['Laba Kotor (Gross Profit)'] || 0).toLocaleString('id-ID')}`,
            'Pendapatan Bersih (Net Income)': `Rp${Math.round(actualMetrics['Pendapatan Bersih (Net Income)'] || 0).toLocaleString('id-ID')}`
        };

        if (targetSnap.exists()) {
            const targets = targetSnap.data().targets || {};
            const targetRevenue = targets['Pendapatan (Revenue)'] || 0;
            performanceVsTarget['Target'] = {
                'Pendapatan (Revenue)': `Rp${Math.round(targetRevenue).toLocaleString('id-ID')}`,
                'Laba Kotor (Gross Profit)': `${((targets['Laba Kotor (Gross Profit)'] || 0) * 100).toFixed(1)}%`,
                'Pendapatan Bersih (Net Income)': `${((targets['Pendapatan Bersih (Net Income)'] || 0) * 100).toFixed(1)}%`
            };
        } else {
            performanceVsTarget['Target'] = "No target set for this period.";
        }
    }

    // --- 2. Historical Performance & Key Ratios (Last 12-24 Months) ---
    const historicalPerformance = {};
    const keyFinancialRatios = {};

    historicalReports.forEach(report => {
        const metrics = calculateAllPnlMetrics(report.pnlData);
        const revenue = metrics['Pendapatan (Revenue)'] || 0;

        historicalPerformance[report.period] = {
            'Pendapatan (Revenue)': `Rp${Math.round(revenue).toLocaleString('id-ID')}`,
            'Laba Kotor (Gross Profit)': `Rp${Math.round(metrics['Laba Kotor (Gross Profit)'] || 0).toLocaleString('id-ID')}`,
            'Pendapatan Bersih (Net Income)': `Rp${Math.round(metrics['Pendapatan Bersih (Net Income)'] || 0).toLocaleString('id-ID')}`
        };

        keyFinancialRatios[report.period] = {
            'COGS %': revenue > 0 ? `${((metrics['Harga Pokok Produksi'] / revenue) * 100).toFixed(1)}%` : '0.0%',
            'Gross Profit Margin %': revenue > 0 ? `${((metrics['Laba Kotor (Gross Profit)'] / revenue) * 100).toFixed(1)}%` : '0.0%',
            'Net Profit Margin %': revenue > 0 ? `${((metrics['Pendapatan Bersih (Net Income)'] / revenue) * 100).toFixed(1)}%` : '0.0%'
        };
    });

    return {
        selectedPeriod,
        selectedBranch,
        performanceVsTarget,
        historicalPerformance,
        keyFinancialRatios
    };
}
