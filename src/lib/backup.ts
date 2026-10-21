import { z } from 'zod'
import {
  budgetRecordSchema,
  categoryRecordSchema,
  recurringBillRecordSchema,
  settingsSchema,
  transactionRecordSchema,
} from '@/domain/schemas'
import type { FinanceData } from '@/domain/types'

export const BACKUP_FORMAT = 'spendwise-backup'
export const BACKUP_VERSION = 1

export type BackupSource = 'account' | 'demo'

export const backupSchema = z.object({
  format: z.literal(BACKUP_FORMAT),
  version: z.literal(BACKUP_VERSION),
  exportedAt: z.string(),
  source: z.enum(['account', 'demo']),
  data: z.object({
    settings: settingsSchema,
    categories: z.array(categoryRecordSchema).max(500),
    transactions: z.array(transactionRecordSchema).max(100_000),
    budgets: z.array(budgetRecordSchema).max(1000),
    recurringBills: z.array(recurringBillRecordSchema).max(1000),
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
    },
  }
}

export type ParseBackupResult = { ok: true; backup: Backup } | { ok: false; error: string }

export function parseBackup(text: string): ParseBackupResult {
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    return { ok: false, error: 'The file is not valid JSON.' }
  }
  const result = backupSchema.safeParse(json)
  if (!result.success) {
    const issue = result.error.issues[0]
    const where = issue?.path.length ? ` (at ${issue.path.join('.')})` : ''
    return { ok: false, error: `This is not a valid SpendWise backup${where}.` }
  }
  const { data } = result.data
  const categoryIds = new Set(data.categories.map((c) => c.id))
  const missing = [...data.transactions, ...data.budgets, ...data.recurringBills].find(
    (r) => !categoryIds.has(r.categoryId),
  )
  if (missing) return { ok: false, error: 'The backup references a category that it does not contain.' }
  return { ok: true, backup: result.data }
}

export function backupSummary(backup: Backup): string {
  const d = backup.data
  return `${d.transactions.length} transactions, ${d.budgets.length} budgets, ${d.recurringBills.length} recurring bills, ${d.categories.length} categories`
}
