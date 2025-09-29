// Manages populating the main data hub table with an aggregated view of all user data.

import { collection, getDocs } from 'firebase/firestore'
import { db } from '@/core/firebase'
import { currentUser } from '@/core/state'

/**
 * Fetches all user data (sales, targets, P&L) and populates the main data hub table.
 */
export async function populateCompiledDataTable(): Promise<void> {
  if (!currentUser) return
  const tbody = document.getElementById('compiled-data-tbody')
  if (!tbody) return

  tbody.innerHTML = '<tr><td colspan="6" class="text-center p-4 text-gray-500">Loading data...</td></tr>'

  try {
    const [salesSnap, salesTargetSnap, pnlSnap, pnlTargetSnap] = await Promise.all([
      getDocs(collection(db, `artifacts/sales-app/users/${currentUser.uid}/uploads`)),
      getDocs(collection(db, `users/${currentUser.uid}/monthlySalesTargets`)),
      getDocs(collection(db, `users/${currentUser.uid}/pnlReports`)),
      getDocs(collection(db, `users/${currentUser.uid}/monthlyPnlTargets`)),
    ])

    const aggregatedData: Record<string, any> = {}

    const processSnap = (snap: any, type: string) => {
      snap.forEach((doc: any) => {
        const data = doc.data()
        const period = data.period || doc.id
        if (!period || !/^\d{4}-\d{2}$/.test(period)) return

        const branch = data.branchName || 'Company-Wide'
        const key = `${branch}|${period}`

        if (!aggregatedData[key]) {
          aggregatedData[key] = { branch: branch, period: period }
        }
        aggregatedData[key][type] = { id: doc.id, name: data.name || data.title || data.fileName }
      })
    }

    processSnap(salesSnap, 'salesData')
    processSnap(salesTargetSnap, 'salesTarget')
    processSnap(pnlSnap, 'pnlData')
    processSnap(pnlTargetSnap, 'pnlTarget')

    tbody.innerHTML = ''

    const sortedKeys = Object.keys(aggregatedData).sort((a, b) => {
      const [branchA, periodA] = a.split('|') as [string, string]
      const [branchB, periodB] = b.split('|') as [string, string]
      if (branchA < branchB) return -1
      if (branchA > branchB) return 1
      return periodB.localeCompare(periodA)
    })

    const filteredKeys = sortedKeys.filter((key) => !key.startsWith('Company-Wide|'))

    if (filteredKeys.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="text-center p-4 text-gray-500">No data periods found. Please upload a Sales Data file to begin.</td></tr>'
      return
    }

    filteredKeys.forEach((key) => {
      const data = aggregatedData[key]
      const [year, month] = data.period.split('-')
      const formattedPeriod = new Date(parseInt(year), parseInt(month) - 1, 1).toLocaleString('default', { month: 'long', year: 'numeric' })

      const createCell = (type: string) => {
        if (data[type]) {
          return `
                        <td class="px-6 py-4 text-center">
                            <div class="flex items-center justify-center space-x-2">
                                <button class="view-compiled-btn bg-blue-500 text-white text-xs font-bold py-1 px-3 rounded-full hover:bg-blue-600" data-id="${data[type].id}" data-type="${type}">View</button>
                                <button class="delete-compiled-btn text-gray-400 hover:text-red-600 p-1 rounded-full" data-id="${data[type].id}" data-type="${type}" title="Delete this item">
                                    <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                </button>
                            </div>
                        </td>`
        } else {
          return `
                        <td class="px-6 py-4 text-center">
                            <button class="upload-compiled-btn bg-gray-200 text-gray-700 text-xs font-bold py-1 px-3 rounded-full hover:bg-gray-300" data-period="${data.period}" data-type="${type}" data-branch="${data.branch}">
                                Upload
                            </button>
                        </td>`
        }
      }

      const row = document.createElement('tr')
      row.innerHTML = `
                <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-800">${data.branch}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600">${formattedPeriod}</td>
                ${createCell('salesData')}
                ${createCell('salesTarget')}
                ${createCell('pnlData')}
                ${createCell('pnlTarget')}
            `
      tbody.appendChild(row)
    })
  } catch (error) {
    console.error('Error populating compiled data table:', error)
    tbody.innerHTML = '<tr><td colspan="6" class="text-center p-4 text-red-500">Could not load data.</td></tr>'
  }
}
