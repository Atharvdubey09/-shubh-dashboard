'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { ArrowUpRight, CircleAlert, CircleCheck, Lock, TrendingUp, CalendarClock, ReceiptText, Gem } from 'lucide-react'
import { Card, Avatar } from '@/components/ui-bits'
import { IncomeChart } from '@/components/dashboard/income-chart'
import { TodayTasks } from '@/components/dashboard/today-tasks'
import { CashBalanceCard } from '@/components/dashboard/cash-balance-card'
import { BusinessHealthCard } from '@/components/dashboard/business-health-card'
import { useAppData } from '@/components/state/app-data-provider'
import { formatINR } from '@/lib/domain'
import { cn } from '@/lib/utils'
import { subscribeWallets, Wallet, subscribeDailyClosing, DailyClosing, closeDailyDay } from '@/lib/firestore'

import { useAuth } from '@/components/state/auth-provider'

function relativeDay(iso: string) {
  const d = new Date(`${iso}T00:00:00`)
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const diff = Math.round((d.getTime() - today.getTime()) / 86400000)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Tomorrow'
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

const TOTAL_REVENUE_PASSWORD = '2006'

export default function DashboardPage() {
  const {
    students,
    payments,
    stats,
    upcomingPayments,
    monthlySeries,
    loading,
    settings,
    revenueUnlocked,
    setRevenueUnlocked,
    expenses,
  } = useAppData()
  const { user, userRole } = useAuth()
  const userName = user?.displayName || user?.email || 'Authorized User'
  const [unlockOpen, setUnlockOpen] = useState(false)
  const [unlockPassword, setUnlockPassword] = useState('')
  const [unlockError, setUnlockError] = useState<string | null>(null)

  // Wallet Summary & Daily Closing State
  const showWalletSummary = userRole === 'Owner' || userRole === 'Admin' || userRole === 'Accountant'
  const [wallets, setWallets] = useState<Wallet[]>([])
  const [closings, setClosings] = useState<DailyClosing[]>([])

  useEffect(() => {
    if (showWalletSummary) {
      const unsub = subscribeWallets((w) => setWallets(w))
      return () => unsub()
    }
  }, [showWalletSummary])

  useEffect(() => {
    if (showWalletSummary) {
      const unsub = subscribeDailyClosing((c) => setClosings(c))
      return () => unsub()
    }
  }, [showWalletSummary])

  const cashBal = wallets.find((w) => w.walletId === 'cash')?.balance || 0
  const bankBal = wallets.find((w) => w.walletId === 'bank')?.balance || 0
  const razorpayBal = wallets.find((w) => w.walletId === 'razorpay')?.balance || 0
  const totalOutstandingFees = students
    .filter((s) => s.status === 'active')
    .reduce((sum, s) => sum + s.pending, 0)
  const totalExpensesAmount = expenses.reduce((sum, e) => sum + e.amount, 0)
  const netBusinessFunds = cashBal + bankBal + razorpayBal - totalExpensesAmount

  // Daily Closing calculations for Today (local date YYYY-MM-DD)
  const todayStr = new Date().toISOString().slice(0, 10)
  const todayClosing = closings.find((c) => c.date === todayStr)
  const isTodayClosed = todayClosing?.status === 'closed'

  // Today's Collection
  const todayCollection = payments
    .filter((p) => p.date === todayStr && p.status === 'paid')
    .reduce((sum, p) => sum + p.amount, 0)

  // Today's Expenses
  const todayExpenses = expenses
    .filter((e) => e.date === todayStr && e.status === 'paid')
    .reduce((sum, e) => sum + e.amount, 0)

  // Yesterday opening balance helper
  const yesterdayStr = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const yesterdayClosing = closings.find((c) => c.date === yesterdayStr)
  const todayOpeningBalance = yesterdayClosing
    ? yesterdayClosing.closingBalance
    : Math.max(cashBal + bankBal + razorpayBal - todayCollection + todayExpenses, 0)
  const todayClosingBalance = todayOpeningBalance + todayCollection - todayExpenses

  const dispOpening = todayClosing ? todayClosing.openingBalance : todayOpeningBalance
  const dispCollection = todayClosing ? todayClosing.collection : todayCollection
  const dispExpenses = todayClosing ? todayClosing.expenses : todayExpenses
  const dispClosing = todayClosing ? todayClosing.closingBalance : todayClosingBalance

  const handleCloseToday = async () => {
    try {
      await closeDailyDay({
        date: todayStr,
        openingBalance: dispOpening,
        collection: dispCollection,
        expenses: dispExpenses,
        deposits: 0,
        withdrawals: 0,
        closingBalance: dispClosing,
        closedBy: userName,
        notes: 'Closed via Quick Dashboard card'
      })
      alert('Today has been closed and locked successfully!')
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to close day.')
    }
  }

  // 30 Days Forecast Calculations for Dashboard Widget
  const currentCashBalance = cashBal + bankBal + razorpayBal
  const startISO = new Date().toISOString().slice(0, 10)
  const endISO = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

  let studentDues30 = 0
  students.forEach((s) => {
    if (s.status !== 'active') return
    s.feeSchedule?.forEach((item: any) => {
      if (item.status !== 'paid' && item.dueDate >= startISO && item.dueDate <= endISO) {
        studentDues30 += item.amount - (item.paidAmount || 0)
      }
    })
  })

  const dbExpenses30 = expenses
    .filter((e) => e.status !== 'paid' && e.date >= startISO && e.date <= endISO)
    .reduce((sum, e) => sum + e.amount, 0)

  const projectedBalance30 = currentCashBalance + studentDues30 - dbExpenses30

  // Razorpay Gateway status state
  const [gatewayStatus, setGatewayStatus] = useState<{
    isConnected: boolean
    isWebhookConfigured: boolean
    mode: string
    keyId: string
    lastPayment: string | null
    lastWebhook: string | null
    lastWebhookEvent: string | null
    lastSync: string | null
    lastSyncStatus: string
  } | null>(null)

  useEffect(() => {
    async function fetchGatewayStatus() {
      try {
        const res = await fetch('/api/payments/status')
        if (res.ok) {
          const data = await res.json()
          setGatewayStatus(data)
        }
      } catch (err) {
        console.error('Failed to fetch gateway status:', err)
      }
    }
    void fetchGatewayStatus()
  }, [])

  // Drawer modal states
  const [drawerType, setDrawerType] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [sortField, setSortField] = useState<'name' | 'remaining' | 'dueDate'>('name')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')

  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth()

  const currentMonthStart = new Date(year, month, 1)
  const currentMonthEnd = new Date(year, month + 1, 0)
  const currentMonthStartISO = currentMonthStart.toISOString().split('T')[0]
  const currentMonthEndISO = currentMonthEnd.toISOString().split('T')[0]

  const nextMonthStart = new Date(year, month + 1, 1)
  const nextMonthEnd = new Date(year, month + 2, 0)
  const nextMonthStartISO = nextMonthStart.toISOString().split('T')[0]
  const nextMonthEndISO = nextMonthEnd.toISOString().split('T')[0]

  function getNextDueDate(student: any) {
    const nextItem = student.feeSchedule?.find((item: any) => item.status !== 'paid')
    return nextItem ? nextItem.dueDate : '—'
  }

  const getDrawerData = () => {
    if (!drawerType) return []
    let list: Array<{
      id: string
      studentName: string
      studentClass: number
      paymentType: string
      dueDate: string
      dueAmount: number
      paidAmount: number
      remainingAmount: number
      status: string
    }> = []

    students.forEach((student) => {
      if (student.status !== 'active') return

      if (drawerType === 'Monthly' || drawerType === 'Split' || drawerType === 'Full' || drawerType === 'TotalExpected' || drawerType === 'ThisMonthExpected' || drawerType === 'NextMonthExpected') {
        const matchesType =
          drawerType === 'TotalExpected' ||
          drawerType === 'ThisMonthExpected' ||
          drawerType === 'NextMonthExpected' ||
          (drawerType === 'Monthly' && student.paymentType === 'Monthly') ||
          (drawerType === 'Split' && student.paymentType === 'Split') ||
          (drawerType === 'Full' && student.paymentType === 'Full Payment')

        if (!matchesType) return

        student.feeSchedule?.forEach((item) => {
          if (drawerType !== 'NextMonthExpected' && item.status === 'paid') return

          const isCurrentMonth = item.dueDate >= currentMonthStartISO && item.dueDate <= currentMonthEndISO
          const isNextMonth = item.dueDate >= nextMonthStartISO && item.dueDate <= nextMonthEndISO

          let shouldInclude = false
          if (drawerType === 'NextMonthExpected') shouldInclude = isNextMonth
          else shouldInclude = isCurrentMonth

          if (shouldInclude) {
            const due = item.amount
            const paid = item.paidAmount || 0
            const remaining = Math.max(due - paid, 0)
            list.push({
              id: item.id,
              studentName: student.name,
              studentClass: student.class,
              paymentType: student.paymentType,
              dueDate: item.dueDate,
              dueAmount: due,
              paidAmount: paid,
              remainingAmount: remaining,
              status: item.status,
            })
          }
        })
      } else if (drawerType === 'CoachingValue' || drawerType === 'LTV') {
        list.push({
          id: student.id,
          studentName: student.name,
          studentClass: student.class,
          paymentType: student.paymentType,
          dueDate: student.joined,
          dueAmount: student.totalFee,
          paidAmount: student.paid,
          remainingAmount: student.pending,
          status: student.status,
        })
      } else if (drawerType === 'Remaining') {
        list.push({
          id: student.id,
          studentName: student.name,
          studentClass: student.class,
          paymentType: student.paymentType,
          dueDate: getNextDueDate(student),
          dueAmount: student.totalFee,
          paidAmount: student.paid,
          remainingAmount: student.pending,
          status: student.status,
        })
      }
    })

    // Search filter
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase()
      list = list.filter(
        (row) =>
          row.studentName.toLowerCase().includes(q) ||
          row.paymentType.toLowerCase().includes(q) ||
          row.dueDate.includes(q)
      )
    }

    // Sorting
    list.sort((a, b) => {
      let comparison = 0
      if (sortField === 'name') {
        comparison = a.studentName.localeCompare(b.studentName)
      } else if (sortField === 'remaining') {
        comparison = a.remainingAmount - b.remainingAmount
      } else if (sortField === 'dueDate') {
        comparison = a.dueDate.localeCompare(b.dueDate)
      }
      return sortOrder === 'asc' ? comparison : -comparison
    })

    return list
  }

  const getTransactionData = () => {
    if (drawerType !== 'TotalRevenueCollected') return []
    const nonDeletedStudentIds = new Set(
      students.map((s) => s.id)
    )
    let list = payments.filter((p) => p.status === 'paid' && nonDeletedStudentIds.has(p.studentId))

    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase()
      list = list.filter(
        (row) =>
          row.studentName.toLowerCase().includes(q) ||
          // @ts-ignore
          row.method?.toLowerCase().includes(q) ||
          row.date.includes(q)
      )
    }

    list.sort((a, b) => {
      let comparison = 0
      if (sortField === 'name') {
        comparison = a.studentName.localeCompare(b.studentName)
      } else if (sortField === 'dueDate') { // re-using dueDate sort for date
        comparison = a.date.localeCompare(b.date)
      } else {
        comparison = a.amount - b.amount
      }
      return sortOrder === 'asc' ? comparison : -comparison
    })

    return list
  }

  const todayLabel = new Date().toLocaleDateString('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  useEffect(() => {
    if (!unlockOpen) return
    const frame = window.requestAnimationFrame(() => {
      const input = document.getElementById('total-revenue-password') as HTMLInputElement | null
      input?.focus()
    })
    return () => window.cancelAnimationFrame(frame)
  }, [unlockOpen])

  function openRevenueUnlock() {
    if (revenueUnlocked) return
    setUnlockError(null)
    setUnlockPassword('')
    setUnlockOpen(true)
  }

  function submitRevenueUnlock(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (unlockPassword.trim() === TOTAL_REVENUE_PASSWORD) {
      setRevenueUnlocked(true)
      setUnlockOpen(false)
      setUnlockError(null)
      setUnlockPassword('')
      return
    }

    setUnlockError('Incorrect password.')
    setUnlockPassword('')
  }

  // Check if current user role has unlock permission
  function canUnlockRole() {
    return userRole === 'Owner' || userRole === 'Admin' || userRole === 'Accountant'
  }

  // Check if a stat card or block is locked/blurred
  function isLabelBlurred(label: string) {
    if (userRole === 'Teacher') return true
    if (userRole === 'Receptionist') {
      return (
        label === 'Expenses' ||
        label === 'Net Profit' ||
        label.includes('Expected') ||
        label.includes('Collection') ||
        label.includes('Coaching Fee') ||
        label.includes('Remaining Revenue')
      )
    }
    
    // For Owner, Admin, Accountant
    return !revenueUnlocked
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="animate-fade-up">
        <p className="micro-label mb-2 text-indigo-500 dark:text-indigo-400 font-semibold">{todayLabel}</p>
        <h1 className="text-3xl font-bold tracking-tight text-balance text-foreground md:text-4xl">
          Welcome back, {settings.ownerName?.split(' ')[0] || 'Admin'}
        </h1>
        <p className="text-muted-foreground mt-2">Here is what's happening at {settings.coachingName} today.</p>
      </div>

      <BusinessHealthCard />

      {/* Wallet & Daily Closing Summary Component (ERP Accounting Module) */}
      {showWalletSummary && (
        <div className="space-y-6 animate-fade-up">
          {/* Row 1: Today's Closing & Forecast Projections */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Today's Closing Widget */}
            <Card className="p-5 border border-border bg-card shadow-sm flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between border-b border-border/40 pb-2.5 mb-2.5">
                  <span className="text-[10px] font-extrabold text-muted-foreground uppercase tracking-wider">Today's Closing</span>
                  {isTodayClosed ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold bg-rose-500/10 border border-rose-500/20 text-rose-500">
                      🔴 Locked
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold bg-emerald-500/10 border border-emerald-500/20 text-emerald-500">
                      🟢 Open
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-xs mt-2">
                  <div>
                    <span className="text-[9px] font-bold text-muted-foreground uppercase block">Opening Cash</span>
                    <p className="font-extrabold text-foreground mt-0.5">{formatINR(dispOpening)}</p>
                  </div>
                  <div>
                    <span className="text-[9px] font-bold text-muted-foreground uppercase block">Collections</span>
                    <p className="font-extrabold text-emerald-500 mt-0.5">{formatINR(dispCollection)}</p>
                  </div>
                  <div>
                    <span className="text-[9px] font-bold text-muted-foreground uppercase block">Expenses</span>
                    <p className="font-extrabold text-rose-500 mt-0.5">{formatINR(dispExpenses)}</p>
                  </div>
                  <div>
                    <span className="text-[9px] font-bold text-muted-foreground uppercase block">Closing Cash</span>
                    <p className="font-extrabold text-indigo-500 mt-0.5">{formatINR(dispClosing)}</p>
                  </div>
                </div>
              </div>
              <div className="mt-4 pt-3 border-t border-border/40">
                {!isTodayClosed ? (
                  <button
                    onClick={handleCloseToday}
                    className="h-8 w-full rounded-xl bg-primary text-[10px] font-extrabold text-primary-foreground hover:opacity-90 transition-opacity shadow-[0_3px_8px_rgba(37,99,235,0.15)]"
                  >
                    Close Business Day
                  </button>
                ) : (
                  <Link
                    href="/finance/closing"
                    className="h-8 w-full rounded-xl border border-border bg-muted/30 hover:bg-muted/80 text-[10px] font-extrabold flex items-center justify-center transition-colors"
                  >
                    View Closing Audits
                  </Link>
                )}
              </div>
            </Card>

            {/* Cash Flow Forecast Widget */}
            <Card className="p-5 border border-border bg-card shadow-sm flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between border-b border-border/40 pb-2.5 mb-2.5">
                  <span className="text-[10px] font-extrabold text-muted-foreground uppercase tracking-wider">Cash Flow Forecast (30 Days)</span>
                  {projectedBalance30 < 0 ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold bg-rose-500/10 border border-rose-500/20 text-rose-500">
                      🔴 Risk
                    </span>
                  ) : currentCashBalance < 25000 + dbExpenses30 ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold bg-amber-500/10 border border-amber-500/20 text-amber-500">
                      🟡 Watch
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold bg-emerald-500/10 border border-emerald-500/20 text-emerald-500">
                      🟢 Healthy
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-xs mt-2">
                  <div>
                    <span className="text-[9px] font-bold text-muted-foreground uppercase block">Current Cash</span>
                    <p className="font-extrabold text-foreground mt-0.5">{formatINR(currentCashBalance)}</p>
                  </div>
                  <div>
                    <span className="text-[9px] font-bold text-muted-foreground uppercase block">Expected Income</span>
                    <p className="font-extrabold text-emerald-500 mt-0.5">+{formatINR(studentDues30)}</p>
                  </div>
                  <div>
                    <span className="text-[9px] font-bold text-muted-foreground uppercase block">Expected Expenses</span>
                    <p className="font-extrabold text-rose-500 mt-0.5">-{formatINR(dbExpenses30)}</p>
                  </div>
                  <div>
                    <span className="text-[9px] font-bold text-muted-foreground uppercase block">Projected Cash</span>
                    <p className="font-extrabold text-indigo-500 mt-0.5">{formatINR(projectedBalance30)}</p>
                  </div>
                </div>
              </div>
              <div className="mt-4 pt-3 border-t border-border/40">
                <Link
                  href="/finance/forecast"
                  className="h-8 w-full rounded-xl bg-primary text-white text-[10px] font-extrabold flex items-center justify-center hover:opacity-90 transition-opacity shadow-[0_3px_8px_rgba(99,102,241,0.15)]"
                >
                  View Cash Forecast Details
                </Link>
              </div>
            </Card>
          </div>

          {/* Row 2: Internal Wallet Summary */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground">Internal Wallet Summary</h3>
              <Link href="/finance" className="text-[10px] text-indigo-500 hover:text-indigo-600 font-bold flex items-center gap-1">
                View Detailed Ledger <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <Link href="/finance?wallet=cash" className="block">
                <Card className="p-4 bg-card hover:bg-muted/15 border border-border/50 shadow-sm transition-all hover:scale-[1.01] flex flex-col justify-between h-full">
                  <span className="text-[9px] font-bold text-muted-foreground uppercase">Cash</span>
                  <p className="text-base font-extrabold text-foreground mt-2">{formatINR(cashBal)}</p>
                </Card>
              </Link>
              <Link href="/finance?wallet=bank" className="block">
                <Card className="p-4 bg-card hover:bg-muted/15 border border-border/50 shadow-sm transition-all hover:scale-[1.01] flex flex-col justify-between h-full">
                  <span className="text-[9px] font-bold text-muted-foreground uppercase">Bank</span>
                  <p className="text-base font-extrabold text-foreground mt-2">{formatINR(bankBal)}</p>
                </Card>
              </Link>
              <Link href="/finance?wallet=razorpay" className="block">
                <Card className="p-4 bg-card hover:bg-muted/15 border border-border/50 shadow-sm transition-all hover:scale-[1.01] flex flex-col justify-between h-full">
                  <span className="text-[9px] font-bold text-muted-foreground uppercase">Razorpay</span>
                  <p className="text-base font-extrabold text-foreground mt-2">{formatINR(razorpayBal)}</p>
                </Card>
              </Link>
              <Link href="/finance" className="block">
                <Card className="p-4 bg-card hover:bg-muted/15 border border-border/50 shadow-sm transition-all hover:scale-[1.01] flex flex-col justify-between h-full">
                  <span className="text-[9px] font-bold text-muted-foreground uppercase">Outstanding</span>
                  <p className="text-base font-extrabold text-foreground mt-2">{formatINR(totalOutstandingFees)}</p>
                </Card>
              </Link>
              <Card className="p-4 bg-gradient-to-br from-indigo-500/10 to-transparent border border-indigo-500/20 shadow-sm flex flex-col justify-between h-full">
                <span className="text-[9px] font-bold text-indigo-500 uppercase">Net Funds</span>
                <p className="text-base font-extrabold text-indigo-600 dark:text-indigo-400 mt-2">{formatINR(netBusinessFunds)}</p>
              </Card>
            </div>
          </div>
        </div>
      )}

      {/* Hero Section: Top Level Metrics */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4 animate-fade-up [animation-delay:60ms]">
        <Card className="p-5 border-l-4 border-l-indigo-500 bg-gradient-to-br from-indigo-50/50 to-transparent dark:from-indigo-950/20 shadow-sm hover:shadow-md transition-all">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Active Students</p>
          <div className="mt-3 flex items-end justify-between">
            <p className="text-3xl font-bold text-foreground">{stats.activeStudents}</p>
            <p className="text-xs text-muted-foreground mb-1">{stats.totalStudents} Total</p>
          </div>
        </Card>

        <Card className="p-5 border-l-4 border-l-amber-500 bg-gradient-to-br from-amber-50/50 to-transparent dark:from-amber-950/20 shadow-sm hover:shadow-md transition-all cursor-pointer" onClick={() => {
            setDrawerType('Remaining'); setSearchTerm(''); setSortField('remaining'); setSortOrder('desc')
        }}>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total Pending Dues</p>
          <div className="mt-3">
            <p className="text-3xl font-bold text-foreground tabular">{formatINR(stats.pendingFees)}</p>
          </div>
        </Card>

        <Card className="p-5 border-l-4 border-l-emerald-500 bg-gradient-to-br from-emerald-50/50 to-transparent dark:from-emerald-950/20 shadow-sm hover:shadow-md transition-all">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Today's Collection</p>
          <div className="mt-3 flex items-end justify-between">
            <p className="text-3xl font-bold text-foreground tabular">{formatINR(stats.todayCollection)}</p>
            <p className="text-xs text-muted-foreground mb-1">{formatINR(stats.todayDue)} Due</p>
          </div>
        </Card>

        <Card className="p-5 border-l-4 border-l-rose-500 bg-gradient-to-br from-rose-50/50 to-transparent dark:from-rose-950/20 shadow-sm hover:shadow-md transition-all">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Month Expenses</p>
          <div className="mt-3">
            <p className="text-3xl font-bold text-foreground tabular">{formatINR(stats.monthExpenses)}</p>
          </div>
        </Card>
      </div>

      {/* Main Operations Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fade-up [animation-delay:90ms]">
        <div className="lg:col-span-1 space-y-6">
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider px-1">Cash Management</h3>
            <CashBalanceCard />
          </div>

          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider px-1">Monthly Financials</h3>
            <Card className="relative overflow-hidden bg-slate-900 text-white p-5 shadow-lg border-slate-800">
               <div className={cn('transition-all duration-500 ease-out h-full', isLabelBlurred('Net Profit') ? 'pointer-events-none select-none blur-[12px] opacity-30' : 'opacity-100')}>
                 <div className="flex items-center justify-between">
                    <p className="font-semibold text-xs uppercase tracking-wider text-slate-400">Net Profit (All-Time)</p>
                    <TrendingUp className="h-4 w-4 text-emerald-400" strokeWidth={2} />
                  </div>
                  <div className="mt-4">
                    <p className="tabular text-3xl font-bold tracking-tight">{formatINR(stats.netProfit)}</p>
                    <p className="mt-1 text-xs text-slate-400 font-medium">All-time net earnings</p>
                 </div>
                 <div className="mt-6 pt-4 border-t border-slate-700/50 grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-[10px] uppercase text-slate-400 mb-1">Total Revenue</p>
                      <p className="font-semibold text-sm">{formatINR(stats.monthCollection)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase text-slate-400 mb-1">Expected Next</p>
                      <p className="font-semibold text-sm">{formatINR(stats.nextMonthExpected)}</p>
                    </div>
                 </div>
               </div>
               
               {isLabelBlurred('Net Profit') && canUnlockRole() && (
                <button type="button" onClick={openRevenueUnlock} className="absolute inset-0 flex items-center justify-center bg-slate-900/50 backdrop-blur-[2px] hover:bg-slate-900/60 transition-colors">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-slate-900 shadow-xl"><Lock className="h-4 w-4" /></span>
                </button>
               )}
            </Card>
          </div>
        </div>

        <div className="lg:col-span-2 space-y-3 h-full">
           <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider px-1">Revenue Overview</h3>
           <div className="grid grid-cols-2 gap-4 h-[calc(100%-2rem)]">
              
              <Card 
                onClick={() => { if(!isLabelBlurred('Total Revenue')){ setDrawerType('ThisMonthExpected'); setSearchTerm(''); setSortField('name'); setSortOrder('asc'); } }} 
                className="relative overflow-hidden bg-slate-900 border-slate-800 p-4 shadow-sm hover:shadow-md hover:border-emerald-500/50 transition-all cursor-pointer flex flex-col justify-center group"
              >
                <div className={cn('transition-all duration-300', isLabelBlurred('Total Revenue') ? 'blur-[8px] opacity-30 select-none pointer-events-none' : '')}>
                  <p className="text-[10px] font-semibold text-emerald-400 uppercase tracking-widest mb-1">This Month Expected</p>
                  <p className="text-2xl font-bold text-white tabular-nums">{formatINR(stats.currentMonthTotalExpected)}</p>
                  <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                    <TrendingUp className="h-4 w-4 text-emerald-400" />
                  </div>
                </div>
              </Card>

              <Card 
                onClick={() => { if(!isLabelBlurred('Total Revenue')){ setDrawerType('NextMonthExpected'); setSearchTerm(''); setSortField('name'); setSortOrder('asc'); } }} 
                className="relative overflow-hidden bg-slate-900 border-slate-800 p-4 shadow-sm hover:shadow-md hover:border-blue-500/50 transition-all cursor-pointer flex flex-col justify-center group"
              >
                <div className={cn('transition-all duration-300', isLabelBlurred('Total Revenue') ? 'blur-[8px] opacity-30 select-none pointer-events-none' : '')}>
                  <p className="text-[10px] font-semibold text-blue-400 uppercase tracking-widest mb-1">Next Month Expected</p>
                  <p className="text-2xl font-bold text-white tabular-nums">{formatINR(stats.nextMonthExpected)}</p>
                  <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                    <CalendarClock className="h-4 w-4 text-blue-400" />
                  </div>
                </div>
              </Card>

              <Card 
                onClick={() => { if(!isLabelBlurred('Total Revenue')){ setDrawerType('TotalRevenueCollected'); setSearchTerm(''); setSortField('dueDate'); setSortOrder('desc'); } }} 
                className="relative overflow-hidden bg-slate-900 border-slate-800 p-4 shadow-sm hover:shadow-md hover:border-violet-500/50 transition-all cursor-pointer flex flex-col justify-center group"
              >
                <div className={cn('transition-all duration-300', isLabelBlurred('Total Revenue') ? 'blur-[8px] opacity-30 select-none pointer-events-none' : '')}>
                  <p className="text-[10px] font-semibold text-violet-400 uppercase tracking-widest mb-1">Total Revenue Collected</p>
                  <p className="text-2xl font-bold text-white tabular-nums">{formatINR(stats.totalRevenueCollected)}</p>
                  <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                    <ReceiptText className="h-4 w-4 text-violet-400" />
                  </div>
                </div>
              </Card>

              <Card 
                onClick={() => { if(!isLabelBlurred('Total Revenue')){ setDrawerType('LTV'); setSearchTerm(''); setSortField('remaining'); setSortOrder('desc'); } }} 
                className="relative overflow-hidden bg-slate-900 border-slate-800 p-4 shadow-sm hover:shadow-md hover:border-amber-500/50 transition-all cursor-pointer flex flex-col justify-center group"
              >
                <div className={cn('transition-all duration-300', isLabelBlurred('Total Revenue') ? 'blur-[8px] opacity-30 select-none pointer-events-none' : '')}>
                  <p className="text-[10px] font-semibold text-amber-400 uppercase tracking-widest mb-1">Lifetime Value (LTV)</p>
                  <p className="text-2xl font-bold text-white tabular-nums">{formatINR(stats.totalCoachingFeeValue)}</p>
                  <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Gem className="h-4 w-4 text-amber-400" />
                  </div>
                </div>
              </Card>

              {isLabelBlurred('Total Revenue') && canUnlockRole() && (
                <button type="button" onClick={openRevenueUnlock} className="absolute inset-0 flex items-center justify-center bg-slate-900/50 backdrop-blur-[2px] hover:bg-slate-900/60 transition-colors z-10 m-2 rounded-xl">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-slate-900 shadow-xl"><Lock className="h-4 w-4" /></span>
                </button>
               )}
           </div>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-5 animate-fade-up [animation-delay:120ms]">
        <Card className="relative p-6 lg:col-span-3 overflow-hidden">
          <div
            className={cn(
              'transition-all duration-500 ease-out',
              isLabelBlurred('Net Profit')
                ? 'pointer-events-none select-none blur-[18px] opacity-10'
                : 'opacity-100',
            )}
          >
            <div className="mb-6 flex items-center justify-between">
              <div>
                <p className="micro-label mb-1">Monthly</p>
                <h2 className="text-base font-semibold tracking-tight">
                  Income vs Expense
                </h2>
              </div>
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-primary" /> Income
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-0.5 w-3.5 rounded-full bg-chart-2" /> Expense
                </span>
              </div>
            </div>
            <IncomeChart data={monthlySeries} />
          </div>

          {isLabelBlurred('Net Profit') && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/10 backdrop-blur-[1px]">
              <div className="flex flex-col items-center gap-2 rounded-2xl border border-border bg-card/90 px-4 py-3 shadow-lg">
                <Lock className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs font-semibold text-muted-foreground">Financial chart locked</span>
              </div>
            </div>
          )}
        </Card>

        <Card className="p-6 lg:col-span-2">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <p className="micro-label mb-1">Next 7 days</p>
              <h2 className="text-base font-semibold tracking-tight">
                Upcoming Payments
              </h2>
            </div>
            <Link
              href="/calendar"
              className="flex items-center gap-1 text-xs font-medium text-primary transition-opacity hover:opacity-70"
            >
              Calendar <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <ul className="flex flex-col">
            {upcomingPayments.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/students/${p.studentId}`}
                  className="flex items-center gap-3 rounded-2xl px-2 py-3 transition-colors hover:bg-muted/70"
                >
                  <Avatar name={p.studentName} size="sm" />
                  <span className="flex-1 min-w-0">
                    <span className="block truncate text-sm font-medium">
                      {p.studentName}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {p.label}
                    </span>
                  </span>
                  <span className="text-right">
                    <span className="tabular block text-sm font-semibold">
                      {formatINR(p.amount)}
                    </span>
                    <span className="micro-label">{relativeDay(p.date)}</span>
                  </span>
                </Link>
              </li>
            ))}
            {upcomingPayments.length === 0 && !loading && (
              <li className="px-2 py-4 text-sm text-muted-foreground">
                No upcoming payments right now.
              </li>
            )}
          </ul>
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-5 animate-fade-up [animation-delay:180ms]">
        <Card className="p-6 lg:col-span-2">
          <TodayTasks />
        </Card>

        <Card className="p-6 lg:col-span-3">
          <p className="micro-label mb-1">Business Summary</p>
          <h2 className="mb-5 text-base font-semibold tracking-tight">
            How is my coaching today?
          </h2>
          <ul className="flex flex-col gap-3.5">
            {[
              {
                good: true,
                text: `${stats.activeStudents} active students out of ${stats.totalStudents} total students are tracked live in Firestore.`,
              },
              {
                good: true,
                text: `${formatINR(stats.todayCollection)} has been collected today so far.`,
              },
              {
                good: true,
                text: `${formatINR(stats.monthCollection)} has been collected this month.`,
              },
              {
                good: false,
                text: `${formatINR(stats.pendingFees)} is still pending across open fee schedules.`,
              },
              {
                good: false,
                text: `${formatINR(stats.monthExpenses)} has been spent on expenses this month.`,
              },
            ].map((item) => (
              <li key={item.text} className="flex items-start gap-3">
                {item.good ? (
                  <CircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-success" strokeWidth={1.75} />
                ) : (
                  <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" strokeWidth={1.75} />
                )}
                <p className="text-sm leading-relaxed text-pretty">{item.text}</p>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {unlockOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6">
          <button
            type="button"
            aria-label="Close unlock dialog"
            className="absolute inset-0 bg-slate-950/45 backdrop-blur-md"
            onClick={() => setUnlockOpen(false)}
          />
          <Card className="animate-fade-up relative w-full max-w-md overflow-hidden p-6 shadow-[0_30px_90px_rgba(15,23,42,0.22)]">
            <div className="mb-5 flex items-center gap-3">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-[0_10px_24px_rgba(37,99,235,0.28)]">
                <Lock className="h-5 w-5" />
              </span>
              <div>
                <p className="micro-label mb-1">Unlock Total Revenue</p>
                <h2 className="text-xl font-semibold tracking-tight">
                  Enter owner password
                </h2>
              </div>
            </div>

            <form className="space-y-4" onSubmit={submitRevenueUnlock}>
              <div>
                <label
                  htmlFor="total-revenue-password"
                  className="mb-2 block text-sm font-medium text-foreground"
                >
                  Password
                </label>
                <input
                  id="total-revenue-password"
                  type="password"
                  value={unlockPassword}
                  onChange={(event) => setUnlockPassword(event.target.value)}
                  className="h-11 w-full rounded-xl border border-border bg-background px-3.5 text-sm outline-none transition-colors focus:border-ring focus:ring-3 focus:ring-ring/20"
                  placeholder="Enter password"
                  autoComplete="current-password"
                />
              </div>

              {unlockError && (
                <p className="rounded-xl border border-destructive/20 bg-destructive/5 px-3.5 py-2 text-sm text-destructive">
                  {unlockError}
                </p>
              )}

              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => setUnlockOpen(false)}
                  className="h-11 rounded-xl border border-border bg-background px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="h-11 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  Unlock
                </button>
              </div>
            </form>
          </Card>
        </div>
      )}

      {drawerType && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/45 px-4 backdrop-blur-sm">
          <Card className="w-full max-w-4xl max-h-[85vh] flex flex-col p-6 animate-fade-up overflow-hidden shadow-2xl">
            <div className="mb-4 flex items-center justify-between border-b border-border pb-3">
              <div>
                <h3 className="text-lg font-bold tracking-tight">
                  {drawerType === 'Monthly' && 'Monthly Plan Collection'}
                  {drawerType === 'Split' && 'Split Plan Collection'}
                  {drawerType === 'Full' && 'Full Payment Plan Collection'}
                  {drawerType === 'TotalExpected' && 'Total Expected Collection'}
                  {drawerType === 'ThisMonthExpected' && 'This Month Expected Collection'}
                  {drawerType === 'NextMonthExpected' && 'Next Month Expected Collection'}
                  {drawerType === 'TotalRevenueCollected' && 'Total Revenue Transactions'}
                  {drawerType === 'CoachingValue' && 'Total Coaching Fee Value'}
                  {drawerType === 'LTV' && 'Total Lifetime Value'}
                  {drawerType === 'Remaining' && 'Remaining Revenue'}
                  <span className="ml-2.5 text-sm font-normal text-muted-foreground">
                    ({drawerType === 'TotalRevenueCollected' ? getTransactionData().length : getDrawerData().length} records found)
                  </span>
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {drawerType === 'CoachingValue' || drawerType === 'LTV'
                    ? 'Total agreed fees across all active students.'
                    : drawerType === 'Remaining'
                    ? 'Outstanding balance across all active students, sorted by highest first.'
                    : drawerType === 'TotalRevenueCollected'
                    ? 'Complete history of all successful payments.'
                    : drawerType === 'NextMonthExpected'
                    ? 'Installments scheduled for the next calendar month.'
                    : 'Unpaid or partially paid installments due this calendar month.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDrawerType(null)}
                className="h-8 w-8 rounded-full border border-border flex items-center justify-center text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                ✕
              </button>
            </div>

            <div className="mb-4 flex flex-col sm:flex-row gap-3 items-center justify-between">
              <input
                type="text"
                className="h-9 w-full max-w-xs rounded-xl border border-border bg-muted/40 px-3.5 text-xs outline-none focus:border-ring focus:bg-card"
                placeholder="Search by student, type, or date..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />

              <div className="flex gap-2 text-xs">
                <select
                  value={sortField}
                  onChange={(e) => setSortField(e.target.value as any)}
                  className="h-9 rounded-xl border border-border px-2.5 bg-muted/20 outline-none"
                >
                  <option value="name">Sort by Name</option>
                  <option value="remaining">Sort by Remaining</option>
                  <option value="dueDate">Sort by Due Date</option>
                </select>
                <button
                  type="button"
                  onClick={() => setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
                  className="h-9 rounded-xl border border-border px-3 bg-muted/20 hover:bg-muted font-semibold"
                >
                  {sortOrder === 'asc' ? 'Ascending' : 'Descending'}
                </button>
              </div>
            </div>

            {drawerType === 'TotalRevenueCollected' ? (
              <div className="flex-1 overflow-y-auto border border-border rounded-xl">
                <table className="w-full text-left text-xs whitespace-nowrap">
                  <thead className="bg-muted/40 sticky top-0 border-b border-border">
                    <tr>
                      <th className="px-4 py-3 font-semibold text-muted-foreground">Student Name</th>
                      <th className="px-4 py-3 font-semibold text-muted-foreground text-right">Amount Paid</th>
                      <th className="px-4 py-3 font-semibold text-muted-foreground text-right">Payment Date</th>
                      <th className="px-4 py-3 font-semibold text-muted-foreground text-center">Payment Mode</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {getTransactionData().map((row, index) => (
                      <tr key={row.id + '-' + index} className="hover:bg-muted/20">
                        <td className="px-4 py-2.5 font-semibold text-foreground">{row.studentName}</td>
                        <td className="px-4 py-2.5 text-right font-medium text-emerald-500">{formatINR(row.amount)}</td>
                        <td className="px-4 py-2.5 text-right text-muted-foreground">{row.date}</td>
                        <td className="px-4 py-2.5 text-center">
                          {/* @ts-ignore */}
                          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase">{row.method}</span>
                        </td>
                      </tr>
                    ))}
                    {getTransactionData().length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-4 py-10 text-center text-muted-foreground">
                          No transactions match filters.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto border border-border rounded-xl">
                <table className="w-full text-left text-xs whitespace-nowrap">
                  <thead className="bg-muted/40 sticky top-0 border-b border-border">
                    <tr>
                      <th className="px-4 py-3 font-semibold text-muted-foreground">Student Name</th>
                      <th className="px-4 py-3 font-semibold text-muted-foreground">Class</th>
                      <th className="px-4 py-3 font-semibold text-muted-foreground">Payment Plan</th>
                      <th className="px-4 py-3 font-semibold text-muted-foreground text-right">
                        {drawerType === 'CoachingValue' || drawerType === 'LTV' ? 'Joined Date' : drawerType === 'Remaining' ? 'Next Due Date' : 'Due Date'}
                      </th>
                      <th className="px-4 py-3 font-semibold text-muted-foreground text-right">
                        {drawerType === 'CoachingValue' || drawerType === 'LTV' || drawerType === 'Remaining' ? 'Agreed Fee' : 'Due Amount'}
                      </th>
                      <th className="px-4 py-3 font-semibold text-muted-foreground text-right">
                        {drawerType === 'CoachingValue' || drawerType === 'LTV' || drawerType === 'Remaining' ? 'Paid Till Now' : 'Amount Paid'}
                      </th>
                      <th className="px-4 py-3 font-semibold text-muted-foreground text-right">Remaining</th>
                      <th className="px-4 py-3 font-semibold text-muted-foreground text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {getDrawerData().map((row, index) => (
                      <tr key={row.id + '-' + index} className="hover:bg-muted/20">
                        <td className="px-4 py-2.5 font-semibold text-foreground">{row.studentName}</td>
                        <td className="px-4 py-2.5 text-muted-foreground">Class {row.studentClass}</td>
                        <td className="px-4 py-2.5">
                          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase">
                            {row.paymentType}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right text-muted-foreground">{row.dueDate}</td>
                        <td className="px-4 py-2.5 text-right font-medium text-foreground">{formatINR(row.dueAmount)}</td>
                        <td className="px-4 py-2.5 text-right text-success">{formatINR(row.paidAmount)}</td>
                        <td className="px-4 py-2.5 text-right font-semibold text-warning-foreground">
                          {formatINR(row.remainingAmount)}
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          <span
                            className={cn(
                              'rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider',
                              row.status === 'paid' || row.status === 'active'
                                ? 'bg-success/10 text-success'
                                : row.status === 'partial'
                                ? 'bg-warning/10 text-warning-foreground'
                                : 'bg-destructive/10 text-destructive'
                            )}
                          >
                            {row.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                    {getDrawerData().length === 0 && (
                      <tr>
                        <td colSpan={8} className="px-4 py-10 text-center text-muted-foreground">
                          No student records match filters.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}

            <div className="mt-4 flex justify-end gap-2 border-t border-border pt-3">
              <button
                type="button"
                onClick={() => setDrawerType(null)}
                className="h-10 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground hover:opacity-90"
              >
                Close Details
              </button>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
