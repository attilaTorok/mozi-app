import type { Ingredient, ShoppingItem } from '../types'

const numberFormat = new Intl.NumberFormat('hu-HU', { maximumFractionDigits: 2 })

export function formatAmount(n: number): string {
  return numberFormat.format(n)
}

export function scaleAmount(amount: number | null, servings: number, baseServings: number): number | null {
  if (amount === null || amount <= 0) return null
  return (amount * servings) / Math.max(1, baseServings)
}

export function formatIngredient(i: Ingredient, servings: number, base: number): string {
  const amount = scaleAmount(i.amount, servings, base)
  return [amount === null ? '' : formatAmount(amount), i.unit, i.name].filter(Boolean).join(' ')
}

/** Plain-text shopping list (unchecked items only) for SMS / chat sharing. */
export function shoppingListToText(items: ShoppingItem[], header: string): string {
  const lines = items
    .filter((i) => !i.checked)
    .map((i) => {
      const qty = [i.quantity > 0 ? formatAmount(i.quantity) : '', i.unit].filter(Boolean).join(' ')
      return `• ${i.item_name}${qty ? ` (${qty})` : ''}`
    })
  return [header, ...lines].join('\n')
}

/** navigator.clipboard needs a secure context; fall back for plain-http LAN testing. */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    /* fall through */
  }
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  } catch {
    return false
  }
}

/** Parses "1,5" / "1.5" / "" → number (0 when empty / invalid). */
export function parseNumber(s: string): number {
  const n = Number.parseFloat(s.replace(',', '.'))
  return Number.isFinite(n) && n > 0 ? n : 0
}

