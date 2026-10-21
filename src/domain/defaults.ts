import type { CategoryInput, Settings } from './types'

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
  { id: 'exp-other', name: 'Other expenses', type: 'expense', color: '#e87ba4' },
  { id: 'inc-salary', name: 'Salary', type: 'income', color: '#1baf7a' },
  { id: 'inc-freelance', name: 'Freelance', type: 'income', color: '#2a78d6' },
  { id: 'inc-investments', name: 'Investments', type: 'income', color: '#6250d6' },
  { id: 'inc-gifts', name: 'Gifts', type: 'income', color: '#e87ba4' },
  { id: 'inc-other', name: 'Other income', type: 'income', color: '#eda100' },
]

export const SUPPORTED_LOCALES = [
  { value: 'en-US', label: 'English (United States)' },
  { value: 'en-GB', label: 'English (United Kingdom)' },
  { value: 'en-AE', label: 'English (United Arab Emirates)' },
  { value: 'en-IN', label: 'English (India)' },
  { value: 'ar-AE', label: 'العربية (الإمارات)' },
  { value: 'de-DE', label: 'Deutsch (Deutschland)' },
  { value: 'fr-FR', label: 'Français (France)' },
  { value: 'es-ES', label: 'Español (España)' },
  { value: 'ja-JP', label: '日本語 (日本)' },
] as const

export function detectLocale(): string {
  const candidate = typeof navigator !== 'undefined' ? navigator.language : 'en-US'
  return SUPPORTED_LOCALES.some((l) => l.value === candidate) ? candidate : 'en-US'
}

export function defaultSettings(locale: string = detectLocale()): Settings {
  return {
    displayCurrency: 'USD',
    locale,
    dateFormat: 'locale',
    weekStartsOn: 1,
    openingBalances: [],
  }
}

export const UNCATEGORIZED_LABEL = 'Uncategorized'
