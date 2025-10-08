// [NEW FILE] src/analysis/premium/kpis.ts

import * as $store from '@/store'
import { generateRingkasanFromSummaries } from '@/analysis/sections/general/sales/ringkasan'
import type { SalesSummary } from '@/analysis/sections/general/sales/types'

export function populatePremiumKpis() {
  // 1. Get all available sales data from the store
  const allSalesData: SalesSummary[] = $store.getAllSalesData()
  if (allSalesData.length === 0) {
    console.warn("No sales data available to populate premium KPIs.")
    return
  }

  // 2. Determine the date ranges for last month and the month before
  const now = new Date('2025-10-08T11:14:58.000Z') // Using the provided current time for consistency
  const lastMonthYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear()
  const lastMonth = now.getMonth() === 0 ? 11 : now.getMonth() - 1 // 0-indexed (September is 8)

  const comparisonMonthYear = lastMonth === 0 ? lastMonthYear - 1 : lastMonthYear
  const comparisonMonth = lastMonth === 0 ? 11 : lastMonth - 1 // (August is 7)

  // 3. Filter the data for each period
  const lastMonthSummaries = allSalesData.filter(summary =>
    summary.date.getFullYear() === lastMonthYear && summary.date.getMonth() === lastMonth
  )

  const comparisonMonthSummaries = allSalesData.filter(summary =>
    summary.date.getFullYear() === comparisonMonthYear && summary.date.getMonth() === comparisonMonth
  )

  // 4. Define the element IDs for the premium KPI cards
  const premiumKpiIds = {
    omzet: 'premium-total-omzet',
    check: 'premium-total-check',
    avgCheck: 'premium-avg-check',
    omzetGrowth: 'premium-omzet-growth',
    checkGrowth: 'premium-check-growth',
    avgCheckGrowth: 'premium-avg-check-growth',
  }

  // 5. Call the existing utility function to perform calculations and update the DOM
  generateRingkasanFromSummaries(lastMonthSummaries, comparisonMonthSummaries, premiumKpiIds)
}