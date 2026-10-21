import { DatabaseBackupIcon, DownloadIcon, UploadIcon } from 'lucide-react'
import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { useSession } from '@/app/session'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useFinance } from '@/data/DataProvider'
import { useMutation } from '@/hooks/use-mutation'
import { backupSummary, createBackup, parseBackup, type Backup } from '@/lib/backup'
import { downloadTextFile, transactionsToCsv } from '@/lib/csv'
import { todayIso } from '@/lib/dates'

export function DataSection() {
  const data = useFinance()
  const { mode, repository } = useSession()
  const fileInput = useRef<HTMLInputElement>(null)
  const [pendingRestore, setPendingRestore] = useState<Backup | null>(null)
  const restore = useMutation((backup: Backup) => repository.restoreBackup(backup), {
    success: 'Backup restored',
    errorPrefix: 'Couldn’t restore the backup.',
    queuesOffline: false,
  })

  const exportCsv = () => {
    if (data.transactions.length === 0) {
      toast.info('There are no transactions to export.')
      return
    }
    downloadTextFile(`spendwise-transactions-${todayIso()}.csv`, transactionsToCsv(data.transactions, data.categories), 'text/csv', true)
    toast.success(`Exported ${data.transactions.length} transactions`)
  }

  const exportBackup = () => {
    const backup = createBackup(data, mode === 'demo' ? 'demo' : 'account')
    downloadTextFile(`spendwise-backup-${todayIso()}.json`, JSON.stringify(backup, null, 2), 'application/json')
    toast.success('Backup downloaded')
  }

  const onFile = async (file: File | undefined) => {
    if (!file) return
    if (file.size > 25 * 1024 * 1024) {
      toast.error('That file is too large to be a SpendWise backup.')
      return
    }
    const result = parseBackup(await file.text())
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    if (mode === 'firebase' && result.backup.source === 'demo') {
      toast.error('This backup contains fictional demo data and can’t be restored into a real account.')
      return
    }
    setPendingRestore(result.backup)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Export and backup</CardTitle>
        <CardDescription>
          Download your data at any time. Exports contain only {mode === 'demo' ? 'the demo data in this browser' : 'your own account’s data'}.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium">Transactions (CSV)</p>
            <p className="text-sm text-muted-foreground">All transactions, for spreadsheets. To export a filtered list, use Export on the Transactions page.</p>
          </div>
          <Button variant="outline" onClick={exportCsv}>
            <DownloadIcon /> Export CSV
          </Button>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium">Full backup (JSON)</p>
            <p className="text-sm text-muted-foreground">
              Settings, categories, transactions, budgets and recurring bills. Backups are only made when you click this button — SpendWise does not
              back up automatically.
            </p>
          </div>
          <Button variant="outline" onClick={exportBackup}>
            <DatabaseBackupIcon /> Download backup
          </Button>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium">Restore from backup</p>
            <p className="text-sm text-muted-foreground">
              Adds the backup’s records and replaces records with the same ID. Records that aren’t in the backup are kept. Preferences are replaced.
            </p>
          </div>
          <Button variant="outline" onClick={() => fileInput.current?.click()}>
            <UploadIcon /> Choose file
          </Button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            className="hidden"
            aria-label="Backup file"
            onChange={(e) => {
              void onFile(e.target.files?.[0])
              e.target.value = ''
            }}
          />
        </div>
      </CardContent>
      <ConfirmDialog
        open={pendingRestore !== null}
        onOpenChange={(open) => !open && setPendingRestore(null)}
        title="Restore this backup?"
        description={
          pendingRestore ? (
            <p>
              Backup from {new Date(pendingRestore.exportedAt).toLocaleString()} containing {backupSummary(pendingRestore)}. Matching records will be
              overwritten.
            </p>
          ) : null
        }
        confirmLabel="Restore"
        destructive={false}
        onConfirm={async () => (pendingRestore ? (await restore.run(pendingRestore)).status !== 'error' : true)}
      />
    </Card>
  )
}
