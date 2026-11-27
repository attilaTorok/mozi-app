import { defineConfig, type Connect, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { handleScrape } from './src/worker'

/** Serves /api/scrape in dev/preview with the same handler as the Cloudflare Worker (src/worker.ts). */
function scrapeProxy(): Plugin {
  const handler: Connect.NextHandleFunction = async (req, res, next) => {
    if (!req.url?.startsWith('/api/scrape')) return next()
    const response = await handleScrape(new Request(new URL(req.url, 'http://localhost')))
    res.statusCode = response.status
    res.setHeader('Content-Type', response.headers.get('Content-Type') ?? 'application/json')
    res.end(await response.text())
  }
  return {
    name: 'scrape-proxy',
    configureServer: (server) => void server.middlewares.use(handler),
    configurePreviewServer: (server) => void server.middlewares.use(handler),
  }
}

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    scrapeProxy(),
    VitePWA({
      registerType: 'autoUpdate',
      // public/manifest.json is linked from index.html.
      manifest: false,
      workbox: {
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2,webmanifest,json}'],
      },
    }),
  ],
})
