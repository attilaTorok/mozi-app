import { lazy, Suspense, useCallback, useState } from 'react'
import { ErrorProvider } from './shared/ErrorContext'
import VaultPinLock from './shared/VaultPinLock'
import HubLauncher from './shared/HubLauncher'
import HubSwitcher from './shared/HubSwitcher'

const MoziApp = lazy(() => import('./apps/mozi/MoziApp'))
const RecipesApp = lazy(() => import('./apps/recipes/RecipesApp'))

const APPS = ['launcher', 'mozi', 'recipes']
const ACTIVE_APP_KEY = 'hub_active_app'

function readActiveApp() {
  const stored = sessionStorage.getItem(ACTIVE_APP_KEY)
  return APPS.includes(stored) ? stored : 'launcher'
}

function Hub() {
  const [isAuthenticated, setIsAuthenticated] = useState(
    () => localStorage.getItem('app_authenticated') === 'true',
  )
  const [activeApp, setActiveAppState] = useState(readActiveApp)

  const setActiveApp = useCallback((app) => {
    sessionStorage.setItem(ACTIVE_APP_KEY, app)
    setActiveAppState(app)
  }, [])

  if (!isAuthenticated) return <VaultPinLock onUnlock={() => setIsAuthenticated(true)} />
  if (activeApp === 'launcher') return <HubLauncher onSelect={setActiveApp} />

  return (
    <>
      <Suspense fallback={<div className="min-h-screen bg-zinc-950" />}>
        {activeApp === 'mozi' ? <MoziApp /> : <RecipesApp />}
      </Suspense>
      <HubSwitcher activeApp={activeApp} onSwitch={setActiveApp} />
    </>
  )
}

export default function App() {
  return (
    <ErrorProvider>
      <Hub />
    </ErrorProvider>
  )
}
