import { NavLink, Outlet, Link } from 'react-router'
import { t } from '../strings'
import { APP_MODE, supabase } from '../lib/dbClient'
import { useShopping } from '../context/ShoppingContext'
import { useOnline } from '../hooks/useOnline'
import { useInstallPrompt } from '../hooks/useInstallPrompt'

const tabs = [
  { to: '/', label: t.nav.recipes, short: 'Receptek', icon: '📖', end: true },
  { to: '/mit-fozzek', label: t.nav.suggest, short: 'Mit főzzek', icon: '🎲', end: false },
  { to: '/raktar', label: t.nav.pantry, short: 'Raktár', icon: '📦', end: false },
  { to: '/bevasarlas', label: t.nav.shopping, short: 'Lista', icon: '🛒', end: false },
  { to: '/uj-recept', label: t.nav.newRecipe, short: 'Új', icon: '＋', end: false },
] as const

/** Layout: desktop top navigation + mobile bottom dock. */
export default function Navbar() {
  const { uncheckedCount } = useShopping()
  const online = useOnline()
  const { canInstall, install } = useInstallPrompt()

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-line bg-canvas/95 pt-[env(safe-area-inset-top)] backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3">
          <Link to="/" className="flex min-w-0 items-center gap-3">
            <img src="/icon.svg" alt="" className="h-10 w-10 shrink-0 rounded-xl" />
            <div className="min-w-0">
              <h1 className="truncate text-xl font-bold leading-tight text-ink md:text-2xl">{t.app.title}</h1>
              <p className="hidden truncate text-xs text-muted sm:block">{t.app.subtitle}</p>
            </div>
          </Link>

          <nav className="ml-6 hidden items-center gap-1 md:flex" aria-label="Fő navigáció">
            {tabs.map((tab) => (
              <NavLink
                key={tab.to}
                to={tab.to}
                end={tab.end}
                className={({ isActive }) =>
                  `flex items-center rounded-xl px-3 py-2 text-sm font-semibold transition-colors ${
                    isActive ? 'bg-primary text-white' : 'text-ink hover:bg-subtle'
                  }`
                }
              >
                {tab.label}
                {tab.to === '/bevasarlas' && uncheckedCount > 0 && (
                  <span className="ml-1.5 inline-flex min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-bold text-white">
                    {uncheckedCount}
                  </span>
                )}
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            {canInstall && (
              <button type="button" onClick={() => void install()} className="btn-ghost text-xs">
                {t.common.installApp}
              </button>
            )}
            {APP_MODE === 'supabase' && supabase && (
              <button type="button" onClick={() => void supabase!.auth.signOut()} className="btn-ghost text-xs">
                {t.login.logout}
              </button>
            )}
          </div>
        </div>
        {!online && (
          <div className="bg-sage px-4 py-1.5 text-center text-xs font-semibold text-white">{t.common.offline}</div>
        )}
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6 pb-28 md:pb-10">
        <Outlet />
      </main>

      {/* Mobile bottom tab bar */}
      <nav
        className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
        aria-label="Fő navigáció"
      >
        <ul className="mx-auto flex max-w-xl">
          {tabs.map((tab) => (
            <li key={tab.to} className="flex-1">
              <NavLink
                to={tab.to}
                end={tab.end}
                className={({ isActive }) =>
                  `relative flex min-h-16 flex-col items-center justify-center gap-0.5 px-0.5 text-[10px] font-semibold ${
                    isActive ? 'text-primary' : 'text-muted'
                  }`
                }
              >
                <span className="text-xl leading-none" aria-hidden>
                  {tab.icon}
                </span>
                <span className="max-w-full truncate">{tab.short}</span>
                {tab.to === '/bevasarlas' && uncheckedCount > 0 && (
                  <span className="absolute right-[18%] top-1.5 inline-flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-white">
                    {uncheckedCount}
                  </span>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  )
}



