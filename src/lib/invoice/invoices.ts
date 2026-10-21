import type { Invoice, IsoDate, Transaction } from '@/domain/types'
import { daysUntil } from '../recurring'
import { addMinor } from '../money'

export type DuplicateReason = 'same-file' | 'same-number' | 'same-amount-date'

export interface DuplicateMatch {
  invoice: Invoice
  reason: DuplicateReason
}

const norm = (s: string) => s.trim().toLocaleLowerCase().replace(/\s+/g, ' ')

/** Existing invoices that look like the same document. Shown as warnings, never auto-removed. */
export function findDuplicateInvoices(
  candidate: Pick<Invoice, 'merchant' | 'merchantTaxId' | 'invoiceNumber' | 'issueDate' | 'totalMinor' | 'currency'> & { sha256?: string | null; id?: string },
  existing: readonly Invoice[],
): DuplicateMatch[] {
  const matches: DuplicateMatch[] = []
  for (const inv of existing) {
    if (candidate.id && inv.id === candidate.id) continue
    if (candidate.sha256 && inv.file?.sha256 === candidate.sha256) {
      matches.push({ invoice: inv, reason: 'same-file' })
      continue
    }
    const sameIssuer =
      (candidate.merchantTaxId && norm(candidate.merchantTaxId) === norm(inv.merchantTaxId)) ||
      (candidate.merchant && norm(candidate.merchant) === norm(inv.merchant))
    if (sameIssuer && candidate.invoiceNumber && norm(candidate.invoiceNumber) === norm(inv.invoiceNumber)) {
      matches.push({ invoice: inv, reason: 'same-number' })
      continue
    }
    if (
      candidate.issueDate &&
      inv.issueDate === candidate.issueDate &&
      inv.totalMinor === candidate.totalMinor &&
      inv.currency === candidate.currency &&
      (!candidate.merchant || !inv.merchant || norm(candidate.merchant) === norm(inv.merchant))
    ) {
      matches.push({ invoice: inv, reason: 'same-amount-date' })
    }
  }
  return matches
}

/** Payments confirmed for an invoice = linked transactions (expenses) in the invoice currency. */
export function paidAmount(invoice: Invoice, transactions: readonly Transaction[]): number {
  const linked = new Set(invoice.linkedTransactionIds)
  return transactions
    .filter((t) => linked.has(t.id) && t.type === 'expense' && t.currency === invoice.currency)
    .reduce((sum, t) => addMinor(sum, t.amountMinor), 0)
}

export type InvoicePaymentState = 'paid' | 'partially-paid' | 'unpaid' | 'overdue' | 'cancelled'

/**
 * Display state: confirmed by linked payments where possible. A stated "paid" without linked
 * payments stays "paid (stated)" — the UI shows the difference.
 */
export function invoicePaymentState(invoice: Invoice, transactions: readonly Transaction[], today: IsoDate): { state: InvoicePaymentState; paidMinor: number; confirmed: boolean } {
  if (invoice.status === 'cancelled') return { state: 'cancelled', paidMinor: 0, confirmed: false }
  const paid = paidAmount(invoice, transactions)
  if (paid >= invoice.totalMinor && invoice.totalMinor > 0) return { state: 'paid', paidMinor: paid, confirmed: true }
  if (paid > 0) return { state: 'partially-paid', paidMinor: paid, confirmed: true }
  if (invoice.status === 'paid') return { state: 'paid', paidMinor: 0, confirmed: false }
  if (invoice.status === 'partially-paid') return { state: 'partially-paid', paidMinor: 0, confirmed: false }
  if (invoice.dueDate && daysUntil(invoice.dueDate, today) < 0) return { state: 'overdue', paidMinor: 0, confirmed: false }
  return { state: 'unpaid', paidMinor: 0, confirmed: false }
}

export interface MatchSuggestion {
  transaction: Transaction
  score: number
  reasons: ('amount' | 'date' | 'merchant')[]
}

/**
 * Suggests expenses that may be the payment of an invoice. Suggestions are never applied
 * automatically — the user confirms each link.
 */
export function suggestInvoiceMatches(invoice: Invoice, transactions: readonly Transaction[], alreadyLinkedElsewhere: ReadonlySet<string>): MatchSuggestion[] {
  const merchantWords = norm(invoice.merchant)
    .split(' ')
    .filter((w) => w.length >= 4)
  const suggestions: MatchSuggestion[] = []
  for (const t of transactions) {
    if (t.type !== 'expense' || t.currency !== invoice.currency) continue
    if (invoice.linkedTransactionIds.includes(t.id) || alreadyLinkedElsewhere.has(t.id)) continue
    const reasons: MatchSuggestion['reasons'] = []
    let score = 0
    if (t.amountMinor === invoice.totalMinor) {
      reasons.push('amount')
      score += 3
    }
    const anchor = invoice.issueDate
    if (anchor) {
      const days = Math.abs(daysUntil(t.date, anchor))
      if (days <= 7) {
        reasons.push('date')
        score += days <= 1 ? 2 : 1
      }
    }
    const description = norm(t.description)
    if (merchantWords.some((w) => description.includes(w))) {
      reasons.push('merchant')
      score += 2
    }
    if (reasons.includes('amount') && score >= 4) suggestions.push({ transaction: t, score, reasons })
  }
  return suggestions.sort((a, b) => b.score - a.score).slice(0, 5)
}

/** Tax totals per currency and label over a set of invoices. */
export function taxSummary(invoices: readonly Invoice[]): { currency: string; label: string; amountMinor: number; count: number }[] {
  const map = new Map<string, { currency: string; label: string; amountMinor: number; count: number }>()
  for (const inv of invoices) {
    if (inv.status === 'cancelled') continue
    const lines = inv.taxLines.length ? inv.taxLines : inv.taxMinor ? [{ label: 'Tax', rate: '', amountMinor: inv.taxMinor }] : []
    for (const line of lines) {
      const key = `${inv.currency}|${line.label}`
      const entry = map.get(key) ?? { currency: inv.currency, label: line.label, amountMinor: 0, count: 0 }
      entry.amountMinor = addMinor(entry.amountMinor, line.amountMinor)
      entry.count += 1
      map.set(key, entry)
    }
  }
  return [...map.values()].sort((a, b) => a.currency.localeCompare(b.currency) || b.amountMinor - a.amountMinor)
}

/** Spending per merchant and currency from invoices (cancelled ones excluded). */
export function merchantSummary(invoices: readonly Invoice[]): { merchant: string; currency: string; totalMinor: number; count: number }[] {
  const map = new Map<string, { merchant: string; currency: string; totalMinor: number; count: number }>()
  for (const inv of invoices) {
    if (inv.status === 'cancelled' || !inv.merchant.trim()) continue
    const key = `${norm(inv.merchant)}|${inv.currency}`
    const entry = map.get(key) ?? { merchant: inv.merchant.trim(), currency: inv.currency, totalMinor: 0, count: 0 }
    entry.totalMinor = addMinor(entry.totalMinor, inv.totalMinor)
    entry.count += 1
    map.set(key, entry)
  }
  return [...map.values()].sort((a, b) => b.count - a.count || b.totalMinor - a.totalMinor)
}
