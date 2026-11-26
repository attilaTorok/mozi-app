import { PostgrestClient } from '@supabase/postgrest-js'
import { createClient } from '@supabase/supabase-js'
import { t } from '../strings'

/**
 * Unified database adapter.
 *  - local    (Phase 1): plain PostgREST from docker-compose, anonymous access, no login.
 *  - supabase (Phase 2): Supabase Cloud with a single shared account (RLS: authenticated only).
 * Both expose the same `.from(table)` query API.
 */
export const APP_MODE: 'local' | 'supabase' = import.meta.env.VITE_APP_MODE === 'supabase' ? 'supabase' : 'local'

function localUrl(): string {
  const configured = import.meta.env.VITE_SUPABASE_URL
  if (configured) return configured
  // Default for the docker setup: PostgREST on port 3000 of the same host
  // (so it also works when opening the app from a phone on the LAN).
  return `${window.location.protocol}//${window.location.hostname}:3000`
}

export const supabase =
  APP_MODE === 'supabase'
    ? createClient(import.meta.env.VITE_SUPABASE_URL ?? '', import.meta.env.VITE_SUPABASE_ANON_KEY ?? '')
    : null

export const db: PostgrestClient = supabase
  ? (supabase as unknown as PostgrestClient)
  : new PostgrestClient(localUrl())

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

