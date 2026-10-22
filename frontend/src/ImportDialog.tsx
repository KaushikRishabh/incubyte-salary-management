import { useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import { errorText, request } from './api'
import { Icon } from './Icon'
import { Modal } from './Modal'
import { today } from './format'

export const CSV_HEADERS =
  'employee_code,name,department,job_title,country,currency,annual_salary,effective_date,reason'
function downloadTemplate() {
  const blob = new Blob(
    [
      `${CSV_HEADERS}\nDEMO-10001,Alex Morgan,Engineering,Software Engineer,United States,USD,85000.00,${today()},Initial import\n`,
    ],
    { type: 'text/csv;charset=utf-8' },
  )
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'acme-employee-import-template.csv'
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
export function ImportDialog({
  onClose,
  onSaved,
}: {
  onClose: () => void
  onSaved: (message: string) => void
}) {
  const [csv, setCsv] = useState('')
  const [filename, setFilename] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [reading, setReading] = useState(false)
  async function loadFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    setError('')
    setCsv('')
    setFilename('')
    if (file.size > 2 * 1024 * 1024) {
      setError(
        'Use a CSV file smaller than 2 MB. Split larger imports into smaller files.',
      )
      event.target.value = ''
      return
    }
    setReading(true)
    try {
      setCsv(await file.text())
      setFilename(file.name)
    } catch {
      setError('This file could not be read. Try selecting it again.')
    } finally {
      setReading(false)
    }
  }
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (busy || reading || !csv.trim()) return
    setBusy(true)
    setError('')
    try {
      const result = await request<{ created: number }>(
        '/api/employees/import',
        { method: 'POST', body: JSON.stringify({ csv }) },
      )
      onSaved(
        `${result.created.toLocaleString()} employee${result.created === 1 ? '' : 's'} imported successfully.`,
      )
    } catch (failure) {
      setError(errorText(failure))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal
      title="Import employees"
      description="Add fictional employees from a CSV. All rows are checked before anything is saved."
      onClose={onClose}
      busy={busy || reading}
      wide
    >
      <form onSubmit={submit}>
        <div className="dialog-body">
          <div className="alert info">
            <Icon name="shield" />
            <div>
              <strong>Synthetic data only</strong>
              <span>Do not upload real employee or payroll information.</span>
            </div>
          </div>
          {error && (
            <div className="alert error" role="alert">
              {error}
            </div>
          )}
          <div className="import-step">
            <span className="step-number">1</span>
            <div>
              <strong>Start with the right columns</strong>
              <p>
                Use the template. Employee IDs must be unique; existing records
                are not overwritten.
              </p>
              <button
                type="button"
                className="text-button"
                onClick={downloadTemplate}
              >
                <Icon name="download" size={15} />
                Download CSV template
              </button>
            </div>
          </div>
          <div className="import-step">
            <span className="step-number">2</span>
            <div>
              <strong>Choose a CSV or paste its contents</strong>
              <p>UTF-8 CSV, up to 2 MB. Dates use YYYY-MM-DD.</p>
            </div>
          </div>
          <label className="file-drop">
            <Icon name="upload" size={26} />
            <strong>
              {reading ? 'Reading file…' : filename || 'Select a CSV file'}
            </strong>
            <span>Choose a file from your computer</span>
            <input
              aria-label="CSV file"
              type="file"
              accept=".csv,text/csv"
              onChange={loadFile}
              disabled={busy || reading}
            />
          </label>
          <label>
            CSV contents
            <textarea
              className="csv-input"
              rows={6}
              value={csv}
              onChange={(event) => {
                setCsv(event.target.value)
                setFilename('')
              }}
              placeholder={CSV_HEADERS}
              spellCheck={false}
              maxLength={2097152}
              disabled={busy || reading}
            />
          </label>
          <p className="field-hint">
            If any row is invalid, the entire import is rejected. Correct the
            errors and try again.
          </p>
        </div>
        <footer className="dialog-footer">
          <span>
            <Icon name="file" size={15} /> Creates new records only
          </span>
          <div>
            <button
              type="button"
              className="button secondary"
              onClick={onClose}
              disabled={busy || reading}
            >
              Cancel
            </button>
            <button
              className="button primary"
              type="submit"
              disabled={busy || reading || !csv.trim()}
            >
              {busy ? 'Validating & importing…' : 'Import employees'}
              {!busy && <Icon name="upload" size={16} />}
            </button>
          </div>
        </footer>
      </form>
    </Modal>
  )
}
