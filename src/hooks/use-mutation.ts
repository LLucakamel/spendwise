import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { useI18n, type MessageKey } from '@/i18n'
import { errorKey } from '@/lib/errors'

/** How long to wait for the server to confirm a write before telling the user it is queued. */
export const CONFIRM_TIMEOUT_MS = 8000

export type MutationOutcome<T> = { status: 'done'; result: T } | { status: 'queued' } | { status: 'error'; error: unknown }

interface MutationOptions<T> {
  success?: MessageKey | ((result: T) => string)
  errorPrefix?: MessageKey
  /**
   * Whether the write is applied locally and queued while offline (plain Firestore writes).
   * Server-side transactions are not, so for them the hook simply waits for the result.
   */
  queuesOffline?: boolean
}

/**
 * Runs a repository write with a pending flag (to block double submission), translated toasts,
 * and a timeout for slow networks: if the server hasn't confirmed in time, the user is told the
 * change is waiting to sync rather than being shown a false success or failure.
 */
export function useMutation<Args extends unknown[], T>(fn: (...args: Args) => Promise<T>, options: MutationOptions<T> = {}) {
  const { t } = useI18n()
  const [pending, setPending] = useState(false)
  const inFlight = useRef(false)
  const optionsRef = useRef(options)
  useEffect(() => {
    optionsRef.current = options
  })

  const run = useCallback(
    async (...args: Args): Promise<MutationOutcome<T>> => {
      if (inFlight.current) return { status: 'error', error: new Error('Already saving.') }
      inFlight.current = true
      setPending(true)
      const { success, errorPrefix, queuesOffline = true } = optionsRef.current
      const describe = (error: unknown) => (errorPrefix ? `${t(errorPrefix)} ${t(errorKey(error))}` : t(errorKey(error)))
      const promise = fn(...args)
      let timer: ReturnType<typeof setTimeout> | undefined
      const timeout = new Promise<'timeout'>((resolve) => {
        if (queuesOffline) timer = setTimeout(() => resolve('timeout'), CONFIRM_TIMEOUT_MS)
      })
      try {
        const winner = await Promise.race([promise.then((result) => ({ result })), timeout])
        if (winner === 'timeout') {
          toast.warning(t('toast.waitingTitle'), { description: t('toast.waitingText') })
          promise.catch((error: unknown) => toast.error(describe(error)))
          return { status: 'queued' }
        }
        if (success) toast.success(typeof success === 'function' ? success(winner.result) : t(success))
        return { status: 'done', result: winner.result }
      } catch (error) {
        toast.error(describe(error))
        return { status: 'error', error }
      } finally {
        clearTimeout(timer)
        inFlight.current = false
        setPending(false)
      }
    },
    [fn, t],
  )

  return { run, pending }
}
