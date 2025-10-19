import { collectionPath, createPaths, staticDocumentPath } from './_path-builder'

import {
  AccountSchema,
  AccountSubscriptionSchema,
  AdminGlobalConfigSchema,
  UserSchema,
  ActivationDocumentSchema,
  AnalysisCacheSchema,
  BranchMembershipInvitationSchema,
  BranchMembershipSchema,
  BranchSalesDailySummarySchema,
  BranchSalesProcessedRowSchema,
  BranchSchema,
  BranchUploadPnlReportSchema,
  BranchUploadPnlTargetSchema,
  BranchUploadSalesReportSchema,
  BranchUploadSalesTargetSchema,
  JobSchema,
} from './schema'

/**
 * Example 1: Get path for Admin Config
 * `paths.admin.config().path`
 *
 * Example 2: Get path for Account collections
 * `paths.accounts.collectionPath`
 *
 * Example 3: Get path for Account document with ID 1
 * `paths.accounts(1).path`
 *
 * Example 4: Get path for Account Subscription collections
 * `paths.accounts(1).subscriptions.collectionPath`
 *
 * Example 5: Get path for Account Subscription document with ID 2
 * `paths.accounts(1).subscriptions(2).path`
 */
export const paths = createPaths({
  accounts: collectionPath(AccountSchema, {
    subscriptions: collectionPath(AccountSubscriptionSchema),
  }),

  branches: collectionPath(BranchSchema, {
    invites: collectionPath(BranchMembershipInvitationSchema),
    pnlReports: collectionPath(BranchUploadPnlReportSchema),
    pnlTargets: collectionPath(BranchUploadPnlTargetSchema),
    salesReports: collectionPath(BranchUploadSalesReportSchema),
    salesTargets: collectionPath(BranchUploadSalesTargetSchema),
    salesDailySummaries: collectionPath(BranchSalesDailySummarySchema),
    salesProcessedRows: collectionPath(BranchSalesProcessedRowSchema),
  }),
  memberships: collectionPath(BranchMembershipSchema),

  activations: collectionPath(ActivationDocumentSchema),

  admin: collectionPath(null, {
    config: staticDocumentPath(AdminGlobalConfigSchema),
  }),

  analysisCache: collectionPath(AnalysisCacheSchema),

  processingJobs: collectionPath(JobSchema),

  users: collectionPath(UserSchema),
})

export default paths
