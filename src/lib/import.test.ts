import { describe, expect, it } from 'vitest'
import { isSupportedCurrency } from '@/domain/currencies'
import { tx } from '@/test/factories'
import { classifyDuplicates, guessMapping, importTransactionId, interpretRows, parseCsv, rowsFromStatementText } from './import'

const options = { currency: 'EGP', dateOrder: 'dmy' as const, accountId: 'acc-1', isSupportedCurrency }

describe('statement import', () => {
  it('parses quoted CSV and guesses English and Arabic headers', () => {
    const rows = parseCsv('Date,Description,Amount\r\n01/03/2026,"Coffee, large",-45.50\r\n02/03/2026,Salary,"1,000.00"\r\n')
    expect(rows).toEqual([
      ['Date', 'Description', 'Amount'],
      ['01/03/2026', 'Coffee, large', '-45.50'],
      ['02/03/2026', 'Salary', '1,000.00'],
    ])
    expect(guessMapping(rows[0] ?? [])).toMatchObject({ date: 0, description: 1, amount: 2 })
    expect(guessMapping(['التاريخ', 'البيان', 'مدين', 'دائن'])).toMatchObject({ date: 0, description: 1, debit: 2, credit: 3 })
  })

  it('interprets signed amounts, debit/credit columns and Arabic digits', () => {
    const signed = interpretRows([['01/03/2026', 'Coffee', '-45.50'], ['02/03/2026', 'Salary', '1,000.00'], ['bad', '', 'x']], { date: 0, description: 1, amount: 2, debit: null, credit: null, currency: null, reference: null }, options)
    expect(signed[0]).toMatchObject({ date: '2026-03-01', type: 'expense', amountMinor: 4550, errors: [] })
    expect(signed[1]).toMatchObject({ type: 'income', amountMinor: 100000 })
    expect(signed[2]?.errors).toEqual(expect.arrayContaining(['date', 'description', 'amount']))

    const split = interpretRows([['٠٥/٠٣/٢٠٢٦', 'سحب نقدي', '٢٠٠', '']], { date: 0, description: 1, amount: null, debit: 2, credit: 3, currency: null, reference: null }, options)
    expect(split[0]).toMatchObject({ date: '2026-03-05', type: 'expense', amountMinor: 20000 })
  })

  it('gives identical rows distinct, stable keys', () => {
    const rows = [['01/03/2026', 'Coffee', '-10'], ['01/03/2026', 'Coffee', '-10']]
    const mapping = { date: 0, description: 1, amount: 2, debit: null, credit: null, currency: null, reference: null }
    const a = interpretRows(rows, mapping, options)
    const b = interpretRows(rows, mapping, options)
    expect(a[0]?.key).not.toBe(a[1]?.key)
    expect(a.map((r) => r.key)).toEqual(b.map((r) => r.key))
  })

  it('flags already-imported rows and possible manual duplicates', () => {
    const mapping = { date: 0, description: 1, amount: 2, debit: null, credit: null, currency: null, reference: null }
    const rows = interpretRows([['01/03/2026', 'Coffee', '-10'], ['02/03/2026', 'Lunch', '-80'], ['03/03/2026', 'New', '-5']], mapping, options)
    const existing = [
      tx({ id: importTransactionId('acc-1', rows[0]?.key ?? ''), date: '2026-03-01', amountMinor: 1000, currency: 'EGP', accountId: 'acc-1' }),
      tx({ date: '2026-03-02', amountMinor: 8000, currency: 'EGP', accountId: 'acc-1', description: 'Lunch with team' }),
    ]
    const result = classifyDuplicates(rows, 'acc-1', existing)
    expect(result.get(0)).toBe('already-imported')
    expect(result.get(1)).toBe('possible-duplicate')
    expect(result.has(2)).toBe(false)
  })

  it('builds Firestore-safe deterministic IDs', () => {
    expect(importTransactionId(null, 'ab/c')).toBe('imp_none_ab_c')
  })

  it('extracts dated lines from statement text', () => {
    const rows = rowsFromStatementText('Statement header\n01/03/2026 POS PURCHASE 123.45\nsome footer')
    expect(rows[0]).toEqual(['Date', 'Description', 'Amount'])
    expect(rows.length).toBe(2)
    expect(rows[1]?.[0]).toBe('01/03/2026')
  })
})
