import { ChefHat, Film, LayoutGrid } from 'lucide-react'

/** Floating pill to jump between the active app, the other app and the Hub launcher. */
export default function HubSwitcher({ activeApp, onSwitch }) {
  const other =
    activeApp === 'mozi'
      ? { id: 'recipes', label: 'Recept & Spájz', Icon: ChefHat }
      : { id: 'mozi', label: 'Kupon Mozi', Icon: Film }

  const btn =
    'flex h-11 w-11 items-center justify-center rounded-full text-zinc-200 transition hover:bg-zinc-700 active:scale-90'

  return (
    <div
      className={`fixed bottom-4 right-4 z-40 mb-[env(safe-area-inset-bottom)] flex items-center gap-1 rounded-full border border-zinc-700 bg-zinc-900/90 p-1 shadow-lg backdrop-blur ${
        activeApp === 'recipes' ? 'max-md:bottom-20' : ''
      }`}
    >
      <button onClick={() => onSwitch('launcher')} aria-label="Hub" title="Hub" className={btn}>
        <LayoutGrid size={20} />
      </button>
      <button onClick={() => onSwitch(other.id)} aria-label={other.label} title={other.label} className={btn}>
        <other.Icon size={20} />
      </button>
    </div>
  )
}
