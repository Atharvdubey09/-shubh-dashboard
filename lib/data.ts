export type PaymentType = 'Full Payment' | 'Monthly' | 'Split'
export type PaymentStatus = 'paid' | 'upcoming' | 'overdue'

export interface Payment {
  id: string
  studentId: string
  studentName: string
  amount: number
  date: string // ISO date
  label: string
  status: PaymentStatus
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
  status: 'active' | 'inactive'
  joined: string
  notes: string
}

export interface Expense {
  id: string
  category:
    | 'Rent'
    | 'Electricity'
    | 'Internet'
    | 'Teacher Salary'
    | 'Books'
    | 'Stationery'
    | 'Other'
  amount: number
  date: string
  note: string
}

export const students: Student[] = [
  { id: 's1', name: 'Rahul Sharma', class: 8, batch: 'Morning A', parentPhone: '98765 43210', paymentType: 'Monthly', totalFee: 24000, paid: 21500, pending: 2500, status: 'active', joined: 'Apr 2025', notes: 'Strong in Maths. Needs attention in English grammar.' },
  { id: 's2', name: 'Pooja Verma', class: 10, batch: 'Evening B', parentPhone: '99887 66554', paymentType: 'Split', totalFee: 36000, paid: 31000, pending: 5000, status: 'active', joined: 'Mar 2025', notes: 'Board exam batch. Extra doubt sessions on Saturday.' },
  { id: 's3', name: 'Aarav Gupta', class: 6, batch: 'Morning A', parentPhone: '91234 56789', paymentType: 'Full Payment', totalFee: 18000, paid: 18000, pending: 0, status: 'active', joined: 'Apr 2025', notes: 'Fee fully paid for the year.' },
  { id: 's4', name: 'Sneha Patel', class: 9, batch: 'Evening A', parentPhone: '90123 45678', paymentType: 'Monthly', totalFee: 30000, paid: 22500, pending: 7500, status: 'active', joined: 'Jan 2025', notes: 'Parents requested monthly progress report.' },
  { id: 's5', name: 'Vivaan Singh', class: 4, batch: 'Afternoon', parentPhone: '98700 12345', paymentType: 'Monthly', totalFee: 14400, paid: 13200, pending: 1200, status: 'active', joined: 'Jun 2025', notes: '' },
  { id: 's6', name: 'Ananya Joshi', class: 10, batch: 'Evening B', parentPhone: '99001 22334', paymentType: 'Split', totalFee: 36000, paid: 24000, pending: 12000, status: 'active', joined: 'Feb 2025', notes: 'Second installment due mid-July.' },
  { id: 's7', name: 'Kabir Mehta', class: 7, batch: 'Morning B', parentPhone: '98111 22333', paymentType: 'Monthly', totalFee: 21600, paid: 21600, pending: 0, status: 'active', joined: 'Apr 2025', notes: '' },
  { id: 's8', name: 'Ishita Rao', class: 2, batch: 'Afternoon', parentPhone: '97654 32109', paymentType: 'Full Payment', totalFee: 12000, paid: 12000, pending: 0, status: 'active', joined: 'May 2025', notes: 'Youngest sibling of Sneha (Class 9).' },
  { id: 's9', name: 'Arjun Nair', class: 9, batch: 'Evening A', parentPhone: '96543 21098', paymentType: 'Monthly', totalFee: 30000, paid: 25000, pending: 5000, status: 'inactive', joined: 'Dec 2024', notes: 'On break for one month — family travel.' },
  { id: 's10', name: 'Diya Kulkarni', class: 5, batch: 'Morning A', parentPhone: '95432 10987', paymentType: 'Monthly', totalFee: 16800, paid: 16800, pending: 0, status: 'active', joined: 'Apr 2025', notes: '' },
]

export const upcomingPayments: Payment[] = [
  { id: 'p1', studentId: 's1', studentName: 'Rahul Sharma', amount: 2500, date: '2026-07-11', label: 'Monthly Fees', status: 'upcoming' },
  { id: 'p2', studentId: 's2', studentName: 'Pooja Verma', amount: 5000, date: '2026-07-13', label: 'Split Payment', status: 'upcoming' },
  { id: 'p3', studentId: 's5', studentName: 'Vivaan Singh', amount: 1200, date: '2026-07-14', label: 'Monthly Fees', status: 'upcoming' },
  { id: 'p4', studentId: 's4', studentName: 'Sneha Patel', amount: 2500, date: '2026-07-15', label: 'Monthly Fees', status: 'upcoming' },
  { id: 'p5', studentId: 's6', studentName: 'Ananya Joshi', amount: 6000, date: '2026-07-16', label: 'Split Payment', status: 'upcoming' },
]

export const paymentHistory: Payment[] = [
  { id: 'h1', studentId: 's1', studentName: 'Rahul Sharma', amount: 2500, date: '2026-06-10', label: 'Monthly Fees — June', status: 'paid' },
  { id: 'h2', studentId: 's1', studentName: 'Rahul Sharma', amount: 2500, date: '2026-05-10', label: 'Monthly Fees — May', status: 'paid' },
  { id: 'h3', studentId: 's1', studentName: 'Rahul Sharma', amount: 2500, date: '2026-04-10', label: 'Monthly Fees — April', status: 'paid' },
  { id: 'h4', studentId: 's2', studentName: 'Pooja Verma', amount: 12000, date: '2026-03-05', label: 'Installment 1 of 3', status: 'paid' },
  { id: 'h5', studentId: 's2', studentName: 'Pooja Verma', amount: 12000, date: '2026-05-05', label: 'Installment 2 of 3', status: 'paid' },
  { id: 'h6', studentId: 's4', studentName: 'Sneha Patel', amount: 2500, date: '2026-06-15', label: 'Monthly Fees — June', status: 'paid' },
  { id: 'h7', studentId: 's6', studentName: 'Ananya Joshi', amount: 12000, date: '2026-02-20', label: 'Installment 1 of 3', status: 'paid' },
  { id: 'h8', studentId: 's6', studentName: 'Ananya Joshi', amount: 12000, date: '2026-04-20', label: 'Installment 2 of 3', status: 'paid' },
]

// Calendar payments for July 2026 keyed by day of month
export const calendarPayments: Record<number, Payment[]> = {
  2: [{ id: 'c1', studentId: 's7', studentName: 'Kabir Mehta', amount: 1800, date: '2026-07-02', label: 'Monthly Fees', status: 'paid' }],
  5: [{ id: 'c2', studentId: 's10', studentName: 'Diya Kulkarni', amount: 1400, date: '2026-07-05', label: 'Monthly Fees', status: 'paid' }],
  8: [
    { id: 'c3', studentId: 's4', studentName: 'Sneha Patel', amount: 2500, date: '2026-07-08', label: 'Monthly Fees', status: 'overdue' },
    { id: 'c8', studentId: 's9', studentName: 'Arjun Nair', amount: 2500, date: '2026-07-08', label: 'Monthly Fees', status: 'overdue' },
  ],
  10: [{ id: 'c4', studentId: 's1', studentName: 'Rahul Sharma', amount: 2500, date: '2026-07-10', label: 'Monthly Fees', status: 'upcoming' }],
  11: [{ id: 'c5', studentId: 's1', studentName: 'Rahul Sharma', amount: 2500, date: '2026-07-11', label: 'Monthly Fees', status: 'upcoming' }],
  13: [{ id: 'c6', studentId: 's2', studentName: 'Pooja Verma', amount: 5000, date: '2026-07-13', label: 'Split Payment', status: 'upcoming' }],
  14: [{ id: 'c7', studentId: 's5', studentName: 'Vivaan Singh', amount: 1200, date: '2026-07-14', label: 'Monthly Fees', status: 'upcoming' }],
  16: [{ id: 'c9', studentId: 's6', studentName: 'Ananya Joshi', amount: 6000, date: '2026-07-16', label: 'Split Payment', status: 'upcoming' }],
  20: [{ id: 'c10', studentId: 's7', studentName: 'Kabir Mehta', amount: 1800, date: '2026-07-20', label: 'Monthly Fees', status: 'upcoming' }],
}

export const expenses: Expense[] = [
  { id: 'e1', category: 'Rent', amount: 15000, date: '2026-07-01', note: 'July rent — Shubh Classes premises' },
  { id: 'e2', category: 'Teacher Salary', amount: 22000, date: '2026-07-05', note: 'Salaries — Sharma Sir & Meena Ma\u2019am' },
  { id: 'e3', category: 'Electricity', amount: 4200, date: '2026-07-06', note: 'June bill — higher due to summer ACs' },
  { id: 'e4', category: 'Internet', amount: 999, date: '2026-07-03', note: 'Fiber plan — monthly' },
  { id: 'e5', category: 'Books', amount: 3600, date: '2026-06-28', note: 'Class 10 board sample papers x 24' },
  { id: 'e6', category: 'Stationery', amount: 850, date: '2026-06-25', note: 'Whiteboard markers, chalk, registers' },
  { id: 'e7', category: 'Other', amount: 1200, date: '2026-06-22', note: 'Water cooler service' },
]

export const monthlySeries = [
  { month: 'Feb', income: 88000, expense: 41000 },
  { month: 'Mar', income: 96000, expense: 43500 },
  { month: 'Apr', income: 104000, expense: 42000 },
  { month: 'May', income: 98500, expense: 45000 },
  { month: 'Jun', income: 112000, expense: 44200 },
  { month: 'Jul', income: 126000, expense: 44000 },
]

export const todayTasks = [
  { id: 't1', label: 'Collect fee from Rahul', meta: '₹2,500 · Monthly', done: false },
  { id: 't2', label: 'Pay electricity bill', meta: '₹4,200 · Due today', done: false },
  { id: 't3', label: 'Pay teacher salary', meta: '₹22,000 · 2 teachers', done: true },
  { id: 't4', label: 'Rent due tomorrow', meta: '₹15,000 · Landlord', done: false },
]

export const notifications = [
  { id: 'n1', label: 'Rahul Sharma — ₹2,500 due today', tone: 'warning' as const, time: 'Today' },
  { id: 'n2', label: 'Pooja Verma — ₹5,000 due tomorrow', tone: 'neutral' as const, time: 'Tomorrow' },
  { id: 'n3', label: 'Rent ₹15,000 due on 12 July', tone: 'warning' as const, time: '2 days' },
  { id: 'n4', label: 'Electricity bill ₹4,200 pending', tone: 'danger' as const, time: 'Overdue' },
]

export const stats = {
  totalStudents: students.length,
  monthCollection: 126000,
  pendingFees: 28200,
  monthExpenses: 44000,
  netProfit: 82000,
  todayDue: 2500,
}

export function formatINR(n: number) {
  return '₹' + n.toLocaleString('en-IN')
}

export function initials(name: string) {
  return name
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
}
