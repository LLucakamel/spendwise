import { expect, test, type Page } from '@playwright/test'
import { amountOf, go, gotoApp, statCard, today } from './helpers'

/** dd/mm/yyyy for today (the import dialog's default "Day/month/year" order). */
function todayDmy() {
  const [y, m, d] = today().split('-')
  return `${d}/${m}/${y}`
}

/** Renders a plain receipt with large, high-contrast English text to PNG bytes inside the browser. */
async function receiptPng(page: Page, lines: string[]): Promise<Buffer> {
  const bytes = await page.evaluate(async (text) => {
    const canvas = new OffscreenCanvas(900, 120 + text.length * 80)
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = '#000000'
    ctx.font = 'bold 48px Arial, Helvetica, sans-serif'
    ctx.textBaseline = 'top'
    text.forEach((line, i) => ctx.fillText(line, 60, 60 + i * 80))
    const blob = await canvas.convertToBlob({ type: 'image/png' })
    return [...new Uint8Array(await blob.arrayBuffer())]
  }, lines)
  return Buffer.from(bytes)
}

test.describe('income', () => {
  test('records a partial receipt for an expected payment; received and expected update', async ({ page }) => {
    await gotoApp(page, '/income')
    const received = page.getByTestId('income-received')
    const expected = page.getByTestId('income-expected')
    await expect(page.getByText('Received · EGP')).toBeVisible()
    const received0 = await amountOf(received)
    const expected0 = await amountOf(expected)
    // The demo's flat rental (EGP 7,000) is expected this month and hasn't arrived yet.
    expect(expected0).toBeGreaterThanOrEqual(700000)

    const rent = page.locator('#source-demo-inc-rent')
    await expect(rent).toContainText(/EGP\s0\.00 of EGP\s7,000\.00 received/)
    await rent.getByRole('button', { name: 'Mark received' }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toContainText('Record income from “Flat rental income (demo)”')
    await dialog.getByLabel('Amount received (EGP)').fill('2500')
    await expect(dialog).toContainText(/Leave EGP\s4,500\.00 still expected for this payment/)
    await dialog.getByRole('button', { name: 'Record income' }).click()
    await expect(dialog).toBeHidden()

    await expect.poll(() => amountOf(received)).toBe(received0 + 250000)
    await expect.poll(() => amountOf(expected)).toBe(expected0 - 250000)
    await expect(rent).toContainText(/EGP\s2,500\.00 of EGP\s7,000\.00 received/)
    await expect(rent).toContainText(/EGP\s4,500\.00 still expected/)
    // The receipt is a real income transaction in the received list.
    const receivedCard = page.locator('[data-slot="card"]').filter({ hasText: 'Received income' })
    await expect(receivedCard.getByRole('row').filter({ hasText: 'Flat rental income (demo)' }).first()).toContainText('2,500.00')
  })
})

test.describe('accounts', () => {
  test('a transfer between own accounts moves balances but not dashboard income or expenses', async ({ page }) => {
    await gotoApp(page)
    const income = statCard(page, 'Income · EGP')
    const expenses = statCard(page, 'Expenses · EGP')
    await expect(expenses).toBeVisible()
    const income0 = await amountOf(income)
    const expenses0 = await amountOf(expenses)

    await go(page, '/accounts')
    await expect(page.getByRole('heading', { level: 1, name: 'Accounts and cards' })).toBeVisible()
    const balance = (name: string) => page.locator('[data-slot="card"]').filter({ hasText: name }).locator('p').filter({ hasText: 'Recorded balance' }).locator('bdi')
    const bank0 = await amountOf(balance('Nile Bank current account (demo)'))
    const cash0 = await amountOf(balance('Cash wallet'))

    await page.getByRole('button', { name: 'Record transfer' }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByRole('radio', { name: 'Transfer' })).toHaveAttribute('aria-checked', 'true')
    await dialog.getByLabel('Description').fill('E2E move to cash')
    await dialog.getByLabel('Amount', { exact: true }).fill('1234.56')
    await dialog.getByLabel('From account').selectOption('demo-acc-bank')
    await dialog.getByLabel('To account').selectOption('demo-acc-cash')
    await dialog.getByLabel('Date', { exact: true }).fill(today())
    await dialog.getByRole('button', { name: 'Add transaction' }).click()
    await expect(dialog).toBeHidden()

    await expect.poll(() => amountOf(balance('Nile Bank current account (demo)'))).toBe(bank0 - 123456)
    await expect.poll(() => amountOf(balance('Cash wallet'))).toBe(cash0 + 123456)

    await go(page, '/')
    await expect(expenses).toBeVisible()
    expect(await amountOf(statCard(page, 'Income · EGP'))).toBe(income0)
    expect(await amountOf(statCard(page, 'Expenses · EGP'))).toBe(expenses0)
  })

  test('imports a CSV statement, shows the rows in transactions and rolls the import back', async ({ page }) => {
    await gotoApp(page, '/accounts')
    await page.getByRole('button', { name: 'Import statement' }).first().click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toContainText('Import a statement')
    const csv = ['Date,Description,Amount,Reference', `${todayDmy()},E2E Import Coffee Roasters,-123.45,E2E-1`, `${todayDmy()},E2E Import Refund Desk,67.80,E2E-2`].join('\n')
    await dialog.locator('input[type="file"]').setInputFiles({ name: 'e2e-statement.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) })
    await expect(dialog.getByLabel('Import into account')).toHaveValue('demo-acc-bank')
    await expect(dialog.getByText('2 ready · 0 duplicates · 0 with errors')).toBeVisible()
    await expect(dialog.getByRole('row').filter({ hasText: 'E2E Import Coffee Roasters' })).toContainText('−EGP')
    await expect(dialog.getByRole('row').filter({ hasText: 'E2E Import Refund Desk' })).toContainText('+EGP')
    await dialog.getByRole('button', { name: 'Import 2 transactions' }).click()
    await expect(dialog).toBeHidden()
    await expect(page.getByText('Imported 2; 0 were already present.')).toBeVisible()

    const history = page.locator('[data-slot="card"]').filter({ hasText: 'Import history' })
    const batch = history.getByRole('listitem').filter({ hasText: 'e2e-statement.csv' })
    await expect(batch).toContainText('2 imported, 0 duplicates')
    await expect(batch).toContainText('Completed')

    await go(page, '/transactions')
    await page.getByLabel('Search transactions').fill('E2E Import')
    await expect(page.getByTestId('tx-count')).toHaveText(/^2 of/)
    await expect(page.locator('tbody tr').filter({ hasText: 'E2E Import Coffee Roasters' })).toContainText('Imported')

    await go(page, '/accounts')
    await batch.getByRole('button', { name: 'Undo import' }).click()
    await expect(page.getByRole('alertdialog')).toContainText('All 2 transactions created by this import are deleted.')
    await page.getByRole('alertdialog').getByRole('button', { name: 'Undo import' }).click()
    await expect(page.getByRole('alertdialog')).toBeHidden()
    await expect(batch).toContainText('Undone')
    await expect(batch.getByRole('button', { name: 'Undo import' })).toHaveCount(0)

    await go(page, '/transactions')
    await page.getByLabel('Search transactions').fill('E2E Import')
    await expect(page.getByText('No matching transactions')).toBeVisible()
  })
})

test.describe('invoices', () => {
  test('reads a photographed receipt with on-device OCR and saves the reviewed invoice', async ({ page }) => {
    test.setTimeout(240_000)
    const ocrRequests: string[] = []
    page.on('request', (r) => {
      if (r.url().includes('/tesseract/')) ocrRequests.push(r.url())
    })
    await gotoApp(page, '/invoices')
    await page.getByRole('main').getByRole('button', { name: 'Add invoice' }).first().click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toContainText('Add an invoice')
    const png = await receiptPng(page, ['SUNRISE BAKERY', 'Receipt No: R-4471', 'Bread 100.00', 'Milk 23.45', 'TOTAL 123.45'])
    await dialog.locator('input[type="file"]').first().setInputFiles({ name: 'receipt.png', mimeType: 'image/png', buffer: png })
    // Preview step: choose English only (smaller language model), then read.
    await expect(dialog.locator('img')).toBeVisible()
    await dialog.getByLabel('Document language').selectOption('eng')
    await dialog.getByRole('button', { name: 'Read document' }).click()

    const review = dialog.getByText('Review the details')
    const failed = dialog.getByText('The document couldn’t be read.')
    await expect(review.or(failed)).toBeVisible({ timeout: 180_000 })
    // OCR must really run here; a failure would mean the self-hosted engine is broken.
    await expect(failed, `OCR failed; engine requests: ${ocrRequests.join(', ')}`).toHaveCount(0)
    expect(ocrRequests.some((u) => u.includes('/spendwise/tesseract/'))).toBe(true)
    await expect(dialog).toContainText('Read using: Text recognition (on device)')
    await expect(dialog.getByLabel('Total', { exact: true })).toHaveValue('123.45')
    await expect(dialog.getByText(/Read from: “TOTAL 123\.45”/)).toBeVisible()

    // The person reviewing fixes up the merchant before saving.
    await dialog.getByLabel('Merchant or supplier').fill('Sunrise Bakery (E2E OCR)')
    await dialog.getByRole('button', { name: 'Save invoice', exact: true }).click()
    await expect(dialog).toBeHidden()
    await expect(page.getByText('Invoice saved').first()).toBeVisible()
    const row = page.getByRole('main').getByRole('row').filter({ hasText: 'Sunrise Bakery (E2E OCR)' })
    await expect(row).toContainText('123.45')
  })

  test('parses a UBL XML e-invoice directly into reviewable fields and saves it', async ({ page }) => {
    await gotoApp(page, '/invoices')
    await page.getByRole('main').getByRole('button', { name: 'Add invoice' }).first().click()
    const dialog = page.getByRole('dialog')
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:ID>UBL-E2E-42</cbc:ID>
  <cbc:IssueDate>${today()}</cbc:IssueDate>
  <cbc:DocumentCurrencyCode>EUR</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty><cac:Party>
    <cac:PartyName><cbc:Name>E2E Seller GmbH</cbc:Name></cac:PartyName>
    <cac:PostalAddress><cbc:StreetName>Musterstr. 1</cbc:StreetName><cbc:CityName>Berlin</cbc:CityName></cac:PostalAddress>
    <cac:PartyTaxScheme><cbc:CompanyID>DE123456789</cbc:CompanyID></cac:PartyTaxScheme>
  </cac:Party></cac:AccountingSupplierParty>
  <cac:TaxTotal><cbc:TaxAmount currencyID="EUR">19.00</cbc:TaxAmount></cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:TaxExclusiveAmount currencyID="EUR">100.00</cbc:TaxExclusiveAmount>
    <cbc:PayableAmount currencyID="EUR">119.00</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
  <cac:InvoiceLine><cbc:InvoicedQuantity>1</cbc:InvoicedQuantity><cbc:LineExtensionAmount currencyID="EUR">100.00</cbc:LineExtensionAmount><cac:Item><cbc:Name>Consulting</cbc:Name></cac:Item><cac:Price><cbc:PriceAmount currencyID="EUR">100.00</cbc:PriceAmount></cac:Price></cac:InvoiceLine>
</Invoice>`
    await dialog.locator('input[type="file"]').first().setInputFiles({ name: 'e2e-invoice.xml', mimeType: 'application/xml', buffer: Buffer.from(xml) })
    await expect(dialog.getByText('Review the details')).toBeVisible()
    await expect(dialog).toContainText('Read using: UBL XML')
    await expect(dialog.getByLabel('Merchant or supplier')).toHaveValue('E2E Seller GmbH')
    await expect(dialog.getByLabel('Invoice or receipt number')).toHaveValue('UBL-E2E-42')
    await expect(dialog.getByLabel('Tax registration / VAT number')).toHaveValue('DE123456789')
    await expect(dialog.getByLabel('Issue date')).toHaveValue(today())
    await expect(dialog.getByLabel('Currency')).toHaveValue('EUR')
    await expect(dialog.getByLabel('Subtotal')).toHaveValue('100.00')
    await expect(dialog.getByLabel('Tax', { exact: true })).toHaveValue('19.00')
    await expect(dialog.getByLabel('Total', { exact: true })).toHaveValue('119.00')

    await dialog.getByRole('button', { name: 'Save invoice', exact: true }).click()
    await expect(dialog).toBeHidden()
    const row = page.getByRole('main').getByRole('row').filter({ hasText: 'E2E Seller GmbH' })
    await expect(row).toContainText('119.00')
    await row.click()
    await expect(page.getByRole('dialog')).toContainText('UBL-E2E-42')
  })

  test('parses an Egyptian ETA e-receipt JSON', async ({ page }) => {
    await gotoApp(page, '/invoices')
    await page.getByRole('main').getByRole('button', { name: 'Add invoice' }).first().click()
    const dialog = page.getByRole('dialog')
    const json = JSON.stringify({
      receipt: {
        header: { receiptNumber: 'R-E2E-55', dateTimeIssued: `${today()}T08:30:00Z`, currency: 'EGP', uuid: 'E2E-UUID-1' },
        seller: { rin: '999888777', companyTradeName: 'E2E Corner Café' },
        totalSales: 50,
        totalAmount: 57,
        taxTotals: [{ taxType: 'T1', amount: 7 }],
        itemData: [{ description: 'Coffee', quantity: 1, unitPrice: 50, total: 57 }],
      },
    })
    await dialog.locator('input[type="file"]').first().setInputFiles({ name: 'e2e-receipt.json', mimeType: 'application/json', buffer: Buffer.from(json) })
    await expect(dialog.getByText('Review the details')).toBeVisible()
    await expect(dialog).toContainText('Read using: ETA JSON / receipt QR')
    await expect(dialog.getByLabel('Merchant or supplier')).toHaveValue('E2E Corner Café')
    await expect(dialog.getByLabel('Invoice or receipt number')).toHaveValue('R-E2E-55')
    await expect(dialog.getByLabel('Currency')).toHaveValue('EGP')
    await expect(dialog.getByLabel('Tax', { exact: true })).toHaveValue('7.00')
    await expect(dialog.getByLabel('Total', { exact: true })).toHaveValue('57.00')
    await dialog.getByRole('button', { name: 'Save invoice', exact: true }).click()
    await expect(dialog).toBeHidden()
    await expect(page.getByRole('main').getByRole('row').filter({ hasText: 'E2E Corner Café' })).toContainText('57.00')
  })

  test('rejects a file that is not an invoice', async ({ page }) => {
    await gotoApp(page, '/invoices')
    await page.getByRole('main').getByRole('button', { name: 'Add invoice' }).first().click()
    const dialog = page.getByRole('dialog')
    await dialog.locator('input[type="file"]').first().setInputFiles({ name: 'notes.json', mimeType: 'application/json', buffer: Buffer.from('{"hello":"world"}') })
    await expect(dialog.getByRole('alert')).toContainText('This file isn’t a recognised ETA or UBL invoice.')
    await dialog.getByRole('button', { name: 'Enter details by hand' }).click()
    await expect(dialog.getByLabel('Total', { exact: true })).toHaveValue('')
  })
})
