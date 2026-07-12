'use client'

import {
  Home,
  Zap,
  Wifi,
  Users,
  BookOpen,
  PenLine,
  MoreHorizontal,
  Paperclip,
  Plus,
  Megaphone,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { Card, PageHeader } from '@/components/ui-bits'
import { useAppData } from '@/components/state/app-data-provider'
import { useQuickAdd } from '@/components/shell/quick-add-context'
import { useToast } from '@/components/ui/toast'
import { EXPENSE_CATEGORIES, formatINR, type Expense } from '@/lib/domain'

const categoryIcon: Record<Expense['category'], typeof Home> = {
  Rent: Home,
  Electricity: Zap,
  Internet: Wifi,
  'Teacher Salary': Users,
  Books: BookOpen,
  Stationery: PenLine,
  Marketing: Megaphone,
  Miscellaneous: MoreHorizontal,
  Other: MoreHorizontal,
}

export default function ExpensesPage() {
  const { expenses, deleteExpense, editExpense, attachExpenseBill, loading } = useAppData()
  const { openQuickAdd } = useQuickAdd()
  const { toast } = useToast()
  const [categoryFilter, setCategoryFilter] = useState<'all' | Expense['category']>('all')
  const [query, setQuery] = useState('')
  const [menuOpen, setMenuOpen] = useState<string | null>(null)
  const [activeExpenseId, setActiveExpenseId] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  // Details Modal state
  const [detailExpense, setDetailExpense] = useState<Expense | null>(null)
  const [editPaidVal, setEditPaidVal] = useState('')

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(null)
      }
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  const filteredExpenses = useMemo(
    () =>
      expenses.filter((expense) => {
        const matchesCategory = categoryFilter === 'all' || expense.category === categoryFilter
        const matchesQuery =
          !query.trim() ||
          [expense.category, expense.note, String(expense.amount), expense.date]
            .join(' ')
            .toLowerCase()
            .includes(query.toLowerCase())
        return matchesCategory && matchesQuery
      }),
    [categoryFilter, expenses, query],
  )

  const total = filteredExpenses.reduce((sum, expense) => sum + expense.amount, 0)
  const byCategory = filteredExpenses.reduce<Record<string, number>>((acc, expense) => {
    acc[expense.category] = (acc[expense.category] ?? 0) + expense.amount
    return acc
  }, {})
  const topCategories = Object.entries(byCategory).sort((a, b) => b[1] - a[1])

  async function handleDelete(expense: Expense) {
    if (expense.isRecurring) {
      const password = window.prompt('Deleting a recurring expense will stop all future unpaid schedules. Enter owner password to confirm:')
      if (password === null) return
      if (password !== '2006') {
        toast({
          title: 'Permission Denied',
          description: 'Incorrect owner password.',
          tone: 'error',
        })
        return
      }
    } else {
      const confirmed = window.confirm(`Delete ${expense.category} expense?`)
      if (!confirmed) return
    }

    try {
      await deleteExpense(expense.id)
      toast({
        title: expense.isRecurring ? 'Recurring schedule stopped' : 'Expense deleted',
        description: expense.isRecurring 
          ? 'Future unpaid installments stopped. Paid history preserved.' 
          : `${expense.category} was removed.`,
        tone: 'success',
      })
    } catch (err) {
      toast({
        title: 'Delete failed',
        description: err instanceof Error ? err.message : 'Please try again.',
        tone: 'error',
      })
    }
  }

  const getSeriesDetails = (exp: Expense) => {
    if (!exp.isRecurring || !exp.recurringExpenseId) {
      return {
        type: 'One-Time',
        monthlyAmount: exp.amount,
        startDate: exp.date,
        endDate: exp.date,
        remainingMonths: 0,
        totalPlannedCost: exp.amount,
        paidAmount: exp.paidAmount || 0,
        remainingAmount: Math.max(exp.amount - (exp.paidAmount || 0), 0),
        status: exp.status || 'paid',
      }
    }

    const series = expenses.filter(e => e.recurringExpenseId === exp.recurringExpenseId)
    const totalPlanned = series.reduce((sum, e) => sum + e.amount, 0)
    const totalPaid = series.reduce((sum, e) => sum + (e.paidAmount || 0), 0)
    const remainingVal = series.reduce((sum, e) => sum + Math.max(e.amount - (e.paidAmount || 0), 0), 0)
    
    const todayISOStr = new Date().toISOString().slice(0, 10)
    const remainingM = series.filter(e => e.status !== 'paid' && e.date >= todayISOStr).length
    
    const startD = series.reduce((min, e) => e.date < min ? e.date : min, '9999-99-99')
    const endD = series.reduce((max, e) => e.date > max ? e.date : max, '0000-00-00')

    const allPaid = series.every(e => e.status === 'paid')
    const status = allPaid ? 'paid' : (totalPaid > 0 ? 'partial' : 'unpaid')

    return {
      type: 'Recurring',
      monthlyAmount: exp.amount,
      startDate: startD,
      endDate: endD,
      remainingMonths: remainingM,
      totalPlannedCost: totalPlanned,
      paidAmount: totalPaid,
      remainingAmount: remainingVal,
      status,
    }
  }

  async function handleSavePayment() {
    if (!detailExpense) return
    const paidVal = Number(editPaidVal)
    if (!Number.isFinite(paidVal) || paidVal < 0) {
      toast({
        title: 'Invalid amount',
        description: 'Please enter a valid paid amount.',
        tone: 'error',
      })
      return
    }

    try {
      await editExpense(detailExpense.id, {
        category: detailExpense.category,
        amount: detailExpense.amount,
        date: detailExpense.date,
        note: detailExpense.note,
        paidAmount: paidVal,
        status: paidVal >= detailExpense.amount ? 'paid' : 'unpaid',
      })
      toast({
        title: 'Payment updated',
        description: 'The installment payment status was saved successfully.',
        tone: 'success',
      })
      setDetailExpense(null)
    } catch (err) {
      toast({
        title: 'Update failed',
        description: err instanceof Error ? err.message : 'Please try again.',
        tone: 'error',
      })
    }
  }

  async function handleBillUpload(file: File) {
    if (!activeExpenseId) return
    try {
      await attachExpenseBill(activeExpenseId, file)
      toast({
        title: 'Bill uploaded',
        description: 'The receipt image was saved to Firebase Storage.',
        tone: 'success',
      })
    } catch (err) {
      toast({
        title: 'Upload failed',
        description: err instanceof Error ? err.message : 'Could not upload the bill.',
        tone: 'error',
      })
    } finally {
      setActiveExpenseId(null)
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="Expenses"
        title="Where is my money going?"
        sub={`${formatINR(total)} spent recently across ${topCategories.length} categories`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search expenses"
              className="h-10 w-44 rounded-full border border-border bg-muted/60 px-4 text-sm outline-none transition-all placeholder:text-muted-foreground focus:border-ring focus:bg-card focus:shadow-[0_0_0_4px_oklch(0.55_0.16_255/0.08)]"
            />
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value as typeof categoryFilter)}
              className="h-10 rounded-full border border-border bg-muted/60 px-3 text-sm outline-none transition-all focus:border-ring focus:bg-card"
            >
              <option value="all">All categories</option>
              {EXPENSE_CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => openQuickAdd({ tab: 'expense' })}
              className="flex h-10 items-center gap-1.5 rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
            >
              <Plus className="h-4 w-4" />
              Add Expense
            </button>
          </div>
        }
      />

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="p-6 animate-fade-up [animation-delay:60ms]">
          <p className="micro-label mb-1">Breakdown</p>
          <h2 className="mb-6 text-base font-semibold tracking-tight">
            By category
          </h2>
          <ul className="flex flex-col gap-4">
            {topCategories.map(([category, amount]) => {
              const pct = total > 0 ? Math.round((amount / total) * 100) : 0
              return (
                <li key={category}>
                  <div className="mb-1.5 flex items-center justify-between text-sm">
                    <span className="font-medium">{category}</span>
                    <span className="tabular text-muted-foreground">
                      {formatINR(amount)}
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary transition-all duration-700 ease-out"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </li>
              )
            })}
          </ul>
          <div className="mt-6 rounded-2xl bg-accent p-4">
            <p className="text-xs leading-relaxed text-accent-foreground text-pretty">
              Spending is recalculated from the live Firestore records every time this page loads.
            </p>
          </div>
        </Card>

        <div
          ref={menuRef}
          className="flex flex-col gap-3 lg:col-span-2 animate-fade-up [animation-delay:120ms]"
        >
          {filteredExpenses.map((expense) => {
            const Icon = categoryIcon[expense.category]
            return (
              <Card
                key={expense.id}
                onClick={() => {
                  setDetailExpense(expense)
                  setEditPaidVal(String(expense.paidAmount || 0))
                }}
                className="relative flex items-center gap-4 p-4 md:p-5 cursor-pointer hover:bg-muted/40 transition-colors"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-accent text-accent-foreground">
                  <Icon className="h-5 w-5" strokeWidth={1.75} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-x-2">
                    <span className="text-sm font-semibold">{expense.category}</span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(`${expense.date}T00:00:00`).toLocaleDateString('en-IN', {
                        day: 'numeric',
                        month: 'short',
                      })}
                    </span>
                    {expense.isRecurring && (
                      <span className="rounded-full bg-primary/10 text-primary px-1.5 py-0.5 text-[9px] font-semibold uppercase">
                        Recurring
                      </span>
                    )}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground mt-0.5">
                    {expense.note}
                  </span>
                </span>
                <div className="relative">
                  <button
                    type="button"
                    aria-label={`Bill attachment for ${expense.category}`}
                    onClick={(e) => {
                      e.stopPropagation()
                      if (expense.billImageUrl) {
                        window.open(expense.billImageUrl, '_blank', 'noopener,noreferrer')
                      } else {
                        setActiveExpenseId(expense.id)
                        fileInputRef.current?.click()
                      }
                    }}
                    className="hidden h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground sm:flex"
                  >
                    <Paperclip className="h-4 w-4" strokeWidth={1.75} />
                  </button>
                  <button
                    type="button"
                    aria-label="Expense actions"
                    onClick={(e) => {
                      e.stopPropagation()
                      setMenuOpen((current) => (current === expense.id ? null : expense.id))
                    }}
                    className="ml-1 flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                  >
                    <MoreHorizontal className="h-4 w-4" strokeWidth={1.75} />
                  </button>
                  {menuOpen === expense.id && (
                    <div className="absolute right-0 top-11 z-10 w-52 overflow-hidden rounded-2xl border border-border bg-popover shadow-[0_16px_50px_rgb(0,0,0,0.12)] animate-fade-up">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          setMenuOpen(null)
                          setActiveExpenseId(expense.id)
                          fileInputRef.current?.click()
                        }}
                        className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm transition-colors hover:bg-accent"
                      >
                        <Paperclip className="h-4 w-4 text-muted-foreground" />
                        {expense.billImageUrl ? 'Replace bill' : 'Upload bill'}
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          setMenuOpen(null)
                          openQuickAdd({ tab: 'expense', expenseId: expense.id })
                        }}
                        className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm transition-colors hover:bg-accent"
                      >
                        <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
                        Edit expense
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          setMenuOpen(null)
                          void handleDelete(expense)
                        }}
                        className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-destructive transition-colors hover:bg-destructive/10"
                      >
                        <MoreHorizontal className="h-4 w-4" />
                        Delete expense
                      </button>
                    </div>
                  )}
                </div>
                <span className="tabular text-sm font-semibold md:text-base ml-2">
                  {formatINR(expense.amount)}
                </span>
              </Card>
            )
          })}
          {!loading && filteredExpenses.length === 0 && (
            <Card className="p-6 text-sm text-muted-foreground">
              No expenses match your filters.
            </Card>
          )}
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,application/pdf"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) void handleBillUpload(file)
          e.currentTarget.value = ''
        }}
      />

      {detailExpense && (() => {
        const details = getSeriesDetails(detailExpense)
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/45 px-4 backdrop-blur-sm">
            <Card className="w-full max-w-xl p-6 animate-fade-up overflow-hidden shadow-2xl relative">
              <button
                type="button"
                onClick={() => setDetailExpense(null)}
                className="absolute right-4 top-4 h-8 w-8 rounded-full border border-border flex items-center justify-center text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                ✕
              </button>

              <div className="mb-5 flex items-center gap-3">
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <Megaphone className="h-6 w-6" />
                </span>
                <div>
                  <p className="micro-label mb-1">{detailExpense.category} Details</p>
                  <h2 className="text-xl font-semibold tracking-tight">
                    {detailExpense.note || 'Expense Summary'}
                  </h2>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 border-t border-b border-border py-4 mb-5 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Expense Type</p>
                  <p className="font-semibold text-foreground mt-0.5">{details.type}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Current Installment Date</p>
                  <p className="font-semibold text-foreground mt-0.5">{detailExpense.date}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Monthly Installment Value</p>
                  <p className="font-semibold text-foreground mt-0.5">{formatINR(details.monthlyAmount)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Installment Payment Status</p>
                  <p className="font-semibold text-foreground mt-0.5 uppercase text-xs">
                    <span className={cn(
                      'rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider',
                      detailExpense.status === 'paid' ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'
                    )}>
                      {detailExpense.status || 'paid'}
                    </span>
                  </p>
                </div>

                {detailExpense.isRecurring && (
                  <>
                    <div>
                      <p className="text-xs text-muted-foreground">Start Month / Year</p>
                      <p className="font-semibold text-foreground mt-0.5">{details.startDate}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">End Month / Year</p>
                      <p className="font-semibold text-foreground mt-0.5">{details.endDate}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Remaining Months</p>
                      <p className="font-semibold text-foreground mt-0.5">{details.remainingMonths} Months</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Total Planned Cost</p>
                      <p className="font-semibold text-foreground mt-0.5">{formatINR(details.totalPlannedCost)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Total Paid Till Now</p>
                      <p className="font-semibold text-success mt-0.5">{formatINR(details.paidAmount)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Remaining Dues</p>
                      <p className="font-semibold text-warning-foreground mt-0.5">{formatINR(details.remainingAmount)}</p>
                    </div>
                  </>
                )}
              </div>

              {/* Edit installment payment section */}
              <div className="rounded-2xl bg-muted/40 p-4 border border-border/60 mb-5">
                <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">
                  Log Installment Payment
                </h4>
                <div className="flex gap-3 items-end">
                  <div className="flex-1">
                    <label className="text-[11px] font-medium text-muted-foreground mb-1 block">
                      Paid Amount (₹)
                    </label>
                    <input
                      type="number"
                      className="h-10 w-full rounded-xl border border-border bg-card px-3.5 text-sm outline-none focus:border-ring"
                      value={editPaidVal}
                      onChange={(e) => setEditPaidVal(e.target.value)}
                      placeholder="e.g. 10000"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleSavePayment}
                    className="h-10 rounded-xl bg-primary px-4 text-xs font-semibold text-primary-foreground hover:opacity-90"
                  >
                    Save Payment
                  </button>
                </div>
              </div>

              <div className="flex justify-end gap-2 border-t border-border pt-4">
                <button
                  type="button"
                  onClick={() => setDetailExpense(null)}
                  className="h-10 rounded-xl border border-border bg-background px-4 text-sm font-semibold text-foreground hover:bg-muted"
                >
                  Close
                </button>
              </div>
            </Card>
          </div>
        )
      })()}
    </div>
  )
}
