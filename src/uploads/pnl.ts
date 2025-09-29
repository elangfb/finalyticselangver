// Contains the logic for processing and uploading Profit & Loss (P&L) data files.

declare const XLSX: any

import { doc, setDoc } from 'firebase/firestore'
import { db } from '@/core/firebase'
import { currentUser } from '@/core/state'
import { getPeriodFromFile } from './utils'

/**
 * Parses a P&L Excel file, validates its structure, and saves the data to Firestore.
 * @param file The Excel file to process.
 * @param expectedPeriod An optional string (YYYY-MM) to validate against the file's content.
 * @returns A promise that resolves with the period (YYYY-MM) of the processed file.
 */
export async function uploadAndProcessPnlFile(file: File, expectedPeriod: string | null = null): Promise<string> {
  if (!currentUser) throw new Error('Authentication error. Please log in again.')

  const validMainCategories = [
    'Pendapatan (Revenue)', 'Harga Pokok Produksi', 'Beban Operasional (OPEX)',
    'Beban Non Operasional', 'Depresiasi/ Amortisasi', 'Bunga', 'Pajak (PB1)',
  ]

  const data = await file.arrayBuffer()
  const workbook = XLSX.read(data)
  const worksheet = workbook.Sheets['P&L Data']

  if (!worksheet) {
    throw new Error('Could not find the \'P&L Data\' sheet. Please use the provided template.')
  }

  const businessNameCell = worksheet['B1']
  const branchName = businessNameCell ? String(businessNameCell.v).trim() : 'Unknown Branch'

  const actualPeriod = getPeriodFromFile(worksheet)
  if (!actualPeriod) {
    throw new Error('Could not determine the period from the file. Please check cell B2.')
  }

  if (expectedPeriod && actualPeriod !== expectedPeriod) {
    throw new Error(`File period mismatch. Expected '${expectedPeriod}', but file contains '${actualPeriod}'.`)
  }

  const parsedData = XLSX.utils.sheet_to_json(worksheet, { range: 3 })
  if (!parsedData || parsedData.length === 0) {
    throw new Error('The \'P&L Data\' sheet is empty or contains no data in the specified range.')
  }

  const pnlData: Record<string, Record<string, number>> = {}
  for (const row of parsedData as any[]) {
    const mainCategory = row['Main Category']
    const subCategory = row['Sub-Category']
    const amount = row['Amount']

    if (mainCategory && subCategory && typeof amount === 'number') {
      if (!validMainCategories.includes(mainCategory)) {
        throw new Error(`Invalid Main Category: "${mainCategory}". Please use an exact category from the template.`)
      }
      if (!pnlData[mainCategory]) {
        pnlData[mainCategory] = {}
      }
      pnlData[mainCategory][String(subCategory).trim()] = amount
    }
  }

  // Validation for required sub-categories in OPEX and Non-OPEX
  const requiredOpexSubCategories = ['Wages', 'Rent']
  const requiredNonOpexSubCategories = ['Advertising']

  const opexData = pnlData['Beban Operasional (OPEX)'] || {}
  const nonOpexData = pnlData['Beban Non Operasional'] || {}

  const providedOpexSubCategories = Object.keys(opexData)
  const providedNonOpexSubCategories = Object.keys(nonOpexData)

  const missingOpex = requiredOpexSubCategories.filter(
    (subCat) => !providedOpexSubCategories.includes(subCat),
  )
  const missingNonOpex = requiredNonOpexSubCategories.filter(
    (subCat) => !providedNonOpexSubCategories.includes(subCat),
  )

  if (missingOpex.length > 0) {
    throw new Error(
      `The 'Beban Operasional (OPEX)' category is missing required sub-categories: ${missingOpex.join(', ')}. Please update your file.`,
    )
  }
  if (missingNonOpex.length > 0) {
    throw new Error(
      `The 'Beban Non Operasional' category is missing required sub-categories: ${missingNonOpex.join(', ')}. Please update your file.`,
    )
  }

  if (Object.keys(pnlData).length === 0) {
    throw new Error('No valid P&L rows could be parsed from the file.')
  }

  const safeBranchName = branchName.replace(/\s+/g, '_')
  const docId = `${actualPeriod}_${safeBranchName}`
  const pnlDocRef = doc(db, `users/${currentUser.uid}/pnlReports`, docId)

  await setDoc(pnlDocRef, {
    title: `${file.name} (from template)`,
    fileName: file.name,
    period: actualPeriod,
    branchName: branchName,
    lastUpdatedAt: new Date(),
    pnlData: pnlData,
  })

  return actualPeriod
}
