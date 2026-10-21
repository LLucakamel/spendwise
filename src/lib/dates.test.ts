import { describe, expect, it } from 'vitest'
import {
  bucketStart,
  chooseGranularity,
  comparisonRange,
  eachBucket,
  formatDate,
  isValidIsoDate,
  isValidIsoMonth,
  presetRange,
  rangeLengthDays,
} from './dates'

describe('isValidIsoDate', () => {
  it('validates real calendar dates only', () => {
    expect(isValidIsoDate('2024-02-29')).toBe(true)
    expect(isValidIsoDate('2026-02-29')).toBe(false)
    expect(isValidIsoDate('2026-04-31')).toBe(false)
    expect(isValidIsoDate('2026-13-01')).toBe(false)
    expect(isValidIsoDate('26-01-01')).toBe(false)
    expect(isValidIsoDate('')).toBe(false)
    expect(isValidIsoMonth('2026-12')).toBe(true)
    expect(isValidIsoMonth('2026-00')).toBe(false)
  })
})

describe('presetRange', () => {
  it('computes calendar and rolling periods', () => {
    expect(presetRange('this-month', '2026-02-10')).toEqual({ from: '2026-02-01', to: '2026-02-28' })
    expect(presetRange('last-month', '2026-01-15')).toEqual({ from: '2025-12-01', to: '2025-12-31' })
    expect(presetRange('last-30-days', '2026-03-30')).toEqual({ from: '2026-03-01', to: '2026-03-30' })
    expect(rangeLengthDays(presetRange('last-30-days', '2026-03-30'))).toBe(30)
    expect(presetRange('this-year', '2026-06-01')).toEqual({ from: '2026-01-01', to: '2026-12-31' })
  })
})

describe('comparisonRange', () => {
  it('compares an in-progress month with the same elapsed part of last month', () => {
    const range = presetRange('this-month', '2026-03-31')
    expect(comparisonRange('this-month', range, '2026-03-31')).toEqual({ from: '2026-02-01', to: '2026-02-28' })
    expect(comparisonRange('this-month', presetRange('this-month', '2026-03-10'), '2026-03-10')).toEqual({ from: '2026-02-01', to: '2026-02-10' })
  })

  it('compares last month with the full month before it', () => {
    expect(comparisonRange('last-month', presetRange('last-month', '2026-03-10'), '2026-03-10')).toEqual({ from: '2026-01-01', to: '2026-01-31' })
  })

  it('compares rolling and custom ranges with the preceding range of equal length', () => {
    expect(comparisonRange('last-30-days', { from: '2026-03-01', to: '2026-03-30' }, '2026-03-30')).toEqual({ from: '2026-01-30', to: '2026-02-28' })
    expect(comparisonRange('custom', { from: '2026-03-10', to: '2026-03-12' }, '2026-04-01')).toEqual({ from: '2026-03-07', to: '2026-03-09' })
  })
})

describe('buckets', () => {
  it('chooses granularity by range length', () => {
    expect(chooseGranularity({ from: '2026-03-01', to: '2026-03-14' })).toBe('day')
    expect(chooseGranularity({ from: '2026-03-01', to: '2026-03-31' })).toBe('week')
    expect(chooseGranularity({ from: '2026-01-01', to: '2026-03-31' })).toBe('week')
    expect(chooseGranularity({ from: '2026-01-01', to: '2026-12-31' })).toBe('month')
  })

  it('respects the first day of the week', () => {
    // 2026-03-04 is a Wednesday.
    expect(bucketStart('2026-03-04', 'week', 1)).toBe('2026-03-02')
    expect(bucketStart('2026-03-04', 'week', 0)).toBe('2026-03-01')
    expect(bucketStart('2026-03-04', 'week', 6)).toBe('2026-02-28')
  })

  it('covers the whole range', () => {
    expect(eachBucket({ from: '2026-01-15', to: '2026-03-02' }, 'month', 1)).toEqual(['2026-01-01', '2026-02-01', '2026-03-01'])
  })
})

describe('formatDate', () => {
  it('applies the chosen format', () => {
    expect(formatDate('2026-03-04', 'yyyy-MM-dd', 'en-US')).toBe('2026-03-04')
    expect(formatDate('2026-03-04', 'dd/MM/yyyy', 'en-US')).toBe('04/03/2026')
    expect(formatDate('2026-03-04', 'MM/dd/yyyy', 'en-US')).toBe('03/04/2026')
    expect(formatDate('2026-03-04', 'locale', 'en-US')).toBe('Mar 4, 2026')
  })
})

describe('this week', () => {
  it('starts on the configured first day of the week', () => {
    // 2026-03-04 is a Wednesday.
    expect(presetRange('this-week', '2026-03-04', 1)).toEqual({ from: '2026-03-02', to: '2026-03-08' })
    expect(presetRange('this-week', '2026-03-04', 0)).toEqual({ from: '2026-03-01', to: '2026-03-07' })
    expect(presetRange('this-week', '2026-03-04', 6)).toEqual({ from: '2026-02-28', to: '2026-03-06' })
  })

  it('compares the elapsed days with the same days of last week', () => {
    const range = presetRange('this-week', '2026-03-04', 1)
    expect(comparisonRange('this-week', range, '2026-03-04')).toEqual({ from: '2026-02-23', to: '2026-02-25' })
  })
})
