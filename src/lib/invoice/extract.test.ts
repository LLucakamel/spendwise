import { describe, expect, it } from 'vitest'
import { checkArithmetic, extractInvoiceFields } from './extract'
import { findDuplicateInvoices, invoicePaymentState, suggestInvoiceMatches, taxSummary } from './invoices'
import type { Invoice } from '@/domain/types'
import { tx } from '@/test/factories'

// Synthetic OCR text — fictional merchants and numbers.
const englishReceipt = `GREEN BASKET MARKET
12 Example Street, Cairo
Tax Reg. No: 123-456-789
Invoice No: GB-2026-0042
Date: 05/03/2026
Milk 2 x 35.00 70.00
Bread 15.00
Subtotal 85.00
VAT 14% 11.90
TOTAL EGP 96.90
Thank you`

const arabicReceipt = `سوبر ماركت الواحة
رقم التسجيل الضريبي: ٤٥٦-٧٨٩-١٢٣
رقم الفاتورة: ٧٧٨٨
التاريخ: ١٠/٠٣/٢٠٢٦
الإجمالي قبل الضريبة ٢٠٠٫٠٠
ضريبة القيمة المضافة ١٤٪ ٢٨٫٠٠
الإجمالي ٢٢٨٫٠٠ جنيه`

describe('extractInvoiceFields', () => {
  it('reads an English receipt and records the source line of each field', () => {
    const r = extractInvoiceFields(englishReceipt, { fallbackCurrency: 'USD' })
    expect(r.merchant.value).toBe('GREEN BASKET MARKET')
    expect(r.invoiceNumber.value).toBe('GB-2026-0042')
    expect(r.merchantTaxId.value).toBe('123-456-789')
    expect(r.issueDate.value).toBe('2026-03-05')
    expect(r.currency.value).toBe('EGP')
    expect(r.subtotalMinor.value).toBe(8500)
    expect(r.taxMinor.value).toBe(1190)
    expect(r.totalMinor.value).toBe(9690)
    expect(r.totalMinor.line).toContain('TOTAL')
    expect(r.discrepancies).toEqual([])
  })

  it('reads an Arabic receipt with Arabic-Indic digits', () => {
    const r = extractInvoiceFields(arabicReceipt, { fallbackCurrency: 'USD' })
    expect(r.currency.value).toBe('EGP')
    expect(r.issueDate.value).toBe('2026-03-10')
    expect(r.totalMinor.value).toBe(22800)
    expect(r.taxMinor.value).toBe(2800)
    expect(r.invoiceNumber.value).toBe('7788')
  })

  it('leaves fields empty instead of guessing when nothing matches', () => {
    const r = extractInvoiceFields('just some words', { fallbackCurrency: 'USD' })
    expect(r.totalMinor.value).toBeNull()
    expect(r.issueDate.value).toBeNull()
  })

  it('flags arithmetic that does not add up', () => {
    expect(checkArithmetic(10000, null, 1400, 11400)).toEqual([])
    expect(checkArithmetic(10000, null, 1400, 12000).length).toBeGreaterThan(0)
  })
})

function invoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: 'inv1',
    kind: 'receipt',
    merchant: 'Green Basket',
    merchantAddress: '',
    merchantTaxId: '',
    invoiceNumber: 'GB-1',
    issueDate: '2026-03-05',
    dueDate: null,
    currency: 'EGP',
    subtotalMinor: null,
    discountMinor: null,
    taxMinor: 1400,
    totalMinor: 11400,
    taxLines: [{ label: 'VAT', rate: '14', amountMinor: 1400 }],
    lines: [],
    paymentMethod: null,
    categoryId: null,
    status: 'unpaid',
    linkedTransactionIds: [],
    file: null,
    extraction: 'manual',
    warrantyUntil: null,
    returnBy: null,
    notes: '',
    createdAt: '2026-03-05T00:00:00.000Z',
    updatedAt: '2026-03-05T00:00:00.000Z',
    ...overrides,
  } as Invoice
}

describe('invoice helpers', () => {
  it('detects duplicates by file hash, number and amount/date', () => {
    const existing = [invoice({ id: 'a', file: { name: 'x.jpg', type: 'image/jpeg', size: 1, sha256: 'f'.repeat(64), storagePath: 'p' } })]
    const candidate = { merchant: 'Green Basket', merchantTaxId: '', invoiceNumber: 'GB-1', totalMinor: 11400, currency: 'EGP', issueDate: '2026-03-05' }
    expect(findDuplicateInvoices({ ...candidate, sha256: 'f'.repeat(64) }, existing).map((m) => m.reason)).toEqual(['same-file'])
    expect(findDuplicateInvoices(candidate, existing).map((m) => m.reason)).toEqual(['same-number'])
    expect(findDuplicateInvoices({ ...candidate, invoiceNumber: '' }, existing).map((m) => m.reason)).toEqual(['same-amount-date'])
    expect(findDuplicateInvoices({ ...candidate, invoiceNumber: 'OTHER', totalMinor: 1 }, existing)).toEqual([])
  })

  it('derives payment state only from linked transactions', () => {
    const pay = tx({ id: 'p1', amountMinor: 5000, currency: 'EGP' })
    expect(invoicePaymentState(invoice(), [pay], '2026-03-06').state).toBe('unpaid')
    expect(invoicePaymentState(invoice({ linkedTransactionIds: ['p1'] }), [pay], '2026-03-06').state).toBe('partially-paid')
    expect(invoicePaymentState(invoice({ dueDate: '2026-03-01' }), [], '2026-03-06').state).toBe('overdue')
  })

  it('suggests matching transactions but never links them itself', () => {
    const candidate = tx({ id: 'm1', amountMinor: 11400, currency: 'EGP', date: '2026-03-05', description: 'Green Basket' })
    const suggestions = suggestInvoiceMatches(invoice(), [candidate, tx({ id: 'far', amountMinor: 1, currency: 'EGP' })], new Set())
    expect(suggestions[0]?.transaction.id).toBe('m1')
  })

  it('sums tax per currency and label', () => {
    expect(taxSummary([invoice(), invoice({ id: 'b' })])).toEqual([expect.objectContaining({ currency: 'EGP', label: 'VAT', amountMinor: 2800, count: 2 })])
  })
})
