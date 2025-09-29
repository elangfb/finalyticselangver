// Shared helper functions for parsing different types of uploaded Excel files.

import type { WorkSheet } from "xlsx";

declare const XLSX: any;

/**
 * Extracts the period (YYYY-MM) from a template file's "B2" cell.
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

    // Check if Excel stored the date as a number (serial date) or a string
    if (periodCell.t === 'n') {
        // Note: XLSX.SSF is a utility from the xlsx.full.min.js library
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

    // Return in the required "YYYY-MM" format
    return `${year}-${month.padStart(2, '0')}`;
}

/**
 * Extracts the period (YYYY-MM) from a Moka or standard sales data file.
 * It finds the date in the specified cell to determine the correct period.
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
