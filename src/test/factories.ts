import type { Budget, RecurringBill, Transaction } from '@/domain/types'

let counter = 0

export function tx(overrides: Partial<Transaction> = {}): Transaction {
  counter += 1
  return {
    id: `t${counter}`,
    type: 'expense',
    description: `Transaction ${counter}`,
    amountMinor: 1000,
    currency: 'USD',
    categoryId: 'exp-groceries',
    date: '2026-03-15',
    notes: '',
    paymentMethod: null,
    recurringBillId: null,
    recurringDueDate: null,
    createdAt: '2026-03-15T10:00:00.000Z',
    updatedAt: '2026-03-15T10:00:00.000Z',
    ...overrides,
  }
}

export function budget(overrides: Partial<Budget> = {}): Budget {
  return {
    id: 'b1',
    name: 'Groceries',
    categoryId: 'exp-groceries',
    limitMinor: 10000,
    currency: 'USD',
    startMonth: '2026-01',
    endMonth: null,
    notes: '',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

export function bill(overrides: Partial<RecurringBill> = {}): RecurringBill {
  return {
    id: 'bill1',
    name: 'Internet',
    amountMinor: 5999,
    currency: 'USD',
    categoryId: 'exp-utilities',
    frequency: 'monthly',
    nextDueDate: '2026-01-31',
    anchorDay: 31,
    endDate: null,
    notes: '',
    status: 'active',
    lastPaidDate: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}
