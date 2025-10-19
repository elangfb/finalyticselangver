import * as z from "zod";
import { TimestampMetadataSchema, YearMonthSchema } from "../_common";
import { DateTimeSchema } from "../datetime";

const SubcategoriesValueSchema = z.number()
const GenericSubcategories = z.record(
    z.string().nonempty(),
    SubcategoriesValueSchema,
)

function subcategories<const T extends ReadonlyArray<string>>(keys: T) {
    const entries = Object.fromEntries(
        keys.map(key => [key, SubcategoriesValueSchema]),
    ) as { [K in T[number]]: typeof SubcategoriesValueSchema }

    return z.object(entries).catchall(SubcategoriesValueSchema)
}

export const BranchPnlDataSchema = z.object({
    'Pendapatan (Revenue)': GenericSubcategories,
    'Harga Pokok Produksi': GenericSubcategories,
    'Beban Operasional (OPEX)': subcategories(["Wages", "Rent"]),
    'Beban Non Operasional': subcategories(["Advertising"]),
    'Depresiasi/ Amortisasi': GenericSubcategories,
    'Bunga': GenericSubcategories,
    'Pajak (PB1)': GenericSubcategories,
})

export type LooseBranchPnlData = z.input<typeof BranchPnlDataSchema>
export type BranchPnlData = z.output<typeof BranchPnlDataSchema>

/**
 * [@]: `/branches/{branchId}/pnlReports/{reportId}`
 */
export const BranchUploadPnlReportSchema = z.object({
  id: z.string().nonempty(),
  accountId: z.string().nonempty(),
  branchId: z.string().nonempty(),

  branchName: z.string().nullish().transform(v => v || null),

  title: z.string().nullish(),
  fileName: z.string().nonempty(),

  period: YearMonthSchema,
  pnlData: BranchPnlDataSchema,

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
        title: report.title || report.fileName,
        updatedAt: report.updatedAt || lastUpdatedAt || null,
        updatedBy: report.updatedBy || lastUpdatedBy || null,
    }
});

export type LooseBranchUploadPnlReport = z.input<typeof BranchUploadPnlReportSchema>;
export type BranchUploadPnlReport = z.output<typeof BranchUploadPnlReportSchema>;
