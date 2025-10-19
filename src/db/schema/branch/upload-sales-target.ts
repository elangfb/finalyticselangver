import * as z from 'zod';
import { PositivePercentageRangeSchema, TimestampMetadataSchema, YearMonthSchema } from '../_common';
import { DateTimeSchema } from '../datetime';

/**
 * [@]: `/branches/{branchId}/salesTargets/{reportId}`
 */
export const BranchUploadSalesTargetSchema = z.object({
  id: z.string().min(1),
  accountId: z.string().min(1),
  branchId: z.string().min(1),
  
  branchName: z.string().nullish().transform(v => v || null),

  fileName: z.string(),

  period: YearMonthSchema,
  targets: z.record(z.string(), PositivePercentageRangeSchema),

  lastUpdatedAt: DateTimeSchema.nullish(),
  lastUpdatedBy: z.string().nullish(),

  ...TimestampMetadataSchema.shape,
}).transform(report => {
    const {
        lastUpdatedAt,
        lastUpdatedBy,
        ...remaining
    } = report
    
    return {
        ...remaining,
        updatedAt: report.updatedAt || lastUpdatedAt || null,
        updatedBy: report.updatedBy || lastUpdatedBy || null,
    }
});

export type LooseBranchUploadSalesTarget = z.input<typeof BranchUploadSalesTargetSchema>;
export type BranchUploadSalesTarget = z.output<typeof BranchUploadSalesTargetSchema>;
