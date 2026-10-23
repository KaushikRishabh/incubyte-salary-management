/** Full amounts are grouped as strings, preserving the backend's decimal digits.
 * Compact labels alone use approximate Number arithmetic for readable k/m units;
 * they are presentation only and never feed a salary calculation or API write.
 */
export function money(
  amount: string | null | undefined,
  currency: string,
  compact = false,
): string {
  // Accept plain decimal notation only; Number('') or Number('1e3') would be misleading.
  if (amount == null || !/^-?\d+(\.\d+)?$/.test(amount)) return '-'
  const [whole, decimals = ''] = amount.split('.')
  const numeric = Number(amount)
  if (!Number.isFinite(numeric)) return '-'
  if (compact && numeric >= 1_000_000)
    return `${currency} ${new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(numeric / 1_000_000)}m`
  if (compact && numeric >= 100_000)
    return `${currency} ${new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(numeric / 1_000)}k`
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  // The API supplies supported currency precision; JPY has no fractional display.
  const cents = decimals.padEnd(2, '0').slice(0, 2)
  return currency === 'JPY'
    ? `${currency} ${grouped}`
    : `${currency} ${grouped}.${cents}`
}
/** Date-only salary dates are calendar days, not UTC timestamps. Local noon avoids
 * shifting them to the previous day; actual audit timestamps use the viewer's zone.
 */
export function dateText(date: string): string {
  const parsed = new Date(date.includes('T') ? date : `${date}T12:00:00`)
  return Number.isNaN(parsed.getTime())
    ? date
    : parsed.toLocaleDateString('en-US', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
}
/** Produce the local calendar date for form defaults/maxima, without a UTC conversion. */
export function today(): string {
  const value = new Date()
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`
}
/** Cosmetic avatar fallback, using at most two words and tolerating extra whitespace. */
export function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()
}
