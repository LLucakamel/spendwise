/**
 * Active ISO 4217 currency codes supported for transactions.
 * Fund codes and precious metals are intentionally excluded.
 */
// prettier-ignore
export const CURRENCY_CODES = [
  'AED', 'AFN', 'ALL', 'AMD', 'AOA', 'ARS', 'AUD', 'AWG', 'AZN', 'BAM', 'BBD', 'BDT', 'BHD', 'BIF',
  'BMD', 'BND', 'BOB', 'BRL', 'BSD', 'BTN', 'BWP', 'BYN', 'BZD', 'CAD', 'CDF', 'CHF', 'CLP', 'CNY',
  'COP', 'CRC', 'CUP', 'CVE', 'CZK', 'DJF', 'DKK', 'DOP', 'DZD', 'EGP', 'ERN', 'ETB', 'EUR', 'FJD',
  'FKP', 'GBP', 'GEL', 'GHS', 'GIP', 'GMD', 'GNF', 'GTQ', 'GYD', 'HKD', 'HNL', 'HTG', 'HUF', 'IDR',
  'ILS', 'INR', 'IQD', 'IRR', 'ISK', 'JMD', 'JOD', 'JPY', 'KES', 'KGS', 'KHR', 'KMF', 'KPW', 'KRW',
  'KWD', 'KYD', 'KZT', 'LAK', 'LBP', 'LKR', 'LRD', 'LSL', 'LYD', 'MAD', 'MDL', 'MGA', 'MKD', 'MMK',
  'MNT', 'MOP', 'MRU', 'MUR', 'MVR', 'MWK', 'MXN', 'MYR', 'MZN', 'NAD', 'NGN', 'NIO', 'NOK', 'NPR',
  'NZD', 'OMR', 'PAB', 'PEN', 'PGK', 'PHP', 'PKR', 'PLN', 'PYG', 'QAR', 'RON', 'RSD', 'RUB', 'RWF',
  'SAR', 'SBD', 'SCR', 'SDG', 'SEK', 'SGD', 'SHP', 'SLE', 'SOS', 'SRD', 'SSP', 'STN', 'SYP', 'SZL',
  'THB', 'TJS', 'TMT', 'TND', 'TOP', 'TRY', 'TTD', 'TWD', 'TZS', 'UAH', 'UGX', 'USD', 'UYU', 'UZS',
  'VES', 'VND', 'VUV', 'WST', 'XAF', 'XCD', 'XCG', 'XOF', 'XPF', 'YER', 'ZAR', 'ZMW', 'ZWG',
] as const

/** Codes shown at the top of currency pickers. */
export const COMMON_CURRENCIES: readonly string[] = ['USD', 'EUR', 'GBP', 'AED', 'SAR', 'JPY', 'CAD', 'AUD', 'CHF', 'INR', 'KWD']

/**
 * ISO 4217 minor units for currencies that do not use two decimal places.
 * This table is fixed in code rather than read from `Intl`, because stored minor-unit
 * amounts must be interpreted identically on every browser and in every release.
 */
// prettier-ignore
const MINOR_UNIT_EXCEPTIONS: Readonly<Record<string, number>> = {
  BIF: 0, CLP: 0, DJF: 0, GNF: 0, ISK: 0, JPY: 0, KMF: 0, KRW: 0, PYG: 0, RWF: 0, UGX: 0,
  VND: 0, VUV: 0, XAF: 0, XOF: 0, XPF: 0,
  BHD: 3, IQD: 3, JOD: 3, KWD: 3, LYD: 3, OMR: 3, TND: 3,
}

const CODE_SET: ReadonlySet<string> = new Set(CURRENCY_CODES)

export function isSupportedCurrency(code: string): boolean {
  return CODE_SET.has(code)
}

/** Number of decimal places in the currency's minor unit (ISO 4217 exponent). */
export function minorUnitDigits(currency: string): number {
  if (!isSupportedCurrency(currency)) throw new Error(`Unsupported currency code: ${currency}`)
  return MINOR_UNIT_EXCEPTIONS[currency] ?? 2
}

const displayNameCache = new Map<string, Intl.DisplayNames | null>()

export function currencyName(code: string, locale: string): string {
  let names = displayNameCache.get(locale)
  if (names === undefined) {
    try {
      names = new Intl.DisplayNames([locale, 'en'], { type: 'currency' })
    } catch {
      names = null
    }
    displayNameCache.set(locale, names)
  }
  return names?.of(code) ?? code
}

export interface CurrencyOption {
  code: string
  label: string
}

export function currencyOptions(locale: string): CurrencyOption[] {
  const common = COMMON_CURRENCIES.filter(isSupportedCurrency)
  const rest = CURRENCY_CODES.filter((c) => !common.includes(c))
  return [...common, ...rest].map((code) => ({ code, label: `${code} — ${currencyName(code, locale)}` }))
}
