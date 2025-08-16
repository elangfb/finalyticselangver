export interface ComparisonState {
  upOrDown: string
  percentage: string
  plusOrMinus: string
  difference: string
}

export interface SalesDataRow {
  [key: string]: unknown
  'Sales Date In': Date
  'Revenue': number
  'Bill Number': string
  'Branch': string
  'Menu Category': string
  'Menu': string
  'Quantity': number
  'Visit Purpose': string
  'Price': number
}

export interface AppState {
  // Page 1: General Overview
  currentOmzet?: number
  currentCheck?: number
  currentAvgCheck?: number
  lastPeriodOmzet?: number
  lastPeriodCheck?: number
  lastPeriodAvgCheck?: number
  lastPeriodOmzetComparison?: ComparisonState
  lastPeriodCheckComparison?: ComparisonState
  lastPeriodAvgCheckComparison?: ComparisonState
  currentOmzetFormatted?: string
  lastPeriodOmzetUpOrDown?: string
  lastPeriodOmzetPercentage?: string
  lastPeriodOmzetPlusOrMinus?: string
  lastPeriodOmzetDifference?: string
  currentCheckFormatted?: string
  lastPeriodCheckUpOrDown?: string
  lastPeriodCheckPercentage?: string
  lastPeriodCheckPlusOrMinus?: string
  lastPeriodCheckDifference?: string
  currentAvgCheckFormatted?: string
  lastPeriodAvgCheckUpOrDown?: string
  lastPeriodAvgCheckPercentage?: string
  lastPeriodAvgCheckPlusOrMinus?: string
  lastPeriodAvgCheckDifference?: string
  topOmzetPercentage?: string
  topOmzetOutletName?: string

  // Page 3: Customer Spending
  avgSpendLower?: string
  avgSpendUpper?: string
  highestSingleTransaction?: string
  busiestTimeRange?: string
  busiestDay?: string
  upsellingTips?: string

  // Page 4: Weekend Insights
  mainWeekendInsight?: string
  tcTrendInsight?: string
  salesChannelInsight?: string

  // Page 5: Weekend Sales
  weekendSalesPercentage?: string
  mainSalesInsight?: string
  apcIncrease?: string
  potentialBonusOmzet?: string
  motivationalMessage?: string

  // Page 6: Hourly Insights
  hourlyPageTitle?: string
  tcInsightText?: string
  tcSuggestionText?: string
  apcInsightText?: string
  peakHoursInsight?: string
  mainHourPercentage?: string
  mainHourInsight?: string
  apcIncreaseAmount?: string
  potentialBonusAmount?: string
  proTip1?: string
  proTip2?: string

  // Page 7: Sales Channel Insights
  pageTitle?: string
  hourlyChannelInsight?: string
  mainChannelInsight?: string
  monthlyChannelInsight?: string

  // Page 8: More Channel Insights
  monthlyIncreasePercentage?: string
  monthlyIncreaseInsight?: string
  hourlyInsight?: string
  hourlySuggestion?: string
  weeklyInsight?: string
  weeklySuggestion?: string
  monthlyInsight?: string

  // Page 9: GoFood Insights
  mainGoFoodInsight?: string
  hourlyAPCInsightDinner?: string
  hourlyAPCInsightDineIn?: string
  weeklyAPCInsight?: string
  monthlyAPCInsight?: string

  // Page 10: Channel Comparison
  dineInIncreasePercentage?: string
  dineInIncreaseInsight?: string
  growthChan1Name?: string
  growthChan1TC?: string
  growthChan1APC?: string
  growthChan1Percent?: string
  growthChan2Name?: string
  growthChan2TC?: string
  growthChan2APC?: string
  growthChan2Percent?: string
  topSalesChan1Name?: string
  topSalesChan1Nominal?: string
  topSalesChan2Name?: string
  topSalesChan2Nominal?: string
  monthlyIncreaseChan1Name?: string
  monthlyIncreaseChan1Percent?: string
  monthlyIncreaseChan1Nominal?: string
  monthlyIncreaseChan2Name?: string
  monthlyIncreaseChan2Percent?: string
  monthlyIncreaseChan2Nominal?: string

  // Page 11: Food Analysis
  favoriteFoods?: string
  podium1?: string
  podium2?: string
  podium3?: string
  top5_1_name?: string
  top5_1_percent?: string
  top5_1_revenue?: string
  top5_2_name?: string
  top5_2_percent?: string
  top5_2_revenue?: string
  top5_3_name?: string
  top5_3_percent?: string
  top5_3_revenue?: string
  top5_4_name?: string
  top5_4_percent?: string
  top5_4_revenue?: string
  top5_5_name?: string
  top5_5_percent?: string
  top5_5_revenue?: string
  superheroTitle?: string
  superheroName?: string
  superheroContributionPercent?: string
  superheroContributionNominal?: string
  timelineTitle?: string
  hero_time1_name?: string
  hero_time2_name?: string
  hero_time3_name?: string
  hero_time4_name?: string

  // Page 12: Drink Analysis
  favoriteDrinks?: string
  podium1_drink?: string
  podium2_drink?: string
  podium3_drink?: string
  top5_drink_1_name?: string
  top5_drink_1_percent?: string
  top5_drink_1_revenue?: string
  top5_drink_2_name?: string
  top5_drink_2_percent?: string
  top5_drink_2_revenue?: string
  top5_drink_3_name?: string
  top5_drink_3_percent?: string
  top5_drink_3_revenue?: string
  top5_drink_4_name?: string
  top5_drink_4_percent?: string
  top5_drink_4_revenue?: string
  top5_drink_5_name?: string
  top5_drink_5_percent?: string
  top5_drink_5_revenue?: string
  sidekickTitle?: string
  sidekickName?: string
  sidekickContributionPercent?: string
  sidekickContributionNominal?: string
  hero_drink_time1_name?: string
  hero_drink_time2_name?: string
  hero_drink_time3_name?: string
  hero_drink_time4_name?: string

  // Page 13: Outlet Comparison
  outletGrowth1Name?: string
  outletGrowth1TC?: string
  outletGrowth1APC?: string
  outletGrowth1Percent?: string
  outletGrowth2Name?: string
  outletGrowth2TC?: string
  outletGrowth2APC?: string
  outletGrowth2Percent?: string
  topOutlet1Name?: string
  topOutlet1Nominal?: string
  topOutlet2Name?: string
  topOutlet2Nominal?: string
  monthlyOutletIncrease1Name?: string
  monthlyOutletIncrease1Percent?: string
  monthlyOutletIncrease1Nominal?: string
  monthlyOutletIncrease2Name?: string
  monthlyOutletIncrease2Percent?: string
  monthlyOutletIncrease2Nominal?: string

  // Page 14: HPP Analysis
  totalHPP?: string
  hppTrendPercent?: string
  hppTrendNominal?: string
  highlight1?: string
  highlight2?: string
  highlight3?: string

  // Page 15: Food Cost
  foodCostTip?: string
  foodCostAlertPercentage?: string
  costOutlet1?: string
  costOutlet1Value?: string
  costOutlet2?: string
  costOutlet2Value?: string
  costOutlet3?: string
  costOutlet3Value?: string
  costOutlet4?: string
  costOutlet4Value?: string
  varianceOutlet1?: string
  varianceOutlet1Value?: string
  varianceOutlet2?: string
  varianceOutlet2Value?: string
  varianceOutlet3?: string
  varianceOutlet3Value?: string
  varianceOutlet4?: string
  varianceOutlet4Value?: string

  // Page 16: Customer Analysis
  topCustomerNames?: string
  newCustomerCount?: string
  newCustomerAvgSpend?: string
  highSpenderCount?: string
  highSpenderAvgSpend?: string
  loyalCustomerCount?: string
  loyalCustomerAvgSpend?: string
  newestMember1?: string
  newestMember2?: string
  newestMember3?: string
  newestMember4?: string
  newestMember5?: string
  newestMember6?: string
  newestMember7?: string
  newestMember8?: string
  newestMember9?: string
  newestMember10?: string

  // Page 17: Branch Analysis
  branchName?: string
  totalOmzetFormatted?: string
  omzetUpOrDown?: string
  omzetPercentage?: string
  omzetPlusOrMinus?: string
  omzetDifference?: string
  trafficCountFormatted?: string
  trafficUpOrDown?: string
  trafficPercentage?: string
  trafficPlusOrMinus?: string
  trafficDifference?: string
  avgSaleFormatted?: string
  avgSaleUpOrDown?: string
  avgSalePercentage?: string
  avgSalePlusOrMinus?: string
  avgSaleDifference?: string
  branchNameForChart?: string
  highlightBranchName1?: string
  peakSaleDate1?: string
  peakSaleDate2?: string
  peakTrafficDate?: string
  peakTrafficCount?: string
  lowestTrafficDate?: string
  highlightBranchName2?: string

  // Page 18: YoY Table
  salesCurrent?: string
  sales30Day?: string
  salesYoY?: string
  checkCurrent?: string
  check30Day?: string
  check30DayPercentage?: string
  check30DayDiff?: string
  checkYoY?: string
  checkYoYPercentage?: string
  checkYoYDiff?: string
  trafficCurrent?: string
  traffic30Day?: string
  trafficYoY?: string
  tipToolName?: string

  // Page 19: Peak Hours
  peakHour1Start?: string
  peakHour1End?: string
  popularMenu1?: string
  popularMenu2?: string
  popularMenu3?: string
  popularMenu4?: string
  avgCheckPeak1Min?: string
  avgCheckPeak1Max?: string

  // Page 20: More Peak Hours
  peakHour2Start?: string
  peakHour2End?: string
  popularMenuDinner1?: string
  popularMenuDinner2?: string
  popularMenuDinner3?: string
  popularMenuDinner4?: string
  avgSpendingPeak1Min?: string
  avgSpendingPeak1Max?: string
  apcBreakfast?: string
  popularMenuBreakfast?: string
  apcPostLunch?: string
  popularMenuPostLunch?: string
  tipToolName2?: string

  // Page 22: Peak Day
  avgCheckPeakDayMin?: string
  avgCheckPeakDayMax?: string
  apcWeekdayBreakfast?: string
  popularMenuWeekdayBreakfast?: string

  // Page 24: More Tips
  tipToolName3?: string

  // Page 26: WhatsApp Number
  whatsappNumber?: string
}

const store: AppState = {}

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
  store[key] = value
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
  Object.assign(store, obj)
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
export function getStore(key: keyof AppState): AppState[keyof AppState] | undefined {
  return store[key]
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
  return store
}
