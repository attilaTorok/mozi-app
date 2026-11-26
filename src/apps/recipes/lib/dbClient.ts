import { supabase } from '../../../shared/supabase'
import { t } from '../strings'

/** Shared Hub Supabase client; access is protected by the Hub's VaultPinLock. */
export const db = supabase

export function isNetworkError(e: unknown): boolean {
  if (e instanceof TypeError) return true // fetch() failed
  if (typeof navigator !== 'undefined' && !navigator.onLine) return true
  const err = e as { status?: number; message?: string } | null
  return err?.status === 0 || /failed to fetch|networkerror|network request failed|fetcherror/i.test(err?.message ?? '')
}

/** Message for failures (never leaks English server text). */
export function errorMessage(e: unknown, fallback: string): string {
  return isNetworkError(e) ? t.errors.network : fallback
}

/** Toast text for the global error display: localized fallback plus the server detail, if any. */
export function toastMessage(e: unknown, fallback: string): string {
  if (isNetworkError(e)) return t.errors.network
  const detail = (e as { message?: string } | null)?.message
  return detail ? `${fallback} (${detail})` : fallback
}
