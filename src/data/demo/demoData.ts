import { addDays, subMonths } from 'date-fns'
import { TRANSACTION_DEFAULTS } from '@/data/repository'
import { DEFAULT_CATEGORIES, defaultSettings } from '@/domain/defaults'
import type {
  Account,
  Budget,
  Category,
  Debt,
  FinanceData,
  ImportBatch,
  IncomeSource,
  Invoice,
  IsoDate,
  Language,
  RecurringBill,
  SavingsGoal,
  Transaction,
  TransactionInput,
} from '@/domain/types'
import { addMonthsToMonth, fromIsoDate, monthOf, toIsoDate } from '@/lib/dates'
import { incomeReceiptId } from '@/lib/income'
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

const EGP = (pounds: number) => Math.round(pounds * 100)

/**
 * Builds the fictional demo dataset relative to `today` so dashboards always show recent activity.
 * Every person, merchant, bank and employer name here is invented.
 */
export function generateDemoData(today: IsoDate, language: Language = 'en'): FinanceData {
  const L = (en: string, ar: string) => (language === 'ar' ? ar : en)
  const random = mulberry32(20261021)
  const between = (min: number, max: number) => Math.round(min + random() * (max - min))
  const stamp = `${today}T09:00:00.000Z`
  const todayDate = fromIsoDate(today)
  const start = subMonths(new Date(todayDate.getFullYear(), todayDate.getMonth(), 1), 4)
  const currentMonth = monthOf(today)
  const lastMonth = addMonthsToMonth(currentMonth, -1)

  const categories: Category[] = DEFAULT_CATEGORIES.map((c) => ({ ...c, createdAt: stamp, updatedAt: stamp }))

  const account = (a: Omit<Account, 'createdAt' | 'updatedAt' | 'notes' | 'archived' | 'creditLimitMinor' | 'statementDay' | 'paymentDueDay' | 'minimumPaymentMinor'> & Partial<Account>): Account => ({
    notes: '',
    archived: false,
    creditLimitMinor: null,
    statementDay: null,
    paymentDueDay: null,
    minimumPaymentMinor: null,
    ...a,
    createdAt: stamp,
    updatedAt: stamp,
  })
  const accounts: Account[] = [
    account({ id: 'demo-acc-bank', name: L('Nile Bank current account (demo)', 'حساب جاري بنك النيل (تجريبي)'), kind: 'bank', provider: L('Nile Bank (fictional)', 'بنك النيل (وهمي)'), currency: 'EGP', openingBalanceMinor: EGP(38000), last4: '', syncMode: 'import' }),
    account({ id: 'demo-acc-cash', name: L('Cash wallet', 'محفظة النقود'), kind: 'cash', provider: '', currency: 'EGP', openingBalanceMinor: EGP(1500), last4: '', syncMode: 'manual' }),
    account({ id: 'demo-acc-card', name: L('Demo Visa card', 'بطاقة فيزا تجريبية'), kind: 'credit-card', provider: L('Nile Bank (fictional)', 'بنك النيل (وهمي)'), currency: 'EGP', openingBalanceMinor: 0, last4: '4242', syncMode: 'manual', creditLimitMinor: EGP(60000), statementDay: 25, paymentDueDay: 15, minimumPaymentMinor: EGP(750) }),
    account({ id: 'demo-acc-wallet', name: L('Mobile wallet (demo)', 'محفظة الهاتف (تجريبية)'), kind: 'mobile-wallet', provider: L('Mobile wallet', 'محفظة إلكترونية'), currency: 'EGP', openingBalanceMinor: EGP(800), last4: '', syncMode: 'manual' }),
    account({ id: 'demo-acc-paypal', name: 'PayPal', kind: 'paypal', provider: 'PayPal', currency: 'USD', openingBalanceMinor: 12000, last4: '', syncMode: 'import' }),
  ]

  const transactions: Transaction[] = []
  let counter = 0
  const add = (input: Partial<TransactionInput> & Pick<TransactionInput, 'type' | 'description' | 'amountMinor' | 'categoryId' | 'date'>, id?: string) => {
    if (input.date > today) return
    counter += 1
    transactions.push({
      ...TRANSACTION_DEFAULTS,
      currency: 'EGP',
      paymentMethod: 'debit-card',
      accountId: 'demo-acc-bank',
      ...input,
      id: id ?? `demo-tx-${String(counter).padStart(4, '0')}`,
      createdAt: `${input.date}T12:00:00.000Z`,
      updatedAt: `${input.date}T12:00:00.000Z`,
    })
  }

  const groceries = [L('Green Basket Market', 'جرين باسكت ماركت'), L('Delta Fresh Grocers', 'دلتا فريش للبقالة'), L('Corner Co-op', 'جمعية الناصية')]
  const dining = [L('Lotus Café', 'كافيه اللوتس'), L('Koshary Corner', 'ركن الكشري'), L('Blue Fig Bistro', 'مطعم التينة الزرقاء')]
  const shopping = [L('Northstar Outfitters', 'متجر نورث ستار'), L('Paper & Pine Stationery', 'مكتبة الورق والصنوبر'), L('Brightline Electronics', 'برايت لاين للإلكترونيات')]

  for (let day = start; toIsoDate(day) <= today; day = addDays(day, 1)) {
    const date = toIsoDate(day)
    const dom = day.getDate()
    const dow = day.getDay()
    if (dow === 5 || (dow === 2 && random() > 0.5)) {
      add({ type: 'expense', description: groceries[between(0, groceries.length - 1)] ?? 'Groceries', amountMinor: EGP(between(650, 2400)), categoryId: 'exp-groceries', date, accountId: random() > 0.5 ? 'demo-acc-card' : 'demo-acc-cash', paymentMethod: 'credit-card' })
    }
    if (random() > 0.8) {
      add({ type: 'expense', description: dining[between(0, dining.length - 1)] ?? 'Dining', amountMinor: EGP(between(120, 850)), categoryId: 'exp-dining', date, accountId: 'demo-acc-card', paymentMethod: 'credit-card' })
    }
    if (dow === 0 || dow === 3) {
      add({ type: 'expense', description: L('Metro and ride-share', 'المترو والتوصيل'), amountMinor: EGP(between(60, 320)), categoryId: 'exp-transport', date, accountId: 'demo-acc-wallet', paymentMethod: 'mobile-wallet' })
    }
    if (dom === 8) add({ type: 'expense', description: L('Electricity bill', 'فاتورة الكهرباء'), amountMinor: EGP(between(650, 1400)), categoryId: 'exp-utilities', date, paymentMethod: 'instapay' })
    if (dom === 12 && random() > 0.3) add({ type: 'expense', description: shopping[between(0, shopping.length - 1)] ?? 'Shopping', amountMinor: EGP(between(500, 4200)), categoryId: 'exp-shopping', date, accountId: 'demo-acc-card', paymentMethod: 'credit-card' })
    if (dom === 20 && random() > 0.4) add({ type: 'expense', description: L('Cinema tickets', 'تذاكر السينما'), amountMinor: EGP(between(300, 700)), categoryId: 'exp-entertainment', date, accountId: 'demo-acc-card', paymentMethod: 'credit-card' })
    if (dom === 25 && random() > 0.5) add({ type: 'expense', description: L('Pharmacy', 'صيدلية'), amountMinor: EGP(between(150, 900)), categoryId: 'exp-health', date, accountId: 'demo-acc-cash', paymentMethod: 'cash' })
    // ATM withdrawal: a transfer between own accounts, not an expense.
    if (dom === 3) add({ type: 'transfer', description: L('ATM cash withdrawal', 'سحب نقدي من الصراف'), amountMinor: EGP(3000), categoryId: 'transfer', date, accountId: 'demo-acc-bank', toAccountId: 'demo-acc-cash', paymentMethod: null })
    // Credit-card repayment: a transfer that reduces the card debt; the purchases were already expenses.
    if (dom === 14) add({ type: 'transfer', description: L('Card repayment', 'سداد البطاقة الائتمانية'), amountMinor: EGP(between(6000, 9000)), categoryId: 'transfer', date, accountId: 'demo-acc-bank', toAccountId: 'demo-acc-card', paymentMethod: 'bank-transfer' })
    if (dom === 10) add({ type: 'transfer', description: L('Wallet top-up', 'شحن المحفظة'), amountMinor: EGP(1000), categoryId: 'transfer', date, accountId: 'demo-acc-bank', toAccountId: 'demo-acc-wallet', paymentMethod: 'instapay' })
  }

  // A refund reduces shopping spending; it is not income.
  add({ type: 'refund', description: L('Refund — returned headphones', 'استرداد — إعادة سماعات'), amountMinor: EGP(1200), categoryId: 'exp-shopping', date: `${lastMonth}-16`, accountId: 'demo-acc-card', paymentMethod: 'credit-card' })
  // A trip abroad in euros, plus a small purchase in a zero-decimal currency.
  add({ type: 'expense', description: L('Hotel Azulejo, Lisbon (demo)', 'فندق أزوليجو، لشبونة (تجريبي)'), amountMinor: 38400, currency: 'EUR', categoryId: 'exp-travel', date: `${lastMonth}-09`, accountId: null, paymentMethod: 'credit-card' })
  add({ type: 'expense', description: L('Tram day passes', 'تذاكر الترام'), amountMinor: 1640, currency: 'EUR', categoryId: 'exp-transport', date: `${lastMonth}-10`, accountId: null, paymentMethod: 'cash' })
  add({ type: 'expense', description: L('Airport snacks, Tokyo layover', 'وجبة خفيفة في مطار طوكيو'), amountMinor: 1280, currency: 'JPY', categoryId: 'exp-dining', date: `${lastMonth}-11`, accountId: null, paymentMethod: 'cash' })

  // Income sources with received history.
  const incomeSources: IncomeSource[] = []
  const source = (s: Omit<IncomeSource, 'createdAt' | 'updatedAt' | 'notes' | 'description' | 'endDate' | 'status'> & Partial<IncomeSource>, history: { due: IsoDate; amounts: number[]; date?: IsoDate }[]) => {
    for (const h of history) {
      h.amounts.forEach((amount, i) =>
        add(
          {
            type: 'income',
            description: s.name,
            amountMinor: amount,
            currency: s.currency,
            categoryId: s.categoryId,
            date: h.date ?? h.due,
            accountId: s.accountId,
            paymentMethod: 'bank-transfer',
            origin: 'income',
            incomeSourceId: s.id,
            incomeDueDate: h.due,
          },
          incomeReceiptId(s.id, h.due, i + 1),
        ),
      )
    }
    incomeSources.push({ description: '', notes: '', endDate: null, status: 'active', ...s, createdAt: stamp, updatedAt: stamp })
  }
  const monthsBack = (n: number, day: number) => `${addMonthsToMonth(currentMonth, -n)}-${String(day).padStart(2, '0')}`
  const thisMonthDate = (day: number) => `${currentMonth}-${String(day).padStart(2, '0')}`
  const salaryNext = Number(today.slice(8, 10)) >= 1 ? `${addMonthsToMonth(currentMonth, 1)}-01` : thisMonthDate(1)
  source(
    { id: 'demo-inc-salary', name: L('Monthly salary — Delta Studio (demo)', 'الراتب الشهري — دلتا ستوديو (تجريبي)'), categoryId: 'inc-salary', currency: 'EGP', expectedAmountMinor: EGP(45000), frequency: 'monthly', nextExpectedDate: salaryNext, anchorDay: 1, accountId: 'demo-acc-bank' },
    [4, 3, 2, 1, 0].map((n) => ({ due: monthsBack(n, 1), amounts: [EGP(45000)] })),
  )
  // Freelance retainer in USD: last month only partly paid so far.
  const freelanceDue = `${lastMonth}-18`
  source(
    { id: 'demo-inc-freelance', name: L('Freelance retainer — Acme Kites (demo)', 'عقد عمل حر — أكمي كايتس (تجريبي)'), categoryId: 'inc-freelance', currency: 'USD', expectedAmountMinor: 60000, frequency: 'monthly', nextExpectedDate: freelanceDue, anchorDay: 18, accountId: 'demo-acc-paypal', notes: L('Paid via PayPal; the client sometimes pays in parts.', 'يُدفع عبر باي بال؛ أحياناً على دفعات.') },
    [
      { due: monthsBack(3, 18), amounts: [60000] },
      { due: monthsBack(2, 18), amounts: [60000] },
      { due: freelanceDue, amounts: [40000], date: `${lastMonth}-20` },
    ],
  )
  // Rental income expected on the 5th: this month's payment hasn't arrived yet (overdue if past the 5th).
  source(
    { id: 'demo-inc-rent', name: L('Flat rental income (demo)', 'إيراد إيجار الشقة (تجريبي)'), categoryId: 'inc-rental', currency: 'EGP', expectedAmountMinor: EGP(7000), frequency: 'monthly', nextExpectedDate: thisMonthDate(5), anchorDay: 5, accountId: 'demo-acc-bank' },
    [3, 2, 1].map((n) => ({ due: monthsBack(n, 5), amounts: [EGP(7000)] })),
  )
  source(
    { id: 'demo-inc-bonus', name: L('Annual bonus (expected)', 'المكافأة السنوية (متوقعة)'), categoryId: 'inc-salary', currency: 'EGP', expectedAmountMinor: EGP(30000), frequency: 'once', nextExpectedDate: toIsoDate(addDays(todayDate, 45)), anchorDay: Number(toIsoDate(addDays(todayDate, 45)).slice(8, 10)), accountId: 'demo-acc-bank' },
    [],
  )

  // Recurring bills, with past occurrences already recorded as linked expenses.
  const recurringBills: RecurringBill[] = []
  const bill = (b: Omit<RecurringBill, 'createdAt' | 'updatedAt' | 'lastPaidDate' | 'notes' | 'endDate' | 'accountId'> & Partial<Pick<RecurringBill, 'notes' | 'endDate' | 'accountId'>>, historyFrom: IsoDate | null) => {
    let lastPaid: IsoDate | null = null
    if (historyFrom) {
      let due = historyFrom
      while (due < b.nextDueDate) {
        add(
          { type: 'expense', description: b.name, amountMinor: b.amountMinor, currency: b.currency, categoryId: b.categoryId, date: due, paymentMethod: 'bank-transfer', accountId: b.accountId ?? 'demo-acc-bank', origin: 'bill', recurringBillId: b.id, recurringDueDate: due },
          billPaymentTransactionId(b.id, due),
        )
        lastPaid = due
        due = advanceDueDate(due, b.frequency, b.anchorDay)
      }
    }
    recurringBills.push({ notes: '', endDate: null, accountId: 'demo-acc-bank', ...b, lastPaidDate: lastPaid, createdAt: stamp, updatedAt: stamp })
  }
  const dayAt = (offset: number) => toIsoDate(addDays(todayDate, offset))
  const dayOf = (offset: number) => Number(dayAt(offset).slice(8, 10))
  bill({ id: 'demo-bill-rent', name: L('Apartment rent', 'إيجار الشقة'), amountMinor: EGP(12000), currency: 'EGP', categoryId: 'exp-housing', frequency: 'monthly', nextDueDate: `${addMonthsToMonth(currentMonth, 1)}-01`, anchorDay: 1, status: 'active' }, `${monthOf(toIsoDate(start))}-01`)
  bill({ id: 'demo-bill-internet', name: L('Home fibre internet', 'إنترنت منزلي'), amountMinor: EGP(650), currency: 'EGP', categoryId: 'exp-utilities', frequency: 'monthly', nextDueDate: dayAt(2), anchorDay: dayOf(2), status: 'active' }, toIsoDate(subMonths(fromIsoDate(dayAt(2)), 3)))
  bill({ id: 'demo-bill-phone', name: L('Mobile phone plan', 'باقة الهاتف المحمول'), amountMinor: EGP(250), currency: 'EGP', categoryId: 'exp-utilities', frequency: 'monthly', nextDueDate: dayAt(-3), anchorDay: dayOf(-3), status: 'active', accountId: 'demo-acc-wallet', notes: L('Overdue in the demo so you can try “Mark paid”.', 'متأخرة في النسخة التجريبية لتجربة "تسجيل الدفع".') }, toIsoDate(subMonths(fromIsoDate(dayAt(-3)), 3)))
  bill({ id: 'demo-bill-streaming', name: L('StreamBox subscription', 'اشتراك ستريم بوكس'), amountMinor: 999, currency: 'USD', categoryId: 'exp-subscriptions', frequency: 'monthly', nextDueDate: dayAt(9), anchorDay: dayOf(9), status: 'active', accountId: 'demo-acc-paypal' }, toIsoDate(subMonths(fromIsoDate(dayAt(9)), 2)))
  bill({ id: 'demo-bill-insurance', name: L('Car insurance', 'تأمين السيارة'), amountMinor: EGP(3100), currency: 'EGP', categoryId: 'exp-transport', frequency: 'quarterly', nextDueDate: dayAt(24), anchorDay: dayOf(24), status: 'active' }, null)
  bill({ id: 'demo-bill-gym', name: L('Gym membership', 'اشتراك النادي الرياضي'), amountMinor: EGP(900), currency: 'EGP', categoryId: 'exp-health', frequency: 'monthly', nextDueDate: dayAt(10), anchorDay: dayOf(10), status: 'paused', notes: L('Paused while travelling.', 'متوقف أثناء السفر.') }, null)

  const budget = (b: Omit<Budget, 'createdAt' | 'updatedAt' | 'notes'> & { notes?: string }): Budget => ({ notes: '', ...b, createdAt: stamp, updatedAt: stamp })
  const threeMonthsAgo = addMonthsToMonth(currentMonth, -3)
  const budgets: Budget[] = [
    budget({ id: 'demo-budget-groceries', name: L('Groceries', 'البقالة'), categoryId: 'exp-groceries', limitMinor: EGP(9000), currency: 'EGP', startMonth: threeMonthsAgo, endMonth: null }),
    budget({ id: 'demo-budget-dining', name: L('Eating out', 'المطاعم'), categoryId: 'exp-dining', limitMinor: EGP(3000), currency: 'EGP', startMonth: threeMonthsAgo, endMonth: null }),
    budget({ id: 'demo-budget-transport', name: L('Getting around', 'المواصلات'), categoryId: 'exp-transport', limitMinor: EGP(2000), currency: 'EGP', startMonth: threeMonthsAgo, endMonth: null }),
    budget({ id: 'demo-budget-fun', name: L('Entertainment', 'الترفيه'), categoryId: 'exp-entertainment', limitMinor: EGP(1000), currency: 'EGP', startMonth: threeMonthsAgo, endMonth: null }),
    budget({ id: 'demo-budget-trip', name: L('Lisbon trip', 'رحلة لشبونة'), categoryId: 'exp-travel', limitMinor: 50000, currency: 'EUR', startMonth: lastMonth, endMonth: lastMonth, notes: L('One-off travel budget in euros.', 'ميزانية سفر لمرة واحدة باليورو.') }),
  ]

  // Invoices (metadata only; the demo has no stored files).
  const groceryTx = transactions.find((t) => t.categoryId === 'exp-groceries' && t.date >= `${currentMonth}-01`) ?? transactions.find((t) => t.categoryId === 'exp-groceries')
  const invoice = (i: Partial<Invoice> & Pick<Invoice, 'id' | 'merchant' | 'totalMinor' | 'currency' | 'kind' | 'status'>): Invoice => ({
    merchantAddress: '',
    merchantTaxId: '',
    invoiceNumber: '',
    issueDate: null,
    dueDate: null,
    subtotalMinor: null,
    discountMinor: null,
    taxMinor: null,
    taxLines: [],
    lines: [],
    categoryId: null,
    paymentMethod: null,
    warrantyUntil: null,
    returnBy: null,
    qrText: '',
    extraction: 'manual',
    rawText: '',
    linkedTransactionIds: [],
    file: null,
    notes: '',
    ...i,
    createdAt: stamp,
    updatedAt: stamp,
  })
  const invoices: Invoice[] = [
    invoice({ id: 'demo-inv-power', kind: 'utility-bill', merchant: L('North Delta Electricity (demo)', 'كهرباء شمال الدلتا (تجريبي)'), invoiceNumber: 'EL-2026-0918', issueDate: dayAt(-6), dueDate: dayAt(6), currency: 'EGP', totalMinor: EGP(1180), status: 'unpaid', categoryId: 'exp-utilities' }),
    invoice({
      id: 'demo-inv-grocery',
      kind: 'e-receipt',
      merchant: groceryTx?.description ?? 'Green Basket Market',
      merchantTaxId: '123-456-789',
      invoiceNumber: 'R-77812',
      issueDate: groceryTx?.date ?? today,
      currency: 'EGP',
      subtotalMinor: groceryTx ? Math.round(groceryTx.amountMinor / 1.14) : null,
      taxMinor: groceryTx ? groceryTx.amountMinor - Math.round(groceryTx.amountMinor / 1.14) : null,
      taxLines: groceryTx ? [{ label: 'VAT', rate: '14', amountMinor: groceryTx.amountMinor - Math.round(groceryTx.amountMinor / 1.14) }] : [],
      totalMinor: groceryTx?.amountMinor ?? EGP(900),
      status: 'paid',
      categoryId: 'exp-groceries',
      linkedTransactionIds: groceryTx ? [groceryTx.id] : [],
    }),
    invoice({ id: 'demo-inv-laptop', kind: 'tax-invoice', merchant: L('Brightline Electronics (demo)', 'برايت لاين للإلكترونيات (تجريبي)'), invoiceNumber: 'BL-55102', issueDate: monthsBack(2, 12), currency: 'EGP', subtotalMinor: EGP(21053), taxMinor: EGP(2947), taxLines: [{ label: 'VAT', rate: '14', amountMinor: EGP(2947) }], totalMinor: EGP(24000), status: 'paid', warrantyUntil: toIsoDate(addDays(fromIsoDate(monthsBack(2, 12)), 365)), returnBy: toIsoDate(addDays(fromIsoDate(monthsBack(2, 12)), 14)), categoryId: 'exp-shopping', notes: L('Stated as paid on the invoice; no payment linked yet.', 'مدونة كمدفوعة في الفاتورة؛ لم يُربط دفع بعد.') }),
  ]
  if (groceryTx) groceryTx.invoiceId = 'demo-inv-grocery'

  // One completed statement import into the bank account.
  const importId = 'demo-import-1'
  for (const [i, row] of [
    [monthsBack(1, 6), L('POS purchase — Corner Co-op', 'شراء نقاط بيع — جمعية الناصية'), EGP(540)],
    [monthsBack(1, 9), L('Bank service fee', 'رسوم خدمة بنكية'), EGP(35)],
  ].entries()) {
    add({ type: 'expense', description: String(row[1]), amountMinor: Number(row[2]), categoryId: i === 1 ? 'exp-fees' : 'exp-groceries', date: String(row[0]), origin: 'import', importId, sourceRef: `STMT-${1000 + i}`, reconciled: true }, `imp_demo-acc-bank_demo${i}`)
  }
  const imports: ImportBatch[] = [{ id: importId, fileName: 'nile-bank-statement-demo.csv', format: 'csv', accountId: 'demo-acc-bank', rowCount: 3, importedCount: 2, duplicateCount: 1, skippedCount: 0, status: 'completed', createdAt: `${monthsBack(1, 10)}T10:00:00.000Z`, updatedAt: `${monthsBack(1, 10)}T10:00:00.000Z` }]

  const goals: SavingsGoal[] = [
    { id: 'demo-goal-emergency', name: L('Emergency fund', 'صندوق الطوارئ'), currency: 'EGP', targetMinor: EGP(150000), targetDate: toIsoDate(addDays(todayDate, 300)), isEmergencyFund: true, contributions: [4, 3, 2, 1].map((n) => ({ date: monthsBack(n, 2), amountMinor: EGP(8000), note: '' })), notes: '', createdAt: stamp, updatedAt: stamp },
    { id: 'demo-goal-laptop', name: L('New camera', 'كاميرا جديدة'), currency: 'USD', targetMinor: 90000, targetDate: null, isEmergencyFund: false, contributions: [{ date: monthsBack(1, 20), amountMinor: 25000, note: '' }], notes: '', createdAt: stamp, updatedAt: stamp },
  ]
  const debts: Debt[] = [
    { id: 'demo-debt-car', name: L('Car instalment plan', 'تقسيط السيارة'), kind: 'installment', lender: L('Delta Auto Finance (fictional)', 'دلتا لتمويل السيارات (وهمي)'), currency: 'EGP', originalMinor: EGP(180000), annualRate: '18', minimumPaymentMinor: EGP(6500), dueDay: 20, payments: [3, 2, 1].map((n) => ({ date: monthsBack(n, 20), amountMinor: EGP(6500), note: '' })), notes: '', createdAt: stamp, updatedAt: stamp },
  ]

  transactions.sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))

  return {
    transactions,
    categories,
    budgets,
    recurringBills,
    accounts,
    incomeSources,
    invoices,
    imports,
    goals,
    debts,
    settings: { ...defaultSettings(language === 'ar' ? 'en-EG' : undefined, language), displayCurrency: 'EGP', openingBalances: [] },
  }
}
