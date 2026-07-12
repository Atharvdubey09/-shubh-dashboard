'use client'

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  attachExpenseBill,
  attachStudentPhoto,
  createExpense,
  createPayment,
  createStudent,
  deriveDashboardData,
  removeExpense,
  removePayment,
  removeStudent,
  saveSettings,
  saveTask,
  setTaskDone,
  subscribeExpenses,
  subscribePayments,
  subscribeSettings,
  subscribeStudents,
  subscribeTasks,
  updateExpense,
  updatePayment,
  updateStudent,
  subscribeFamilies,
  createFamily,
  updateFamily,
  removeFamily,
  createFamilyPayment,
  restoreStudent,
  inviteUser,
  changeUserRole,
  disableUser,
  enableUser,
  removeUser,
  linkStudentToFamily,
  createFamilyAndLinkStudent,
  unlinkStudentFromFamily,
  subscribeCashTransactions,
  createCashTransaction,
  updateCashTransaction,
  deleteCashTransaction,
  type ExpenseFormValues,
  type PaymentFormValues,
  type SettingsValues,
  type StudentFormValues,
} from '@/lib/firestore'
import {
  type AppSettings,
  type DashboardStats,
  type Expense,
  type NotificationItem,
  type Payment,
  type SearchResult,
  type Student,
  type TaskItem,
  type Family,
  type CashTransaction,
} from '@/lib/domain'

interface AppDataContextValue {
  loading: boolean
  error: string | null
  students: Student[]
  payments: Payment[]
  expenses: Expense[]
  tasks: TaskItem[]
  settings: SettingsValues
  stats: DashboardStats
  upcomingPayments: Payment[]
  paymentHistory: Payment[]
  calendarPayments: Record<number, Payment[]>
  monthlySeries: { month: string; income: number; expense: number }[]
  notifications: NotificationItem[]
  searchIndex: SearchResult[]
  families: Family[]
  cashTransactions: CashTransaction[]
  revenueUnlocked: boolean
  setRevenueUnlocked: (unlocked: boolean) => void
  addStudent: (input: StudentFormValues, photoUrl?: string) => Promise<Student>
  editStudent: (studentId: string, input: StudentFormValues, photoUrl?: string) => Promise<Student>
  deleteStudent: (studentId: string) => Promise<void>
  addPayment: (input: PaymentFormValues) => Promise<Payment>
  editPayment: (paymentId: string, input: PaymentFormValues) => Promise<void>
  deletePayment: (paymentId: string) => Promise<void>
  addExpense: (input: ExpenseFormValues) => Promise<Expense>
  editExpense: (expenseId: string, input: ExpenseFormValues) => Promise<void>
  deleteExpense: (expenseId: string) => Promise<void>
  persistSettings: (input: AppSettings) => Promise<void>
  toggleTask: (taskId: string, done: boolean) => Promise<void>
  attachStudentPhoto: (studentId: string, file: File) => Promise<string>
  attachExpenseBill: (expenseId: string, file: File) => Promise<string>
  seedTasksIfNeeded: () => Promise<void>
  addFamily: (input: Omit<Family, 'id' | 'createdAt' | 'updatedAt'>, allocationType: 'proportional' | 'equal' | 'manual', manualAllocations?: Record<string, number>) => Promise<Family>
  editFamily: (familyId: string, input: Omit<Family, 'id' | 'createdAt' | 'updatedAt'>, allocationType: 'proportional' | 'equal' | 'manual', manualAllocations?: Record<string, number>) => Promise<void>
  deleteFamily: (familyId: string) => Promise<void>
  addFamilyPayment: (familyId: string, amount: number, date: string, paymentMode: any, allocationType: 'equal' | 'proportional' | 'manual', manualAllocations?: Record<string, number>, notes?: string) => Promise<void>
  recoverStudent: (studentId: string) => Promise<void>
  sendUserInvitation: (name: string, email: string, role: string, ownerEmail: string) => Promise<void>
  updateUserRole: (email: string, role: string, ownerEmail: string) => Promise<void>
  suspendUser: (email: string, ownerEmail: string) => Promise<void>
  unsuspendUser: (email: string, ownerEmail: string) => Promise<void>
  deleteUserLink: (email: string, ownerEmail: string) => Promise<void>
  assignStudentToFamily: (studentId: string, familyId: string) => Promise<void>
  createFamilyAndLink: (studentId: string, parentName: string, parentPhone: string, parentWhatsApp?: string, alternatePhone?: string) => Promise<string>
  unassignStudentFromFamily: (studentId: string) => Promise<void>
  addCashTransaction: (input: Omit<CashTransaction, 'id' | 'createdAt'>) => Promise<string>
  editCashTransaction: (id: string, updates: Partial<CashTransaction>) => Promise<void>
  removeCashTransaction: (id: string) => Promise<void>
}

const AppDataContext = createContext<AppDataContextValue | null>(null)

export function AppDataProvider({ children }: { children: React.ReactNode }) {
  const [students, setStudents] = useState<Student[]>([])
  const [payments, setPayments] = useState<Payment[]>([])
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [tasks, setTasks] = useState<TaskItem[]>([])
  const [families, setFamilies] = useState<Family[]>([])
  const [cashTransactions, setCashTransactions] = useState<CashTransaction[]>([])
  const [revenueUnlocked, setRevenueUnlocked] = useState(false)
  const [settings, setSettings] = useState<SettingsValues>({
    coachingName: 'Shubh Classes',
    ownerName: 'Shubh Dubey',
    phone: '98765 00000',
    address: '1st Floor, Shubh Complex, Station Road',
    reminders: {
      todaysDueFees: true,
      tomorrowsDueFees: true,
      rentAndSalary: true,
      utilities: true,
    },
    updatedAt: new Date().toISOString().slice(0, 10),
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const seededTasksRef = useRef(false)
  const readyRef = useRef({
    students: false,
    payments: false,
    expenses: false,
    tasks: false,
    settings: false,
    families: false,
    cashTransactions: false,
  })

  // Lock status persistence & auto lock inactivity timer
  useEffect(() => {
    if (typeof window === 'undefined') return
    const stored = window.sessionStorage.getItem('shubh-classes:total-revenue-unlocked') === 'true'
    setRevenueUnlocked(stored)
  }, [])

  useEffect(() => {
    if (!revenueUnlocked) return
    let timeoutId: any

    function resetTimer() {
      if (timeoutId) clearTimeout(timeoutId)
      timeoutId = setTimeout(() => {
        setRevenueUnlocked(false)
        window.sessionStorage.setItem('shubh-classes:total-revenue-unlocked', 'false')
      }, 5 * 60 * 1000) // 5 minutes inactivity autolock
    }

    resetTimer()

    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart']
    events.forEach((name) => window.addEventListener(name, resetTimer))

    return () => {
      if (timeoutId) clearTimeout(timeoutId)
      events.forEach((name) => window.removeEventListener(name, resetTimer))
    }
  }, [revenueUnlocked])

  useEffect(() => {
    let unsubscribers: (() => void)[] = []
    let cancelled = false

    async function init() {
      try {
        if (cancelled) return
        unsubscribers = [
          subscribeStudents(
            (next) => {
              setStudents(next)
              readyRef.current.students = true
              setLoading(!Object.values(readyRef.current).every(Boolean))
            },
            (err) => {
              const message = err instanceof Error ? err.message : 'Unable to load students.'
              setError(message)
              setLoading(false)
            },
          ),
          subscribePayments(
            (next) => {
              setPayments(next)
              readyRef.current.payments = true
              setLoading(!Object.values(readyRef.current).every(Boolean))
            },
            (err) => {
              const message = err instanceof Error ? err.message : 'Unable to load payments.'
              setError(message)
              setLoading(false)
            },
          ),
          subscribeExpenses(
            (next) => {
              setExpenses(next)
              readyRef.current.expenses = true
              setLoading(!Object.values(readyRef.current).every(Boolean))
            },
            (err) => {
              const message = err instanceof Error ? err.message : 'Unable to load expenses.'
              setError(message)
              setLoading(false)
            },
          ),
          subscribeTasks(
            (next) => {
              setTasks(next)
              readyRef.current.tasks = true
              setLoading(!Object.values(readyRef.current).every(Boolean))
            },
            (err) => {
              const message = err instanceof Error ? err.message : 'Unable to load tasks.'
              setError(message)
              setLoading(false)
            },
          ),
          subscribeSettings(
            (next) => {
              setSettings(next)
              readyRef.current.settings = true
              setLoading(!Object.values(readyRef.current).every(Boolean))
            },
            (err) => {
              const message = err instanceof Error ? err.message : 'Unable to load settings.'
              setError(message)
              setLoading(false)
            },
          ),
          subscribeFamilies(
            (next) => {
              setFamilies(next)
              readyRef.current.families = true
              setLoading(!Object.values(readyRef.current).every(Boolean))
            },
            (err) => {
              const message = err instanceof Error ? err.message : 'Unable to load families.'
              setError(message)
              setLoading(false)
            },
          ),
          subscribeCashTransactions(
            (next) => {
              setCashTransactions(next)
              readyRef.current.cashTransactions = true
              setLoading(!Object.values(readyRef.current).every(Boolean))
            }
          ),
        ]
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unable to connect to Firebase.'
        setError(message)
        setLoading(false)
      }
    }

    void init()

    return () => {
      cancelled = true
      unsubscribers.forEach((unsubscribe) => unsubscribe())
    }
  }, [])

  const derived = useMemo(() => {
    return deriveDashboardData(students, payments, expenses)
  }, [students, payments, expenses])

  const visibleTasks = tasks.length > 0 ? tasks : derived.tasks

  useEffect(() => {
    if (loading || seededTasksRef.current || tasks.length > 0 || derived.tasks.length === 0) {
      return
    }
    seededTasksRef.current = true
    void Promise.all(derived.tasks.map((task) => saveTask(task))).catch((err) => {
      setError(err instanceof Error ? err.message : 'Failed to seed tasks.')
    })
  }, [derived.tasks, loading, tasks.length])

  const value = useMemo<AppDataContextValue>(
    () => ({
      loading,
      error,
      students,
      payments,
      expenses,
      tasks: visibleTasks,
      settings,
      stats: derived.stats,
      upcomingPayments: derived.upcomingPayments,
      paymentHistory: derived.paymentHistory,
      calendarPayments: derived.calendarPayments,
      monthlySeries: derived.monthlySeries,
      notifications: derived.notifications,
      searchIndex: derived.searchResults,
      families,
      cashTransactions,
      revenueUnlocked,
      setRevenueUnlocked: (unlocked: boolean) => {
        setRevenueUnlocked(unlocked)
        if (typeof window !== 'undefined') {
          window.sessionStorage.setItem('shubh-classes:total-revenue-unlocked', unlocked ? 'true' : 'false')
        }
      },
      addStudent: async (input, photoUrl) => createStudent(input, photoUrl),
      editStudent: async (studentId, input, photoUrl) => updateStudent(studentId, input, photoUrl),
      deleteStudent: async (studentId) => removeStudent(studentId),
      addPayment: async (input) => createPayment(input),
      editPayment: async (paymentId, input) => updatePayment(paymentId, input),
      deletePayment: async (paymentId) => removePayment(paymentId),
      addExpense: async (input) => createExpense(input),
      editExpense: async (expenseId, input) => updateExpense(expenseId, input),
      deleteExpense: async (expenseId) => removeExpense(expenseId),
      persistSettings: async (input) => saveSettings(input),
      toggleTask: async (taskId, done) => setTaskDone(taskId, done),
      attachStudentPhoto: async (studentId, file) => attachStudentPhoto(studentId, file),
      attachExpenseBill: async (expenseId, file) => attachExpenseBill(expenseId, file),
      seedTasksIfNeeded: async () => {
        if (tasks.length > 0 || derived.tasks.length === 0) return
        await Promise.all(derived.tasks.map((task) => saveTask(task)))
      },
      addFamily: async (input, allocationType, manualAllocations) => createFamily(input, allocationType, manualAllocations),
      editFamily: async (familyId, input, allocationType, manualAllocations) => updateFamily(familyId, input, allocationType, manualAllocations),
      deleteFamily: async (familyId) => removeFamily(familyId),
      addFamilyPayment: async (familyId, amount, date, paymentMode, allocationType, manualAllocations, notes) => createFamilyPayment(familyId, amount, date, paymentMode, allocationType, manualAllocations, notes),
      recoverStudent: async (studentId) => restoreStudent(studentId),
      sendUserInvitation: async (name, email, role, ownerEmail) => inviteUser(name, email, role, ownerEmail),
      updateUserRole: async (email, role, ownerEmail) => changeUserRole(email, role, ownerEmail),
      suspendUser: async (email, ownerEmail) => disableUser(email, ownerEmail),
      unsuspendUser: async (email, ownerEmail) => enableUser(email, ownerEmail),
      deleteUserLink: async (email, ownerEmail) => removeUser(email, ownerEmail),
      assignStudentToFamily: async (studentId, familyId) => linkStudentToFamily(studentId, familyId),
      createFamilyAndLink: async (studentId, parentName, parentPhone, parentWhatsApp, alternatePhone) => createFamilyAndLinkStudent(studentId, parentName, parentPhone, parentWhatsApp, alternatePhone),
      unassignStudentFromFamily: async (studentId) => unlinkStudentFromFamily(studentId),
      addCashTransaction: async (input) => createCashTransaction(input),
      editCashTransaction: async (id, updates) => updateCashTransaction(id, updates),
      removeCashTransaction: async (id) => deleteCashTransaction(id),
    }),
    [derived, error, expenses, loading, payments, settings, students, tasks, visibleTasks, families, cashTransactions, revenueUnlocked],
  )

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>
}

export function useAppData() {
  const context = useContext(AppDataContext)
  if (!context) {
    throw new Error('useAppData must be used within AppDataProvider')
  }
  return context
}
