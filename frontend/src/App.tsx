import { useEffect, useMemo, useState } from 'react'
import {
  ApiError,
  apiErrorMessage,
  errorText,
  filterParams,
  request,
} from './api'
import { EmployeeForm } from './EmployeeForm'
import { HistoryDialog, StatusDialog } from './EmployeeActions'
import { ImportDialog } from './ImportDialog'
import { Icon } from './Icon'
import { dateText, initials, money } from './format'
import type {
  Analytics,
  Employee,
  EmployeePage,
  Filters,
  GroupBy,
  Options,
  SalaryGroup,
} from './types'

const INITIAL_FILTERS: Filters = {
  q: '',
  country: '',
  department: '',
  currency: '',
  status: 'active',
}
const EMPTY_OPTIONS: Options = {
  countries: [],
  departments: [],
  currencies: ['EUR', 'GBP', 'INR', 'JPY', 'USD'],
}
type Dialog =
  | { kind: 'edit'; employee?: Employee }
  | { kind: 'history' | 'status'; employee: Employee }
  | { kind: 'import' }
  | null

export default function App() {
  const [view, setView] = useState<'employees' | 'insights'>('employees')
  const [filters, setFilters] = useState<Filters>(INITIAL_FILTERS)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [revision, setRevision] = useState(0)
  const [options, setOptions] = useState<Options>(EMPTY_OPTIONS)
  const [optionsError, setOptionsError] = useState('')
  const [employees, setEmployees] = useState<EmployeePage | null>(null)
  const [summary, setSummary] = useState<Analytics | null>(null)
  const [analytics, setAnalytics] = useState<Analytics | null>(null)
  const [groupBy, setGroupBy] = useState<GroupBy>('country')
  const [loading, setLoading] = useState(true)
  const [summaryLoading, setSummaryLoading] = useState(true)
  const [analyticsLoading, setAnalyticsLoading] = useState(true)
  const [listError, setListError] = useState('')
  const [summaryError, setSummaryError] = useState('')
  const [analyticsError, setAnalyticsError] = useState('')
  const [dialog, setDialog] = useState<Dialog>(null)
  const [notice, setNotice] = useState('')
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState('')
  const query = useMemo(() => filterParams(filters).toString(), [filters])
  const hasFilters = Boolean(
    filters.q ||
    filters.country ||
    filters.department ||
    filters.currency ||
    filters.status !== 'active',
  )
  const searchPending = search.trim() !== filters.q

  useEffect(() => {
    if (search.trim() === filters.q) return
    const timer = setTimeout(() => {
      setFilters((previous) => ({ ...previous, q: search.trim() }))
      setPage(1)
    }, 300)
    return () => clearTimeout(timer)
  }, [search, filters.q])
  useEffect(() => {
    const controller = new AbortController()
    setOptionsError('')
    request<Options>('/api/options', { signal: controller.signal })
      .then(setOptions)
      .catch((error) => {
        if (!controller.signal.aborted) setOptionsError(errorText(error))
      })
    return () => controller.abort()
  }, [revision])
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setListError('')
    request<EmployeePage>(
      `/api/employees?${query}&page=${page}&page_size=${pageSize}`,
      { signal: controller.signal },
    )
      .then((data) => {
        const lastPage = Math.max(1, Math.ceil(data.total / pageSize))
        if (page > lastPage) setPage(lastPage)
        else setEmployees(data)
      })
      .catch((error) => {
        if (!controller.signal.aborted) setListError(errorText(error))
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [query, page, pageSize, revision])
  useEffect(() => {
    const controller = new AbortController()
    setSummaryLoading(true)
    setSummaryError('')
    request<Analytics>(`/api/analytics?${query}&group_by=currency`, {
      signal: controller.signal,
    })
      .then(setSummary)
      .catch((error) => {
        if (!controller.signal.aborted) setSummaryError(errorText(error))
      })
      .finally(() => {
        if (!controller.signal.aborted) setSummaryLoading(false)
      })
    return () => controller.abort()
  }, [query, revision])
  useEffect(() => {
    if (view !== 'insights') return
    const controller = new AbortController()
    setAnalyticsLoading(true)
    setAnalyticsError('')
    request<Analytics>(`/api/analytics?${query}&group_by=${groupBy}`, {
      signal: controller.signal,
    })
      .then(setAnalytics)
      .catch((error) => {
        if (!controller.signal.aborted) setAnalyticsError(errorText(error))
      })
      .finally(() => {
        if (!controller.signal.aborted) setAnalyticsLoading(false)
      })
    return () => controller.abort()
  }, [query, groupBy, revision, view])
  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(''), 7000)
    return () => clearTimeout(timer)
  }, [notice])
  function changeFilter<K extends keyof Filters>(key: K, value: Filters[K]) {
    setFilters((previous) => ({ ...previous, [key]: value }))
    setPage(1)
  }
  function resetFilters() {
    setFilters(INITIAL_FILTERS)
    setSearch('')
    setPage(1)
  }
  function saved(message: string) {
    setDialog(null)
    setNotice(message)
    setRevision((value) => value + 1)
  }
  function refresh() {
    setRevision((value) => value + 1)
  }
  async function exportCsv() {
    if (exporting) return
    setExporting(true)
    setExportError('')
    try {
      const response = await fetch(`/api/employees/export.csv?${query}`)
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as {
          detail?: unknown
        } | null
        throw new ApiError(apiErrorMessage(data?.detail), response.status)
      }
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = 'acme-salaries.csv'
      link.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
      setNotice('Your filtered salary report has been exported.')
    } catch (error) {
      setExportError(
        error instanceof TypeError
          ? 'The export could not reach the server. Please try again.'
          : errorText(error),
      )
    } finally {
      setExporting(false)
    }
  }
  const count = summaryLoading || summaryError ? null : summary?.headcount
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <aside className="sidebar" aria-label="Workspace navigation">
        <a
          className="brand"
          href="#"
          onClick={(event) => {
            event.preventDefault()
            setView('employees')
          }}
          aria-label="ACME home"
        >
          <span className="brand-mark">
            <svg viewBox="0 0 32 32" aria-hidden="true">
              <path d="M4 26 13 6h6l9 20h-8l-4-10-4 10Z" fill="currentColor" />
            </svg>
          </span>
          <span>
            acme<span className="brand-dot">.</span>
          </span>
        </a>
        <div className="workspace-label">
          <div className="workspace-avatar">A</div>
          <div>
            <strong>ACME Corporation</strong>
            <span>People workspace</span>
          </div>
          <Icon name="down" size={15} />
        </div>
        <div className="nav-section-label">WORKSPACE</div>
        <nav>
          <button
            className={`nav-item ${view === 'employees' ? 'active' : ''}`}
            onClick={() => setView('employees')}
            aria-current={view === 'employees' ? 'page' : undefined}
          >
            <Icon name="people" />
            Employees
            {view === 'employees' && <span className="nav-active-dot" />}
          </button>
          <button
            className={`nav-item ${view === 'insights' ? 'active' : ''}`}
            onClick={() => setView('insights')}
            aria-current={view === 'insights' ? 'page' : undefined}
          >
            <Icon name="chart" />
            Salary insights
            {view === 'insights' && <span className="nav-active-dot" />}
          </button>
        </nav>
        <div className="sidebar-note">
          <span className="note-icon">
            <Icon name="shield" size={21} />
          </span>
          <h3>
            Good records.
            <br />
            Better decisions.
          </h3>
          <p>
            Every change has a reason.
            <br />
            Every salary has a history.
          </p>
          <div className="note-rule" />
          <span>Annual base salary only</span>
        </div>
        <div className="sidebar-footer">
          <span className="profile-avatar">HR</span>
          <div>
            <strong>HR workspace</strong>
            <span>Synthetic demo · v1.0</span>
          </div>
          <Icon name="shield" size={17} />
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <span>Workspace</span>
            <Icon name="chevron" size={13} />
            <strong>
              {view === 'employees' ? 'Employees' : 'Salary insights'}
            </strong>
          </div>
          <div className="topbar-right">
            <span className="workspace-badge">
              <span />
              Demo workspace
            </span>
            <span className="profile-avatar small">HR</span>
          </div>
        </header>
        <main id="main-content" tabIndex={-1}>
          <div className="demo-banner">
            <Icon name="info" size={16} />
            <span>
              <strong>Fictional people. Real functionality.</strong> This
              workspace contains synthetic data only. Do not enter real employee
              information.
            </span>
            <span className="demo-tag">DEMO</span>
          </div>
          <section className="page-heading">
            <div>
              <div className="eyebrow">PEOPLE OPERATIONS</div>
              <h1>
                {view === 'employees' ? 'Employee salaries' : 'Salary insights'}
                <span className="heading-dot">.</span>
              </h1>
              <p>
                {view === 'employees'
                  ? 'One place for your people, their pay, and every change along the way.'
                  : 'Understand annual base salaries without mixing currencies.'}
              </p>
            </div>
            <div className="heading-actions">
              <button
                className="button secondary"
                onClick={() => setDialog({ kind: 'import' })}
              >
                <Icon name="upload" size={16} />
                Import CSV
              </button>
              <button
                className="button primary"
                onClick={() => setDialog({ kind: 'edit' })}
              >
                <Icon name="plus" size={17} />
                Add employee
              </button>
            </div>
          </section>
          <section className="summary-section" aria-label="Salary overview">
            <div className="section-label-row">
              <h2>
                Salary overview{' '}
                <span className="subtle">
                  / {hasFilters ? 'Filtered view' : 'Active employees'}
                </span>
              </h2>
              <span className="count-label">
                <Icon name="people" size={15} />
                {count == null ? '—' : count.toLocaleString()} employees in view
              </span>
            </div>
            {summaryError ? (
              <div className="alert error" role="alert">
                Salary overview unavailable. {summaryError}
                <button className="text-button" onClick={refresh}>
                  Retry
                </button>
              </div>
            ) : summaryLoading ? (
              <div
                className="metric-grid"
                aria-label="Loading salary overview"
                aria-busy="true"
              >
                {[0, 1, 2, 3, 4].map((value) => (
                  <div className="metric-card skeleton-card" key={value}>
                    <span className="skeleton short" />
                    <span className="skeleton big" />
                    <span className="skeleton" />
                  </div>
                ))}
              </div>
            ) : summary?.groups.length ? (
              <div className="metric-grid">
                {summary.groups.map((group, index) => (
                  <MetricCard
                    group={group}
                    index={index}
                    key={`${group.group}-${group.currency}`}
                  />
                ))}
              </div>
            ) : (
              <div className="summary-empty">
                No salary totals for this selection. Try changing your filters.
              </div>
            )}
            <div className="summary-footnote">
              <Icon name="info" size={13} />
              Annual gross base salary, grouped by currency. No currency
              conversions or cross-currency totals.
            </div>
          </section>
          <section
            className="data-card"
            aria-label={
              view === 'employees' ? 'Employee directory' : 'Salary breakdown'
            }
          >
            <div className="data-card-heading">
              <div>
                <h2>
                  {view === 'employees'
                    ? 'Employee directory'
                    : 'Salary breakdown'}
                </h2>
                <p>
                  {view === 'employees'
                    ? 'Maintain accurate records, one employee at a time.'
                    : 'Explore headcount and annual base salary by location or team.'}
                </p>
              </div>
              <button
                className="button secondary compact-button"
                onClick={exportCsv}
                disabled={exporting || searchPending}
                title="Download all employees matching the current filters, not only this page"
              >
                <Icon name="download" size={15} />
                {exporting ? 'Exporting…' : 'Export CSV'}
              </button>
            </div>
            {exportError && (
              <div className="alert error inline-alert" role="alert">
                {exportError}
              </div>
            )}
            {optionsError && (
              <div className="alert error inline-alert" role="alert">
                Filter options could not be loaded. {optionsError}
                <button className="text-button" onClick={refresh}>
                  Retry options
                </button>
              </div>
            )}
            <div className="filter-bar">
              <label className="search-input">
                <span className="sr-only">Search employees</span>
                <Icon name="search" size={18} />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search by name or employee ID…"
                  type="search"
                />
              </label>
              <FilterSelect
                label="Country"
                value={filters.country}
                values={options.countries}
                onChange={(value) => changeFilter('country', value)}
              />
              <FilterSelect
                label="Department"
                value={filters.department}
                values={options.departments}
                onChange={(value) => changeFilter('department', value)}
              />
              <FilterSelect
                label="Currency"
                value={filters.currency}
                values={options.currencies}
                onChange={(value) => changeFilter('currency', value)}
              />
            </div>
            <div className="table-context">
              <div
                className="status-tabs"
                role="group"
                aria-label="Employee status"
              >
                {(['active', 'archived', 'all'] as const).map((status) => (
                  <button
                    key={status}
                    aria-pressed={filters.status === status}
                    className={filters.status === status ? 'selected' : ''}
                    onClick={() => changeFilter('status', status)}
                  >
                    {status === 'all'
                      ? 'All employees'
                      : `${status[0].toUpperCase()}${status.slice(1)}`}
                  </button>
                ))}
              </div>
              <div className="context-actions">
                {hasFilters && (
                  <button className="text-button muted" onClick={resetFilters}>
                    Clear filters
                  </button>
                )}
                {view === 'insights' ? (
                  <label className="group-control">
                    Group by
                    <select
                      value={groupBy}
                      onChange={(event) =>
                        setGroupBy(event.target.value as GroupBy)
                      }
                    >
                      <option value="country">Country</option>
                      <option value="department">Department</option>
                      <option value="currency">Currency</option>
                    </select>
                  </label>
                ) : (
                  <span className="results-label">
                    {loading || searchPending
                      ? 'Updating…'
                      : `${(employees?.total || 0).toLocaleString()} records`}
                  </span>
                )}
              </div>
            </div>
            {view === 'employees' ? (
              <>
                {listError ? (
                  <ErrorState message={listError} retry={refresh} />
                ) : loading || searchPending ? (
                  <LoadingTable />
                ) : employees?.items.length ? (
                  <div className="table-scroll">
                    <table className="employee-table">
                      <caption className="sr-only">
                        Employees matching the current filters. Annual base
                        salary is shown in each employee’s currency.
                      </caption>
                      <thead>
                        <tr>
                          <th scope="col">Employee</th>
                          <th scope="col">Department</th>
                          <th scope="col">Country</th>
                          <th scope="col" className="numeric">
                            Annual base salary
                          </th>
                          <th scope="col">Status</th>
                          <th scope="col" className="actions-heading">
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {employees.items.map((employee) => (
                          <tr key={employee.id}>
                            <td>
                              <div className="person-cell">
                                <span
                                  className={`avatar tone-${employee.id % 5}`}
                                >
                                  {initials(employee.name)}
                                </span>
                                <div>
                                  <button
                                    className="person-name"
                                    onClick={() =>
                                      setDialog({
                                        kind:
                                          employee.status === 'archived'
                                            ? 'history'
                                            : 'edit',
                                        employee,
                                      })
                                    }
                                  >
                                    {employee.name}
                                  </button>
                                  <span className="employee-id">
                                    {employee.employee_code}
                                  </span>
                                </div>
                              </div>
                            </td>
                            <td>
                              <span className="department-name">
                                {employee.department}
                              </span>
                              <span className="cell-secondary">
                                {employee.job_title}
                              </span>
                            </td>
                            <td>
                              <span className="country-name">
                                {employee.country}
                              </span>
                            </td>
                            <td className="numeric salary-cell">
                              <strong>
                                {money(
                                  employee.annual_salary,
                                  employee.currency,
                                )}
                              </strong>
                              <span className="cell-secondary">
                                Since {dateText(employee.effective_date)}
                              </span>
                            </td>
                            <td>
                              <span className={`status ${employee.status}`}>
                                <span />
                                {employee.status}
                              </span>
                            </td>
                            <td>
                              <div className="row-actions">
                                <button
                                  className="icon-button"
                                  title={`Salary history for ${employee.name}`}
                                  aria-label={`History for ${employee.name}`}
                                  onClick={() =>
                                    setDialog({ kind: 'history', employee })
                                  }
                                >
                                  <Icon name="history" size={17} />
                                </button>
                                {employee.status === 'active' && (
                                  <button
                                    className="icon-button"
                                    title={`Edit ${employee.name}`}
                                    aria-label={`Edit ${employee.name}`}
                                    onClick={() =>
                                      setDialog({ kind: 'edit', employee })
                                    }
                                  >
                                    <Icon name="edit" size={16} />
                                  </button>
                                )}
                                <button
                                  className="icon-button"
                                  title={`${employee.status === 'active' ? 'Archive' : 'Restore'} ${employee.name}`}
                                  aria-label={`${employee.status === 'active' ? 'Archive' : 'Restore'} ${employee.name}`}
                                  onClick={() =>
                                    setDialog({ kind: 'status', employee })
                                  }
                                >
                                  <Icon
                                    name={
                                      employee.status === 'active'
                                        ? 'archive'
                                        : 'restore'
                                    }
                                    size={17}
                                  />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <EmptyState
                    filtered={hasFilters}
                    clear={resetFilters}
                    add={() => setDialog({ kind: 'edit' })}
                  />
                )}
                <div className="pagination">
                  <div className="pagination-description">
                    {!loading && !listError && employees ? (
                      <span>
                        Showing{' '}
                        <strong>
                          {employees.total ? (page - 1) * pageSize + 1 : 0}–
                          {Math.min(page * pageSize, employees.total)}
                        </strong>{' '}
                        of <strong>{employees.total.toLocaleString()}</strong>{' '}
                        employees
                      </span>
                    ) : (
                      <span>Server-side pagination</span>
                    )}
                    <label>
                      Rows
                      <select
                        aria-label="Rows per page"
                        value={pageSize}
                        onChange={(event) => {
                          setPageSize(Number(event.target.value))
                          setPage(1)
                        }}
                      >
                        <option value={10}>10</option>
                        <option value={25}>25</option>
                        <option value={50}>50</option>
                        <option value={100}>100</option>
                      </select>
                    </label>
                  </div>
                  <div className="page-buttons">
                    <button
                      className="button secondary"
                      aria-label="Previous page"
                      onClick={() => setPage((value) => Math.max(1, value - 1))}
                      disabled={
                        loading || searchPending || page === 1 || !!listError
                      }
                    >
                      <Icon
                        name="chevron"
                        size={15}
                        style={{ transform: 'rotate(180deg)' }}
                      />
                      Previous
                    </button>
                    <span>
                      Page {page} of{' '}
                      {Math.max(
                        1,
                        Math.ceil((employees?.total || 0) / pageSize),
                      )}
                    </span>
                    <button
                      className="button secondary"
                      aria-label="Next page"
                      onClick={() => setPage((value) => value + 1)}
                      disabled={
                        loading ||
                        searchPending ||
                        !!listError ||
                        page * pageSize >= (employees?.total || 0)
                      }
                    >
                      Next
                      <Icon name="chevron" size={15} />
                    </button>
                  </div>
                </div>
              </>
            ) : analyticsError ? (
              <ErrorState message={analyticsError} retry={refresh} />
            ) : analyticsLoading || searchPending ? (
              <LoadingTable />
            ) : analytics?.groups.length ? (
              <div className="table-scroll">
                <table className="analytics-table">
                  <caption className="sr-only">
                    Salary breakdown by {groupBy}. Each currency is calculated
                    separately.
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">
                        {groupBy[0].toUpperCase() + groupBy.slice(1)}
                      </th>
                      <th scope="col">Currency</th>
                      <th scope="col" className="numeric">
                        Headcount
                      </th>
                      <th scope="col" className="numeric">
                        Total annual salary
                      </th>
                      <th scope="col" className="numeric">
                        Average
                      </th>
                      <th scope="col" className="numeric">
                        Minimum
                      </th>
                      <th scope="col" className="numeric">
                        Maximum
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {analytics.groups.map((group) => (
                      <tr key={`${group.group}-${group.currency}`}>
                        <td>
                          <strong>{group.group}</strong>
                        </td>
                        <td>
                          <span className="currency-tag">{group.currency}</span>
                        </td>
                        <td className="numeric">
                          {group.headcount.toLocaleString()}
                        </td>
                        <td className="numeric">
                          <strong>
                            {money(group.total_salary, group.currency)}
                          </strong>
                        </td>
                        <td className="numeric">
                          {money(group.average_salary, group.currency)}
                        </td>
                        <td className="numeric">
                          {money(group.min_salary, group.currency)}
                        </td>
                        <td className="numeric">
                          {money(group.max_salary, group.currency)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="analytics-note">
                  <Icon name="info" size={15} />
                  <span>
                    Each row is one {groupBy} and currency pair. These are
                    descriptive salary statistics, not an assessment of pay
                    equity.
                  </span>
                </div>
              </div>
            ) : (
              <EmptyState
                filtered={hasFilters}
                clear={resetFilters}
                add={() => setDialog({ kind: 'edit' })}
              />
            )}
          </section>
          <footer className="page-footer">
            <span>ACME Salary Workspace</span>
            <span>
              <Icon name="shield" size={13} />
              Traceable changes. Reversible archives. No real employee data.
            </span>
          </footer>
        </main>
      </div>
      {notice && (
        <div className="toast" role="status">
          <span className="toast-check">
            <Icon name="check" size={17} />
          </span>
          <span>{notice}</span>
          <button
            className="icon-button"
            aria-label="Dismiss notification"
            onClick={() => setNotice('')}
          >
            <Icon name="close" size={15} />
          </button>
        </div>
      )}
      {dialog?.kind === 'edit' && (
        <EmployeeForm
          employee={dialog.employee}
          options={options}
          onClose={() => setDialog(null)}
          onSaved={saved}
          onStale={refresh}
        />
      )}
      {dialog?.kind === 'status' && (
        <StatusDialog
          employee={dialog.employee}
          onClose={() => setDialog(null)}
          onSaved={saved}
        />
      )}
      {dialog?.kind === 'history' && (
        <HistoryDialog
          employee={dialog.employee}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'import' && (
        <ImportDialog onClose={() => setDialog(null)} onSaved={saved} />
      )}
    </div>
  )
}

function MetricCard({ group, index }: { group: SalaryGroup; index: number }) {
  return (
    <article className={`metric-card ${index === 0 ? 'featured' : ''}`}>
      <div className="metric-top">
        <span className="currency-tag">{group.currency}</span>
        <span>{group.headcount.toLocaleString()} people</span>
      </div>
      <div className="metric-caption">Total annual base salary</div>
      <div
        className="metric-amount"
        title={money(group.total_salary, group.currency)}
      >
        {money(group.total_salary, group.currency, true).replace(
          `${group.currency} `,
          '',
        )}
        <span>{group.currency}</span>
      </div>
      <div className="metric-bottom">
        <span>Avg. per employee</span>
        <strong title={money(group.average_salary, group.currency)}>
          {money(group.average_salary, group.currency, true).replace(
            `${group.currency} `,
            '',
          )}
        </strong>
      </div>
    </article>
  )
}
function FilterSelect({
  label,
  value,
  values,
  onChange,
}: {
  label: string
  value: string
  values: string[]
  onChange: (value: string) => void
}) {
  return (
    <label className="filter-select">
      <span className="sr-only">{label}</span>
      <select
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">
          All{' '}
          {label === 'Country'
            ? 'countries'
            : label === 'Currency'
              ? 'currencies'
              : 'departments'}
        </option>
        {[...new Set([...values, value].filter(Boolean))].map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
      <Icon name="down" size={14} />
    </label>
  )
}
function LoadingTable() {
  return (
    <div className="loading-table" role="status" aria-label="Loading employees">
      {[0, 1, 2, 3, 4, 5].map((row) => (
        <div className="skeleton-row" key={row}>
          <span className="skeleton circle" />
          <span className="skeleton" />
          <span className="skeleton" />
          <span className="skeleton" />
          <span className="skeleton short" />
        </div>
      ))}
      <span className="sr-only">Loading records…</span>
    </div>
  )
}
function EmptyState({
  filtered,
  clear,
  add,
}: {
  filtered: boolean
  clear: () => void
  add: () => void
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon">
        <Icon name={filtered ? 'search' : 'people'} size={27} />
      </span>
      <h3>
        {filtered ? 'No matching employees' : 'Your directory starts here'}
      </h3>
      <p>
        {filtered
          ? 'Try another search or clear your filters to see more people.'
          : 'Add your first fictional employee or import a CSV to get started.'}
      </p>
      <button className="button secondary" onClick={filtered ? clear : add}>
        {filtered ? 'Clear filters' : 'Add employee'}
      </button>
    </div>
  )
}
function ErrorState({
  message,
  retry,
}: {
  message: string
  retry: () => void
}) {
  return (
    <div className="empty-state error-state" role="alert">
      <span className="empty-icon">
        <Icon name="info" size={27} />
      </span>
      <h3>We couldn’t load the records</h3>
      <p>{message}</p>
      <button className="button secondary" onClick={retry}>
        <Icon name="refresh" size={16} />
        Try again
      </button>
    </div>
  )
}
