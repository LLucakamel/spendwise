import { describe, expect, it } from 'vitest'
import { tx } from '@/test/factories'
import { escapeCsvField, transactionsToCsv } from './csv'

describe('escapeCsvField', () => {
  it('leaves simple values unchanged', () => {
    expect(escapeCsvField('Groceries')).toBe('Groceries')
    expect(escapeCsvField(42)).toBe('42')
    expect(escapeCsvField(null)).toBe('')
  })

  it('quotes commas, quotes and line breaks per RFC 4180', () => {
    expect(escapeCsvField('Rent, March')).toBe('"Rent, March"')
    expect(escapeCsvField('The "best" café')).toBe('"The ""best"" café"')
    expect(escapeCsvField('line1\nline2')).toBe('"line1\nline2"')
    expect(escapeCsvField('a\r\nb')).toBe('"a\r\nb"')
    expect(escapeCsvField(' padded ')).toBe('" padded "')
  })

  it('neutralises spreadsheet formulas in text', () => {
    expect(escapeCsvField('=HYPERLINK("http://x")')).toBe('"\'=HYPERLINK(""http://x"")"')
    expect(escapeCsvField('+1')).toBe("'+1")
    expect(escapeCsvField('@cmd')).toBe("'@cmd")
  })
})

describe('transactionsToCsv', () => {
  const names = { category: (id: string) => (id === 'exp-groceries' ? 'Groceries' : 'Uncategorized'), account: (id: string | null) => (id === 'acc-1' ? 'Bank' : '') }

  it('writes a header, exact decimal amounts, category and account names', () => {
    const csv = transactionsToCsv(
      [
        tx({ id: 'a', description: 'Coffee, beans', amountMinor: 1250, date: '2026-03-02', notes: 'said "hi"', accountId: 'acc-1' }),
        tx({ id: 'b', type: 'income', description: 'Bonus', amountMinor: 1500, currency: 'JPY', categoryId: 'missing' }),
        tx({ id: 'c', type: 'transfer', description: 'To savings', amountMinor: 500, categoryId: 'transfer', accountId: 'acc-1', toAccountId: 'acc-2' }),
      ],
      names,
    )
    const lines = csv.trimEnd().split('\r\n')
    expect(lines[0]).toBe('Date,Type,Description,Category,Amount,Currency,Account,To account,Payment method,Reference,Source,Reconciled,Notes,ID,Created at,Updated at')
    expect(lines[1]).toContain('2026-03-02,expense,"Coffee, beans",Groceries,12.50,USD,Bank,')
    expect(lines[1]).toContain('"said ""hi""",a,')
    expect(lines[2]).toContain('income,Bonus,Uncategorized,1500,JPY')
    expect(lines[3]).toContain('transfer,To savings,,5.00,USD,Bank,')
    expect(csv.endsWith('\r\n')).toBe(true)
  })
})
