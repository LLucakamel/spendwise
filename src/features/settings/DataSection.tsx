import { DatabaseBackupIcon, DownloadIcon, FileIcon, UploadIcon } from 'lucide-react'
import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { useSession } from '@/app/session'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useFinance } from '@/data/DataProvider'
import { useAccountLookup, useCategoryLookup, useFormat } from '@/hooks/use-format'
import { useMutation } from '@/hooks/use-mutation'
import { useI18n } from '@/i18n'
import { backupCounts, createBackup, parseBackup, type Backup } from '@/lib/backup'
import { downloadTextFile, transactionsToCsv } from '@/lib/csv'
import { todayIso } from '@/lib/dates'

const MAX_BACKUP_BYTES = 25 * 1024 * 1024

export function DataSection() {
  const data = useFinance()
  const { mode, repository, cloudFiles } = useSession()
  const { t, tx } = useI18n()
  const format = useFormat()
  const categoryNames = useCategoryLookup()
  const accountNames = useAccountLookup()
  const fileInput = useRef<HTMLInputElement>(null)
  const [pendingRestore, setPendingRestore] = useState<Backup | null>(null)
  const restore = useMutation((backup: Backup) => repository.restoreBackup(backup), {
    success: 'settings.restored',
    errorPrefix: 'toast.couldNotSave',
    queuesOffline: false,
  })

  const exportCsv = () => {
    if (data.transactions.length === 0) {
      toast.info(t('toast.nothingToExport'))
      return
    }
    const csv = transactionsToCsv(data.transactions, { category: categoryNames.name, account: accountNames.name })
    downloadTextFile(`spendwise-transactions-${todayIso()}.csv`, csv, 'text/csv', true)
    toast.success(t('toast.exported', { count: data.transactions.length }))
  }

  const exportBackup = () => {
    const backup = createBackup(data, mode === 'demo' ? 'demo' : 'account')
    downloadTextFile(`spendwise-backup-${todayIso()}.json`, JSON.stringify(backup, null, 2), 'application/json')
    toast.success(t('settings.backupDownloaded'))
  }

  const onFile = async (file: File | undefined) => {
    if (!file) return
    if (file.size > MAX_BACKUP_BYTES) {
      toast.error(t('settings.tooLarge'))
      return
    }
    const result = parseBackup(await file.text())
    if (!result.ok) {
      toast.error(tx(result.error))
      return
    }
    if (mode === 'firebase' && result.backup.source === 'demo') {
      toast.error(t('settings.demoBackup'))
      return
    }
    setPendingRestore(result.backup)
  }

  const counts = pendingRestore ? backupCounts(pendingRestore) : null

  return (
    <Card id="data" className="scroll-mt-6">
      <CardHeader>
        <CardTitle>{t('settings.data')}</CardTitle>
        <CardDescription>{t('settings.dataText', { scope: mode === 'demo' ? t('settings.scopeDemo') : t('settings.scopeAccount') })}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium">{t('settings.csvTitle')}</p>
            <p className="text-sm text-muted-foreground">{t('settings.csvText')}</p>
          </div>
          <Button variant="outline" onClick={exportCsv} data-testid="export-csv">
            <DownloadIcon /> {t('common.exportCsv')}
          </Button>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium">{t('settings.backupTitle')}</p>
            <p className="text-sm text-muted-foreground">{t('settings.backupText')}</p>
          </div>
          <Button variant="outline" onClick={exportBackup} data-testid="download-backup">
            <DatabaseBackupIcon /> {t('settings.downloadBackup')}
          </Button>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium">{t('settings.restoreTitle')}</p>
            <p className="text-sm text-muted-foreground">{t('settings.restoreText')}</p>
          </div>
          <Button variant="outline" onClick={() => fileInput.current?.click()}>
            <UploadIcon /> {t('settings.chooseFile')}
          </Button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            className="hidden"
            aria-label={t('settings.backupFile')}
            data-testid="restore-input"
            onChange={(e) => {
              void onFile(e.target.files?.[0])
              e.target.value = ''
            }}
          />
        </div>
        <p className="flex items-center gap-2 text-xs text-muted-foreground" data-testid="files-note">
          <FileIcon className="size-3.5 shrink-0" aria-hidden="true" />
          {t('settings.filesNote', { where: cloudFiles ? t('settings.filesCloud') : t('settings.filesDevice') })}
        </p>
      </CardContent>
      <ConfirmDialog
        open={pendingRestore !== null}
        onOpenChange={(open) => !open && setPendingRestore(null)}
        title={t('settings.restoreConfirm')}
        description={
          pendingRestore && counts ? (
            <p>
              {t('settings.restoreSummary', {
                date: format.timestamp(pendingRestore.exportedAt),
                transactions: format.number(counts.transactions),
                invoices: format.number(counts.invoices),
                incomeSources: format.number(counts.incomeSources),
                accounts: format.number(counts.accounts),
                budgets: format.number(counts.budgets),
                bills: format.number(counts.bills),
              })}
            </p>
          ) : null
        }
        confirmLabel={t('settings.restore')}
        destructive={false}
        onConfirm={async () => (pendingRestore ? (await restore.run(pendingRestore)).status !== 'error' : true)}
      />
    </Card>
  )
}
