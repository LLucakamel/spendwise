import type { CategoryInput, Language, Settings } from './types'

/**
 * Category identity colours: a categorical palette validated for colour-vision deficiency
 * (adjacent order) in light and dark mode. Colours are always shown next to the category name.
 */
export const CATEGORY_COLORS = [
  '#2a78d6',
  '#eb6834',
  '#1baf7a',
  '#eda100',
  '#e87ba4',
  '#008300',
  '#6250d6',
  '#e34948',
] as const

export interface DefaultCategory extends CategoryInput {
  id: string
}

/**
 * Default categories. The stored name is English; while a default category keeps its original
 * name, the UI shows the translated label for the active language (see useCategoryLookup).
 */
export const DEFAULT_CATEGORIES: readonly DefaultCategory[] = [
  { id: 'exp-housing', name: 'Housing', type: 'expense', color: '#2a78d6' },
  { id: 'exp-groceries', name: 'Groceries', type: 'expense', color: '#1baf7a' },
  { id: 'exp-dining', name: 'Dining out', type: 'expense', color: '#eb6834' },
  { id: 'exp-transport', name: 'Transport', type: 'expense', color: '#eda100' },
  { id: 'exp-utilities', name: 'Utilities', type: 'expense', color: '#6250d6' },
  { id: 'exp-health', name: 'Health', type: 'expense', color: '#e34948' },
  { id: 'exp-shopping', name: 'Shopping', type: 'expense', color: '#e87ba4' },
  { id: 'exp-entertainment', name: 'Entertainment', type: 'expense', color: '#008300' },
  { id: 'exp-subscriptions', name: 'Subscriptions', type: 'expense', color: '#2a78d6' },
  { id: 'exp-education', name: 'Education', type: 'expense', color: '#6250d6' },
  { id: 'exp-travel', name: 'Travel', type: 'expense', color: '#eb6834' },
  { id: 'exp-fees', name: 'Fees and charges', type: 'expense', color: '#e34948' },
  { id: 'exp-other', name: 'Other expenses', type: 'expense', color: '#e87ba4' },
  { id: 'inc-salary', name: 'Salary', type: 'income', color: '#1baf7a' },
  { id: 'inc-freelance', name: 'Freelance', type: 'income', color: '#2a78d6' },
  { id: 'inc-business', name: 'Business revenue', type: 'income', color: '#eb6834' },
  { id: 'inc-investments', name: 'Investments and dividends', type: 'income', color: '#6250d6' },
  { id: 'inc-rental', name: 'Rental income', type: 'income', color: '#eda100' },
  { id: 'inc-interest', name: 'Interest', type: 'income', color: '#008300' },
  { id: 'inc-gifts', name: 'Gifts', type: 'income', color: '#e87ba4' },
  { id: 'inc-other', name: 'Other income', type: 'income', color: '#e34948' },
]

export const DEFAULT_CATEGORY_NAMES: ReadonlyMap<string, string> = new Map(DEFAULT_CATEGORIES.map((c) => [c.id, c.name]))

/** Number and date formatting regions. Arabic interface always formats with ar-EG conventions. */
export const SUPPORTED_LOCALES = [
  { value: 'en-US', label: 'English (United States)' },
  { value: 'en-GB', label: 'English (United Kingdom)' },
  { value: 'en-EG', label: 'English (Egypt)' },
  { value: 'en-AE', label: 'English (United Arab Emirates)' },
  { value: 'en-IN', label: 'English (India)' },
  { value: 'de-DE', label: 'Deutsch (Deutschland)' },
  { value: 'fr-FR', label: 'Français (France)' },
  { value: 'es-ES', label: 'Español (España)' },
] as const

export function detectLocale(): string {
  const candidate = typeof navigator !== 'undefined' ? navigator.language : 'en-US'
  return SUPPORTED_LOCALES.some((l) => l.value === candidate) ? candidate : 'en-US'
}

export function detectLanguage(): Language {
  try {
    const stored = window.localStorage.getItem('spendwise.lang')
    if (stored === 'ar' || stored === 'en') return stored
  } catch {
    // ignore
  }
  return typeof navigator !== 'undefined' && navigator.language.toLowerCase().startsWith('ar') ? 'ar' : 'en'
}

export function defaultSettings(locale: string = detectLocale(), language: Language = 'en'): Settings {
  return {
    displayCurrency: 'USD',
    locale,
    language,
    dateFormat: 'locale',
    weekStartsOn: 1,
    openingBalances: [],
  }
}
