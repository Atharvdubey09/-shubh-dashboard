'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { ArrowUpRight, CircleAlert, CircleCheck, Lock, TrendingUp, CalendarClock, ReceiptText, Gem } from 'lucide-react'
import { Card, Avatar } from '@/components/ui-bits'
import { IncomeChart } from '@/components/dashboard/income-chart'
import { TodayTasks } from '@/components/dashboard/today-tasks'
import { CashBalanceCard } from '@/components/dashboard/cash-balance-card'
import { useAppData } from '@/components/state/app-data-provider'
import { formatINR } from '@/lib/domain'
import { cn } from '@/lib/utils'

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
  } = useAppData()
  const { userRole } = useAuth()
  const [unlockOpen, setUnlockOpen] = useState(false)
  const [unlockPassword, setUnlockPassword] = useState('')
  const [unlockError, setUnlockError] = useState<string | null>(null)

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
    let list = [...payments]

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
                   <p className="font-semibold text-xs uppercase tracking-wider text-slate-400">Net Profit</p>
                   <TrendingUp className="h-4 w-4 text-emerald-400" strokeWidth={2} />
                 </div>
                 <div className="mt-4">
                   <p className="tabular text-3xl font-bold tracking-tight">{formatINR(stats.netProfit)}</p>
                   <p className="mt-1 text-xs text-slate-400 font-medium">Month-to-date earnings</p>
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
                  <p className="text-2xl font-bold text-white tabular-nums">{formatINR(stats.totalCoachingFeeValue - stats.totalRemainingRevenue)}</p>
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
