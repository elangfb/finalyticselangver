// Shared utilities for Profit & Loss (P&L) calculations used across analysis sections.

/** Order of base categories as they appear in statements. */
export const PNL_CATEGORY_ORDER = [
  'Pendapatan (Revenue)',
  'Harga Pokok Produksi',
  'Beban Operasional (OPEX)',
  'Beban Non Operasional',
  'Depresiasi/ Amortisasi',
  'Bunga',
  'Pajak (PB1)',
] as const

export type PnlData = Record<string, Record<string, number>>

/**
 * Calculates all primary and derived P&L metrics from a raw pnlData object.
 * Returns an object keyed by metric name with numeric totals.
 */
export function calculateAllPnlMetrics(pnlData: PnlData): Record<string, number> {
  const results: Record<string, number> = {}

  // Sum base categories
  PNL_CATEGORY_ORDER.forEach((cat) => {
    const total = Object.values(pnlData[cat] || {}).reduce((sum, val) => sum + val, 0)
    results[cat] = total
  })

  // Derived metrics
  const revenue = results['Pendapatan (Revenue)'] || 0
  const hpp = results['Harga Pokok Produksi'] || 0
  const opex = results['Beban Operasional (OPEX)'] || 0
  const nonOpex = results['Beban Non Operasional'] || 0
  const depresiasi = results['Depresiasi/ Amortisasi'] || 0
  const bunga = results['Bunga'] || 0
  const pajak = results['Pajak (PB1)'] || 0

  const grossProfit = revenue - hpp
  const netOpIncome = grossProfit - opex
  const ebitda = netOpIncome - nonOpex
  const netIncome = ebitda - depresiasi - bunga - pajak

  results['Laba Kotor (Gross Profit)'] = grossProfit
  results['Pendapatan Bersih Operasional (Net Operating Income)'] = netOpIncome
  results['Pendapatan Bersih Sebelum Deprisiasi/Amortisasi, Bunga & Pajak (EBITDA)'] = ebitda
  results['Pendapatan Bersih (Net Income)'] = netIncome

  return results
}

/** Sum all sub-entries of a category safely. */
export function sumCategory(pnlData: PnlData, category: string): number {
  return Object.values(pnlData[category] || {}).reduce((s, v) => s + v, 0)
}
