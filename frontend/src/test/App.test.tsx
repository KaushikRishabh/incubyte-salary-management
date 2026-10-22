import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from '../App'
import type { Employee } from '../types'

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
const load = async () => {
  render(<App />)
  await screen.findByRole('button', { name: 'Alex Morgan' })
  return userEvent.setup()
}
const mutation = (path: string) =>
  fetchMock.mock.calls.find(
    ([url, init]) => String(url) === path && init?.method,
  )

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
