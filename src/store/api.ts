import type { AppState, AnalysisState } from './types'
import { store } from './core'

// Original convenience functions preserved
export function resetActiveViewData(): void {
  store.getState().resetActiveViewData()
}

export function setActiveViewData(viewId: string, data: any, filters?: Record<string, any>): void {
  store.getState().setActiveViewData(viewId, data, filters)
}

export function clearAllViewData(): void {
  store.getState().clearAllViewData()
}

export function clearViewData(viewId: string): void {
  store.getState().clearViewData(viewId)
}

export function trySetFromExistingViewData(viewId: string): void {
  store.getState().trySetFromExistingViewData(viewId)
}

export function setStoreKV<K extends keyof AppState>(key: K, value: AppState[K]): void {
  store.getState().setStoreKV(key, value)
}

export function setStorePartial(obj: Partial<AppState>): void {
  store.getState().setStorePartial(obj)
}

export function getStore<T extends keyof AppState>(key: T): AppState[T] {
  return store.getState()[key]
}

export function getStoreState(): AppState {
  return store.getState()
}

// Analysis state helpers
export function resetAnalysisState(): void {
  store.getState().resetAnalysisState()
}

export function getAnalysisState(): AnalysisState {
  return store.getState().getAnalysisState()
}

export function setAnalysisState<K extends keyof AnalysisState>(key: K, value: AnalysisState[K]): void {
  store.getState().setAnalysisState(key, value)
}

export function updateAnalysisFlag<K extends keyof AnalysisState['initFlags']>(flag: K, value: boolean): void {
  store.getState().updateAnalysisFlag(flag, value)
}

export function updateAnalysisComponent<K extends keyof AnalysisState['uiComponents']>(component: K, value: AnalysisState['uiComponents'][K]): void {
  store.getState().updateAnalysisComponent(component, value)
}

export function updateAnalysisConfig<K extends keyof AnalysisState['config']>(config: K, value: AnalysisState['config'][K]): void {
  store.getState().updateAnalysisConfig(config, value)
}

export const getAllSalesData = () => getAnalysisState().allSalesData
export const setAllSalesData = (data: AnalysisState['allSalesData']) => setAnalysisState('allSalesData', data)

export const getCharts = () => getAnalysisState().charts
export const setCharts = (charts: AnalysisState['charts']) => setAnalysisState('charts', charts)

export const setChartProperty = (key: string, value: any) => {
  const currentCharts = getCharts()
  const updatedCharts = { ...currentCharts, [key]: value }
  setCharts(updatedCharts)
}

export const getChartProperty = (key: string) => {
  return getCharts()[key]
}

export const getChartDataForAI = () => getAnalysisState().chartDataForAI
export const setChartDataForAI = (data: AnalysisState['chartDataForAI']) => setAnalysisState('chartDataForAI', data)

export const setChartDataForAIProperty = (key: string, value: any) => {
  const currentData = getChartDataForAI()
  const updatedData = { ...currentData, [key]: value }
  setChartDataForAI(updatedData)
}

export const getAiAnalysisResults = () => getAnalysisState().aiAnalysisResults
export const setAiAnalysisResults = (results: AnalysisState['aiAnalysisResults']) => setAnalysisState('aiAnalysisResults', results)

export const getCurrentPnlData = () => getAnalysisState().currentPnlData
export const setCurrentPnlData = (data: AnalysisState['currentPnlData']) => setAnalysisState('currentPnlData', data)

export const getInitFlag = <T extends keyof AnalysisState['initFlags']>(flag: T) => {
  return getAnalysisState().initFlags[flag] || false
}

export const setInitFlag: typeof updateAnalysisFlag = (...params) => {
  updateAnalysisFlag(...params)
}

export const getUIComponent = <T extends keyof AnalysisState['uiComponents']>(component: T) => {
  return getAnalysisState().uiComponents[component] || null
}

export const setUIComponent = <
  K extends keyof AnalysisState['uiComponents'],
  V extends AnalysisState['uiComponents'][K],
>(component: K, value: V, touchFn?: ($value: V) => void): V => {
  updateAnalysisComponent(component, value)
  touchFn?.(value)
  return value
}

export const getConfigValue = <T extends keyof AnalysisState['config']>(config: T) => {
  return getAnalysisState().config[config]
}

export const setConfigValue: typeof updateAnalysisConfig = (...params) => {
  updateAnalysisConfig(...params)
}

export { store } from './core'
export * from './types'
