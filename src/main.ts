/**
 * Finalytics - AI-Powered Sales Analysis Application
 *
 * Main file that manages all application logic, including:
 * - Firebase Authentication
 * - Excel data processing
 * - Chart.js visualization
 * - AI analysis with Gemini API
 * - PDF Export
 * - User management
 */

/* eslint-disable */
// @ts-nocheck

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
  startAfter         
} from 'firebase/firestore'

import { setupAnalysis } from './analysis'
import { getStoreState, setStoreObj, setStore } from './store'
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
} from './utils/string'
import { deepmerge } from 'deepmerge-ts'
import { getStorage, ref, uploadBytes } from "firebase/storage";
import { getFunctions, httpsCallable } from "firebase/functions";

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
let allSalesData = []
let charts = {}
const chartDataForAI = {}
let aiAnalysisResults = {} // <-- New: To store AI analysis for PDF export
let adminCredentials = null
let yoyYearSelectInitialized = false

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
    currentUser = user
    if (!adminCredentials) {
      await fetchUserRoleAndSetupUI(user)
    }
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
  document.getElementById('user-management-btn').classList.toggle('hidden', currentUserRole !== 'admin')
  showView('dashboard')
  await loadUploadHistory()
  loadGeminiConfig()
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
 * Display a specific application view while hiding all others.
 *
 * @description
 * Manages single-page application view routing by hiding all views and showing
 * the requested one. Implements role-based access control for admin views and
 * automatically loads required data for certain views (user management, configuration).
 * Provides fallback to dashboard for unauthorized access attempts.
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
  [authView, dashboardView, analysisView, userManagementView, konfigurasiView].forEach((v) => v.classList.add('hidden'))
  if (viewName === 'auth') authView.classList.remove('hidden')
  else if (viewName === 'dashboard') dashboardView.classList.remove('hidden')
  else if (viewName === 'analysis') analysisView.classList.remove('hidden')
  else if (viewName === 'usermanagement') {
    if (currentUserRole === 'admin') {
      userManagementView.classList.remove('hidden')
      loadUsersForAdmin()
    } else {
      alert('Access Denied')
      showView('dashboard')
    }
  } else if (viewName === 'konfigurasi') {
    konfigurasiView.classList.remove('hidden')
    setupConfigurationTab()
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

// --- Excel Processing & Data Storage ---
document.getElementById('upload-btn').addEventListener('click', async () => {
  const fileInput = document.getElementById('file-input');
  const file = fileInput.files[0];
  if (!file) {
    console.warn('Button upload click listener triggered without any file')
    return;
  }

  const uploadButton = document.getElementById('upload-btn');
  uploadButton.disabled = true;
  // Show progress for the UPLOAD only
  // You would need to add a listener for upload progress here

  try {
    // 1. Create a reference in Cloud Storage
    const storageRef = ref(storage, `uploads/${currentUser.uid}/${file.name}`);

    // 2. Upload the file
    await uploadBytes(storageRef, file, { customMetadata: { userId: currentUser.uid } });

    alert("File uploaded successfully! Processing will continue in the background.");

  } catch (error) {
    console.error("Upload failed:", error);
    uploadError.textContent = `Upload failed: ${error.message}`;
    uploadError.classList.remove('hidden');
  } finally {
    uploadButton.disabled = false;
  }
})

// Legacy saveAndChunkDataToFirestore function removed - now using Cloud Functions for processing

/**
 * Process raw Excel JSON data into standardized format for analysis.
 *
 * @description
 * Transforms raw Excel data into a consistent, type-safe format by validating
 * required columns, converting dates to Date objects, parsing numeric values,
 * and mapping columns to standardized property names. Validates data integrity
 * and throws descriptive errors for missing columns or invalid dates.
 *
 * @param jsonData - Raw data array extracted from Excel file starting from row 12.
 * @returns Processed data array with proper types and standardized column mapping.
 *
 * @example
 * // Process raw Excel data
 * const rawData = [
 *   { "Bill Number": "001", "Sales Date In": "2024-01-01", "Nett Sales": "100000", Qty: "2" },
 *   { "Bill Number": "002", "Sales Date In": "2024-01-02", "Nett Sales": "150000", Qty: "1" }
 * ];
 * const processed = processData(rawData);
 * // Returns: [{ "Bill Number": "001", "Sales Date In": Date, Revenue: 100000, Quantity: 2, ... }]
 */
function processData(jsonData: any[]): any[] {
  const requiredColumns = ['Bill Number', 'Sales Date In', 'Branch', 'Visit Purpose', 'Menu Category', 'Menu', 'Qty', 'Price', 'Nett Sales']

  const validJsonData = jsonData.filter((row) => row['Bill Number'] && row['Bill Number'] !== 'Bill Number')

  if (validJsonData.length === 0) {
    throw new Error('No valid data rows with a \'Bill Number\' found in the Excel file starting from row 12.')
  }

  const firstRow = validJsonData[0]
  for (const col of requiredColumns) {
    if (!firstRow.hasOwnProperty(col)) {
      throw new Error(`Missing required column in Excel file: ${col}`)
    }
  }

  const processedData = validJsonData.map((rawEntry) => {
    const entry = {}
    // Map all possible columns from the most detailed Excel file
    const allColumns = ['Bill Number', 'Sales Date In', 'Branch', 'Brand', 'Visit Purpose', 'Payment Method', 'Menu Category', 'Menu', 'Custom Menu Name', 'Qty', 'Price', 'Discount', 'Tax', 'Nett Sales', 'Waiter', 'Bill Discount', 'Service Charge', 'Customer Name', 'Regular Member Name', 'Order Mode', 'Table Section', 'Table Name']
    allColumns.forEach((col) => {
      entry[col] = rawEntry[col]
    })

    entry['Sales Date In'] = new Date(rawEntry['Sales Date In'])
    entry.Quantity = parseInt(rawEntry.Qty, 10) || 0
    entry.Revenue = parseFloat(rawEntry['Nett Sales']) || 0
    entry['Item Group'] = rawEntry['Menu Category']
    entry['Item Name'] = rawEntry['Menu']

    if (isNaN(entry['Sales Date In'].getTime())) {
      throw new Error(`Invalid date format for row with Bill Number: ${entry['Bill Number']}. Original value was: "${rawEntry['Sales Date In']}"`)
    }

    return entry
  })
  uploadError.classList.add('hidden')
  return processedData
}

// --- AI Analysis & Configuration ---
/**
 * Load and merge Gemini AI configuration from localStorage with defaults.
 *
 * @description
 * Retrieves saved Gemini configuration from localStorage and intelligently merges
 * it with default prompts from the codebase. Preserves user's API key and custom
 * prompts while ensuring new default prompts are included. Updates the UI input
 * field and saves the merged configuration back to localStorage.
 *
 * @returns This function does not return a value; it updates global config and UI.
 *
 * @example
 * // Load configuration on app startup
 * loadGeminiConfig();
 * // Merges saved config with defaults, updates geminiConfig global object
 * // and populates the API key input field in the UI
 */
function loadGeminiConfig(): void {
  const savedConfigString = localStorage.getItem('geminiConfig')
  if (savedConfigString) {
    const savedConfig = JSON.parse(savedConfigString)

    // Start with the default prompts from the code
    const defaultPrompts = geminiConfig.prompts

    // Take the saved API key if it exists
    const apiKey = savedConfig.apiKey || ''

    // Take the saved prompts if they exist
    const savedPrompts = savedConfig.prompts || {}

    // Merge them: saved prompts overwrite defaults, but new defaults from the code are included
    const mergedPrompts = { ...defaultPrompts, ...savedPrompts }

    // Update the global config object
    geminiConfig.apiKey = apiKey
    geminiConfig.prompts = mergedPrompts
  }

  // Update the input field with the final API key
  document.getElementById('gemini-api-key').value = geminiConfig.apiKey

  // Save the potentially merged config back to ensure it's up-to-date for the next session
  saveGeminiConfig()
}

/**
 * Save current Gemini AI configuration to localStorage for persistence.
 *
 * @description
 * Serializes the global geminiConfig object (containing API key and custom prompts)
 * to JSON and stores it in localStorage. This ensures user configuration persists
 * across browser sessions and page reloads.
 *
 * @returns This function does not return a value; it saves config to localStorage.
 *
 * @example
 * // Save configuration after user updates API key or prompts
 * geminiConfig.apiKey = 'new-api-key';
 * saveGeminiConfig();
 * // Configuration is now persisted in localStorage as JSON string
 */
function saveGeminiConfig(): void {
  localStorage.setItem('geminiConfig', JSON.stringify(geminiConfig))
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
  const container = document.getElementById('prompt-templates-container')
  container.innerHTML = ''

  function isPromptModified(key) {
    return geminiConfig.prompts[key] !== defaultGeminiConfig.prompts[key]
  }

  // Ensure we iterate over the keys of the *current* global geminiConfig object
  for (const key in geminiConfig.prompts) {
    const markModifiedHidden = isPromptModified(key) ? '' : 'hidden'

    const title = key.replace(/([A-Z])/g, ' $1').replace(/^./, (str) => str.toUpperCase())
    const div = document.createElement('div')
    div.innerHTML = `
                    <label for="prompt-${key}" class="block text-sm font-medium text-gray-700">
                        ${title}
                        <span id="modified-mark-${key}" class="text-yellow-600 text-xs font-semibold ml-1 ${markModifiedHidden}">(modified)</span>
                    </label>
                    <textarea id="prompt-${key}" rows="4" class="mt-1 w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500" data-prompt-key="${key}">${geminiConfig.prompts[key]}</textarea>
                    <button id="reset-prompt-${key}" class="mt-2 bg-red-100 text-red-600 font-semibold px-3 py-1 rounded hover:bg-red-200 block ml-auto">
                        Reset prompt
                    </button>
                `
    container.appendChild(div)

    const buttonReset = document.getElementById(`reset-prompt-${key}`)
    buttonReset.addEventListener('click', () => {
      const textarea = document.getElementById(`prompt-${key}`)
      textarea.value = defaultGeminiConfig.prompts[key]
      textarea.dispatchEvent(new Event('change', { bubbles: true }))
    })
  }

  document.getElementById('gemini-api-key').addEventListener('change', (e) => {
    geminiConfig.apiKey = e.target.value
    saveGeminiConfig()
    alert('API Key saved.')
  })

  function hideModifiedMark(key, hide) {
    const modifiedMark = document.getElementById(`modified-mark-${key}`)

    if (hide) {
      modifiedMark.classList.add('hidden')
    } else {
      modifiedMark.classList.remove('hidden')
    }
  }

  container.addEventListener('change', (e) => {
    if (e.target.tagName === 'TEXTAREA') {
      const key = e.target.dataset.promptKey
      geminiConfig.prompts[key] = e.target.value
      saveGeminiConfig()

      const isModified = isPromptModified(key)
      hideModifiedMark(key, !isModified)
    }
  })
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
  const apiKey = geminiConfig.apiKey
  if (!apiKey) {
    throw new Error('Gemini API Key is not set. Please add it in the Konfigurasi tab.')
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
  // Store the full dataset globally, making sure dates are Date objects
  allSalesData = data.map((d) => ({ ...d, 'Sales Date In': new Date(d['Sales Date In']) }))

  // New: Reset AI analysis results when showing a new view
  aiAnalysisResults = {}

  document.getElementById('analysis-title').textContent = title

  showLoading({ message: 'Preparing view...', value: 80 });
  populateFilters(allSalesData)
  runAnalysis() // Run analysis with default filter values
  setupAnalysis(allSalesData, [])
  applyAnalysisTextBindings(getStoreState())

  hideLoading()

  showView('analysis')
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

  // OLD METHOD that causes the error with large arrays:
  // const dates = data.map((d) => d['Sales Date In']);
  // const minDate = new Date(Math.min(...dates));
  // const maxDate = new Date(Math.max(...dates));

  // NEW, SAFER METHOD: Use reduce to find min/max dates without exceeding the call stack.
  const { minDate, maxDate } = data.reduce((acc, d) => {
    const currentDate = d['Sales Date In'];
    if (currentDate < acc.minDate) acc.minDate = currentDate;
    if (currentDate > acc.maxDate) acc.maxDate = currentDate;
    return acc;
  }, { minDate: data[0]['Sales Date In'], maxDate: data[0]['Sales Date In'] });


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
function runAnalysis(startTime: number): void {
  const currentStartDate = new Date(document.getElementById('date-start').value);
  const currentEndDate = new Date(document.getElementById('date-end').value);
  currentEndDate.setHours(23, 59, 59, 999);

  const lastPeriodStartDate = new Date(document.getElementById('last-period-start').value);
  const lastPeriodEndDate = new Date(document.getElementById('last-period-end').value);
  lastPeriodEndDate.setHours(23, 59, 59, 999);

  const currentData = allSalesData.filter((d) => d['Sales Date In'] >= currentStartDate && d['Sales Date In'] <= currentEndDate);
  const lastPeriodData = allSalesData.filter((d) => d['Sales Date In'] >= lastPeriodStartDate && d['Sales Date In'] <= lastPeriodEndDate);

  destroyCharts();

  showLoading({ message: 'Generating General Overview...', value: 70 });
  generateRingkasan(currentData, lastPeriodData);
  generateDailyOmzetHeatmap(currentData);
  generateOmzetHeatmap(currentData);
  generateTcApcHarianChart(currentData);
  generateOmzetHarianChart(currentData);
  generateOmzetMingguanChart(currentData);
  generateOmzetOutletChart(currentData);

  showLoading({ message: 'Analyzing Sales Performance...', value: 75 });
  generatePenjualanBulananChart(currentData);
  generatePenjualanChannelChart(currentData);
  generateSalesTrendHourlyDailyChart(currentData);

  showLoading({ message: 'Analyzing Product Performance...', value: 80 });
  generateOrderByCategoryCharts(currentData);
  generateProductQuadrantChart(currentData, 'MAKANAN', 'food-quadrant-chart');
  generateProductQuadrantChart(currentData, 'MINUMAN', 'drinks-quadrant-chart');

  showLoading({ message: 'Analyzing Branch Performance...', value: 85 });
  generateCabangAnalysis(currentData);
  generateTopBranchAnalysis(currentData, lastPeriodData);
  generateBranchApcGrowthAnalysis(currentData, allSalesData);

  showLoading({ message: 'Analyzing Year-over-Year Data...', value: 90 });
  generateYoYAnalysis(allSalesData);

  showLoading({ message: 'Preparing report data...', value: 95 });
  generateTcHarianJamChart(currentData);
  generateMultiWeekTrendChart(currentData, 'tc-mingguan-chart-pdf', 'TC');
  generateMultiWeekTrendChart(currentData, 'apc-mingguan-chart-pdf', 'APC');
  generateMultiWeekTrendChart(currentData, 'sales-trend-mingguan-chart-pdf', 'Sales');
  generateWeekendSalesInsights(currentData);
  generateDailyHourTrendChart(currentData, 'tc-per-jam-chart-pdf', 'TC');
  generateDailyHourTrendChart(currentData, 'apc-per-jam-chart-pdf', 'APC');
  generateHourlyInsights(currentData);
  generateDailyHourTrendChart(currentData, 'sales-trend-hourly-daily-chart-pdf', 'Sales');
  generateHourlySalesInsights(currentData);
  generateStackedChannelTrendChart(currentData, 'channel-hourly-chart-pdf', 'hour', 'Sales');
  generateStackedChannelTrendChart(currentData, 'channel-weekly-chart-pdf', 'day', 'Sales');
  generateStackedChannelTrendChart(currentData, 'channel-monthly-chart-pdf', 'month', 'Sales');
  generateDineInMonthlyIncreaseChart(currentData);
  generateStackedChannelTrendChart(currentData, 'tc-hourly-chart-pdf', 'hour', 'TC');
  generateStackedChannelTrendChart(currentData, 'tc-weekly-chart-pdf', 'day', 'TC');
  generateStackedChannelTrendChart(currentData, 'tc-monthly-chart-pdf', 'month', 'TC');
  generateChannelTcInsights(currentData);
  generateChannelInsights(currentData);
  generateWeekendInsights(currentData);
  generateCustomerSpendingInsights(currentData);
  // (and all other generate... functions)

  showLoading({ message: 'Finalizing view...', value: 100 });
  setupAnalysis(currentData, lastPeriodData);
  applyAnalysisTextBindings(getStoreState());
  
  setTimeout(() => {
      hideLoading();
      showView('analysis');

      // Stop the timer and show the result
      const endTime = performance.now();
      const durationInSeconds = ((endTime - startTime) / 1000).toFixed(2);
      alert(`Data loaded and analysis complete in ${durationInSeconds} seconds.`);

  }, 400);
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
  Object.values(charts).forEach((chart) => chart.destroy())
  charts = {}
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
  if (charts[canvasId]) charts[canvasId].destroy()
  const ctx = document.getElementById(canvasId).getContext('2d')
  const finalOptions = { responsive: true, maintainAspectRatio: false, ...options }
  charts[canvasId] = new Chart(ctx, { type, data, options: finalOptions })

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
    setStoreObj({}) // Clear the store if no data
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

  const topOmzetBranch = [...branchStats].sort((a, b) => b.revenue - a.revenue)[0]
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
  }, {})).sort(([,a], [,b]) => b.revenue - a.revenue)

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
  }, {})).sort(([,a], [,b]) => b.revenue - a.revenue)

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
  setStoreObj(stateUpdate)
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

  setStoreObj({
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
    setStoreObj({
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

  setStoreObj({
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

  chartDataForAI['dailyOmzetHeatmap'] = dailyTotals // Store data for AI

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

  chartDataForAI['omzetJamHariHeatmap'] = heatmapData.map((hourlyData, dayIndex) => {
    const dayData = {}
    hourlyData.forEach((revenue, hour) => {
      if (revenue > 0) dayData[hour] = revenue
    })
    return { [days[dayIndex]]: dayData }
  })

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

  const sortedDates = Object.keys(dailyData).sort()
  const tcData = sortedDates.map((date) => dailyData[date].bills.size)
  const apcData = sortedDates.map((date) => {
    const tc = dailyData[date].bills.size
    return tc > 0 ? dailyData[date].revenue / tc : 0
  })

  chartDataForAI['tcApcHarian'] = sortedDates.map((date, i) => ({ date, totalChecks: tcData[i], averageCheck: apcData[i] }))

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

  const sortedDates = Object.keys(dailyOmzet).sort()

  chartDataForAI['omzetHarian'] = dailyOmzet // Store data for AI

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

  const sortedWeeks = Object.keys(weeklyOmzet).sort()
  chartDataForAI['omzetMingguan'] = weeklyOmzet

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

  const sortedOutlets = Object.entries(outletOmzet).sort((a, b) => b[1] - a[1])
  chartDataForAI['omzetOutlet'] = Object.fromEntries(sortedOutlets)

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

  const sortedMonths = Object.keys(monthlyData).sort()
  const salesData = sortedMonths.map((month) => monthlyData[month].revenue)
  const checkData = sortedMonths.map((month) => monthlyData[month].bills.size)

  chartDataForAI['penjualanBulanan'] = sortedMonths.map((month, i) => ({ month, revenue: salesData[i], checks: checkData[i] }))

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

  chartDataForAI['penjualanChannel'] = channelSales

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
  chartDataForAI['orderByCategory'] = byMenuCategory
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
  const top5Makanan = Object.entries(byMakanan).sort((a, b) => b[1] - a[1]).slice(0, 5)
  chartDataForAI['topMakanan'] = Object.fromEntries(top5Makanan) // Store for AI
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
  const top5Minuman = Object.entries(byMinuman).sort((a, b) => b[1] - a[1]).slice(0, 5)
  chartDataForAI['topMinuman'] = Object.fromEntries(top5Minuman) // Store for AI
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

  chartDataForAI['tcJamRataRata'] = hourlyTc

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
 * Generate weekly Average Per Customer (APC) line chart showing spending trends.
 *
 * @description
 * Analyzes sales data to calculate weekly APC by grouping transactions by week
 * (starting from Sunday), computing total revenue and unique bill counts per week,
 * then calculating average spending per customer. Stores data for AI analysis and
 * creates a line chart visualization for PDF reports.
 *
 * @param data - Array of processed sales data rows with Revenue, Bill Number, and Sales Date In.
 * @returns This function does not return a value; it creates a Chart.js line chart and stores AI data.
 *
 * @example
 * // Generate weekly APC trend chart
 * const salesData = [
 *   { Revenue: 100000, "Bill Number": "001", "Sales Date In": new Date("2024-01-15") },
 *   { Revenue: 150000, "Bill Number": "002", "Sales Date In": new Date("2024-01-16") }
 * ];
 * generateApcMingguanChart(salesData);
 * // Creates line chart showing weekly APC trends and stores data in chartDataForAI['apcMingguan']
 */
function generateApcMingguanChart(data: any[]): void {
  const weeklyApc = {}
  const weeklyBills = {}

  data.forEach((d) => {
    const firstDayOfWeek = new Date(d['Sales Date In'])
    firstDayOfWeek.setDate(d['Sales Date In'].getDate() - d['Sales Date In'].getDay())
    const weekLabel = firstDayOfWeek.toISOString().split('T')

    if (!weeklyApc[weekLabel]) {
      weeklyApc[weekLabel] = 0
      weeklyBills[weekLabel] = new Set()
    }
    weeklyApc[weekLabel] += d.Revenue
    weeklyBills[weekLabel].add(d['Bill Number'])
  })

  const sortedWeeks = Object.keys(weeklyApc).sort()
  const apcData = sortedWeeks.map((week) => {
    const totalRevenue = weeklyApc[week]
    const totalBills = weeklyBills[week].size
    return totalBills > 0 ? totalRevenue / totalBills : 0
  })

  chartDataForAI['apcMingguan'] = apcData

  createChart('apc-mingguan-chart-pdf', 'line', {
    labels: sortedWeeks,
    datasets: [{
      label: 'Rata-Rata APC per Minggu',
      data: apcData,
      borderColor: '#3B82F6',
      tension: 0.1,
    }],
  })
}

/**
 * Generate weekly sales trend chart with AI data storage for PDF reports.
 *
 * @description
 * Analyzes sales data to create a line chart showing weekly revenue trends over time.
 * Groups revenue by week (starting Sunday) and sorts chronologically to display
 * sales progression. Stores trend data in global chartDataForAI for AI analysis
 * and insights generation. Helps identify weekly patterns, seasonal trends, and
 * business growth trajectories for strategic planning.
 *
 * @param data - Array of processed sales data rows with Revenue and Sales Date In.
 * @returns This function does not return a value; it creates a Chart.js line chart and stores AI data.
 *
 * @example
 * // Generate weekly sales trend with AI data
 * const salesData = [
 *   { Revenue: 500000, "Sales Date In": new Date("2024-01-15") }, // Week of Jan 14
 *   { Revenue: 600000, "Sales Date In": new Date("2024-01-22") }  // Week of Jan 21
 * ];
 * generateSalesTrendMingguanChart(salesData);
 * // Creates line chart and stores data in chartDataForAI['salesTrendMingguan']
 */
function generateSalesTrendMingguanChart(data: any[]): void {
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

  const sortedWeeks = Object.keys(weeklySales).sort()
  const salesData = sortedWeeks.map((week) => weeklySales[week])

  chartDataForAI['salesTrendMingguan'] = salesData

  createChart('sales-trend-mingguan-chart-pdf', 'line', {
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
  const topOmzet = [...processedStats].sort((a, b) => b.totalRevenue - a.totalRevenue)[0]
  if (topOmzet) {

    document.getElementById('cabang-omzet-tertinggi-nama').textContent = topOmzet.name
    document.getElementById('cabang-omzet-tertinggi-nilai').textContent = formatCurrency(topOmzet.totalRevenue)
  }

  // Cabang Paling Ramai
  const topCheck = [...processedStats].sort((a, b) => b.totalCheck - a.totalCheck)[0]
  if (topCheck) {
    document.getElementById('cabang-ramai-nama').textContent = topCheck.name
    document.getElementById('cabang-ramai-nilai').textContent = `${topCheck.totalCheck.toLocaleString('id-ID')} checks`
  }

  // APC Tertinggi
  const topApc = [...processedStats].sort((a, b) => b.avgCheck - a.avgCheck)[0]
  if (topApc) {
    document.getElementById('cabang-apc-tertinggi-nama').textContent = topApc.name
    document.getElementById('cabang-apc-tertinggi-nilai').textContent = formatCurrency(topApc.avgCheck)
  }

  // --- Create Charts ---
  const sortedByRevenue = [...processedStats].sort((a, b) => b.totalRevenue - a.totalRevenue)
  const labels = sortedByRevenue.map((s) => s.name)

  chartDataForAI['cabangOmzetCheck'] = processedStats.map((s) => ({ branch: s.name, revenue: s.totalRevenue, transactions: s.totalCheck }))

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
  const sortedByApc = [...processedStats].sort((a, b) => b.avgCheck - a.avgCheck)
  chartDataForAI['cabangApc'] = Object.fromEntries(sortedByApc.map((s) => [s.name, s.avgCheck]))
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
  chartDataForAI['cabangDetail'] = sortedByRevenue
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
    setStoreObj({
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
  if (!yoyYearSelectInitialized) {
    const years = [...new Set(data.map((d) => d['Sales Date In'].getFullYear()))].sort((a, b) => b - a)
    yearSelect.innerHTML = years.map((y) => `<option value="${y}">${y}</option>`).join('')
    yearSelect.addEventListener('change', () => generateYoYAnalysis(allSalesData))
    yoyYearSelectInitialized = true
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

  chartDataForAI['yoyOmzet'] = {
    year: selectedYear,
    previous_year: prevYear,
    monthly_comparison: monthlyData,
  }

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
  chartDataForAI['yoyDetail'] = monthlyData
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
  if (!currentUser) return
  const historyCollectionRef = collection(db, `artifacts/sales-app/users/${currentUser.uid}/uploads`)
  const querySnapshot = await getDocs(historyCollectionRef)

  uploadHistoryList.innerHTML = ''
  if (querySnapshot.empty) {
    uploadHistoryList.appendChild(noUploadsMsg)
  } else {
    noUploadsMsg.remove()
    querySnapshot.forEach((docSnap) => {
      const upload = docSnap.data()
      const div = document.createElement('div')
      div.className = 'flex justify-between items-center bg-gray-50 p-4 rounded-lg'
      div.innerHTML = `
                        <div>
                            <p class="font-semibold">${upload.name}</p>
                            <p class="text-sm text-gray-500">Uploaded on: ${new Date(upload.createdAt.seconds * 1000).toLocaleString()}</p>
                        </div>
                        <div>
                            <button class="view-history-btn bg-blue-500 text-white text-sm font-bold py-1 px-3 rounded-full hover:bg-blue-600" data-id="${docSnap.id}">View</button>
                            <button class="delete-history-btn bg-red-500 text-white text-sm font-bold py-1 px-3 rounded-full hover:bg-red-600 ml-2" data-id="${docSnap.id}">Delete</button>
                        </div>
                    `
      uploadHistoryList.appendChild(div)
    })
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
async function fetchAllBillsForUpload(uploadId: string): Promise<any[]> {
  if (!currentUser) return [];

  const billsCollectionRef = collection(db, `artifacts/sales-app/users/${currentUser.uid}/uploads/${uploadId}/bills`);
  showLoading({ message: 'Fetching bills...', value: 40 });
  const billsSnapshot = await getDocs(billsCollectionRef);

  const billsData: any[] = [];
  billsSnapshot.forEach((billDoc) => {
    const billData = billDoc.data();

    // Convert Firestore Timestamp to JavaScript Date
    if (billData['Sales Date In']?.toDate) {
      billData['Sales Date In'] = billData['Sales Date In'].toDate();
    }

    billsData.push(billData);
  });

  return billsData;
}

uploadHistoryList.addEventListener('click', async (e) => {
  if (e.target.classList.contains('view-history-btn')) {
    const uploadId = e.target.dataset.id
    const docRef = doc(db, `artifacts/sales-app/users/${currentUser.uid}/uploads`, uploadId)
    showLoading({ message: 'Fetching report...', value: 10 });
    const docSnap = await getDoc(docRef)
    if (docSnap.exists()) {
      const upload = docSnap.data()
      const billsData = await fetchAllBillsForUpload(uploadId)
      setupAndShowAnalysisView(billsData, `Analysis for ${upload.name}`)
    }
  }
  if (e.target.classList.contains('delete-history-btn')) {
    const uploadId = e.target.dataset.id
    if (confirm('Are you sure you want to delete this uploaded dataset? This action cannot be undone.')) {
      try {
        // Use the new callable Cloud Function for safe deletion
        const deleteUploadFunction = httpsCallable(functions, 'deleteUpload');
        const result = await deleteUploadFunction({ uploadId });

        console.log(`Deleted ${result.data.deletedBills} bills and upload document`);
        await loadUploadHistory(); // Refresh the history list
      } catch (error: any) {
        console.error('Error deleting upload:', error);
        alert('Failed to delete upload. Please try again.');
      }
    }
  }
})

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
document.getElementById('view-compiled-btn').addEventListener('click', async () => {
  if (!currentUser) return;

  const startTime = performance.now();
  showLoading({ message: 'Checking for data...', value: 0 });

  try {
    const uploadsCollectionRef = collection(db, `artifacts/sales-app/users/${currentUser.uid}/uploads`);
    const uploadsCountSnapshot = await getCountFromServer(uploadsCollectionRef);
    const currentUploadCount = uploadsCountSnapshot.data().count;
    
    const cachedResult = await getCachedData();

    let finalData;

    // Case 1: Cache is up-to-date. Load directly from device.
    if (cachedResult && cachedResult.uploadCount === currentUploadCount) {
      console.log('Cache is valid. Loading from IndexedDB.');
      showLoading({ message: 'Loading from device...', value: 100 });
      finalData = cachedResult.data;
    } 
    // Case 2: Cache is outdated BUT has the required timestamp. Fetch ONLY the new data.
    // THIS IS THE NEW CHECK to prevent the error.
    else if (cachedResult && currentUploadCount > cachedResult.uploadCount && cachedResult.lastTransactionDate instanceof Date) {
      console.log('Cache is outdated. Fetching only new records.');
      const existingData = cachedResult.data;
      const lastFetchDate = cachedResult.lastTransactionDate;

      showLoading({ message: `Loading ${existingData.length} records from device...`, value: 20 });

      // Query for documents newer than the last one in the cache
      const newDataQuery = query(
        collectionGroup(db, 'bills'),
        where('userId', '==', currentUser.uid),
        where('Sales Date In', '>', lastFetchDate)
      );
      
      const newDataSnapshot = await getDocs(newDataQuery);
      const newData = [];
      newDataSnapshot.forEach(doc => {
        const billData = doc.data();
        if (billData['Sales Date In']?.toDate) {
            billData['Sales Date In'] = billData['Sales Date In'].toDate();
        }
        newData.push(billData);
      });
      
      console.log(`Fetched ${newData.length} new records.`);
      showLoading({ message: `Found ${newData.length} new records. Combining...`, value: 80 });

      finalData = [...existingData, ...newData];
      await saveCompiledData(finalData, currentUploadCount); // Update the cache
    } 
    // Case 3: No cache exists, or the cache is in an old format. Do a full initial fetch.
    else {
      console.log('No valid cache or cache is in old format. Performing full refresh.');
      const baseQuery = query(collectionGroup(db, 'bills'), where('userId', '==', currentUser.uid));
      const totalBills = currentUploadCount > 0 ? (await getCountFromServer(baseQuery)).data().count : 0;
      
      if (totalBills === 0) {
        alert('No sales data has been uploaded yet.'); hideLoading(); return;
      }
      
      showLoading({ message: `Found ${totalBills} records. Starting download...`, value: 5 });
      const fetchedData = [];
      const PAGE_SIZE = 10000;
      let lastVisible = null;
      const paginatedQuery = query(baseQuery, orderBy('Sales Date In'));
      
      while (fetchedData.length < totalBills) {
          let pageQuery = lastVisible ? query(paginatedQuery, startAfter(lastVisible), limit(PAGE_SIZE)) : query(paginatedQuery, limit(PAGE_SIZE));
          const pageSnapshot = await getDocs(pageQuery);
          if (pageSnapshot.empty) break;

          pageSnapshot.forEach(billDoc => {
              const billData = billDoc.data();
              if (billData['Sales Date In']?.toDate) billData['Sales Date In'] = billData['Sales Date In'].toDate();
              fetchedData.push(billData);
          });

          lastVisible = pageSnapshot.docs[pageSnapshot.docs.length - 1];
          const fetchProgress = 5 + (fetchedData.length / totalBills) * 65;
          showLoading({ message: `Fetching records... (${fetchedData.length} / ${totalBills})`, value: Math.round(fetchProgress) });
      }
      finalData = fetchedData;
      await saveCompiledData(finalData, currentUploadCount);
    }

    // Now, run the analysis with the final combined data
    allSalesData = finalData;
    aiAnalysisResults = {};
    document.getElementById('analysis-title').textContent = 'Compiled Analysis of All Uploads';
    populateFilters(allSalesData);
    runAnalysis(startTime);

  } catch (error) {
    console.error("Failed to compile analysis:", error);
    hideLoading();
    alert(`An error occurred: ${error.message}`);
  }
});

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
  const currentData = allSalesData.filter((d) => d['Sales Date In'] >= currentStartDate && d['Sales Date In'] <= currentEndDate)
  const lastPeriodData = allSalesData.filter((d) => d['Sales Date In'] >= lastPeriodStartDate && d['Sales Date In'] <= lastPeriodEndDate)

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
  const data = chartDataForAI[chartId]

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
          setStore(key as keyof AppState, value)
        })
        applyAnalysisTextBindings(getStoreState())
      } catch (e) {
        console.error('Failed to parse structured data from AI response:', e)
      }
    }

    const chartBlock = analyzeBtn.closest('.bg-white.rounded-lg.shadow-md')
    const chartTitle = chartBlock.querySelector('h3').textContent
    aiAnalysisResults[chartId] = { title: chartTitle, content: html }
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
          setStore(key as keyof AppState, value)
        })
        applyAnalysisTextBindings(getStoreState())
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
  const analyzeBtn = e.target.closest('.analyze-btn')
  if (analyzeBtn) {
    const chartId = analyzeBtn.dataset.chartId
    await analyzeChart(chartId)
  }

  const toggleBtn = e.target.closest('.toggle-chart-btn')
  if (toggleBtn) {
    const contentId = toggleBtn.dataset.target
    const contentElement = document.querySelector(contentId)
    const chevron = toggleBtn.querySelector('.chevron-icon')

    contentElement.classList.toggle('hidden')
    chevron.classList.toggle('rotate-180')
  }
})

/**
 * Event listener for clicks on the analysis sidebar.
 *
 * @description
 * Handles clicks on links in the analysis sidebar to switch between sections.
 * Sets the active class on the clicked link and displays the corresponding section.
 * @returns {void}
 */
document.getElementById('analysis-sidebar').addEventListener('click', (e) => {
  if (e.target.tagName === 'A') {
    e.preventDefault()
    document.querySelectorAll('.sidebar-link').forEach((link) => link.classList.remove('active'))
    e.target.classList.add('active')

    const targetId = e.target.dataset.target
    document.querySelectorAll('.analysis-section').forEach((sec) => sec.classList.remove('active'))
    document.getElementById(`${targetId}-section`).classList.add('active')

    // Hide main filters for YoY and Konfigurasi tabs
    const showMainFilters = !['yoy', 'konfigurasi'].includes(targetId)
    document.getElementById('main-filters').style.display = showMainFilters ? 'block' : 'none'
  }
})

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
  chartDataForAI['apcPerJam'] = hourlyApc
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
  chartDataForAI['salesTrendHourlyDaily'] = heatmapData
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
  chartDataForAI['channelHourly'] = channelData
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
  chartDataForAI['channelWeekly'] = channelData
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
  const months = [...new Set(data.map((d) => d['Sales Date In'].toISOString().slice(0, 7)))].sort()
  data.forEach((d) => {
    const channel = d['Visit Purpose'] || 'Unknown'
    const month = d['Sales Date In'].toISOString().slice(0, 7)
    if (!channelData[channel]) {
      channelData[channel] = {}
    }
    channelData[channel][month] = (channelData[channel][month] || 0) + d.Revenue
  })
  chartDataForAI['channelMonthly'] = channelData
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

  const sortedMonths = Object.keys(monthlyIncrease).sort()
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

  const sortedMonths = Object.keys(monthlyBills).sort()
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

  const sortedWeeks = Object.keys(weeklyBills).sort()
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

  const sortedWeeks = Object.keys(weeklyBills).sort()
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

  const sortedMonths = Object.keys(monthlyBills).sort()
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

  const sortedMonths = Object.keys(monthlyDineIn).sort()
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

  const sortedMonths = [...new Set(dineInData.map((d) => d['Sales Date In'].toISOString().slice(0, 7)))].sort()
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

  const sortedDates = Object.keys(dailyHpp).sort()
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

  const sortedMonths = Object.keys(monthlyFoodCost).sort()
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

  const sortedDates = Object.keys(dailyData).sort()
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

  const sortedDates = Object.keys(dailyData).sort()
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
     const peakHour = hourlyTraffic.sort((a, b) => b.count - a.count)[0]?.hour || 12;

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
     const popularMenu = Object.entries(peakMenuQty).sort((a, b) => b[1] - a[1]).slice(0, 4);

     // 4. Find the average check range (25th to 75th percentile) during peak period
     const peakBillTotals = Object.values(peakHourData.reduce((acc, d) => {
         acc[d['Bill Number']] = (acc[d['Bill Number']] || 0) + d.Revenue;
         return acc;
     }, {})).sort((a, b) => a - b);

     const minCheck = peakBillTotals[Math.floor(peakBillTotals.length * 0.25)] || 0;
     const maxCheck = peakBillTotals[Math.floor(peakBillTotals.length * 0.75)] || 0;

     // 5. Update the store
     setStoreObj({
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
         return Object.entries(menuQty).sort((a, b) => b[1] - a[1])[0]?.[0] || 'N/A';
     };

     // 1. Find the top 3 busiest days (Peak Days)
     const dailyBills = Array(7).fill(0).map(() => new Set());
     data.forEach(d => {
         dailyBills[d['Sales Date In'].getDay()].add(d['Bill Number']);
     });
     const dayLabels = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
     const dailyTraffic = dailyBills.map((bills, i) => ({ dayIndex: i, name: dayLabels[i], count: bills.size }));
     const peakDays = dailyTraffic.sort((a, b) => b.count - a.count).slice(0, 3);
     const peakDayIndices = peakDays.map(d => d.dayIndex);

     // 2. Analyze transactions on Peak Days
     const peakDayData = data.filter(d => peakDayIndices.includes(d['Sales Date In'].getDay()));
     const peakDayBillTotals = Object.values(peakDayData.reduce((acc, d) => {
         acc[d['Bill Number']] = (acc[d['Bill Number']] || 0) + d.Revenue;
         return acc;
     }, {})).sort((a, b) => a - b);

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
     setStoreObj({
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

  const sortedWeeks = Object.keys(weeklySales).sort()
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

  const sortedWeeks = Object.keys(weeklyBills).sort()
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

  const sortedWeeks = Object.keys(weeklyBills).sort()
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
  const months = [...new Set(data.map((d) => d['Sales Date In'].toISOString().slice(0, 7)))].sort()
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
  const months = [...new Set(data.map((d) => d['Sales Date In'].toISOString().slice(0, 7)))].sort()
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
  const months = [...new Set(data.map((d) => d['Sales Date In'].toISOString().slice(0, 7)))].sort()
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
document.getElementById('back-to-dashboard-btn').addEventListener('click', () => showView('dashboard'))
document.getElementById('konfigurasi-btn').addEventListener('click', () => showView('konfigurasi'))
document.getElementById('back-to-dashboard-from-konfigurasi-btn').addEventListener('click', () => showView('dashboard'))

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

  const sortedBranches = Object.entries(branchSales).sort((a, b) => b - a)

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
     quadrants[key].sort((a, b) => b.revenue - a.revenue);
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
  const currentData = allSalesData.filter((d) => d['Sales Date In'] >= currentStartDate && d['Sales Date In'] <= currentEndDate);

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

  const sortedDates = Object.keys(dailyData).sort();
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

  const sortedDates = Object.keys(dailyTraffic).sort();
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
  const currentData = allSalesData.filter((d) => d['Sales Date In'] >= currentStartDate && d['Sales Date In'] <= currentEndDate)
  const lastPeriodData = allSalesData.filter((d) => d['Sales Date In'] >= lastPeriodStartDate && d['Sales Date In'] <= lastPeriodEndDate)

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
  billTotals.sort((a, b) => a - b);
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
  setStoreObj({
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

  setStoreObj({
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
      chartDataForAI['salesTrendHourlyDaily'] = datasets.map(ds => ({ [ds.label]: ds.data }));
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

  setStoreObj({
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

  setStoreObj({
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
  const labels = [...new Set(data.map(getGroupKey))].sort();
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

    setStoreObj({ monthlyIncreasePercentage: formatNumber(percentageIncrease, 0) });

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
    setStoreObj({
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
    setStoreObj({
        pageTitle: 'Kenali tren penjualan berbagai sales channel dari waktu ke waktu',
        hourlyChannelInsight: 'Sales channel yang paling diminati untuk sarapan adalah Dine-in, sedangkan untuk makan siang dan malam, GrabFood lebih diminati.',
        mainChannelInsight: 'Dine-in masih merupakan sales channel utama pada restoran anda.',
        monthlyChannelInsight: 'Pada awal bulan, konsumen anda cenderung untuk melakukan pemesanan online.',
    });
}

// In main.ts, add these two new functions

/**
 * Generate flexible multi-line trend chart for any metric grouped by sales channel.
 *
 * @description
 * Creates a customizable multi-line chart that can display APC, Total Check (TC), or Sales
 * trends across different sales channels, grouped by hour, day, or month. Each channel
 * gets its own trend line for easy comparison. Supports flexible time grouping and
 * metric selection for comprehensive channel performance analysis.
 *
 * @param data - Array of processed sales data rows with Revenue, Bill Number, Sales Date In, and Visit Purpose.
 * @param canvasId - HTML canvas element ID where the chart will be rendered.
 * @param groupBy - Time grouping method: 'hour' (0-23), 'day' (0-6, Sunday=0), or 'month' (YYYY-MM).
 * @param metric - Metric to display: 'APC' (Average Per Customer), 'TC' (Total Check), or 'Sales' (Revenue).
 * @returns This function does not return a value; it creates a Chart.js multi-line chart.
 *
 * @example
 * // Generate hourly APC trends by channel
 * const salesData = [
 *   { Revenue: 200000, "Bill Number": "001", "Sales Date In": new Date("2024-01-01 14:30"), "Visit Purpose": "Dine In" }
 * ];
 * generateChannelTrendChart(salesData, 'my-canvas', 'hour', 'APC');
 * // Creates multi-line chart showing hourly APC trends for each channel
 */
function generateChannelTrendChart(data: any[], canvasId: string, groupBy: string, metric: string): void {
  if (data.length === 0) return;

  const getGroupKey = (d) => {
    if (groupBy === 'hour') return d['Sales Date In'].getHours();
    if (groupBy === 'day') return d['Sales Date In'].getDay(); // 0 = Sunday
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
  const labels = [...new Set(data.map(getGroupKey))].sort((a,b) => a-b);
  const datasets = channels.map(channel => {
    const channelData = labels.map(label => {
      const stats = aggregated[label]?.[channel];
      if (!stats) return 0;

      if (metric === 'APC') return stats.bills.size > 0 ? stats.revenue / stats.bills.size : 0;
      if (metric === 'TC') return stats.bills.size;
      if (metric === 'Sales') return stats.revenue;
      return 0;
    });
    return { label: channel, data: channelData, tension: 0.2, fill: false };
  });

  const chartLabels = {
      day: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
      hour: labels.map(l => l.toString().padStart(2, '0')),
      month: labels,
  };

  createChart(canvasId, 'line', { labels: chartLabels[groupBy] || labels, datasets });
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
    setStoreObj({
        mainGoFoodInsight: 'Rata-rata ada 3 – 5 pesanan GoFood setiap jamnya pada restoran anda.',
        hourlyAPCInsightDinner: 'Rata-rata nilai pembelian meningkat pesat pada jam makan malam baik pada GoFood, dan GrabFood.',
        hourlyAPCInsightDineIn: 'Sedangkan pada Dine in, tidak terjadi perubahan yang signifikan dari jam ke jam.',
        weeklyAPCInsight: 'Rata-rata nilai pembelian pada weekend meningkat pesat baik pada GoFood, GrabFood, dan Dine In, namun lonjakan terbesar terjadi pada pembelian Dine In.',
        monthlyAPCInsight: 'Pada akhir bulan, rata-rata nilai pembelian menurun di semua sales channel, namun yang paling terdampak adalah GoFood.',
    });
}

/**
 * Generate Dine-In revenue month-over-month comparison with insights.
 *
 * @description
 * Analyzes Dine-In transaction data to compare revenue between current and previous
 * month, calculates percentage increase, and updates global store with insights.
 * Creates a comparative bar chart showing month-over-month Dine-In revenue performance
 * and generates formatted insight text for business reporting.
 *
 * @param data - Array of processed sales data rows with Visit Purpose, Sales Date In, and Revenue.
 * @returns This function does not return a value; it creates a Chart.js bar chart and updates store.
 *
 * @example
 * // Generate Dine-In revenue comparison with insights
 * const salesData = [
 *   { "Visit Purpose": "Dine In", "Sales Date In": new Date("2024-01-15"), Revenue: 3000000 },
 *   { "Visit Purpose": "Dine In", "Sales Date In": new Date("2024-02-15"), Revenue: 3500000 }
 * ];
 * generateDineInRevenueIncreaseChart(salesData);
 * // Creates bar chart and updates store with dineInIncreasePercentage and insight
 */
function generateDineInRevenueIncreaseChart(data: any[]): void {
    const endDate = new Date(document.getElementById('date-end').value);
    const currentMonth = endDate.getMonth();
    const currentYear = endDate.getFullYear();
    const prevMonth = currentMonth === 0 ? 11 : currentMonth - 1;
    const prevMonthYear = currentMonth === 0 ? currentYear - 1 : currentYear;

    const filterByMonth = (d, month, year) => d['Sales Date In'].getMonth() === month && d['Sales Date In'].getFullYear() === year;

    const dineInData = data.filter(d => d['Visit Purpose'] === 'Dine In');
    const currentMonthRevenue = dineInData.filter(d => filterByMonth(d, currentMonth, currentYear)).reduce((sum, d) => sum + d.Revenue, 0);
    const prevMonthRevenue = dineInData.filter(d => filterByMonth(d, prevMonth, prevMonthYear)).reduce((sum, d) => sum + d.Revenue, 0);

    const percentageIncrease = prevMonthRevenue > 0 ? ((currentMonthRevenue - prevMonthRevenue) / prevMonthRevenue) * 100 : (currentMonthRevenue > 0 ? 100 : 0);

    setStoreObj({
        dineInIncreasePercentage: formatNumber(percentageIncrease, 0),
        dineInIncreaseInsight: `Penjualan dine-in secara keseluruhan meningkat ${formatNumber(percentageIncrease,0)}%`
    });

    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

    createChart('dinein-increase-chart-pdf', 'bar', {
        labels: [monthNames[prevMonth], monthNames[currentMonth]],
        datasets: [{
            label: 'Dine In Revenue',
            data: [prevMonthRevenue, currentMonthRevenue],
            backgroundColor: ['#9CA3AF', '#4F46E5']
        }]
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
    const topGrowth = [...comparison].sort((a, b) => b.tcGrowth - a.tcGrowth).slice(0, 2);
    setStoreObj({
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
    const topSales = [...comparison].sort((a, b) => b.currentSales - a.currentSales).slice(0, 2);
    setStoreObj({
        topSalesChan1Name: topSales[0]?.name || '',
        topSalesChan1Nominal: formatNumber(topSales[0]?.currentSales),
        topSalesChan2Name: topSales[1]?.name || '',
        topSalesChan2Nominal: formatNumber(topSales[1]?.currentSales),
    });

    // 3. Top Monthly Increase Channels
    const topIncrease = [...comparison].sort((a, b) => b.salesIncreaseNominal - a.salesIncreaseNominal).slice(0, 2);
    setStoreObj({
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
    const topByQuantity = [...foodArray].sort((a, b) => b.quantity - a.quantity).slice(0, 3);
    const podiumNames = topByQuantity.map(item => item.name);

    // 2. Top 5 Revenue Contributor
    const topByRevenue = [...foodArray].sort((a, b) => b.revenue - a.revenue).slice(0, 5);
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
        return Object.entries(slot.items).sort((a, b) => b[1] - a[1])[0][0];
    };

    // Update the store with all calculated values
    setStoreObj({
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
    const topByQuantity = [...drinkArray].sort((a, b) => b.quantity - a.quantity).slice(0, 3);
    const podiumNames = topByQuantity.map(item => item.name);

    // 2. Top 5 Revenue Contributor
    const topByRevenue = [...drinkArray].sort((a, b) => b.revenue - a.revenue).slice(0, 5);
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
        return Object.entries(slot.items).sort((a, b) => b[1] - a[1])[0][0];
    };

    // Update the store with all calculated values
    setStoreObj({
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
    const topGrowth = [...comparison].sort((a, b) => b.tcGrowth - a.tcGrowth).slice(0, 2);
    setStoreObj({
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
    const topSales = [...comparison].sort((a, b) => b.currentSales - a.currentSales).slice(0, 2);
    setStoreObj({
        topOutlet1Name: topSales[0]?.name || '',
        topOutlet1Nominal: formatNumber(topSales[0]?.currentSales),
        topOutlet2Name: topSales[1]?.name || '',
        topOutlet2Nominal: formatNumber(topSales[1]?.currentSales),
    });

    // 3. Top Monthly Increase Outlets
    const topIncrease = [...comparison].sort((a, b) => b.salesIncreaseNominal - a.salesIncreaseNominal).slice(0, 2);
    setStoreObj({
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
    const sortedDates = Object.keys(dailyHpp).sort();

    // 4. Update the store with all calculated values
    setStoreObj({
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
    const topCost = [...outletAnalysis].sort((a, b) => b.costPercent - a.costPercent).slice(0, 4);
    const topVariance = [...outletAnalysis].sort((a, b) => b.variance - a.variance).slice(0, 4);

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

    setStoreObj({
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
    spendings.sort((a,b)=> a-b);
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
    const newestMembers = Object.values(customerProfiles).sort((a, b) => b.firstSeen - a.firstSeen).slice(0, 10);
    const topCustomers = Object.values(customerProfiles).sort((a, b) => b.totalSpend - a.totalSpend).slice(0, 3);

    const newestMemberUpdate = {};
    newestMembers.forEach((item, i) => {
        newestMemberUpdate[`newestMember${i+1}`] = item.name;
    });

    // 4. Update the store
    setStoreObj({
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
    const topBranchName = Object.entries(revenueByBranch).sort((a, b) => b[1] - a[1])[0][0];

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
    const sortedDates = Object.keys(dailyStats).sort();

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
    const peakSales = [...dailySales].sort((a,b) => b.revenue - a.revenue);
    const peakTraffic = [...dailyTraffic].sort((a,b) => b.traffic - a.traffic)[0];
    const lowestTraffic = [...dailyTraffic].sort((a,b) => a.traffic - b.traffic)[0];

    // 7. Update Store
    setStoreObj({
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
    setStoreObj({
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
        return Object.entries(menuQty).sort((a, b) => b[1] - a[1]).slice(0, count).map(item => item[0]);
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
    const peakHour2 = hourlyTraffic.sort((a, b) => b.count - a.count)[0]?.hour || 18;

    const peakHour2Start = peakHour2;
    const peakHour2End = peakHour2 + 2;
    const peakHour2Data = data.filter(d => d['Sales Date In'].getHours() >= peakHour2Start && d['Sales Date In'].getHours() < peakHour2End);

    // 2. Analyze Peak Hour 2
    const popularDinnerMenu = getTopMenu(peakHour2Data, 4);
    const peak2BillTotals = Object.values(peakHour2Data.reduce((acc, d) => {
        acc[d['Bill Number']] = (acc[d['Bill Number']] || 0) + d.Revenue;
        return acc;
    }, {})).sort((a, b) => a - b);
    const minSpend = peak2BillTotals[Math.floor(peak2BillTotals.length * 0.25)] || 0;
    const maxSpend = peak2BillTotals[Math.floor(peak2BillTotals.length * 0.75)] || 0;

    // 3. Analyze Off-Peak Hours
    const breakfastData = data.filter(d => d['Sales Date In'].getHours() >= 7 && d['Sales Date In'].getHours() < 10);
    const postLunchData = data.filter(d => d['Sales Date In'].getHours() >= 14 && d['Sales Date In'].getHours() < 17);

    // 4. Update the store
    setStoreObj({
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

    setStoreObj({
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
    setStoreObj({
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

    const sortedChannels = Object.entries(channelSales).sort((a, b) => b[1] - a[1]);

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
        return Object.entries(menuQty).sort((a,b)=>b[1]-a[1])[0]?.[0] || 'N/A';
    };

    // Find top menu for each of the key channels
    const goFoodTopMenu = getTopMenuForChannel(data, 'GoFood');
    const grabFoodTopMenu = getTopMenuForChannel(data, 'GrabFood');
    const shopeeFoodTopMenu = getTopMenuForChannel(data, 'ShopeeFood');
    const dineInTopMenu = getTopMenuForChannel(data, 'Dine In');

    setStoreObj({
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
    const topBranchName = Object.entries(revenueByBranch).sort((a, b) => b[1] - a[1])[0][0];

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
    const topBranchName = Object.entries(revenueByBranch).sort((a, b) => b[1] - a[1])[0][0];

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
    const topBranchName = Object.entries(revenueByBranch).sort((a, b) => b[1] - a[1])[0][0];

    // 2. Filter data for only the top branch
    const topBranchData = data.filter(d => d.Branch === topBranchName);

    // 3. Reuse our existing chart and insight functions with the filtered data
    generateChannelTrendChart(topBranchData, 'apc-trend-channel-hour-pdf', 'hour', 'APC');
    generateChannelTrendChart(topBranchData, 'apc-trend-channel-week-pdf', 'day', 'APC');
    generateChannelTrendChart(topBranchData, 'apc-trend-channel-month-pdf', 'month', 'APC');

    // The text insights are the same as the general page, so we can reuse this function
    generateGoFoodInsights(topBranchData);

    // Update the main title to include the top branch name
    setStore('branchName', topBranchName);
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
    setStoreObj({
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
