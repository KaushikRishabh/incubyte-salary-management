/** API contracts shared by components. Monetary values travel as decimal strings,
 * not JavaScript numbers, so cents survive JSON parsing and editing unchanged.
 */
export type Employee = {
  // Database identity is separate from the human-readable, immutable employee code.
  id: number
  employee_code: string
  name: string
  department: string
  job_title: string
  country: string
  currency: string
  annual_salary: string
  effective_date: string
  status: 'active' | 'archived'
  // Optimistic-lock token: every write must match the version the user last read.
  version: number
}
/** Creation has no version; edits carry one. Status changes have their own endpoints. */
export type EmployeeInput = Omit<Employee, 'id' | 'status' | 'version'> & {
  reason: string
  version?: number
}
/** Immutable audit snapshot: old/new currencies must be displayed independently. */
export type HistoryEntry = {
  id: number
  employee_id: number
  old_salary: string | null
  new_salary: string
  old_currency: string | null
  new_currency: string
  effective_date: string
  reason: string
  changed_at: string
  event: string
}
/** Empty strings mean 'no filter'; active is the default, not equivalent to all. */
export type Filters = {
  q: string
  country: string
  department: string
  currency: string
  status: 'active' | 'archived' | 'all'
}
/** Even country/department groups are split by currency; no FX conversion occurs. */
export type GroupBy = 'currency' | 'country' | 'department'
export type SalaryGroup = {
  group: string
  currency: string
  headcount: number
  total_salary: string
  average_salary: string
  min_salary: string
  max_salary: string
}
export type Analytics = { groups: SalaryGroup[]; headcount: number }
/** Only one server-selected page is retained; total drives pagination, not items.length. */
export type EmployeePage = {
  items: Employee[]
  total: number
  page: number
  page_size: number
}
/** Suggestions for free-text fields and exact-match filters, refreshed after mutations. */
export type Options = {
  countries: string[]
  departments: string[]
  currencies: string[]
}
