import { describe, expect, it } from 'vitest'
import { minorUnitDigits } from '@/domain/currencies'
import {
  addMinor,
  formatMoney,
  MAX_AMOUNT_MINOR,
  minorToDecimalString,
  parseAmountToMinor,
  parseSignedAmountToMinor,
  sumMinor,
} from './money'

describe('minorUnitDigits (ISO 4217)', () => {
  it.each([
    ['USD', 2],
    ['EUR', 2],
    ['AED', 2],
    ['JPY', 0],
    ['KRW', 0],
    ['KWD', 3],
    ['BHD', 3],
    ['OMR', 3],
  ])('%s uses %i decimal places', (code, digits) => {
    expect(minorUnitDigits(code)).toBe(digits)
  })

  it('rejects unknown codes', () => {
    expect(() => minorUnitDigits('XXX')).toThrow()
    expect(() => minorUnitDigits('usd')).toThrow()
  })
})

describe('parseAmountToMinor', () => {
  it('parses decimal input into integer minor units without float error', () => {
    expect(parseAmountToMinor('0.1', 'USD')).toEqual({ ok: true, value: 10 })
    expect(parseAmountToMinor('0.29', 'USD')).toEqual({ ok: true, value: 29 })
    expect(parseAmountToMinor('1234.56', 'USD')).toEqual({ ok: true, value: 123456 })
    expect(parseAmountToMinor('19.99', 'EUR')).toEqual({ ok: true, value: 1999 })
  })

  it('accepts a comma as decimal separator and surrounding whitespace', () => {
    expect(parseAmountToMinor(' 12,5 ', 'EUR')).toEqual({ ok: true, value: 1250 })
  })

  it('respects each currency precision', () => {
    expect(parseAmountToMinor('1500', 'JPY')).toEqual({ ok: true, value: 1500 })
    expect(parseAmountToMinor('1500.5', 'JPY').ok).toBe(false)
    expect(parseAmountToMinor('1.234', 'KWD')).toEqual({ ok: true, value: 1234 })
    expect(parseAmountToMinor('1.2345', 'KWD').ok).toBe(false)
    expect(parseAmountToMinor('1.234', 'USD').ok).toBe(false)
  })

  it('rejects zero, negatives, non-numbers and ambiguous separators', () => {
    for (const input of ['', '0', '0.00', '-5', 'abc', '1e3', 'Infinity', 'NaN', '$5', '1,234.56', '1.2.3']) {
      expect(parseAmountToMinor(input, 'USD').ok, input).toBe(false)
    }
  })

  it('rejects amounts beyond the safe limit', () => {
    expect(parseAmountToMinor('99999999999999999999', 'USD').ok).toBe(false)
    expect(parseAmountToMinor(String(MAX_AMOUNT_MINOR / 100 + 1), 'USD').ok).toBe(false)
  })
})

describe('parseSignedAmountToMinor', () => {
  it('allows zero and negative opening balances', () => {
    expect(parseSignedAmountToMinor('0', 'USD')).toEqual({ ok: true, value: 0 })
    expect(parseSignedAmountToMinor('-120.50', 'USD')).toEqual({ ok: true, value: -12050 })
    expect(parseSignedAmountToMinor('-', 'USD').ok).toBe(false)
  })
})

describe('minorToDecimalString', () => {
  it('produces exact decimal strings', () => {
    expect(minorToDecimalString(5, 'USD')).toBe('0.05')
    expect(minorToDecimalString(-12345, 'USD')).toBe('-123.45')
    expect(minorToDecimalString(1500, 'JPY')).toBe('1500')
    expect(minorToDecimalString(1, 'KWD')).toBe('0.001')
  })
})

describe('formatMoney', () => {
  it('formats with the currency precision and locale', () => {
    expect(formatMoney(123456, 'USD', 'en-US')).toBe('$1,234.56')
    expect(formatMoney(1500, 'JPY', 'en-US')).toBe('¥1,500')
    expect(formatMoney(1234, 'KWD', 'en-US')).toMatch(/1\.234/)
    expect(formatMoney(123456, 'EUR', 'de-DE')).toMatch(/1\.234,56/)
  })

  it('keeps exact values for large amounts', () => {
    expect(formatMoney(900719925474, 'USD', 'en-US')).toBe('$9,007,199,254.74')
  })
})

describe('integer arithmetic', () => {
  it('sums minor units exactly (0.1 + 0.2 = 0.3)', () => {
    expect(sumMinor([10, 20])).toBe(30)
    expect(minorToDecimalString(sumMinor([10, 20]), 'USD')).toBe('0.30')
  })

  it('throws instead of silently losing precision', () => {
    expect(() => addMinor(Number.MAX_SAFE_INTEGER, 1)).toThrow(RangeError)
  })
})
