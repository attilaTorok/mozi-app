import type { Ingredient, ScrapeResult } from '../types'
import { reportGlobalError } from '../../../shared/ErrorContext'

/**
 * Recipe import: fetches the page through the /api/scrape proxy (Vite dev middleware locally,
 * Cloudflare Pages Function in production) and dispatches to a site-specific handler by domain.
 * The proxy returns HTML ("direct") or Jina Reader Markdown ("jina"), see X-Scrape-Source.
 */

type Json = unknown
type JsonObject = Record<string, Json>

interface Page {
  body: string
  source: 'direct' | 'jina'
}

type Handler = (page: Page, url: string) => ScrapeResult

const isObject = (v: Json): v is JsonObject => typeof v === 'object' && v !== null && !Array.isArray(v)

const HANDLERS: { domain: string; handler: Handler; jina?: boolean }[] = [
  { domain: 'streetkitchen.hu', handler: parseStreetKitchen, jina: true },
  { domain: 'nosalty.hu', handler: parseNosalty },
  { domain: 'mindmegette.hu', handler: parseMindmegette },
]

const MAX_STEPS = 100
const MAX_INGREDIENTS = 100

export async function scrapeRecipe(url: string): Promise<ScrapeResult> {
  const host = hostOf(url)
  const entry = HANDLERS.find((h) => host === h.domain || host.endsWith(`.${h.domain}`))
  const page = await loadPage(url, entry?.jina ?? false)
  if (!page) reportGlobalError(`Nem sikerült letölteni a receptet: ${url}`)
  const result = page ? (entry?.handler ?? parseDefault)(page, url) : emptyResult(url)
  if (!result.title) result.title = titleFromUrl(url)
  result.fallback = !result.title || result.ingredients.length === 0
  return result
}

async function loadPage(url: string, useJina: boolean): Promise<Page | null> {
  const get = async (jina: boolean): Promise<Page | null> => {
    try {
      const res = await fetch(`/api/scrape?url=${encodeURIComponent(url)}${jina ? '&jina=1' : ''}`)
      if (!res.ok) {
        console.warn(`/api/scrape → HTTP ${res.status}`)
        return null
      }
      const source = res.headers.get('X-Scrape-Source') === 'jina' ? 'jina' : 'direct'
      return { body: await res.text(), source }
    } catch {
      return null
    }
  }
  return (await get(useJina)) ?? (useJina ? null : await get(true))
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

// ------------------------------------------------------------------ handlers

/** streetkitchen.hu: always fetched as Jina Reader Markdown. */
function parseStreetKitchen(page: Page, url: string): ScrapeResult {
  const res = emptyResult(url)
  if (page.source !== 'jina') return parseDefault(page, url)
  const lines = page.body.split('\n').map((l) => l.trim())

  const h1 = lines.find((l) => /^#\s+/.test(l))
  res.title = clean(stripMarkdown(h1?.replace(/^#\s+/, '') ?? jinaTitle(page.body)), 200)

  const prep = /Elkészítési idő:?\s*(\d+)\s*perc/i.exec(page.body)
  if (prep) res.prep_time_minutes = Number(prep[1])

  const ingStart = lines.findIndex((l) => /^(?:#+\s*)?Hozzávalók:?$/i.test(l))
  const stepStart = lines.findIndex((l, i) => i > ingStart && /^(?:#+\s*)?Elkészítés:?$/i.test(l))

  if (ingStart !== -1) {
    const end = stepStart === -1 ? lines.length : stepStart
    let current: string[] | null = null
    const flush = () => {
      const text = clean(stripMarkdown(current?.join(' ') ?? ''), 300)
      if (text && res.ingredients.length < MAX_INGREDIENTS) res.ingredients.push(parseHungarianIngredient(text))
      current = null
    }
    for (const line of lines.slice(ingStart + 1, end)) {
      const box = /^[-*]\s*\[[ xX]\]\s*(.*)$/.exec(line)
      if (box) {
        flush()
        current = box[1] ? [box[1]] : []
      } else if (!line) {
        continue
      } else if (line.startsWith('#') || /^[-*]\s/.test(line) || line.startsWith('![')) {
        flush()
      } else if (current) {
        current.push(line)
      }
    }
    flush()
  }

  if (stepStart !== -1) {
    for (const line of lines.slice(stepStart + 1)) {
      if (line.includes('![Image') || /Ha tetszett|Recept nyomtatása|^www\./i.test(line)) break
      if (!line || /^[-*_](?:\s*[-*_]){2,}$/.test(line)) continue
      if (line.startsWith('#')) {
        if (res.steps.length) break
        continue
      }
      const duration = parseHuDuration(line)
      if (duration !== null && res.steps.length === 0) {
        if (!res.prep_time_minutes) res.prep_time_minutes = duration
        continue
      }
      const step = clean(stripMarkdown(line.replace(/^\d+[.)]\s+/, '')), 5000)
      if (step && res.steps.length < MAX_STEPS) res.steps.push(step)
    }
  }
  return res
}

/** nosalty.hu: JSON-LD with nested HowToSections and "0 " ingredient prefixes. */
function parseNosalty(page: Page, url: string): ScrapeResult {
  return parseDefault(page, url)
}

/** mindmegette.hu: standard JSON-LD. */
function parseMindmegette(page: Page, url: string): ScrapeResult {
  return parseDefault(page, url)
}

/** Generic Schema.org JSON-LD, then <title>/<h1> (or the Jina Markdown title). */
function parseDefault(page: Page, url: string): ScrapeResult {
  const res = emptyResult(url)
  if (page.source === 'jina') {
    const h1 = page.body.split('\n').find((l) => /^#\s+/.test(l.trim()))
    res.title = clean(stripMarkdown(jinaTitle(page.body) || h1?.trim().replace(/^#\s+/, '') || ''), 200)
    return res
  }
  const doc = new DOMParser().parseFromString(page.body, 'text/html')
  const recipe = findRecipeInDocument(doc)
  if (recipe) fillFromRecipe(res, recipe)
  if (!res.title) {
    res.title = clean(doc.querySelector('h1')?.textContent ?? doc.querySelector('title')?.textContent ?? '', 200)
  }
  return res
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

// ------------------------------------------------------------------ markdown

function jinaTitle(md: string): string {
  return /^Title:\s*(.+)$/m.exec(md)?.[1]?.trim() ?? ''
}

/** "[vaj](https://…)" → "vaj", drops images and emphasis markers. */
function stripMarkdown(s: string): string {
  return s
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_`]+/g, '')
    .trim()
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
