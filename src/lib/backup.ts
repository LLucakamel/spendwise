import { z } from 'zod'
import {
  accountRecordSchema,
  budgetRecordSchema,
  categoryRecordSchema,
  debtRecordSchema,
  goalRecordSchema,
  importBatchRecordSchema,
  incomeSourceRecordSchema,
  invoiceRecordSchema,
  recurringBillRecordSchema,
  settingsSchema,
  transactionRecordSchema,
} from '@/domain/schemas'
import { TRANSFER_CATEGORY_ID, type FinanceData } from '@/domain/types'

export const BACKUP_FORMAT = 'spendwise-backup'
export const BACKUP_VERSION = 2

export type BackupSource = 'account' | 'demo'

/** Version 1 files (before accounts, income and invoices) are accepted; missing lists become empty. */
export const backupSchema = z.object({
  format: z.literal(BACKUP_FORMAT),
  version: z.union([z.literal(1), z.literal(2)]),
  exportedAt: z.string(),
  source: z.enum(['account', 'demo']),
  data: z.object({
    settings: settingsSchema,
    categories: z.array(categoryRecordSchema).max(500),
    transactions: z.array(transactionRecordSchema).max(100_000),
    budgets: z.array(budgetRecordSchema).max(1000),
    recurringBills: z.array(recurringBillRecordSchema).max(1000),
    accounts: z.array(accountRecordSchema).max(200).default([]),
    incomeSources: z.array(incomeSourceRecordSchema).max(500).default([]),
    invoices: z.array(invoiceRecordSchema).max(20_000).default([]),
    imports: z.array(importBatchRecordSchema).max(2000).default([]),
    goals: z.array(goalRecordSchema).max(200).default([]),
    debts: z.array(debtRecordSchema).max(200).default([]),
  }),
})

export type Backup = z.infer<typeof backupSchema>

export function createBackup(data: FinanceData, source: BackupSource, now: Date = new Date()): Backup {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: now.toISOString(),
    source,
    data: {
      settings: data.settings,
      categories: data.categories,
      transactions: data.transactions,
      budgets: data.budgets,
      recurringBills: data.recurringBills,
      accounts: data.accounts,
      incomeSources: data.incomeSources,
      // Attached files stay in private storage; the backup keeps their metadata only.
      invoices: data.invoices,
      imports: data.imports,
      goals: data.goals,
      debts: data.debts,
    },
  }
}

export type ParseBackupResult = { ok: true; backup: Backup } | { ok: false; error: string; where?: string }

export function parseBackup(text: string): ParseBackupResult {
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    return { ok: false, error: 'backup.errors.notJson' }
  }
  const result = backupSchema.safeParse(json)
  if (!result.success) {
    const issue = result.error.issues[0]
    return { ok: false, error: 'backup.errors.invalid', where: issue?.path.join('.') }
  }
  const { data } = result.data
  const categoryIds = new Set([...data.categories.map((c) => c.id), TRANSFER_CATEGORY_ID])
  const categoryRefs = [
    ...data.transactions.map((t) => t.categoryId),
    ...data.budgets.map((b) => b.categoryId),
    ...data.recurringBills.map((b) => b.categoryId),
    ...data.incomeSources.map((s) => s.categoryId),
  ]
  if (categoryRefs.some((id) => !categoryIds.has(id))) return { ok: false, error: 'backup.errors.missingCategory' }
  const accountIds = new Set(data.accounts.map((a) => a.id))
  const accountRefs = data.transactions.flatMap((t) => [t.accountId, t.toAccountId]).filter((id): id is string => id !== null)
  if (accountRefs.some((id) => !accountIds.has(id))) return { ok: false, error: 'backup.errors.missingAccount' }
  return { ok: true, backup: result.data }
}

export function backupCounts(backup: Backup) {
  const d = backup.data
  return {
    transactions: d.transactions.length,
    budgets: d.budgets.length,
    bills: d.recurringBills.length,
    categories: d.categories.length,
    accounts: d.accounts.length,
    incomeSources: d.incomeSources.length,
    invoices: d.invoices.length,
    goals: d.goals.length,
    debts: d.debts.length,
  }
}
