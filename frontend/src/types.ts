export type Employee = {
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
  version: number
}
export type EmployeeInput = Omit<Employee, 'id' | 'status' | 'version'> & {
  reason: string
  version?: number
}
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
export type Filters = {
  q: string
  country: string
  department: string
  currency: string
  status: 'active' | 'archived' | 'all'
}
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
export type EmployeePage = {
  items: Employee[]
  total: number
  page: number
  page_size: number
}
export type Options = {
  countries: string[]
  departments: string[]
  currencies: string[]
}
