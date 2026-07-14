export type PaymentType = 'Full Payment' | 'Monthly' | 'Split'
export type PaymentStatus = 'paid' | 'upcoming' | 'overdue' | 'due-today' | 'critical' | 'partial'
export type RecordStatus = 'active' | 'inactive'
export type PaymentMode = 'Cash' | 'UPI' | 'Card' | 'Bank Transfer' | 'Cheque' | 'Razorpay' | 'Razorpay Link' | 'Razorpay QR'

export interface FeePlanInstallment {
  amount: number
  dueDate: string
}

export interface StudentFeePlan {
  type: PaymentType
  agreedTotalFee: number
  amountPaidNow?: number
  monthlyFeeAmount?: number
  startDate?: string
  installments?: FeePlanInstallment[]
}

export type ExpenseCategory =
  | 'Rent'
  | 'Electricity'
  | 'Internet'
  | 'Teacher Salary'
  | 'Books'
  | 'Stationery'
  | 'Marketing'
  | 'Miscellaneous'
  | 'Other'

export interface FeeScheduleItem {
  id: string
  label: string
  amount: number
  dueDate: string
  status: PaymentStatus
  paymentId?: string
  paidAmount?: number
}

export interface Student {
  id: string
  name: string
  class: number
  batch: string
  parentPhone: string
  paymentType: PaymentType
  totalFee: number
  paid: number
  pending: number
  status: RecordStatus
  joined: string
  notes: string
  photoUrl?: string
  feePlan?: StudentFeePlan
  dueDay?: number
  monthlyFee?: number
  feeSchedule: FeeScheduleItem[]
  parentName?: string
  studentPhone?: string
  whatsapp?: string
  address?: string
  promiseToPayDate?: string
  parentId?: string
  createdAt: string
  updatedAt: string
}

export interface Payment {
  id: string
  studentId: string
  studentName: string
  amount: number
  date: string
  label: string
  status: PaymentStatus
  paymentMode: PaymentMode
  notes: string
  receiptNumber: string
  parentId?: string
  parentName?: string
  parentPaymentId?: string
  createdAt: string
}

export interface Expense {
  id: string
  category: ExpenseCategory
  amount: number
  date: string
  note: string
  billImageUrl?: string
  createdAt: string
  updatedAt: string
  // Recurring Fields
  isRecurring?: boolean
  recurringExpenseId?: string
  status?: 'paid' | 'unpaid'
  paidAmount?: number
  durationMonths?: number
  startMonth?: number
  startYear?: number
  startDate?: string
  endDate?: string
}

export interface Family {
  id: string
  parentName: string
  parentPhone: string
  parentWhatsApp: string
  studentIds: string[]
  combinedAgreedFee: number
  createdAt: string
  updatedAt: string
}

export interface AuditLog {
  id: string
  date: string
  time: string
  user: string
  action: string
  targetId: string
  fieldName: string
  oldValue: string
  newValue: string
  createdAt: string
}

export interface CashTransaction {
  id: string
  date: string
  amount: number
  type: 'deposit' | 'withdrawal' | 'adjustment'
  adjustmentMode?: 'increase' | 'decrease'
  reason: string
  notes?: string
  createdBy: string
  createdAt: string
}

export interface TeachingRecord {
  id: string
  classId: number
  subject: string
  teacherId?: string // Optional for backward compatibility before migration
  teacherName: string
  date: string
  chapter: string
  topic: string
  lectureNumber: number
  durationMin?: number
  homework?: string
  notes?: string
  createdAt: string
  updatedAt: string
}

export interface TeacherProfile {
  id: string
  displayName: string
  status: 'active' | 'inactive'
  role?: string
  createdAt: string
  updatedAt: string
}

export interface AppSettings {
  coachingName: string
  ownerName: string
  phone: string
  address: string
  openingBalance?: number
  reminders: {
    todaysDueFees: boolean
    tomorrowsDueFees: boolean
    rentAndSalary: boolean
    utilities: boolean
  }
}

export interface TaskItem {
  id: string
  label: string
  meta: string
  done: boolean
  sourceId?: string
  sourceType?: 'payment' | 'expense' | 'task'
}

export interface MonthlySeriesPoint {
  month: string
  income: number
  expense: number
}

export interface DashboardStats {
  totalStudents: number
  activeStudents: number
  pendingFees: number
  monthCollection: number
  monthExpenses: number
  netProfit: number
  todayDue: number
  todayCollection: number
  currentMonthExpected: number
  nextMonthExpected: number
  currentMonthMonthlyExpected: number
  currentMonthSplitExpected: number
  currentMonthFullExpected: number
  currentMonthTotalExpected: number
  totalCoachingFeeValue: number
  totalRemainingRevenue: number
  totalRevenueCollected: number
  annualExpenseForecast: number
}

export interface SearchResult {
  id: string
  type: 'student' | 'payment' | 'expense'
  title: string
  subtitle: string
  meta?: string
  href: string
}

export interface NotificationItem {
  id: string
  label: string
  tone: 'warning' | 'neutral' | 'danger'
  time: string
}

export const DEFAULT_BATCHES = [
  'Morning A',
  'Morning B',
  'Afternoon',
  'Evening A',
  'Evening B',
] as const

export const EXPENSE_CATEGORIES: ExpenseCategory[] = [
  'Rent',
  'Electricity',
  'Internet',
  'Teacher Salary',
  'Books',
  'Stationery',
  'Marketing',
  'Miscellaneous',
  'Other',
]

export const PAYMENT_MODES: PaymentMode[] = [
  'Cash',
  'UPI',
  'Card',
  'Bank Transfer',
  'Cheque',
]

export const DEFAULT_CLASS_FEES: Record<number, number> = {
  1: 12000,
  2: 12000,
  3: 14400,
  4: 14400,
  5: 16800,
  6: 18000,
  7: 21600,
  8: 24000,
  9: 30000,
  10: 36000,
  11: 42000,
  12: 48000,
}

export function formatINR(amount: number) {
  return `₹${amount.toLocaleString('en-IN')}`
}

export function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .slice(0, 2)
    .join('')
}

export function toDate(input: string) {
  return new Date(`${input}T00:00:00`)
}

export function todayISO(now = new Date()) {
  return now.toISOString().slice(0, 10)
}

export function monthKey(isoDate: string) {
  return isoDate.slice(0, 7)
}

export function sameDay(a: string, b: string) {
  return a.slice(0, 10) === b.slice(0, 10)
}

export function formatLongDate(isoDate: string) {
  return toDate(isoDate).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export function formatMonthLabel(isoMonth: string) {
  const [year, month] = isoMonth.split('-').map(Number)
  return new Date(year, month - 1, 1).toLocaleDateString('en-IN', {
    month: 'short',
    year: 'numeric',
  })
}

export function addMonths(isoDate: string, months: number) {
  const base = toDate(isoDate)
  const next = new Date(base)
  next.setMonth(base.getMonth() + months)
  return todayISO(next)
}

export function startOfMonthISO(now = new Date()) {
  return todayISO(new Date(now.getFullYear(), now.getMonth(), 1))
}

export function endOfMonthISO(now = new Date()) {
  return todayISO(new Date(now.getFullYear(), now.getMonth() + 1, 0))
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

export function paymentTypeLabel(paymentType: PaymentType) {
  if (paymentType === 'Monthly') return 'Monthly Fees'
  if (paymentType === 'Split') return 'Split Payment'
  return 'Full Payment'
}

export function deriveClassFee(classNumber: number) {
  return DEFAULT_CLASS_FEES[classNumber] ?? 18000 + classNumber * 1200
}

export function splitEvenly(total: number, parts: number) {
  const base = Math.floor(total / parts)
  const remainder = total - base * parts
  return Array.from({ length: parts }, (_, index) => base + (index < remainder ? 1 : 0))
}
