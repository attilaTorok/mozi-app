// Cloudflare Pages Function: GET /api/scrape?url=...[&jina=1] → page content of the recipe.
// The browser parses it (src/utils/recipeScraper.ts); this only avoids CORS and bot-protection problems.
// The X-Scrape-Source response header tells the client whether it got HTML ("direct") or Markdown ("jina").
const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml',
  'Accept-Language': 'hu-HU,hu;q=0.9,en;q=0.8',
}

const JINA_DOMAINS = ['streetkitchen.hu']

export interface FetchedPage {
  status: number
  body: string
  source: 'direct' | 'jina'
}

export function parseTarget(raw: string | null): URL | null {
  try {
    const url = new URL(raw ?? '')
    return url.protocol === 'http:' || url.protocol === 'https:' ? url : null
  } catch {
    return null
  }
}

const needsJina = (url: URL) => JINA_DOMAINS.some((d) => url.hostname === d || url.hostname.endsWith(`.${d}`))

async function viaJina(url: URL): Promise<FetchedPage> {
  const res = await fetch(`https://r.jina.ai/${url.toString()}`, {
    headers: { Accept: 'text/plain' },
    signal: AbortSignal.timeout(30_000),
  })
  return { status: res.status, body: await res.text(), source: 'jina' }
}

export async function fetchPage(url: URL, useJina = false): Promise<FetchedPage> {
  if (useJina || needsJina(url)) return viaJina(url)
  const res = await fetch(url.toString(), {
    headers: BROWSER_HEADERS,
    redirect: 'follow',
    signal: AbortSignal.timeout(15_000),
  })
  if (res.status === 403 || res.status === 429) return viaJina(url)
  return { status: res.status, body: await res.text(), source: 'direct' }
}

export function pageHeaders(source: FetchedPage['source']): Record<string, string> {
  return {
    'Content-Type': source === 'jina' ? 'text/plain; charset=utf-8' : 'text/html; charset=utf-8',
    'X-Scrape-Source': source,
  }
}

export const onRequestGet = async ({ request }: { request: Request }): Promise<Response> => {
  const params = new URL(request.url).searchParams
  const url = parseTarget(params.get('url'))
  if (!url) return new Response('Bad request', { status: 400 })
  try {
    const page = await fetchPage(url, params.get('jina') === '1')
    return new Response(page.body, { status: page.status, headers: pageHeaders(page.source) })
  } catch {
    return new Response('Upstream error', { status: 502 })
  }
}
