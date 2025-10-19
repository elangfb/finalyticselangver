import * as z from 'zod';
import { bigintToUint8Array, TimestampMetadataSchema, YearMonthSchema } from '../_common';
import { DateTimeSchema } from '../datetime';
import { xxh3 } from '@node-rs/xxhash';
import { Base64 } from 'js-base64';

const UploadSalesSourceFormatSchema = z.enum(['ESB', 'MOKA'])
const UploadRawJsonFilePathSchema = z.string().startsWith('raw_json/')
const UploadStatusSchema = z.enum(['uploaded', 'complete'])

/**
 * [@]: `/branches/{branchId}/salesReports/{reportId}`
 */
export const BranchUploadSalesReportSchema = z.object({
  id: z.string().nonempty(),
  accountId: z.string().nonempty(),
  branchId: z.string().nonempty(),
  processedFromJob: z.string().nonempty().nullish(),
  jobId: z.string().nonempty().nullable(),

  branchName: z.string().nonempty(),
  period: YearMonthSchema,

  fileName: z.string().nullish(),
  sourceFile: z.object({
    filePath: z.string().nullish().default(null),
    sizeInBytes: z.number().positive().nullish().default(null),
    format: UploadSalesSourceFormatSchema,
  }),
  
  rawJsonFilePath: UploadRawJsonFilePathSchema.nullable(),
  status: UploadStatusSchema,

  duplicateCount: z.int().positive().nullish().transform(v => v || 0),
  newRowsAdded: z.int().positive().nullish(),
  newRowsCount: z.int().positive().nullish(),

  uploadedAt: DateTimeSchema.nullish(),
  uploadedBy: z.string().nonempty().nullish(),

  ...TimestampMetadataSchema.shape,
}).transform((report, ctx) => {
  const {
    processedFromJob,
    fileName,
    newRowsAdded,
    uploadedAt,
    uploadedBy,
    ...remaining
  } = report

  const jobId = report.jobId || processedFromJob

  if (!jobId) {
    ctx.addIssue({
      code: 'custom',
      message: 'Either "jobId" or "processedFromJob" cannot be empty.',
      path: ['jobid'],
    })

    return z.NEVER
  }

  const filePath = report.sourceFile.filePath || fileName

  if (!filePath) {
    ctx.addIssue({
      code: 'custom',
      message: 'Either "sourceFile.filePath" or "fileName" cannot be empty.',
      path: ['sourceFile.filePath'],
    })

    return z.NEVER
  }

  return {
    ...remaining,
    jobId,
    sourceFile: { ...report.sourceFile, filePath },
    newRowsCount: report.newRowsCount || newRowsAdded || 0,
    createdAt: report.createdAt || uploadedAt || new Date(),
    createdBy: report.createdBy || uploadedBy || null,
  }
});

export type LooseBranchUploadSalesReport = z.input<typeof BranchUploadSalesReportSchema>;
export type BranchUploadSalesReport = z.output<typeof BranchUploadSalesReportSchema>;

export const BranchSalesDailySummaryIdSchema = z.iso.date()

/**
 * [@]: `/branches/{branchId}/salesDailySummaries/{summaryId}`
 */
export const BranchSalesDailySummarySchema = z.object({
  date: z.iso.date(),
  accountId: z.string().nonempty(),
  branchId: z.string().nonempty(),

  // --- Core Sales Metrics ---
  totalOmzet: z.number(),
  totalTransactions: z.number().int(),
  apc: z.number(), // Average Per Check / Transaction
  totalItemsSold: z.number().int(),

  // --- Financial Aggregates ---
  totalSale: z.number(),
  totalTax: z.number(),
  subtotal: z.number(),
  totalDiscount: z.number(),

  // --- Top Performers ---
  topProductByQty: z.string(),
  topProductByRevenue: z.string(),

  // --- Breakdowns & Distributions ---
  cogsByBranch: z.record(z.string(), z.number()), // Note: Seems redundant if branchId is present? Check backend logic if still needed.
  hourlyRevenue: z.array(z.number()).length(24),
  revenueByBranch: z.record(z.string(), z.number()),
  revenueByVisitPurpose: z.record(z.string(), z.number()),
  menuItemQuantities: z.record(z.string(), z.record(z.string(), z.number().int())), // Category -> Menu -> Quantity
  menuItemRevenues: z.record(z.string(), z.record(z.string(), z.number())), // Category -> Menu -> Revenue
  transactionCountsByBranch: z.record(z.string(), z.number().int()),
  trafficByHour: z.array(z.number().int()).length(24),
  branches: z.array(z.string()), // List of branches contributing if aggregated? Check necessity.
  brands: z.array(z.string()),
  visitPurposes: z.record(z.string(), z.number().int()), // Count per visit purpose
  orderComposition: z.object({
    foodOnly: z.object({ count: z.number().int() }),
    drinkOnly: z.object({ count: z.number().int() }),
    mixed: z.object({ count: z.number().int() }),
  }),
  paymentMethods: z.record(z.string(), z.number()), // Revenue per payment method
  menuCategories: z.record(z.string(), z.object({
    revenue: z.number(),
    quantity: z.number().int(),
  })),

  processedRowIds: z.array(z.string()).nullish(),
}).transform(summary => {
  const { processedRowIds, ...remaining } = summary

  return remaining
});

export type LooseBranchSalesDailySummary = z.input<typeof BranchSalesDailySummarySchema>;
export type BranchSalesDailySummary = z.output<typeof BranchSalesDailySummarySchema>;

export const BranchSalesProcessedRowIdParamsSchema = z.object({
  BranchName: z.string().nonempty(),
  BillNumber: z.string().nonempty(),
  SalesDateInUnixMs: z.int().positive(),
  Menu: z.string().nonempty(),
})

/**
 * Generate deterministic row ID based on given params.
 * Same params will generate same row ID for deduplication.
 * 
 * Params will be joined into a string,
 * hashed using XXH3 128-bit,
 * and returned in hex string.
 */
export function calculateBranchSalesProcessedRowId(
  params: z.infer<typeof BranchSalesProcessedRowIdParamsSchema>,
): string {
  const rawIdentifier = `${params.BranchName}|${params.BillNumber}|${params.SalesDateInUnixMs}|${params.Menu}`
  const hash = xxh3.xxh128(rawIdentifier)

  return Base64.fromUint8Array(bigintToUint8Array(hash), true)
}

/**
 * [@]: `/branches/{branchId}/salesProcessedRows/{rowId}`
 */
export const BranchSalesProcessedRowSchema = z.object({
  accountId: z.string().nonempty(),
  branchId: z.string().nonempty(),
  uploadId: z.string().nonempty(),

  date: z.iso.date(),

  ...TimestampMetadataSchema.shape,
});

export type LooseBranchSalesProcessedRow = z.input<typeof BranchSalesProcessedRowSchema>;
export type BranchSalesProcessedRow = z.output<typeof BranchSalesProcessedRowSchema>;
