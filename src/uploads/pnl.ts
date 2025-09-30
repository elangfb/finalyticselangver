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

export function downloadPnlTemplate() {
  const instructions = [
    { Step: 1, Instruction: 'In the \'P&L Data\' sheet, enter your Business Name in cell B1 and a date from the desired month in cell B2 (e.g., \'01/12/2024\' for December 2024).' },
    { Step: 2, Instruction: 'For the \'Main Category\' column, you MUST use the exact values from the list provided.' },
    { Step: 3, Instruction: 'Under \'Beban Operasional (OPEX)\', you MUST include \'Wages\' and \'Rent\'. Under \'Beban Non Operasional\', you MUST include \'Advertising\'.' },
  ]
  const pnlSheetData = [
    { A: 'Business Name:', B: '[Enter Business Name Here]' },
    { A: 'Period:', B: '01/12/2024' },
    {}, // Empty row for spacing
    { A: 'Main Category', B: 'Sub-Category', C: 'Amount' },
    { A: 'Pendapatan (Revenue)', B: 'Penjualan Makanan', C: 50000000 },
    { A: 'Pendapatan (Revenue)', B: 'Penjualan Minuman', C: 25000000 },
    { A: 'Harga Pokok Produksi', B: 'Bahan Baku Makanan', C: 15000000 },
    { A: 'Harga Pokok Produksi', B: 'Bahan Baku Minuman', C: 5000000 },
    { A: 'Beban Operasional (OPEX)', B: 'Wages', C: 12000000 },
    { A: 'Beban Operasional (OPEX)', B: 'Rent', C: 8000000 },
    { A: 'Beban Operasional (OPEX)', B: 'Utilitas (Listrik, Air)', C: 3000000 },
    // --- FIX: Advertising is now under Beban Non Operasional ---
    { A: 'Beban Non Operasional', B: 'Advertising', C: 2000000 },
    { A: 'Beban Non Operasional', B: 'Biaya Lainnya', C: 1000000 },
  ]
  const mainCategories = ['Pendapatan (Revenue)', 'Harga Pokok Produksi', 'Beban Operasional (OPEX)', 'Beban Non Operasional', 'Depresiasi/ Amortisasi', 'Bunga', 'Pajak (PB1)']

  const wsInstructions = XLSX.utils.json_to_sheet([...instructions, {}, { Step: 'Valid Main Categories:' }, ...mainCategories.map((cat) => ({ Step: `  - ${cat}` }))], { skipHeader: true })
  const wsData = XLSX.utils.json_to_sheet(pnlSheetData, { skipHeader: true })

  wsInstructions['!cols'] = [{ wch: 25 }, { wch: 120 }]
  wsData['!cols'] = [{ wch: 30 }, { wch: 30 }, { wch: 20 }]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, wsInstructions, 'Instructions')
  XLSX.utils.book_append_sheet(wb, wsData, 'P&L Data')
  XLSX.writeFile(wb, 'Finalytics_P&L_Template.xlsx')
}
