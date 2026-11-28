import type { Ingredient, ScrapeResult } from '../types'

/**
 * Recipe import: fetches the page HTML through the /api/scrape Worker endpoint (src/worker.ts;
 * Vite dev middleware locally), then parses Schema.org JSON-LD with site-specific HTML fallbacks.
 * Throws a descriptive Error when the page cannot be fetched or contains no recipe data.
 */

type Json = unknown
type JsonObject = Record<string, Json>

type Handler = (doc: Document, res: ScrapeResult) => void

const isObject = (v: Json): v is JsonObject => typeof v === 'object' && v !== null && !Array.isArray(v)

const HANDLERS: { domain: string; handler: Handler }[] = [
  { domain: 'streetkitchen.hu', handler: fallbackStreetKitchen },
  { domain: 'nosalty.hu', handler: fallbackNosalty },
  { domain: 'mindmegette.hu', handler: fallbackMindmegette },
]

const MAX_STEPS = 100
const MAX_INGREDIENTS = 100
const FETCH_TIMEOUT_MS = 35_000

export async function scrapeRecipe(url: string): Promise<ScrapeResult> {
  const host = hostOf(url)
  if (!host) throw new Error('Érvénytelen URL.')
  const { html, markdownText } = await fetchScrape(url)
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const res = emptyResult(url)
  const textSource = markdownText || html

  const recipe =
    findRecipeInDocument(doc) ?? findRecipeInText(html) ?? (markdownText ? findRecipeInText(markdownText) : null)
  if (recipe) fillFromRecipe(res, recipe)
  if (res.ingredients.length === 0 || res.steps.length === 0) {
    HANDLERS.find((h) => host === h.domain || host.endsWith(`.${h.domain}`))?.handler(doc, res)
  }
  if (res.ingredients.length === 0 || res.steps.length === 0 || !res.title) {
    fillFromMarkdown(res, textSource)
  }
  if (!res.title) {
    res.title = clean(doc.querySelector('h1')?.textContent ?? doc.querySelector('title')?.textContent ?? '', 200)
  }
  if (!recipe && res.ingredients.length === 0) {
    throw new Error(`Nem található receptadat az oldalon (${host}).`)
  }
  if (!res.title) res.title = titleFromUrl(url)
  res.fallback = !res.title || res.ingredients.length === 0
  return res
}

async function fetchScrape(url: string): Promise<{ html: string; markdownText: string }> {
  let res: Response
  try {
    res = await fetch(`/api/scrape?url=${encodeURIComponent(url)}`, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
  } catch (e) {
    const timedOut = e instanceof DOMException && e.name === 'TimeoutError'
    throw new Error(timedOut ? 'Időtúllépés a recept letöltésekor.' : 'Hálózati hiba a recept letöltésekor.')
  }
  const isJson = res.headers.get('Content-Type')?.includes('application/json') ?? false
  if (!isJson) throw new Error(`A /api/scrape végpont nem elérhető (HTTP ${res.status}).`)
  const data = (await res.json()) as { html?: string; markdownText?: string; error?: string }
  if (!res.ok || data.error) throw new Error(`Letöltési hiba: ${data.error ?? `HTTP ${res.status}`}`)
  const html = data.html?.trim() ?? ''
  const markdownText = data.markdownText?.trim() ?? ''
  if (!html && !markdownText) throw new Error('A letöltött oldal üres.')
  return { html: html || markdownText, markdownText: markdownText || html }
}

function emptyResult(url: string): ScrapeResult {
  return {
    title: '',
    source_url: url,
    prep_time_minutes: 0,
    base_servings: 0,
    ingredients: [],
    steps: [],
    tags: [],
    fallback: true,
  }
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase()
  } catch {
    return ''
  }
}

// ------------------------------------------------------------------ HTML fallbacks

const texts = (doc: Document, selector: string, max: number): string[] =>
  [...doc.querySelectorAll(selector)].map((el) => clean(el.textContent ?? '', max)).filter(Boolean)

/** Fills ingredients/steps from the first selector that yields results. */
function fillFromSelectors(doc: Document, res: ScrapeResult, ingredients: string[], steps: string[]): void {
  if (res.ingredients.length === 0) {
    for (const sel of ingredients) {
      const found = texts(doc, sel, 300)
      if (found.length) {
        res.ingredients = found.slice(0, MAX_INGREDIENTS).map(parseHungarianIngredient)
        break
      }
    }
  }
  if (res.steps.length === 0) {
    for (const sel of steps) {
      const found = texts(doc, sel, 5000)
      if (found.length) {
        res.steps = found.slice(0, MAX_STEPS)
        break
      }
    }
  }
  if (!res.prep_time_minutes) {
    const m = /(?:Elkészítési|Teljes|Főzési)?\s*idő:?\s*((?:\d+\s*óra)?\s*(?:\d+\s*perc)?)/i.exec(doc.body?.textContent ?? '')
    const minutes = m ? parseHuDuration(m[1]) : null
    if (minutes) res.prep_time_minutes = minutes
  }
}

function fallbackMindmegette(doc: Document, res: ScrapeResult): void {
  fillFromSelectors(
    doc,
    res,
    ['.recipe-ingredients li', '[class*="ingredient"] li', '.hozzavalok li'],
    ['.recipe-instructions li', '.recipe-instructions p', '[class*="instruction"] li', '[class*="preparation"] p'],
  )
}

function fallbackStreetKitchen(doc: Document, res: ScrapeResult): void {
  fillFromSelectors(
    doc,
    res,
    ['.ingredients-main dd', '.ingredient-groups li', '[class*="ingredient"] li', '[class*="ingredient"] dd'],
    ['.recipe-steps li', '.article-content ol li', '[class*="step"] p', '[class*="instruction"] p'],
  )
}

function fallbackNosalty(doc: Document, res: ScrapeResult): void {
  fillFromSelectors(
    doc,
    res,
    ['.m-recipe__ingredient', '[class*="ingredient"] li', '.p-recipe__ingredients li'],
    ['.m-recipe__step', '[class*="direction"] li', '[class*="step"] p', '.p-recipe__directions li'],
  )
}

// ------------------------------------------------------------------ JSON-LD

function findRecipeInDocument(doc: Document): JsonObject | null {
  for (const script of doc.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      const found = findRecipe(JSON.parse((script.textContent ?? '').trim()))
      if (found) return found
    } catch {
      /* keep looking */
    }
  }
  return null
}

function findRecipeInText(text: string): JsonObject | null {
  for (const m of text.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const found = findRecipe(JSON.parse(m[1].trim()))
      if (found) return found
    } catch {
      /* keep looking */
    }
  }
  for (const m of text.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)) {
    try {
      const found = findRecipe(JSON.parse(m[1].trim()))
      if (found) return found
    } catch {
      /* keep looking */
    }
  }
  const marker = /"@type"\s*:\s*"Recipe"/i.exec(text)
  if (!marker || marker.index === undefined) return null
  const start = text.lastIndexOf('{', marker.index)
  if (start < 0) return null
  const raw = sliceBalancedJson(text, start)
  if (!raw) return null
  try {
    return findRecipe(JSON.parse(raw))
  } catch {
    return null
  }
}

function sliceBalancedJson(text: string, start: number): string | null {
  let depth = 0
  let inString = false
  let escape = false
  for (let i = start; i < text.length && i - start < 400_000; i++) {
    const c = text[i]
    if (inString) {
      if (escape) escape = false
      else if (c === '\\') escape = true
      else if (c === '"') inString = false
      continue
    }
    if (c === '"') inString = true
    else if (c === '{') depth++
    else if (c === '}') {
      depth--
      if (depth === 0) return text.slice(start, i + 1)
    }
  }
  return null
}

function findRecipe(v: Json): JsonObject | null {
  if (Array.isArray(v)) {
    for (const x of v) {
      const r = findRecipe(x)
      if (r) return r
    }
  } else if (isObject(v)) {
    if (hasType(v['@type'], 'Recipe')) return v
    if ('@graph' in v) return findRecipe(v['@graph'])
  }
  return null
}

function hasType(v: Json, want: string): boolean {
  if (typeof v === 'string') return v.toLowerCase() === want.toLowerCase()
  if (Array.isArray(v)) return v.some((x) => typeof x === 'string' && x.toLowerCase() === want.toLowerCase())
  return false
}

function fillFromRecipe(res: ScrapeResult, r: JsonObject): void {
  res.title = clean(asString(r.name), 200)

  const sectionNames = new Set<string>()
  flattenInstructions(r.recipeInstructions, res.steps, sectionNames)
  res.steps = res.steps.slice(0, MAX_STEPS)

  for (const raw of asList(r.recipeIngredient)) {
    const s = clean(asString(raw), 300).replace(/^0\s+/, '')
    if (!s || sectionNames.has(s.toLowerCase())) continue
    res.ingredients.push(parseHungarianIngredient(s))
    if (res.ingredients.length >= MAX_INGREDIENTS) break
  }

  const total = parseDuration(asString(r.totalTime))
  res.prep_time_minutes = total || parseDuration(asString(r.prepTime)) + parseDuration(asString(r.cookTime))

  const servings = firstInt(r.recipeYield)
  if (servings > 0 && servings < 1000) res.base_servings = servings

  res.tags = collectTags(r)
}

/** HowToSection / HowToStep / strings → one flat list; a named section prefixes its first step. */
function flattenInstructions(v: Json, out: string[], sectionNames: Set<string>, prefix = ''): string {
  if (typeof v === 'string') {
    for (const line of clean(v, 5000).split('\n')) {
      if (!line) continue
      out.push(prefix + line)
      prefix = ''
    }
  } else if (Array.isArray(v)) {
    for (const x of v) prefix = flattenInstructions(x, out, sectionNames, prefix)
  } else if (isObject(v)) {
    if ('itemListElement' in v) {
      const name = clean(asString(v.name), 200)
      if (name) sectionNames.add(name.toLowerCase())
      flattenInstructions(v.itemListElement, out, sectionNames, name ? `(${name}) ` : prefix)
      return ''
    }
    return flattenInstructions(typeof v.text === 'string' ? v.text : asString(v), out, sectionNames, prefix)
  }
  return prefix
}

function asString(v: Json): string {
  if (typeof v === 'string') return v
  if (typeof v === 'number') return String(v)
  if (isObject(v)) {
    if (typeof v.text === 'string') return v.text
    if (typeof v.name === 'string') return v.name
  }
  return ''
}

function asList(v: Json): Json[] {
  if (Array.isArray(v)) return v
  return v === undefined || v === null ? [] : [v]
}

/** Strips HTML, unescapes entities and collapses whitespace. */
function clean(s: string, max: number): string {
  const withBreaks = s.replace(/<\s*(?:br|\/p|\/li|\/div)\s*\/?>/gi, '\n')
  const text = new DOMParser().parseFromString(withBreaks, 'text/html').body.textContent ?? ''
  return text
    .split('\n')
    .map((l) => l.replace(/[ \t\f\v\u00a0]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n')
    .slice(0, max)
}

/** ISO-8601 duration (PT1H5M) → minutes. */
function parseDuration(s: string): number {
  const m = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/i.exec(s.trim())
  if (!m) return 0
  const n = (i: number) => Number(m[i] ?? 0)
  return Math.round(n(1) * 1440 + n(2) * 60 + n(3) + n(4) / 60)
}

/** "1 óra 30 perc" → 90; null when the line is not just a duration. */
function parseHuDuration(line: string): number | null {
  const m = /^(?:(\d+)\s*óra)?\s*(?:(\d+)\s*perc)?$/i.exec(line.trim())
  if (!m || (!m[1] && !m[2])) return null
  return Number(m[1] ?? 0) * 60 + Number(m[2] ?? 0)
}

function firstInt(v: Json): number {
  for (const x of asList(v)) {
    const m = /\d+/.exec(asString(x))
    if (m) return Number(m[0])
  }
  return 0
}

function collectTags(r: JsonObject): string[] {
  const raw: string[] = []
  for (const key of ['keywords', 'recipeCategory', 'recipeCuisine']) {
    for (const x of asList(r[key])) raw.push(...asString(x).split(','))
  }
  const tags: string[] = []
  for (const item of raw) {
    const tag = clean(item, 30).toLowerCase()
    if (tag && !tags.includes(tag)) tags.push(tag)
    if (tags.length >= 10) break
  }
  return tags
}

// ------------------------------------------------------------------ ingredients

const FRACTIONS: Record<string, string> = { '½': ' 1/2', '¼': ' 1/4', '¾': ' 3/4', '⅓': ' 1/3', '⅔': ' 2/3', '⅛': ' 1/8' }

const KNOWN_UNITS = new Set([
  'g', 'dkg', 'kg', 'ml', 'cl', 'dl', 'l', 'db', 'ek', 'evőkanál', 'tk', 'teáskanál', 'kk', 'kávéskanál',
  'mk', 'mokkáskanál', 'csipet', 'gerezd', 'fej', 'csokor', 'szál', 'szelet', 'konzerv', 'csomag', 'doboz',
  'pohár', 'bögre', 'marék', 'szem', 'darabka',
  // imperial / English
  'cup', 'cups', 'tbsp', 'tsp', 'oz', 'lb', 'lbs', 'clove', 'cloves', 'pinch', 'can', 'slice', 'slices',
])

const SIZED_UNIT_RE = /^((?:kis|közepes|nagy)\s+(?:db|fej|gerezd|szelet|csokor|szál))\.?\s+(.+)$/i
const QTY_RE = /^(\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:[.,]\d+)?)\s*(.*)$/
const TO_TASTE_RE = /(?:^|\s)ízlés\s+szerint(?=\s|,|$)\s*/i

/** Splits "2 közepes db paradicsom", "csipet Só" or "só ízlés szerint" into amount / unit / name. */
export function parseHungarianIngredient(raw: string): Ingredient {
  let text = raw
    .replace(/[½¼¾⅓⅔⅛]/g, (c) => FRACTIONS[c])
    .split(/\s+/)
    .filter(Boolean)
    .join(' ')
    .replace(/^0\s+/, '')

  if (TO_TASTE_RE.test(text)) {
    const name = text.replace(TO_TASTE_RE, ' ').replace(/^[\s,]+|[\s,]+$/g, '')
    return { name: name || text, amount: null, unit: 'ízlés szerint' }
  }

  let amount: number | null = null
  const q = QTY_RE.exec(text)
  if (q && q[2].trim()) {
    amount = parseQuantity(q[1])
    if (amount !== null) text = q[2].trim()
  }

  const sized = SIZED_UNIT_RE.exec(text)
  if (sized) return { name: sized[2].trim(), amount, unit: sized[1].toLowerCase().replace(/\s+/, ' ') }

  const space = text.indexOf(' ')
  if (space !== -1) {
    const first = text.slice(0, space).replace(/[.,]+$/, '')
    const tail = text.slice(space + 1).trim()
    if (KNOWN_UNITS.has(first.toLowerCase()) && tail) {
      return { name: tail.replace(/^of /, ''), amount, unit: first }
    }
  }
  return { name: amount === null ? raw.trim() : text, amount, unit: '' }
}

function parseQuantity(q: string): number | null {
  let total = 0
  for (const part of q.trim().split(/\s+/)) {
    if (part.includes('/')) {
      const [num, den] = part.split('/').map(Number)
      if (!Number.isFinite(num) || !Number.isFinite(den) || den === 0) return null
      total += num / den
    } else {
      const n = Number(part.replace(',', '.'))
      if (!Number.isFinite(n)) return null
      total += n
    }
  }
  return total > 0 ? total : null
}

// ------------------------------------------------------------------ fallback

const ING_HEADING = /hozzával|alapanyag|ingredients?/i
const STEP_HEADING = /elkészít|készítés|lépés|instruction|direction|method/i
const SKIP_LINE = /^(title|url source|published time|markdown content|warning|image \d+):/i

function fillFromMarkdown(res: ScrapeResult, raw: string): void {
  let text = raw.replace(/\r/g, '')
  const titleMeta = /^Title:\s*(.+)$/m.exec(text)
  if (!res.title && titleMeta) res.title = clean(titleMeta[1], 200)
  const mdStart = text.search(/^Markdown Content:\s*$/m)
  if (mdStart >= 0) text = text.slice(mdStart).replace(/^Markdown Content:\s*\n?/, '')

  const sections = splitMarkdownSections(text)
  if (!res.title) {
    const heading = sections.find((s) => s.level === 1 && s.title)
    if (heading) res.title = clean(heading.title, 200)
  }

  if (res.ingredients.length === 0) {
    const block = sections.find((s) => ING_HEADING.test(s.title))
    const items = extractListItems(block?.body ?? '')
    if (items.length) res.ingredients = items.slice(0, MAX_INGREDIENTS).map(parseHungarianIngredient)
  }
  if (res.steps.length === 0) {
    const block = sections.find((s) => STEP_HEADING.test(s.title))
    const items = extractListItems(block?.body ?? '', { keepParagraphs: true })
    if (items.length) res.steps = items.slice(0, MAX_STEPS)
  }

  if (!res.prep_time_minutes) {
    const m = /(?:elkészítési|teljes|főzési)?\s*idő:?\s*((?:\d+\s*óra)?\s*(?:\d+\s*perc)?)/i.exec(text)
    const minutes = m ? parseHuDuration(m[1]) : null
    if (minutes) res.prep_time_minutes = minutes
  }
  if (!res.base_servings) {
    const y = /(\d+)\s*(?:adag|főre|fő|személy|személyre)/i.exec(text)
    if (y) {
      const n = Number(y[1])
      if (n > 0 && n < 1000) res.base_servings = n
    }
  }
}

function splitMarkdownSections(text: string): { level: number; title: string; body: string }[] {
  const lines = text.split('\n')
  const sections: { level: number; title: string; body: string }[] = [{ level: 0, title: '', body: '' }]
  for (const line of lines) {
    const trimmed = line.trim()
    const atx = /^(#{1,6})\s+(.+)$/.exec(trimmed)
    const bold = /^\*\*(.+)\*\*$/.exec(trimmed)
    if (atx) {
      sections.push({ level: atx[1].length, title: atx[2].replace(/\*+/g, '').trim(), body: '' })
      continue
    }
    if (bold && trimmed.length < 80) {
      sections.push({ level: 2, title: bold[1].trim(), body: '' })
      continue
    }
    if (/^(hozzávalók|elkészítés|elkészítése|ingredients|instructions|lépések)\s*:?\s*$/i.test(trimmed)) {
      sections.push({ level: 2, title: trimmed, body: '' })
      continue
    }
    sections[sections.length - 1].body += `${line}\n`
  }
  return sections
}

function extractListItems(body: string, opts?: { keepParagraphs?: boolean }): string[] {
  const items: string[] = []
  let paragraph: string[] = []
  const flushPara = () => {
    const t = clean(paragraph.join(' '), 5000)
    if (t) items.push(t)
    paragraph = []
  }
  for (const rawLine of body.split('\n')) {
    const line = rawLine.trim()
    if (!line || SKIP_LINE.test(line) || /^!\[/.test(line) || /^https?:\/\//i.test(line)) {
      if (opts?.keepParagraphs) flushPara()
      continue
    }
    const listed = /^[-*•]\s+(.+)$/.exec(line) ?? /^\d+[.)]\s+(.+)$/.exec(line)
    if (listed) {
      flushPara()
      const t = clean(listed[1], opts?.keepParagraphs ? 5000 : 300)
      if (t) items.push(t)
      continue
    }
    if (opts?.keepParagraphs) {
      paragraph.push(line)
    } else if (QTY_RE.test(line) || KNOWN_UNITS.has(line.split(/\s+/)[0]?.toLowerCase() ?? '')) {
      const t = clean(line.replace(/^[-*•]\s+/, ''), 300)
      if (t) items.push(t)
    }
  }
  flushPara()
  return items.filter((x, i, arr) => x && arr.indexOf(x) === i)
}

/** "https://nosalty.hu/recept/chilis-csirke-123" → "Chilis csirke". */
function titleFromUrl(url: string): string {
  try {
    const slug = new URL(url).pathname.split('/').filter(Boolean).pop() ?? ''
    const words = decodeURIComponent(slug)
      .replace(/\.[a-z0-9]{2,5}$/i, '')
      .replace(/[-_]+/g, ' ')
      .replace(/\b\d{3,}\b/g, '')
      .trim()
    return words ? words.charAt(0).toUpperCase() + words.slice(1) : ''
  } catch {
    return ''
  }
}
