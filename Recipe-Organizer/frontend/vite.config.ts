import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { fetchPage, pageHeaders, parseTarget } from './functions/api/scrape'

/** Local replacement for the Cloudflare Pages Function (functions/api/scrape.ts), sharing its fetch logic. */
function scrapeProxy(): Plugin {
  type Req = { url?: string }
  type Res = { statusCode: number; setHeader(k: string, v: string): void; end(body?: string): void }
  const handler = async (req: Req, res: Res, next: () => void) => {
    if (!req.url?.startsWith('/api/scrape')) return next()
    const params = new URL(req.url, 'http://localhost').searchParams
    const url = parseTarget(params.get('url'))
    if (!url) {
      res.statusCode = 400
      res.setHeader('Content-Type', 'text/plain; charset=utf-8')
      res.end('Bad request')
      return
    }
    try {
      const page = await fetchPage(url, params.get('jina') === '1')
      res.statusCode = page.status
      for (const [k, v] of Object.entries(pageHeaders(page.source))) res.setHeader(k, v)
      res.end(page.body)
    } catch {
      res.statusCode = 502
      res.setHeader('Content-Type', 'text/plain; charset=utf-8')
      res.end('Upstream error')
    }
  }
  return {
    name: 'scrape-proxy',
    configureServer: (server) => void server.middlewares.use(handler),
    configurePreviewServer: (server) => void server.middlewares.use(handler),
  }
}
export default defineConfig({
  server: { host: true, port: 5173, watch: { usePolling: true } },
  preview: { host: true, port: 5173 },
  plugins: [
    react(),
    tailwindcss(),
    scrapeProxy(),
    VitePWA({
      registerType: 'autoUpdate',
      // PNG icons (192/512/maskable/apple-touch) are generated from the SVG at build time.
      pwaAssets: {
        image: 'public/icon.svg',
        preset: 'minimal-2023',
        overrideManifestIcons: true,
      },
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'Magtár & Konyha',
        short_name: 'Magtár',
        description: 'Közös recepttár és konyhai készlet',
        lang: 'hu',
        theme_color: '#C85A32',
        background_color: '#FAF7F2',
        display: 'standalone',
        orientation: 'any',
        start_url: '/',
        scope: '/',
      },
      workbox: {
        // App shell is precached; API calls are never cached by the service worker
        // (offline data lives in localStorage, see src/lib/offlineStore.ts).
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2,webmanifest}'],
      },
    }),
  ],
})
