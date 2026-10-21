import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2Icon, PencilIcon, PlusIcon, Trash2Icon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { useRepository } from '@/app/session'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { FormField } from '@/components/common/FormField'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { useFinance } from '@/data/DataProvider'
import { CATEGORY_COLORS } from '@/domain/defaults'
import { categoryFormSchema, type CategoryFormValues } from '@/domain/schemas'
import type { Category, CategoryInput } from '@/domain/types'
import { useCategoryLookup } from '@/hooks/use-format'
import { useMutation } from '@/hooks/use-mutation'
import { useI18n, type MessageKey } from '@/i18n'
import { cn } from '@/lib/utils'

function CategoryForm({ category, onDone }: { category?: Category; onDone(): void }) {
  const repo = useRepository()
  const { categories } = useFinance()
  const lookup = useCategoryLookup()
  const { t, tx } = useI18n()
  const [id] = useState(() => category?.id ?? repo.newId())
  // Default categories are shown with their translated name; saving it unchanged keeps the stored name.
  const shownName = category ? lookup.name(category.id) : ''
  const { register, handleSubmit, formState, setValue, control, setError } = useForm<CategoryFormValues>({
    resolver: zodResolver(categoryFormSchema),
    defaultValues: category ? { name: shownName, type: category.type, color: category.color } : { name: '', type: 'expense', color: CATEGORY_COLORS[0] },
  })
  const color = useWatch({ control, name: 'color' })
  const save = useMutation((input: CategoryInput) => (category ? repo.updateCategory(id, input) : repo.createCategory(id, input)), {
    success: category ? 'settings.categoryUpdated' : 'settings.categoryAdded',
    errorPrefix: 'toast.couldNotSave',
  })
  const onSubmit = handleSubmit(async (values) => {
    const typed = values.name.trim()
    const name = category && typed === shownName ? category.name : typed
    const type = category ? category.type : values.type
    const clash = (value: string) => value.toLocaleLowerCase() === name.toLocaleLowerCase() || value.toLocaleLowerCase() === typed.toLocaleLowerCase()
    if (categories.some((c) => c.id !== id && c.type === type && (clash(c.name) || clash(lookup.name(c.id))))) {
      setError('name', { message: 'settings.categoryExists' })
      return
    }
    const outcome = await save.run({ name, type, color: values.color })
    if (outcome.status !== 'error') onDone()
  })
  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4" data-testid="category-form">
      <FormField label={t('common.name')} error={formState.errors.name?.message}>
        <Input autoComplete="off" {...register('name')} />
      </FormField>
      <FormField label={t('settings.categoryType')} hint={category ? t('settings.categoryTypeHint') : undefined}>
        <NativeSelect disabled={Boolean(category)} {...register('type')}>
          <option value="expense">{t('types.expense')}</option>
          <option value="income">{t('types.income')}</option>
        </NativeSelect>
      </FormField>
      <fieldset>
        <legend className="mb-2 text-sm font-medium">{t('settings.colour')}</legend>
        <div className="flex flex-wrap gap-2">
          {CATEGORY_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={t('settings.colourName', { value: c })}
              aria-pressed={color === c}
              onClick={() => setValue('color', c, { shouldDirty: true })}
              className={cn(
                'size-8 rounded-full border-2 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
                color === c ? 'border-foreground' : 'border-transparent',
              )}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
        {formState.errors.color?.message ? <p className="mt-1 text-xs font-medium text-destructive">{tx(formState.errors.color.message)}</p> : null}
      </fieldset>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone} disabled={save.pending}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" disabled={save.pending}>
          {save.pending ? <Loader2Icon className="animate-spin" /> : null}
          {category ? t('common.saveChanges') : t('common.add')}
        </Button>
      </DialogFooter>
    </form>
  )
}

const GROUPS: { type: Category['type']; title: MessageKey }[] = [
  { type: 'expense', title: 'settings.expenseCategories' },
  { type: 'income', title: 'settings.incomeCategories' },
]

export function CategoryManager() {
  const { categories, transactions, budgets, recurringBills, incomeSources } = useFinance()
  const repo = useRepository()
  const lookup = useCategoryLookup()
  const { t, language } = useI18n()
  const [form, setForm] = useState<{ open: boolean; category?: Category }>({ open: false })
  const [toDelete, setToDelete] = useState<Category | null>(null)
  const remove = useMutation((id: string) => repo.deleteCategory(id), { success: 'settings.categoryDeleted', errorPrefix: 'toast.couldNotDelete' })

  // Records that reference each category: transactions, budgets, recurring bills and income sources.
  const usage = useMemo(() => {
    const counts = new Map<string, number>()
    const bump = (id: string) => counts.set(id, (counts.get(id) ?? 0) + 1)
    for (const x of transactions) bump(x.categoryId)
    for (const x of budgets) bump(x.categoryId)
    for (const x of recurringBills) bump(x.categoryId)
    for (const x of incomeSources) bump(x.categoryId)
    return counts
  }, [transactions, budgets, recurringBills, incomeSources])
  const uses = (id: string) => usage.get(id) ?? 0

  const groups = GROUPS.map((group) => ({
    ...group,
    items: categories.filter((c) => c.type === group.type).sort((a, b) => lookup.name(a.id).localeCompare(lookup.name(b.id), language)),
  }))
  const deleteUsage = toDelete ? uses(toDelete.id) : 0
  const deleteName = toDelete ? lookup.name(toDelete.id) : ''

  return (
    <Card id="categories" className="scroll-mt-6">
      <CardHeader>
        <CardTitle>{t('settings.categories')}</CardTitle>
        <CardDescription>{t('settings.categoriesText')}</CardDescription>
        <CardAction>
          <Button variant="outline" size="sm" onClick={() => setForm({ open: true })} data-testid="add-category">
            <PlusIcon /> {t('common.add')}
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-6 md:grid-cols-2">
        {groups.map((group) => (
          <div key={group.type} data-testid={`categories-${group.type}`}>
            <h3 className="mb-2 text-sm font-semibold">{t(group.title)}</h3>
            {group.items.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('common.none')}</p>
            ) : (
              <ul className="divide-y rounded-lg border">
                {group.items.map((c) => {
                  const name = lookup.name(c.id)
                  return (
                    <li key={c.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                      <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: c.color }} aria-hidden="true" />
                      <span className="min-w-0 flex-1 truncate">{name}</span>
                      <span className="text-xs text-muted-foreground tabular">{t('settings.uses', { count: uses(c.id) })}</span>
                      <Button variant="ghost" size="icon-sm" aria-label={t('settings.editCategory', { name })} onClick={() => setForm({ open: true, category: c })}>
                        <PencilIcon />
                      </Button>
                      <Button variant="ghost" size="icon-sm" aria-label={t('settings.deleteCategory', { name })} onClick={() => setToDelete(c)}>
                        <Trash2Icon />
                      </Button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        ))}
      </CardContent>
      <Dialog open={form.open} onOpenChange={(open) => setForm((f) => ({ ...f, open }))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{form.category ? t('settings.categoryEdit') : t('settings.categoryNew')}</DialogTitle>
            <DialogDescription>{t('settings.categoryText')}</DialogDescription>
          </DialogHeader>
          {form.open ? <CategoryForm category={form.category} onDone={() => setForm((f) => ({ ...f, open: false }))} /> : null}
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={toDelete !== null}
        onOpenChange={(open) => !open && setToDelete(null)}
        title={deleteUsage > 0 ? t('settings.categoryInUseTitle') : t('settings.categoryDeleteTitle')}
        description={
          <p>
            {deleteUsage > 0
              ? t('settings.categoryInUseText', { name: deleteName, count: deleteUsage })
              : t('settings.categoryDeleteText', { name: deleteName })}
          </p>
        }
        confirmLabel={deleteUsage > 0 ? t('common.close') : t('common.delete')}
        destructive={deleteUsage === 0}
        onConfirm={async () => {
          if (!toDelete || deleteUsage > 0) return true
          return (await remove.run(toDelete.id)).status !== 'error'
        }}
      />
    </Card>
  )
}
