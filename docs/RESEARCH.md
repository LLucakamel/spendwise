# SpendWise: Integration Research (Egypt, e-invoicing, payments, OCR)

- **Date of research:** 2026-10-21
- **Scope:** SpendWise is a static React app on GitHub Pages with Firebase (Auth / Firestore / optional Storage) and **no custom backend**.
- **Method:** Official sources only, read with WebFetch or WebSearch on 2026-10-21. Each claim cites the URL that was read. Anything that could not be read from an official source is marked **not confirmed**.
- **Credentials:** None are available. Nothing in this document was tested against a live API.

Legend: **[C]** confirmed from the cited official page · **[NC]** not confirmed · **[I]** inference or analysis by the author, not a vendor statement.

---

## 1. Egyptian Tax Authority (ETA): e-invoicing and e-receipts

Root SDK: https://sdk.invoicing.eta.gov.eg/ (sections: API, Types, Codes, Integration Toolkit, FAQ, "APIs Governance & Rate Limiting").
Portal: https://invoicing.eta.gov.eg/ is a JavaScript single-page app, and its content could not be read with a fetcher **[NC]** for any portal-specific behaviour.

> Naming caveat **[C]**: both the invoice and receipt structure pages say that the description "defines the data structure while actual attribute naming could be different for JSON (and XML) data structures."
> **Recommendation [I]:** match keys case-insensitively, for example `internalId` and `internalID`.

### 1.1 E-invoice document v1.0 (`documentType = "i"`, `documentTypeVersion = "1.0"`)

Source: https://sdk.invoicing.eta.gov.eg/documents/invoice-v1-0/ **[C]**

**Top-level `document`**

| Field | Req. | Notes |
|---|---|---|
| `issuer` | M | object |
| `receiver` | M | object |
| `documentType` | M | `i` for invoice. Other type names seen in the API: `c`, `d`, `ii`, `ei`, `ec`, `ed` (see 1.5) |
| `documentTypeVersion` | M | `1.0` |
| `dateTimeIssued` | M | UTC, for example `2015-02-13T13:15:00Z`. It cannot be in the future |
| `taxpayerActivityCode` | M | code from `/codes/activity-types/` |
| `internalId` | M | written `internalId` on the SDK page. The Search API parameter is spelled `internalID` |
| `purchaseOrderReference`, `purchaseOrderDescription`, `salesOrderReference`, `salesOrderDescription`, `proformaInvoiceNumber` | O | |
| `payment` | O | `bankName`, `bankAddress`, `bankAccountNo`, `bankAccountIBAN`, `swiftCode`, `terms` |
| `delivery` | O | `approach`, `packaging`, `dateValidity`, `exportPort`, `countryOfOrigin`, `grossWeight`, `netWeight`, `terms` |
| `serviceDeliveryDate` | O | |
| `invoiceLines` | M | at least 1 |
| `totalSalesAmount` | M | |
| `totalDiscountAmount` | M | |
| `netAmount` | M | |
| `taxTotals` | M | array of `{ taxType, amount }` |
| `extraDiscountAmount` | M | |
| `totalItemsDiscountAmount` | M | |
| `totalAmount` | M | |
| `signatures` | M | array of `{ type, value }`. `type` `I` (issuer) is mandatory, `S` is optional |

**`issuer`** (M): `type`, `id`, `name`, `address`.
`type` values: `B` = business in Egypt, `P` = natural person, `F` = foreigner (the page marks P and F "reserved for future use" for the issuer). `id` is the registration number for a `B` issuer.

**`receiver`** (M): `type` (`B` / `P` / `F`), `id`, `name`, `address`.
`id`, `name` and `address` are optional for a natural-person buyer below a threshold amount.

**`address`** (issuer and receiver):
- Mandatory: `country`, `governate` (spelled this way), `regionCity`, `street`, `buildingNumber`.
- Issuer only: `branchId`, which is mandatory when the issuer type is `B`.
- Optional: `postalCode`, `floor`, `room`, `landmark`, `additionalInformation`.

**`invoiceLines[]`**

| Field | Req. |
|---|---|
| `description` | M |
| `itemType` | M |
| `itemCode` | M |
| `unitType` | M |
| `quantity` | M |
| `internalCode` | O |
| `salesTotal` | M |
| `total` | M |
| `valueDifference` | M |
| `totalTaxableFees` | M |
| `netTotal` | M |
| `itemsDiscount` | M |
| `unitValue` | M: `currencySold` (M), `amountEGP` (M), `amountSold` and `currencyExchangeRate` (required when the currency is not EGP) |
| `discount` | O: `rate`, `amount` |
| `taxableItems[]` | O: `taxType`, `amount`, `subType`, `rate` |

The SDK page provides **no JSON sample** **[C]**. Use field tables only.

### 1.2 E-receipt (B2C) document, receipt v1.2

Source: https://sdk.invoicing.eta.gov.eg/documents/receipt-v1-2/ **[C]** (v1.0 and v1.1 pages also exist: `/documents/receipt-v1-0/`, `/documents/receipt-v1-1/`).

**Top level**

| Field | Req. | Notes |
|---|---|---|
| `header` | M | |
| `documentType` | M | `{ receiptType (M), typeVersion (M) }` |
| `seller` | M | |
| `buyer` | M | |
| `itemData[]` | M | |
| `totalSales` | M | |
| `totalCommercialDiscount` | O | |
| `totalItemsDiscount` | O | |
| `extraReceiptDiscountData[]` | O | array of `discount` |
| `netAmount` | M | |
| `feesAmount` | O | reserved, zero only |
| `totalAmount` | M | |
| `taxTotals[]` | O | `{ taxType (M), amount (M) }` |
| `paymentMethod` | M | codes in 1.3 |
| `adjustment` | O | reserved, zero only |
| `contractor` | O | `{ name, amount, rate }` |
| `beneficiary` | O | `{ amount, rate }` |

**`header`**
- Mandatory: `dateTimeIssued`, `receiptNumber`, `uuid`, `previousUUID`, `currency`.
- Mandatory if the currency is not EGP: `exchangeRate`.
- Optional: `referenceOldUUID`, `sOrderNameCode`, `orderdeliveryMode`, `grossWeight`, `netWeight`.

**`seller`**
- Mandatory: `rin`, `companyTradeName`, `branchCode`, `branchAddress`, `deviceSerialNumber`, `activityCode`.
- Optional: `syndicateLicenseNumber`.
- `branchAddress` uses the same fields as the invoice address: `country`, `governate`, `regionCity`, `street`, `buildingNumber`, plus optional `postalCode`, `floor`, `room`, `landmark`, `additionalInformation`.

**`buyer`**
- Mandatory: `type` (`B` / `P` / `F`).
- Conditional: `id` and `name`. They are required when the type is `B`, or when the type is `P` and `totalAmount` ≥ 150,000 EGP.
- Optional: `mobileNumber`, `paymentNumber`.

**`itemData[]`**
- Mandatory: `internalCode`, `description`, `itemType`, `itemCode`, `unitType`, `quantity`, `unitPrice`, `netSale`, `totalSale`, `total`.
- Optional: `commercialDiscountData[]`, `itemDiscountData[]`, `additionalCommercialDiscount`, `additionalItemDiscount`, `valueDifference`, `taxableItems[]`.
- `discount` is `{ amount (M), description (M), rate (O) }`.
- `taxableItem` is `{ taxType (M), amount (M), subType (M), rate (O) }`.

**Receipt as returned by the Get Receipt Details API** **[C]**

- **Envelope** (`ReceiptDetails`): `submissionUUID`, `dateTimeReceived`, `dateTimeIssued`, `submissionChannel`, `maxPrecision`, `receipt`.
- **`receipt` summary** is flattened, so there is no `header` object:
  - `uuid`, `longId`, `previousUUID`, `referenceOldUUID`, `referenceUUID`
  - `dateTimeIssued`, `dateTimeReceived`, `receiptNumber`, `currency`, `exchangeRate`
  - `sOrderNameCode`, `orderdeliveryMode`, `grossWeight`, `netWeight`
  - `documentType`, `totalSales`, `totalAmount`, `totalCommercialDiscount`, `totalItemsDiscount`, `netAmount`, `feesAmount`, `paymentMethod`, `adjustment`
  - `seller`, `buyer`, `contractor`, `beneficiary`
  - `itemData`, `extraReceiptDiscountData`, `taxTotals`
  - `status`, `statusReason`, `hasReturnReceipts`, `returnReceipts`, `history`
- The details call "doesn't return the original JSON submission."

Source: https://sdk.invoicing.eta.gov.eg/ereceiptapi/03-get-receipt-details/

**[I]** A parser should therefore accept both shapes: the submitted shape, where the date and number sit under `header`, and the details shape, where they are flattened.

### 1.3 Code tables

Index: https://sdk.invoicing.eta.gov.eg/codes/ **[C]**. Tables available:
- activity types
- branches
- countries
- currencies
- delivery modes
- payment methods
- return reasons
- tax types (with subtypes)
- unit types
- weight unit types

**Tax types** (https://sdk.invoicing.eta.gov.eg/codes/tax-types/) **[C]**

| Code | Description | Group |
|---|---|---|
| **T1** | Value added tax | taxable |
| T2 | Table tax (percentage) | taxable |
| T3 | Table tax (Fixed Amount) | taxable |
| T4 | Withholding tax (WHT) | taxable |
| T5 | Stamping tax (percentage) | taxable |
| T6 | Stamping Tax (amount) | taxable |
| T7 | Entertainment tax | taxable |
| T8 | Resource development fee | taxable |
| T9 | Service charges | taxable |
| T10 | Municipality Fees | taxable |
| T11 | Medical insurance fee | taxable |
| T12 | Other fees | taxable |
| T13 | Stamping tax (percentage) | non-taxable |
| T14 | Stamping Tax (amount) | non-taxable |
| T15 | Entertainment tax | non-taxable |
| T16 | Resource development fee | non-taxable |
| T17 | Service charges | non-taxable |
| T18 | Municipality Fees | non-taxable |
| T19 | Medical insurance fee | non-taxable |
| T20 | Other fees | non-taxable |

**T1 (VAT) subtypes:**
- V001 Export
- V002 Export to free areas and other areas
- V003 Exempted good or service
- V004 A non-taxable good or service
- V005 Exemptions for diplomats, consulates and embassies
- V006 Defence and National security Exemptions
- V007 Agreements exemptions
- V008 Special Exemptions and other reasons
- V009 General Item sales
- V010 Other Rates

**Receipt payment methods** (https://sdk.invoicing.eta.gov.eg/codes/payment-methods/) **[C]**:
- `C` Cash
- `V` Visa
- `CC` Cash with contractor
- `VC` Visa with contractor
- `VO` Vouchers
- `PR` Promotion
- `GC` Gift Card
- `P` Points
- `O` Others

### 1.4 QR code content (e-receipt)

Source: Receipt Issuance FAQ, https://sdk.invoicing.eta.gov.eg/receiptissuancefaq/ **[C]**

- "This QR code represents a URL to the receipt details in the eInvoicing portal."
- URL format: `{eInvoicingPortalURL}/receipts/search/{UUID}/share/{ReceiptDateAndTime}`. The date-time is the issuance time in UTC.
- Full QR content: `{URL}#Total:{Total},IssuerRIN:{Registration Number}`. `Total` is the receipt total amount, and `IssuerRIN` is the seller's registration number.
- The FAQ text read does **not** state the concrete portal base URL **[NC]**. **[I]** It is presumably `https://invoicing.eta.gov.eg`, but treat this as unverified and parse the host from the scanned string rather than hard-coding it.
- The Toolkit QR API (https://sdk.invoicing.eta.gov.eg/toolkitapi/05-qrcode/) "will use receipt's key fields to generate the QR code" and returns `qrCode` (the URL) and `qrCodeImageBase64`. It does not list the fields beyond requiring the UUID **[C]**.
- **E-invoice (B2B) QR:** no official page read defines a QR format for e-invoices **[NC]**. The `longId` field is described as a "unique long temporary Id that can be used to query document data anonymously" (https://sdk.invoicing.eta.gov.eg/einvoicingapi/11-get-document-details/), but no public share-URL format for invoices was found **[NC]**.

**[I] Implementable in SpendWise without credentials:** scan the QR locally, then parse `uuid`, `dateTimeIssued` (from the path) and `Total` and `IssuerRIN` (from the fragment). This pre-fills date, amount and merchant ID. Offer a **link-out** to the scanned URL so the user can view the receipt on the official portal.

### 1.5 APIs: who can call what

Authentication is OAuth 2.0 **client credentials** against the Identity Service: `POST /connect/token` with `grant_type=client_credentials`.

| Caller type | Credentials | Extra headers | Source |
|---|---|---|---|
| ERP | Basic auth from the ERP system's issued Client ID and Client Secret. Optional scope `InvoicingAPI`. Token lifetime 1 hour. | Intermediaries add `onbehalfof` | https://sdk.invoicing.eta.gov.eg/api/01-login-as-taxpayer-system/ **[C]** |
| POS (e-receipts) | `client_id`, `client_secret` | `posserial`, `pososversion`, `posmodelframework`, `presharedkey` | https://sdk.invoicing.eta.gov.eg/ereceiptapi/01-authenticate-pos/ **[C]** |

- The e-receipt APIs are available "only to relevant taxpayer POS systems" **[C]**.
- The Identity Service host name was **not stated** on the pages read **[NC]**.
- **Onboarding** (https://sdk.invoicing.eta.gov.eg/start/) **[C]**:
  1. Register a digital taxpayer profile with ETA.
  2. Register the taxpayer administrator.
  3. Register ERP or POS systems.
  4. Obtain API credentials.
  5. Obtain an eSeal X.509 certificate for signing.

  **There is no consumer or third-party-app onboarding path.**

**E-invoicing document APIs**

| API | Path | Access |
|---|---|---|
| Get Document | `GET /api/v1.0/documents/{uuid}/raw` | Issuer: any status. Receiver: Valid, Rejected or Cancelled only. HTTP 403 if the profile has the "B2B Deny ERP Document Retrieval" tag. Source: https://sdk.invoicing.eta.gov.eg/einvoicingapi/08-get-document/ **[C]** |
| Get Document Details | `GET /api/v1.0/documents/{uuid}/details` | Same rules. Source: https://sdk.invoicing.eta.gov.eg/einvoicingapi/11-get-document-details/ **[C]** |
| Search Documents | `GET /api/v1.0/documents/search` | Authenticated. Results cover the caller's sent or received documents. Date range limit currently 30 days. Rate limit "1 Request every 2 Seconds" per taxpayer. `pageSize` default 100. Source: https://sdk.invoicing.eta.gov.eg/einvoicingapi/16-search-documents/ **[C]** |

Full list: https://sdk.invoicing.eta.gov.eg/einvoicingapi/
- Submit, Cancel, Reject
- Get Recent Documents, Search Documents
- Document Package (request, list, get)
- Get Document, Get Submission, Get Printout, Get Details
- Decline cancellation or rejection
- Notifications

**[C] Conclusion:** the document search and get APIs are only for the **issuing or receiving taxpayer** using its registered ERP credentials.

**E-receipt APIs**

Full list: https://sdk.invoicing.eta.gov.eg/ereceiptapi/
- Authenticate POS, Submit, Get Receipt Details, Get Receipt
- **Get Receipt Details Anonymously**
- Get Submission, Search Receipts, Get Recent Receipts
- Receipt Package (request, list, get)
- Notifications

- **Get Receipt Details** (`GET /api/v1/receipts/{uuid}/details`): issuer sees Valid and Cancelled receipts, receiver sees Valid only. It is an authenticated call **[C]**.
- **Get Receipt Details Anonymously** (`GET /api/v1/receipts/{uuid}/share?dateTimeIssued={dateTimeIssued}`), source https://sdk.invoicing.eta.gov.eg/ereceiptapi/05-get-receipt-details-anonymously/ **[C]**:
  - The page says it "does not require any additional authentication and authorization of the caller", but that callers still send the "standard eInvoicing & eReceipt API header parameters".
  - The page also contains the sentence "Receiver of the receipts can retrieve receipts that are in valid status only."
  - Response type: `ReceiptDetails` (JSON).
  - **[NC]** API host, whether a bearer token is still needed in the standard headers, CORS support for browser calls, and rate limits are all not confirmed. **[I]** Do not build on this endpoint from the browser until it is verified. The QR link-out is the safe path.

**Public consumer verification API:** none confirmed **[NC]**. The only consumer-facing mechanism that is documented is the QR URL to the portal "share" page.

---

## 2. InstaPay (Egypt)

- **Official site** https://www.instapay.eg/ **[C]**:
  - "InstaPay is an app that allows direct access to all your bank accounts". Footer: "InstaPay by EBC".
  - Features: transfers to mobile number, IPA, account, wallet or card; collect requests; bill payment; donations; "Balance Inquiry and Mini-Statement".
  - Fees from 1 April 2025: transfers "0.1% from transaction value, minimum EGP 0.50, maximum EGP 20". Balance or mini-statement inquiries cost EGP 0.50 each, with 10 free per month.
  - Limits: EGP 70,000 per transaction, EGP 120,000 per day per bank, EGP 400,000 per month per bank.
  - **No API, developer, third-party or statement-export feature is mentioned.**
- **Personal transaction-history API for third-party apps:** none found **[NC]**. ipn.eg returned a rejection page and alexbank.com returned HTTP 403, so they could not be read.
- **Merchant collection:** offered through licensed PSPs. Example: Kashier's InstaPay API (https://developers.kashier.io/docs/accept-payments/instapay) **[C]** supports `GENERATE_QR` and `INITIATE_R2P` (request-to-pay), with refund and cancel. It is merchant-authenticated (`Kashier-Hash` header, `merchantId`) and exposes **no consumer account history**.
- **User data export:** none documented on the official site **[NC]**. Users must rely on their **bank's** statement.

## 3. Vodafone Cash (Egypt)

- **Official page** https://web.vodafone.com.eg/en/vodafone-cash **[C]**: no transaction-history export, API or developer program is mentioned. Fees are in a downloadable "service guide".
- **Personal history API:** none found **[NC]**.
- **Statement export:** not documented **[NC]**.
- **Merchant acceptance:** via gateways. Paymob lists "Vodafone Cash, Orange Cash, e& money, We Pay" as Egyptian wallet methods (https://developers.paymob.com/paymob-docs) **[C]**. A direct Vodafone merchant API was **not confirmed** **[NC]**.

## 4. Egyptian banks and open banking

- **CBE open-banking or account-information (AIS) framework for third-party consumer apps:** **not confirmed**.
  - cbe.org.eg pages returned "Request Rejected" to the fetcher. The PDF and news pages could not be read.
  - Search results from cbe.org.eg did not surface any open-banking regulation.
  - A search summary of the CBE "Rules for Licensing and Registration of Payment System Operators and Payment Service Providers" suggested that payment account information services are referenced, but this could **not** be verified from the document itself **[NC]**.
  - Third-party trackers (non-official) describe CBE open banking as "under development".
  - **[I]** As of 2026-10-21, there is no confirmed public AIS API that SpendWise could use.
- **Statement export formats:**
  - CIB personal e-statement pages (https://www.cibeg.com/en/personal/ways-to-bank/electoronic-statement) render client-side and returned no readable text.
  - A search-indexed snippet of that page says e-statements can be downloaded "in Word, PDF, or Excel". Treat this as **[NC]** because the page body was not read.
  - NBE and Banque Misr: nothing official read **[NC]**.
  - **[I]** Plan for **PDF (most common) and CSV/XLSX** imports with a user-mapped column template, and expect password-protected PDFs.

## 5. Payment gateways in Egypt (Paymob, Fawry, Kashier)

| Gateway | Purpose | Auth | Consumer history? |
|---|---|---|---|
| Paymob | "Paymob helps businesses accept online and in-person payments" (https://developers.paymob.com/paymob-docs) **[C]**. Methods include cards, wallets, Apple Pay and Google Pay, and BNPL. Payouts are listed under "Beyond Payments". | "API Secret Key and Public Key". "Every SDK payment starts from your backend by calling the Intention Creation API" (https://developers.paymob.com/paymob-docs/integration-paths/mobile-sdks) **[C]** | Not offered **[C]** (none mentioned) |
| Fawry (FawryPay) | Merchant reference-number and charge APIs. Merchant code is "provided by FawryPay team during the account setup". Requests use a SHA-256 signature over fields plus the merchant **secure key**, for "a fully functional server to server integration" (https://developer.fawrystaging.com/docs/server-apis/create-payment-refno-apis) **[C]** | Merchant secure key, server-side **[I]** | Not offered **[C]** |
| Kashier | InstaPay QR and R2P collection (Section 2) **[C]** | Merchant hash | Not offered **[C]** |

**[I] Conclusion:** all three are **merchant collection** APIs that need a merchant contract and a server-held secret. None exposes a consumer's personal account history. They are not useful for SpendWise's expense tracking.

---

## 6. PayPal

**Transaction Search API** (`GET /v1/reporting/transactions`, plus `/v1/reporting/balances`)

Source: the official OpenAPI spec, https://raw.githubusercontent.com/paypal/paypal-rest-api-specifications/main/openapi/reporting_transactions_v1.json, and the reference index https://developer.paypal.com/docs/api/transaction-search/v1/ **[C]**:
- "It takes a maximum of three hours for executed transactions to appear in the list transactions call."
- "This call lists transaction for the previous three years."
- `start_date` and `end_date` are required. "The maximum supported range is 31 days."
- `page_size` maximum is 500 (default 100).
- OAuth scope: `https://uri.paypal.com/services/reporting/search/read`.

**Authentication** (https://developer.paypal.com/api/rest/) **[C]**:
- "PayPal integrations use a client ID and client secret to authenticate API calls". Call `POST /v1/oauth2/token` with `grant_type=client_credentials` and "Keep this secret safe".
- A Business account is needed to "Go live with integrations".
- **[I]** A client-credentials token gives access to **the app owner's own account**. Calling it from a static site would expose the secret, so a backend is required.
- Whether a third-party app can read **another (personal) user's** transactions through this API: **not confirmed** **[NC]**.

**Log in with PayPal** (https://developer.paypal.com/docs/log-in-with-paypal/integrate/reference/) **[C]**

| Scope | Returns |
|---|---|
| `openid` | none (basic authentication) |
| `profile` | full name |
| `email` | email address |
| `address` | street, city, state, country, zip |
| `https://uri.paypal.com/services/paypalattributes` | account verification status, payer ID |

- **No transaction-history scope is listed.**
- Code exchange is `POST /v1/oauth2/token` with `grant_type=authorization_code` and Basic auth using the client ID and **secret** (https://developer.paypal.com/docs/log-in-with-paypal/integrate/) **[C]**.
- Production use requires app review, which "usually" takes several weeks **[C]**.

**Webhooks** **[C]**:
- "Webhooks are HTTPS posts from PayPal to an endpoint on your server" (https://developer.paypal.com/api/rest/webhooks/).
- Verification option 1: post back to `/v1/notifications/verify-webhook-signature` with a bearer token.
- Verification option 2: self-verify. Read the headers `paypal-transmission-id`, `paypal-transmission-time`, `paypal-transmission-sig` and `paypal-cert-url`. Compute CRC32 of the raw body. Build `transmissionId|timeStamp|webhookId|crc32`. Verify it with the certificate (SHA256withRSA). Source: https://developer.paypal.com/api/rest/webhooks/rest/

**Personal activity download** (https://www.paypal.com/us/cshelp/article/how-do-i-view-and-download-statements-and-reports-help145) **[C]**:
- Formats: "as a PDF, Quicken, QuickBooks, CSV, or TAB file".
- History: "for up to the past seven years".
- Range: "up to 12 months of activity at a time".
- Steps: History → Download → Custom.
- The page does not restrict this by account type.

**Static site: can and cannot [I]**

| Can do | Cannot do |
|---|---|
| Import the user's PayPal CSV download. | Hold a client secret. |
| Optionally run "Log in with PayPal" for identity only, which still needs a server for the code exchange. | Call Transaction Search. |
| | Receive or verify webhooks. |

---

## 7. Firebase

**Storage security rules** **[C]**
Source: https://firebase.google.com/docs/rules/basics. Official "content-owner only" example:

```
match /user/{userId}/{fileName} {
  allow read, write: if request.auth != null && request.auth.uid == userId;
}
```

The same pattern works for `users/{uid}/...`. A size and content-type guard example appears at https://firebase.google.com/docs/storage/security/rules-conditions:

```
allow write: if request.resource.size < 5 * 1024 * 1024 && request.resource.contentType.matches('image/.*');
```

**Storage on the Spark (free) plan** (https://firebase.google.com/docs/storage/faqs-storage-changes-announced-sept-2024) **[C]**:
- "Cloud Storage for Firebase (even default buckets) now requires projects to be on the pay-as-you-go Blaze pricing plan."
- "This requirement went into effect starting February 03, 2026."
- "If your Firebase project is on the Spark pricing plan, you won't have access to any Cloud Storage buckets". Requests return 402 or 403.
- On Blaze, `*.appspot.com` buckets keep no-cost levels: 5 GB stored, 1 GB downloaded per day, 20,000 uploads per day, 50,000 downloads per day.
- New `*.firebasestorage.app` buckets follow GCS pricing, with an "Always Free" tier in US-CENTRAL1, US-EAST1 and US-WEST1.
- **[I]** On Spark, SpendWise cannot store receipt images in Firebase Storage. Either keep images local (IndexedDB) or require Blaze.

**Firestore free quota** (https://firebase.google.com/docs/firestore/quotas) **[C]**:
- 1 GiB stored
- 50,000 reads per day
- 20,000 writes per day
- 20,000 deletes per day
- 10 GiB outbound per month
- "exactly one free database" per project

---

## 8. In-browser OCR

**Tesseract.js**

| Item | Value | Source |
|---|---|---|
| Version | npm `latest` = **7.0.0** **[C]** | https://registry.npmjs.org/tesseract.js/latest |
| License | **Apache-2.0** **[C]** | npm registry; https://github.com/naptha/tesseract.js |
| Runtime | "works in the browser ... and on the server with Node.js". A worker "creates and manages an instance of Tesseract running in a web worker (browser)" **[C]** | README; https://github.com/naptha/tesseract.js/blob/master/docs/api.md |
| PDF input | "does not support PDF files" **[C]** | README |
| Arabic | Tesseract language list includes `ara` (Arabic) and script `arab` **[C]** | https://tesseract-ocr.github.io/tessdoc/Data-Files-in-different-versions.html |
| Language data loading | If `langPath` is not set, "the correct language data will be automatically downloaded from the jsDelivr CDN". The file URL is `langPath + langCode + '.traineddata.gz'`. Default `corePath` is `https://cdn.jsdelivr.net/npm/tesseract.js-core@v5.0.0` (as written in the doc; it may lag behind v7) **[C]** | https://github.com/naptha/tesseract.js/blob/master/docs/local-installation.md |
| Self-hosting | Set `workerPath`, `corePath` (four `tesseract-core*.wasm.js` files) and `langPath` **[C]** | same |
| Caching | `cacheMethod`: `write` (default), `readOnly`, `refresh`, `none`. In the browser, `cachePath` "only changes the key in IndexDB" **[C]** | api.md |
| Multiple languages | Array form, for example `['eng','chi_sim']`. The `'eng+ara'` string form is **[NC]** on the pages read. | api.md |

**[I]** OCR runs entirely on the device, so image data never leaves the browser. Self-host language data on GitHub Pages for offline use and privacy, or accept the jsDelivr fetch.

**Cloud OCR (all require a secret key or credentials, so a backend is needed) [I]**

| Service | Arabic | Free tier / pricing | Sources |
|---|---|---|---|
| Google Cloud Vision (TEXT_DETECTION / DOCUMENT_TEXT_DETECTION) | `ar` listed as **Supported** **[C]** | First 1,000 units per month free, then $1.50 per 1,000 (to 5M) **[C]** | https://docs.cloud.google.com/vision/docs/languages ; https://cloud.google.com/vision/pricing |
| Azure Document Intelligence (Read / Layout v4.0) | Arabic `ar` for **printed** and **handwritten** text **[C]** | F0: "0 - 500 pages free per month". S0 prices did not render **[NC]** | https://learn.microsoft.com/en-us/azure/ai-services/document-intelligence/language-support/ocr ; https://azure.microsoft.com/en-us/pricing/details/ai-document-intelligence/ |
| AWS Textract | **Not supported**: "supports English, Spanish, German, Italian, French, and Portuguese" **[C]** | Free tier "lasts for three months": 1,000 pages per month for Detect Document Text. US West (Oregon) price $0.0015 per page for the first 1M **[C]** | https://docs.aws.amazon.com/textract/latest/dg/textract-best-practices.html ; https://aws.amazon.com/textract/pricing/ |

---

## 9. Structured invoice standards

### 9.1 EN 16931 / UBL 2.1 / Peppol BIS Billing 3.0

Source: https://docs.peppol.eu/poacc/billing/3.0/syntax/ubl-invoice/tree/ **[C]**

| Element | Cardinality |
|---|---|
| `cbc:CustomizationID` | 1..1 |
| `cbc:ProfileID` | 1..1 |
| `cbc:ID` | 1..1 |
| `cbc:IssueDate` | 1..1 |
| `cbc:DueDate` | 0..1 |
| `cbc:InvoiceTypeCode` | 1..1 |
| `cbc:DocumentCurrencyCode` | 1..1 |
| `cac:AccountingSupplierParty` | 1..1 |
| `cac:AccountingCustomerParty` | 1..1 |
| `cac:TaxTotal` | 1..2 |
| `cac:TaxTotal/cbc:TaxAmount` | 1..1 |
| `cac:LegalMonetaryTotal` | 1..1, with `cbc:LineExtensionAmount`, `cbc:TaxExclusiveAmount`, `cbc:TaxInclusiveAmount` and `cbc:PayableAmount` each 1..1 |
| `cac:InvoiceLine` | 1..n, with `cbc:ID`, `cbc:InvoicedQuantity`, `cbc:LineExtensionAmount`, `cac:Item` and `cac:Price/cbc:PriceAmount` |

`cac:Item/cbc:Name` is 1..1 (BT-153, rule BR-25) per https://docs.peppol.eu/poacc/billing/3.0/syntax/ubl-invoice/cac-InvoiceLine/cac-Item/cbc-Name/ **[C]**.
The root namespace URI was not shown on the tree page **[NC]**. **[I]** Parse by local name.

### 9.2 Saudi Arabia: ZATCA (FATOORA) QR code

Source: *ZATCA Electronic Invoice Security Features Implementation Standards*, v1.2, dated 2023-05-19, section 4.1 and Table 3. https://zatca.gov.sa/ar/E-Invoicing/SystemsDevelopers/Documents/20230519_ZATCA_Electronic_Invoice_Security_Features_Implementation_Standards_vF.pdf. Text was extracted locally from the PDF **[C]**.

**Rules:**
- The QR code must be "encoded in Base64 format with up to 700 characters".
- Fields are "encoded in Tag-Length-Value (TLV) format".
- Tag: one byte.
- Length: one byte, the length of the UTF-8 bytes (tags 1–5).
- Value: UTF-8 bytes. For tag 6 the value is a 32-byte SHA-256 hash.
- After the TLV byte array is built, "encode using Base64".

**Tags:**

| Tag | Field | Enforced from |
|---|---|---|
| **1** | Seller's name | 4 Dec 2021 |
| **2** | VAT registration number of the seller | 4 Dec 2021 |
| **3** | Time stamp of the invoice (ISO 8601, e.g. `2022-02-21T12:13:57Z`) | 4 Dec 2021 |
| **4** | Invoice total (with VAT) | 4 Dec 2021 |
| **5** | VAT total | 4 Dec 2021 |
| 6 | Hash of XML invoice | 1 Jan 2023 |
| 7 | ECDSA signature of the XML hash | 1 Jan 2023 |
| 8 | ECDSA public key | 1 Jan 2023 |
| 9 | Simplified tax invoices and their notes only: ECDSA signature of the cryptographic stamp's public key | 1 Jan 2023 |

The tag 1 label text was partly garbled in the extraction, but the row order and position confirm tag 1 = seller name.
Tags 1–5 are decodable offline in the browser. **[I]** Tags 6–9 cannot be cryptographically validated without the invoice XML or the CA chain.

### 9.3 UAE e-invoicing

- **Model:** the UAE uses "Decentralized Continuous Transaction Control and Exchange - DCTCE", with Corners 1–5 and Corner 5 receiving Tax Data Document reports. Data is submitted "eInvoice data (PINT AE)". Source: https://mof.gov.ae/en/about-us/initiatives/einvoicing/ **[C]**.
- **PINT AE:** "a national customization of global PINT for the United Arab Emirates". Customization ID `urn:peppol:pint:billing-1@ae-1`. Syntax "UBL Invoice 2.1" / "UBL CreditNote 2.1". Source: https://docs.peppol.eu/poac/ae/pint-ae/bis/ **[C]**.
- **Timeline** (MoF news, 10 May 2026, https://mof.gov.ae/en/news/ministry-of-finance-announces-targeted-amendments-to-einvoicing-system-decisions/) **[C]**:
  - For persons with revenue above AED 50 million, the ASP appointment deadline moved "from 31 July 2026 to 30 October 2026".
  - They must "fully implement ... by no later than 1 January 2027".
  - The decision cited is MD No. 244 of 2025.
- Dates for other categories (below AED 50M: 1 July 2027; government: 1 October 2027) appeared only in search snippets of MoF PDFs **[NC]**.
- **[I]** This is B2B/B2G. It does not give consumers an API.

### 9.4 India GST e-invoice

- The official GST e-invoice portals (einvoice.gst.gov.in, einvoice1.gst.gov.in, einvoice6.gst.gov.in, tutorial.gst.gov.in) **failed DNS resolution** from this environment. Nothing could be read directly **[NC]**.
- Search-indexed text from those official pages describes the following. **Treat all of it as [NC] until verified.**
  - IRN = 64-character SHA-256 hash of supplier GSTIN, document type, document number and financial year, returned by the IRP.
  - The signed QR is returned as a string in the signed JSON.
  - QR contents: supplier GSTIN, recipient GSTIN, invoice number, invoice date, invoice value, number of line items, main item HSN, IRN and IRN date.
  - Verification happens on the e-invoice portal or with a QR verification app.

---

## 10. Summary table

No credentials are available, so **nothing below can be tested live**. The "Testable now?" column answers whether testing is possible without credentials.

| Integration | Supported operations | Personal / merchant | Auth | Geography | Access / approval | Fees (documented) | Data-protection notes | Testable now? |
|---|---|---|---|---|---|---|---|---|
| ETA e-invoice APIs | submit, search, get, cancel, packages | Taxpayer (issuer/receiver) only | OAuth2 client credentials (ERP), eSeal signing | Egypt | Taxpayer profile and ERP registration with ETA | Not stated **[NC]** | Tax data. Rate limit 1 request per 2 s on search | No |
| ETA e-receipt APIs | submit, search, get, anonymous share-get | Taxpayer POS. Anonymous share endpoint **[NC]** for browser use | OAuth2 client credentials plus POS headers | Egypt | POS registration | Not stated **[NC]** | Receipts may carry buyer mobile or ID | No |
| ETA receipt QR (offline parse) | parse URL, UUID, date, Total, IssuerRIN; link out | Consumer | None | Egypt | None | Free | Processed locally | **Yes**, with sample QR strings |
| InstaPay | transfers, mini-statement in app | Personal (app only). Merchant via PSPs | App login; PSP merchant keys | Egypt | Bank account; PSP contract for merchants | Transfer 0.1% (min EGP 0.50, max EGP 20) | No third-party data access found | No |
| Vodafone Cash | wallet payments | Personal (app). Merchant via gateways | n/a | Egypt | n/a | In service guide **[NC]** | No export or API found | No |
| CBE open banking / AIS | none confirmed | n/a | n/a | Egypt | **[NC]** | n/a | n/a | No |
| Bank statements (CIB etc.) | user downloads statement file | Personal | Bank login (user) | Egypt | None for SpendWise | Bank-specific | File stays on device if parsed locally | **Yes**, with sample files |
| Paymob / Fawry / Kashier | collect payments, refunds, payouts | Merchant | Server-side secret or secure key | Egypt (Paymob also KSA etc.) | Merchant contract | Not read **[NC]** | PCI or merchant scope | No |
| PayPal Transaction Search | list transactions (31-day window, 3 h lag, 3 years back) | App owner's account | OAuth2 client credentials (secret) | Global | REST app with the scope enabled; Business account to go live | Not stated | Secret must stay server-side **[I]** | No |
| Log in with PayPal | identity (name, email, address, payer ID) | Personal | OAuth2 auth code plus secret exchange | Global | App review (weeks) | Not stated | Minimal PII | No |
| PayPal CSV download | user exports activity (CSV/PDF/etc., 12 months per request, 7 years back) | Personal | User login | Global | None | Free | Local parse | **Yes**, with sample CSV |
| Firebase Storage | per-user files | n/a | Firebase Auth plus rules | Global | **Blaze plan required** since 3 Feb 2026 | Blaze no-cost levels (see 7) | Owner-only rules | Emulator only |
| Firestore | data sync | n/a | Firebase Auth plus rules | Global | Spark OK | 1 GiB, 50k reads per day, 20k writes per day | Owner-only rules | Emulator only |
| Tesseract.js | on-device OCR, `ara` + `eng` | n/a | None | n/a | None | Free (Apache-2.0) | Images never leave device (self-host data for full offline) | **Yes** |
| Cloud OCR (GCV, Azure) | OCR (Arabic supported) | n/a | API key or secret (backend) | Global | Cloud account | GCV 1k per month free; Azure F0 500 pages per month | Images sent to third party | No |
| AWS Textract | OCR | n/a | IAM (backend) | Global | AWS account | 3-month free tier | No Arabic | No |
| UBL / Peppol / PINT AE XML parse | read invoice XML | n/a | None | EU / UAE / global | None | Free | Local | **Yes**, with sample XML |
| ZATCA QR TLV parse | decode tags 1–5 | n/a | None | KSA | None | Free | Local | **Yes** |

---

## Recommendations for SpendWise

**Implement now (static site, no backend)**

1. **Manual entry** stays the primary path.
2. **Statement import, local only:**
   - CSV and XLSX with a column-mapping wizard and saved templates per bank or PayPal. PayPal CSV is officially available.
   - PDF text extraction, for example with pdf.js, as best effort. Prompt for the password on protected PDFs.
   - Never upload the files.
3. **Local OCR** with Tesseract.js v7:
   - Languages `eng` + `ara`.
   - Self-host `langPath` data on GitHub Pages so it works offline and nothing reaches a CDN.
   - Run it in the worker. Show parsed amount, date and merchant for user confirmation.
4. **Structured-receipt parsing:**
   - **ETA receipt QR:** parse `/receipts/search/{uuid}/share/{dateTimeIssued}#Total:{t},IssuerRIN:{rin}`.
   - **ETA JSON** (invoice v1.0 and receipt v1.2, in both submitted and details shapes): match keys case-insensitively and map `T1` to VAT.
   - **UBL / Peppol / PINT AE XML:** use `cbc:ID`, `cbc:IssueDate`, `cbc:DocumentCurrencyCode`, the supplier party name, `cac:TaxTotal/cbc:TaxAmount`, `cac:LegalMonetaryTotal/cbc:PayableAmount` and lines.
   - **ZATCA QR:** Base64 decode, then TLV tags 1–5.
5. **Link-outs** to official portals: the ETA share URL from the QR, the PayPal activity download page, and the user's bank e-statement page.
6. **Firebase:**
   - Stay on Spark: Firestore plus Auth with owner-only rules (`request.auth.uid == userId`).
   - Store receipt images in IndexedDB, or require Blaze if cloud image storage is needed.

**Needs a backend (Cloud Functions on Blaze, or another server)**

- PayPal Transaction Search, the Log in with PayPal code exchange, and PayPal webhooks.
- Cloud OCR (Google Vision or Azure Document Intelligence), because of the keys.
- Any ETA API call. This also requires the user to be a registered taxpayer with ERP or POS credentials, so it is out of scope for consumers.
- Any Paymob, Fawry or Kashier integration. These are merchant-only and irrelevant to expense tracking.

**Not possible (as of 2026-10-21, per official sources read)**

- Pulling a personal user's InstaPay, Vodafone Cash or Egyptian bank transaction history through an API. No public or partner AIS API was confirmed, and no CBE open-banking framework was confirmed.
- Fetching ETA invoices or receipts on a consumer's behalf. The APIs are taxpayer-only. The anonymous receipt endpoint is unverified for browser use.
- Firebase Storage on the Spark plan, for projects without Blaze.

---

## Sources

ETA:
- https://sdk.invoicing.eta.gov.eg/
- https://sdk.invoicing.eta.gov.eg/start/
- https://sdk.invoicing.eta.gov.eg/documents/invoice-v1-0/
- https://sdk.invoicing.eta.gov.eg/documents/receipt-v1-2/
- https://sdk.invoicing.eta.gov.eg/codes/
- https://sdk.invoicing.eta.gov.eg/codes/tax-types/
- https://sdk.invoicing.eta.gov.eg/codes/payment-methods/
- https://sdk.invoicing.eta.gov.eg/api/
- https://sdk.invoicing.eta.gov.eg/api/01-login-as-taxpayer-system/
- https://sdk.invoicing.eta.gov.eg/einvoicingapi/
- https://sdk.invoicing.eta.gov.eg/einvoicingapi/08-get-document/
- https://sdk.invoicing.eta.gov.eg/einvoicingapi/11-get-document-details/
- https://sdk.invoicing.eta.gov.eg/einvoicingapi/16-search-documents/
- https://sdk.invoicing.eta.gov.eg/ereceiptapi/
- https://sdk.invoicing.eta.gov.eg/ereceiptapi/01-authenticate-pos/
- https://sdk.invoicing.eta.gov.eg/ereceiptapi/03-get-receipt-details/
- https://sdk.invoicing.eta.gov.eg/ereceiptapi/05-get-receipt-details-anonymously/
- https://sdk.invoicing.eta.gov.eg/receiptissuancefaq/
- https://sdk.invoicing.eta.gov.eg/toolkitapi/05-qrcode/
- https://invoicing.eta.gov.eg/ (SPA; no readable content)

Egypt payments and banks:
- https://www.instapay.eg/
- https://web.vodafone.com.eg/en/vodafone-cash
- https://developers.paymob.com/paymob-docs
- https://developers.paymob.com/paymob-docs/integration-paths/mobile-sdks
- https://developer.fawrystaging.com/docs/server-apis/create-payment-refno-apis
- https://developers.kashier.io/docs/accept-payments/instapay
- https://www.cibeg.com/en/personal/ways-to-bank/electoronic-statement (body not readable)
- cbe.org.eg pages (blocked: "Request Rejected")

PayPal:
- https://developer.paypal.com/docs/api/transaction-search/v1/
- https://raw.githubusercontent.com/paypal/paypal-rest-api-specifications/main/openapi/reporting_transactions_v1.json
- https://developer.paypal.com/api/rest/
- https://developer.paypal.com/docs/log-in-with-paypal/integrate/
- https://developer.paypal.com/docs/log-in-with-paypal/integrate/reference/
- https://developer.paypal.com/api/rest/webhooks/
- https://developer.paypal.com/api/rest/webhooks/rest/
- https://www.paypal.com/us/cshelp/article/how-do-i-view-and-download-statements-and-reports-help145

Firebase:
- https://firebase.google.com/docs/rules/basics
- https://firebase.google.com/docs/storage/security/rules-conditions
- https://firebase.google.com/docs/storage/faqs-storage-changes-announced-sept-2024
- https://firebase.google.com/docs/firestore/quotas

OCR:
- https://github.com/naptha/tesseract.js
- https://registry.npmjs.org/tesseract.js/latest
- https://github.com/naptha/tesseract.js/blob/master/docs/api.md
- https://github.com/naptha/tesseract.js/blob/master/docs/local-installation.md
- https://tesseract-ocr.github.io/tessdoc/Data-Files-in-different-versions.html
- https://docs.cloud.google.com/vision/docs/languages
- https://cloud.google.com/vision/pricing
- https://learn.microsoft.com/en-us/azure/ai-services/document-intelligence/language-support/ocr
- https://azure.microsoft.com/en-us/pricing/details/ai-document-intelligence/
- https://docs.aws.amazon.com/textract/latest/dg/textract-best-practices.html
- https://aws.amazon.com/textract/pricing/

Invoice standards:
- https://docs.peppol.eu/poacc/billing/3.0/syntax/ubl-invoice/tree/
- https://docs.peppol.eu/poacc/billing/3.0/syntax/ubl-invoice/cac-InvoiceLine/cac-Item/cbc-Name/
- https://zatca.gov.sa/ar/E-Invoicing/SystemsDevelopers/Documents/20230519_ZATCA_Electronic_Invoice_Security_Features_Implementation_Standards_vF.pdf
- https://docs.peppol.eu/poac/ae/pint-ae/bis/
- https://mof.gov.ae/en/about-us/initiatives/einvoicing/
- https://mof.gov.ae/en/news/ministry-of-finance-announces-targeted-amendments-to-einvoicing-system-decisions/
- India GST portals (einvoice.gst.gov.in and others): DNS failure, not read
