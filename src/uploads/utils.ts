// Shared helper functions for parsing different types of uploaded Excel files.

import type { WorkSheet } from "xlsx";

declare const XLSX: any;

/**
 * Extracts the period (YYYY-MM) from a standard template file's "B2" cell.
 * Handles both string and Excel serial number date formats.
 * @param worksheet The XLSX worksheet object.
 * @returns The period string in "YYYY-MM" format.
 */
export function getPeriodFromFile(worksheet: WorkSheet): string {
    const periodCell = worksheet['B2'];
    if (!periodCell || !periodCell.v) {
        throw new Error("Period not found in cell B2. Please use the template and fill in the period.");
    }

    let dateString: string;

    if (periodCell.t === 'n') {
        dateString = XLSX.SSF.format('dd/mm/yyyy', periodCell.v);
    } else {
        dateString = periodCell.v.toString();
    }

    const parts = dateString.split('/');
    if (parts.length !== 3) {
        throw new Error(`Invalid period format: "${dateString}". Expected "DD/MM/YYYY".`);
    }

    const [_day, month, year] = parts as [string, string, string];

    if (!/^\d{4}$/.test(year) || !/^\d{1,2}$/.test(month)) {
        throw new Error(`Could not correctly parse the date from "${dateString}".`);
    }

    return `${year}-${month.padStart(2, '0')}`;
}

/**
 * Extracts the period (YYYY-MM) from a standard sales data file (from cell B5).
 * @param worksheet The XLSX worksheet object.
 * @returns The period string in "YYYY-MM" format.
 */
export function getPeriodFromSalesData(worksheet: WorkSheet): string {
    const periodCell = worksheet['B5']; // As per the original logic
    if (!periodCell || !periodCell.v) {
        throw new Error("Period data range not found in cell B5. Please ensure it is filled out correctly.");
    }

    const dateRangeString = periodCell.v.toString();
    const startDateString = dateRangeString.split(' - ')[0];
    if (!startDateString) {
        throw new Error(`Invalid date range format in cell B5: "${dateRangeString}".`);
    }

    const parts = startDateString.split('-');
    if (parts.length !== 3) {
        throw new Error(`Invalid date format for the start date: "${startDateString}". Expected "DD-MM-YYYY".`);
    }

    const [_day, month, year] = parts;

    if (!/^\d{4}$/.test(year) || !/^\d{2}$/.test(month)) {
         throw new Error(`Could not correctly parse the year and month from "${startDateString}".`);
    }

    return `${year}-${month}`;
}

/**
 * Extracts the period (YYYY-MM) from a Moka sales data file by finding the earliest date.
 * @param worksheet The XLSX worksheet object.
 * @returns The period string in "YYYY-MM" format.
 */
export function getPeriodFromMokaData(worksheet: any): string {
    const json = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
    if (json.length < 2) {
        throw new Error("Moka file is empty or has no data rows.");
    }

    const headers = json[0] as string[];
    const dateIndex = headers.findIndex(h => h === 'Date');
    if (dateIndex === -1) {
        throw new Error("Column 'Date' not found in Moka file.");
    }

    let earliestDate: Date | null = null;

    for (let i = 1; i < json.length; i++) {
        const row = json[i] as any[];
        const dateString = row[dateIndex];

        if (dateString && typeof dateString === 'string') {
            const parts = dateString.split('/') as [string, string, string];
            if (parts.length === 3) {
                const day = parseInt(parts[0], 10);
                const month = parseInt(parts[1], 10) - 1; // JS months are 0-indexed
                const year = parseInt(parts[2], 10);

                if (!isNaN(day) && !isNaN(month) && !isNaN(year)) {
                    const currentDate = new Date(year, month, day);
                    if (!earliestDate || currentDate < earliestDate) {
                        earliestDate = currentDate;
                    }
                }
            }
        }
    }

    if (!earliestDate) {
        throw new Error("Could not find any valid dates in the 'Date' column.");
    }

    const year = earliestDate.getFullYear();
    const month = (earliestDate.getMonth() + 1).toString().padStart(2, '0');

    return `${year}-${month}`;
}

