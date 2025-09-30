// Contains all logic for the "Analisis Perbandingan Cabang > Aspek Investasi" section.

import * as $store from '@/store'
import { db } from '@/core/firebase'
import { currentUser } from '@/core/state'
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore'
import { showLoading, hideLoading } from '@/core/ui'
import { createAlsoStoreFn } from '../../utils/store-helpers'
import { calculateAllPnlMetrics } from '../../utils/pnl'
import { generateCabangBusinessYieldComparisonChart, generateCabangInvestorYieldComparisonChart, generateBranchCumulativeComparisonChart } from './investment/charts'

// Chart helpers moved to './investment/charts'

/**
 * Main orchestrator for the "Analisis Perbandingan Cabang > Aspek Investasi" section.
 */
async function generateBranchInvestment() {
  if (!currentUser) return
  const startPeriod = (document.getElementById('cabang-investasi-start-period') as HTMLSelectElement).value
  const endPeriod = (document.getElementById('cabang-investasi-end-period') as HTMLSelectElement).value
  const branchA = (document.getElementById('cabang-investasi-branch-a-select') as HTMLSelectElement).value
  const branchB = (document.getElementById('cabang-investasi-branch-b-select') as HTMLSelectElement).value

  const containerA = document.getElementById('cabang-business-yield-chart-container')
  const containerB = document.getElementById('cabang-investor-yield-chart-container')
  const containerC = document.getElementById('branch-cumulative-chart-container')

  const clearChartsAndShowError = (message: string) => {
    if (containerA) containerA.innerHTML = `<p class="text-center text-red-500 p-4">${message}</p>`
    if (containerB) containerB.innerHTML = ''
    if (containerC) containerC.innerHTML = ''
  }

  if (containerA) containerA.innerHTML = '<canvas id="cabang-business-yield-chart"></canvas>'
  if (containerB) containerB.innerHTML = '<canvas id="cabang-investor-yield-chart"></canvas>'
  if (containerC) containerC.innerHTML = '<canvas id="branch-cumulative-chart"></canvas>'

  if (!startPeriod || !endPeriod || !branchA || !branchB) return
  if (branchA === branchB) {
    clearChartsAndShowError('Please select two different branches to compare.')
    return
  }
  if (startPeriod > endPeriod) {
    clearChartsAndShowError('Start Period cannot be after End Period.')
    return
  }

  $store.clearViewData('cabang-investasi')

  showLoading({ message: 'Comparing cumulative returns...' })
  try {
    const fetchDataForBranch = async (branchName: string) => {
      const investmentRef = doc(db, `users/${currentUser!.uid}/investments`, branchName)
      const pnlReportsRef = collection(db, `users/${currentUser!.uid}/pnlReports`)
      const q = query(pnlReportsRef, where('branchName', '==', branchName), where('period', '>=', startPeriod), where('period', '<=', endPeriod))
      const [investmentSnap, pnlSnap] = await Promise.all([getDoc(investmentRef), getDocs(q)])
      if (!investmentSnap.exists()) throw new Error(`Investment data not found for ${branchName}.`)
      const monthlyProfits = pnlSnap.docs
        .map((d) => ({ period: d.data().period, profit: calculateAllPnlMetrics(d.data().pnlData).Profit }))
        .sort((a, b) => a.period.localeCompare(b.period))
      return { investment: investmentSnap.data(), monthlyProfits }
    }
    const [dataA, dataB] = await Promise.all([fetchDataForBranch(branchA), fetchDataForBranch(branchB)])

    $store.setActiveViewData('cabang-investasi', {
      viewContext: {
        startPeriod: new Date(startPeriod + '-02').toLocaleString('default', { month: 'long', year: 'numeric' }),
        endPeriod: new Date(endPeriod + '-02').toLocaleString('default', { month: 'long', year: 'numeric' }),
        branchA,
        branchB,
        comparisonType: 'Branch Investment Analysis',
      },
    }, { startPeriod, endPeriod, branchA, branchB })
    const alsoStore = createAlsoStoreFn($store, 'cabang-investasi')

    generateCabangBusinessYieldComparisonChart(dataA, dataB, { alsoStore })
    generateCabangInvestorYieldComparisonChart(dataA, dataB, { alsoStore })
    generateBranchCumulativeComparisonChart(dataA, dataB, startPeriod, endPeriod, { alsoStore })
  } catch (error: any) {
    const message = error?.message || 'Unknown error'
    if (containerA) containerA.innerHTML = `<p class="text-center text-red-500 p-4">${message}</p>`
    if (containerB) containerB.innerHTML = ''
    if (containerC) containerC.innerHTML = ''
  } finally {
    hideLoading()
  }
}

/**
 * Sets up the selectors for the "Cabang > Investasi" section.
 */
export async function setupBranchInvestment() {
  if ($store.getInitFlag('cabangInvestasiSelectorInitialized') || !currentUser) return

  const startPeriodSelect = document.getElementById('cabang-investasi-start-period') as HTMLSelectElement
  const endPeriodSelect = document.getElementById('cabang-investasi-end-period') as HTMLSelectElement
  const branchASelect = document.getElementById('cabang-investasi-branch-a-select') as HTMLSelectElement
  const branchBSelect = document.getElementById('cabang-investasi-branch-b-select') as HTMLSelectElement

  try {
    const investmentsRef = collection(db, `users/${currentUser.uid}/investments`)
    const pnlReportsRef = collection(db, `users/${currentUser.uid}/pnlReports`)
    const [investmentSnap, pnlSnap] = await Promise.all([getDocs(investmentsRef), getDocs(pnlReportsRef)])

    const branchesWithInvestment = investmentSnap.docs.map((doc) => doc.data().branchName).sort()
    const availablePeriods = [...new Set(pnlSnap.docs.map((doc) => doc.data().period))].sort()

    if (branchesWithInvestment.length < 2 || availablePeriods.length === 0) return

    const branchOptionsHtml = branchesWithInvestment.map((b) => `<option value="${b}">${b}</option>`).join('')
    branchASelect.innerHTML = branchOptionsHtml
    branchBSelect.innerHTML = branchOptionsHtml

    const periodOptionsHtml = availablePeriods.map((p) => `<option value="${p}">${new Date(p + '-02').toLocaleString('default', { month: 'long', year: 'numeric' })}</option>`).join('')
    startPeriodSelect.innerHTML = periodOptionsHtml
    endPeriodSelect.innerHTML = periodOptionsHtml

    branchASelect.value = branchesWithInvestment[0]
    branchBSelect.value = branchesWithInvestment[1]
    startPeriodSelect.value = availablePeriods[0]
    endPeriodSelect.value = availablePeriods[availablePeriods.length - 1]

    const handler = () => generateBranchInvestment()
    startPeriodSelect.addEventListener('change', handler)
    endPeriodSelect.addEventListener('change', handler)
    branchASelect.addEventListener('change', handler)
    branchBSelect.addEventListener('change', handler)

    $store.setInitFlag('cabangInvestasiSelectorInitialized', true)
    await generateBranchInvestment()
  } catch (error) {
    // Handle error
  }
}
