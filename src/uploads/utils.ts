// Shared helper functions for parsing different types of uploaded Excel files.

import type { WorkSheet } from 'xlsx'

declare const XLSX: any

/**
 * Extracts the period (YYYY-MM) from a standard template file's "B2" cell.
 * Handles both string and Excel serial number date formats.
 * @param worksheet The XLSX worksheet object.
 * @returns The period string in "YYYY-MM" format.
 */
export function getPeriodFromFile(worksheet: WorkSheet): string {
  const periodCell = worksheet['B2']
  if (!periodCell || !periodCell.v) {
    throw new Error('Period not found in cell B2. Please use the template and fill in the period.')
  }

  let dateString: string

  if (periodCell.t === 'n') {
    dateString = XLSX.SSF.format('dd/mm/yyyy', periodCell.v)
  } else {
    dateString = periodCell.v.toString()
  }

  const parts = dateString.split('/')
  if (parts.length !== 3) {
    throw new Error(`Invalid period format: "${dateString}". Expected "DD/MM/YYYY".`)
  }

  const [_day, month, year] = parts as [string, string, string]

  if (!/^\d{4}$/.test(year) || !/^\d{1,2}$/.test(month)) {
    throw new Error(`Could not correctly parse the date from "${dateString}".`)
  }

  return `${year}-${month.padStart(2, '0')}`
}

/**
 * Finds the earliest and latest month (YYYY-MM) in an ESB Excel file.
 */
export function getPeriodRangeFromEsbData(worksheet: WorkSheet): { startPeriod: string, endPeriod: string } {
  const jsonRows: any[] = XLSX.utils.sheet_to_json(worksheet, { range: 11 })
  if (jsonRows.length === 0) throw new Error('ESB file has no data rows.')

  let earliestDate: Date | null = null
  let latestDate: Date | null = null

  jsonRows.forEach((row) => {
    const dateValue = row['Sales Date In']
    if (dateValue === undefined || dateValue === null) return

    let currentDate: Date | null = null

    // --- START: NEW HYBRID PARSING LOGIC ---
    if (typeof dateValue === 'number') {
      currentDate = convertExcelDate(dateValue)
    } else if (typeof dateValue === 'string') {
      // Fallback for string-based dates, assuming DD-MM-YYYY or MM/DD/YYYY
      const parts = dateValue.includes('/') ? dateValue.split('/') : dateValue.split('-')
      if (parts.length === 3) {
        // A simple heuristic to guess between MM/DD and DD/MM
        const part1 = parseInt(parts[0], 10)
        const part2 = parseInt(parts[1], 10)
        let year = parseInt(parts[2], 10)
        if (year < 100) year += 2000

        if (part1 > 12) { // Definitely DD/MM/YYYY
          currentDate = new Date(year, part2 - 1, part1)
        } else { // Assume MM/DD/YYYY as it's a common xlsx library default
          currentDate = new Date(year, part1 - 1, part2)
        }
      }
    }
    // --- END: NEW HYBRID PARSING LOGIC ---

    if (currentDate && !isNaN(currentDate.getTime())) {
      if (!earliestDate || currentDate < earliestDate) earliestDate = currentDate
      if (!latestDate || currentDate > latestDate) latestDate = currentDate
    }
  })

  if (!earliestDate || !latestDate) {
    throw new Error('Could not find any valid dates in the \'Sales Date In\' column.')
  }

  const startPeriod = `${earliestDate.getFullYear()}-${(earliestDate.getMonth() + 1).toString().padStart(2, '0')}`
  const endPeriod = `${latestDate.getFullYear()}-${(latestDate.getMonth() + 1).toString().padStart(2, '0')}`

  return { startPeriod, endPeriod }
}

/**
 * Finds the earliest and latest month (YYYY-MM) in a Moka CSV file.
 */
export function getPeriodRangeFromMokaData(worksheet: WorkSheet): { startPeriod: string, endPeriod: string } {
  const json = XLSX.utils.sheet_to_json(worksheet, { header: 1 })
  if (json.length < 2) throw new Error('Moka file is empty or has no data rows.')

  const headers = json[0] as string[]
  const dateIndex = headers.findIndex((h) => h === 'Date')
  if (dateIndex === -1) throw new Error('Column \'Date\' not found in Moka file.')

  let earliestDate: Date | null = null
  let latestDate: Date | null = null

  for (let i = 1; i < json.length; i++) {
    const row = json[i] as any[]
    const dateString = row[dateIndex]

    if (dateString && typeof dateString === 'string') {
      const parts = dateString.split('-')
      if (parts.length === 3 && parts[0] && parts[1] && parts[2]) {
        const day = parseInt(parts[0], 10)
        const month = parseInt(parts[1], 10) - 1 // JS months are 0-indexed
        const year = parseInt(parts[2], 10)

        if (!isNaN(day) && !isNaN(month) && !isNaN(year)) {
          const currentDate = new Date(year, month, day)
          if (!earliestDate || currentDate < earliestDate) earliestDate = currentDate
          if (!latestDate || currentDate > latestDate) latestDate = currentDate
        }
      }
    }
  }

  if (!earliestDate || !latestDate) {
    throw new Error('Could not find any valid dates in the \'Date\' column.')
  }

  // TypeScript assertions after the null check
  const earliest = earliestDate as Date
  const latest = latestDate as Date

  const startPeriod = `${earliest.getFullYear()}-${(earliest.getMonth() + 1).toString().padStart(2, '0')}`
  const endPeriod = `${latest.getFullYear()}-${(latest.getMonth() + 1).toString().padStart(2, '0')}`

  return { startPeriod, endPeriod }
}

/**
 * Converts an Excel serial date number to a JavaScript Date object.
 */
function convertExcelDate(serial: number): Date | null {
  if (isNaN(serial) || serial < 0) {
    return null
  }
  // Formula to convert Excel serial number to a JS Date
  const excelToUnixEpochDays = 25569
  const unixTimestampMilliseconds = (serial - excelToUnixEpochDays) * 86400 * 1000
  const date = new Date(unixTimestampMilliseconds)
  const adjustedDate = new Date(date.getTime() + (date.getTimezoneOffset() * 60 * 1000))
  return !isNaN(adjustedDate.getTime()) ? adjustedDate : null
}
