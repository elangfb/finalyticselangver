import { produce } from 'immer';
import { createStore } from 'zustand/vanilla'

export interface ViewData<TData = any, TFilters = {[key: string]: any}> {
  viewId: string;
  data: TData;
  filters: TFilters;
}

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

export interface AppState {
  viewData: {[key: string]: ViewData};
  activeViewData?: ViewData;
  analysisState: AnalysisState;
}

export interface AppStore extends AppState {
  resetActiveViewData: () => void;
  setActiveViewData: (viewId: string, data: any, filters: {[key: string]: any}) => void;
  trySetFromExistingViewData: (viewId: string) => void;
  setStore: <K extends keyof AppState>(key: K, value: AppState[K]) => void;
  setStoreObj: (obj: Partial<AppState>) => void;

  // Analysis state management
  resetAnalysisState: () => void;
  getAnalysisState: () => AnalysisState;
  setAnalysisState: <K extends keyof AnalysisState>(key: K, value: AnalysisState[K]) => void;
  updateAnalysisFlag: <K extends keyof AnalysisState['initFlags']>(flag: K, value: boolean) => void;
  updateAnalysisComponent: <K extends keyof AnalysisState['uiComponents']>(component: K, value: any) => void;
  updateAnalysisConfig: <K extends keyof AnalysisState['config']>(config: K, value: any) => void;
}

// Default analysis state factory
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

// Helper function for safe cleanup with debug logging
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

  setActiveViewData: (viewId: string, data: any, filters: {[key: string]: any}) =>
    set(produce((state: AppState) => {
      state.viewData[viewId] = { viewId, data, filters };
      state.activeViewData = { viewId, data, filters };
    })),

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
   * setStore('pageTitle', 'Monthly Sales Report');
   * setStore('currentOmzetFormatted', 'Rp 5,000,000');
   * setStore('isLoading', false);
   * // TypeScript ensures value types match property expectations
   */
  setStore: <K extends keyof AppState>(key: K, value: AppState[K]) =>
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
   * setStoreObj({
   *   pageTitle: "Sales Analysis",
   *   currentOmzetFormatted: "Rp 5,000,000",
   *   currentCheckFormatted: "150"
   * });
   * // Updates all specified properties in single operation
   */
  setStoreObj: (obj: Partial<AppState>) => set(obj),

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
  updateAnalysisComponent: <K extends keyof AnalysisState['uiComponents']>(component: K, value: any) =>
    set(produce((state: AppState) => {
      state.analysisState.uiComponents[component] = value;
    })),

  /**
   * Update specific configuration property.
   */
  updateAnalysisConfig: <K extends keyof AnalysisState['config']>(config: K, value: any) =>
    set(produce((state: AppState) => {
      state.analysisState.config[config] = value;
    })),
}))

export function resetActiveViewData(): void {
  store.getState().resetActiveViewData();
}

export function setActiveViewData(viewId: string, data: any, filters: {[key: string]: any}): void {
  store.getState().setActiveViewData(viewId, data, filters);
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
 * setStore('pageTitle', 'Monthly Sales Report');
 * setStore('currentOmzetFormatted', 'Rp 5,000,000');
 * setStore('isLoading', false);
 * // TypeScript ensures value types match property expectations
 */
export function setStore<K extends keyof AppState>(key: K, value: AppState[K]): void {
  store.getState().setStore(key, value);
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
 * setStoreObj({
 *   pageTitle: "Sales Analysis",
 *   currentOmzetFormatted: "Rp 5,000,000",
 *   currentCheckFormatted: "150"
 * });
 * // Updates all specified properties in single operation
 */
export function setStoreObj(obj: Partial<AppState>): void {
  store.getState().setStoreObj(obj);
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
export function updateAnalysisComponent<K extends keyof AnalysisState['uiComponents']>(component: K, value: any): void {
  store.getState().updateAnalysisComponent(component, value);
}

/**
 * Update configuration property in analysis state.
 */
export function updateAnalysisConfig<K extends keyof AnalysisState['config']>(config: K, value: any): void {
  store.getState().updateAnalysisConfig(config, value);
}

// Export the store for direct access to subscribe/getState if needed
export { store };
