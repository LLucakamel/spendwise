import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { friendlyError } from '@/lib/errors'

/** How long to wait for the server to confirm a write before telling the user it is queued. */
export const CONFIRM_TIMEOUT_MS = 8000

export type MutationOutcome<T> =
  | { status: 'done'; result: T }
  | { status: 'queued' }
  | { status: 'error'; error: unknown }

interface MutationOptions<T> {
  success?: string | ((result: T) => string)
  errorPrefix?: string
  /**
   * Whether the write is applied locally and queued while offline (plain Firestore writes).
   * Server-side transactions are not, so for them the hook simply waits for the result.
   */
  queuesOffline?: boolean
}

/**
 * Runs a repository write with a pending flag (to block double submission), toasts for the
 * result, and a timeout for slow networks. If the server has not confirmed the write in time,
 * the user is told it is waiting to sync rather than being shown a false success or failure.
 */
export function useMutation<Args extends unknown[], T>(
  fn: (...args: Args) => Promise<T>,
  options: MutationOptions<T> = {},
) {
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
      const describe = (error: unknown) => (errorPrefix ? `${errorPrefix} ${friendlyError(error)}` : friendlyError(error))
      const promise = fn(...args)
      let timer: ReturnType<typeof setTimeout> | undefined
      const timeout = new Promise<'timeout'>((resolve) => {
        if (queuesOffline) timer = setTimeout(() => resolve('timeout'), CONFIRM_TIMEOUT_MS)
      })
      try {
        const winner = await Promise.race([promise.then((result) => ({ result })), timeout])
        if (winner === 'timeout') {
          toast.warning('Waiting for the network', {
            description: 'Your change is saved on this device and will sync when the connection returns. Keep this tab open.',
          })
          promise.catch((error: unknown) => toast.error(describe(error)))
          return { status: 'queued' }
        }
        if (success) toast.success(typeof success === 'function' ? success(winner.result) : success)
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
    [fn],
  )

  return { run, pending }
}
