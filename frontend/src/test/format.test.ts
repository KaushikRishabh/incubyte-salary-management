import { describe, expect, it } from 'vitest'
import { dateText, initials, money } from '../format'
import { apiErrorMessage, filterParams } from '../api'

/** Pure display helpers must not corrupt exact salary strings or shift date-only records. */
describe('display formatting', () => {
  it('preserves cents and explicit currency without float salary arithmetic', () => {
    expect(money('123456789.01', 'USD')).toBe('USD 123,456,789.01')
    expect(money('1200.5', 'EUR')).toBe('EUR 1,200.50')
    expect(money('12000000.00', 'JPY')).toBe('JPY 12,000,000')
  })
  it('labels compact numbers and missing values', () => {
    expect(money('1250000', 'USD', true)).toBe('USD 1.3m')
    expect(money(null, 'USD')).toBe('—')
    expect(money('not-money', 'USD')).toBe('—')
  })
  // Number() alone treats empty/whitespace strings as zero and accepts exponent notation.
  it.each(['', ' ', '1e3', '0x10', '.5', 'Infinity', '12,000.00'])(
    'rejects non-decimal display input %j',
    (value) => expect(money(value, 'USD')).toBe('—'),
  )
  it('preserves very large full amounts without rounding their cents', () => {
    expect(money('9007199254740993.01', 'USD')).toBe(
      'USD 9,007,199,254,740,993.01',
    )
    expect(money('0', 'USD')).toBe('USD 0.00')
    expect(money('99999.99', 'USD', true)).toBe('USD 99,999.99')
    expect(money('100000', 'USD', true)).toBe('USD 100k')
  })
  it('handles missing initials and unparseable dates safely', () => {
    expect(initials('')).toBe('')
    expect(initials(' Alex  Morgan Smith ')).toBe('AM')
    expect(dateText('not-a-date')).toBe('not-a-date')
  })
  it('handles date-only values without a UTC calendar-day shift', () => {
    expect(dateText('2026-01-02')).toBe('Jan 2, 2026')
    expect(initials('  Alex  Morgan ')).toBe('AM')
  })
})
// Encoding/validation helpers are deterministic and do not need a rendered app.
describe('API helpers', () => {
  it('turns validation paths into useful feedback', () => {
    expect(
      apiErrorMessage([
        { loc: ['body', 'annual_salary'], msg: 'Must be positive' },
      ]),
    ).toBe('annual_salary: Must be positive')
  })
  it('encodes filters and excludes empty values', () => {
    expect(
      filterParams({
        q: 'Alex & Morgan',
        country: '',
        department: '',
        currency: 'USD',
        status: 'active',
      }).toString(),
    ).toBe('q=Alex+%26+Morgan&currency=USD&status=active')
  })
})
