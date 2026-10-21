import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2Icon, PencilIcon, PlusIcon, Trash2Icon } from 'lucide-react'
import { useState } from 'react'
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
import { useMutation } from '@/hooks/use-mutation'
import { cn } from '@/lib/utils'

function CategoryForm({ category, onDone }: { category?: Category; onDone(): void }) {
  const repo = useRepository()
  const { categories } = useFinance()
  const [id] = useState(() => category?.id ?? repo.newId())
  const { register, handleSubmit, formState, setValue, control, setError } = useForm<CategoryFormValues>({
    resolver: zodResolver(categoryFormSchema),
    defaultValues: category ? { name: category.name, type: category.type, color: category.color } : { name: '', type: 'expense', color: CATEGORY_COLORS[0] },
  })
  const color = useWatch({ control, name: 'color' })
  const save = useMutation((input: CategoryInput) => (category ? repo.updateCategory(id, input) : repo.createCategory(id, input)), {
    success: category ? 'Category updated' : 'Category added',
    errorPrefix: 'Couldn’t save the category.',
  })
  const onSubmit = handleSubmit(async (values) => {
    const name = values.name.trim()
    if (categories.some((c) => c.id !== id && c.type === values.type && c.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
      setError('name', { message: 'A category with this name already exists.' })
      return
    }
    const outcome = await save.run({ name, type: values.type, color: values.color })
    if (outcome.status !== 'error') onDone()
  })
  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4">
      <FormField label="Name" error={formState.errors.name?.message}>
        <Input autoComplete="off" {...register('name')} />
      </FormField>
      <FormField label="Type" hint={category ? 'The type can’t be changed once a category exists.' : undefined}>
        <NativeSelect disabled={Boolean(category)} {...register('type')}>
          <option value="expense">Expense</option>
          <option value="income">Income</option>
        </NativeSelect>
      </FormField>
      <fieldset>
        <legend className="mb-2 text-sm font-medium">Colour</legend>
        <div className="flex flex-wrap gap-2">
          {CATEGORY_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`Colour ${c}`}
              aria-pressed={color === c}
              onClick={() => setValue('color', c)}
              className={cn('size-8 rounded-full border-2 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50', color === c ? 'border-foreground' : 'border-transparent')}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
      </fieldset>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone} disabled={save.pending}>
          Cancel
        </Button>
        <Button type="submit" disabled={save.pending}>
          {save.pending ? <Loader2Icon className="animate-spin" /> : null}
          {category ? 'Save changes' : 'Add category'}
        </Button>
      </DialogFooter>
    </form>
  )
}

export function CategoryManager() {
  const { categories, transactions, budgets, recurringBills } = useFinance()
  const repo = useRepository()
  const [form, setForm] = useState<{ open: boolean; category?: Category }>({ open: false })
  const [toDelete, setToDelete] = useState<Category | null>(null)
  const remove = useMutation((id: string) => repo.deleteCategory(id), { success: 'Category deleted', errorPrefix: 'Couldn’t delete the category.' })

  const usage = (id: string) =>
    transactions.filter((t) => t.categoryId === id).length +
    budgets.filter((b) => b.categoryId === id).length +
    recurringBills.filter((b) => b.categoryId === id).length

  const groups = (['expense', 'income'] as const).map((type) => ({
    type,
    items: categories.filter((c) => c.type === type).sort((a, b) => a.name.localeCompare(b.name)),
  }))
  const deleteUsage = toDelete ? usage(toDelete.id) : 0

  return (
    <Card>
      <CardHeader>
        <CardTitle>Categories</CardTitle>
        <CardDescription>Organise income and expenses. Categories in use can be renamed but not deleted.</CardDescription>
        <CardAction>
          <Button variant="outline" size="sm" onClick={() => setForm({ open: true })}>
            <PlusIcon /> Add
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-6 md:grid-cols-2">
        {groups.map((group) => (
          <div key={group.type}>
            <h3 className="mb-2 text-sm font-semibold capitalize">{group.type} categories</h3>
            {group.items.length === 0 ? (
              <p className="text-sm text-muted-foreground">None yet.</p>
            ) : (
              <ul className="divide-y rounded-lg border">
                {group.items.map((c) => (
                  <li key={c.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                    <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: c.color }} aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate">{c.name}</span>
                    <span className="text-xs text-muted-foreground tabular">{usage(c.id)} uses</span>
                    <Button variant="ghost" size="icon-sm" aria-label={`Edit ${c.name}`} onClick={() => setForm({ open: true, category: c })}>
                      <PencilIcon />
                    </Button>
                    <Button variant="ghost" size="icon-sm" aria-label={`Delete ${c.name}`} onClick={() => setToDelete(c)}>
                      <Trash2Icon />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </CardContent>
      <Dialog open={form.open} onOpenChange={(open) => setForm((f) => ({ ...f, open }))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{form.category ? 'Edit category' : 'New category'}</DialogTitle>
            <DialogDescription>Categories help you see where money comes from and goes.</DialogDescription>
          </DialogHeader>
          {form.open ? <CategoryForm category={form.category} onDone={() => setForm((f) => ({ ...f, open: false }))} /> : null}
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={toDelete !== null}
        onOpenChange={(open) => !open && setToDelete(null)}
        title={deleteUsage > 0 ? 'This category is in use' : 'Delete this category?'}
        description={
          deleteUsage > 0 ? (
            <p>
              “{toDelete?.name}” is used by {deleteUsage} transaction(s), budget(s) or bill(s). Move those to another category first, or rename this one
              instead.
            </p>
          ) : (
            <p>“{toDelete?.name}” will be removed.</p>
          )
        }
        confirmLabel={deleteUsage > 0 ? 'OK' : 'Delete'}
        destructive={deleteUsage === 0}
        onConfirm={async () => {
          if (!toDelete || deleteUsage > 0) return true
          return (await remove.run(toDelete.id)).status !== 'error'
        }}
      />
    </Card>
  )
}
