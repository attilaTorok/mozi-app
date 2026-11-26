import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, X } from 'lucide-react'

const AUTO_DISMISS_MS = 8000

const ErrorContext = createContext({
  /** @param {unknown} _err @param {string} [_fallback] */
  showError: (_err, _fallback) => {},
  clearError: () => {},
})

/** @type {Set<(err: unknown, fallback?: string) => void>} */
const listeners = new Set()

/**
 * Reports an error to the global toast from outside React (e.g. plain utility modules).
 * @param {unknown} err
 * @param {string} [fallback]
 */
export function reportGlobalError(err, fallback) {
  listeners.forEach((fn) => fn(err, fallback))
}

/** @param {unknown} err @param {string} [fallback] */
function toMessage(err, fallback) {
  if (typeof err === 'string' && err) return err
  const msg = /** @type {{ message?: string } | null} */ (err)?.message
  return msg || fallback || 'Ismeretlen hiba történt.'
}

/** @param {{ children: import('react').ReactNode }} props */
export function ErrorProvider({ children }) {
  const [toasts, setToasts] = useState(/** @type {{ id: number, message: string }[]} */ ([]))
  const nextId = useRef(0)

  const dismiss = useCallback((id) => setToasts((prev) => prev.filter((t) => t.id !== id)), [])

  const showError = useCallback(
    /** @param {unknown} err @param {string} [fallback] */
    (err, fallback) => {
      const message = toMessage(err, fallback)
      if (err) console.error(err)
      const id = ++nextId.current
      setToasts((prev) => [...prev.filter((t) => t.message !== message), { id, message }].slice(-3))
      setTimeout(() => dismiss(id), AUTO_DISMISS_MS)
    },
    [dismiss],
  )

  const clearError = useCallback(() => setToasts([]), [])

  useEffect(() => {
    listeners.add(showError)
    return () => {
      listeners.delete(showError)
    }
  }, [showError])

  const value = useMemo(() => ({ showError, clearError }), [showError, clearError])

  return (
    <ErrorContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-4 top-4 z-[60] flex flex-col items-center gap-2 sm:left-auto sm:right-4 sm:items-end">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="alert"
            className="pointer-events-auto flex w-full max-w-md items-start gap-3 border-2 border-red-500 bg-red-950 p-4 font-mono text-xs text-red-200 shadow-[4px_4px_0px_0px_#000]"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
            <div className="flex-1">
              <div className="mb-0.5 font-black uppercase text-red-400">Rendszerhiba</div>
              <div className="break-words">{t.message}</div>
            </div>
            <button onClick={() => dismiss(t.id)} aria-label="Bezárás" className="text-red-400 hover:text-white">
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </ErrorContext.Provider>
  )
}

export function useGlobalError() {
  return useContext(ErrorContext)
}
