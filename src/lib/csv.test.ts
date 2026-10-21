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
  it('writes a header, exact decimal amounts and category names', () => {
    const csv = transactionsToCsv(
      [
        tx({ id: 'a', description: 'Coffee, beans', amountMinor: 1250, date: '2026-03-02', notes: 'said "hi"' }),
        tx({ id: 'b', type: 'income', description: 'Bonus', amountMinor: 1500, currency: 'JPY', categoryId: 'missing' }),
      ],
      [{ id: 'exp-groceries', name: 'Groceries', type: 'expense', color: '#000000', createdAt: '', updatedAt: '' }],
    )
    const lines = csv.trimEnd().split('\r\n')
    expect(lines[0]).toBe('Date,Type,Description,Category,Amount,Currency,Payment method,Notes,ID,Created at,Updated at')
    expect(lines[1]).toBe('2026-03-02,expense,"Coffee, beans",Groceries,12.50,USD,,"said ""hi""",a,2026-03-15T10:00:00.000Z,2026-03-15T10:00:00.000Z')
    expect(lines[2]).toContain('income,Bonus,Uncategorized,1500,JPY')
    expect(csv.endsWith('\r\n')).toBe(true)
  })
})
