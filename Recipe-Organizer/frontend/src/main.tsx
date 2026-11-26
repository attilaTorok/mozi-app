import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import '@fontsource-variable/playfair-display'
import '@fontsource-variable/plus-jakarta-sans'
import './index.css'
import App from './App'

// Registers the service worker (app shell is cached → the app opens offline).
registerSW({ immediate: true })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

