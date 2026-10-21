import { addDays, subMonths } from 'date-fns'
import { DEFAULT_CATEGORIES, defaultSettings } from '@/domain/defaults'
import type { Budget, Category, FinanceData, IsoDate, RecurringBill, Transaction, TransactionInput } from '@/domain/types'
import { addMonthsToMonth, fromIsoDate, monthOf, toIsoDate } from '@/lib/dates'
import { advanceDueDate, billPaymentTransactionId } from '@/lib/recurring'

/** Small deterministic PRNG so the demo looks the same on every load. */
function mulberry32(seed: number) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Builds the fictional demo dataset relative to `today` so that dashboards always show recent activity.
 * Every merchant and employer name here is invented.
 */
export function generateDemoData(today: IsoDate): FinanceData {
  const random = mulberry32(20261021)
  const between = (min: number, max: number) => Math.round(min + random() * (max - min))
  const stamp = `${today}T09:00:00.000Z`
  const todayDate = fromIsoDate(today)
  const start = subMonths(new Date(todayDate.getFullYear(), todayDate.getMonth(), 1), 4)

  const categories: Category[] = DEFAULT_CATEGORIES.map((c) => ({ ...c, createdAt: stamp, updatedAt: stamp }))
  const transactions: Transaction[] = []
  let counter = 0
  const add = (input: Partial<TransactionInput> & Pick<TransactionInput, 'type' | 'description' | 'amountMinor' | 'categoryId' | 'date'>, id?: string) => {
    if (input.date > today) return
    counter += 1
    transactions.push({
      currency: 'USD',
      notes: '',
      paymentMethod: 'debit-card',
      recurringBillId: null,
      recurringDueDate: null,
      ...input,
      id: id ?? `demo-tx-${String(counter).padStart(4, '0')}`,
      createdAt: `${input.date}T12:00:00.000Z`,
      updatedAt: `${input.date}T12:00:00.000Z`,
    })
  }

  const groceries = ['Greenleaf Market', 'Harbor Fresh Grocers', 'Maple Street Co-op']
  const dining = ['Corner Café', 'Lantern Noodle House', 'Blue Fig Bistro', 'Sunny Side Diner']
  const shopping = ['Northstar Outfitters', 'Paper & Pine Stationery', 'Brightline Electronics']

  for (let day = start; toIsoDate(day) <= today; day = addDays(day, 1)) {
    const date = toIsoDate(day)
    const dom = day.getDate()
    const dow = day.getDay()

    if (dom === 1) {
      add({ type: 'income', description: 'Northwind Studio payroll (demo)', amountMinor: 520000, categoryId: 'inc-salary', date, paymentMethod: 'bank-transfer' })
    }
    if (dom === 18 && random() > 0.35) {
      add({ type: 'income', description: 'Freelance illustration — Acme Kites (demo)', amountMinor: between(30000, 90000), categoryId: 'inc-freelance', date, paymentMethod: 'bank-transfer' })
    }
    if (dow === 6 || (dow === 3 && random() > 0.5)) {
      add({ type: 'expense', description: groceries[between(0, groceries.length - 1)] ?? 'Groceries', amountMinor: between(3800, 13200), categoryId: 'exp-groceries', date })
    }
    if (random() > 0.82) {
      add({ type: 'expense', description: dining[between(0, dining.length - 1)] ?? 'Dining', amountMinor: between(1150, 5800), categoryId: 'exp-dining', date, paymentMethod: 'credit-card' })
    }
    if (dow === 1) {
      add({ type: 'expense', description: 'Metro transit pass top-up', amountMinor: between(2000, 4000), categoryId: 'exp-transport', date, paymentMethod: 'mobile-wallet' })
    }
    if (dom === 8) {
      add({ type: 'expense', description: 'Lumen Energy electricity', amountMinor: between(8200, 13900), categoryId: 'exp-utilities', date, paymentMethod: 'bank-transfer' })
    }
    if (dom === 12 && random() > 0.3) {
      add({ type: 'expense', description: shopping[between(0, shopping.length - 1)] ?? 'Shopping', amountMinor: between(2500, 16000), categoryId: 'exp-shopping', date, paymentMethod: 'credit-card' })
    }
    if (dom === 20 && random() > 0.4) {
      add({ type: 'expense', description: 'Riverside Cinema tickets', amountMinor: between(1800, 4200), categoryId: 'exp-entertainment', date, paymentMethod: 'credit-card' })
    }
    if (dom === 25 && random() > 0.5) {
      add({ type: 'expense', description: 'Willow Pharmacy', amountMinor: between(900, 4500), categoryId: 'exp-health', date })
    }
  }

  // A fictional trip last month, recorded in euros, plus a small purchase in yen (zero-decimal currency).
  const lastMonth = addMonthsToMonth(monthOf(today), -1)
  add({ type: 'expense', description: 'Hotel Azulejo, Lisbon (demo)', amountMinor: 38400, currency: 'EUR', categoryId: 'exp-travel', date: `${lastMonth}-09`, paymentMethod: 'credit-card' })
  add({ type: 'expense', description: 'Tram 28 day passes', amountMinor: 1640, currency: 'EUR', categoryId: 'exp-transport', date: `${lastMonth}-10`, paymentMethod: 'cash' })
  add({ type: 'expense', description: 'Pastelaria dinner', amountMinor: 4250, currency: 'EUR', categoryId: 'exp-dining', date: `${lastMonth}-10`, paymentMethod: 'credit-card' })
  add({ type: 'expense', description: 'Airport layover snacks, Tokyo', amountMinor: 1280, currency: 'JPY', categoryId: 'exp-dining', date: `${lastMonth}-11`, paymentMethod: 'cash' })

  // Recurring bills, with past occurrences already recorded as linked expenses.
  const currentMonth = monthOf(today)
  const recurringBills: RecurringBill[] = []
  const bill = (b: Omit<RecurringBill, 'createdAt' | 'updatedAt' | 'lastPaidDate' | 'notes' | 'endDate'> & Partial<Pick<RecurringBill, 'notes' | 'endDate'>>, historyFrom: IsoDate | null) => {
    let lastPaid: IsoDate | null = null
    if (historyFrom) {
      let due = historyFrom
      while (due < b.nextDueDate) {
        add(
          {
            type: 'expense',
            description: b.name,
            amountMinor: b.amountMinor,
            currency: b.currency,
            categoryId: b.categoryId,
            date: due,
            paymentMethod: 'bank-transfer',
            recurringBillId: b.id,
            recurringDueDate: due,
          },
          billPaymentTransactionId(b.id, due),
        )
        lastPaid = due
        due = advanceDueDate(due, b.frequency, b.anchorDay)
      }
    }
    recurringBills.push({ notes: '', endDate: null, ...b, lastPaidDate: lastPaid, createdAt: stamp, updatedAt: stamp })
  }

  const nextFirst = `${addMonthsToMonth(currentMonth, 1)}-01`
  bill({ id: 'demo-bill-rent', name: 'Pinecrest Apartments rent', amountMinor: 145000, currency: 'USD', categoryId: 'exp-housing', frequency: 'monthly', nextDueDate: nextFirst, anchorDay: 1, status: 'active' }, `${monthOf(toIsoDate(start))}-01`)

  const internetDue = `${Number(today.slice(8, 10)) < 15 ? currentMonth : addMonthsToMonth(currentMonth, 1)}-15`
  bill({ id: 'demo-bill-internet', name: 'Brightwave Internet', amountMinor: 5999, currency: 'USD', categoryId: 'exp-utilities', frequency: 'monthly', nextDueDate: internetDue, anchorDay: 15, status: 'active' }, `${monthOf(toIsoDate(start))}-15`)

  bill({ id: 'demo-bill-streaming', name: 'StreamBox subscription', amountMinor: 1299, currency: 'USD', categoryId: 'exp-subscriptions', frequency: 'monthly', nextDueDate: toIsoDate(addDays(todayDate, 2)), anchorDay: Number(toIsoDate(addDays(todayDate, 2)).slice(8, 10)), status: 'active' }, toIsoDate(subMonths(addDays(todayDate, 2), 3)))

  bill({ id: 'demo-bill-phone', name: 'Orbit Mobile phone plan', amountMinor: 3500, currency: 'USD', categoryId: 'exp-utilities', frequency: 'monthly', nextDueDate: toIsoDate(addDays(todayDate, -3)), anchorDay: Number(toIsoDate(addDays(todayDate, -3)).slice(8, 10)), status: 'active', notes: 'Overdue in the demo so you can try “Mark as paid”.' }, toIsoDate(subMonths(addDays(todayDate, -3), 3)))

  bill({ id: 'demo-bill-insurance', name: 'Harborline car insurance', amountMinor: 31000, currency: 'USD', categoryId: 'exp-transport', frequency: 'quarterly', nextDueDate: toIsoDate(addDays(todayDate, 24)), anchorDay: Number(toIsoDate(addDays(todayDate, 24)).slice(8, 10)), status: 'active' }, null)

  bill({ id: 'demo-bill-gym', name: 'Summit Fitness membership', amountMinor: 4500, currency: 'USD', categoryId: 'exp-health', frequency: 'monthly', nextDueDate: toIsoDate(addDays(todayDate, 10)), anchorDay: Number(toIsoDate(addDays(todayDate, 10)).slice(8, 10)), status: 'paused', notes: 'Paused while travelling.' }, null)

  bill({ id: 'demo-bill-domain', name: 'Personal website domain', amountMinor: 1800, currency: 'USD', categoryId: 'exp-subscriptions', frequency: 'yearly', nextDueDate: toIsoDate(addDays(todayDate, 140)), anchorDay: Number(toIsoDate(addDays(todayDate, 140)).slice(8, 10)), status: 'active' }, null)

  const threeMonthsAgo = addMonthsToMonth(currentMonth, -3)
  const budget = (b: Omit<Budget, 'createdAt' | 'updatedAt' | 'notes'> & { notes?: string }): Budget => ({ notes: '', ...b, createdAt: stamp, updatedAt: stamp })
  const budgets: Budget[] = [
    budget({ id: 'demo-budget-groceries', name: 'Groceries', categoryId: 'exp-groceries', limitMinor: 60000, currency: 'USD', startMonth: threeMonthsAgo, endMonth: null }),
    budget({ id: 'demo-budget-dining', name: 'Eating out', categoryId: 'exp-dining', limitMinor: 18000, currency: 'USD', startMonth: threeMonthsAgo, endMonth: null, notes: 'Coffee, lunches and dinners.' }),
    budget({ id: 'demo-budget-transport', name: 'Getting around', categoryId: 'exp-transport', limitMinor: 15000, currency: 'USD', startMonth: threeMonthsAgo, endMonth: null }),
    budget({ id: 'demo-budget-fun', name: 'Entertainment', categoryId: 'exp-entertainment', limitMinor: 6000, currency: 'USD', startMonth: threeMonthsAgo, endMonth: null }),
    budget({ id: 'demo-budget-trip', name: 'Lisbon trip', categoryId: 'exp-travel', limitMinor: 50000, currency: 'EUR', startMonth: lastMonth, endMonth: lastMonth, notes: 'One-off travel budget in euros.' }),
  ]

  transactions.sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))

  return {
    transactions,
    categories,
    budgets,
    recurringBills,
    settings: { ...defaultSettings(), openingBalances: [{ currency: 'USD', amountMinor: 245000 }] },
  }
}
