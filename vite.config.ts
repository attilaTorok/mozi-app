import { defineConfig, type Connect, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { fetchPage, pageHeaders, parseTarget } from './functions/api/scrape'

/** Local replacement for the Cloudflare Pages Function (functions/api/scrape.ts), sharing its fetch logic. */
function scrapeProxy(): Plugin {
  const handler: Connect.NextHandleFunction = async (req, res, next) => {
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
