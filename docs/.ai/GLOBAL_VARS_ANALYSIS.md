# Globals Inventory — Exhaustive List

Generated on: 2025-09-02

This file lists top-level/module-level globals and runtime global assignments found in `src/`.
It marks whether they are mutated during the "view analysis" flow (the code executed when `#view-compiled-btn` is clicked, i.e., `viewCompiledAnalysis`).

Assumptions
- "Global variable" includes top-level `let|var|const` (module scope) and `window`/`globalThis` properties.
- "Mutated on view analysis" means the variable (binding or referenced object) is written to during `viewCompiledAnalysis` or functions it calls (directly or indirectly), based on static analysis of the code in `src/`.
- Line numbers are approximate. Inspect the referenced files for exact locations.

Legend
- Declaration: exact code snippet or summary
- Type: `let`/`const`/`var`/`export`/`window`
- Mutated on view analysis: Yes / No / Maybe


## Table of Globals

| Name | File | Declaration (summary) | Type | Mutated on view analysis? | Notes |
|---|---|---:|---:|---:|---|
| firebaseConfig | `src/main.ts` | `const firebaseConfig = { ... }` | const | No | Firebase config object — read by initialization only. |
| app | `src/main.ts` | `const app = initializeApp(firebaseConfig)` | const | No | Firebase app instance — read for services. |
| auth | `src/main.ts` | `const auth = getAuth(app)` | const | No | Firebase auth instance; used elsewhere, not assigned in view flow. |
| db | `src/main.ts` | `const db = getFirestore(app)` | const | No | Firestore instance used in queries performed by `viewCompiledAnalysis` (read-only variable). |
| functions | `src/main.ts` | `const functions = getFunctions(app)` | const | No | Callable functions reference. |
| storage | `src/main.ts` | `const storage = getStorage(app)` | const | No | Firebase storage reference. |
| currentUser | `src/main.ts` | `let currentUser = null` | let | Maybe | Read by `viewCompiledAnalysis` (requires auth). Usually set by auth state change earlier; not reassigned in `viewCompiledAnalysis`. |
| currentUserRole | `src/main.ts` | `let currentUserRole = 'user'` | let | No | Role flag used by UI control; not changed by view analysis. |
| allSalesData | `src/main.ts` | `let allSalesData = []` | let | Yes | ASSIGNED in `setupAndShowAnalysisView(...)` which `viewCompiledAnalysis` calls. Used heavily by `runAnalysis`. |
| charts | `src/main.ts` | `let charts = {}` | let | Yes | Chart instances map updated by `createChart()`/`destroyCharts()` called in `runAnalysis`. |
| chartDataForAI | `src/main.ts` | `const chartDataForAI = {}` | const (object mutated) | Yes | Object properties are set by many generator functions during analysis (e.g., `chartDataForAI['pnlAnalysis'] = ...`). |
| aiAnalysisResults | `src/main.ts` | `let aiAnalysisResults = {}` | let | Yes | Reset in `setupAndShowAnalysisView` and later used for PDF/AI caching. |
| adminCredentials | `src/main.ts` | `let adminCredentials = null` | let | No | Used during auth flows, not mutated by view analysis. |
| yoyYearSelectInitialized | `src/main.ts` | `let yoyYearSelectInitialized = false` | let | Yes | Set to true by `generateYoYAnalysisFromSummaries` invoked during analysis setup. |
| monthlyComparisonInitialized | `src/main.ts` | `let monthlyComparisonInitialized = false` | let | Yes | Set in `setupMonthlyComparison` called when analysis is shown. |
| monthlyComparisonTargets | `src/main.ts` | `let monthlyComparisonTargets = {};` | let | Yes | Read/written in `runMonthlyComparison` (called during analysis setup). |
| omzetComparisonSelect | `src/main.ts` | `let omzetComparisonSelect: SlimSelect | null = null;` | let | Maybe | Initialized by `setupMonthlyOmzetComparisonChart` which can be called as part of analysis flow. |
| currentPnlPeriod | `src/main.ts` | `let currentPnlPeriod: string | null = null;` | let | Maybe | Used by P&L selectors; may be set by P&L setup functions during analysis. |
| menuTrend24MonthSelect | `src/main.ts` | `let menuTrend24MonthSelect: SlimSelect | null = null;` | let | Maybe | Initialized by menu-trend setup functions called during analysis. |
| generalKeuanganSelectorInitialized | `src/main.ts` | `let generalKeuanganSelectorInitialized = false;` | let | Yes | Set in `setupGeneralKeuanganPeriodSelector()` invoked directly by `viewCompiledAnalysis`. |
| generalMenuTrendSelect | `src/main.ts` | `let generalMenuTrendSelect: SlimSelect | null = null;` | let | Yes | Can be initialized (and assigned to `window.generalMenuTrendSelect`) by `setupGeneralMenuTrendChart` called during analysis. |
| waktuKeuanganSelectorsInitialized | `src/main.ts` | `let waktuKeuanganSelectorsInitialized = false;` | let | Maybe | Selector init flag mutated by setup functions invoked in the analysis flow. |
| waktuPenjualanSelectorsInitialized | `src/main.ts` | `let waktuPenjualanSelectorsInitialized = false;` | let | Maybe | Same as above. |
| waktuProdukChannelSelectorsInitialized | `src/main.ts` | `let waktuProdukChannelSelectorsInitialized = false;` | let | Maybe | Same as above. |
| waktuMenuTrendSelect | `src/main.ts` | `let waktuMenuTrendSelect: SlimSelect | null = null;` | let | Maybe | Selector ref; may be assigned when analysis creates selector. |
| cabangKeuanganSelectorsInitialized | `src/main.ts` | `let cabangKeuanganSelectorsInitialized = false;` | let | Maybe | Initialization flag used during analysis. |
| cabangPenjualanSelectorsInitialized | `src/main.ts` | `let cabangPenjualanSelectorsInitialized = false;` | let | Maybe | Initialization flag used during analysis. |
| cabangProdukChannelSelectorsInitialized | `src/main.ts` | `let cabangProdukChannelSelectorsInitialized = false;` | let | Maybe | Initialization flag used during analysis. |
| cabangMenuTrendSelect | `src/main.ts` | `let cabangMenuTrendSelect: SlimSelect | null = null;` | let | Maybe | Selector ref that may be assigned. |
| generalPenjualanSelectorInitialized | `src/main.ts` | `let generalPenjualanSelectorInitialized = false;` | let | Maybe | Flag mutated by analysis setup functions. |
| generalProdukChannelSelectorInitialized | `src/main.ts` | `let generalProdukChannelSelectorInitialized = false;` | let | Maybe | Flag mutated by analysis setup functions. |
| activeSalesTarget | `src/main.ts` | `let activeSalesTarget = {};` | let | Maybe | Used by target UI; mutated by target code outside analysis but may be touched indirectly. |
| generalInvestasiSelectorInitialized | `src/main.ts` | `let generalInvestasiSelectorInitialized = false;` | let | Maybe | Setup flag. |
| cabangInvestasiSelectorInitialized | `src/main.ts` | `let cabangInvestasiSelectorInitialized = false;` | let | Maybe | Setup flag. |
| plAnalysisView | `src/main.ts` | `const plAnalysisView = document.getElementById('pl-analysis-view');` | const (DOM) | No (binding) / DOM mutated | DOM element reference; `showView` toggles visibility via classList. |
| defaultGeminiConfig | `src/main.ts` | `const defaultGeminiConfig = Object.freeze({ apiKey:'', prompts })` | const | No | Frozen defaults. |
| geminiConfig | `src/main.ts` | `const geminiConfig = structuredClone(defaultGeminiConfig)` | const (object) | Maybe | Object may be modified by config UI (but binding not reassigned); used by AI prompt generation. |
| authView, dashboardView, analysisView, userManagementView, konfigurasiView | `src/main.ts` | `const ... = document.getElementById(...)` | const (DOM refs) | DOM mutated | Refs to DOM elements — classList and innerHTML are changed by `showView` and analysis setup. |
| authError, signupError, uploadError, uploadHistoryList, noUploadsMsg, userListError, createUserFeedback, periodError | `src/main.ts` | `const ... = document.getElementById(...)` | const (DOM refs) | DOM mutated | UI elements modified by code during analysis and uploads. |
| DB_NAME, STORE_NAME | `src/main.ts` | `const DB_NAME = 'FinalyticsCacheDB'; const STORE_NAME = 'compiledDataStore';` | const | No | Constants used for IndexedDB storage; not reassigned. |
| quickUploadModal, quickUploadTitle, quickUploadFileInput, quickUploadError, quickUploadConfirmBtn, quickUploadProgressContainer, quickUploadProcessingStatus | `src/main.ts` | `const ... = document.getElementById(...)` | const (DOM refs) | DOM mutated | Quick upload UI; mutated during quick upload operations; `viewCompiledAnalysis` indirectly triggers table refresh which may affect them. |
| typeDisplayNames | `src/main.ts` | `const typeDisplayNames = {...}` | const | No | Read-only mapping. |
| store | `src/store.ts` | `const store = createStore<AppStore>(...)` (exported) | const (store instance) | Yes (store state mutated) | `viewCompiledAnalysis` calls `$store.resetActiveViewData()` and `setupPageSummary` interacts with `store` state. |
| resetActiveViewData / setActiveViewData / setStore / setStoreObj / getStore / getStoreState | `src/store.ts` | exported functions that mutate/read store state | export functions | Yes | They mutate the underlying `store` state (e.g., `activeViewData`, `viewData`). Called by page summary setup and analysis flow. |
| prompts, chartPrompts, viewPromptCreators | `src/prompt.ts` | `export const prompts = Object.freeze({}), export const chartPrompts = Object.freeze({..}), export const viewPromptCreators = Object.freeze({..})` | export const (frozen) | No | Frozen prompt templates and prompt factories used by `setupPageSummary` and AI calls. |
| globalConfigService | `src/services/globalConfigService.ts` | `export const globalConfigService = new GlobalConfigService()` | export const (singleton) | No | Instance used by `getGeminiAnalysis` to retrieve API key. |
| COLLECTION | `src/services/analysisCacheService.ts` | `const COLLECTION = 'analysisCache'` | const | No | Constant used by cache service. |
| functions in `analysisCacheService` (findLiveCache, createLiveCache, deactivateHistoricalCache) | `src/services/analysisCacheService.ts` | functions referencing Firestore | functions | Yes (server writes) | `setupPageSummary` calls these during cache check / creation. They mutate remote Firestore, not top-level bindings. |
| window.generalMenuTrendSelect | `src/main.ts` | assigned via `window.generalMenuTrendSelect = new SlimSelect({...})` | window property | Yes | Assigned when menu trend select is initialized during analysis setup. |
| window.jspdf | `src/main.ts` | used as `const { jsPDF } = window.jspdf` | window property (external lib) | No | Read-only usage for PDF generation. |
| window.crypto (web API) | `src/utils/hash.ts` | `window.crypto.subtle.digest()` usage | window API | No | Used by hashing utilities during cache checks invoked by `setupPageSummary`. |
| Various local `const` used within functions across files (e.g., loop vars, format functions, labels) | many | local constants inside functions | const (local) | No | Not module-level; not included as globals. |


## Notes and Next Steps
- This table is exhaustive for module-level top-level declarations and `window` properties referenced in `src/` (based on static scanning).
- I interpreted "mutated on view analysis" conservatively: `Yes` when code clearly assigns or mutates the variable during the `viewCompiledAnalysis` call-path; `Maybe` where the variable is a selector/flag that may or may not be initialized depending on UI state.
