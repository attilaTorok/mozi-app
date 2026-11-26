import { useEffect } from 'react'
import { MemoryRouter, Navigate, Route, Routes, useLocation } from 'react-router'
import '@fontsource-variable/playfair-display'
import '@fontsource-variable/plus-jakarta-sans'
import { RecipesProvider } from './context/RecipesContext'
import { PantryProvider } from './context/PantryContext'
import { ShoppingProvider } from './context/ShoppingContext'
import Navbar from './components/Navbar'
import RecipesPage from './pages/RecipesPage'
import RecipeDetailPage from './pages/RecipeDetailPage'
import RecipeFormPage from './pages/RecipeFormPage'
import SuggestPage from './pages/SuggestPage'
import PantryPage from './pages/PantryPage'
import ShoppingPage from './pages/ShoppingPage'

const ROUTE_KEY = 'recipes_route'

/** MemoryRouter keeps recipe routing independent of the Hub URL; the last route survives reloads. */
function RouteMemory() {
  const { pathname } = useLocation()
  useEffect(() => {
    sessionStorage.setItem(ROUTE_KEY, pathname)
  }, [pathname])
  return null
}

export default function RecipesApp() {
  const initial = sessionStorage.getItem(ROUTE_KEY) || '/'
  return (
    <div className="recipes-app min-h-dvh bg-canvas font-recipe text-ink antialiased">
      <MemoryRouter initialEntries={[initial]}>
        <RouteMemory />
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
      </MemoryRouter>
    </div>
  )
}
