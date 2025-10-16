import type { AnalysisState } from './types'

export function createDefaultAnalysisState(): AnalysisState {
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
      premiumAnalysisInitialized: false,
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
      hiddenCategories: [],
      hiddenMenus: [],
      hiddenChannels: [],
    },
  }
}
