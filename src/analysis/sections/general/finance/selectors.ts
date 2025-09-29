// Selectors and setup for General > Finance

import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore'
import { db } from '@/core/firebase'
import { currentUser } from '@/core/state'
import * as $store from '@/store'
import { generateGeneralFinance } from './views'

/**
 * Updates the available periods in the dropdown when the branch changes.
 */
export async function updatePeriodSelectorsForGeneralFinance(selectedBranch: string) {
  if (!currentUser) return
  const periodSelect = document.getElementById('general-keuangan-period-select') as HTMLSelectElement
  periodSelect.innerHTML = '<option>Loading periods...</option>'

  const pnlReportsRef = collection(db, `users/${currentUser.uid}/pnlReports`)
  const q = query(pnlReportsRef, where('branchName', '==', selectedBranch))
  const reportsSnap = await getDocs(q)

  const periods = reportsSnap.docs
    .map(doc => doc.data().period)
    .filter(Boolean)
    .toSorted()
    .reverse()

  if (periods.length === 0) {
    periodSelect.innerHTML = '<option>No P&L data for this branch</option>'
    return
  }

  const periodOptionsHtml = periods
    .map(p => `<option value="${p}">${new Date(p + '-02').toLocaleString('default', { month: 'long', year: 'numeric' })}</option>`)
    .join('')
  periodSelect.innerHTML = periodOptionsHtml
  periodSelect.value = periods[0]
  await generateGeneralFinance()
}

/**
 * Sets up the period and branch selectors for the "Aspek Keuangan" section.
 */
export async function setupGeneralFinance() {
  if ($store.getInitFlag('generalKeuanganSelectorInitialized')) return
  if (!currentUser) return

  const periodSelect = document.getElementById('general-keuangan-period-select') as HTMLSelectElement
  const branchSelect = document.getElementById('general-keuangan-branch-select') as HTMLSelectElement

  const reportsRef = collection(db, `users/${currentUser.uid}/pnlReports`)
  const reportsSnap = await getDocs(reportsRef)
  const branches = [...new Set(reportsSnap.docs.map(doc => doc.data().branchName))].toSorted()

  if (branches.length === 0) {
    branchSelect.innerHTML = '<option>No branches with P&L data</option>'
    return
  }

  branchSelect.innerHTML = branches.map(b => `<option value="${b}">${b}</option>`).join('')
  branchSelect.value = branches[0]

  branchSelect.addEventListener('change', async () => await updatePeriodSelectorsForGeneralFinance(branchSelect.value))
  periodSelect.addEventListener('change', () => generateGeneralFinance())

  $store.setInitFlag('generalKeuanganSelectorInitialized', true)
  await updatePeriodSelectorsForGeneralFinance(branches[0])
}
