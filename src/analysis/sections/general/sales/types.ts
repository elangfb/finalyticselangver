import type { AlsoStoreFn } from '../../../utils/store-helpers'

export type SalesSummary = {
  date: Date
  totalOmzet: number
  totalTransactions: number
  apc: number
  hourlyRevenue?: number[]
  branches: string[]
}

export type AlsoStoreConfig = { alsoStore?: AlsoStoreFn }
