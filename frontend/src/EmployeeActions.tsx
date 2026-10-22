import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { ApiError, errorText, request } from './api'
import { dateText, initials, money } from './format'
import { Icon } from './Icon'
import { Modal } from './Modal'
import type { Employee, HistoryEntry } from './types'

/** Archive/restore is a reversible, versioned write with a mandatory audit reason. */
export function StatusDialog({
  employee,
  onClose,
  onSaved,
  onStale,
}: {
  employee: Employee
  onClose: () => void
  onSaved: (message: string) => void
  onStale: () => void
}) {
  const restoring = employee.status === 'archived'
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [stale, setStale] = useState(false)
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (busy || stale) return
    setBusy(true)
    setError('')
    try {
      await request(
        `/api/employees/${employee.id}/${restoring ? 'restore' : 'archive'}`,
        {
          method: 'POST',
          body: JSON.stringify({ version: employee.version, reason }),
        },
      )
      onSaved(
        `${employee.name} has been ${restoring ? 'restored' : 'archived'}.`,
      )
    } catch (failure) {
      setError(errorText(failure))
      // Refresh the parent snapshot on conflict, but keep the reason visible for recovery.
      // Merely closing/reopening without refreshing would repeatedly submit the old version.
      if (failure instanceof ApiError && failure.status === 409) {
        setStale(true)
        onStale()
      }
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal
      title={restoring ? 'Restore employee' : 'Archive employee'}
      description={
        restoring
          ? 'Return this employee to your active directory.'
          : 'Keep the record and history, but remove it from active totals.'
      }
      onClose={onClose}
      busy={busy}
    >
      <form onSubmit={submit}>
        <div className="dialog-body">
          <div className="employee-preview">
            <span className="avatar">{initials(employee.name)}</span>
            <div>
              <strong>{employee.name}</strong>
              <span>
                {employee.employee_code} · {employee.department}
              </span>
            </div>
          </div>
          {error && (
            <div className="alert error" role="alert">
              {error}
              {stale && (
                <p>
                  Close this dialog and reopen the latest record before trying
                  again. This change was not saved.
                </p>
              )}
            </div>
          )}
          <label>
            Reason for {restoring ? 'restoring' : 'archiving'}
            <textarea
              autoFocus
              required
              minLength={3}
              maxLength={500}
              rows={3}
              placeholder={
                restoring
                  ? 'e.g. Rejoined the company'
                  : 'e.g. Employment ended'
              }
              disabled={busy}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </label>
          <p className="field-hint">
            This action is reversible and will appear in the employee’s history.
          </p>
        </div>
        <footer className="dialog-footer">
          <span>No records are deleted.</span>
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
              className={`button ${restoring ? 'primary' : 'danger'}`}
              disabled={busy || stale}
            >
              {busy
                ? 'Saving…'
                : restoring
                  ? 'Restore employee'
                  : 'Archive employee'}
            </button>
          </div>
        </footer>
      </form>
    </Modal>
  )
}

/** Fetch the audit trail on each open. Retrying replaces this read, never writes history. */
export function HistoryDialog({
  employee,
  onClose,
}: {
  employee: Employee
  onClose: () => void
}) {
  const [items, setItems] = useState<HistoryEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    // Closing, selecting another employee, or retrying invalidates the previous read.
    const controller = new AbortController()
    setLoading(true)
    setError('')
    request<{ items: HistoryEntry[] }>(
      `/api/employees/${employee.id}/history`,
      { signal: controller.signal },
    )
      .then((data) => {
        if (!controller.signal.aborted) setItems(data.items)
      })
      .catch((failure) => {
        if (!controller.signal.aborted) setError(errorText(failure))
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [employee.id, retry])
  return (
    <Modal
      title="Employee history"
      description="A traceable record of salary and employment changes."
      onClose={onClose}
      wide
    >
      <div className="dialog-body history-body">
        <div className="employee-preview">
          <span className="avatar">{initials(employee.name)}</span>
          <div>
            <strong>{employee.name}</strong>
            <span>
              {employee.employee_code} · {employee.job_title}
            </span>
          </div>
          <span className={`status ${employee.status}`}>{employee.status}</span>
        </div>
        {loading ? (
          <div className="empty-state compact" role="status">
            <span className="spinner" />
            <p>Loading the audit trail…</p>
          </div>
        ) : error ? (
          <div className="alert error" role="alert">
            {error}
            <button
              className="text-button"
              onClick={() => setRetry((value) => value + 1)}
            >
              Try again
            </button>
          </div>
        ) : !items.length ? (
          <div className="empty-state compact">
            <Icon name="history" size={30} />
            <h3>No history yet</h3>
            <p>Saved changes will appear here.</p>
          </div>
        ) : (
          <ol className="timeline">
            {/* The API returns newest first. Preserve each event's currencies rather than
                applying the employee's current currency to historical amounts. */}
            {items.map((entry, index) => (
              <li key={entry.id}>
                <div className="timeline-marker">
                  <Icon name={index === 0 ? 'check' : 'history'} size={14} />
                </div>
                <div className="timeline-content">
                  <div className="timeline-title">
                    <strong>{eventName(entry.event)}</strong>
                    <time dateTime={entry.changed_at}>
                      {dateText(entry.changed_at)}
                    </time>
                  </div>
                  <div className="salary-change">
                    {entry.old_salary != null && (
                      <>
                        <span>
                          {money(
                            entry.old_salary,
                            entry.old_currency || entry.new_currency,
                          )}
                        </span>
                        <Icon name="chevron" size={14} />
                      </>
                    )}
                    <strong>
                      {money(entry.new_salary, entry.new_currency)}
                    </strong>
                  </div>
                  <p className="history-reason">{entry.reason}</p>
                  <span className="field-hint">
                    Effective {dateText(entry.effective_date)} · Annual base
                    salary
                  </span>
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
      <footer className="dialog-footer">
        <span>
          <Icon name="shield" size={15} /> History is preserved
        </span>
        <button className="button secondary" onClick={onClose}>
          Close
        </button>
      </footer>
    </Modal>
  )
}
/** Friendly labels tolerate legacy event spellings and readable future event names. */
function eventName(event: string) {
  return (
    (
      {
        created: 'Employee created',
        create: 'Employee created',
        updated: 'Record updated',
        update: 'Record updated',
        salary_changed: 'Salary updated',
        archived: 'Employee archived',
        archive: 'Employee archived',
        restored: 'Employee restored',
        restore: 'Employee restored',
        imported: 'Employee imported',
      } as Record<string, string>
    )[event] || event.replaceAll('_', ' ')
  )
}
