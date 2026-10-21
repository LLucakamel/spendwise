import { zodResolver } from '@hookform/resolvers/zod'
import { HistoryIcon, Loader2Icon, MoreHorizontalIcon, PencilIcon, PiggyBankIcon, PlusIcon, ShieldCheckIcon, Trash2Icon } from 'lucide-react'
import { useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { useRepository } from '@/app/session'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { FormField } from '@/components/common/FormField'
import { Money } from '@/components/common/Money'
import { CurrencySelect } from '@/components/common/pickers'
import { EmptyState } from '@/components/common/states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { useFinance } from '@/data/DataProvider'
import { goalFormSchema, type GoalFormValues } from '@/domain/schemas'
import type { SavingsGoal, SavingsGoalInput } from '@/domain/types'
import { useFormat } from '@/hooks/use-format'
import { useMutation } from '@/hooks/use-mutation'
import { useI18n } from '@/i18n'
import { todayIso } from '@/lib/dates'
import { minorToDecimalString, parseAmountToMinor } from '@/lib/money'
import { averageMonthlyExpenses, goalProgress } from '@/lib/tools'
import { AmountEntryDialog, HistoryDialog, type DatedAmount } from './toolsUi'

function GoalForm({ goal, onDone }: { goal?: SavingsGoal; onDone(): void }) {
  const repo = useRepository()
  const { settings } = useFinance()
  const { t } = useI18n()
  const [id] = useState(() => goal?.id ?? repo.newId())
  const { register, handleSubmit, formState, control } = useForm<GoalFormValues>({
    resolver: zodResolver(goalFormSchema),
    defaultValues: goal
      ? {
          name: goal.name,
          currency: goal.currency,
          target: minorToDecimalString(goal.targetMinor, goal.currency),
          targetDate: goal.targetDate ?? '',
          isEmergencyFund: goal.isEmergencyFund,
          notes: goal.notes,
        }
      : { name: '', currency: settings.displayCurrency, target: '', targetDate: '', isEmergencyFund: false, notes: '' },
  })
  const errors = formState.errors
  const save = useMutation((input: SavingsGoalInput) => (goal ? repo.update('goals', id, input) : repo.create('goals', id, input)), {
    success: goal ? 'toast.saved' : 'tools.goals.created',
    errorPrefix: 'toast.couldNotSave',
  })

  const onSubmit = handleSubmit(async (v) => {
    const target = parseAmountToMinor(v.target, v.currency)
    if (!target.ok) return
    const input: SavingsGoalInput = {
      name: v.name.trim(),
      currency: v.currency,
      targetMinor: target.value,
      targetDate: v.targetDate || null,
      isEmergencyFund: v.isEmergencyFund,
      contributions: goal?.contributions ?? [],
      notes: v.notes.trim(),
    }
    const outcome = await save.run(input)
    if (outcome.status !== 'error') onDone()
  })

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4">
      <FormField label={t('common.name')} error={errors.name?.message}>
        <Input autoComplete="off" {...register('name')} />
      </FormField>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField label={t('tools.goals.target')} error={errors.target?.message}>
          <Input inputMode="decimal" dir="ltr" placeholder="0.00" className="tabular" {...register('target')} />
        </FormField>
        {/* Contributions are recorded in the goal's currency, so it can't change once there are any. */}
        <FormField label={t('common.currency')} error={errors.currency?.message}>
          {goal?.contributions.length ? <Input value={goal.currency} readOnly dir="ltr" /> : <CurrencySelect {...register('currency')} />}
        </FormField>
        <FormField label={t('tools.goals.targetDate')} error={errors.targetDate?.message}>
          <Input type="date" {...register('targetDate')} />
        </FormField>
      </div>
      <div className="flex items-center gap-3">
        <Controller
          control={control}
          name="isEmergencyFund"
          render={({ field }) => <Switch id="goal-emergency" checked={field.value} onCheckedChange={field.onChange} />}
        />
        <label htmlFor="goal-emergency" className="text-sm">
          {t('tools.goals.isEmergency')}
        </label>
      </div>
      <FormField label={t('common.notesOptional')} error={errors.notes?.message}>
        <Textarea rows={2} {...register('notes')} />
      </FormField>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone} disabled={save.pending}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" disabled={save.pending}>
          {save.pending ? <Loader2Icon className="animate-spin" /> : null}
          {goal ? t('common.saveChanges') : t('tools.goals.add')}
        </Button>
      </DialogFooter>
    </form>
  )
}

function GoalFormDialog({ open, onOpenChange, goal }: { open: boolean; onOpenChange(open: boolean): void; goal?: SavingsGoal }) {
  const { t } = useI18n()
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{goal ? t('tools.goals.formEdit') : t('tools.goals.formNew')}</DialogTitle>
          <DialogDescription>{t('tools.goals.emptyText')}</DialogDescription>
        </DialogHeader>
        {open ? <GoalForm goal={goal} onDone={() => onOpenChange(false)} /> : null}
      </DialogContent>
    </Dialog>
  )
}

function GoalCard({
  goal,
  onEdit,
  onContribute,
  onHistory,
  onDelete,
}: {
  goal: SavingsGoal
  onEdit(): void
  onContribute(): void
  onHistory(): void
  onDelete(): void
}) {
  const { transactions } = useFinance()
  const { t } = useI18n()
  const format = useFormat()
  const today = todayIso()
  const progress = goalProgress(goal, today)
  const reached = progress.remainingMinor === 0
  const average = goal.isEmergencyFund ? averageMonthlyExpenses(transactions, goal.currency, today) : null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          {goal.name}
          {goal.isEmergencyFund ? (
            <Badge variant="secondary" className="gap-1">
              <ShieldCheckIcon /> {t('tools.goals.emergency')}
            </Badge>
          ) : null}
          {reached ? <Badge className="bg-income text-white">{t('tools.goals.reached')}</Badge> : null}
        </CardTitle>
        <CardDescription>
          {t('tools.goals.saved', { saved: format.money(progress.savedMinor, goal.currency), target: format.money(goal.targetMinor, goal.currency) })}
        </CardDescription>
        <CardAction>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label={t('common.actionsFor', { name: goal.name })}>
                <MoreHorizontalIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={onContribute}>
                <PlusIcon /> {t('tools.goals.contribute')}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={onHistory}>
                <HistoryIcon /> {t('tools.goals.history')}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={onEdit}>
                <PencilIcon /> {t('common.edit')}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={onDelete}>
                <Trash2Icon /> {t('common.delete')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-3 text-sm">
        <div className="flex items-center gap-3">
          <Progress value={progress.ratio * 100} aria-label={goal.name} indicatorClassName={reached ? 'bg-income' : undefined} />
          <span className="w-12 shrink-0 text-end text-xs text-muted-foreground tabular">{format.number(Math.min(100, Math.round(progress.ratio * 100)))}%</span>
        </div>
        {!reached ? (
          <p className="text-muted-foreground">
            {t('common.remaining')}: <Money minor={progress.remainingMinor} currency={goal.currency} />
          </p>
        ) : null}
        {progress.monthlyNeeded !== null && goal.targetDate ? (
          <p className="text-muted-foreground">{t('tools.goals.monthlyNeeded', { amount: format.money(progress.monthlyNeeded, goal.currency), date: format.date(goal.targetDate) })}</p>
        ) : null}
        {goal.isEmergencyFund ? (
          <p className="rounded-md bg-muted/60 p-2 text-xs">
            {average && average > 0
              ? t('tools.goals.emergencyCover', {
                  months: format.number(progress.savedMinor / average, 1),
                  currency: goal.currency,
                  amount: format.money(average, goal.currency),
                })
              : t('tools.goals.emergencyNoData', { currency: goal.currency })}
          </p>
        ) : null}
        <div>
          <Button size="sm" variant="outline" onClick={onContribute}>
            <PlusIcon /> {t('tools.goals.contribute')}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

export function GoalsTab() {
  const { goals } = useFinance()
  const repo = useRepository()
  const { t } = useI18n()
  const [form, setForm] = useState<{ open: boolean; goal?: SavingsGoal }>({ open: false })
  const [contributing, setContributing] = useState<SavingsGoal | null>(null)
  const [history, setHistory] = useState<SavingsGoal | null>(null)
  const [toDelete, setToDelete] = useState<SavingsGoal | null>(null)

  const contribute = useMutation((goal: SavingsGoal, entry: DatedAmount) => repo.update('goals', goal.id, { contributions: [...goal.contributions, entry] }), {
    success: 'tools.goals.contributionAdded',
    errorPrefix: 'toast.couldNotSave',
  })
  const remove = useMutation((id: string) => repo.remove('goals', id), { success: 'toast.deleted', errorPrefix: 'toast.couldNotDelete' })
  const sorted = [...goals].sort((a, b) => Number(b.isEmergencyFund) - Number(a.isEmergencyFund) || a.name.localeCompare(b.name))
  const historyGoal = history ? (goals.find((g) => g.id === history.id) ?? history) : null

  return (
    <section className="grid gap-4" aria-label={t('tools.tabs.goals')}>
      <div className="flex justify-end print:hidden">
        <Button onClick={() => setForm({ open: true })}>
          <PlusIcon /> {t('tools.goals.add')}
        </Button>
      </div>
      {sorted.length === 0 ? (
        <Card>
          <EmptyState
            icon={PiggyBankIcon}
            title={t('tools.goals.empty')}
            description={t('tools.goals.emptyText')}
            action={
              <Button onClick={() => setForm({ open: true })}>
                <PlusIcon /> {t('tools.goals.add')}
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {sorted.map((goal) => (
            <GoalCard
              key={goal.id}
              goal={goal}
              onEdit={() => setForm({ open: true, goal })}
              onContribute={() => setContributing(goal)}
              onHistory={() => setHistory(goal)}
              onDelete={() => setToDelete(goal)}
            />
          ))}
        </div>
      )}

      <GoalFormDialog open={form.open} goal={form.goal} onOpenChange={(open) => setForm((f) => ({ ...f, open }))} />
      <AmountEntryDialog
        open={contributing !== null}
        onOpenChange={(open) => !open && setContributing(null)}
        title={t('tools.goals.contribute')}
        description={contributing?.name ?? ''}
        currency={contributing?.currency ?? ''}
        pending={contribute.pending}
        onSubmit={async (entry) => {
          if (!contributing) return false
          const current = goals.find((g) => g.id === contributing.id) ?? contributing
          return (await contribute.run(current, entry)).status !== 'error'
        }}
      />
      <HistoryDialog
        open={historyGoal !== null}
        onOpenChange={(open) => !open && setHistory(null)}
        title={t('tools.goals.history')}
        description={historyGoal?.name ?? ''}
        entries={historyGoal?.contributions ?? []}
        currency={historyGoal?.currency ?? ''}
        emptyText={t('tools.goals.noContributions')}
      />
      <ConfirmDialog
        open={toDelete !== null}
        onOpenChange={(open) => !open && setToDelete(null)}
        title={t('tools.goals.deleteTitle')}
        description={t('tools.goals.deleteText', { name: toDelete?.name ?? '' })}
        onConfirm={async () => (toDelete ? (await remove.run(toDelete.id)).status !== 'error' : false)}
      />
    </section>
  )
}
