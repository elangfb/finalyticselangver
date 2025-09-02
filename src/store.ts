import { createStore } from 'zustand/vanilla'

export interface AppState {
  period?: string;
  activeViewData?: {
    viewId: string;
    data: any;
    filters: {[key: string]: any};
  }
}

interface AppStore extends AppState {
  resetActiveViewData: () => void;
  setActiveViewData: (viewId: string, data: any, filters: {[key: string]: any}) => void;
  setStore: <K extends keyof AppState>(key: K, value: AppState[K]) => void;
  setStoreObj: (obj: Partial<AppState>) => void;
}

const store = createStore<AppStore>((set, get) => ({
  period: undefined,
  activeViewData: undefined,

  resetActiveViewData: () => set({ activeViewData: undefined }),

  setActiveViewData: (viewId: string, data: any, filters: {[key: string]: any}) =>
    set({ activeViewData: { viewId, data, filters } }),

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

// Export the store for direct access to subscribe/getState if needed
export { store };
