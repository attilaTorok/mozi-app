import { useEffect, useState, type ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import { t } from './strings'
import { APP_MODE, supabase } from './lib/dbClient'
import { RecipesProvider } from './context/RecipesContext'
import { PantryProvider } from './context/PantryContext'
import { ShoppingProvider } from './context/ShoppingContext'
import LoginModal from './components/LoginModal'
import Navbar from './components/Navbar'
import RecipesPage from './pages/RecipesPage'
import RecipeDetailPage from './pages/RecipeDetailPage'
import RecipeFormPage from './pages/RecipeFormPage'
import SuggestPage from './pages/SuggestPage'
import PantryPage from './pages/PantryPage'
import ShoppingPage from './pages/ShoppingPage'

function Splash() {
  return (
    <div className="flex min-h-dvh items-center justify-center text-muted">
      <p>{t.common.loading}</p>
    </div>
  )
}

/** local mode: no login at all. supabase mode: one shared account. */
function AuthGate({ children }: { children: ReactNode }) {
  const [signedIn, setSignedIn] = useState<boolean | null>(APP_MODE === 'supabase' ? null : true)

  useEffect(() => {
    if (!supabase) return
    void supabase.auth.getSession().then(({ data }) => setSignedIn(Boolean(data.session)))
    const { data } = supabase.auth.onAuthStateChange((_event, session) => setSignedIn(Boolean(session)))
    return () => data.subscription.unsubscribe()
  }, [])

  if (signedIn === null) return <Splash />
  if (!signedIn) return <LoginModal />
  return <>{children}</>
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthGate>
        <RecipesProvider>
          <PantryProvider>
            <ShoppingProvider>
              <Routes>
                <Route element={<Navbar />}>
                  <Route index element={<RecipesPage />} />
                  <Route path="mit-fozzek" element={<SuggestPage />} />
                  <Route path="raktar" element={<PantryPage />} />
                  <Route path="bevasarlas" element={<ShoppingPage />} />
                  <Route path="uj-recept" element={<RecipeFormPage />} />
                  <Route path="receptek/:id" element={<RecipeDetailPage />} />
                  <Route path="receptek/:id/szerkesztes" element={<RecipeFormPage />} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Route>
              </Routes>
            </ShoppingProvider>
          </PantryProvider>
        </RecipesProvider>
      </AuthGate>
    </BrowserRouter>
  )
}



