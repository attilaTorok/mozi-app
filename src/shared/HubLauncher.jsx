import { ChefHat, Film } from 'lucide-react'

const APPS = [
  {
    id: 'mozi',
    name: 'Kupon Mozi',
    desc: 'Közös film- és sorozatlista',
    Icon: Film,
    tile: 'bg-amber-400 text-black shadow-[6px_6px_0px_0px_#78350f]',
  },
  {
    id: 'recipes',
    name: 'Recept & Spájz',
    desc: 'Receptek, raktár, bevásárlólista',
    Icon: ChefHat,
    tile: 'bg-[#C85A32] text-white shadow-[6px_6px_0px_0px_#3F6250]',
  },
]

/** Home screen: pick between the two apps. */
export default function HubLauncher({ onSelect }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-10 bg-zinc-950 p-6 font-mono text-zinc-100">
      <h1 className="text-2xl font-black tracking-[0.3em] text-zinc-300">HUB</h1>
      <div className="grid w-full max-w-lg grid-cols-1 gap-6 sm:grid-cols-2">
        {APPS.map(({ id, name, desc, Icon, tile }) => (
          <button
            key={id}
            onClick={() => onSelect(id)}
            className="group flex flex-col items-center gap-4 rounded-3xl border border-zinc-800 bg-zinc-900 p-8 transition hover:border-zinc-600 active:scale-95"
          >
            <span
              className={`flex h-24 w-24 items-center justify-center rounded-3xl transition group-hover:-translate-y-1 ${tile}`}
            >
              <Icon size={48} />
            </span>
            <span className="text-lg font-black tracking-wider">{name}</span>
            <span className="text-center text-xs text-zinc-500">{desc}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
