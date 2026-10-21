import { AlertTriangleIcon, Loader2Icon } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { useRepository } from '@/app/session'
import { FormField } from '@/components/common/FormField'
import { AccountSelect, CategorySelect, CurrencySelect } from '@/components/common/pickers'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { NativeSelect } from '@/components/ui/native-select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { TRANSACTION_DEFAULTS } from '@/data/repository'
import { useFinance } from '@/data/DataProvider'
import { isSupportedCurrency } from '@/domain/currencies'
import { useFormat } from '@/hooks/use-format'
import { useI18n, type MessageKey } from '@/i18n'
import { errorKey } from '@/lib/errors'
import { MAX_STATEMENT_BYTES, readHead, sniffFileType } from '@/lib/files'
import { classifyDuplicates, guessMapping, importTransactionId, interpretRows, parseCsv, rowsFromStatementText, type ColumnMapping } from '@/lib/import'
import { readPdf } from '@/lib/invoice/ocr'
import type { DateOrder } from '@/lib/text'

const COLUMN_KEYS: (keyof ColumnMapping)[] = ['date', 'description', 'amount', 'debit', 'credit', 'currency', 'reference']

/**
 * Statement import: choose → map columns → review. Every row is shown before anything is saved;
 * rows already imported are skipped by ID, and possible duplicates start unticked for review.
 */
export function ImportDialog({ open, onOpenChange, defaultAccountId }: { open: boolean; onOpenChange(open: boolean): void; defaultAccountId?: string }) {
  const { t } = useI18n()
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-1rem)] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{t('imports.title')}</DialogTitle>
          <DialogDescription>{t('imports.text')}</DialogDescription>
        </DialogHeader>
        {open ? <ImportWizard defaultAccountId={defaultAccountId} onDone={() => onOpenChange(false)} /> : null}
      </DialogContent>
    </Dialog>
  )
}

function ImportWizard({ defaultAccountId, onDone }: { defaultAccountId?: string; onDone(): void }) {
  const { t } = useI18n()
  const repo = useRepository()
  const format = useFormat()
  const { transactions, settings, accounts } = useFinance()
  const fileInput = useRef<HTMLInputElement>(null)
  const [fileName, setFileName] = useState('')
  const [format_, setFormat] = useState<'csv' | 'pdf'>('csv')
  const [table, setTable] = useState<string[][]>([])
  const [hasHeader, setHasHeader] = useState(true)
  const [mapping, setMapping] = useState<ColumnMapping | null>(null)
  const [accountId, setAccountId] = useState(defaultAccountId ?? accounts.find((a) => a.syncMode === 'import')?.id ?? '')
  const [currency, setCurrency] = useState(accounts.find((a) => a.id === (defaultAccountId ?? ''))?.currency ?? settings.displayCurrency)
  const [dateOrder, setDateOrder] = useState<DateOrder>('dmy')
  const [expenseCategory, setExpenseCategory] = useState('exp-other')
  const [incomeCategory, setIncomeCategory] = useState('inc-other')
  const [excluded, setExcluded] = useState<Set<number> | null>(null)
  const [error, setError] = useState<MessageKey | null>(null)
  const [busy, setBusy] = useState(false)
  const [batchId] = useState(() => repo.newId())

  const header = hasHeader ? (table[0] ?? []) : (table[0] ?? []).map((_, i) => `#${i + 1}`)
  const body = hasHeader ? table.slice(1) : table
  const rows = useMemo(
    () => (mapping ? interpretRows(body, mapping, { currency, dateOrder, accountId: accountId || null, isSupportedCurrency }) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [table, hasHeader, mapping, currency, dateOrder, accountId],
  )
  const duplicates = useMemo(() => classifyDuplicates(rows, accountId || null, transactions), [rows, accountId, transactions])
  // Possible duplicates and rows with errors start excluded; the user can include duplicates explicitly.
  const isIncluded = (index: number) => {
    const row = rows[index]
    if (!row || row.errors.length > 0 || duplicates.get(index) === 'already-imported') return false
    if (excluded) return !excluded.has(index)
    return !duplicates.has(index)
  }
  const included = rows.filter((r) => isIncluded(r.index))
  const toggle = (index: number) => {
    const base = excluded ?? new Set(rows.filter((r) => !isIncluded(r.index)).map((r) => r.index))
    const next = new Set(base)
    if (next.has(index)) next.delete(index)
    else next.add(index)
    setExcluded(next)
  }

  const onFile = async (file: File | undefined) => {
    if (!file) return
    setError(null)
    if (file.size > MAX_STATEMENT_BYTES) {
      setError('imports.tooLarge')
      return
    }
    const type = sniffFileType(await readHead(file))
    let parsed: string[][]
    if (type === 'text/csv') {
      parsed = parseCsv(await file.text())
      setFormat('csv')
    } else if (type === 'application/pdf') {
      try {
        const pdf = await readPdf(await file.arrayBuffer(), () => undefined)
        parsed = rowsFromStatementText(pdf.text)
        setFormat('pdf')
        setHasHeader(true)
      } catch {
        parsed = []
      }
    } else {
      setError('imports.unsupported')
      return
    }
    if (parsed.length < 2) {
      setError('imports.noRows')
      return
    }
    setFileName(file.name)
    setTable(parsed)
    setMapping(guessMapping(parsed[0] ?? []))
    setExcluded(null)
  }

  const approve = async () => {
    if (!mapping || included.length === 0) return
    setBusy(true)
    try {
      const result = await repo.importTransactions(
        batchId,
        {
          fileName: fileName.slice(0, 200),
          format: format_,
          accountId: accountId || null,
          rowCount: rows.length,
          importedCount: included.length,
          duplicateCount: [...duplicates.values()].length,
          skippedCount: rows.length - included.length,
          status: 'completed',
        },
        included.map((row) => ({
          id: importTransactionId(accountId || null, row.key),
          input: {
            ...TRANSACTION_DEFAULTS,
            type: row.type ?? 'expense',
            description: row.description.slice(0, 120),
            amountMinor: row.amountMinor ?? 0,
            currency: row.currency,
            categoryId: row.type === 'income' ? incomeCategory : expenseCategory,
            date: row.date ?? '',
            accountId: accountId || null,
            origin: 'import',
            sourceRef: row.reference ? row.reference.slice(0, 120) : null,
            importId: batchId,
          },
        })),
      )
      toast.success(t('imports.done', { imported: result.imported, present: result.alreadyPresent }))
      onDone()
    } catch (e) {
      toast.error(`${t('toast.couldNotSave')} ${t(errorKey(e))}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid gap-5">
      {error ? (
        <p role="alert" className="rounded-md bg-expense-soft px-3 py-2 text-sm">
          {t(error)}
        </p>
      ) : null}
      <section className="grid gap-3">
        <h3 className="text-sm font-semibold">{t('imports.step1')}</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label={t('imports.file')}>
            <div>
              <Button type="button" variant="outline" onClick={() => fileInput.current?.click()}>
                {fileName || t('capture.chooseFile')}
              </Button>
              <input ref={fileInput} type="file" accept=".csv,text/csv,application/pdf,.txt" className="hidden" aria-label={t('imports.file')} onChange={(e) => void onFile(e.target.files?.[0]).finally(() => (e.target.value = ''))} />
            </div>
          </FormField>
          <FormField label={t('imports.account')}>
            <AccountSelect
              value={accountId}
              onChange={(e) => {
                setAccountId(e.target.value)
                const acc = accounts.find((a) => a.id === e.target.value)
                if (acc) setCurrency(acc.currency)
                setExcluded(null)
              }}
            />
          </FormField>
          <FormField label={t('imports.currency')}>
            <CurrencySelect value={currency} onChange={(e) => setCurrency(e.target.value)} />
          </FormField>
          <FormField label={t('imports.dateOrder')}>
            <NativeSelect value={dateOrder} onChange={(e) => setDateOrder(e.target.value as DateOrder)}>
              <option value="dmy">{t('imports.dmy')}</option>
              <option value="mdy">{t('imports.mdy')}</option>
            </NativeSelect>
          </FormField>
        </div>
        <p className="text-xs text-muted-foreground">{t('imports.pdfNote')}</p>
      </section>

      {table.length > 0 && mapping ? (
        <>
          <section className="grid gap-3">
            <h3 className="text-sm font-semibold">{t('imports.step2')}</h3>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="size-4 accent-[var(--primary)]" checked={hasHeader} onChange={(e) => setHasHeader(e.target.checked)} />
              {t('imports.hasHeader')}
            </label>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {COLUMN_KEYS.map((key) => (
                <FormField key={key} label={t(`imports.columns.${key}`)}>
                  <NativeSelect
                    value={mapping[key] === null ? '' : String(mapping[key])}
                    onChange={(e) => {
                      setMapping({ ...mapping, [key]: e.target.value === '' ? null : Number(e.target.value) })
                      setExcluded(null)
                    }}
                  >
                    <option value="">{t('imports.columns.none')}</option>
                    {header.map((h, i) => (
                      <option key={i} value={i}>
                        {h || `#${i + 1}`}
                      </option>
                    ))}
                  </NativeSelect>
                </FormField>
              ))}
              <FormField label={t('imports.expenseCategory')}>
                <CategorySelect type="expense" value={expenseCategory} onChange={(e) => setExpenseCategory(e.target.value)} />
              </FormField>
              <FormField label={t('imports.incomeCategory')}>
                <CategorySelect type="income" value={incomeCategory} onChange={(e) => setIncomeCategory(e.target.value)} />
              </FormField>
            </div>
          </section>

          <section className="grid gap-3">
            <h3 className="text-sm font-semibold">{t('imports.step3')}</h3>
            <p className="text-sm text-muted-foreground" aria-live="polite">
              {t('imports.summary', {
                ready: included.length,
                dupes: duplicates.size,
                errors: rows.filter((r) => r.errors.length > 0).length,
              })}
            </p>
            <div className="max-h-80 overflow-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12 ps-3">{t('imports.include')}</TableHead>
                    <TableHead>{t('common.date')}</TableHead>
                    <TableHead>{t('common.description')}</TableHead>
                    <TableHead className="text-end">{t('common.amount')}</TableHead>
                    <TableHead>{t('common.status')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.slice(0, 500).map((row) => {
                    const dup = duplicates.get(row.index)
                    const disabled = row.errors.length > 0 || dup === 'already-imported'
                    return (
                      <TableRow key={row.index} className={disabled ? 'opacity-60' : undefined}>
                        <TableCell className="ps-3">
                          <input
                            type="checkbox"
                            className="size-4 accent-[var(--primary)]"
                            aria-label={`${t('imports.row')} ${row.index + 1}`}
                            checked={isIncluded(row.index)}
                            disabled={disabled}
                            onChange={() => toggle(row.index)}
                          />
                        </TableCell>
                        <TableCell className="tabular">{row.date ? format.date(row.date) : '—'}</TableCell>
                        <TableCell className="max-w-64 truncate" dir="auto">
                          {row.description || '—'}
                        </TableCell>
                        <TableCell className="text-end">
                          {row.amountMinor !== null && row.type ? <span className={row.type === 'income' ? 'text-income' : 'text-expense'}>{(row.type === 'income' ? '+' : '−') + format.money(row.amountMinor, row.currency)}</span> : '—'}
                        </TableCell>
                        <TableCell className="text-xs">
                          {row.errors.length > 0 ? (
                            <span className="text-expense">{row.errors.map((e) => t(`imports.rowErrors.${e}`)).join('، ')}</span>
                          ) : dup ? (
                            <span className="inline-flex items-center gap-1 text-warning">
                              <AlertTriangleIcon className="size-3.5" aria-hidden="true" />
                              {dup === 'already-imported' ? t('imports.alreadyImported') : t('imports.possibleDuplicate')}
                            </span>
                          ) : null}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          </section>
        </>
      ) : null}

      <DialogFooter>
        <Button variant="outline" onClick={onDone} disabled={busy}>
          {t('common.cancel')}
        </Button>
        <Button onClick={() => void approve()} disabled={busy || included.length === 0}>
          {busy ? <Loader2Icon className="animate-spin" /> : null}
          {t('imports.approve', { count: included.length })}
        </Button>
      </DialogFooter>
    </div>
  )
}
