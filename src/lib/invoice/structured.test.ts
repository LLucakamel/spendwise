import { describe, expect, it } from 'vitest'
import { interpretQr, parseEtaDocument, parseUblInvoice, parseZatcaQr } from './structured'

// All documents below are synthetic fixtures with fictional names and numbers.

function tlv(fields: [number, string][]): string {
  const encoder = new TextEncoder()
  const bytes: number[] = []
  for (const [tag, value] of fields) {
    const v = encoder.encode(value)
    bytes.push(tag, v.length, ...v)
  }
  return btoa(String.fromCharCode(...bytes))
}

describe('parseEtaDocument', () => {
  it('reads an ETA e-invoice with case-insensitive keys', () => {
    const doc = parseEtaDocument({
      issuer: { name: 'Fictional Supplies Co', id: '100200300', address: { street: 'Tahrir St', regionCity: 'Cairo' } },
      internalID: 'INV-7',
      dateTimeIssued: '2026-03-01T10:00:00Z',
      totalSalesAmount: 100,
      totalDiscountAmount: 0,
      taxTotals: [{ taxType: 'T1', amount: 14 }],
      totalAmount: '114.00',
      uuid: 'ABC123',
      invoiceLines: [{ description: 'Paper', quantity: 2, unitValue: { amountEGP: 50 }, total: 114 }],
    })
    expect(doc).toMatchObject({
      format: 'eta-json',
      kind: 'e-invoice',
      merchant: 'Fictional Supplies Co',
      merchantTaxId: '100200300',
      invoiceNumber: 'INV-7',
      issueDate: '2026-03-01',
      currency: 'EGP',
      subtotalMinor: 10000,
      taxMinor: 1400,
      totalMinor: 11400,
      uuid: 'ABC123',
    })
    expect(doc?.taxLines[0]).toMatchObject({ label: 'VAT', amountMinor: 1400 })
    expect(doc?.lines[0]).toMatchObject({ description: 'Paper', unitPriceMinor: 5000 })
  })

  it('reads an ETA e-receipt inside a receipt envelope', () => {
    const doc = parseEtaDocument({
      receipt: {
        header: { receiptNumber: 'R-55', dateTimeIssued: '2026-02-10T08:30:00Z', currency: 'EGP', uuid: 'U1' },
        seller: { rin: '999888777', companyTradeName: 'Corner Café (fictional)' },
        totalSales: 50,
        totalAmount: 57,
        taxTotals: [{ taxType: 'T1', amount: 7 }],
        itemData: [{ description: 'Coffee', quantity: 1, unitPrice: 50, total: 57 }],
      },
    })
    expect(doc).toMatchObject({ kind: 'e-receipt', merchant: 'Corner Café (fictional)', invoiceNumber: 'R-55', totalMinor: 5700, taxMinor: 700, issueDate: '2026-02-10' })
  })

  it('returns null for unrelated JSON', () => {
    expect(parseEtaDocument({ hello: 'world' })).toBeNull()
    expect(parseEtaDocument(null)).toBeNull()
  })
})

describe('parseUblInvoice', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:ID>UBL-42</cbc:ID>
  <cbc:IssueDate>2026-04-02</cbc:IssueDate>
  <cbc:DueDate>2026-05-02</cbc:DueDate>
  <cbc:DocumentCurrencyCode>EUR</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty><cac:Party>
    <cac:PartyName><cbc:Name>Example Seller GmbH</cbc:Name></cac:PartyName>
    <cac:PostalAddress><cbc:StreetName>Musterstr. 1</cbc:StreetName><cbc:CityName>Berlin</cbc:CityName></cac:PostalAddress>
    <cac:PartyTaxScheme><cbc:CompanyID>DE123456789</cbc:CompanyID></cac:PartyTaxScheme>
  </cac:Party></cac:AccountingSupplierParty>
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="EUR">19.00</cbc:TaxAmount>
    <cac:TaxSubtotal><cbc:TaxAmount currencyID="EUR">19.00</cbc:TaxAmount><cac:TaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>19</cbc:Percent></cac:TaxCategory></cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="EUR">100.00</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="EUR">100.00</cbc:TaxExclusiveAmount>
    <cbc:PayableAmount currencyID="EUR">119.00</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
  <cac:InvoiceLine><cbc:InvoicedQuantity>1</cbc:InvoicedQuantity><cbc:LineExtensionAmount currencyID="EUR">100.00</cbc:LineExtensionAmount><cac:Item><cbc:Name>Consulting</cbc:Name></cac:Item><cac:Price><cbc:PriceAmount currencyID="EUR">100.00</cbc:PriceAmount></cac:Price></cac:InvoiceLine>
</Invoice>`

  it('reads supplier, dates, totals, tax and lines', () => {
    expect(parseUblInvoice(xml)).toMatchObject({
      format: 'ubl-xml',
      merchant: 'Example Seller GmbH',
      merchantTaxId: 'DE123456789',
      merchantAddress: 'Musterstr. 1, Berlin',
      invoiceNumber: 'UBL-42',
      issueDate: '2026-04-02',
      dueDate: '2026-05-02',
      currency: 'EUR',
      subtotalMinor: 10000,
      taxMinor: 1900,
      totalMinor: 11900,
      taxLines: [{ label: 'VAT S', rate: '19', amountMinor: 1900 }],
      lines: [{ description: 'Consulting', quantity: '1', unitPriceMinor: 10000, totalMinor: 10000 }],
    })
  })

  it('rejects malformed or non-invoice XML', () => {
    expect(parseUblInvoice('<not-closed>')).toBeNull()
    expect(parseUblInvoice('<Order/>')).toBeNull()
  })
})

describe('QR codes', () => {
  it('decodes a ZATCA TLV payload including Arabic text', () => {
    const payload = tlv([
      [1, 'متجر تجريبي'],
      [2, '300000000000003'],
      [3, '2026-01-15T12:00:00Z'],
      [4, '115.00'],
      [5, '15.00'],
    ])
    expect(parseZatcaQr(payload)).toMatchObject({ merchant: 'متجر تجريبي', merchantTaxId: '300000000000003', issueDate: '2026-01-15', currency: 'SAR', totalMinor: 11500, taxMinor: 1500 })
    expect(interpretQr(payload).kind).toBe('zatca')
  })

  it('rejects truncated TLV', () => {
    expect(parseZatcaQr(btoa(String.fromCharCode(1, 10, 65)))).toBeNull()
  })

  it('reads values from an ETA receipt link without fetching it', () => {
    const qr = interpretQr('https://invoicing.eta.gov.eg/receipts/search/UUID123ABCDEFGHIJKLMNOP/share/2026-03-05T10:00:00Z#Total:57.00,IssuerRIN:999888777')
    expect(qr.kind).toBe('eta-link')
    expect(qr.uuid).toBe('UUID123ABCDEFGHIJKLMNOP')
    expect(qr.invoice).toMatchObject({ totalMinor: 5700, merchantTaxId: '999888777', issueDate: '2026-03-05' })
  })

  it('classifies other links and plain text', () => {
    expect(interpretQr('https://example.com/x').kind).toBe('url')
    expect(interpretQr('hello world').kind).toBe('text')
  })
})
