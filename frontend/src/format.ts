/** Format decimal strings without floating-point arithmetic on salary values. */
export function money(
  amount: string | null | undefined,
  currency: string,
  compact = false,
): string {
  if (amount == null) return '—'
  const [whole, decimals = ''] = amount.split('.')
  const numeric = Number(amount)
  if (!Number.isFinite(numeric)) return '—'
  if (compact && numeric >= 1_000_000)
    return `${currency} ${new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(numeric / 1_000_000)}m`
  if (compact && numeric >= 100_000)
    return `${currency} ${new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(numeric / 1_000)}k`
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  const cents = decimals.padEnd(2, '0').slice(0, 2)
  return currency === 'JPY'
    ? `${currency} ${grouped}`
    : `${currency} ${grouped}.${cents}`
}
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
export function today(): string {
  const value = new Date()
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`
}
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
