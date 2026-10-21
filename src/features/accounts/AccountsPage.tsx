import { ArrowLeftRightIcon, CreditCardIcon, FileUpIcon, InfoIcon, MoreHorizontalIcon, PlusIcon, Undo2Icon, WalletCardsIcon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { useAppPath, useRepository } from '@/app/session'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { Money } from '@/components/common/Money'
import { EmptyState, PageHeader } from '@/components/common/states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Progress } from '@/components/ui/progress'
import { useFinance } from '@/data/DataProvider'
import type { Account, ImportBatch } from '@/domain/types'
import { useTransactionDialogs } from '@/features/transactions/useTransactionDialogs'
import { useAccountLookup, useFormat } from '@/hooks/use-format'
import { useMutation } from '@/hooks/use-mutation'
import { useI18n, type MessageKey } from '@/i18n'
import { todayIso } from '@/lib/dates'
import { accountBalances } from '@/lib/finance'
import { addMinor } from '@/lib/money'
import { cn } from '@/lib/utils'
import { AccountFormDialog } from './AccountFormDialog'
import { ImportDialog } from './ImportDialog'

const PROVIDERS: { title: MessageKey; text: MessageKey; status: MessageKey }[] = [
  { title: 'accounts.providers.banks', text: 'accounts.providers.banksText', status: 'accounts.connection.import' },
  { title: 'accounts.providers.instapay', text: 'accounts.providers.instapayText', status: 'accounts.connection.unsupported' },
  { title: 'accounts.providers.wallet', text: 'accounts.providers.walletText', status: 'accounts.connection.manual' },
  { title: 'accounts.providers.paypal', text: 'accounts.providers.paypalText', status: 'accounts.connection.import' },
  { title: 'accounts.providers.cards', text: 'accounts.providers.cardsText', status: 'accounts.connection.manual' },
]

export function AccountsPage() {
  const { accounts, transactions, imports } = useFinance()
  const repo = useRepository()
  const appPath = useAppPath()
  const { t } = useI18n()
  const format = useFormat()
  const accountNames = useAccountLookup()
  const today = todayIso()
  const txDialogs = useTransactionDialogs()
  const [form, setForm] = useState<{ open: boolean; account?: Account }>({ open: false })
  const [importing, setImporting] = useState<{ open: boolean; accountId?: string }>({ open: false })
  const [toDelete, setToDelete] = useState<Account | null>(null)
  const [rollback, setRollback] = useState<ImportBatch | null>(null)
  const balances = useMemo(() => new Map(accountBalances(accounts, transactions, today).map((b) => [b.accountId, b])), [accounts, transactions, today])

  const archive = useMutation((a: Account, archived: boolean) => repo.update('accounts', a.id, { archived }), { success: 'toast.saved' })
  const remove = useMutation((id: string) => repo.remove('accounts', id), { success: 'toast.deleted', errorPrefix: 'toast.couldNotDelete' })
  const undoImport = useMutation((batchId: string) => repo.rollbackImport(batchId), { success: 'imports.rolledBack', queuesOffline: false })

  // Totals per currency: cash-like accounts vs card debt; never mixed across currencies.
  const totals = new Map<string, { cash: number; debt: number }>()
  for (const a of accounts) {
    if (a.archived) continue
    const b = balances.get(a.id)
    if (!b) continue
    const entry = totals.get(a.currency) ?? { cash: 0, debt: 0 }
    if (a.kind === 'credit-card') entry.debt = addMinor(entry.debt, b.owedMinor ?? 0)
    else entry.cash = addMinor(entry.cash, b.balanceMinor)
    totals.set(a.currency, entry)
  }
  const sorted = [...accounts].sort((a, b) => Number(a.archived) - Number(b.archived) || a.name.localeCompare(b.name))
  const txCount = (id: string) => transactions.filter((tx) => tx.accountId === id || tx.toAccountId === id).length

  return (
    <>
      <PageHeader
        title={t('accounts.title')}
        description={t('accounts.subtitle')}
        actions={
          <>
            <Button variant="outline" onClick={() => setImporting({ open: true })}>
              <FileUpIcon /> {t('accounts.import')}
            </Button>
            <Button variant="outline" onClick={() => txDialogs.openCreate({ type: 'transfer' })} disabled={accounts.length < 2}>
              <ArrowLeftRightIcon /> {t('accounts.transfer')}
            </Button>
            <Button onClick={() => setForm({ open: true })}>
              <PlusIcon /> {t('accounts.add')}
            </Button>
          </>
        }
      />

      <p className="mb-4 flex gap-2 text-xs text-muted-foreground">
        <InfoIcon className="mt-px size-3.5 shrink-0" aria-hidden="true" />
        {t('accounts.noLive')}
      </p>

      {accounts.length === 0 ? (
        <Card>
          <EmptyState
            icon={WalletCardsIcon}
            title={t('accounts.emptyTitle')}
            description={t('accounts.emptyText')}
            action={
              <Button onClick={() => setForm({ open: true })}>
                <PlusIcon /> {t('accounts.add')}
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="grid gap-4">
          <Card>
            <CardHeader>
              <CardTitle>{t('accounts.totals')}</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {[...totals.entries()].map(([currency, v]) => (
                  <li key={currency} className="rounded-lg border p-3 text-sm">
                    <p className="mb-1 font-medium">{currency}</p>
                    <p className="flex justify-between">
                      <span className="text-muted-foreground">{t('accounts.cash')}</span>
                      <Money minor={v.cash} currency={currency} />
                    </p>
                    <p className="flex justify-between">
                      <span className="text-muted-foreground">{t('accounts.debt')}</span>
                      <Money minor={v.debt} currency={currency} className={v.debt > 0 ? 'text-expense' : ''} />
                    </p>
                    <p className="mt-1 flex justify-between border-t pt-1 font-medium">
                      <span>{t('accounts.net')}</span>
                      <Money minor={v.cash - v.debt} currency={currency} tone="signed" />
                    </p>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {sorted.map((account) => {
              const b = balances.get(account.id)
              const isCard = account.kind === 'credit-card'
              return (
                <Card key={account.id} className={cn('gap-3', account.archived && 'opacity-70')}>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 truncate">
                      {isCard ? <CreditCardIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" /> : null}
                      <span className="truncate">{account.name}</span>
                    </CardTitle>
                    <CardDescription>
                      {t(`accountKinds.${account.kind}`)}
                      {account.provider ? ` · ${account.provider}` : ''}
                      {account.last4 ? (
                        <span dir="ltr">
                          {' '}
                          ·•••• {account.last4}
                        </span>
                      ) : null}
                    </CardDescription>
                    <CardAction>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon-sm" aria-label={t('common.actionsFor', { name: account.name })}>
                            <MoreHorizontalIcon />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onSelect={() => setForm({ open: true, account })}>{t('common.edit')}</DropdownMenuItem>
                          <DropdownMenuItem asChild>
                            <Link to={`${appPath('/transactions')}?account=${account.id}`}>{t('accounts.activity')}</Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => setImporting({ open: true, accountId: account.id })}>{t('accounts.import')}</DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => void archive.run(account, !account.archived)}>{account.archived ? t('accounts.unarchive') : t('accounts.archive')}</DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem variant="destructive" onSelect={() => setToDelete(account)}>
                            {t('common.delete')}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </CardAction>
                  </CardHeader>
                  <CardContent className="grid gap-2 text-sm">
                    {isCard ? (
                      <>
                        <p className="flex items-baseline justify-between">
                          <span className="text-muted-foreground">{t('accounts.owed')}</span>
                          <Money minor={b?.owedMinor ?? 0} currency={account.currency} className="text-xl font-semibold" />
                        </p>
                        {account.creditLimitMinor !== null && b?.availableCreditMinor !== null && b ? (
                          <>
                            <Progress
                              value={((b.owedMinor ?? 0) / account.creditLimitMinor) * 100}
                              indicatorClassName={(b.owedMinor ?? 0) > account.creditLimitMinor * 0.8 ? 'bg-warning' : undefined}
                              aria-label={t('accounts.limit')}
                            />
                            <p className="flex justify-between text-xs">
                              <span className="text-muted-foreground" title={t('accounts.availableHint')}>
                                {t('accounts.available')}
                              </span>
                              <Money minor={b.availableCreditMinor ?? 0} currency={account.currency} />
                            </p>
                            <p className="text-xs text-muted-foreground">{t('accounts.availableHint')}</p>
                          </>
                        ) : null}
                        {account.paymentDueDay ? (
                          <p className="text-xs text-muted-foreground">
                            {t('accounts.dueDay')}: {format.number(account.paymentDueDay)}
                            {account.minimumPaymentMinor ? ` · ${t('accounts.minimumPayment')}: ${format.money(account.minimumPaymentMinor, account.currency)}` : ''}
                          </p>
                        ) : null}
                      </>
                    ) : (
                      <p className="flex items-baseline justify-between">
                        <span className="text-muted-foreground">{t('accounts.recordedBalance')}</span>
                        <Money minor={b?.balanceMinor ?? 0} currency={account.currency} className="text-xl font-semibold" />
                      </p>
                    )}
                    <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                      <Badge variant="outline">{t(account.syncMode === 'import' ? 'accounts.connection.import' : 'accounts.connection.manual')}</Badge>
                      {account.archived ? <Badge variant="secondary">{t('accounts.archived')}</Badge> : null}
                      <span>{t('common.transactions', { count: txCount(account.id) })}</span>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </div>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t('imports.history')}</CardTitle>
          </CardHeader>
          <CardContent>
            {imports.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('imports.historyEmpty')}</p>
            ) : (
              <ul className="divide-y text-sm">
                {[...imports]
                  .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
                  .map((batch) => (
                    <li key={batch.id} className="flex items-center justify-between gap-2 py-2">
                      <span className="min-w-0">
                        <span className="block truncate" dir="auto">
                          {t('imports.batchLine', { file: batch.fileName, date: format.timestamp(batch.createdAt), imported: batch.importedCount, duplicates: batch.duplicateCount })}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {accountNames.name(batch.accountId)} · {batch.status === 'completed' ? t('imports.statusCompleted') : t('imports.statusRolledBack')}
                        </span>
                      </span>
                      {batch.status === 'completed' ? (
                        <Button variant="ghost" size="sm" onClick={() => setRollback(batch)}>
                          <Undo2Icon className="rtl:-scale-x-100" /> {t('imports.rollback')}
                        </Button>
                      ) : null}
                    </li>
                  ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t('accounts.connections')}</CardTitle>
            <CardDescription>{t('accounts.connectionsText')}</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-3 text-sm">
              {PROVIDERS.map((p) => (
                <li key={p.title} className="rounded-lg border p-3">
                  <p className="flex flex-wrap items-center justify-between gap-2 font-medium">
                    {t(p.title)}
                    <Badge variant="outline">{t(p.status)}</Badge>
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">{t(p.text)}</p>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      <AccountFormDialog open={form.open} onOpenChange={(open) => setForm((f) => ({ ...f, open }))} account={form.account} />
      <ImportDialog open={importing.open} onOpenChange={(open) => setImporting((s) => ({ ...s, open }))} defaultAccountId={importing.accountId} />
      <ConfirmDialog
        open={toDelete !== null}
        onOpenChange={(open) => !open && setToDelete(null)}
        title={t('accounts.deleteTitle')}
        description={
          <p>
            {t('accounts.deleteText', { name: toDelete?.name ?? '' })} {toDelete && txCount(toDelete.id) > 0 ? t('accounts.inUse', { count: txCount(toDelete.id) }) : ''}
          </p>
        }
        onConfirm={async () => (toDelete ? (await remove.run(toDelete.id)).status !== 'error' : true)}
      />
      <ConfirmDialog
        open={rollback !== null}
        onOpenChange={(open) => !open && setRollback(null)}
        title={t('imports.rollbackTitle')}
        description={<p>{t('imports.rollbackText', { count: rollback ? transactions.filter((tx) => tx.importId === rollback.id).length : 0 })}</p>}
        confirmLabel={t('imports.rollback')}
        onConfirm={async () => (rollback ? (await undoImport.run(rollback.id)).status !== 'error' : true)}
      />
      {txDialogs.dialogs}
    </>
  )
}
