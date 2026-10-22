import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from '../App'
import type { Employee } from '../types'

// Synthetic records deliberately span currencies and carry non-initial versions.
// Assertions should inspect outgoing decimal strings, not just what appears on screen.
const alex: Employee = {
  id: 1,
  employee_code: 'ACME-00001',
  name: 'Alex Morgan',
  department: 'Engineering',
  job_title: 'Software Engineer',
  country: 'United States',
  currency: 'USD',
  annual_salary: '85000.50',
  effective_date: '2026-01-01',
  status: 'active',
  version: 3,
}
const other: Employee = {
  ...alex,
  id: 2,
  employee_code: 'ACME-00002',
  name: 'Sam Patel',
  country: 'India',
  currency: 'INR',
  annual_salary: '2200000.00',
}
const options = {
  countries: ['India', 'United States'],
  departments: ['Engineering', 'People'],
  currencies: ['EUR', 'GBP', 'INR', 'JPY', 'USD'],
}
const groups = [
  {
    group: 'USD',
    currency: 'USD',
    headcount: 1,
    total_salary: '85000.50',
    average_salary: '85000.50',
    min_salary: '85000.50',
    max_salary: '85000.50',
  },
  {
    group: 'INR',
    currency: 'INR',
    headcount: 1,
    total_salary: '2200000.00',
    average_salary: '2200000.00',
    min_salary: '2200000.00',
    max_salary: '2200000.00',
  },
]
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
let mutationStatus = 200
let mutationError = ''
let total = 2
let fetchMock: ReturnType<typeof vi.fn>
let historyCalls = 0

// Route a small deterministic API in memory. Individual failure/race tests override
// only the affected endpoint, keeping unrelated panels realistic and independent.
beforeEach(() => {
  mutationStatus = 200
  mutationError = ''
  total = 2
  historyCalls = 0
  fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://localhost')
    if (init?.method && init.method !== 'GET')
      return json(
        mutationStatus === 200
          ? url.pathname.endsWith('/import')
            ? { created: 1 }
            : alex
          : { detail: mutationError },
        mutationStatus,
      )
    if (url.pathname === '/api/options') return json(options)
    if (url.pathname === '/api/analytics') return json({ groups, headcount: 2 })
    if (url.pathname.endsWith('/history')) {
      historyCalls++
      return json({
        items: [
          {
            id: 1,
            employee_id: 1,
            old_salary: '80000.00',
            new_salary: '85000.50',
            old_currency: 'EUR',
            new_currency: 'USD',
            effective_date: '2026-01-01',
            reason: 'Relocated to the US office',
            changed_at: '2026-01-01T10:00:00Z',
            event: 'updated',
          },
        ],
      })
    }
    if (url.pathname === '/api/employees') {
      const items =
        url.searchParams.get('status') === 'archived'
          ? [{ ...alex, status: 'archived' }]
          : [alex, other].filter(
              (person) =>
                !url.searchParams.get('q') ||
                person.name
                  .toLowerCase()
                  .includes(url.searchParams.get('q')!.toLowerCase()),
            )
      return json({
        items,
        total: url.searchParams.get('q') ? items.length : total,
        page: Number(url.searchParams.get('page') || 1),
        page_size: Number(url.searchParams.get('page_size') || 25),
      })
    }
    return json({ detail: 'Not found' }, 404)
  })
  vi.stubGlobal('fetch', fetchMock)
})
// Wait for an actual data row before interacting, not an arbitrary timing delay.
const load = async () => {
  render(<App />)
  await screen.findByRole('button', { name: 'Alex Morgan' })
  return userEvent.setup()
}
const mutation = (path: string) =>
  fetchMock.mock.calls.find(
    ([url, init]) => String(url) === path && init?.method,
  )

// Test through accessible roles/labels, exercising user-visible contracts rather than component internals.
describe('employee workspace', () => {
  it('shows synthetic-data restrictions and currency-separated salary metrics', async () => {
    await load()
    expect(
      screen.getByText(/Do not enter real employee information/),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/No currency conversions or cross-currency totals/),
    ).toBeInTheDocument()
    const overview = screen.getByRole('region', { name: 'Salary overview' })
    expect(within(overview).getAllByText('USD')).toHaveLength(2)
    expect(within(overview).getAllByText('INR')).toHaveLength(2)
    expect(screen.getByText('USD 85,000.50')).toBeInTheDocument()
    expect(screen.getByText('INR 2,200,000.00')).toBeInTheDocument()
  })
  it('debounces search and sends filters to the server', async () => {
    const user = await load()
    await user.type(
      screen.getByRole('searchbox', { name: 'Search employees' }),
      'Alex',
    )
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(([url]) => String(url).includes('q=Alex')),
      ).toBe(true),
    )
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: 'Sam Patel' }),
      ).not.toBeInTheDocument(),
    )
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Currency' }),
      'USD',
    )
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(([url]) =>
          String(url).includes('currency=USD'),
        ),
      ).toBe(true),
    )
    await user.click(screen.getByRole('button', { name: 'Clear filters' }))
    await screen.findByRole('button', { name: 'Sam Patel' })
    expect(screen.getByRole('searchbox')).toHaveValue('')
  })
  it('paginates server-side and resets page when the page size changes', async () => {
    total = 60
    const user = await load()
    await user.click(screen.getByRole('button', { name: 'Next page' }))
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(([url]) =>
          String(url).includes('page=2&page_size=25'),
        ),
      ).toBe(true),
    )
    expect(await screen.findByText('Page 2 of 3')).toBeInTheDocument()
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Rows per page' }),
      '50',
    )
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(([url]) =>
          String(url).includes('page=1&page_size=50'),
        ),
      ).toBe(true),
    )
  })
  it('edits salary with immutable employee ID, version and reason', async () => {
    const user = await load()
    await user.click(screen.getByRole('button', { name: 'Edit Alex Morgan' }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByLabelText(/Employee ID/)).toBeDisabled()
    await user.clear(within(dialog).getByLabelText(/Annual amount/))
    await user.type(within(dialog).getByLabelText(/Annual amount/), '92000.25')
    await user.type(
      within(dialog).getByLabelText('Reason for change'),
      'Annual salary review',
    )
    await user.click(
      within(dialog).getByRole('button', { name: 'Save changes' }),
    )
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    )
    const [, init] = mutation('/api/employees/1')!
    expect(JSON.parse(init.body)).toMatchObject({
      annual_salary: '92000.25',
      version: 3,
      employee_code: 'ACME-00001',
      reason: 'Annual salary review',
    })
    expect(init.method).toBe('PUT')
    expect(screen.getByRole('status')).toHaveTextContent(
      "Alex Morgan's record has been updated",
    )
  })
  it('lets a duplicate create be corrected and retried without stale-edit lockout', async () => {
    mutationStatus = 409
    mutationError = 'Employee code already exists.'
    const user = await load()
    await user.click(screen.getByRole('button', { name: 'Add employee' }))
    const dialog = screen.getByRole('dialog')
    await user.type(within(dialog).getByLabelText('Full name'), 'Taylor Demo')
    await user.type(within(dialog).getByLabelText('Employee ID'), 'ACME-00001')
    await user.type(within(dialog).getByLabelText('Department'), 'Engineering')
    await user.type(within(dialog).getByLabelText('Job title'), 'Engineer')
    await user.type(within(dialog).getByLabelText('Country'), 'United States')
    await user.type(within(dialog).getByLabelText(/Annual amount/), '70000.00')
    await user.type(
      within(dialog).getByLabelText('Reason for change'),
      'New employee',
    )
    await user.click(
      within(dialog).getByRole('button', { name: 'Add employee' }),
    )
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Employee code already exists',
    )
    expect(
      within(dialog).getByRole('button', { name: 'Add employee' }),
    ).toBeEnabled()
    await user.clear(within(dialog).getByLabelText('Employee ID'))
    await user.type(within(dialog).getByLabelText('Employee ID'), 'DEMO-NEW')
    mutationStatus = 200
    await user.click(
      within(dialog).getByRole('button', { name: 'Add employee' }),
    )
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    )
    const creates = fetchMock.mock.calls.filter(
      ([url, init]) => url === '/api/employees' && init?.method === 'POST',
    )
    expect(creates).toHaveLength(2)
    expect(JSON.parse(creates[1][1].body).employee_code).toBe('DEMO-NEW')
  })
  it('rejects fractional yen before sending an edit request', async () => {
    const user = await load()
    await user.click(screen.getByRole('button', { name: 'Edit Alex Morgan' }))
    const dialog = screen.getByRole('dialog')
    await user.selectOptions(within(dialog).getByLabelText('Currency'), 'JPY')
    await user.type(
      within(dialog).getByLabelText('Reason for change'),
      'Currency correction',
    )
    await user.click(
      within(dialog).getByRole('button', { name: 'Save changes' }),
    )
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'JPY salaries must be whole yen',
    )
    expect(mutation('/api/employees/1')).toBeUndefined()
  })
  it('keeps a rejected stale edit visible and prevents accidental overwrite', async () => {
    mutationStatus = 409
    mutationError = 'This record has changed. Refresh and try again.'
    const user = await load()
    await user.click(screen.getByRole('button', { name: 'Edit Alex Morgan' }))
    await user.type(
      screen.getByLabelText('Reason for change'),
      'Annual salary review',
    )
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This record has changed',
    )
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled()
    expect(screen.getByLabelText('Reason for change')).toHaveValue(
      'Annual salary review',
    )
    expect(screen.getByText(/Your changes were not saved/)).toBeInTheDocument()
  })
  it('requires a reason to archive and retains the record', async () => {
    const user = await load()
    await user.click(
      screen.getByRole('button', { name: 'Archive Alex Morgan' }),
    )
    expect(screen.getByText('No records are deleted.')).toBeInTheDocument()
    await user.type(
      screen.getByLabelText('Reason for archiving'),
      'Employment ended',
    )
    await user.click(screen.getByRole('button', { name: 'Archive employee' }))
    await waitFor(() =>
      expect(mutation('/api/employees/1/archive')).toBeDefined(),
    )
    expect(JSON.parse(mutation('/api/employees/1/archive')![1].body)).toEqual({
      version: 3,
      reason: 'Employment ended',
    })
  })
  it('allows restoring but not editing archived employees', async () => {
    const user = await load()
    await user.click(screen.getByRole('button', { name: 'Archived' }))
    await screen.findByRole('button', { name: 'Restore Alex Morgan' })
    expect(
      screen.queryByRole('button', { name: 'Edit Alex Morgan' }),
    ).not.toBeInTheDocument()
    await user.click(
      screen.getByRole('button', { name: 'Restore Alex Morgan' }),
    )
    await user.type(
      screen.getByLabelText('Reason for restoring'),
      'Rejoined the company',
    )
    await user.click(screen.getByRole('button', { name: 'Restore employee' }))
    await waitFor(() =>
      expect(mutation('/api/employees/1/restore')).toBeDefined(),
    )
  })
  it('shows explicit old and new currencies in salary history and can close/reopen', async () => {
    const user = await load()
    await user.click(
      screen.getByRole('button', { name: 'History for Alex Morgan' }),
    )
    expect(
      await screen.findByText('Relocated to the US office'),
    ).toBeInTheDocument()
    expect(
      within(screen.getByRole('dialog')).getByText('EUR 80,000.00'),
    ).toBeInTheDocument()
    expect(
      within(screen.getByRole('dialog')).getByText('USD 85,000.50'),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await user.click(
      screen.getByRole('button', { name: 'History for Alex Morgan' }),
    )
    await screen.findByText('Relocated to the US office')
    expect(historyCalls).toBe(2)
  })
  it('keeps an invalid CSV available for correction after atomic rejection', async () => {
    mutationStatus = 422
    mutationError =
      'Row 2: annual_salary must be positive. No rows were imported.'
    const user = await load()
    await user.click(screen.getByRole('button', { name: 'Import CSV' }))
    const csv =
      'employee_code,name,department,job_title,country,currency,annual_salary,effective_date,reason\nTEST,Alex,Engineering,Engineer,India,INR,-2,2026-01-01,Import'
    await user.type(screen.getByLabelText('CSV contents'), csv)
    await user.click(screen.getByRole('button', { name: 'Import employees' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No rows were imported',
    )
    expect(screen.getByLabelText('CSV contents')).toHaveValue(csv)
    expect(JSON.parse(mutation('/api/employees/import')![1].body)).toEqual({
      csv,
    })
  })
  it('changes analytics grouping while keeping currency separation visible', async () => {
    const user = await load()
    await user.click(screen.getByRole('button', { name: 'Salary insights' }))
    await screen.findByText('Total annual salary')
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Group by' }),
      'department',
    )
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(([url]) =>
          String(url).includes('group_by=department'),
        ),
      ).toBe(true),
    )
    expect(
      await screen.findByText(/Each row is one department and currency pair/),
    ).toBeInTheDocument()
  })
  it('shows a useful error and recovers when a network request is retried', async () => {
    const usual = fetchMock.getMockImplementation()!
    let failed = true
    fetchMock.mockImplementation(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input).startsWith('/api/employees?') && failed)
          throw new TypeError('Failed to fetch')
        return usual(input, init)
      },
    )
    render(<App />)
    expect(
      await screen.findByText('We couldn’t load the records'),
    ).toBeInTheDocument()
    expect(screen.getByText(/The server is unavailable/)).toBeInTheDocument()
    failed = false
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'Try again' }))
    expect(
      await screen.findByRole('button', { name: 'Alex Morgan' }),
    ).toBeInTheDocument()
  })
  it('does not send a create request when a modal is canceled', async () => {
    const user = await load()
    await user.click(screen.getByRole('button', { name: 'Add employee' }))
    await user.type(screen.getByLabelText('Full name'), 'Not Saved')
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(mutation('/api/employees')).toBeUndefined()
    expect(screen.getByRole('button', { name: 'Add employee' })).toHaveFocus()
  })
})

/** Deferred promises make in-flight states deterministic instead of relying on slow timers. */
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

describe('interrupted and recovery flows', () => {
  it.each(['active', 'archived'] as const)(
    'refreshes a stale %s status change and reopens with the latest version',
    async (status) => {
      const usual = fetchMock.getMockImplementation()!
      let version = 3
      fetchMock.mockImplementation(
        async (input: RequestInfo | URL, init?: RequestInit) => {
          const path = String(input)
          if (init?.method === 'POST' && /\/(archive|restore)$/.test(path)) {
            if (version === 3) {
              version = 4
              return json(
                { detail: 'This record has changed. Refresh and try again.' },
                409,
              )
            }
            return json({ ...alex, version: 5 })
          }
          if (path.startsWith('/api/employees?')) {
            return json({
              items: [{ ...alex, status, version }],
              total: 1,
              page: 1,
              page_size: 25,
            })
          }
          return usual(input, init)
        },
      )
      const user = await load()
      const action = status === 'active' ? 'Archive' : 'Restore'
      const reasonLabel =
        status === 'active' ? 'Reason for archiving' : 'Reason for restoring'
      await user.click(
        screen.getByRole('button', { name: `${action} Alex Morgan` }),
      )
      await user.type(
        screen.getByLabelText(reasonLabel),
        'Verified status change',
      )
      await user.click(
        screen.getByRole('button', { name: `${action} employee` }),
      )
      expect(await screen.findByRole('alert')).toHaveTextContent(
        'This change was not saved',
      )
      expect(
        screen.getByRole('button', { name: `${action} employee` }),
      ).toBeDisabled()
      expect(screen.getByLabelText(reasonLabel)).toHaveValue(
        'Verified status change',
      )
      // This immediate mocked refresh can preserve the row; focus returns to its opener.
      await screen.findByRole('button', { name: `${action} Alex Morgan` })
      await user.click(screen.getByRole('button', { name: 'Cancel' }))
      expect(
        screen.getByRole('button', { name: `${action} Alex Morgan` }),
      ).toHaveFocus()
      await user.click(
        screen.getByRole('button', { name: `${action} Alex Morgan` }),
      )
      await user.type(
        screen.getByLabelText(reasonLabel),
        'Verified status change',
      )
      await user.click(
        screen.getByRole('button', { name: `${action} employee` }),
      )
      await waitFor(() =>
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
      )
      const writes = fetchMock.mock.calls.filter(
        ([url, init]) =>
          /\/(archive|restore)$/.test(String(url)) && init?.method === 'POST',
      )
      expect(writes).toHaveLength(2)
      expect(JSON.parse(writes[1][1].body).version).toBe(4)
    },
  )

  it('locks an in-flight draft and all dismissal routes, then allows recovery after failure', async () => {
    const usual = fetchMock.getMockImplementation()!
    const pending = deferred<Response>()
    fetchMock.mockImplementation(
      (input: RequestInfo | URL, init?: RequestInit) => {
        return init?.method === 'PUT' ? pending.promise : usual(input, init)
      },
    )
    const user = await load()
    await user.click(screen.getByRole('button', { name: 'Edit Alex Morgan' }))
    await user.type(
      screen.getByLabelText('Reason for change'),
      'Pending salary review',
    )
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    const dialog = screen.getByRole('dialog')
    expect(screen.getByLabelText(/Annual amount/)).toBeDisabled()
    expect(screen.getByLabelText('Reason for change')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Close dialog' })).toBeDisabled()
    fireEvent(dialog, new Event('cancel', { cancelable: true }))
    fireEvent.click(dialog, { clientX: -10, clientY: -10 })
    expect(dialog).toBeInTheDocument()
    // Repeated submits do not start a second write while the first outcome is unknown.
    fireEvent.submit(dialog.querySelector('form')!)
    expect(
      fetchMock.mock.calls.filter(([, init]) => init?.method === 'PUT'),
    ).toHaveLength(1)
    await act(async () =>
      pending.resolve(json({ detail: 'Temporary server problem' }, 503)),
    )
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Temporary server problem',
    )
    expect(screen.getByLabelText(/Annual amount/)).toBeEnabled()
    expect(screen.getByLabelText('Reason for change')).toHaveValue(
      'Pending salary review',
    )
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('ignores old list and summary JSON that finishes parsing after filters change', async () => {
    const user = await load()
    const usual = fetchMock.getMockImplementation()!
    const oldList = deferred<unknown>()
    const oldSummary = deferred<unknown>()
    const canceledSignals: AbortSignal[] = []
    fetchMock.mockImplementation(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(String(input), 'http://localhost')
        if (url.searchParams.get('currency') === 'USD') {
          canceledSignals.push(init!.signal as AbortSignal)
          // Simulate headers already received: canceling fetch alone cannot undo queued parsing.
          const body = url.pathname === '/api/employees' ? oldList : oldSummary
          return { ok: true, json: () => body.promise }
        }
        if (url.searchParams.get('currency') === 'EUR') {
          return url.pathname === '/api/employees'
            ? json({
                items: [{ ...alex, name: 'Newest result' }],
                total: 1,
                page: 1,
                page_size: 25,
              })
            : json({
                groups: [{ ...groups[0], group: 'EUR', currency: 'EUR' }],
                headcount: 1,
              })
        }
        return usual(input, init)
      },
    )
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Currency' }),
      'USD',
    )
    await waitFor(() => expect(canceledSignals).toHaveLength(2))
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Currency' }),
      'EUR',
    )
    await screen.findByRole('button', { name: 'Newest result' })
    expect(canceledSignals.every((signal) => signal.aborted)).toBe(true)
    await act(async () => {
      oldList.resolve({
        items: [{ ...alex, name: 'Stale result' }],
        total: 1,
        page: 1,
        page_size: 25,
      })
      oldSummary.resolve({ groups, headcount: 2 })
    })
    expect(
      screen.getByRole('button', { name: 'Newest result' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Stale result' }),
    ).not.toBeInTheDocument()
    const overview = screen.getByRole('region', { name: 'Salary overview' })
    expect(within(overview).getAllByText('EUR')).toHaveLength(2)
    expect(within(overview).queryByText('INR')).not.toBeInTheDocument()
  })

  it('does not export the old query while search is still debouncing', async () => {
    const user = await load()
    await user.type(
      screen.getByRole('searchbox', { name: 'Search employees' }),
      'Alex',
    )
    expect(screen.getByRole('button', { name: 'Export CSV' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled()
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Export CSV' })).toBeEnabled(),
    )
  })

  it('rejects oversized files before upload and permits selecting a valid file afterward', async () => {
    const user = await load()
    await user.click(screen.getByRole('button', { name: 'Import CSV' }))
    const oversized = new File(
      ['x'.repeat(2 * 1024 * 1024 + 1)],
      'oversized.csv',
      { type: 'text/csv' },
    )
    await user.upload(screen.getByLabelText('CSV file'), oversized)
    expect(screen.getByRole('alert')).toHaveTextContent('smaller than 2 MB')
    expect(
      screen.getByRole('button', { name: 'Import employees' }),
    ).toBeDisabled()
    expect(mutation('/api/employees/import')).toBeUndefined()
    const csv =
      'employee_code,name,department,job_title,country,currency,annual_salary,effective_date,reason\nDEMO,Demo,Engineering,Engineer,India,INR,85000,2026-01-01,Initial import'
    const valid = new File([csv], 'valid.csv', { type: 'text/csv' })
    // File.text is a browser API absent from this jsdom File implementation.
    Object.defineProperty(valid, 'text', { value: () => Promise.resolve(csv) })
    await user.upload(screen.getByLabelText('CSV file'), valid)
    await waitFor(() =>
      expect(screen.getByLabelText('CSV contents')).toHaveValue(csv),
    )
    expect(
      screen.getByRole('button', { name: 'Import employees' }),
    ).toBeEnabled()
    await user.click(screen.getByRole('button', { name: 'Import employees' }))
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    )
    expect(JSON.parse(mutation('/api/employees/import')![1].body)).toEqual({
      csv,
    })
  })

  it('closes an idle modal via Escape/cancel and returns focus to its opener', async () => {
    const user = await load()
    const opener = screen.getByRole('button', { name: 'Add employee' })
    await user.click(opener)
    fireEvent(
      screen.getByRole('dialog'),
      new Event('cancel', { cancelable: true }),
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(opener).toHaveFocus()
  })
})
