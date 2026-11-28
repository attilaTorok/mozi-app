interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> }
}

const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'hu-HU,hu;q=0.9,en-US;q=0.8,en;q=0.7',
}

const JINA_BLOCKED = new Set([403, 429, 503])

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

function parseTarget(raw: string | null): URL | null {
  try {
    const url = new URL(raw ?? '')
    return url.protocol === 'http:' || url.protocol === 'https:' ? url : null
  } catch {
    return null
  }
}

async function fetchViaJina(targetUrl: string): Promise<string> {
  const response = await fetch(`https://r.jina.ai/${targetUrl}`, {
    headers: { Accept: 'text/plain, application/json;q=0.9', 'Accept-Language': 'hu-HU,hu;q=0.9,en;q=0.8' },
    redirect: 'follow',
  })
  if (!response.ok) throw new Error(`Jina responded with HTTP ${response.status}`)
  return response.text()
}

/** GET /api/scrape?url=… → { html, markdownText?, finalUrl }; also used by the Vite dev server. */
export async function handleScrape(request: Request): Promise<Response> {
  const targetUrl = parseTarget(new URL(request.url).searchParams.get('url'))
  if (!targetUrl) return json({ error: 'Invalid URL' }, 400)
  const original = targetUrl.toString()
  try {
    let html = ''
    let useJina = false
    try {
      const response = await fetch(original, { headers: BROWSER_HEADERS, redirect: 'follow' })
      if (JINA_BLOCKED.has(response.status)) {
        useJina = true
      } else if (!response.ok) {
        return json({ error: `Target responded with HTTP ${response.status}` }, 502)
      } else {
        html = await response.text()
        if (!html.includes('application/ld+json')) useJina = true
      }
    } catch {
      useJina = true
    }

    if (useJina) {
      const markdownText = await fetchViaJina(original)
      return json({ html: markdownText, markdownText, finalUrl: original }, 200)
    }
    return json({ html, finalUrl: original }, 200)
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 500)
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (new URL(request.url).pathname === '/api/scrape') return handleScrape(request)
    return env.ASSETS.fetch(request)
  },
}
