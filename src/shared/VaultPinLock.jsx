import { useCallback, useEffect, useState } from 'react'
import { Delete, Lock, LockOpen } from 'lucide-react'

const APP_PIN = String(import.meta.env.VITE_APP_PIN || '1357')
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '⌫']

const metal =
  'bg-[linear-gradient(145deg,#52525b_0%,#27272a_45%,#3f3f46_55%,#18181b_100%)]'

/** Metallic safe-vault style 4-digit PIN lock protecting the whole Hub. */
export default function VaultPinLock({ onUnlock }) {
  const [pin, setPin] = useState('')
  const [status, setStatus] = useState(/** @type {'idle' | 'error' | 'open'} */ ('idle'))

  const press = useCallback(
    (k) => {
      if (status !== 'idle') return
      if (k === 'C') return setPin('')
      if (k === '⌫') return setPin((p) => p.slice(0, -1))
      setPin((p) => {
        if (p.length >= 4) return p
        const next = p + k
        if (next.length === 4) {
          if (next === APP_PIN) {
            setStatus('open')
            setTimeout(() => {
              localStorage.setItem('app_authenticated', 'true')
              onUnlock()
            }, 600)
          } else {
            setStatus('error')
            setTimeout(() => {
              setStatus('idle')
              setPin('')
            }, 600)
          }
        }
        return next
      })
    },
    [status, onUnlock],
  )

  useEffect(() => {
    const onKey = (e) => {
      if (/^\d$/.test(e.key)) press(e.key)
      else if (e.key === 'Backspace') press('⌫')
      else if (e.key === 'Escape') press('C')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [press])

  const ring =
    status === 'error' ? 'ring-red-500/80' : status === 'open' ? 'ring-emerald-400/80' : 'ring-zinc-500/40'

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 p-4 font-mono">
      <div
        className={`relative w-full max-w-xs rounded-3xl border-4 border-zinc-600 p-6 shadow-[0_20px_60px_rgba(0,0,0,0.8),inset_0_2px_0_rgba(255,255,255,0.15)] ring-4 transition ${ring} ${metal} ${
          status === 'error' ? 'animate-pulse' : ''
        }`}
      >
        {['left-3 top-3', 'right-3 top-3', 'bottom-3 left-3', 'bottom-3 right-3'].map((pos) => (
          <span
            key={pos}
            className={`absolute ${pos} h-2.5 w-2.5 rounded-full bg-zinc-400 shadow-[inset_0_-1px_1px_rgba(0,0,0,0.6)]`}
          />
        ))}

        <div className="mb-5 flex flex-col items-center gap-2">
          <div
            className={`flex h-16 w-16 items-center justify-center rounded-full border-4 border-zinc-500 bg-zinc-800 shadow-[inset_0_3px_8px_rgba(0,0,0,0.8)] transition-transform duration-500 ${
              status === 'open' ? 'rotate-180 text-emerald-400' : 'text-zinc-300'
            }`}
          >
            {status === 'open' ? <LockOpen size={26} /> : <Lock size={26} />}
          </div>
          <h1 className="text-lg font-black tracking-[0.3em] text-zinc-200">TRÉSOR</h1>
          <p className={`text-[11px] tracking-widest ${status === 'error' ? 'text-red-400' : 'text-zinc-400'}`}>
            {status === 'error' ? 'HIBÁS KÓD' : status === 'open' ? 'NYITVA' : 'ADD MEG A 4 JEGYŰ KÓDOT'}
          </p>
        </div>

        <div className="mb-6 flex justify-center gap-3 rounded-xl bg-black/60 p-3 shadow-[inset_0_2px_6px_rgba(0,0,0,0.9)]">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className={`flex h-10 w-8 items-center justify-center text-xl ${
                status === 'error' ? 'text-red-400' : 'text-emerald-400'
              } drop-shadow-[0_0_6px_currentColor]`}
            >
              {pin[i] ? '●' : '–'}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-3 gap-3">
          {KEYS.map((k) => (
            <button
              key={k}
              onClick={() => press(k)}
              aria-label={k === '⌫' ? 'Törlés' : k}
              className="h-14 rounded-full border border-zinc-500 bg-[radial-gradient(circle_at_30%_30%,#71717a,#27272a)] text-xl font-bold text-zinc-100 shadow-[0_4px_0_#09090b,inset_0_1px_0_rgba(255,255,255,0.25)] transition active:translate-y-1 active:shadow-[0_1px_0_#09090b]"
            >
              {k === '⌫' ? <Delete className="mx-auto" size={20} /> : k}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
