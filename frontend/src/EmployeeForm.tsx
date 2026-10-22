import { useState } from 'react'
import type { FormEvent } from 'react'
import { ApiError, errorText, request } from './api'
import { today } from './format'
import { Icon } from './Icon'
import { Modal } from './Modal'
import type { Employee, EmployeeInput, Options } from './types'

/** One controlled form handles creation and updates. onSaved closes and refreshes
 * the parent; onStale refreshes its data without discarding the user's unsaved inputs.
 */
export function EmployeeForm({
  employee,
  options,
  onClose,
  onSaved,
  onStale,
}: {
  employee?: Employee
  options: Options
  onClose: () => void
  onSaved: (message: string) => void
  onStale: () => void
}) {
  // Initialize once from the selected record. The dialog unmounts when closed, so
  // reopening starts with the latest version instead of a previous draft.
  const [form, setForm] = useState<EmployeeInput>({
    employee_code: employee?.employee_code || '',
    name: employee?.name || '',
    department: employee?.department || '',
    job_title: employee?.job_title || '',
    country: employee?.country || '',
    currency: employee?.currency || 'USD',
    // Existing JPY values may be serialized with .00; whole-yen editing must not reject them.
    annual_salary:
      employee?.currency === 'JPY'
        ? employee.annual_salary.split('.')[0]
        : employee?.annual_salary || '',
    effective_date: employee?.effective_date || today(),
    reason: '',
    ...(employee ? { version: employee.version } : {}),
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  // A conflict must never be retried with a newer token and silently overwrite another edit.
  const [stale, setStale] = useState(false)
  // Generic key/value typing prevents assigning (for example) a string to version.
  function field<K extends keyof EmployeeInput>(
    name: K,
    value: EmployeeInput[K],
  ) {
    setForm((previous) => ({ ...previous, [name]: value }))
  }
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (busy || stale) return
    // These checks improve feedback only; the API independently enforces all constraints.
    // Keep the payload as a string. Number is used solely for bounded comparisons.
    if (
      !/^\d+(\.\d{1,2})?$/.test(form.annual_salary) ||
      Number(form.annual_salary) <= 0
    ) {
      setError(
        'Enter a positive annual salary with no more than two decimal places.',
      )
      return
    }
    if (form.currency === 'JPY' && !/^\d+$/.test(form.annual_salary)) {
      setError('JPY salaries must be whole yen, without fractional amounts.')
      return
    }
    if (Number(form.annual_salary) > 1_000_000_000) {
      setError(
        'Annual salary cannot exceed 1,000,000,000 in the selected currency.',
      )
      return
    }
    setBusy(true)
    setError('')
    try {
      await request<Employee>(
        employee ? `/api/employees/${employee.id}` : '/api/employees',
        { method: employee ? 'PUT' : 'POST', body: JSON.stringify(form) },
      )
      onSaved(
        employee
          ? `${form.name}'s record has been updated.`
          : `${form.name} has been added to the directory.`,
      )
    } catch (failure) {
      setError(errorText(failure))
      // A create-time 409 is a duplicate ID, not a stale edit: allow correction and retry.
      if (employee && failure instanceof ApiError && failure.status === 409) {
        setStale(true)
        onStale()
      }
    } finally {
      setBusy(false)
    }
  }
  // Retain the selected currency if the options request is unavailable or incomplete.
  const currencies = [...new Set([...options.currencies, form.currency])]
    .filter(Boolean)
    .sort()
  return (
    <Modal
      title={employee ? 'Edit employee' : 'Add employee'}
      description={
        employee
          ? 'Update the record. Every change keeps an audit trail.'
          : 'Create a fictional employee in this demo workspace.'
      }
      onClose={onClose}
      busy={busy}
      wide
    >
      <form onSubmit={submit} className="employee-form">
        {/* Lock inputs as well as dismissal: users must not edit a draft already in flight. */}
        <fieldset className="dialog-body" disabled={busy}>
          {error && (
            <div className="alert error" role="alert">
              <Icon name="info" />
              <div>
                {error}
                {stale && (
                  <p>
                    Close this dialog and reopen the latest record before
                    editing. Your changes were not saved.
                  </p>
                )}
              </div>
            </div>
          )}
          <div className="form-section-heading">
            <span>01</span>
            <h3>Employee details</h3>
          </div>
          {/* Wrapping labels give every input an accessible name; native required/length
              constraints handle basic validation before the submit handler runs. */}
          <div className="form-grid">
            <label>
              Full name
              <input
                autoFocus
                required
                maxLength={120}
                value={form.name}
                onChange={(event) => field('name', event.target.value)}
                placeholder="e.g. Alex Morgan"
                autoComplete="off"
              />
            </label>
            <label>
              Employee ID
              <input
                required
                disabled={!!employee}
                maxLength={32}
                value={form.employee_code}
                onChange={(event) => field('employee_code', event.target.value)}
                placeholder="e.g. ACME-10001"
                autoComplete="off"
              />
              {employee && (
                <span className="field-hint">
                  The employee ID cannot be changed.
                </span>
              )}
            </label>
            <label>
              Department
              <input
                required
                list="department-options"
                maxLength={100}
                value={form.department}
                onChange={(event) => field('department', event.target.value)}
                placeholder="e.g. Engineering"
              />
              <datalist id="department-options">
                {options.departments.map((value) => (
                  <option key={value} value={value} />
                ))}
              </datalist>
            </label>
            <label>
              Job title
              <input
                required
                maxLength={100}
                value={form.job_title}
                onChange={(event) => field('job_title', event.target.value)}
                placeholder="e.g. Software Engineer"
              />
            </label>
            <label className="full-width">
              Country
              <input
                required
                list="country-options"
                maxLength={100}
                value={form.country}
                onChange={(event) => field('country', event.target.value)}
                placeholder="e.g. United States"
              />
              <datalist id="country-options">
                {options.countries.map((value) => (
                  <option key={value} value={value} />
                ))}
              </datalist>
            </label>
          </div>
          <div className="form-section-heading">
            <span>02</span>
            <h3>Annual base salary</h3>
          </div>
          {/* Decimal salary text avoids browser number-input coercion/exponent notation.
              Date bounds prevent future scheduling or reversing the current effective date. */}
          <div className="form-grid compensation-fields">
            <label>
              Currency
              <select
                required
                value={form.currency}
                onChange={(event) => field('currency', event.target.value)}
              >
                {currencies.map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </label>
            <label>
              Annual amount
              <input
                required
                inputMode="decimal"
                value={form.annual_salary}
                onChange={(event) => field('annual_salary', event.target.value)}
                placeholder="85000.00"
                maxLength={20}
              />
              <span className="field-hint">
                {form.currency === 'JPY' ? 'Whole yen only. ' : ''}Gross base
                salary, excluding bonuses and benefits.
              </span>
            </label>
            <label>
              Effective date
              <input
                required
                type="date"
                min={employee?.effective_date}
                max={today()}
                value={form.effective_date}
                onChange={(event) =>
                  field('effective_date', event.target.value)
                }
              />
              <span className="field-hint">
                Today or earlier. Future scheduling is not supported.
              </span>
            </label>
            <label className="full-width">
              Reason for change
              <textarea
                required
                minLength={3}
                maxLength={500}
                rows={3}
                value={form.reason}
                onChange={(event) => field('reason', event.target.value)}
                placeholder={
                  employee
                    ? 'Explain this change for the audit trail…'
                    : 'e.g. Initial employee record'
                }
              />
            </label>
          </div>
        </fieldset>
        <footer className="dialog-footer">
          <span>
            <Icon name="shield" size={15} /> Changes are recorded
          </span>
          <div>
            <button
              type="button"
              className="button secondary"
              onClick={onClose}
              disabled={busy}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="button primary"
              disabled={busy || stale}
            >
              {busy ? 'Saving…' : employee ? 'Save changes' : 'Add employee'}
              {!busy && <Icon name="check" size={16} />}
            </button>
          </div>
        </footer>
      </form>
    </Modal>
  )
}
