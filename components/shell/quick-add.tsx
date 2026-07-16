'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, CreditCard, GraduationCap, Plus, Wallet, X } from 'lucide-react'
import { useAppData } from '@/components/state/app-data-provider'
import { useQuickAdd } from './quick-add-context'
import { useToast } from '@/components/ui/toast'
import {
  DEFAULT_BATCHES,
  EXPENSE_CATEGORIES,
  addMonths,
  PAYMENT_MODES,
  deriveClassFee,
  todayISO,
  splitEvenly,
  type ExpenseCategory,
  type PaymentMode,
  type PaymentType,
  type RecordStatus,
  type StudentFeePlan,
} from '@/lib/domain'
import { cn } from '@/lib/utils'

type Tab = 'student' | 'fee' | 'expense'

const tabs: { id: Tab; label: string; icon: typeof Plus }[] = [
  { id: 'student', label: 'Student', icon: GraduationCap },
  { id: 'fee', label: 'Fee', icon: CreditCard },
  { id: 'expense', label: 'Expense', icon: Wallet },
]

function Field({
  label,
  required,
  children,
}: {
  label: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <label className="block">
      <span className="micro-label mb-1.5 block">
        {label}
        {required ? <span className="ml-1 text-destructive">*</span> : null}
      </span>
      {children}
    </label>
  )
}

const inputCls =
  'h-11 w-full rounded-xl border border-border bg-muted/50 px-3.5 text-sm outline-none transition-all placeholder:text-muted-foreground focus:border-ring focus:bg-card focus:shadow-[0_0_0_4px_oklch(0.55_0.16_255/0.08)]'

type InstallmentDraft = {
  amount: string
  dueDate: string
}

type StudentAdmissionFormState = {
  name: string
  class: number
  batch: string
  parentPhone: string
  paymentType: PaymentType
  totalFee: string
  status: RecordStatus
  notes: string
  amountPaidNow: string
  installmentCount: number
  installments: InstallmentDraft[]
  monthlyFeeAmount: string
  monthlyStartDate: string
  parentName: string
  studentPhone: string
  whatsapp: string
  address: string
  promiseToPayDate: string
}

type StudentFieldErrors = Partial<Record<'name' | 'batch' | 'parentPhone' | 'totalFee' | 'amountPaidNow' | 'monthlyFeeAmount' | 'monthlyStartDate' | 'installments', string>>

function createInstallmentDrafts(totalFee: number, count: number, startDate = todayISO()): InstallmentDraft[] {
  return splitEvenly(Math.max(totalFee, 0), Math.max(count, 1)).map((amount, index) => ({
    amount: String(amount),
    dueDate: addMonths(startDate, index),
  }))
}

function createStudentForm(classNumber = 8, paymentType: PaymentType = 'Monthly'): StudentAdmissionFormState {
  const standardFee = deriveClassFee(classNumber)
  return {
    name: '',
    class: classNumber,
    batch: 'Morning A',
    parentPhone: '',
    paymentType,
    totalFee: String(standardFee),
    status: 'active',
    notes: '',
    amountPaidNow: paymentType === 'Full Payment' ? String(standardFee) : '',
    installmentCount: 3,
    installments: createInstallmentDrafts(standardFee, 3),
    monthlyFeeAmount: String(Math.max(Math.round(standardFee / 12), 1)),
    monthlyStartDate: todayISO(),
    parentName: '',
    studentPhone: '',
    whatsapp: '',
    address: '',
    promiseToPayDate: '',
  }
}

const defaultFeeForm = {
  studentId: '',
  studentQuery: '',
  amount: '',
  date: new Date().toISOString().slice(0, 10),
  paymentMode: 'Cash' as PaymentMode,
  label: 'Monthly Fees',
  notes: '',
  receiptNumber: '',
}

const defaultExpenseForm = {
  category: 'Rent' as const,
  amount: '',
  date: new Date().toISOString().slice(0, 10),
  note: '',
  type: 'one-time' as 'one-time' | 'recurring',
  duration: '12',
  customDuration: '',
  startMonth: String(new Date().getMonth() + 1),
  startYear: String(new Date().getFullYear()),
}

type FeeFormState = typeof defaultFeeForm
type ExpenseFormState = {
  category: ExpenseCategory
  amount: string
  date: string
  note: string
  type: 'one-time' | 'recurring'
  duration: string
  customDuration: string
  startMonth: string
  startYear: string
}

export function QuickAdd() {
  const { open, target, closeQuickAdd } = useQuickAdd()
  const {
    students,
    expenses,
    addStudent,
    editStudent,
    addPayment,
    addExpense,
    editExpense,
  } = useAppData()
  const { toast } = useToast()
  const [tab, setTab] = useState<Tab>('fee')
  const [saved, setSaved] = useState(false)
  const [studentForm, setStudentForm] = useState<StudentAdmissionFormState>(createStudentForm())
  const [studentId, setStudentId] = useState<string | null>(null)
  const [studentQuery, setStudentQuery] = useState('')
  const [studentFieldErrors, setStudentFieldErrors] = useState<StudentFieldErrors>({})
  const [feeForm, setFeeForm] = useState<FeeFormState>(defaultFeeForm)
  const [expenseForm, setExpenseForm] = useState<ExpenseFormState>(defaultExpenseForm)
  const [expenseId, setExpenseId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const hydratedTargetRef = useRef<string | null>(null)
  const feeTouchedRef = useRef(false)
  const [gateOpen, setGateOpen] = useState(false)
  const [gatePassword, setGatePassword] = useState('')
  const [gateError, setGateError] = useState('')
  const [gateVerified, setGateVerified] = useState(false)

  const targetKey = open
    ? `${target.tab}:${target.studentId ?? ''}:${target.expenseId ?? ''}`
    : null

  useEffect(() => {
    if (!open || !targetKey) {
      hydratedTargetRef.current = null
      feeTouchedRef.current = false
      setGateVerified(false)
      return
    }

    if (hydratedTargetRef.current === targetKey) {
      return
    }

    const matchedStudent = target.studentId
      ? students.find((student) => student.id === target.studentId)
      : null
    const matchedExpense = target.expenseId
      ? expenses.find((expense) => expense.id === target.expenseId)
      : null

    if (target.tab === 'student') {
      if (target.studentId && !matchedStudent) {
        return
      }
      setTab('student')
      setSaved(false)
      setBusy(false)
      setStudentFieldErrors({})
      setStudentId(matchedStudent?.id ?? null)
      setStudentForm(
        matchedStudent
          ? {
              name: matchedStudent.name,
              class: matchedStudent.class,
              batch: matchedStudent.batch,
              parentPhone: matchedStudent.parentPhone,
              paymentType: matchedStudent.paymentType,
              totalFee: String(matchedStudent.totalFee),
              status: matchedStudent.status,
              notes: matchedStudent.notes,
              amountPaidNow: String(matchedStudent.paid),
              installmentCount: matchedStudent.feePlan?.installments?.length ?? 3,
              installments: matchedStudent.feePlan?.installments?.length
                ? matchedStudent.feePlan.installments.map((installment) => ({
                    amount: String(installment.amount),
                    dueDate: installment.dueDate,
                  }))
                : createInstallmentDrafts(matchedStudent.totalFee, 3, matchedStudent.joined),
              monthlyFeeAmount: String(matchedStudent.feePlan?.monthlyFeeAmount ?? Math.max(Math.round(matchedStudent.totalFee / 12), 1)),
              monthlyStartDate: matchedStudent.feePlan?.startDate ?? matchedStudent.joined,
              parentName: matchedStudent.parentName ?? '',
              studentPhone: matchedStudent.studentPhone ?? '',
              whatsapp: matchedStudent.whatsapp ?? '',
              address: matchedStudent.address ?? '',
              promiseToPayDate: matchedStudent.promiseToPayDate ?? '',
            }
          : createStudentForm(),
      )
      feeTouchedRef.current = !!matchedStudent
      hydratedTargetRef.current = targetKey
      setGateVerified(false)
      return
    }

    if (target.tab === 'fee') {
      if (target.studentId && !matchedStudent) {
        return
      }
      setTab('fee')
      setSaved(false)
      setBusy(false)
      setFeeForm({
        ...defaultFeeForm,
        studentId: matchedStudent?.id ?? '',
        studentQuery: matchedStudent?.name ?? '',
        label: matchedStudent
          ? `${matchedStudent.paymentType} - ${new Date().toLocaleDateString('en-IN', { month: 'long' })}`
          : 'Monthly Fees',
      })
      hydratedTargetRef.current = targetKey
      return
    }

    if (target.tab === 'expense') {
      if (target.expenseId && !matchedExpense) {
        return
      }
      setTab('expense')
      setSaved(false)
      setBusy(false)
      setExpenseId(matchedExpense?.id ?? null)
      setExpenseForm(
        matchedExpense
          ? {
              category: matchedExpense.category,
              amount: String(matchedExpense.amount),
              date: matchedExpense.date,
              note: matchedExpense.note,
              type: matchedExpense.isRecurring ? 'recurring' : 'one-time',
              duration: String(matchedExpense.durationMonths || '12'),
              customDuration: '',
              startMonth: String(matchedExpense.startMonth || (new Date(matchedExpense.date).getMonth() + 1)),
              startYear: String(matchedExpense.startYear || new Date(matchedExpense.date).getFullYear()),
            }
          : defaultExpenseForm,
      )
      hydratedTargetRef.current = targetKey
    }
  }, [open, targetKey, target.tab, target.studentId, target.expenseId, students, expenses])

  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden'
      const onKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') closeQuickAdd()
      }
      window.addEventListener('keydown', onKeyDown)
      return () => {
        document.body.style.overflow = ''
        window.removeEventListener('keydown', onKeyDown)
      }
    }
  }, [closeQuickAdd, open])

  const matchingStudents = useMemo(() => {
    const q = feeForm.studentQuery.trim().toLowerCase()
    if (!q) return students.slice(0, 100)
    return students
      .filter((student) =>
        [student.name, student.batch, student.parentPhone, String(student.class), student.paymentType]
          .join(' ')
          .toLowerCase()
          .includes(q),
      )
      .slice(0, 100)
  }, [feeForm.studentQuery, students])

  const splitInstallmentTotal = useMemo(
    () => studentForm.installments.reduce((sum, item) => sum + Number(item.amount || 0), 0),
    [studentForm.installments],
  )

  const monthlyPreview = useMemo(() => {
    const totalFee = Number(studentForm.totalFee || 0)
    const monthlyFee = Number(studentForm.monthlyFeeAmount || 0)
    if (studentForm.paymentType !== 'Monthly' || !Number.isFinite(totalFee) || !Number.isFinite(monthlyFee) || monthlyFee <= 0) {
      return []
    }
    const startDate = studentForm.monthlyStartDate || todayISO()
    const schedule: Array<{ amount: number; dueDate: string }> = []
    let remaining = totalFee
    let index = 0
    while (remaining > 0) {
      const amount = Math.min(monthlyFee, remaining)
      schedule.push({ amount, dueDate: addMonths(startDate, index) })
      remaining -= amount
      index += 1
    }
    return schedule
  }, [studentForm.monthlyFeeAmount, studentForm.monthlyStartDate, studentForm.paymentType, studentForm.totalFee])

  function syncStudentPlan(nextClass: number, nextPaymentType = studentForm.paymentType) {
    const standardFee = deriveClassFee(nextClass)
    const nextStartDate = studentForm.monthlyStartDate || todayISO()
    setStudentForm((current) => {
      const currentTotalFee = Number(current.totalFee || standardFee)
      const autoTotalFee = !feeTouchedRef.current ? String(standardFee) : current.totalFee
      const nextTotalFee = autoTotalFee || String(standardFee)
      const nextMonthlyAmount = !feeTouchedRef.current
        ? String(Math.max(Math.round(standardFee / 12), 1))
        : current.monthlyFeeAmount
      const nextInstallments = nextPaymentType === 'Split'
        ? createInstallmentDrafts(Number(nextTotalFee || currentTotalFee || standardFee), current.installmentCount || 3, nextStartDate)
        : current.installments
      return {
        ...current,
        class: nextClass,
        paymentType: nextPaymentType,
        totalFee: nextTotalFee,
        amountPaidNow: nextPaymentType === 'Full Payment'
          ? (!feeTouchedRef.current ? nextTotalFee : current.amountPaidNow)
          : '',
        installmentCount: nextPaymentType === 'Split' ? current.installmentCount || 3 : current.installmentCount,
        installments: nextInstallments,
        monthlyFeeAmount: nextPaymentType === 'Monthly'
          ? nextMonthlyAmount
          : current.monthlyFeeAmount,
        monthlyStartDate: nextPaymentType === 'Monthly'
          ? nextStartDate
          : current.monthlyStartDate,
      }
    })
  }

  function handleGateConfirm() {
    if (gatePassword.trim() === '2006') {
      setGateVerified(true)
      setGateOpen(false)
      setTimeout(() => {
        void handleSave()
      }, 50)
    } else {
      setGateError('Incorrect password.')
    }
  }

  async function handleSave() {
    setBusy(true)
    try {
      const isEdit = (tab === 'student' && studentId) || (tab === 'expense' && expenseId)
      if (isEdit && !gateVerified) {
        setGatePassword('')
        setGateError('')
        setGateOpen(true)
        setBusy(false)
        return
      }

      if (tab === 'student') {
        setStudentFieldErrors({})
        const existingStudent = studentId
          ? students.find((entry) => entry.id === studentId) ?? null
          : null
        const totalFee = Number(studentForm.totalFee)
        const amountPaidNow = Number(studentForm.amountPaidNow || 0)
        const monthlyFeeAmount = Number(studentForm.monthlyFeeAmount || 0)
        const installmentRows = studentForm.installments
          .map((item) => ({
            amount: Number(item.amount || 0),
            dueDate: item.dueDate,
          }))
          .filter((item) => item.amount > 0 && !!item.dueDate)
        const installmentTotal = installmentRows.reduce((sum, item) => sum + item.amount, 0)

        const nextFieldErrors: StudentFieldErrors = {}
        if (!studentForm.name.trim()) nextFieldErrors.name = 'Student name is required.'
        if (!studentForm.batch) nextFieldErrors.batch = 'Batch is required.'
        if (!Number.isFinite(totalFee) || totalFee <= 0) nextFieldErrors.totalFee = 'Enter a valid agreed total fee.'
        if (studentForm.paymentType === 'Full Payment') {
          if (!Number.isFinite(amountPaidNow) || amountPaidNow <= 0) nextFieldErrors.amountPaidNow = 'Enter amount paid right now.'
          if (Number.isFinite(totalFee) && totalFee > 0 && amountPaidNow !== totalFee) {
            nextFieldErrors.amountPaidNow = 'For full payment, amount paid must match agreed total fee.'
          }
        }
        if (studentForm.paymentType === 'Monthly') {
          if (!Number.isFinite(monthlyFeeAmount) || monthlyFeeAmount <= 0) nextFieldErrors.monthlyFeeAmount = 'Enter a valid monthly fee amount.'
          if (!studentForm.monthlyStartDate) nextFieldErrors.monthlyStartDate = 'Choose a monthly start date.'
        }
        if (studentForm.paymentType === 'Split') {
          if (installmentRows.length === 0) nextFieldErrors.installments = 'Add at least one installment row.'
          if (installmentRows.length > 0 && installmentTotal !== totalFee) nextFieldErrors.installments = 'Installments must add up to the agreed total fee.'
        }
        if (Object.keys(nextFieldErrors).length > 0) {
          setStudentFieldErrors(nextFieldErrors)
          throw new Error(nextFieldErrors.name ?? nextFieldErrors.batch ?? nextFieldErrors.totalFee ?? nextFieldErrors.amountPaidNow ?? nextFieldErrors.monthlyFeeAmount ?? nextFieldErrors.monthlyStartDate ?? nextFieldErrors.installments ?? 'Please check the student form.')
        }

        let feePlan: StudentFeePlan
        if (studentForm.paymentType === 'Full Payment') {
          feePlan = {
            type: 'Full Payment',
            agreedTotalFee: totalFee,
            amountPaidNow: amountPaidNow,
            startDate: studentForm.monthlyStartDate,
          }
        } else if (studentForm.paymentType === 'Split') {
          feePlan = {
            type: 'Split',
            agreedTotalFee: totalFee,
            installments: installmentRows,
          }
        } else {
          feePlan = {
            type: 'Monthly',
            agreedTotalFee: totalFee,
            monthlyFeeAmount,
            startDate: studentForm.monthlyStartDate,
          }
        }

        const studentPayload = {
          name: studentForm.name.trim(),
          class: studentForm.class,
          batch: studentForm.batch,
          parentPhone: studentForm.parentPhone.trim(),
          paymentType: studentForm.paymentType,
          totalFee,
          status: studentForm.status,
          notes: studentForm.notes.trim(),
          feePlan,
          parentName: studentForm.parentName.trim(),
          studentPhone: studentForm.studentPhone.trim(),
          whatsapp: studentForm.whatsapp.trim(),
          address: studentForm.address.trim(),
          promiseToPayDate: studentForm.promiseToPayDate,
        }

        if (studentId) {
          await editStudent(studentId, studentPayload)
          toast({ title: 'Student updated', description: `${studentForm.name} was saved successfully.`, tone: 'success' })
        } else {
          await addStudent(studentPayload)
          toast({ title: 'Student added', description: `${studentForm.name} was created in Firestore.`, tone: 'success' })
        }
      }

      if (tab === 'fee') {
        const student = students.find((entry) => entry.id === feeForm.studentId)
          ?? students.find((entry) => entry.name.toLowerCase() === feeForm.studentQuery.trim().toLowerCase())
        if (!student) {
          throw new Error('Please pick a valid student before saving the fee.')
        }
        const amount = Number(feeForm.amount)
        if (!Number.isFinite(amount) || amount <= 0) {
          throw new Error('Please enter a valid payment amount.')
        }
        if (!feeForm.date) {
          throw new Error('Please choose a payment date.')
        }
        await addPayment({
          studentId: student.id,
          studentName: student.name,
          amount,
          date: feeForm.date,
          paymentMode: feeForm.paymentMode,
          notes: feeForm.notes,
          receiptNumber: feeForm.receiptNumber || undefined,
          label: feeForm.label || undefined,
        })
        toast({ title: 'Payment recorded', description: `${student.name} balance updated automatically.`, tone: 'success' })
      }

      if (tab === 'expense') {
        const amount = Number(expenseForm.amount)
        if (!Number.isFinite(amount) || amount <= 0) {
          throw new Error('Please enter a valid expense amount.')
        }
        if (!expenseForm.date) {
          throw new Error('Please choose an expense date.')
        }

        const isRec = expenseForm.type === 'recurring'
        const dur = expenseForm.duration === 'custom' 
          ? Number(expenseForm.customDuration) 
          : Number(expenseForm.duration)

        if (isRec && (!dur || dur <= 0 || !Number.isInteger(dur))) {
          throw new Error('Please enter a valid duration in months.')
        }

        const payload: any = {
          category: expenseForm.category,
          amount,
          date: expenseForm.date,
          note: expenseForm.note,
          isRecurring: isRec,
          durationMonths: isRec ? dur : undefined,
          startMonth: isRec ? Number(expenseForm.startMonth) : undefined,
          startYear: isRec ? Number(expenseForm.startYear) : undefined,
        }

        if (expenseId) {
          await editExpense(expenseId, payload)
          toast({ title: 'Expense updated', description: 'The record was saved in Firestore.', tone: 'success' })
        } else {
          await addExpense(payload)
          toast({ title: 'Expense added', description: 'The expense was created in Firestore.', tone: 'success' })
        }
      }

      setSaved(true)
      window.setTimeout(() => {
        setSaved(false)
        closeQuickAdd()
      }, 900)
      } catch (err) {
      toast({
        title: 'Could not save',
        description: err instanceof Error ? err.message : 'Please check the form and try again.',
        tone: 'error',
      })
    } finally {
      setBusy(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        aria-label="Close panel"
        onClick={closeQuickAdd}
        className="absolute inset-0 bg-foreground/20 backdrop-blur-[2px]"
      />
      {gateOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-foreground/45 px-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-3xl border border-border bg-card p-6 shadow-2xl animate-fade-up">
            <h3 className="text-base font-semibold tracking-tight">Security Verification</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Please enter the password to authorize this edit.
            </p>
            <input
              type="password"
              value={gatePassword}
              onChange={(e) => setGatePassword(e.target.value)}
              placeholder="Enter password"
              className="mt-4 h-11 w-full rounded-xl border border-border bg-muted/50 px-3 text-sm outline-none focus:border-ring"
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleGateConfirm()
              }}
            />
            {gateError && <p className="mt-2 text-xs text-destructive">{gateError}</p>}
            <div className="mt-5 flex gap-2.5">
              <button
                type="button"
                onClick={() => {
                  setGateOpen(false)
                  setBusy(false)
                }}
                className="flex-1 h-10 rounded-xl border border-border text-xs font-semibold hover:bg-muted"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleGateConfirm}
                className="flex-1 h-10 rounded-xl bg-primary text-xs font-semibold text-primary-foreground hover:opacity-90"
              >
                Verify
              </button>
            </div>
          </div>
        </div>
      )}
      <aside className="absolute bottom-0 right-0 top-0 flex w-full max-w-sm flex-col bg-card shadow-[-16px_0_60px_rgb(0,0,0,0.12)] animate-slide-in-right">
        <div className="flex items-center justify-between border-b border-border px-6 py-5">
          <div>
            <h2 className="text-base font-semibold tracking-tight">
              Quick Add
            </h2>
            <p className="text-xs text-muted-foreground">
              Add without leaving this page
            </p>
          </div>
          <button
            type="button"
            onClick={closeQuickAdd}
            aria-label="Close"
            className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex gap-1 border-b border-border px-6 py-3">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={cn(
                'flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[13px] font-medium transition-all',
                tab === id
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
              )}
            >
              <Icon className="h-3.5 w-3.5" strokeWidth={1.75} />
              {label}
            </button>
          ))}
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-6">
          {tab === 'student' && (
            <>
              <Field label="Student name" required>
                <input
                  className={inputCls}
                  value={studentForm.name}
                  onChange={(e) => {
                    setStudentFieldErrors((current) => ({ ...current, name: undefined }))
                    setStudentForm((current) => ({ ...current, name: e.target.value }))
                  }}
                  placeholder="e.g. Riya Sharma"
                />
                {studentFieldErrors.name && <p className="mt-1 text-xs text-destructive">{studentFieldErrors.name}</p>}
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Class">
                  <select
                    className={inputCls}
                    value={studentForm.class}
                    onChange={(e) => syncStudentPlan(Number(e.target.value))}
                  >
                    {Array.from({ length: 10 }, (_, index) => (
                      <option key={index} value={index + 1}>
                        Class {index + 1}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Batch" required>
                  <select
                    className={inputCls}
                    value={studentForm.batch}
                    onChange={(e) => {
                      setStudentFieldErrors((current) => ({ ...current, batch: undefined }))
                      setStudentForm((current) => ({ ...current, batch: e.target.value }))
                    }}
                  >
                    {DEFAULT_BATCHES.map((batch) => (
                      <option key={batch}>{batch}</option>
                    ))}
                  </select>
                  {studentFieldErrors.batch && <p className="mt-1 text-xs text-destructive">{studentFieldErrors.batch}</p>}
                </Field>
              </div>
              {!!studentId && (
                <>
                  <Field label="Parent phone">
                    <input
                      className={inputCls}
                      value={studentForm.parentPhone}
                      onChange={(e) => {
                        setStudentFieldErrors((current) => ({ ...current, parentPhone: undefined }))
                        setStudentForm((current) => ({ ...current, parentPhone: e.target.value }))
                      }}
                      placeholder="98765 43210"
                      inputMode="tel"
                    />
                    {studentFieldErrors.parentPhone && <p className="mt-1 text-xs text-destructive">{studentFieldErrors.parentPhone}</p>}
                  </Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Parent Name">
                      <input
                        className={inputCls}
                        value={studentForm.parentName}
                        onChange={(e) => setStudentForm((current) => ({ ...current, parentName: e.target.value }))}
                        placeholder="e.g. Anil Sharma"
                      />
                    </Field>
                    <Field label="Student Phone">
                      <input
                        className={inputCls}
                        value={studentForm.studentPhone}
                        onChange={(e) => setStudentForm((current) => ({ ...current, studentPhone: e.target.value }))}
                        placeholder="e.g. 98765 11111"
                        inputMode="tel"
                      />
                    </Field>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="WhatsApp Number">
                      <input
                        className={inputCls}
                        value={studentForm.whatsapp}
                        onChange={(e) => setStudentForm((current) => ({ ...current, whatsapp: e.target.value }))}
                        placeholder="e.g. 98765 22222"
                        inputMode="tel"
                      />
                    </Field>
                    <Field label="Promise to Pay Date">
                      <input
                        className={inputCls}
                        type="date"
                        value={studentForm.promiseToPayDate}
                        onChange={(e) => setStudentForm((current) => ({ ...current, promiseToPayDate: e.target.value }))}
                      />
                    </Field>
                  </div>
                  <Field label="Address">
                    <input
                      className={inputCls}
                      value={studentForm.address}
                      onChange={(e) => setStudentForm((current) => ({ ...current, address: e.target.value }))}
                      placeholder="e.g. 123 Street, City"
                    />
                  </Field>
                </>
              )}
              <Field label="Agreed total fee" required>
                <input
                  className={inputCls}
                  value={studentForm.totalFee}
                  onChange={(e) => {
                    setStudentFieldErrors((current) => ({ ...current, totalFee: undefined }))
                    feeTouchedRef.current = true
                    setStudentForm((current) => ({ ...current, totalFee: e.target.value }))
                  }}
                  placeholder="e.g. 6000"
                  inputMode="numeric"
                />
                {studentFieldErrors.totalFee && <p className="mt-1 text-xs text-destructive">{studentFieldErrors.totalFee}</p>}
              </Field>
              <Field label="Payment type" required>
                <select
                  className={inputCls}
                  value={studentForm.paymentType}
                  onChange={(e) =>
                    syncStudentPlan(studentForm.class, e.target.value as PaymentType)
                  }
                >
                  <option>Monthly</option>
                  <option>Full Payment</option>
                  <option>Split</option>
                </select>
              </Field>
              {studentForm.paymentType === 'Full Payment' && (
                <Field label="Amount Paid Right Now" required>
                  <input
                    className={inputCls}
                    value={studentForm.amountPaidNow}
                    onChange={(e) => {
                      setStudentFieldErrors((current) => ({ ...current, amountPaidNow: undefined }))
                      setStudentForm((current) => ({
                        ...current,
                        amountPaidNow: e.target.value,
                      }))
                    }}
                    placeholder="e.g. 6000"
                    inputMode="numeric"
                  />
                  {studentFieldErrors.amountPaidNow && <p className="mt-1 text-xs text-destructive">{studentFieldErrors.amountPaidNow}</p>}
                </Field>
              )}
              {studentForm.paymentType === 'Split' && (
                <div className="space-y-3 rounded-2xl border border-border bg-muted/25 p-4">
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Number of installments">
                      <input
                        className={inputCls}
                        type="number"
                        min={1}
                        max={12}
                        value={studentForm.installmentCount}
                        onChange={(e) => {
                          const nextCount = Math.max(1, Number(e.target.value) || 1)
                          setStudentForm((current) => ({
                            ...current,
                            installmentCount: nextCount,
                            installments: createInstallmentDrafts(
                              Number(current.totalFee || 0),
                              nextCount,
                              current.monthlyStartDate || todayISO(),
                            ),
                          }))
                        }}
                      />
                    </Field>
                    <Field label="Installment total">
                      <input className={inputCls} value={String(splitInstallmentTotal)} readOnly />
                    </Field>
                  </div>
                  <div className="space-y-3">
                    {studentForm.installments.map((row, index) => (
                      <div key={`${index}-${row.dueDate}`} className="grid grid-cols-2 gap-3">
                        <Field label={`Installment ${index + 1} Amount`}>
                          <input
                            className={inputCls}
                            value={row.amount}
                            onChange={(e) =>
                              setStudentForm((current) => ({
                                ...current,
                                installments: current.installments.map((item, itemIndex) =>
                                  itemIndex === index ? { ...item, amount: e.target.value } : item,
                                ),
                              }))
                            }
                            placeholder="e.g. 2000"
                            inputMode="numeric"
                          />
                        </Field>
                        <Field label={`Installment ${index + 1} Due Date`}>
                          <input
                            className={inputCls}
                            type="date"
                            value={row.dueDate}
                            onChange={(e) =>
                              setStudentForm((current) => ({
                                ...current,
                                installments: current.installments.map((item, itemIndex) =>
                                  itemIndex === index ? { ...item, dueDate: e.target.value } : item,
                                ),
                              }))
                            }
                          />
                        </Field>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {studentForm.paymentType === 'Monthly' && (
                <div className="space-y-3 rounded-2xl border border-border bg-muted/25 p-4">
                  <div className="grid grid-cols-2 gap-3">
                <Field label="Monthly fee amount" required>
                  <input
                    className={inputCls}
                    value={studentForm.monthlyFeeAmount}
                    onChange={(e) => {
                      setStudentFieldErrors((current) => ({ ...current, monthlyFeeAmount: undefined }))
                      setStudentForm((current) => ({
                        ...current,
                        monthlyFeeAmount: e.target.value,
                      }))
                    }}
                    placeholder="e.g. 500"
                    inputMode="numeric"
                  />
                  {studentFieldErrors.monthlyFeeAmount && <p className="mt-1 text-xs text-destructive">{studentFieldErrors.monthlyFeeAmount}</p>}
                </Field>
                <Field label="Start date" required>
                  <input
                    className={inputCls}
                    type="date"
                    value={studentForm.monthlyStartDate}
                    onChange={(e) => {
                      setStudentFieldErrors((current) => ({ ...current, monthlyStartDate: undefined }))
                      setStudentForm((current) => ({
                        ...current,
                        monthlyStartDate: e.target.value,
                      }))
                    }}
                  />
                  {studentFieldErrors.monthlyStartDate && <p className="mt-1 text-xs text-destructive">{studentFieldErrors.monthlyStartDate}</p>}
                </Field>
              </div>
              {studentFieldErrors.installments && <p className="text-sm text-destructive">{studentFieldErrors.installments}</p>}
              <div className="rounded-2xl bg-background/70 p-3">
                    <p className="micro-label mb-2">Auto schedule preview</p>
                    <div className="max-h-40 space-y-2 overflow-auto pr-1">
                      {monthlyPreview.map((item, index) => (
                        <div key={`${item.dueDate}-${index}`} className="flex items-center justify-between rounded-xl border border-border px-3 py-2 text-xs">
                          <span>Month {index + 1}</span>
                          <span className="tabular">{item.amount}</span>
                          <span>{item.dueDate}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
              <Field label="Status">
                <select
                  className={inputCls}
                  value={studentForm.status}
                  onChange={(e) =>
                    setStudentForm((current) => ({
                      ...current,
                      status: e.target.value as RecordStatus,
                    }))
                  }
                >
                  <option value="active">active</option>
                  <option value="inactive">inactive</option>
                </select>
              </Field>
              <Field label="Notes">
                <input
                  className={inputCls}
                  value={studentForm.notes}
                  onChange={(e) => setStudentForm((current) => ({ ...current, notes: e.target.value }))}
                  placeholder="Optional notes about the student"
                />
              </Field>
            </>
          )}

          {tab === 'fee' && (
            <>
              <Field label="Student">
                <input
                  className={inputCls}
                  value={feeForm.studentQuery}
                  onChange={(e) => {
                    const next = e.target.value
                    setFeeForm((current) => ({ ...current, studentQuery: next, studentId: '' }))
                  }}
                  onFocus={() => {
                    setFeeForm((current) => ({ ...current, studentId: '' }))
                  }}
                  onClick={() => {
                    setFeeForm((current) => ({ ...current, studentId: '' }))
                  }}
                  placeholder="Search student…"
                />
              </Field>
              {!feeForm.studentId && students.length > 0 && (
                <div className="rounded-2xl border border-border bg-popover p-1 shadow-[0_12px_30px_rgb(0,0,0,0.08)]">
                  {matchingStudents.length === 0 ? (
                    <p className="px-3 py-3 text-xs text-muted-foreground">No student found.</p>
                  ) : (
                    matchingStudents.map((student) => (
                      <button
                        key={student.id}
                        type="button"
                        onClick={() =>
                          setFeeForm((current) => ({
                            ...current,
                            studentId: student.id,
                            studentQuery: student.name,
                            label:
                              student.paymentType === 'Monthly'
                                ? `Monthly Fees - ${new Date().toLocaleDateString('en-IN', { month: 'long' })}`
                                : student.paymentType === 'Split'
                                  ? 'Split Payment'
                                  : 'Full Payment',
                          }))
                        }
                        className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm transition-colors hover:bg-accent"
                      >
                        <span>
                          <span className="block font-medium">{student.name}</span>
                          <span className="block text-xs text-muted-foreground">
                            Class {student.class} · {student.batch}
                          </span>
                        </span>
                        <span className="micro-label">{student.paymentType}</span>
                      </button>
                    ))
                  )}
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <Field label="Amount">
                  <input
                    className={inputCls}
                    value={feeForm.amount}
                    onChange={(e) => setFeeForm((current) => ({ ...current, amount: e.target.value }))}
                    placeholder="₹ 2,500"
                    inputMode="numeric"
                  />
                </Field>
                <Field label="Date">
                  <input
                    className={inputCls}
                    type="date"
                    value={feeForm.date}
                    onChange={(e) => setFeeForm((current) => ({ ...current, date: e.target.value }))}
                  />
                </Field>
              </div>
              <Field label="Payment mode">
                <select
                  className={inputCls}
                  value={feeForm.paymentMode}
                  onChange={(e) =>
                    setFeeForm((current) => ({
                      ...current,
                      paymentMode: e.target.value as PaymentMode,
                    }))
                  }
                >
                  {PAYMENT_MODES.map((mode) => (
                    <option key={mode}>{mode}</option>
                  ))}
                </select>
              </Field>
              <Field label="Payment for">
                <select
                  className={inputCls}
                  value={feeForm.label}
                  onChange={(e) => setFeeForm((current) => ({ ...current, label: e.target.value }))}
                >
                  <option>Monthly Fees</option>
                  <option>Split Payment</option>
                  <option>Full Payment</option>
                </select>
              </Field>
              <Field label="Receipt number">
                <input
                  className={inputCls}
                  value={feeForm.receiptNumber}
                  onChange={(e) => setFeeForm((current) => ({ ...current, receiptNumber: e.target.value }))}
                  placeholder="Auto-generated if blank"
                />
              </Field>
              <Field label="Note (optional)">
                <input
                  className={inputCls}
                  value={feeForm.notes}
                  onChange={(e) => setFeeForm((current) => ({ ...current, notes: e.target.value }))}
                  placeholder="Collected in cash"
                />
              </Field>
            </>
          )}

          {tab === 'expense' && (
            <>
              <Field label="Category">
                <select
                  className={inputCls}
                  value={expenseForm.category}
                  onChange={(e) =>
                    setExpenseForm((current) => ({
                      ...current,
                      category: e.target.value as (typeof EXPENSE_CATEGORIES)[number],
                    }))
                  }
                >
                  {EXPENSE_CATEGORIES.map((category) => (
                    <option key={category}>{category}</option>
                  ))}
                </select>
              </Field>
              <Field label="Expense Type">
                <select
                  className={inputCls}
                  value={expenseForm.type}
                  onChange={(e) =>
                    setExpenseForm((current) => ({
                      ...current,
                      type: e.target.value as 'one-time' | 'recurring',
                    }))
                  }
                >
                  <option value="one-time">One-Time Expense</option>
                  <option value="recurring">Recurring Expense</option>
                </select>
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label={expenseForm.type === 'recurring' ? 'Monthly Amount' : 'Amount'}>
                  <input
                    className={inputCls}
                    value={expenseForm.amount}
                    onChange={(e) => setExpenseForm((current) => ({ ...current, amount: e.target.value }))}
                    placeholder={expenseForm.type === 'recurring' ? '₹ 10,000' : '₹ 4,200'}
                    inputMode="numeric"
                  />
                </Field>
                {expenseForm.type === 'one-time' ? (
                  <Field label="Date">
                    <input
                      className={inputCls}
                      type="date"
                      value={expenseForm.date}
                      onChange={(e) => setExpenseForm((current) => ({ ...current, date: e.target.value }))}
                    />
                  </Field>
                ) : (
                  <Field label="Duration">
                    <select
                      className={inputCls}
                      value={expenseForm.duration}
                      onChange={(e) =>
                        setExpenseForm((current) => ({
                          ...current,
                          duration: e.target.value,
                        }))
                      }
                    >
                      <option value="1">1 Month</option>
                      <option value="2">2 Months</option>
                      <option value="3">3 Months</option>
                      <option value="6">6 Months</option>
                      <option value="12">12 Months</option>
                      <option value="custom">Custom</option>
                    </select>
                  </Field>
                )}
              </div>

              {expenseForm.type === 'recurring' && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Start Month">
                      <select
                        className={inputCls}
                        value={expenseForm.startMonth}
                        onChange={(e) =>
                          setExpenseForm((current) => ({
                            ...current,
                            startMonth: e.target.value,
                          }))
                        }
                      >
                        {[
                          'January', 'February', 'March', 'April', 'May', 'June',
                          'July', 'August', 'September', 'October', 'November', 'December'
                        ].map((m, idx) => (
                          <option key={m} value={String(idx + 1)}>
                            {m}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Start Year">
                      <input
                        className={inputCls}
                        type="number"
                        value={expenseForm.startYear}
                        onChange={(e) =>
                          setExpenseForm((current) => ({
                            ...current,
                            startYear: e.target.value,
                          }))
                        }
                      />
                    </Field>
                  </div>

                  {expenseForm.duration === 'custom' && (
                    <Field label="Custom Duration (Months)">
                      <input
                        className={inputCls}
                        type="number"
                        value={expenseForm.customDuration}
                        onChange={(e) =>
                          setExpenseForm((current) => ({
                            ...current,
                            customDuration: e.target.value,
                          }))
                        }
                        placeholder="e.g. 18"
                      />
                    </Field>
                  )}
                </>
              )}

              <Field label="Note (optional)">
                <input
                  className={inputCls}
                  value={expenseForm.note}
                  onChange={(e) => setExpenseForm((current) => ({ ...current, note: e.target.value }))}
                  placeholder={expenseForm.type === 'recurring' ? 'WiFi or Rent' : 'June electricity bill'}
                />
              </Field>
            </>
          )}
        </div>

        <div className="border-t border-border px-6 py-4">
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={busy}
            className={cn(
              'flex h-12 w-full items-center justify-center gap-2 rounded-xl text-sm font-semibold transition-all duration-300',
              saved
                ? 'bg-success text-success-foreground'
                : 'bg-primary text-primary-foreground hover:opacity-90',
              busy && 'opacity-70',
            )}
          >
            {saved ? (
              <>
                <Check className="h-4 w-4" /> Saved
              </>
            ) : busy ? (
              'Saving...'
            ) : (
              'Save'
            )}
          </button>
        </div>
      </aside>
    </div>
  )
}
