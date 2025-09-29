import type { AlsoStoreFn } from '../../../utils/store-helpers'

export interface SalesSummary {
  date: Date
  totalOmzet: number
  totalTransactions: number
  apc: number
  hourlyRevenue?: number[]
  branches: string[]
}

export interface AlsoStoreConfig { alsoStore?: AlsoStoreFn }
