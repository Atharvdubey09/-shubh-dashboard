import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  onSnapshot,
  type Unsubscribe,
  type QuerySnapshot,
  type DocumentData,
} from 'firebase/firestore'
import {
  deleteObject,
  getDownloadURL,
  ref,
  uploadBytes,
} from 'firebase/storage'
import {
  addMonths,
  clamp,
  deriveClassFee,
  formatINR,
  formatLongDate,
  formatMonthLabel,
  monthKey,
  paymentTypeLabel,
  sameDay,
  splitEvenly,
  startOfMonthISO,
  todayISO,
  type AppSettings,
  type DashboardStats,
  type Expense,
  type ExpenseCategory,
  type FeeScheduleItem,
  type MonthlySeriesPoint,
  type NotificationItem,
  type Payment,
  type PaymentMode,
  type PaymentStatus,
  type PaymentType,
  type RecordStatus,
  type SearchResult,
  type Student,
  type StudentFeePlan,
  type TaskItem,
  type Family,
  type AuditLog,
  type CashTransaction,
  type TeachingRecord,
  type TeacherProfile,
} from '@/lib/domain'
import { getFirebaseDb, getFirebaseStorage } from '@/lib/firebase'

export interface StudentFormValues {
  name: string
  class: number
  batch: string
  parentPhone: string
  paymentType: PaymentType
  totalFee: number
  status: RecordStatus
  notes: string
  feePlan?: StudentFeePlan
  parentName?: string
  studentPhone?: string
  whatsapp?: string
  address?: string
  promiseToPayDate?: string
  parentId?: string
}

export interface ExpenseFormValues {
  category: ExpenseCategory
  amount: number
  date: string
  note: string
  billImageUrl?: string
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

export interface PaymentFormValues {
  studentId: string
  studentName: string
  amount: number
  date: string
  paymentMode: PaymentMode
  notes: string
  receiptNumber?: string
  label?: string
}

export interface SettingsValues extends AppSettings {
  updatedAt: string
}

const db = () => getFirebaseDb()

const DEFAULT_SETTINGS: AppSettings = {
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
}

function toSafeString(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback
}

function toSafeNumber(value: unknown, fallback = 0) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function toSafeBoolean(value: unknown, fallback = false) {
  return typeof value === 'boolean' ? value : fallback
}

function stripUndefinedDeep<T>(value: T): T {
  if (value === undefined) {
    return undefined as unknown as T
  }
  if (value === null) {
    return null as unknown as T
  }
  if (Array.isArray(value)) {
    return value
      .map((item) => stripUndefinedDeep(item))
      .filter((item) => item !== undefined) as unknown as T
  }
  if (typeof value === 'object') {
    const res: Record<string, any> = {}
    for (const [k, v] of Object.entries(value)) {
      if (v !== undefined) {
        res[k] = stripUndefinedDeep(v)
      }
    }
    return res as unknown as T
  }
  return value
}

function toPaymentType(value: unknown): PaymentType {
  if (value === 'Monthly' || value === 'Split' || value === 'Full Payment') {
    return value
  }
  return 'Monthly'
}

function toRecordStatus(value: unknown): RecordStatus {
  return value === 'inactive' ? 'inactive' : 'active'
}

function toPaymentStatus(value: unknown): PaymentStatus {
  if (value === 'overdue' || value === 'upcoming' || value === 'paid') return value
  return 'upcoming'
}

function toPaymentMode(value: unknown): PaymentMode {
  if (
    value === 'Cash' ||
    value === 'UPI' ||
    value === 'Card' ||
    value === 'Bank Transfer' ||
    value === 'Cheque' ||
    value === 'Razorpay' ||
    value === 'Razorpay Link' ||
    value === 'Razorpay QR'
  ) {
    return value
  }
  return 'Cash'
}

function toExpenseCategory(value: unknown): ExpenseCategory {
  if (
    value === 'Rent' ||
    value === 'Electricity' ||
    value === 'Internet' ||
    value === 'Teacher Salary' ||
    value === 'Books' ||
    value === 'Stationery' ||
    value === 'Other'
  ) {
    return value
  }
  return 'Other'
}

function normalizeFeeSchedule(raw: unknown): FeeScheduleItem[] {
  if (!Array.isArray(raw)) return []
  const schedule: FeeScheduleItem[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const current = item as Record<string, unknown>
    const amount = toSafeNumber(current.amount)
    const dueDate = toSafeString(current.dueDate)
    if (!dueDate) continue
    const normalizedItem: FeeScheduleItem = {
      id: toSafeString(current.id) || crypto.randomUUID(),
      label: toSafeString(current.label, 'Installment'),
      amount,
      dueDate,
      status: toPaymentStatus(current.status),
      paidAmount: toSafeNumber(current.paidAmount, 0),
    }
    const pid = toSafeString(current.paymentId)
    if (pid) {
      normalizedItem.paymentId = pid
    }
    schedule.push(normalizedItem)
  }
  return schedule
}

function normalizeStudent(snapshot: DocumentData): Student {
  const joined = toSafeString(snapshot.joined, todayISO())
  const totalFee = toSafeNumber(snapshot.totalFee, toSafeNumber(snapshot.agreedTotalFee, deriveClassFee(toSafeNumber(snapshot.class, 1))))
  const paid = toSafeNumber(snapshot.paid, 0)
  const pending = Math.max(totalFee - paid, 0)
  const schedule = normalizeFeeSchedule(snapshot.feeSchedule)
  const feePlan = normalizeFeePlan(snapshot.feePlan, toPaymentType(snapshot.paymentType), totalFee, joined)
  const feeSchedule = schedule.length
    ? schedule
    : buildFeeScheduleFromPlan(toSafeString(snapshot.id), feePlan, joined, paid)
  return {
    id: toSafeString(snapshot.id),
    name: toSafeString(snapshot.name, 'Unnamed Student'),
    class: toSafeNumber(snapshot.class, 1),
    batch: toSafeString(snapshot.batch, 'Morning A'),
    parentPhone: toSafeString(snapshot.parentPhone),
    paymentType: toPaymentType(snapshot.paymentType),
    totalFee,
    paid,
    pending,
    status: toRecordStatus(snapshot.status),
    joined,
    notes: toSafeString(snapshot.notes),
    photoUrl: toSafeString(snapshot.photoUrl) || undefined,
    feePlan,
    dueDay: snapshot.dueDay ? toSafeNumber(snapshot.dueDay) : feePlan.type === 'Monthly' && feePlan.startDate ? Number(feePlan.startDate.slice(8, 10)) : undefined,
    monthlyFee: snapshot.monthlyFee ? toSafeNumber(snapshot.monthlyFee) : feePlan.type === 'Monthly' ? feePlan.monthlyFeeAmount ?? Math.round(totalFee / 12) : undefined,
    feeSchedule,
    parentName: toSafeString(snapshot.parentName),
    studentPhone: toSafeString(snapshot.studentPhone),
    whatsapp: toSafeString(snapshot.whatsapp),
    address: toSafeString(snapshot.address),
    promiseToPayDate: toSafeString(snapshot.promiseToPayDate) || undefined,
    parentId: toSafeString(snapshot.parentId) || undefined,
    createdAt: toSafeString(snapshot.createdAt, joined),
    updatedAt: toSafeString(snapshot.updatedAt, joined),
  }
}

function normalizePayment(snapshot: DocumentData): Payment {
  const date = toSafeString(snapshot.date, todayISO())
  return {
    id: toSafeString(snapshot.id),
    studentId: toSafeString(snapshot.studentId),
    studentName: toSafeString(snapshot.studentName, 'Unknown Student'),
    amount: toSafeNumber(snapshot.amount),
    date,
    label: toSafeString(snapshot.label, 'Fee Payment'),
    status: toPaymentStatus(snapshot.status),
    paymentMode: toPaymentMode(snapshot.paymentMode),
    notes: toSafeString(snapshot.notes),
    receiptNumber: toSafeString(snapshot.receiptNumber, `RCPT-${date.replaceAll('-', '')}`),
    parentId: toSafeString(snapshot.parentId) || undefined,
    parentName: toSafeString(snapshot.parentName) || undefined,
    parentPaymentId: toSafeString(snapshot.parentPaymentId) || undefined,
    createdAt: toSafeString(snapshot.createdAt, date),
  }
}

function normalizeExpense(snapshot: DocumentData): Expense {
  const date = toSafeString(snapshot.date, todayISO())
  return {
    id: toSafeString(snapshot.id),
    category: toExpenseCategory(snapshot.category),
    amount: toSafeNumber(snapshot.amount),
    date,
    note: toSafeString(snapshot.note),
    billImageUrl: toSafeString(snapshot.billImageUrl) || undefined,
    createdAt: toSafeString(snapshot.createdAt, date),
    updatedAt: toSafeString(snapshot.updatedAt, date),
  }
}

function normalizeTask(snapshot: DocumentData): TaskItem {
  return {
    id: toSafeString(snapshot.id),
    label: toSafeString(snapshot.label, 'Task'),
    meta: toSafeString(snapshot.meta),
    done: toSafeBoolean(snapshot.done),
    sourceId: toSafeString(snapshot.sourceId) || undefined,
    sourceType: snapshot.sourceType === 'payment' || snapshot.sourceType === 'expense' || snapshot.sourceType === 'task'
      ? snapshot.sourceType
      : undefined,
  }
}

function normalizeSettings(snapshot: DocumentData | null | undefined): SettingsValues {
  if (!snapshot) {
    return { ...DEFAULT_SETTINGS, updatedAt: todayISO() }
  }
  return {
    coachingName: toSafeString(snapshot.coachingName, DEFAULT_SETTINGS.coachingName),
    ownerName: toSafeString(snapshot.ownerName, DEFAULT_SETTINGS.ownerName),
    phone: toSafeString(snapshot.phone, DEFAULT_SETTINGS.phone),
    address: toSafeString(snapshot.address, DEFAULT_SETTINGS.address),
    reminders: {
      todaysDueFees: toSafeBoolean(snapshot.reminders?.todaysDueFees, DEFAULT_SETTINGS.reminders.todaysDueFees),
      tomorrowsDueFees: toSafeBoolean(snapshot.reminders?.tomorrowsDueFees, DEFAULT_SETTINGS.reminders.tomorrowsDueFees),
      rentAndSalary: toSafeBoolean(snapshot.reminders?.rentAndSalary, DEFAULT_SETTINGS.reminders.rentAndSalary),
      utilities: toSafeBoolean(snapshot.reminders?.utilities, DEFAULT_SETTINGS.reminders.utilities),
    },
    updatedAt: toSafeString(snapshot.updatedAt, todayISO()),
  }
}

function normalizeFeePlan(value: unknown, fallbackType: PaymentType, agreedTotalFee: number, joined: string): StudentFeePlan {
  if (!value || typeof value !== 'object') {
    return buildDefaultFeePlan(fallbackType, agreedTotalFee, joined)
  }

  const raw = value as Record<string, unknown>
  const type = toPaymentType(raw.type)
  const plan: StudentFeePlan = {
    type,
    agreedTotalFee: toSafeNumber(raw.agreedTotalFee, agreedTotalFee),
  }

  const amountPaidNow = toSafeNumber(raw.amountPaidNow, 0)
  if (amountPaidNow > 0) {
    plan.amountPaidNow = amountPaidNow
  }

  const monthlyFeeAmount = toSafeNumber(raw.monthlyFeeAmount, 0)
  if (monthlyFeeAmount > 0) {
    plan.monthlyFeeAmount = monthlyFeeAmount
  }

  const startDate = toSafeString(raw.startDate)
  if (startDate) {
    plan.startDate = startDate
  }

  if (Array.isArray(raw.installments)) {
    const installments = raw.installments
      .filter((item) => item && typeof item === 'object')
      .map((item) => item as Record<string, unknown>)
      .map((item) => ({
        amount: toSafeNumber(item.amount),
        dueDate: toSafeString(item.dueDate),
      }))
      .filter((item) => item.amount > 0 && !!item.dueDate)
    if (installments.length > 0) {
      plan.installments = installments
    }
  }

  return plan
}

function buildDefaultFeePlan(paymentType: PaymentType, agreedTotalFee: number, joined: string): StudentFeePlan {
  if (paymentType === 'Split') {
    return {
      type: paymentType,
      agreedTotalFee,
      installments: splitEvenly(agreedTotalFee, 3).map((amount, index) => ({
        amount,
        dueDate: addMonths(joined, index),
      })),
    }
  }

  if (paymentType === 'Monthly') {
    return {
      type: paymentType,
      agreedTotalFee,
      monthlyFeeAmount: Math.max(Math.round(agreedTotalFee / 12), 1),
      startDate: joined,
    }
  }

  return {
    type: paymentType,
    agreedTotalFee,
    amountPaidNow: agreedTotalFee,
    startDate: joined,
  }
}

function validateStudentInput(input: StudentFormValues) {
  if (!toSafeString(input.name).trim()) {
    throw new Error('Student name is required.')
  }
  if (!Number.isFinite(input.class) || input.class < 1) {
    throw new Error('Please choose a valid class.')
  }
  if (!toSafeString(input.batch).trim()) {
    throw new Error('Batch is required.')
  }
  if (!Number.isFinite(input.totalFee) || input.totalFee <= 0) {
    throw new Error('Please enter a valid agreed total fee.')
  }
}

function buildFeeScheduleFromPlan(
  studentId: string,
  plan: StudentFeePlan,
  joined: string,
  paidAmount = 0,
) {
  const agreedTotalFee = Math.max(plan.agreedTotalFee, 0)
  if (plan.type === 'Full Payment') {
    const dueDate = plan.startDate || joined
    const status = paidAmount >= agreedTotalFee ? 'paid' : 'upcoming'
    const item: FeeScheduleItem = {
      id: `${studentId}-schedule-1`,
      label: 'Full Payment',
      amount: agreedTotalFee,
      dueDate,
      status,
    }
    if (status === 'paid') {
      item.paymentId = `${studentId}-seed-1`
    }
    return [item]
  }

  if (plan.type === 'Split') {
    const installments = plan.installments?.length
      ? plan.installments
      : splitEvenly(agreedTotalFee, 3).map((amount, index) => ({
          amount,
          dueDate: addMonths(joined, index),
        }))
    return installments.map((item, index) => {
      const cumulative = installments.slice(0, index + 1).reduce((sum, current) => sum + current.amount, 0)
      const status = paidAmount >= cumulative ? 'paid' : 'upcoming'
      const scheduleItem: FeeScheduleItem = {
        id: `${studentId}-schedule-${index + 1}`,
        label: `Installment ${index + 1} of ${installments.length}`,
        amount: item.amount,
        dueDate: item.dueDate,
        status,
      }
      if (status === 'paid') {
        scheduleItem.paymentId = `${studentId}-seed-${index + 1}`
      }
      return scheduleItem
    })
  }

  const monthlyFeeAmount = Math.max(plan.monthlyFeeAmount ?? Math.round(agreedTotalFee / 12), 1)
  const startDate = plan.startDate || joined
  const schedule: FeeScheduleItem[] = []
  let remaining = agreedTotalFee
  let index = 0
  while (remaining > 0) {
    const amount = Math.min(monthlyFeeAmount, remaining)
    const dueDate = addMonths(startDate, index)
    const cumulative = agreedTotalFee - remaining + amount
    const status = paidAmount >= cumulative ? 'paid' : 'upcoming'
    const scheduleItem: FeeScheduleItem = {
      id: `${studentId}-schedule-${index + 1}`,
      label: `Monthly Fees - ${formatMonthLabel(monthKey(dueDate))}`,
      amount,
      dueDate,
      status,
    }
    if (status === 'paid') {
      scheduleItem.paymentId = `${studentId}-seed-${index + 1}`
    }
    schedule.push(scheduleItem)
    remaining -= amount
    index += 1
  }
  return schedule
}

function applyPaymentToSchedule(
  studentId: string,
  schedule: FeeScheduleItem[],
  paidAmount: number,
  paymentId: string,
) {
  let remaining = paidAmount
  return schedule.map((item, index) => {
    if (remaining <= 0 || item.status === 'paid') {
      return item
    }
    if (remaining < item.amount) {
      return item
    }
    remaining -= item.amount
    return {
      ...item,
      status: 'paid' as const,
      paymentId: paymentId || item.paymentId || `${studentId}-paid-${index + 1}`,
    }
  })
}

function withBaseStudentFields(
  id: string,
  input: StudentFormValues,
  totalFee: number,
  paid: number,
  joined: string,
  feePlan: StudentFeePlan,
  feeSchedule: FeeScheduleItem[],
  photoUrl?: string,
  parentId?: string | null,
): Student {
  return {
    id,
    name: input.name,
    class: input.class,
    batch: input.batch,
    parentPhone: input.parentPhone,
    paymentType: input.paymentType,
    totalFee,
    paid,
    pending: Math.max(totalFee - paid, 0),
    status: input.status,
    joined,
    notes: input.notes,
    photoUrl,
    feePlan,
    dueDay: feePlan.type === 'Monthly' && feePlan.startDate ? Number(feePlan.startDate.slice(8, 10)) : undefined,
    monthlyFee: feePlan.type === 'Monthly' ? feePlan.monthlyFeeAmount ?? Math.round(totalFee / 12) : undefined,
    feeSchedule,
    parentName: input.parentName,
    studentPhone: input.studentPhone,
    whatsapp: input.whatsapp,
    address: input.address,
    promiseToPayDate: input.promiseToPayDate,
    parentId: (parentId !== undefined ? parentId : input.parentId) || undefined,
    createdAt: joined,
    updatedAt: todayISO(),
  }
}

export function calculateStudentFee(classNumber: number) {
  return deriveClassFee(classNumber)
}

export function buildStudentRecord(
  id: string,
  input: StudentFormValues,
  existing?: Student | null,
) {
  const joined = existing?.joined ?? todayISO()
  const totalFee = input.totalFee > 0 ? input.totalFee : existing?.totalFee ?? calculateStudentFee(input.class)
  const feePlan = normalizeFeePlan(input.feePlan ?? existing?.feePlan, input.paymentType, totalFee, joined)
  const plannedPaid = Math.min(feePlan.amountPaidNow ?? 0, totalFee)
  const paid = Math.max(existing?.paid ?? 0, plannedPaid)
  const feeSchedule =
    existing && !input.feePlan
      ? existing.feeSchedule
      : buildFeeScheduleFromPlan(id, feePlan, joined, paid)
  return withBaseStudentFields(
    id,
    input,
    totalFee,
    paid,
    joined,
    feePlan,
    feeSchedule,
    existing?.photoUrl,
    existing?.parentId,
  )
}

export function createPaymentLabel(student: Student, date: string) {
  if (student.paymentType === 'Monthly') {
    return `Monthly Fees - ${formatMonthLabel(monthKey(date))}`
  }
  if (student.paymentType === 'Split') {
    return 'Split Payment'
  }
  return 'Full Payment'
}

function nextReceiptNumber(prefix = 'RCPT') {
  const now = new Date()
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`
  return `${prefix}-${stamp}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`
}

export async function uploadFileToStorage(pathName: string, file: File) {
  const storage = getFirebaseStorage()
  const storageRef = ref(storage, pathName)
  await uploadBytes(storageRef, file)
  return getDownloadURL(storageRef)
}

export async function deleteFileFromStorage(url?: string) {
  if (!url) return
  const storage = getFirebaseStorage()
  const storageRef = ref(storage, url)
  await deleteObject(storageRef)
}

export function subscribeStudents(
  onChange: (students: Student[]) => void,
  onError?: (error: unknown) => void,
) {
  const q = query(collection(db(), 'students'), orderBy('name', 'asc'))
  return onSnapshot(
    q,
    (snapshot) => {
      const list: Student[] = []
      snapshot.forEach((docSnap) => {
        const raw = docSnap.data()
        if (raw.is_deleted !== true) {
          list.push(normalizeStudent({ id: docSnap.id, ...raw }))
        }
      })
      onChange(list)
    },
    onError,
  )
}

export function subscribeDeletedStudents(
  onChange: (students: Student[]) => void,
  onError?: (error: unknown) => void,
) {
  const q = query(collection(db(), 'students'), orderBy('name', 'asc'))
  return onSnapshot(
    q,
    (snapshot) => {
      const list: Student[] = []
      snapshot.forEach((docSnap) => {
        const raw = docSnap.data()
        if (raw.is_deleted === true) {
          list.push(normalizeStudent({ id: docSnap.id, ...raw }))
        }
      })
      onChange(list)
    },
    onError,
  )
}

export async function restoreStudent(studentId: string) {
  const studentRef = doc(db(), 'students', studentId)
  const snap = await getDoc(studentRef)
  if (snap.exists()) {
    const student = snap.data()
    await updateDoc(studentRef, {
      is_deleted: false,
      deleted_at: null,
      deleted_by: null,
    })
    await writeAuditLog('student_restore', studentId, 'status', 'deleted', 'active')
    await writeStudentHistory({
      studentId,
      studentName: student.name || 'Student',
      eventType: 'student_restored',
      prevValue: 'deleted',
      newValue: 'active',
      remarks: 'Student profile restored / unarchived',
      source: 'Manual Edit'
    })
  }
}

export function subscribePayments(
  onChange: (payments: Payment[]) => void,
  onError?: (error: unknown) => void,
) {
  const q = query(collection(db(), 'payments'), orderBy('date', 'desc'))
  return onSnapshot(
    q,
    (snapshot) => {
      onChange(snapshot.docs.map((entry) => normalizePayment(entry.data())))
    },
    onError,
  )
}

export function subscribeExpenses(
  onChange: (expenses: Expense[]) => void,
  onError?: (error: unknown) => void,
) {
  const q = query(collection(db(), 'expenses'), orderBy('date', 'desc'))
  return onSnapshot(
    q,
    (snapshot) => {
      onChange(snapshot.docs.map((entry) => normalizeExpense(entry.data())))
    },
    onError,
  )
}

export function subscribeTasks(
  onChange: (tasks: TaskItem[]) => void,
  onError?: (error: unknown) => void,
) {
  const q = query(collection(db(), 'tasks'), orderBy('createdAt', 'desc'))
  return onSnapshot(
    q,
    (snapshot) => {
      onChange(snapshot.docs.map((entry) => normalizeTask(entry.data())))
    },
    onError,
  )
}

export function subscribeSettings(
  onChange: (settings: SettingsValues) => void,
  onError?: (error: unknown) => void,
) {
  const refDoc = doc(db(), 'settings', 'app')
  return onSnapshot(
    refDoc,
    (snapshot) => {
      onChange(normalizeSettings(snapshot.exists() ? snapshot.data() : null))
    },
    onError,
  )
}

export async function saveSettings(values: AppSettings) {
  const refDoc = doc(db(), 'settings', 'app')
  await setDoc(refDoc, stripUndefinedDeep({ ...values, updatedAt: todayISO() }), { merge: true })
}

export async function createStudent(input: StudentFormValues, photoUrl?: string) {
  validateStudentInput(input)
  const refDoc = doc(collection(db(), 'students'))
  const student = buildStudentRecord(refDoc.id, input)
  const plan = student.feePlan ?? buildDefaultFeePlan(student.paymentType, student.totalFee, student.joined)
  const admissionPaid = Math.min(input.feePlan?.amountPaidNow ?? 0, student.totalFee)
  const planTotal = plan.installments?.reduce((sum, item) => sum + item.amount, 0) ?? student.totalFee
  if (student.paymentType === 'Split' && planTotal !== student.totalFee) {
    throw new Error('Split payment installments must add up to the agreed total fee.')
  }
  if (student.paymentType === 'Monthly' && (plan.monthlyFeeAmount ?? 0) <= 0) {
    throw new Error('Monthly payment requires a valid monthly fee amount.')
  }
  if (student.paymentType === 'Full Payment' && admissionPaid !== student.totalFee) {
    throw new Error('Full Payment admission requires Amount Paid Right Now to match the agreed total fee.')
  }

  const paymentRef = admissionPaid > 0 ? doc(collection(db(), 'payments')) : null
  const paymentDate = student.joined
  const paymentPayload =
    admissionPaid > 0 && paymentRef
      ? stripUndefinedDeep({
          id: paymentRef.id,
          studentId: student.id,
          studentName: student.name,
          amount: admissionPaid,
          date: paymentDate,
          label: createPaymentLabel(student, paymentDate),
          status: 'paid' as const,
          paymentMode: 'Cash' as const,
          notes: 'Admission payment',
          receiptNumber: nextReceiptNumber(),
          createdAt: todayISO(),
        } satisfies Payment)
      : null

  const payload = stripUndefinedDeep({
    ...student,
    paid: admissionPaid > 0 ? admissionPaid : student.paid,
    pending: Math.max(student.totalFee - (admissionPaid > 0 ? admissionPaid : student.paid), 0),
    photoUrl: photoUrl ?? student.photoUrl,
  })

  await runTransaction(db(), async (transaction) => {
    transaction.set(refDoc, payload)
    if (paymentRef && paymentPayload) {
      transaction.set(paymentRef, paymentPayload)
    }
  })

  if (admissionPaid > 0) {
    await recalculateStudentFees(student.id)
  }

  // Write student creation history
  await writeStudentHistory({
    studentId: payload.id,
    studentName: payload.name,
    eventType: 'student_created',
    newValue: payload.name,
    remarks: `Student registered and admitted on ${payload.joined}`,
    source: 'Manual Edit'
  })

  await writeStudentHistory({
    studentId: payload.id,
    studentName: payload.name,
    eventType: 'fee_structure_created',
    newValue: `${payload.paymentType} - INR ${payload.totalFee}`,
    remarks: `Fee structure created: ${payload.paymentType} plan of total fee INR ${payload.totalFee}`,
    source: 'Manual Edit'
  })

  if (payload.feeSchedule) {
    for (const item of payload.feeSchedule) {
      await writeStudentHistory({
        studentId: payload.id,
        studentName: payload.name,
        eventType: 'installment_created',
        newValue: `${item.label} (Due: ${item.dueDate})`,
        remarks: `Installment generated: ${item.label} of amount INR ${item.amount} due on ${item.dueDate}`,
        source: 'Manual Edit'
      })
    }
  }

  if (admissionPaid > 0 && paymentRef && paymentPayload) {
    await writeStudentHistory({
      studentId: payload.id,
      studentName: payload.name,
      eventType: 'payment_made',
      newValue: `INR ${admissionPaid}`,
      remarks: `Admission payment of INR ${admissionPaid} recorded via Cash. Receipt: ${paymentPayload.receiptNumber}`,
      source: 'Manual Edit',
      paymentId: paymentRef.id
    })

    const pDate = new Date().toISOString()
    const time = pDate.split('T')[1].slice(0, 8)
    await writeTransaction(paymentRef.id, {
      studentId: payload.id,
      studentName: payload.name,
      studentClass: payload.class || 0,
      studentRoll: 'N/A',
      studentPhone: payload.parentPhone || payload.studentPhone || 'N/A',
      transactionType: 'payment',
      amount: admissionPaid,
      discount: 0,
      fine: 0,
      netAmount: admissionPaid,
      paymentMethod: 'Cash',
      paymentStatus: 'success',
      collectionSource: 'Manual Collection',
      collectedBy: 'Owner',
      date: payload.joined,
      time,
      receiptNumber: paymentPayload.receiptNumber,
      notes: 'Admission payment',
      createdAt: pDate,
      updatedAt: pDate,
      docRef: `payments/${paymentRef.id}`,
      verificationStatus: 'Manual',
      timeline: [
        { status: 'created', timestamp: pDate, remarks: 'Transaction registered in system' },
        { status: 'success', timestamp: pDate, remarks: 'Admission payment collected manually' }
      ]
    })
  }

  return payload
}

export async function updateStudent(studentId: string, input: StudentFormValues, photoUrl?: string) {
  validateStudentInput(input)
  const current = await getDoc(doc(db(), 'students', studentId))
  const existing = current.exists() ? normalizeStudent(current.data()) : null
  const student = buildStudentRecord(studentId, input, existing)
  
  if (existing) {
    const fieldsToTrack: Array<keyof Student> = ['name', 'class', 'batch', 'parentPhone', 'totalFee', 'paymentType', 'status', 'notes', 'parentName', 'studentPhone', 'whatsapp', 'address', 'promiseToPayDate']
    for (const field of fieldsToTrack) {
      const oldVal = existing[field]
      const newVal = student[field]
      if (oldVal !== newVal) {
        await writeAuditLog(
          'student_edit',
          studentId,
          String(field),
          String(oldVal ?? ''),
          String(newVal ?? '')
        )

        const isFeeField = ['totalFee', 'paymentType', 'promiseToPayDate'].includes(String(field))
        const eventType = isFeeField ? 'fee_updated' : 'profile_updated'
        
        await writeStudentHistory({
          studentId,
          studentName: student.name,
          eventType,
          prevValue: String(oldVal ?? ''),
          newValue: String(newVal ?? ''),
          remarks: `${isFeeField ? 'Fee' : 'Profile'} field "${String(field)}" changed from "${oldVal ?? ''}" to "${newVal ?? ''}"`,
          source: 'Manual Edit'
        })
      }
    }
  }

  const payload = stripUndefinedDeep({
    ...student,
    photoUrl: photoUrl ?? existing?.photoUrl ?? null,
    updatedAt: todayISO(),
  })
  await updateDoc(doc(db(), 'students', studentId), payload)

  await recalculateStudentFees(studentId)
  return student
}

export async function removeStudent(studentId: string) {
  const studentRef = doc(db(), 'students', studentId)
  const snap = await getDoc(studentRef)
  if (snap.exists()) {
    const student = normalizeStudent(snap.data())
    await updateDoc(studentRef, {
      is_deleted: true,
      deleted_at: todayISO(),
      deleted_by: 'Owner',
    })
    await writeAuditLog('student_delete', studentId, 'status', 'active', 'deleted')
    await writeStudentHistory({
      studentId,
      studentName: student.name,
      eventType: 'student_deleted',
      prevValue: 'active',
      newValue: 'deleted',
      remarks: 'Student profile deleted / archived',
      source: 'Manual Edit'
    })
  }
}

export async function createPayment(input: PaymentFormValues) {
  const studentRef = doc(db(), 'students', input.studentId)
  const paymentRef = doc(collection(db(), 'payments'))
  const studentSnap = await getDoc(studentRef)
  if (!studentSnap.exists()) {
    throw new Error('Student not found')
  }
  const student = normalizeStudent(studentSnap.data())
  const paymentId = paymentRef.id
  const receiptNumber = input.receiptNumber || nextReceiptNumber()
  const paymentDate = input.date
  const label = input.label || createPaymentLabel(student, paymentDate)

  const paymentPayload = stripUndefinedDeep({
    id: paymentId,
    studentId: student.id,
    studentName: student.name,
    amount: input.amount,
    date: paymentDate,
    label,
    status: 'paid' as const,
    paymentMode: input.paymentMode,
    notes: input.notes,
    receiptNumber,
    createdAt: todayISO(),
  } satisfies Payment)

  await setDoc(paymentRef, paymentPayload)
  await recalculateStudentFees(student.id)

  const pDate = new Date().toISOString()
  const time = pDate.split('T')[1].slice(0, 8)
  await writeTransaction(paymentId, {
    studentId: student.id,
    studentName: student.name,
    studentClass: student.class || 0,
    studentRoll: 'N/A',
    studentPhone: student.parentPhone || student.studentPhone || 'N/A',
    transactionType: 'payment',
    amount: input.amount,
    discount: 0,
    fine: 0,
    netAmount: input.amount,
    paymentMethod: input.paymentMode,
    paymentStatus: 'success',
    collectionSource: 'Manual Collection',
    collectedBy: 'Owner',
    date: paymentDate,
    time,
    receiptNumber,
    notes: input.notes || '',
    createdAt: pDate,
    updatedAt: pDate,
    docRef: `payments/${paymentId}`,
    verificationStatus: 'Manual',
    timeline: [
      { status: 'created', timestamp: pDate, remarks: 'Transaction registered in system' },
      { status: 'success', timestamp: pDate, remarks: `Payment of ${input.amount} recorded manually` }
    ]
  })

  await writeStudentHistory({
    studentId: student.id,
    studentName: student.name,
    eventType: 'payment_made',
    newValue: `INR ${input.amount}`,
    remarks: `Payment recorded via ${input.paymentMode}. Receipt: ${receiptNumber}${input.notes ? ' - ' + input.notes : ''}`,
    source: 'Manual Edit',
    paymentId: paymentId
  })

  return paymentPayload
}

export async function updatePayment(paymentId: string, input: PaymentFormValues) {
  const paymentRef = doc(db(), 'payments', paymentId)
  const snap = await getDoc(paymentRef)
  if (!snap.exists()) throw new Error('Payment not found')
  const payment = normalizePayment(snap.data())

  const fieldsToTrack: Array<keyof Payment> = ['amount', 'date', 'paymentMode', 'notes', 'receiptNumber']
  for (const field of fieldsToTrack) {
    const oldVal = payment[field]
    const newVal = input[field as keyof PaymentFormValues]
    if (newVal !== undefined && oldVal !== newVal) {
      await writeAuditLog(
        'payment_edit',
        paymentId,
        String(field),
        String(oldVal ?? ''),
        String(newVal ?? '')
      )
    }
  }

  await updateDoc(paymentRef, {
    studentId: input.studentId,
    studentName: input.studentName,
    amount: input.amount,
    date: input.date,
    paymentMode: input.paymentMode,
    notes: input.notes,
    receiptNumber: input.receiptNumber || payment.receiptNumber,
    label: input.label || payment.label,
  })

  await recalculateStudentFees(input.studentId)
  if (payment.studentId !== input.studentId) {
    await recalculateStudentFees(payment.studentId)
  }

  // Update transaction document
  try {
    const studentRef = doc(db(), 'students', input.studentId)
    const studentSnap = await getDoc(studentRef)
    const student = studentSnap.exists() ? normalizeStudent(studentSnap.data()) : null
    
    const pDate = new Date().toISOString()
    const time = pDate.split('T')[1].slice(0, 8)
    await writeTransaction(paymentId, {
      studentId: input.studentId,
      studentName: input.studentName,
      studentClass: student?.class || 0,
      studentRoll: 'N/A',
      studentPhone: student?.parentPhone || student?.studentPhone || 'N/A',
      amount: input.amount,
      netAmount: input.amount,
      paymentMethod: input.paymentMode,
      date: input.date,
      time,
      receiptNumber: input.receiptNumber || payment.receiptNumber,
      notes: input.notes || '',
      updatedAt: pDate,
    })
  } catch (err) {
    console.error('Failed to update transaction during updatePayment:', err)
  }

  await writeStudentHistory({
    studentId: input.studentId,
    studentName: input.studentName,
    eventType: 'payment_edited',
    remarks: `Payment ID ${paymentId} amount/details updated. Changed from ${payment.amount} to ${input.amount}`,
    source: 'Manual Edit',
    paymentId: paymentId
  })
}

export async function removePayment(paymentId: string) {
  const paymentRef = doc(db(), 'payments', paymentId)
  const snap = await getDoc(paymentRef)
  if (!snap.exists()) return
  const payment = normalizePayment(snap.data())
  
  await writeAuditLog(
    'payment_delete',
    paymentId,
    'amount',
    String(payment.amount),
    'deleted'
  )

  await writeStudentHistory({
    studentId: payment.studentId,
    studentName: payment.studentName,
    eventType: 'payment_deleted',
    prevValue: `INR ${payment.amount}`,
    remarks: `Payment of INR ${payment.amount} deleted. Receipt was ${payment.receiptNumber || 'N/A'}`,
    source: 'Manual Edit',
    paymentId: paymentId
  })

  // Update transaction status to cancelled
  try {
    await writeTransaction(paymentId, {
      paymentStatus: 'cancelled',
      netAmount: 0,
      updatedAt: new Date().toISOString(),
    })
  } catch (err) {
    console.error('Failed to update transaction during removePayment:', err)
  }

  await deleteDoc(paymentRef)
  await recalculateStudentFees(payment.studentId)
}

export async function createExpense(input: ExpenseFormValues) {
  if (input.isRecurring) {
    const templateId = doc(collection(db(), 'expenses')).id
    const duration = input.durationMonths || 12
    const startM = input.startMonth || (new Date(input.date).getMonth() + 1)
    const startY = input.startYear || new Date(input.date).getFullYear()

    // Save master template document in `recurring_expenses`
    const templateRef = doc(db(), 'recurring_expenses', templateId)
    const startDateISO = `${startY}-${String(startM).padStart(2, '0')}-01`
    const endD = new Date(startY, startM - 1 + duration - 1, 1)
    const endDateISO = `${endD.getFullYear()}-${String(endD.getMonth() + 1).padStart(2, '0')}-01`

    const templatePayload = stripUndefinedDeep({
      id: templateId,
      category: input.category,
      monthlyAmount: input.amount,
      durationMonths: duration,
      startMonth: startM,
      startYear: startY,
      startDate: startDateISO,
      endDate: endDateISO,
      note: input.note,
      createdAt: todayISO(),
      updatedAt: todayISO(),
    })
    await setDoc(templateRef, templatePayload)

    // Generate child documents in `expenses`
    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ]

    let firstPayload: any = null

    for (let i = 0; i < duration; i++) {
      const currentD = new Date(startY, startM - 1 + i, 1)
      const yyyy = currentD.getFullYear()
      const mm = String(currentD.getMonth() + 1).padStart(2, '0')
      const monthName = monthNames[currentD.getMonth()]
      
      const childRef = doc(collection(db(), 'expenses'))
      const childPayload = stripUndefinedDeep({
        id: childRef.id,
        category: input.category,
        amount: input.amount,
        date: `${yyyy}-${mm}-01`,
        note: `${input.note} (${monthName} ${yyyy})`,
        isRecurring: true,
        recurringExpenseId: templateId,
        status: 'unpaid' as const,
        paidAmount: 0,
        createdAt: todayISO(),
        updatedAt: todayISO(),
        durationMonths: duration,
        startMonth: startM,
        startYear: startY,
        startDate: startDateISO,
        endDate: endDateISO,
      } satisfies Expense)

      await setDoc(childRef, childPayload)
      if (i === 0) {
        firstPayload = childPayload
      }
    }
    return firstPayload
  } else {
    // Normal one-time expense
    const refDoc = doc(collection(db(), 'expenses'))
    const payload = stripUndefinedDeep({
      id: refDoc.id,
      category: input.category,
      amount: input.amount,
      date: input.date,
      note: input.note,
      billImageUrl: input.billImageUrl,
      isRecurring: false,
      status: 'paid' as const,
      paidAmount: input.amount,
      createdAt: todayISO(),
      updatedAt: todayISO(),
    } satisfies Expense)
    await setDoc(refDoc, payload)
    return payload
  }
}

export async function updateExpense(expenseId: string, input: ExpenseFormValues) {
  const refDoc = doc(db(), 'expenses', expenseId)
  const snap = await getDoc(refDoc)
  if (!snap.exists()) return

  const existing = snap.data() as Expense

  if (existing.isRecurring && existing.recurringExpenseId) {
    const templateId = existing.recurringExpenseId
    const templateRef = doc(db(), 'recurring_expenses', templateId)

    // Update the master template
    let duration = input.durationMonths || existing.durationMonths || 12
    let startM = input.startMonth || existing.startMonth || (new Date(input.date).getMonth() + 1)
    let startY = input.startYear || existing.startYear || new Date(input.date).getFullYear()
    const startDateISO = `${startY}-${String(startM).padStart(2, '0')}-01`
    const endD = new Date(startY, startM - 1 + duration - 1, 1)
    const endDateISO = `${endD.getFullYear()}-${String(endD.getMonth() + 1).padStart(2, '0')}-01`

    await setDoc(templateRef, stripUndefinedDeep({
      id: templateId,
      category: input.category,
      monthlyAmount: input.amount,
      durationMonths: duration,
      startMonth: startM,
      startYear: startY,
      startDate: startDateISO,
      endDate: endDateISO,
      note: input.note,
      updatedAt: todayISO(),
    }), { merge: true })

    // Fetch all current child installments in expenses collection
    const expensesRef = collection(db(), 'expenses')
    const q = query(expensesRef, where('recurringExpenseId', '==', templateId))
    const querySnap = await getDocs(q)
    const childDocs = querySnap.docs.map(d => d.data() as Expense)

    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ]

    // We calculate the new set of target monthly dates
    const targetDates: string[] = []
    for (let i = 0; i < duration; i++) {
      const currentD = new Date(startY, startM - 1 + i, 1)
      const yyyy = currentD.getFullYear()
      const mm = String(currentD.getMonth() + 1).padStart(2, '0')
      targetDates.push(`${yyyy}-${mm}-01`)
    }

    // Update existing unpaid future installments or create missing ones
    for (let i = 0; i < duration; i++) {
      const targetDate = targetDates[i]
      const currentD = new Date(startY, startM - 1 + i, 1)
      const monthName = monthNames[currentD.getMonth()]
      const yyyy = currentD.getFullYear()

      const matchedChild = childDocs.find(c => c.date === targetDate)

      if (matchedChild) {
        if (matchedChild.status !== 'paid') {
          const childRef = doc(db(), 'expenses', matchedChild.id)
          await updateDoc(childRef, stripUndefinedDeep({
            category: input.category,
            amount: input.amount,
            note: `${input.note} (${monthName} ${yyyy})`,
            durationMonths: duration,
            startMonth: startM,
            startYear: startY,
            startDate: startDateISO,
            endDate: endDateISO,
            updatedAt: todayISO(),
          }))
        }
      } else {
        const childRef = doc(collection(db(), 'expenses'))
        await setDoc(childRef, stripUndefinedDeep({
          id: childRef.id,
          category: input.category,
          amount: input.amount,
          date: targetDate,
          note: `${input.note} (${monthName} ${yyyy})`,
          isRecurring: true,
          recurringExpenseId: templateId,
          status: 'unpaid' as const,
          paidAmount: 0,
          createdAt: todayISO(),
          updatedAt: todayISO(),
          durationMonths: duration,
          startMonth: startM,
          startYear: startY,
          startDate: startDateISO,
          endDate: endDateISO,
        } satisfies Expense))
      }
    }

    // Delete excess future unpaid child documents
    for (const child of childDocs) {
      if (!targetDates.includes(child.date)) {
        if (child.status !== 'paid') {
          await deleteDoc(doc(db(), 'expenses', child.id))
        }
      }
    }

  } else {
    // For one-time expenses or specific updates
    const fieldsToTrack: Array<keyof Expense> = ['category', 'amount', 'date', 'note', 'paidAmount', 'status']
    for (const field of fieldsToTrack) {
      const oldVal = existing[field]
      const newVal = input[field as keyof ExpenseFormValues]
      if (oldVal !== newVal) {
        await writeAuditLog(
          'expense_edit',
          expenseId,
          String(field),
          String(oldVal ?? ''),
          String(newVal ?? '')
        )
      }
    }

    await updateDoc(refDoc, stripUndefinedDeep({
      category: input.category,
      amount: input.amount,
      date: input.date,
      note: input.note,
      billImageUrl: input.billImageUrl,
      status: input.status,
      paidAmount: input.paidAmount,
      updatedAt: todayISO(),
    }))
  }
}

export async function removeExpense(expenseId: string) {
  const refDoc = doc(db(), 'expenses', expenseId)
  const snap = await getDoc(refDoc)
  if (!snap.exists()) return

  const expense = snap.data() as Expense

  if (expense.isRecurring && expense.recurringExpenseId) {
    const templateId = expense.recurringExpenseId

    const expensesRef = collection(db(), 'expenses')
    const q = query(expensesRef, where('recurringExpenseId', '==', templateId))
    const querySnap = await getDocs(q)
    const childDocs = querySnap.docs.map(d => d.data() as Expense)

    for (const child of childDocs) {
      if (child.status !== 'paid') {
        await deleteDoc(doc(db(), 'expenses', child.id))
      }
    }

    await deleteDoc(doc(db(), 'recurring_expenses', templateId))

    await writeAuditLog(
      'expense_delete_recurring',
      templateId,
      'note',
      expense.note,
      'future_stopped'
    )
  } else {
    await writeAuditLog(
      'expense_delete',
      expenseId,
      'amount',
      String(expense.amount),
      'deleted'
    )
    await deleteDoc(refDoc)
  }
}

export async function attachStudentPhoto(studentId: string, file: File) {
  const url = await uploadFileToStorage(`students/${studentId}/photo-${Date.now()}-${file.name}`, file)
  await updateDoc(doc(db(), 'students', studentId), {
    photoUrl: url,
    updatedAt: todayISO(),
  })
  return url
}

export async function attachExpenseBill(expenseId: string, file: File) {
  const url = await uploadFileToStorage(`expenses/${expenseId}/bill-${Date.now()}-${file.name}`, file)
  await updateDoc(doc(db(), 'expenses', expenseId), {
    billImageUrl: url,
    updatedAt: todayISO(),
  })
  return url
}

export function deriveDashboardData(
  students: Student[],
  payments: Payment[],
  expenses: Expense[],
  now = new Date(),
): {
  stats: DashboardStats
  upcomingPayments: Payment[]
  paymentHistory: Payment[]
  calendarPayments: Record<number, Payment[]>
  monthlySeries: MonthlySeriesPoint[]
  notifications: NotificationItem[]
  searchResults: SearchResult[]
  tasks: TaskItem[]
} {
  const currentMonth = monthKey(todayISO(now))
  const currentMonthName = now.toLocaleDateString('en-IN', { month: 'long' })
  const today = todayISO(now)
  const tomorrow = todayISO(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1))
  const monthStart = startOfMonthISO(now)

  const activeStudentIds = new Set(
    students
      .filter((student) => student.status === 'active')
      .map((student) => student.id)
  )
  const nonDeletedStudentIds = new Set(
    students
      .map((student) => student.id)
  )

  const activeStudents = activeStudentIds.size
  const pendingFees = students
    .filter((student) => student.status === 'active')
    .reduce((sum, student) => sum + student.pending, 0)
  const monthCollection = payments
    .filter((payment) => payment.status === 'paid' && nonDeletedStudentIds.has(payment.studentId) && monthKey(payment.date) === currentMonth)
    .reduce((sum, payment) => sum + payment.amount, 0)
  const monthExpenses = expenses
    .filter((expense) => monthKey(expense.date) === currentMonth)
    .reduce((sum, expense) => sum + expense.amount, 0)
  const todayCollection = payments
    .filter((payment) => payment.status === 'paid' && nonDeletedStudentIds.has(payment.studentId) && sameDay(payment.date, today))
    .reduce((sum, payment) => sum + payment.amount, 0)

  const year = now.getFullYear()
  const month = now.getMonth()

  const currentMonthStart = new Date(year, month, 1)
  const currentMonthEnd = new Date(year, month + 1, 0)
  const currentMonthStartISO = todayISO(currentMonthStart)
  const currentMonthEndISO = todayISO(currentMonthEnd)

  const nextMonthStart = new Date(year, month + 1, 1)
  const nextMonthEnd = new Date(year, month + 2, 0)
  const nextMonthStartISO = todayISO(nextMonthStart)
  const nextMonthEndISO = todayISO(nextMonthEnd)

  let currentMonthExpected = 0
  let nextMonthExpected = 0
  let currentMonthMonthlyExpected = 0
  let currentMonthSplitExpected = 0
  let currentMonthFullExpected = 0
  let totalCoachingFeeValue = 0
  let totalRemainingRevenue = 0

  const twelveMonthsEnd = new Date(year, month + 12, 0)
  const twelveMonthsEndISO = todayISO(twelveMonthsEnd)
  const annualExpenseForecast = expenses.reduce((sum, exp) => {
    if (exp.date >= currentMonthStartISO && exp.date <= twelveMonthsEndISO) {
      return sum + exp.amount
    }
    return sum
  }, 0)

  students.forEach((student) => {
    if (student.status !== 'active') return
    totalCoachingFeeValue += student.totalFee
    totalRemainingRevenue += student.pending

    student.feeSchedule.forEach((item) => {
      if (item.status === 'paid') return
      const due = item.amount
      const paid = item.paidAmount || 0
      const remaining = Math.max(due - paid, 0)

      if (item.dueDate >= currentMonthStartISO && item.dueDate <= currentMonthEndISO) {
        currentMonthExpected += remaining
        if (student.paymentType === 'Monthly') {
          currentMonthMonthlyExpected += remaining
        } else if (student.paymentType === 'Split') {
          currentMonthSplitExpected += remaining
        } else if (student.paymentType === 'Full Payment') {
          currentMonthFullExpected += remaining
        }
      } else if (item.dueDate >= nextMonthStartISO && item.dueDate <= nextMonthEndISO) {
        nextMonthExpected += remaining
      }
    })
  })

  const currentMonthTotalExpected = currentMonthMonthlyExpected + currentMonthSplitExpected + currentMonthFullExpected

  const scheduleEntries = students
    .filter((student) => activeStudentIds.has(student.id))
    .flatMap((student) =>
      student.feeSchedule
      .filter((item) => item.status !== 'paid')
      .map((item) => ({
        ...item,
        studentId: student.id,
        studentName: student.name,
        studentClass: student.class,
      })),
  )

  const upcomingPayments = scheduleEntries
    .filter((item) => item.dueDate >= today)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    .slice(0, 6)
    .map((item) => ({
      id: item.id,
      studentId: item.studentId,
      studentName: item.studentName,
      amount: item.amount,
      date: item.dueDate,
      label: item.label,
      status: 'upcoming' as PaymentStatus,
      paymentMode: 'Cash' as const,
      notes: '',
      receiptNumber: item.id,
      createdAt: item.dueDate,
    }))

  const paymentHistory = [...payments].sort((a, b) => b.date.localeCompare(a.date))

  const calendarPayments: Record<number, Payment[]> = {}
  const monthLength = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  for (let day = 1; day <= monthLength; day += 1) {
    const iso = `${currentMonth}-${String(day).padStart(2, '0')}`
    calendarPayments[day] = scheduleEntries
      .filter((item) => sameDay(item.dueDate, iso) || item.dueDate === iso)
      .map((item, index) => ({
        id: `${item.id}-${index}`,
        studentId: item.studentId,
        studentName: item.studentName,
        amount: item.amount,
        date: item.dueDate,
        label: item.label,
        status: (item.dueDate < today ? 'overdue' : 'upcoming') as PaymentStatus,
        paymentMode: 'Cash' as const,
        notes: '',
        receiptNumber: item.id,
        createdAt: item.dueDate,
      }))
  }

  const paymentsByMonth = new Map<string, { income: number; expense: number }>()
  for (const payment of payments) {
    const key = monthKey(payment.date)
    const row = paymentsByMonth.get(key) ?? { income: 0, expense: 0 }
    row.income += payment.amount
    paymentsByMonth.set(key, row)
  }
  for (const expense of expenses) {
    const key = monthKey(expense.date)
    const row = paymentsByMonth.get(key) ?? { income: 0, expense: 0 }
    row.expense += expense.amount
    paymentsByMonth.set(key, row)
  }

  const monthlySeries: MonthlySeriesPoint[] = Array.from({ length: 6 }, (_, index) => {
    const monthDate = new Date(now.getFullYear(), now.getMonth() - (5 - index), 1)
    const key = todayISO(monthDate).slice(0, 7)
    const row = paymentsByMonth.get(key) ?? { income: 0, expense: 0 }
    return {
      month: monthDate.toLocaleDateString('en-IN', { month: 'short' }),
      income: row.income,
      expense: row.expense,
    }
  })

  const notifications: NotificationItem[] = []
  const dueToday = scheduleEntries.filter((item) => sameDay(item.dueDate, today))
  const dueTomorrow = scheduleEntries.filter((item) => sameDay(item.dueDate, tomorrow))
  const overdue = scheduleEntries.filter((item) => item.dueDate < today)
  const utilityExpenses = expenses.filter((expense) => monthKey(expense.date) === currentMonth && (expense.category === 'Electricity' || expense.category === 'Internet'))

  dueToday.slice(0, 2).forEach((item) => {
    notifications.push({
      id: `due-${item.id}`,
      label: `${item.studentName} - ${formatINR(item.amount)} due today`,
      tone: 'warning',
      time: 'Today',
    })
  })
  dueTomorrow.slice(0, 2).forEach((item) => {
    notifications.push({
      id: `tomorrow-${item.id}`,
      label: `${item.studentName} - ${formatINR(item.amount)} due tomorrow`,
      tone: 'neutral',
      time: 'Tomorrow',
    })
  })
  overdue.slice(0, 2).forEach((item) => {
    notifications.push({
      id: `overdue-${item.id}`,
      label: `${item.studentName} - ${formatINR(item.amount)} overdue`,
      tone: 'danger',
      time: 'Overdue',
    })
  })
  utilityExpenses.slice(0, 2).forEach((expense) => {
    notifications.push({
      id: `expense-${expense.id}`,
      label: `${expense.category} - ${formatINR(expense.amount)} scheduled`,
      tone: 'warning',
      time: 'Upcoming',
    })
  })

  const searchResults: SearchResult[] = [
    ...students.map((student) => ({
      id: student.id,
      type: 'student' as const,
      title: student.name,
      subtitle: `Class ${student.class} · ${student.batch}`,
      meta: student.pending > 0 ? `${formatINR(student.pending)} due` : 'Paid up',
      href: `/students/${student.id}`,
    })),
    ...payments.map((payment) => ({
      id: payment.id,
      type: 'payment' as const,
      title: payment.receiptNumber,
      subtitle: payment.studentName,
      meta: `${formatINR(payment.amount)} · ${paymentModeLabel(payment.paymentMode)}`,
      href: `/students/${payment.studentId}`,
    })),
    ...expenses.map((expense) => ({
      id: expense.id,
      type: 'expense' as const,
      title: expense.category,
      subtitle: expense.note,
      meta: formatINR(expense.amount),
      href: '/expenses',
    })),
  ]

  const tasks: TaskItem[] = [
    ...dueToday.map((item) => ({
      id: `task-${item.id}`,
      label: `Collect fee from ${item.studentName}`,
      meta: `${formatINR(item.amount)} · ${item.label}`,
      done: item.status === 'paid',
      sourceId: item.id,
      sourceType: 'payment' as const,
    })),
    ...utilityExpenses.map((expense) => ({
      id: `expense-task-${expense.id}`,
      label: `Review ${expense.category}`,
      meta: `${formatINR(expense.amount)} · ${formatLongDate(expense.date)}`,
      done: false,
      sourceId: expense.id,
      sourceType: 'expense' as const,
    })),
  ]

  const totalExpenses = expenses.reduce((sum, expense) => sum + expense.amount, 0)

  const totalRevenueCollected = payments
    .filter((p) => p.status === 'paid' && nonDeletedStudentIds.has(p.studentId))
    .reduce((sum, p) => sum + p.amount, 0)

  return {
    stats: {
      totalStudents: students.length,
      activeStudents,
      pendingFees,
      monthCollection,
      monthExpenses,
      netProfit: totalRevenueCollected - totalExpenses,
      todayDue: dueToday.reduce((sum, item) => sum + item.amount, 0),
      todayCollection,
      currentMonthExpected,
      nextMonthExpected,
      currentMonthMonthlyExpected,
      currentMonthSplitExpected,
      currentMonthFullExpected,
      currentMonthTotalExpected,
      totalCoachingFeeValue,
      totalRemainingRevenue,
      totalRevenueCollected,
      annualExpenseForecast,
    },
    upcomingPayments,
    paymentHistory,
    calendarPayments,
    monthlySeries,
    notifications,
    searchResults,
    tasks,
  }
}

export async function saveTask(task: TaskItem) {
  await setDoc(doc(db(), 'tasks', task.id), stripUndefinedDeep({
    ...task,
    updatedAt: todayISO(),
    createdAt: todayISO(),
  }))
}

export async function setTaskDone(taskId: string, done: boolean) {
  await updateDoc(doc(db(), 'tasks', taskId), {
    done,
    updatedAt: todayISO(),
  })
}

function paymentModeLabel(paymentMode: PaymentMode) {
  return paymentMode
}

export function filterStudents(students: Student[], query: string, statusFilter = 'all', paymentFilter = 'all') {
  const q = query.trim().toLowerCase()
  return students.filter((student) => {
    const matchesQuery =
      !q ||
      [student.name, student.batch, student.parentPhone, String(student.class), student.notes, student.paymentType]
        .join(' ')
        .toLowerCase()
        .includes(q)
    const matchesStatus = statusFilter === 'all' || student.status === statusFilter
    const matchesPayment = paymentFilter === 'all' || student.paymentType === paymentFilter
    return matchesQuery && matchesStatus && matchesPayment
  })
}

export function filterExpenses(expenses: Expense[], query: string, category = 'all') {
  const q = query.trim().toLowerCase()
  return expenses.filter((expense) => {
    const matchesQuery =
      !q ||
      [expense.category, expense.note, String(expense.amount), expense.date]
        .join(' ')
        .toLowerCase()
        .includes(q)
    const matchesCategory = category === 'all' || expense.category === category
    return matchesQuery && matchesCategory
  })
}

export async function writeAuditLog(action: string, targetId: string, fieldName: string, oldValue: string, newValue: string) {
  const refDoc = doc(collection(db(), 'audit_logs'))
  const now = new Date()
  const dateStr = todayISO(now)
  const timeStr = now.toTimeString().slice(0, 8)
  const user = 'Owner'
  await setDoc(refDoc, {
    id: refDoc.id,
    date: dateStr,
    time: timeStr,
    user,
    action,
    targetId,
    fieldName,
    oldValue,
    newValue,
    createdAt: now.toISOString(),
  })
}

export async function recalculateStudentFees(studentId: string) {
  const studentRef = doc(db(), 'students', studentId)
  const studentSnap = await getDoc(studentRef)
  if (!studentSnap.exists()) return
  const student = normalizeStudent(studentSnap.data())
  const paymentQuery = query(
    collection(db(), 'payments'),
    where('studentId', '==', studentId)
  )
  const paymentsSnap = await getDocs(paymentQuery)
  const payments = paymentsSnap.docs.map((docSnap) => normalizePayment({ id: docSnap.id, ...docSnap.data() }))
  payments.sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt))
  const paid = payments
    .filter((p) => p.status === 'paid')
    .reduce((sum, p) => sum + p.amount, 0)
  const pending = Math.max(student.totalFee - paid, 0)
  const updatedSchedule = student.feeSchedule.map((item) => {
    const newItem = {
      ...item,
      status: 'upcoming' as PaymentStatus,
      paidAmount: 0,
    }
    delete newItem.paymentId
    return newItem
  })
  const today = todayISO()
  const hasActivePromise = student.promiseToPayDate && student.promiseToPayDate >= today

  let remaining = paid
  for (const item of updatedSchedule) {
    if (remaining >= item.amount) {
      item.status = 'paid'
      item.paidAmount = item.amount
      let temp = remaining
      for (const p of payments) {
        if (temp > 0) {
          item.paymentId = p.id
          temp -= p.amount
        }
      }
      remaining -= item.amount
    } else if (remaining > 0) {
      item.status = 'partial'
      item.paidAmount = remaining
      let temp = remaining
      for (const p of payments) {
        if (temp > 0) {
          item.paymentId = p.id
          temp -= p.amount
        }
      }
      remaining = 0
    } else {
      item.paidAmount = 0
      if (item.dueDate === today) {
        item.status = 'due-today'
      } else if (item.dueDate < today) {
        if (hasActivePromise) {
          item.status = 'upcoming'
        } else {
          const diffTime = Math.abs(new Date(today).getTime() - new Date(item.dueDate).getTime())
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
          item.status = diffDays > 7 ? 'critical' : 'overdue'
        }
      } else {
        item.status = 'upcoming'
      }
    }
  }
  for (const item of updatedSchedule) {
    if (item.status === 'upcoming') {
      if (item.dueDate === today) {
        item.status = 'due-today'
      } else if (item.dueDate < today) {
        if (hasActivePromise) {
          item.status = 'upcoming'
        } else {
          const diffTime = Math.abs(new Date(today).getTime() - new Date(item.dueDate).getTime())
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
          item.status = diffDays > 7 ? 'critical' : 'overdue'
        }
      }
    }
  }
  await updateDoc(studentRef, stripUndefinedDeep({
    paid,
    pending,
    feeSchedule: updatedSchedule,
    updatedAt: todayISO(),
  }))
}

export async function allocateAndSaveFamilyFees(
  familyId: string,
  studentIds: string[],
  combinedAgreedFee: number,
  allocationType: 'proportional' | 'equal' | 'manual',
  manualAllocations?: Record<string, number>,
) {
  const studentSnaps = await Promise.all(studentIds.map(id => getDoc(doc(db(), 'students', id))))
  const students = studentSnaps.filter(s => s.exists()).map(s => normalizeStudent({ id: s.id, ...s.data() }))
  if (students.length === 0) return
  let allocations: Record<string, number> = {}
  if (allocationType === 'manual' && manualAllocations) {
    allocations = manualAllocations
  } else if (allocationType === 'equal') {
    const share = Math.round(combinedAgreedFee / students.length)
    students.forEach(s => {
      allocations[s.id] = share
    })
  } else {
    const originalFees = students.map(s => s.totalFee)
    const totalOriginal = originalFees.reduce((sum, f) => sum + f, 0)
    if (totalOriginal > 0) {
      let allocatedSum = 0
      students.forEach((s, idx) => {
        if (idx === students.length - 1) {
          allocations[s.id] = combinedAgreedFee - allocatedSum
        } else {
          const share = Math.round((s.totalFee / totalOriginal) * combinedAgreedFee)
          allocations[s.id] = share
          allocatedSum += share
        }
      })
    } else {
      const share = Math.round(combinedAgreedFee / students.length)
      students.forEach(s => {
        allocations[s.id] = share
      })
    }
  }
  for (const student of students) {
    const share = allocations[student.id] || 0
    const updatedPlan = {
      ...student.feePlan,
      agreedTotalFee: share,
    } as StudentFeePlan
    const updatedSchedule = buildFeeScheduleFromPlan(student.id, updatedPlan, student.joined, student.paid)
    await updateDoc(doc(db(), 'students', student.id), {
      totalFee: share,
      feePlan: updatedPlan,
      feeSchedule: updatedSchedule,
      parentId: familyId,
      updatedAt: todayISO(),
    })
    await recalculateStudentFees(student.id)
  }
}

export function subscribeFamilies(
  onChange: (families: Family[]) => void,
  onError?: (error: unknown) => void,
) {
  const q = query(collection(db(), 'families'), orderBy('parentName', 'asc'))
  return onSnapshot(
    q,
    (snapshot) => {
      const list: Family[] = []
      snapshot.forEach((docSnap) => {
        const raw = docSnap.data()
        list.push({
          id: docSnap.id,
          parentName: toSafeString(raw.parentName),
          parentPhone: toSafeString(raw.parentPhone),
          parentWhatsApp: toSafeString(raw.parentWhatsApp),
          studentIds: Array.isArray(raw.studentIds) ? raw.studentIds.map(String) : [],
          combinedAgreedFee: toSafeNumber(raw.combinedAgreedFee),
          createdAt: toSafeString(raw.createdAt),
          updatedAt: toSafeString(raw.updatedAt),
        })
      })
      onChange(list)
    },
    onError,
  )
}

export async function createFamily(
  input: Omit<Family, 'id' | 'createdAt' | 'updatedAt'>,
  allocationType: 'proportional' | 'equal' | 'manual',
  manualAllocations?: Record<string, number>,
) {
  try {
    const refDoc = doc(collection(db(), 'families'))
    
    // Strict sanitization layer to prevent undefined/null crashes
    const payload = {
      id: refDoc.id,
      parentName: input.parentName ? input.parentName.trim() : 'Unknown Parent',
      parentPhone: input.parentPhone ? input.parentPhone.trim() : '',
      parentWhatsApp: input.parentWhatsApp ? input.parentWhatsApp.trim() : '',
      studentIds: Array.isArray(input.studentIds) ? input.studentIds : [],
      combinedAgreedFee: typeof input.combinedAgreedFee === 'number' ? input.combinedAgreedFee : 0,
      createdAt: todayISO(),
      updatedAt: todayISO(),
    }

    if (payload.studentIds.length === 0) {
      throw new Error('A family must have at least one student selected.')
    }

    await setDoc(refDoc, payload)
    await allocateAndSaveFamilyFees(refDoc.id, payload.studentIds, payload.combinedAgreedFee, allocationType, manualAllocations)
    return payload
  } catch (error: any) {
    console.error('[Firestore Error - createFamily]:', error)
    throw new Error(error.message || 'Failed to create family document in Firestore.')
  }
}

export async function updateFamily(
  familyId: string,
  input: Omit<Family, 'id' | 'createdAt' | 'updatedAt'>,
  allocationType: 'proportional' | 'equal' | 'manual',
  manualAllocations?: Record<string, number>,
) {
  const refDoc = doc(db(), 'families', familyId)
  const snap = await getDoc(refDoc)
  if (snap.exists()) {
    const existing = snap.data()
    const fieldsToTrack: Array<keyof Omit<Family, 'studentIds'>> = ['parentName', 'parentPhone', 'parentWhatsApp', 'combinedAgreedFee']
    for (const field of fieldsToTrack) {
      const oldVal = existing[field]
      const newVal = input[field as keyof typeof input]
      if (oldVal !== newVal) {
        await writeAuditLog(
          'family_edit',
          familyId,
          String(field),
          String(oldVal ?? ''),
          String(newVal ?? '')
        )
      }
    }
  }
  const payload = {
    parentName: input.parentName,
    parentPhone: input.parentPhone,
    parentWhatsApp: input.parentWhatsApp,
    studentIds: input.studentIds,
    combinedAgreedFee: input.combinedAgreedFee,
    updatedAt: todayISO(),
  }
  await updateDoc(refDoc, payload)
  await allocateAndSaveFamilyFees(familyId, input.studentIds, input.combinedAgreedFee, allocationType, manualAllocations)
}

export async function removeFamily(familyId: string) {
  const refDoc = doc(db(), 'families', familyId)
  const snap = await getDoc(refDoc)
  if (snap.exists()) {
    const family = snap.data()
    const studentIds: string[] = family.studentIds || []
    for (const id of studentIds) {
      await updateDoc(doc(db(), 'students', id), {
        parentId: null,
      })
    }
  }
  await deleteDoc(refDoc)
}

export async function createFamilyPayment(
  familyId: string,
  amount: number,
  date: string,
  paymentMode: PaymentMode,
  allocationType: 'equal' | 'proportional' | 'manual',
  manualAllocations?: Record<string, number>,
  notes = '',
) {
  const familyDoc = await getDoc(doc(db(), 'families', familyId))
  if (!familyDoc.exists()) throw new Error('Family not found')
  const family = familyDoc.data()
  const studentIds: string[] = family.studentIds || []
  if (studentIds.length === 0) throw new Error('No students linked to this family')
  const studentSnaps = await Promise.all(studentIds.map(id => getDoc(doc(db(), 'students', id))))
  const students = studentSnaps.filter(s => s.exists()).map(s => normalizeStudent({ id: s.id, ...s.data() }))
  let allocations: Record<string, number> = {}
  if (allocationType === 'manual' && manualAllocations) {
    allocations = manualAllocations
  } else if (allocationType === 'equal') {
    const share = Math.round(amount / students.length)
    students.forEach((s, idx) => {
      if (idx === students.length - 1) {
        allocations[s.id] = amount - (share * (students.length - 1))
      } else {
        allocations[s.id] = share
      }
    })
  } else {
    const totalPending = students.reduce((sum, s) => sum + s.pending, 0)
    if (totalPending > 0) {
      let allocatedSum = 0
      students.forEach((s, idx) => {
        if (idx === students.length - 1) {
          allocations[s.id] = amount - allocatedSum
        } else {
          const share = Math.round((s.pending / totalPending) * amount)
          allocations[s.id] = share
          allocatedSum += share
        }
      })
    } else {
      const share = Math.round(amount / students.length)
      students.forEach((s, idx) => {
        if (idx === students.length - 1) {
          allocations[s.id] = amount - (share * (students.length - 1))
        } else {
          allocations[s.id] = share
        }
      })
    }
  }
  const groupPaymentId = `grp-${crypto.randomUUID()}`
  const receiptNumber = nextReceiptNumber()
  for (const student of students) {
    const studentShare = allocations[student.id] || 0
    if (studentShare <= 0) continue
    const paymentRef = doc(collection(db(), 'payments'))
    const paymentPayload: Payment = {
      id: paymentRef.id,
      studentId: student.id,
      studentName: student.name,
      amount: studentShare,
      date: date,
      label: `Family Payment (${family.parentName})`,
      status: 'paid',
      paymentMode: paymentMode,
      notes: notes,
      receiptNumber: receiptNumber,
      parentId: familyId,
      parentName: family.parentName,
      parentPaymentId: groupPaymentId,
      createdAt: todayISO(),
    }
    await setDoc(paymentRef, stripUndefinedDeep(paymentPayload))
    await recalculateStudentFees(student.id)
  }
}

export function subscribeUsers(
  onChange: (users: any[]) => void,
  onError?: (error: unknown) => void,
) {
  const q = query(collection(db(), 'users'), orderBy('name', 'asc'))
  return onSnapshot(
    q,
    (snapshot) => {
      const list: any[] = []
      snapshot.forEach((docSnap) => {
        list.push({ id: docSnap.id, ...docSnap.data() })
      })
      onChange(list)
    },
    onError,
  )
}

export async function inviteUser(name: string, email: string, role: string, ownerEmail: string) {
  const emailLower = email.toLowerCase().trim()
  const refDoc = doc(db(), 'users', emailLower)
  const payload = {
    id: emailLower,
    email: emailLower,
    name: name.trim(),
    role,
    status: 'Pending Invitation',
    createdAt: todayISO(),
    updatedAt: todayISO(),
  }
  await setDoc(refDoc, payload)
  await writeUserManagementAudit('User Invited', ownerEmail, emailLower)
}

export async function changeUserRole(email: string, role: string, ownerEmail: string) {
  const emailLower = email.toLowerCase().trim()
  const refDoc = doc(db(), 'users', emailLower)
  await updateDoc(refDoc, {
    role,
    updatedAt: todayISO(),
  })
  await writeUserManagementAudit(`Role Changed to ${role}`, ownerEmail, emailLower)
}

export async function disableUser(email: string, ownerEmail: string) {
  const emailLower = email.toLowerCase().trim()
  const refDoc = doc(db(), 'users', emailLower)
  await updateDoc(refDoc, {
    status: 'Disabled',
    updatedAt: todayISO(),
  })
  await writeUserManagementAudit('User Disabled', ownerEmail, emailLower)
}

export async function enableUser(email: string, ownerEmail: string) {
  const emailLower = email.toLowerCase().trim()
  const refDoc = doc(db(), 'users', emailLower)
  await updateDoc(refDoc, {
    status: 'Active',
    updatedAt: todayISO(),
  })
  await writeUserManagementAudit('User Enabled', ownerEmail, emailLower)
}

export async function removeUser(email: string, ownerEmail: string) {
  const emailLower = email.toLowerCase().trim()
  const refDoc = doc(db(), 'users', emailLower)
  await deleteDoc(refDoc)
  await writeUserManagementAudit('User Removed', ownerEmail, emailLower)
}

async function writeUserManagementAudit(action: string, ownerEmail: string, targetEmail: string) {
  const refDoc = doc(collection(db(), 'user_audit_logs'))
  const now = new Date()
  await setDoc(refDoc, {
    id: refDoc.id,
    action,
    ownerEmail,
    targetUserEmail: targetEmail,
    date: todayISO(now),
    time: now.toTimeString().slice(0, 8),
    createdAt: now.toISOString(),
  })
}

export async function syncStudentFamilyLink(
  studentId: string,
  parentPhone: string,
  studentTotalFee: number,
  input: { parentName?: string; whatsapp?: string; alternatePhone?: string; address?: string }
) {
  const dbRef = db()
  const cleanedPhone = parentPhone.trim()
  if (!cleanedPhone) return null

  const familyQuery = query(collection(dbRef, 'families'), where('parentPhone', '==', cleanedPhone))
  const familySnap = await getDocs(familyQuery)
  
  let familyId = ''
  
  if (!familySnap.empty) {
    const familyDoc = familySnap.docs[0]
    familyId = familyDoc.id
    const familyData = familyDoc.data()
    const studentIds: string[] = familyData.studentIds || []
    
    if (!studentIds.includes(studentId)) {
      studentIds.push(studentId)
    }

    const studentSnaps = await Promise.all(studentIds.map(id => getDoc(doc(dbRef, 'students', id))))
    let newCombinedAgreedFee = 0
    studentSnaps.forEach(snap => {
      if (snap.exists() && snap.data().is_deleted !== true) {
        newCombinedAgreedFee += (snap.data().totalFee || 0)
      }
    })

    await updateDoc(doc(dbRef, 'families', familyId), {
      studentIds,
      combinedAgreedFee: newCombinedAgreedFee,
      parentName: input.parentName || familyData.parentName,
      parentWhatsApp: input.whatsapp || familyData.parentWhatsApp,
      alternatePhone: input.alternatePhone || familyData.alternatePhone || '',
      updatedAt: todayISO(),
    })
  } else {
    const familyRef = doc(collection(dbRef, 'families'))
    familyId = familyRef.id
    await setDoc(familyRef, {
      id: familyId,
      parentName: input.parentName || 'Parent of ' + studentId,
      parentPhone: cleanedPhone,
      parentWhatsApp: input.whatsapp || cleanedPhone,
      alternatePhone: input.alternatePhone || '',
      studentIds: [studentId],
      combinedAgreedFee: studentTotalFee,
      createdAt: todayISO(),
      updatedAt: todayISO(),
    })
  }

  await updateDoc(doc(dbRef, 'students', studentId), {
    parentId: familyId,
    parentName: input.parentName || '',
    whatsapp: input.whatsapp || '',
    address: input.address || '',
  })

  return familyId
}

export async function cleanOldFamilyLink(studentId: string, oldFamilyId?: string) {
  if (!oldFamilyId) return
  const dbRef = db()
  const familyRef = doc(dbRef, 'families', oldFamilyId)
  const familySnap = await getDoc(familyRef)
  if (familySnap.exists()) {
    const familyData = familySnap.data()
    const studentIds: string[] = (familyData.studentIds || []).filter((id: string) => id !== studentId)
    if (studentIds.length === 0) {
      await deleteDoc(familyRef)
    } else {
      const studentSnaps = await Promise.all(studentIds.map(id => getDoc(doc(dbRef, 'students', id))))
      let newCombinedAgreedFee = 0
      studentSnaps.forEach(snap => {
        if (snap.exists() && snap.data().is_deleted !== true) {
          newCombinedAgreedFee += (snap.data().totalFee || 0)
        }
      })
      await updateDoc(familyRef, {
        studentIds,
        combinedAgreedFee: newCombinedAgreedFee,
        updatedAt: todayISO(),
      })
    }
  }
}

export async function linkStudentToFamily(studentId: string, familyId: string) {
  const dbRef = db()
  const studentRef = doc(dbRef, 'students', studentId)
  const familyRef = doc(dbRef, 'families', familyId)

  const studentSnap = await getDoc(studentRef)
  const familySnap = await getDoc(familyRef)

  if (!studentSnap.exists() || !familySnap.exists()) {
    throw new Error('Student or Family not found')
  }

  const student = studentSnap.data()
  const family = familySnap.data()

  // Clean old link if any
  if (student.parentId && student.parentId !== familyId) {
    await cleanOldFamilyLink(studentId, student.parentId)
  }

  const studentIds: string[] = family.studentIds || []
  if (!studentIds.includes(studentId)) {
    studentIds.push(studentId)
  }

  const studentSnaps = await Promise.all(studentIds.map(id => getDoc(doc(dbRef, 'students', id))))
  let newCombinedAgreedFee = 0
  studentSnaps.forEach(snap => {
    if (snap.exists() && snap.data().is_deleted !== true) {
      newCombinedAgreedFee += (snap.data().totalFee || 0)
    }
  })

  await updateDoc(familyRef, {
    studentIds,
    combinedAgreedFee: newCombinedAgreedFee,
    updatedAt: todayISO(),
  })

  await updateDoc(studentRef, {
    parentId: familyId,
    parentName: family.parentName || student.parentName || '',
    parentPhone: family.parentPhone || student.parentPhone || '',
  })
}

export async function createFamilyAndLinkStudent(
  studentId: string,
  parentName: string,
  parentPhone: string,
  parentWhatsApp?: string,
  alternatePhone?: string
) {
  const dbRef = db()
  const studentRef = doc(dbRef, 'students', studentId)
  const studentSnap = await getDoc(studentRef)
  if (!studentSnap.exists()) {
    throw new Error('Student not found')
  }
  const student = studentSnap.data()

  const familyRef = doc(collection(dbRef, 'families'))
  const familyId = familyRef.id

  await setDoc(familyRef, {
    id: familyId,
    parentName: parentName.trim(),
    parentPhone: parentPhone.trim(),
    parentWhatsApp: (parentWhatsApp || parentPhone).trim(),
    alternatePhone: (alternatePhone || '').trim(),
    studentIds: [studentId],
    combinedAgreedFee: student.totalFee || 0,
    createdAt: todayISO(),
    updatedAt: todayISO(),
  })

  await updateDoc(studentRef, {
    parentId: familyId,
    parentName: parentName.trim(),
    parentPhone: parentPhone.trim(),
  })

  return familyId
}

export async function unlinkStudentFromFamily(studentId: string) {
  const dbRef = db()
  const studentRef = doc(dbRef, 'students', studentId)
  const studentSnap = await getDoc(studentRef)
  if (!studentSnap.exists()) return

  const student = studentSnap.data()
  const oldParentId = student.parentId

  await updateDoc(studentRef, {
    parentId: null,
  })

    if (oldParentId) {
      await cleanOldFamilyLink(studentId, oldParentId)
    }
  }

  export function subscribeCashTransactions(onData: (transactions: CashTransaction[]) => void): Unsubscribe {
    const dbRef = db()
    const q = query(collection(dbRef, 'cashTransactions'), orderBy('createdAt', 'desc'))
    return onSnapshot(q, (snapshot) => {
      const results: CashTransaction[] = []
      snapshot.forEach((docSnap) => {
        results.push(docSnap.data() as CashTransaction)
      })
      onData(results)
    })
  }

  export async function createCashTransaction(input: Omit<CashTransaction, 'id' | 'createdAt'>) {
    const dbRef = db()
    const docRef = doc(collection(dbRef, 'cashTransactions'))
    const docId = docRef.id

    const now = new Date()
    const newTx: CashTransaction = {
      ...input,
      id: docId,
      createdAt: now.toISOString(),
    }

    await setDoc(docRef, newTx)
    return docId
  }

  export async function updateCashTransaction(id: string, updates: Partial<CashTransaction>) {
    const dbRef = db()
    const docRef = doc(dbRef, 'cashTransactions', id)
    await updateDoc(docRef, updates)
  }

  export async function deleteCashTransaction(id: string) {
    const dbRef = db()
    const docRef = doc(dbRef, 'cashTransactions', id)
    await deleteDoc(docRef)
  }

// --------------------------------------------------------------------------------------
// TEACHING RECORDS (Academics Tracker)
// --------------------------------------------------------------------------------------

export function subscribeTeachingRecords(
  classId: number,
  onChange: (records: TeachingRecord[]) => void,
  onError?: (error: unknown) => void
) {
  const coll = collection(db(), 'teaching_records')
  const q = query(coll, where('classId', '==', classId))
  return onSnapshot(
    q,
    (snapshot) => {
      const records: TeachingRecord[] = []
      snapshot.forEach((docSnap) => {
        records.push({ id: docSnap.id, ...docSnap.data() } as TeachingRecord)
      })
      records.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime() || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      onChange(records)
    },
    onError
  )
}

export async function addTeachingRecord(input: Omit<TeachingRecord, 'id' | 'createdAt' | 'updatedAt'>) {
  const coll = collection(db(), 'teaching_records')
  const newRef = doc(coll)
  const payload: TeachingRecord = {
    ...input,
    id: newRef.id,
    createdAt: todayISO(),
    updatedAt: todayISO(),
  }
  await setDoc(newRef, stripUndefinedDeep(payload))
  return payload
}

export async function updateTeachingRecord(id: string, updates: Partial<Omit<TeachingRecord, 'id' | 'createdAt' | 'updatedAt'>>) {
  const ref = doc(db(), 'teaching_records', id)
  await updateDoc(ref, {
    ...stripUndefinedDeep(updates),
    updatedAt: todayISO(),
  })
}

export async function deleteTeachingRecord(id: string, pin: string) {
  if (pin !== '2006') {
    throw new Error('Invalid PIN. Deletion blocked.')
  }
  const ref = doc(db(), 'teaching_records', id)
  await deleteDoc(ref)
}

// --------------------------------------------------------------------------------------
// TEACHER PROFILES
// --------------------------------------------------------------------------------------

export function subscribeTeachers(
  onChange: (teachers: TeacherProfile[]) => void,
  onError?: (error: unknown) => void
) {
  const coll = collection(db(), 'teachers')
  return onSnapshot(
    coll,
    (snapshot) => {
      const records: TeacherProfile[] = []
      snapshot.forEach((docSnap) => {
        records.push({ id: docSnap.id, ...docSnap.data() } as TeacherProfile)
      })
      records.sort((a, b) => a.displayName.localeCompare(b.displayName))
      onChange(records)
    },
    onError
  )
}

export async function addTeacherProfile(input: Omit<TeacherProfile, 'id' | 'createdAt' | 'updatedAt'>) {
  const coll = collection(db(), 'teachers')
  const newRef = doc(coll)
  const payload: TeacherProfile = {
    ...input,
    id: newRef.id,
    createdAt: todayISO(),
    updatedAt: todayISO(),
  }
  await setDoc(newRef, stripUndefinedDeep(payload))
  return payload
}

export async function updateTeacherProfile(id: string, updates: Partial<Omit<TeacherProfile, 'id' | 'createdAt' | 'updatedAt'>>) {
  const ref = doc(db(), 'teachers', id)
  await updateDoc(ref, {
    ...stripUndefinedDeep(updates),
    updatedAt: todayISO(),
  })
}

export async function writeStudentHistory(params: {
  studentId: string
  studentName: string
  eventType: string
  prevValue?: string
  newValue?: string
  remarks?: string
  source?: string
  paymentId?: string
  adminUser?: string
}) {
  const refDoc = doc(collection(db(), 'student_history'))
  const now = new Date()
  const date = todayISO(now)
  const time = now.toTimeString().slice(0, 8)
  
  await setDoc(refDoc, {
    id: refDoc.id,
    studentId: params.studentId,
    studentName: params.studentName,
    eventType: params.eventType,
    prevValue: params.prevValue || '',
    newValue: params.newValue || '',
    remarks: params.remarks || '',
    source: params.source || 'Manual Edit',
    paymentId: params.paymentId || '',
    adminUser: params.adminUser || 'Owner',
    date,
    time,
    timestamp: now.toISOString(),
  })
}

export function subscribeStudentHistory(
  studentId: string,
  onChange: (history: any[]) => void,
  onError?: (error: unknown) => void,
) {
  const q = query(
    collection(db(), 'student_history'),
    where('studentId', '==', studentId),
    orderBy('timestamp', 'asc')
  )
  return onSnapshot(
    q,
    (snapshot) => {
      const records: any[] = []
      snapshot.forEach((docSnap) => {
        records.push({ id: docSnap.id, ...docSnap.data() })
      })
      onChange(records)
    },
    onError
  )
}

export async function writeTransaction(id: string, transactionData: any) {
  const ref = doc(db(), 'transactions', id)
  await setDoc(ref, {
    id,
    ...transactionData,
    updatedAt: new Date().toISOString(),
  }, { merge: true })
}

export function subscribeTransactions(
  onChange: (transactions: any[]) => void,
  onError?: (error: unknown) => void,
) {
  const q = query(
    collection(db(), 'transactions'),
    orderBy('createdAt', 'desc')
  )
  return onSnapshot(
    q,
    (snapshot) => {
      const records: any[] = []
      snapshot.forEach((docSnap) => {
        records.push({ id: docSnap.id, ...docSnap.data() })
      })
      onChange(records)
    },
    onError
  )
}
