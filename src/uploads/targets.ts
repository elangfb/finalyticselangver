// Contains logic for processing and downloading Sales and P&L Target templates and files.

declare const XLSX: any;

import { doc, setDoc } from 'firebase/firestore';
import { ref, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../core/firebase';
import { currentUser } from '../core/state';
import { showLoading, hideLoading } from '../core/ui';
import { getPeriodFromFile } from './utils';

/**
 * Handles the upload of Target files (Sales or P&L). This single function
 * replaces the two separate handlers from the original file.
 * @param file The Excel file to process.
 * @param type The type of target ('sales' or 'pnl').
 * @param expectedPeriod An optional period string (YYYY-MM) for validation.
 * @returns A promise that resolves when the upload is complete.
 */
export async function handleTargetUpload(file: File, type: 'sales' | 'pnl', expectedPeriod: string | null = null): Promise<void> {
    if (!currentUser) throw new Error("User not authenticated.");

    const data = await file.arrayBuffer();
    const workbook = XLSX.read(data);

    const sheetName = type === 'sales' ? "Sales Target Data" : "P&L Target Data";
    const worksheet = workbook.Sheets[sheetName];
    if (!worksheet) {
        throw new Error(`Sheet '${sheetName}' not found. Please use the correct template.`);
    }

    const branchName = worksheet['B1'] ? String(worksheet['B1'].v).trim() : 'Unknown Branch';
    const actualPeriod = getPeriodFromFile(worksheet);

    if (expectedPeriod && actualPeriod !== expectedPeriod) {
        throw new Error(`File period mismatch. Expected '${expectedPeriod}', but file contains '${actualPeriod}'.`);
    }

    // P&L Targets have "Value", Sales Targets have "Target" column in the template.
    // We accommodate both by checking the `type`.
    const valueColumnName = type === 'sales' ? 'Target' : 'Value';
    const jsonData: any[] = XLSX.utils.sheet_to_json(worksheet, { header: ["Metric", valueColumnName], range: 3 });

    if (!jsonData || jsonData.length === 0) {
        throw new Error("The Excel file is empty or does not contain valid data.");
    }

    const targets = jsonData.reduce((acc, row) => {
        const targetValue = row[valueColumnName];
        if (row.Metric && targetValue !== undefined && typeof targetValue === 'number') {
            acc[String(row.Metric).trim()] = targetValue;
        }
        return acc;
    }, {} as { [key: string]: number });

    if (Object.keys(targets).length === 0) {
        throw new Error(`Could not find 'Metric' and '${valueColumnName}' columns with valid data.`);
    }

    const collectionPath = type === 'sales' ? 'monthlySalesTargets' : 'monthlyPnlTargets';
    const safeBranchName = branchName.replace(/\s+/g, '_');
    const docId = `${actualPeriod}_${safeBranchName}`;
    const targetDocRef = doc(db, `users/${currentUser.uid}/${collectionPath}`, docId);

    await setDoc(targetDocRef, {
        fileName: file.name,
        lastUpdatedAt: new Date(),
        targets: targets,
        period: actualPeriod,
        branchName: branchName
    }, { merge: true });
}


/**
 * Generates and triggers a download for the Sales Target Excel template.
 */
export function downloadSalesTargetTemplate() {
    const instructions = [
        { Step: 1, Instruction: "In the 'Sales Target Data' sheet, replace '[Enter Business Name Here]' with your business/branch name in cell B1." },
        { Step: 2, Instruction: "In cell B2, enter a date from the desired month and year. Excel will format it (e.g., to '01/12/2024' for December 2024)." },
        { Step: 3, Instruction: "Fill in the target values in the 'Target' column. These should be numbers without commas or currency symbols." },
    ];

    const sheetData = [
        { A: "Business Name:", B: "[Enter Business Name Here]" },
        { A: "Period:", B: "01/12/2024" },
        {},
        { A: "Metric", B: "Target" },
        { A: "Total Omzet", B: 300000000 },
        { A: "Total Transaction", B: 6000 },
        { A: "Avg. Per Transaction", B: 50000 },
        { A: "Total Items Sold", B: 10000 },
        { A: "Omzet Harian", B: 10000000 },
        { A: "Omzet Mingguan", B: 70000000 },
        { A: "Total Transaksi Per Hari", B: 200 },
        { A: "Average Check", B: 50000 },
    ];

    const wsInstructions = XLSX.utils.json_to_sheet(instructions, { skipHeader: true });
    const wsData = XLSX.utils.json_to_sheet(sheetData, { skipHeader: true });
    wsInstructions['!cols'] = [{ wch: 10 }, { wch: 100 }];
    wsData['!cols'] = [{ wch: 30 }, { wch: 20 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, wsInstructions, "Instructions");
    XLSX.utils.book_append_sheet(wb, wsData, "Sales Target Data");
    XLSX.writeFile(wb, "Finalytics_Sales_Target_Template.xlsx");
}


/**
 * Fetches the P&L Target template from Firebase Storage and triggers a download.
 */
export async function downloadPnlTargetTemplate() {
    showLoading({ message: 'Fetching template...' });
    const templatePath = 'templates/Finalytics_P&L_Target_Template.xlsx';
    const templateRef = ref(storage, templatePath);

    try {
        const url = await getDownloadURL(templateRef);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', 'Finalytics_P&L_Target_Template.xlsx');
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        hideLoading();
    } catch (error) {
        hideLoading();
        console.error("Error fetching P&L template from Storage:", error);
        alert("Could not download the template. Please ensure it has been uploaded by an administrator.");
    }
}
