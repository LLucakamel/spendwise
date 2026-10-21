import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { detectLanguage } from '@/domain/defaults'
import type { Language } from '@/domain/types'
import { ar } from './ar'
import { en, type Messages } from './en'

/** Dot-separated paths to string leaves of the English dictionary. */
type Leaves<T, P extends string = ''> = {
  [K in keyof T & string]: T[K] extends string ? `${P}${K}` : Leaves<T[K], `${P}${K}.`>
}[keyof T & string]

type AllKeys = Leaves<Messages>
/** Plural keys are written as `name_one`, `name_other`, … and requested as `name`. */
type PluralBase<K> = K extends `${infer B}_other` ? B : never
export type MessageKey = AllKeys | PluralBase<AllKeys>

export type Vars = Record<string, string | number>

const DICTIONARIES: Record<Language, Messages> = { en, ar }
export const LANGUAGE_STORAGE_KEY = 'spendwise.lang'

function lookup(dict: Messages, key: string): string | undefined {
  let node: unknown = dict
  for (const part of key.split('.')) {
    if (node && typeof node === 'object' && part in node) node = (node as Record<string, unknown>)[part]
    else return undefined
  }
  return typeof node === 'string' ? node : undefined
}

export function translate(language: Language, key: string, vars?: Vars): string {
  const dict = DICTIONARIES[language]
  let template: string | undefined
  if (vars && typeof vars.count === 'number') {
    const rule = new Intl.PluralRules(language === 'ar' ? 'ar' : 'en').select(vars.count)
    template = lookup(dict, `${key}_${rule}`) ?? lookup(dict, `${key}_other`)
  }
  template ??= lookup(dict, key) ?? lookup(en, key) ?? key
  if (!vars) return template
  return template.replace(/\{(\w+)\}/g, (match, name: string) => (name in vars ? String(vars[name]) : match))
}

/** True when `key` names a message (used to decide whether a string is a translation key). */
export function hasMessage(key: string): boolean {
  return lookup(en, key) !== undefined || lookup(en, `${key}_other`) !== undefined
}

interface I18nContextValue {
  language: Language
  dir: 'ltr' | 'rtl'
  /** Locale for numbers and dates in the interface. Arabic uses Egyptian Arabic conventions. */
  formatLocale: (preferred: string) => string
  setLanguage(language: Language): void
  t(key: MessageKey, vars?: Vars): string
  /** Translates "key" or "key|{json params}" strings produced by validators; other text passes through. */
  tx(message: string | undefined): string | undefined
}

const I18nContext = createContext<I18nContextValue | null>(null)

export function applyDocumentLanguage(language: Language) {
  document.documentElement.lang = language
  document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr'
}

export function I18nProvider({ children, initial }: { children: ReactNode; initial?: Language }) {
  const [language, setLanguageState] = useState<Language>(() => initial ?? detectLanguage())

  useEffect(() => {
    applyDocumentLanguage(language)
  }, [language])

  const setLanguage = useCallback((next: Language) => {
    setLanguageState(next)
    try {
      window.localStorage.setItem(LANGUAGE_STORAGE_KEY, next)
    } catch {
      // The choice still applies for this session.
    }
  }, [])

  const value = useMemo<I18nContextValue>(() => {
    const t = (key: MessageKey, vars?: Vars) => translate(language, key, vars)
    return {
      language,
      dir: language === 'ar' ? 'rtl' : 'ltr',
      formatLocale: (preferred: string) => (language === 'ar' ? 'ar-EG' : preferred.startsWith('ar') ? 'en-US' : preferred),
      setLanguage,
      t,
      tx: (message) => {
        if (!message) return message
        const [key, json] = message.split('|', 2)
        if (!key || !hasMessage(key)) return message
        let vars: Vars | undefined
        try {
          vars = json ? (JSON.parse(json) as Vars) : undefined
        } catch {
          vars = undefined
        }
        return translate(language, key, vars)
      },
    }
  }, [language, setLanguage])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(): I18nContextValue {
  const value = useContext(I18nContext)
  if (!value) throw new Error('useI18n must be used inside I18nProvider.')
  return value
}

export function useT() {
  return useI18n().t
}
