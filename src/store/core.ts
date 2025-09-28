import { createStore } from 'zustand/vanilla'
import { produce } from 'immer'
import { deepmergeCustom } from 'deepmerge-ts'
import { generateSHA256Sync } from '@/utils/hash'
import { createDefaultAnalysisState } from './defaults'
import { safeCleanup } from './helpers'
import type { AppStore, AppState, AnalysisState, ViewData } from './types'

export const store = createStore<AppStore>((set, get) => ({
  viewData: {},
  activeViewData: undefined,
  analysisState: createDefaultAnalysisState(),

  resetActiveViewData: () => set({ activeViewData: undefined }),

  clearAllViewData: () => set(produce((state: AppState) => {
    state.viewData = {};
    state.activeViewData = undefined;
  })),

  clearViewData: (viewId: string) => set(produce((state: AppState) => {
    delete state.viewData[viewId];
  })),

  setActiveViewData: (viewId: string, data: any, filters?: { [key: string]: any }) => {
    const mergeData = deepmergeCustom({ mergeArrays: false, mergeSets: false });
    const updateViewData = (viewData: ViewData, mergedData: any) => {
      const updated = { ...viewData, data: mergedData };
      return { viewData: updated, activeViewData: updated };
    };

    if (!filters) {
      set(produce((state: AppState) => {
        const existingViewData = state.viewData[viewId];
        if (existingViewData) {
          const mergedData = mergeData(existingViewData.data, data);
          const result = updateViewData(existingViewData, mergedData);
          state.viewData[viewId] = result.viewData;
          state.activeViewData = result.activeViewData;
        } else {
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
      const shouldResetData = !existingViewData || existingViewData.filterHash !== filtersHash;

      if (shouldResetData) {
        const newViewData = { viewId, data, filters: filtersWithId, filterHash: filtersHash };
        state.viewData[viewId] = newViewData;
        state.activeViewData = newViewData;
      } else {
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

  setStoreKV: <K extends keyof AppState>(key: K, value: AppState[K]) =>
    set({ [key]: value } as Partial<AppStore>),

  setStorePartial: (obj: Partial<AppState>) => set(obj),

  resetAnalysisState: () => {
    const currentState = get().analysisState;

    safeCleanup(currentState.charts, () => {
      if (typeof window !== 'undefined' && (window as any).destroyCharts) {
        (window as any).destroyCharts();
      } else {
        Object.values(currentState.charts).forEach((chart: any) => {
          if (chart && typeof chart.destroy === 'function') {
            chart.destroy();
          }
        });
      }
    }, 'Chart.js instances');

    Object.entries(currentState.uiComponents).forEach(([name, component]) => {
      safeCleanup(component, () => {
        if (component && typeof component.destroy === 'function') {
          (component as any).destroy();
        }
      }, `SlimSelect ${name}`);
    });

    safeCleanup((window as any).generalMenuTrendSelect, () => {
      if ((window as any).generalMenuTrendSelect && typeof (window as any).generalMenuTrendSelect.destroy === 'function') {
        (window as any).generalMenuTrendSelect.destroy();
      }
      (window as any).generalMenuTrendSelect = null;
    }, 'window.generalMenuTrendSelect');

    set(produce((state: AppState) => {
      state.analysisState = createDefaultAnalysisState();
    }));

    console.debug('Analysis state reset completed');
  },

  getAnalysisState: () => get().analysisState,

  setAnalysisState: <K extends keyof AnalysisState>(key: K, value: AnalysisState[K]) =>
    set(produce((state: AppState) => {
      state.analysisState[key] = value;
    })),

  updateAnalysisFlag: <K extends keyof AnalysisState['initFlags']>(flag: K, value: boolean) =>
    set(produce((state: AppState) => {
      state.analysisState.initFlags[flag] = value;
    })),

  updateAnalysisComponent: <K extends keyof AnalysisState['uiComponents']>(component: K, value: AnalysisState['uiComponents'][K]) =>
    set(produce((state: AppState) => {
      state.analysisState.uiComponents[component] = value;
    })),

  updateAnalysisConfig: <K extends keyof AnalysisState['config']>(config: K, value: AnalysisState['config'][K]) =>
    set(produce((state: AppState) => {
      state.analysisState.config[config] = value;
    })),
}))
