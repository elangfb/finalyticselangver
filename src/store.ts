import { produce } from 'immer';
import { createStore } from 'zustand/vanilla'
import { deepmergeCustom } from 'deepmerge-ts';
import { generateSHA256Sync } from './utils/hash';

export interface ViewData<TData = any, TFilters = {[key: string]: any}> {
  viewId: string;
  data: TData;
  filters: TFilters;
  filterHash?: string; // Add hash to detect filter changes
}

/**
 * Analysis state interface containing all mutable state for the analysis view.
 *
 * @description
 * Centralizes all analysis-related state that was previously scattered as global variables.
 * Includes data storage, UI component references, initialization flags, and configuration.
 * This state is automatically reset when navigating away from the analysis view to prevent
 * memory leaks and ensure clean state on re-entry.
 */
export interface AnalysisState {
  // Data Storage
  allSalesData: any[];
  chartDataForAI: Record<string, any>;
  aiAnalysisResults: Record<string, any>;
  charts: Record<string, any>;
  currentPnlData: any;

  // UI Initialization Flags
  initFlags: {
    yoyYearSelectInitialized: boolean;
    monthlyComparisonInitialized: boolean;
    generalKeuanganSelectorInitialized: boolean;
    waktuKeuanganSelectorsInitialized: boolean;
    waktuPenjualanSelectorsInitialized: boolean;
    waktuProdukChannelSelectorsInitialized: boolean;
    cabangKeuanganSelectorsInitialized: boolean;
    cabangPenjualanSelectorsInitialized: boolean;
    cabangProdukChannelSelectorsInitialized: boolean;
    generalPenjualanSelectorInitialized: boolean;
    generalProdukChannelSelectorInitialized: boolean;
    generalInvestasiSelectorInitialized: boolean;
    cabangInvestasiSelectorInitialized: boolean;
  };

  // UI Component References
  uiComponents: {
    omzetComparisonSelect: any;
    menuTrend24MonthSelect: any;
    generalMenuTrendSelect: any;
    waktuMenuTrendSelect: any;
    cabangMenuTrendSelect: any;
  };

  // Configuration/State
  config: {
    monthlyComparisonTargets: Record<string, any>;
    currentPnlPeriod: string | null;
    activeSalesTarget: Record<string, any>;
  };
}

export interface AnalysisActions {
  resetAnalysisState: () => void;
  getAnalysisState: () => AnalysisState;
  setAnalysisState: <K extends keyof AnalysisState>(key: K, value: AnalysisState[K]) => void;
  updateAnalysisFlag: <K extends keyof AnalysisState['initFlags']>(flag: K, value: boolean) => void;
  updateAnalysisComponent: <K extends keyof AnalysisState['uiComponents']>(component: K, value: AnalysisState['uiComponents'][K]) => void;
  updateAnalysisConfig: <K extends keyof AnalysisState['config']>(config: K, value: AnalysisState['config'][K]) => void;
}

/**
 * Main application state interface extending basic state with Zustand store methods.
 *
 * @description
 * Contains view data management, active view tracking, and complete analysis state.
 * The analysisState property contains all state that was previously global variables,
 * enabling proper cleanup and reset functionality.
 */
export interface AppState {
  viewData: {[key: string]: ViewData};
  activeViewData?: ViewData;
  analysisState: AnalysisState;
}

export interface AppActions {
  resetActiveViewData: () => void;
  setActiveViewData: (viewId: string, data: any, filters?: {[key: string]: any}) => void;
  clearAllViewData: () => void;
  clearViewData: (viewId: string) => void;
  trySetFromExistingViewData: (viewId: string) => void;
}

export interface AppStore extends AppState, AppActions, AnalysisActions {
  setStoreKV: <K extends keyof AppState>(key: K, value: AppState[K]) => void;
  setStorePartial: (obj: Partial<AppState>) => void;
}

/**
 * Factory function to create default analysis state with all properties reset.
 *
 * @description
 * Creates a fresh instance of AnalysisState with all arrays empty, objects empty,
 * flags set to false, and component references set to null. Used during store
 * initialization and when resetting analysis state on view navigation.
 *
 * @returns Fresh AnalysisState instance with default values
 */
function createDefaultAnalysisState(): AnalysisState {
  return {
    // Data Storage
    allSalesData: [],
    chartDataForAI: {},
    aiAnalysisResults: {},
    charts: {},
    currentPnlData: null,

    // UI Initialization Flags
    initFlags: {
      yoyYearSelectInitialized: false,
      monthlyComparisonInitialized: false,
      generalKeuanganSelectorInitialized: false,
      waktuKeuanganSelectorsInitialized: false,
      waktuPenjualanSelectorsInitialized: false,
      waktuProdukChannelSelectorsInitialized: false,
      cabangKeuanganSelectorsInitialized: false,
      cabangPenjualanSelectorsInitialized: false,
      cabangProdukChannelSelectorsInitialized: false,
      generalPenjualanSelectorInitialized: false,
      generalProdukChannelSelectorInitialized: false,
      generalInvestasiSelectorInitialized: false,
      cabangInvestasiSelectorInitialized: false,
    },

    // UI Component References
    uiComponents: {
      omzetComparisonSelect: null,
      menuTrend24MonthSelect: null,
      generalMenuTrendSelect: null,
      waktuMenuTrendSelect: null,
      cabangMenuTrendSelect: null,
    },

    // Configuration/State
    config: {
      monthlyComparisonTargets: {},
      currentPnlPeriod: null,
      activeSalesTarget: {},
    },
  };
}

/**
 * Safely execute cleanup function with error handling and debug logging.
 *
 * @description
 * Provides safe cleanup execution for UI components that may fail during destruction.
 * Logs cleanup failures as debug messages and continues execution to prevent crashes
 * during view reset operations. Used for cleaning up Chart.js and SlimSelect instances.
 *
 * @param componentRef - Reference to component being cleaned up
 * @param cleanupFn - Function to execute for cleanup
 * @param componentName - Name of component for debug logging
 */
function safeCleanup(componentRef: any, cleanupFn: () => void, componentName: string) {
  try {
    if (componentRef) {
      cleanupFn();
    }
  } catch (error) {
    console.debug(`Failed to cleanup ${componentName}:`, error);
    // Continue execution - don't throw
  }
}

const store = createStore<AppStore>((set, get) => ({
  viewData: {},
  activeViewData: undefined,
  analysisState: createDefaultAnalysisState(),

  resetActiveViewData: () => set({ activeViewData: undefined }),

  // Clear all cached view data (useful for memory management)
  clearAllViewData: () => set(produce((state: AppState) => {
    state.viewData = {};
    state.activeViewData = undefined;
  })),

  // Clear specific view data when filters change significantly
  clearViewData: (viewId: string) => set(produce((state: AppState) => {
    delete state.viewData[viewId];
  })),

  setActiveViewData: (viewId: string, data: any, filters?: {[key: string]: any}) => {
    // Helper function to merge data using deepmerge-ts
    const mergeData = deepmergeCustom({ mergeArrays: false, mergeSets: false });

    // Helper function to update view data
    const updateViewData = (viewData: ViewData, mergedData: any) => {
      const updated = { ...viewData, data: mergedData };
      return { viewData: updated, activeViewData: updated };
    };

    // If no filters provided, assume this is a chart-function level call - just merge data
    if (!filters) {
      set(produce((state: AppState) => {
        const existingViewData = state.viewData[viewId];
        if (existingViewData) {
          // Merge with existing data
          const mergedData = mergeData(existingViewData.data, data);
          const result = updateViewData(existingViewData, mergedData);
          state.viewData[viewId] = result.viewData;
          state.activeViewData = result.activeViewData;
        } else {
          // Create new entry without filters
          const newViewData = { viewId, data, filters: { viewId } };
          state.viewData[viewId] = newViewData;
          state.activeViewData = newViewData;
        }
      }));
      return;
    }

    const filtersWithId = { viewId, ...filters }
    const filtersHash = generateSHA256Sync(filtersWithId)

    set(produce((state: AppState) => {
      const existingViewData = state.viewData[viewId];

      // Check if we need to reset data due to filter changes
      const shouldResetData = !existingViewData || existingViewData.filterHash !== filtersHash;

      if (shouldResetData) {
        // Filters changed or first time - store new data
        const newViewData = { viewId, data, filters: filtersWithId, filterHash: filtersHash };
        state.viewData[viewId] = newViewData;
        state.activeViewData = newViewData;
      } else {
        // Same filters - merge with existing data
        const mergedData = mergeData(existingViewData.data, data);
        const result = updateViewData(existingViewData, mergedData);
        state.viewData[viewId] = result.viewData;
        state.activeViewData = result.activeViewData;
      }
    }));
  },

  trySetFromExistingViewData: (viewId: string) => {
    const existingViewData = get().viewData[viewId];
    if (existingViewData) set({ activeViewData: existingViewData });
  },

  /**
   * Set individual application store property with type-safe key-value assignment.
   *
   * @description
   * Provides type-safe method to update single store property by key-value pair.
   * Uses generic constraints to ensure compile-time type checking between key
   * and value types, preventing runtime errors from type mismatches. Enables
   * precise, controlled updates to specific store properties with full TypeScript
   * type safety and IntelliSense support.
   *
   * @param key - Property key from AppState interface to update.
   * @param value - Type-safe value matching the property's expected type.
   * @returns This function does not return a value; it updates the store property.
   *
   * @example
   * // Set individual store properties with type safety
   * setStoreKV('pageTitle', 'Monthly Sales Report');
   * setStoreKV('currentOmzetFormatted', 'Rp 5,000,000');
   * setStoreKV('isLoading', false);
   * // TypeScript ensures value types match property expectations
   */
  setStoreKV: <K extends keyof AppState>(key: K, value: AppState[K]) =>
    set({ [key]: value } as Partial<AppStore>),

  /**
   * Batch update multiple application store properties with single operation.
   *
   * @description
   * Performs bulk updates to the application store by merging provided object
   * properties into the existing store state using Object.assign. Enables
   * efficient batch operations for updating multiple related store properties
   * simultaneously, commonly used for updating analysis results, formatted
   * metrics, and UI state in single atomic operation.
   *
   * @param obj - Partial AppState object containing key-value pairs to merge into store.
   * @returns This function does not return a value; it updates the store in-place.
   *
   * @example
   * // Batch update multiple store properties
   * setStorePartial({
   *   pageTitle: "Sales Analysis",
   *   currentOmzetFormatted: "Rp 5,000,000",
   *   currentCheckFormatted: "150"
   * });
   * // Updates all specified properties in single operation
   */
  setStorePartial: (obj: Partial<AppState>) => set(obj),

  /**
   * Reset analysis state with proper cleanup of UI components.
   *
   * @description
   * Performs comprehensive cleanup of analysis state including:
   * - Destroying Chart.js instances to prevent memory leaks
   * - Cleaning up SlimSelect instances with proper .destroy() calls
   * - Clearing window properties
   * - Resetting all state to default values
   * Uses safe cleanup with debug logging to prevent crashes.
   */
  resetAnalysisState: () => {
    const currentState = get().analysisState;

    // Cleanup Chart.js instances
    safeCleanup(currentState.charts, () => {
      // Call existing destroyCharts function if available
      if (typeof window !== 'undefined' && (window as any).destroyCharts) {
        (window as any).destroyCharts();
      } else {
        // Fallback: destroy individual charts
        Object.values(currentState.charts).forEach((chart: any) => {
          if (chart && typeof chart.destroy === 'function') {
            chart.destroy();
          }
        });
      }
    }, 'Chart.js instances');

    // Cleanup SlimSelect instances
    Object.entries(currentState.uiComponents).forEach(([name, component]) => {
      safeCleanup(component, () => {
        if (component && typeof component.destroy === 'function') {
          component.destroy();
        }
      }, `SlimSelect ${name}`);
    });

    // Clear window properties
    safeCleanup((window as any).generalMenuTrendSelect, () => {
      if ((window as any).generalMenuTrendSelect && typeof (window as any).generalMenuTrendSelect.destroy === 'function') {
        (window as any).generalMenuTrendSelect.destroy();
      }
      (window as any).generalMenuTrendSelect = null;
    }, 'window.generalMenuTrendSelect');

    // Reset state to defaults
    set(produce((state: AppState) => {
      state.analysisState = createDefaultAnalysisState();
    }));

    console.debug('Analysis state reset completed');
  },

  /**
   * Get current analysis state.
   */
  getAnalysisState: () => get().analysisState,

  /**
   * Update specific analysis state property.
   */
  setAnalysisState: <K extends keyof AnalysisState>(key: K, value: AnalysisState[K]) =>
    set(produce((state: AppState) => {
      state.analysisState[key] = value;
    })),

  /**
   * Update specific initialization flag.
   */
  updateAnalysisFlag: <K extends keyof AnalysisState['initFlags']>(flag: K, value: boolean) =>
    set(produce((state: AppState) => {
      state.analysisState.initFlags[flag] = value;
    })),

  /**
   * Update specific UI component reference.
   */
  updateAnalysisComponent: <K extends keyof AnalysisState['uiComponents']>(component: K, value: AnalysisState['uiComponents'][K]) =>
    set(produce((state: AppState) => {
      state.analysisState.uiComponents[component] = value;
    })),

  /**
   * Update specific configuration property.
   */
  updateAnalysisConfig: <K extends keyof AnalysisState['config']>(config: K, value: AnalysisState['config'][K]) =>
    set(produce((state: AppState) => {
      state.analysisState.config[config] = value;
    })),
}))

export function resetActiveViewData(): void {
  store.getState().resetActiveViewData();
}

export function setActiveViewData(viewId: string, data: any, filters?: {[key: string]: any}): void {
  store.getState().setActiveViewData(viewId, data, filters);
}

export function clearAllViewData(): void {
  store.getState().clearAllViewData();
}

export function clearViewData(viewId: string): void {
  store.getState().clearViewData(viewId);
}

/**
 * Attempt to restore existing view data for the specified view ID.
 *
 * @description
 * Searches for previously cached view data by view ID and sets it as the active
 * view data if found. This is useful for restoring view state when returning to
 * a previously visited view without re-running expensive data fetching operations.
 * If no cached data exists for the view ID, the function does nothing.
 *
 * @param viewId - The unique identifier for the view to restore
 *
 * @example
 * // Restore cached data for the waktu-keuangan view
 * trySetFromExistingViewData('waktu-keuangan');
 *
 * // Used in initialization guards to restore state
 * if (getInitFlag('waktuKeuanganSelectorsInitialized')) {
 *   trySetFromExistingViewData('waktu-keuangan');
 *   return;
 * }
 */
export function trySetFromExistingViewData(viewId: string): void {
  store.getState().trySetFromExistingViewData(viewId);
}

/**
 * Set individual application store property with type-safe key-value assignment.
 *
 * @description
 * Provides type-safe method to update single store property by key-value pair.
 * Uses generic constraints to ensure compile-time type checking between key
 * and value types, preventing runtime errors from type mismatches. Enables
 * precise, controlled updates to specific store properties with full TypeScript
 * type safety and IntelliSense support.
 *
 * @param key - Property key from AppState interface to update.
 * @param value - Type-safe value matching the property's expected type.
 * @returns This function does not return a value; it updates the store property.
 *
 * @example
 * // Set individual store properties with type safety
 * setStoreKV('pageTitle', 'Monthly Sales Report');
 * setStoreKV('currentOmzetFormatted', 'Rp 5,000,000');
 * setStoreKV('isLoading', false);
 * // TypeScript ensures value types match property expectations
 */
export function setStoreKV<K extends keyof AppState>(key: K, value: AppState[K]): void {
  store.getState().setStoreKV(key, value);
}

/**
 * Batch update multiple application store properties with single operation.
 *
 * @description
 * Performs bulk updates to the application store by merging provided object
 * properties into the existing store state using Object.assign. Enables
 * efficient batch operations for updating multiple related store properties
 * simultaneously, commonly used for updating analysis results, formatted
 * metrics, and UI state in single atomic operation.
 *
 * @param obj - Partial AppState object containing key-value pairs to merge into store.
 * @returns This function does not return a value; it updates the store in-place.
 *
 * @example
 * // Batch update multiple store properties
 * setStorePartial({
 *   pageTitle: "Sales Analysis",
 *   currentOmzetFormatted: "Rp 5,000,000",
 *   currentCheckFormatted: "150"
 * });
 * // Updates all specified properties in single operation
 */
export function setStorePartial(obj: Partial<AppState>): void {
  store.getState().setStorePartial(obj);
}

/**
 * Retrieve specific value from application store by property key.
 *
 * @description
 * Provides type-safe access to individual store properties by key name.
 * Returns the stored value for the specified key or undefined if the key
 * does not exist. Enables selective access to store state without exposing
 * the entire store object, promoting encapsulation and controlled access.
 *
 * @param key - Property key from AppState interface to retrieve value for.
 * @returns Value stored for the given key, or undefined if key doesn't exist.
 *
 * @example
 * // Get specific store value by key
 * const pageTitle = getStore('pageTitle');
 * const currentOmzet = getStore('currentOmzetFormatted');
 * console.log("Page title:", pageTitle);
 */
export function getStore<T extends keyof AppState>(key: T): AppState[T] {
  return store.getState()[key];
}

/**
 * Retrieve complete application store state for debugging and bulk access.
 *
 * @description
 * Returns direct reference to the entire application store object containing
 * all state properties. Primarily used for debugging purposes, bulk state
 * access, or when multiple store properties need to be accessed simultaneously.
 * Provides full visibility into current application state.
 *
 * @returns Complete store object with all application state properties.
 *
 * @example
 * // Get entire store state for debugging
 * const fullState = getStoreState();
 * console.log("Current store:", fullState);
 * // Access multiple properties at once
 * const { currentOmzetFormatted, pageTitle } = getStoreState();
 */
export function getStoreState(): AppState {
  return store.getState();
}

// --- Analysis State Management Functions ---

/**
 * Reset analysis state with proper cleanup of UI components.
 *
 * @description
 * Cleans up Chart.js instances, SlimSelect components, window properties,
 * and resets all analysis state to default values. Safe cleanup with
 * debug logging prevents crashes during cleanup operations.
 */
export function resetAnalysisState(): void {
  store.getState().resetAnalysisState();
}

/**
 * Get current analysis state from the store.
 */
export function getAnalysisState(): AnalysisState {
  return store.getState().getAnalysisState();
}

/**
 * Update specific analysis state property with type safety.
 */
export function setAnalysisState<K extends keyof AnalysisState>(key: K, value: AnalysisState[K]): void {
  store.getState().setAnalysisState(key, value);
}

/**
 * Update initialization flag for UI components.
 */
export function updateAnalysisFlag<K extends keyof AnalysisState['initFlags']>(flag: K, value: boolean): void {
  store.getState().updateAnalysisFlag(flag, value);
}

/**
 * Update UI component reference in analysis state.
 */
export function updateAnalysisComponent<K extends keyof AnalysisState['uiComponents']>(component: K, value: AnalysisState['uiComponents'][K]): void {
  store.getState().updateAnalysisComponent(component, value);
}

/**
 * Update configuration property in analysis state.
 */
export function updateAnalysisConfig<K extends keyof AnalysisState['config']>(config: K, value: AnalysisState['config'][K]): void {
  store.getState().updateAnalysisConfig(config, value);
}

// --- Analysis State Helper Functions ---

/**
 * Get all sales data from analysis state.
 * @returns Array of sales data objects
 */
export const getAllSalesData = () => getAnalysisState().allSalesData;

/**
 * Set all sales data in analysis state.
 * @param data - Array of sales data objects to store
 */
export const setAllSalesData = (data: AnalysisState['allSalesData']) => setAnalysisState('allSalesData', data);

/**
 * Get all Chart.js instances from analysis state.
 * @returns Object containing chart instances keyed by chart ID
 */
export const getCharts = () => getAnalysisState().charts;

/**
 * Set all Chart.js instances in analysis state.
 * @param charts - Object containing chart instances keyed by chart ID
 */
export const setCharts = (charts: AnalysisState['charts']) => setAnalysisState('charts', charts);

/**
 * Set a single chart property in the charts object.
 * @param key - Chart identifier key
 * @param value - Chart instance to store
 */
export const setChartProperty = (key: string, value: any) => {
  const currentCharts = getCharts();
  const updatedCharts = { ...currentCharts, [key]: value };
  setCharts(updatedCharts);
};

/**
 * Get a single chart instance by key.
 * @param key - Chart identifier key
 * @returns Chart instance or undefined if not found
 */
export const getChartProperty = (key: string) => {
  return getCharts()[key];
};

/**
 * Get chart data prepared for AI analysis.
 * @returns Object containing chart data formatted for AI consumption
 */
export const getChartDataForAI = () => getAnalysisState().chartDataForAI;

/**
 * Set chart data prepared for AI analysis.
 * @param data - Object containing chart data formatted for AI consumption
 */
export const setChartDataForAI = (data: AnalysisState['chartDataForAI']) => setAnalysisState('chartDataForAI', data);

/**
 * Set a single property in the chart data for AI object.
 * @param key - Data property key
 * @param value - Data value to store
 */
export const setChartDataForAIProperty = (key: string, value: any) => {
  const currentData = getChartDataForAI();
  const updatedData = { ...currentData, [key]: value };
  setChartDataForAI(updatedData);
};

/**
 * Get AI analysis results.
 * @returns Object containing AI-generated analysis results
 */
export const getAiAnalysisResults = () => getAnalysisState().aiAnalysisResults;

/**
 * Set AI analysis results.
 * @param results - Object containing AI-generated analysis results
 */
export const setAiAnalysisResults = (results: AnalysisState['aiAnalysisResults']) => setAnalysisState('aiAnalysisResults', results);

/**
 * Get current P&L data.
 * @returns Current profit and loss data object
 */
export const getCurrentPnlData = () => getAnalysisState().currentPnlData;

/**
 * Set current P&L data.
 * @param data - Profit and loss data object to store
 */
export const setCurrentPnlData = (data: AnalysisState['currentPnlData']) => setAnalysisState('currentPnlData', data);

/**
 * Get initialization flag status for UI components.
 * @param flag - Flag name to check
 * @returns Boolean indicating if the component has been initialized
 */
export const getInitFlag = <T extends keyof AnalysisState['initFlags']>(flag: T) => {
  return getAnalysisState().initFlags[flag] || false;
};

/**
 * Set initialization flag status for UI components.
 * @param flag - Flag name to set
 * @param value - Boolean value to set for the flag
 */
export const setInitFlag: typeof updateAnalysisFlag = (...params) => {
  updateAnalysisFlag(...params);
};

/**
 * Get UI component reference from analysis state.
 * @param component - Component name to retrieve
 * @returns Component instance or null if not found
 */
export const getUIComponent = <T extends keyof AnalysisState['uiComponents']>(component: T) => {
  return getAnalysisState().uiComponents[component] || null;
};

/**
 * Set UI component reference in analysis state.
 * @param component - Component name to set
 * @param value - Component instance to store
 */
export const setUIComponent = <
  K extends keyof AnalysisState['uiComponents'],
  V extends AnalysisState['uiComponents'][K],
>(component: K, value: V, touchFn?: ($value: V) => void): V => {
  updateAnalysisComponent(component, value);
  touchFn?.(value);

  return value;
};

/**
 * Get configuration value from analysis state.
 * @param config - Configuration key to retrieve
 * @returns Configuration value
 */
export const getConfigValue = <T extends keyof AnalysisState['config']>(config: T) => {
  return getAnalysisState().config[config];
};

/**
 * Set configuration value in analysis state.
 * @param config - Configuration key to set
 * @param value - Configuration value to store
 */
export const setConfigValue: typeof updateAnalysisConfig = (...params) => {
  updateAnalysisConfig(...params);
};

// Export the store for direct access to subscribe/getState if needed
export { store };
