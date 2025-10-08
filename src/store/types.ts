export interface ViewData<TData = any, TFilters = Record<string, any>> {
  viewId: string
  data: TData
  filters: TFilters
  filterHash?: string
}

export interface AnalysisState {
  // Data Storage
  allSalesData: any[]
  chartDataForAI: Record<string, any>
  aiAnalysisResults: Record<string, any>
  charts: Record<string, any>
  currentPnlData: any

  // UI Initialization Flags
  initFlags: {
    yoyYearSelectInitialized: boolean
    monthlyComparisonInitialized: boolean
    generalKeuanganSelectorInitialized: boolean
    waktuKeuanganSelectorsInitialized: boolean
    waktuPenjualanSelectorsInitialized: boolean
    waktuProdukChannelSelectorsInitialized: boolean
    cabangKeuanganSelectorsInitialized: boolean
    cabangPenjualanSelectorsInitialized: boolean
    cabangProdukChannelSelectorsInitialized: boolean
    generalPenjualanSelectorInitialized: boolean
    generalProdukChannelSelectorInitialized: boolean
    generalInvestasiSelectorInitialized: boolean
    cabangInvestasiSelectorInitialized: boolean
    premiumAnalysisInitialized: boolean
  }

  // UI Component References
  uiComponents: {
    omzetComparisonSelect: any
    menuTrend24MonthSelect: any
    generalMenuTrendSelect: any
    waktuMenuTrendSelect: any
    cabangMenuTrendSelect: any
  }

  // Configuration/State
  config: {
    monthlyComparisonTargets: Record<string, any>
    currentPnlPeriod: string | null
    activeSalesTarget: Record<string, any>
  }
}

export interface AnalysisActions {
  resetAnalysisState: () => void
  getAnalysisState: () => AnalysisState
  setAnalysisState: <K extends keyof AnalysisState>(key: K, value: AnalysisState[K]) => void
  updateAnalysisFlag: <K extends keyof AnalysisState['initFlags']>(flag: K, value: boolean) => void
  updateAnalysisComponent: <K extends keyof AnalysisState['uiComponents']>(component: K, value: AnalysisState['uiComponents'][K]) => void
  updateAnalysisConfig: <K extends keyof AnalysisState['config']>(config: K, value: AnalysisState['config'][K]) => void
}

export interface AppState {
  viewData: Record<string, ViewData>
  activeViewData?: ViewData
  analysisState: AnalysisState
}

export interface AppActions {
  resetActiveViewData: () => void
  setActiveViewData: (viewId: string, data: any, filters?: Record<string, any>) => void
  clearAllViewData: () => void
  clearViewData: (viewId: string) => void
  trySetFromExistingViewData: (viewId: string) => void
}

export interface AppStore extends AppState, AppActions, AnalysisActions {
  setStoreKV: <K extends keyof AppState>(key: K, value: AppState[K]) => void
  setStorePartial: (obj: Partial<AppState>) => void
}
