'use client'

import { useEffect, useState, useMemo } from 'react'
import { useAppData } from '@/components/state/app-data-provider'
import { useAuth } from '@/components/state/auth-provider'
import {
  subscribePlannedIncome,
  subscribePlannedExpenses,
  subscribeWallets,
  subscribeLedger,
  subscribeWalletConfig,
  createPlannedIncome,
  createPlannedExpense,
  deletePlannedIncome,
  deletePlannedExpense,
  PlannedIncome,
  PlannedExpense,
  Wallet,
  LedgerEntry
} from '@/lib/firestore'
import {
  Calendar,
  Lock,
  Unlock,
  AlertTriangle,
  ArrowUpRight,
  ArrowDownLeft,
  X,
  FileSpreadsheet,
  Download,
  Info,
  TrendingUp,
  RefreshCw,
  Sparkles,
  ShieldCheck,
  Plus,
  Coins,
  Trash2
} from 'lucide-react'
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  BarChart,
  Bar,
  CartesianGrid,
  Legend
} from 'recharts'
import { Card } from '@/components/ui-bits'

type ForecastPeriod = 'today' | '7days' | '15days' | '30days' | '90days' | 'custom'

export default function CashFlowForecastPage() {
  const { students, stats, payments, expenses: dbExpenses } = useAppData()
  const { user, userRole } = useAuth()
  const userName = user?.displayName || user?.email || 'Authorized User'
  const isAuthorizedToManage = userRole === 'Owner' || userRole === 'Admin'

  // DB Subscriptions State
  const [plannedIncome, setPlannedIncome] = useState<PlannedIncome[]>([])
  const [plannedExpenses, setPlannedExpenses] = useState<PlannedExpense[]>([])
  const [wallets, setWallets] = useState<Wallet[]>([])
  const [ledger, setLedger] = useState<LedgerEntry[]>([])
  const [walletConfig, setWalletConfig] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  // Forecast filters & UI controls
  const [forecastPeriod, setForecastPeriod] = useState<ForecastPeriod>('30days')
  const [startDateStr, setStartDateStr] = useState<string>('')
  const [endDateStr, setEndDateStr] = useState<string>('')
  
  // Custom Emergency Reserve amount
  const [emergencyReserve, setEmergencyReserve] = useState<number>(25000)

  // planned income/expense modal states
  const [showInflowModal, setShowInflowModal] = useState(false)
  const [showOutflowModal, setShowOutflowModal] = useState(false)
  const [inflowForm, setInflowForm] = useState({ title: '', amount: '', date: '', category: 'Fees', notes: '' })
  const [outflowForm, setOutflowForm] = useState({ title: '', amount: '', date: '', category: 'Salary' as any, notes: '' })
  const [formError, setFormError] = useState('')
  const [formBusy, setFormBusy] = useState(false)

  // Filters for listings
  const [filterCategory, setFilterCategory] = useState<string>('All')
  const [filterClass, setFilterClass] = useState<string>('All')

  // Subscriptions setup
  useEffect(() => {
    // Set custom date default
    const today = new Date()
    setStartDateStr(today.toISOString().slice(0, 10))
    const future30 = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000)
    setEndDateStr(future30.toISOString().slice(0, 10))

    let unsubIncome = subscribePlannedIncome((data) => {
      setPlannedIncome(data)
      setLoading(false)
    })
    let unsubExpenses = subscribePlannedExpenses((data) => setPlannedExpenses(data))
    let unsubWallets = subscribeWallets((data) => setWallets(data))
    let unsubLedger = subscribeLedger((data) => setLedger(data))
    let unsubConfig = subscribeWalletConfig((data) => setWalletConfig(data))

    return () => {
      unsubIncome()
      unsubExpenses()
      unsubWallets()
      unsubLedger()
      unsubConfig()
    }
  }, [])

  // 1. Current Wallet Cash Balance
  const currentCashBalance = useMemo(() => {
    return wallets.reduce((sum, w) => sum + (w.balance || 0), 0)
  }, [wallets])

  // 2. Projections Range boundary
  const dateRange = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    
    let daysCount = 30
    if (forecastPeriod === 'today') daysCount = 0
    else if (forecastPeriod === '7days') daysCount = 7
    else if (forecastPeriod === '15days') daysCount = 15
    else if (forecastPeriod === '30days') daysCount = 30
    else if (forecastPeriod === '90days') daysCount = 90

    let start = today
    let end = new Date(today.getTime() + daysCount * 24 * 60 * 60 * 1000)

    if (forecastPeriod === 'custom' && startDateStr && endDateStr) {
      start = new Date(startDateStr)
      end = new Date(endDateStr)
    }

    const startISO = start.toISOString().slice(0, 10)
    const endISO = end.toISOString().slice(0, 10)

    return { startISO, endISO, daysCount }
  }, [forecastPeriod, startDateStr, endDateStr])

  // 3. Expected Income calculations
  // Includes: Pending Student Fees (upcomingInstallments due in range), and planned manual inflows in range
  const expectedCollections = useMemo(() => {
    // 3a. Active students pending fees matching due dates in range
    let studentDues = 0
    students.forEach(s => {
      if (s.status !== 'active') return
      s.feeSchedule?.forEach((item: any) => {
        if (item.status !== 'paid' && item.dueDate >= dateRange.startISO && item.dueDate <= dateRange.endISO) {
          studentDues += item.amount - (item.paidAmount || 0)
        }
      })
    })

    // 3b. Planned future manual income in range
    const plannedInflows = plannedIncome
      .filter(pi => pi.date >= dateRange.startISO && pi.date <= dateRange.endISO)
      .reduce((sum, pi) => sum + pi.amount, 0)

    return {
      studentDues,
      plannedInflows,
      total: studentDues + plannedInflows
    }
  }, [students, plannedIncome, dateRange])

  // 4. Expected Expenses calculations
  // Includes: Recurring expenses in range, and planned manual outflow list in range
  const expectedOutflows = useMemo(() => {
    // 4a. Db Expenses registered in range
    const dbOutflows = dbExpenses
      .filter(e => e.status !== 'paid' && e.date >= dateRange.startISO && e.date <= dateRange.endISO)
      .reduce((sum, e) => sum + e.amount, 0)

    // 4b. Planned future manual expenses in range
    const plannedOutflows = plannedExpenses
      .filter(pe => pe.date >= dateRange.startISO && pe.date <= dateRange.endISO)
      .reduce((sum, pe) => sum + pe.amount, 0)

    return {
      dbOutflows,
      plannedOutflows,
      total: dbOutflows + plannedOutflows
    }
  }, [dbExpenses, plannedExpenses, dateRange])

  // 5. Projected final balance
  const projectedBalance = currentCashBalance + expectedCollections.total - expectedOutflows.total

  // 6. Safe to Spend Calculations
  const safeSpending = useMemo(() => {
    const available = currentCashBalance
    const safeToSpend = Math.max(available - emergencyReserve - expectedOutflows.total, 0)
    const isUnsafe = available < (emergencyReserve + expectedOutflows.total)
    return {
      available,
      safeToSpend,
      isUnsafe
    }
  }, [currentCashBalance, emergencyReserve, expectedOutflows])

  // 7. Timeline data for Recharts Graph (Generates day-by-day balance projections)
  const forecastTimeline = useMemo(() => {
    const start = new Date(dateRange.startISO)
    const end = new Date(dateRange.endISO)
    const timelineList: Array<{ date: string; formatted: string; balance: number; income: number; expense: number }> = []

    let runningBalance = currentCashBalance
    const tempDate = new Date(start)

    // Helper map of planned manual items by date
    const plannedIncMap = plannedIncome.reduce((acc, pi) => {
      acc[pi.date] = (acc[pi.date] || 0) + pi.amount
      return acc
    }, {} as Record<string, number>)

    const plannedExpMap = plannedExpenses.reduce((acc, pe) => {
      acc[pe.date] = (acc[pe.date] || 0) + pe.amount
      return acc
    }, {} as Record<string, number>)

    // Helper map of student dues by date
    const studentDuesMap: Record<string, number> = {}
    students.forEach(s => {
      if (s.status !== 'active') return
      s.feeSchedule?.forEach((item: any) => {
        if (item.status !== 'paid') {
          studentDuesMap[item.dueDate] = (studentDuesMap[item.dueDate] || 0) + (item.amount - (item.paidAmount || 0))
        }
      })
    })

    // Helper map of db unpaid expenses
    const dbExpensesMap = dbExpenses.reduce((acc, e) => {
      if (e.status !== 'paid') {
        acc[e.date] = (acc[e.date] || 0) + e.amount
      }
      return acc
    }, {} as Record<string, number>)

    // Loop through each day in the range
    while (tempDate <= end) {
      const iso = tempDate.toISOString().slice(0, 10)
      const dayIncome = (plannedIncMap[iso] || 0) + (studentDuesMap[iso] || 0)
      const dayExpense = (plannedExpMap[iso] || 0) + (dbExpensesMap[iso] || 0)

      runningBalance = runningBalance + dayIncome - dayExpense

      timelineList.push({
        date: iso,
        formatted: tempDate.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }),
        balance: runningBalance,
        income: dayIncome,
        expense: dayExpense
      })

      tempDate.setDate(tempDate.getDate() + 1)
    }

    return timelineList
  }, [dateRange, currentCashBalance, plannedIncome, plannedExpenses, students, dbExpenses])

  // 8. Cash Deficit Alert Check
  const deficitAlert = useMemo(() => {
    // Find the first day where balance drops below 0
    const deficitDay = forecastTimeline.find(d => d.balance < 0)
    if (!deficitDay) return null

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const diffTime = Math.abs(new Date(deficitDay.date).getTime() - today.getTime())
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

    return {
      daysRemaining: diffDays,
      date: deficitDay.date,
      deficitAmount: Math.abs(deficitDay.balance)
    }
  }, [forecastTimeline])

  // 9. AI Insights Generation & Recommendations
  const insights = useMemo(() => {
    const list: string[] = []
    const recs: string[] = []

    // Insights
    if (projectedBalance > currentCashBalance) {
      list.push(`Expected net surplus of ₹${(projectedBalance - currentCashBalance).toLocaleString('en-IN')} in the selected period.`)
    } else if (projectedBalance < currentCashBalance) {
      list.push(`Projected outflow exceeds inflows by ₹${(currentCashBalance - projectedBalance).toLocaleString('en-IN')}.`)
    }

    // Check upcoming planned items
    const upcomingRent = plannedExpenses.find(pe => pe.category === 'Rent')
    if (upcomingRent) {
      list.push(`Rent payout of ₹${upcomingRent.amount.toLocaleString('en-IN')} planned on ${upcomingRent.date}.`)
    }

    const upcomingSalary = plannedExpenses.find(pe => pe.category === 'Salary')
    if (upcomingSalary) {
      list.push(`Salary payouts of ₹${upcomingSalary.amount.toLocaleString('en-IN')} planned on ${upcomingSalary.date}.`)
    }

    const outstandingDues = expectedCollections.studentDues
    if (outstandingDues > 0) {
      list.push(`₹${outstandingDues.toLocaleString('en-IN')} pending in active student installments for this period.`)
      recs.push(`Proactively collect pending dues from students before your upcoming expense dates.`)
    }

    // Deficit recs
    if (deficitAlert) {
      recs.push(`CRITICAL: Delay non-essential software or maintenance purchases to avoid a cash deficit.`)
      recs.push(`Maintain an emergency wallet reserve of at least ₹${emergencyReserve.toLocaleString('en-IN')}.`)
    } else {
      recs.push(`Safe spending limits are healthy. You may invest up to ₹${safeSpending.safeToSpend.toLocaleString('en-IN')} without breaching reserves.`)
    }

    return { list, recs }
  }, [projectedBalance, currentCashBalance, plannedExpenses, expectedCollections, deficitAlert, emergencyReserve, safeSpending])

  // 10. Risk Rating Level
  const riskStatus = useMemo(() => {
    if (deficitAlert) return { level: 'Risk', color: 'text-rose-500 bg-rose-500/10 border-rose-500/20', dot: '🔴' }
    if (safeSpending.isUnsafe) return { level: 'Watch', color: 'text-amber-500 bg-amber-500/10 border-amber-500/20', dot: '🟡' }
    return { level: 'Healthy', color: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20', dot: '🟢' }
  }, [deficitAlert, safeSpending])

  // 11. Form handlers
  const handleInflowSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError('')
    setFormBusy(true)
    try {
      if (!isAuthorizedToManage) {
        throw new Error('Unauthorized: Only Owners or Admins can register planned income.')
      }
      const amount = Number(inflowForm.amount)
      if (isNaN(amount) || amount <= 0) throw new Error('Please enter a valid amount.')
      if (!inflowForm.title || !inflowForm.date) throw new Error('Title and date are required fields.')

      await createPlannedIncome({
        title: inflowForm.title,
        amount,
        date: inflowForm.date,
        category: inflowForm.category,
        notes: inflowForm.notes,
        createdBy: userName
      })

      setShowInflowModal(false)
      setInflowForm({ title: '', amount: '', date: '', category: 'Fees', notes: '' })
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to save planned income.')
    } finally {
      setFormBusy(false)
    }
  }

  const handleOutflowSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError('')
    setFormBusy(true)
    try {
      if (!isAuthorizedToManage) {
        throw new Error('Unauthorized: Only Owners or Admins can register planned expenses.')
      }
      const amount = Number(outflowForm.amount)
      if (isNaN(amount) || amount <= 0) throw new Error('Please enter a valid amount.')
      if (!outflowForm.title || !outflowForm.date) throw new Error('Title and date are required fields.')

      await createPlannedExpense({
        title: outflowForm.title,
        amount,
        date: outflowForm.date,
        category: outflowForm.category,
        notes: outflowForm.notes,
        createdBy: userName
      })

      setShowOutflowModal(false)
      setOutflowForm({ title: '', amount: '', date: '', category: 'Salary', notes: '' })
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to save planned expense.')
    } finally {
      setFormBusy(false)
    }
  }

  const handleDeleteInflow = async (id: string) => {
    if (!window.confirm('Delete this planned income item?')) return
    try {
      await deletePlannedIncome(id, userName)
    } catch (err) {
      alert('Delete failed: ' + (err instanceof Error ? err.message : 'Error'))
    }
  }

  const handleDeleteOutflow = async (id: string) => {
    if (!window.confirm('Delete this planned expense item?')) return
    try {
      await deletePlannedExpense(id, userName)
    } catch (err) {
      alert('Delete failed: ' + (err instanceof Error ? err.message : 'Error'))
    }
  }

  // 12. Exports
  const handleCSVExport = () => {
    const headers = 'Date,Projected Cash Balance,Expected Income,Expected Expense\n'
    const rows = forecastTimeline
      .map(
        (t) =>
          `"${t.date}",${t.balance},${t.income},${t.expense}`
      )
      .join('\n')

    const blob = new Blob([headers + rows], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.setAttribute('download', 'cash_flow_forecast_timeline.csv')
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center text-muted-foreground animate-pulse">
        <RefreshCw className="mr-3 h-5 w-5 animate-spin text-primary" />
        <span>Generating Forecast Scenarios...</span>
      </div>
    )
  }

  return (
    <div className="space-y-8 animate-fade-up">
      {/* Sub-tab navigation switch */}
      <div className="flex gap-2 bg-muted/65 p-1 rounded-xl w-fit text-xs font-bold border border-border/40">
        <a href="/finance" className="px-4 py-1.5 rounded-lg text-muted-foreground hover:text-foreground transition-colors">
          Wallet & Ledger
        </a>
        <a href="/finance/closing" className="px-4 py-1.5 rounded-lg text-muted-foreground hover:text-foreground transition-colors">
          Daily Closing
        </a>
        <a href="/finance/forecast" className="px-4 py-1.5 rounded-lg bg-background shadow text-foreground transition-all">
          Cash Forecast
        </a>
      </div>

      {/* Header controls */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-widest text-indigo-500">Intelligent Liquidity Forecasting</span>
          <h1 className="text-3xl font-extrabold tracking-tight text-foreground">Cash Flow Forecast</h1>
          <p className="text-sm text-muted-foreground">Predict future cash positions, assess deficit alerts, and schedule planned payouts.</p>
        </div>

        {/* Forecast Period selectors */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex bg-muted/50 p-1 rounded-xl border border-border/60 text-xs font-semibold">
            {(['today', '7days', '15days', '30days', '90days', 'custom'] as ForecastPeriod[]).map((period) => (
              <button
                key={period}
                onClick={() => setForecastPeriod(period)}
                className={`px-3 py-1.5 rounded-lg capitalize transition-all ${forecastPeriod === period ? 'bg-background shadow text-foreground font-bold' : 'text-muted-foreground hover:text-foreground'}`}
              >
                {period === '7days' ? '7 Days' : period === '15days' ? '15 Days' : period === '30days' ? '30 Days' : period === '90days' ? '90 Days' : period}
              </button>
            ))}
          </div>

          {forecastPeriod === 'custom' && (
            <div className="flex items-center gap-2 bg-card p-1 border border-border rounded-xl">
              <input
                type="date"
                value={startDateStr}
                onChange={(e) => setStartDateStr(e.target.value)}
                className="bg-transparent text-xs font-bold outline-none px-2 h-7"
              />
              <span className="text-[10px] text-muted-foreground">to</span>
              <input
                type="date"
                value={endDateStr}
                onChange={(e) => setEndDateStr(e.target.value)}
                className="bg-transparent text-xs font-bold outline-none px-2 h-7"
              />
            </div>
          )}
        </div>
      </div>

      {/* Deficit Alarm warning banner */}
      {deficitAlert && (
        <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 flex flex-col md:flex-row md:items-center justify-between gap-3 animate-pulse shadow-sm">
          <div className="flex items-start gap-3 text-xs">
            <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
            <div>
              <span className="font-extrabold uppercase block tracking-wider text-[10px]">🔴 Cash Deficit Warning</span>
              <p className="mt-0.5">
                Expected cash shortage in <strong>{deficitAlert.daysRemaining} days</strong> ({deficitAlert.date}). 
                Estimated shortage sum: <strong>₹{deficitAlert.deficitAmount.toLocaleString('en-IN')}</strong>.
              </p>
            </div>
          </div>
          <button
            onClick={() => setShowOutflowModal(true)}
            className="text-[10px] font-extrabold uppercase px-3 py-1.5 bg-rose-500 text-white rounded-lg hover:opacity-90 transition-opacity"
          >
            Adjust Outflows
          </button>
        </div>
      )}

      {/* Metrics Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4">
        {/* Current Cash */}
        <div className="bg-card border border-border/80 rounded-2xl p-5 flex flex-col justify-between shadow-sm">
          <span className="text-xs font-bold text-muted-foreground block mb-2">Current Cash</span>
          <h3 className="text-2xl font-extrabold tracking-tight text-foreground">
            ₹{currentCashBalance.toLocaleString('en-IN')}
          </h3>
          <span className="text-[9px] text-muted-foreground block mt-1">Total in wallets</span>
        </div>

        {/* Expected Collections */}
        <div className="bg-card border border-border/80 rounded-2xl p-5 flex flex-col justify-between shadow-sm">
          <span className="text-xs font-bold text-muted-foreground block mb-2">Expected Income</span>
          <h3 className="text-2xl font-extrabold tracking-tight text-emerald-500">
            +₹{expectedCollections.total.toLocaleString('en-IN')}
          </h3>
          <span className="text-[9px] text-muted-foreground block mt-1">Pending fees & planned</span>
        </div>

        {/* Expected Expenses */}
        <div className="bg-card border border-border/80 rounded-2xl p-5 flex flex-col justify-between shadow-sm">
          <span className="text-xs font-bold text-muted-foreground block mb-2">Expected Expenses</span>
          <h3 className="text-2xl font-extrabold tracking-tight text-rose-500">
            -₹{expectedOutflows.total.toLocaleString('en-IN')}
          </h3>
          <span className="text-[9px] text-muted-foreground block mt-1">Salaries, bills, rent</span>
        </div>

        {/* Expected Profit */}
        <div className="bg-card border border-border/80 rounded-2xl p-5 flex flex-col justify-between shadow-sm">
          <span className="text-xs font-bold text-muted-foreground block mb-2">Expected Net Profit</span>
          <h3 className="text-2xl font-extrabold tracking-tight text-foreground">
            ₹{(expectedCollections.total - expectedOutflows.total).toLocaleString('en-IN')}
          </h3>
          <span className="text-[9px] text-muted-foreground block mt-1">Surplus / Deficit</span>
        </div>

        {/* Projected Cash */}
        <div className="bg-gradient-to-br from-indigo-50 to-indigo-100/30 dark:from-indigo-950/20 dark:to-indigo-900/10 border border-indigo-200/50 dark:border-indigo-800/30 rounded-2xl p-5 flex flex-col justify-between shadow-sm">
          <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 block mb-2">Projected Cash</span>
          <h3 className="text-2xl font-extrabold tracking-tight text-indigo-600 dark:text-indigo-400">
            ₹{projectedBalance.toLocaleString('en-IN')}
          </h3>
          <span className="text-[9px] text-indigo-500/80 font-bold block mt-1">Estimated final balance</span>
        </div>

        {/* Forecast Status */}
        <div className={`border rounded-2xl p-5 flex flex-col justify-between shadow-sm ${riskStatus.color}`}>
          <span className="text-xs font-bold block mb-2">Forecast Status</span>
          <h3 className="text-2xl font-extrabold tracking-tight">
            {riskStatus.dot} {riskStatus.level}
          </h3>
          <span className="text-[9px] block mt-1">Liquidity risk level</span>
        </div>
      </div>

      {/* Safety Spending Limits panel */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 bg-muted/20 p-5 rounded-2xl border border-border/40">
        <div className="space-y-1">
          <h4 className="text-xs font-bold text-foreground">Safe Spend Calculator</h4>
          <p className="text-[10px] text-muted-foreground">Maintains emergency liquidity reserve thresholds.</p>
        </div>

        {/* Emergency Reserve input */}
        <div className="bg-card px-4 py-2 border border-border rounded-xl flex items-center justify-between">
          <span className="text-[10px] font-semibold text-muted-foreground uppercase">Reserve Set</span>
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-bold text-foreground">₹</span>
            <input
              type="number"
              value={emergencyReserve}
              onChange={(e) => setEmergencyReserve(Number(e.target.value))}
              className="bg-transparent text-xs font-extrabold text-foreground w-20 text-right outline-none"
            />
          </div>
        </div>

        {/* Available Money */}
        <div className="bg-card px-4 py-2 border border-border rounded-xl flex items-center justify-between">
          <span className="text-[10px] font-semibold text-muted-foreground uppercase">Available Funds</span>
          <span className="text-xs font-extrabold text-foreground">₹{safeSpending.available.toLocaleString('en-IN')}</span>
        </div>

        {/* Safe to Spend result */}
        <div className={`px-4 py-2 border rounded-xl flex items-center justify-between ${safeSpending.isUnsafe ? 'bg-red-500/10 border-red-500/20 text-red-500' : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400'}`}>
          <span className="text-[10px] font-semibold uppercase">Safe to Spend</span>
          <span className="text-xs font-extrabold">₹{safeSpending.safeToSpend.toLocaleString('en-IN')}</span>
        </div>
      </div>

      {/* Main Section layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fade-up [animation-delay:60ms]">

        {/* Left/Middle: Graphs & List Editors */}
        <div className="lg:col-span-2 space-y-6">
          {/* Projections curve graph */}
          <Card className="p-6 border border-border bg-card/60 backdrop-blur-md space-y-4">
            <div>
              <h3 className="text-sm font-bold text-foreground">Liquidity Projection Curve</h3>
              <p className="text-xs text-muted-foreground">Daily balance forecast trajectory showing potential breaches.</p>
            </div>
            
            <div className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={forecastTimeline}>
                  <XAxis dataKey="formatted" fontSize={9} stroke="var(--color-muted-foreground)" />
                  <YAxis fontSize={9} stroke="var(--color-muted-foreground)" />
                  <Tooltip
                    formatter={(val) => `₹${Number(val).toLocaleString('en-IN')}`}
                    contentStyle={{ backgroundColor: 'var(--color-popover)', borderColor: 'var(--color-border)', borderRadius: '12px' }}
                  />
                  <Area type="monotone" dataKey="balance" stroke="#6366f1" fill="#6366f1" fillOpacity={0.06} strokeWidth={2.5} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>

          {/* Planned ledger inflows/outflows schedules */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* Planned Inflows List */}
            <Card className="p-5 border border-border bg-card space-y-4">
              <div className="flex items-center justify-between border-b border-border/40 pb-2">
                <div>
                  <h4 className="text-xs font-bold text-foreground">Planned Income</h4>
                  <p className="text-[10px] text-muted-foreground">Expected manual inflows Scheduled</p>
                </div>
                {isAuthorizedToManage && (
                  <button
                    onClick={() => setShowInflowModal(true)}
                    className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-500 hover:bg-indigo-500/20 transition-colors"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              <div className="space-y-2 max-h-[220px] overflow-y-auto">
                {plannedIncome.length === 0 ? (
                  <p className="text-[11px] text-muted-foreground">No planned manual inflows scheduled.</p>
                ) : (
                  plannedIncome.map(pi => (
                    <div key={pi.id} className="p-3 bg-muted/20 border border-border/40 rounded-xl flex items-center justify-between text-xs hover:border-indigo-500/35 transition-colors">
                      <div className="space-y-0.5">
                        <span className="font-bold text-foreground">{pi.title}</span>
                        <p className="text-[9px] text-muted-foreground">{pi.date} • {pi.category}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-extrabold text-emerald-500">+₹{pi.amount.toLocaleString('en-IN')}</span>
                        {isAuthorizedToManage && (
                          <button onClick={() => handleDeleteInflow(pi.id)} className="text-muted-foreground hover:text-rose-500">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </Card>

            {/* Planned Outflows List */}
            <Card className="p-5 border border-border bg-card space-y-4">
              <div className="flex items-center justify-between border-b border-border/40 pb-2">
                <div>
                  <h4 className="text-xs font-bold text-foreground">Planned Expenses</h4>
                  <p className="text-[10px] text-muted-foreground">Future outflows Scheduled</p>
                </div>
                {isAuthorizedToManage && (
                  <button
                    onClick={() => setShowOutflowModal(true)}
                    className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-500 hover:bg-indigo-500/20 transition-colors"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              <div className="space-y-2 max-h-[220px] overflow-y-auto">
                {plannedExpenses.length === 0 ? (
                  <p className="text-[11px] text-muted-foreground">No planned future expenses scheduled.</p>
                ) : (
                  plannedExpenses.map(pe => (
                    <div key={pe.id} className="p-3 bg-muted/20 border border-border/40 rounded-xl flex items-center justify-between text-xs hover:border-indigo-500/35 transition-colors">
                      <div className="space-y-0.5">
                        <span className="font-bold text-foreground">{pe.title}</span>
                        <p className="text-[9px] text-muted-foreground">{pe.date} • {pe.category}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-extrabold text-rose-500">-₹{pe.amount.toLocaleString('en-IN')}</span>
                        {isAuthorizedToManage && (
                          <button onClick={() => handleDeleteOutflow(pe.id)} className="text-muted-foreground hover:text-rose-500">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </Card>

          </div>
        </div>

        {/* Right Panel: AI insights, Reports and Reserve settings */}
        <div className="space-y-6">
          {/* AI Insights & recommendations panel */}
          <Card className="p-6 border border-border bg-card/60 backdrop-blur-md space-y-5">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-indigo-500" />
              <div>
                <h3 className="text-sm font-bold text-foreground">AI Forecast Insights</h3>
                <p className="text-[10px] text-muted-foreground">Smart calculations based on historical fee schedules.</p>
              </div>
            </div>

            <div className="space-y-3 text-[11px]">
              {insights.list.map((insight, idx) => (
                <div key={idx} className="p-3 rounded-xl bg-indigo-500/5 border border-indigo-500/10 text-indigo-700 dark:text-indigo-400 font-medium">
                  {insight}
                </div>
              ))}

              {insights.recs.length > 0 && (
                <div className="space-y-2 pt-2 border-t border-border/40">
                  <span className="font-bold text-foreground block">Actionable Recommendations:</span>
                  {insights.recs.map((rec, idx) => (
                    <div key={idx} className="flex gap-2 text-muted-foreground leading-relaxed">
                      <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-500" />
                      <span>{rec}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Card>

          {/* Export Report widget */}
          <Card className="p-6 border border-border bg-card/60 backdrop-blur-md space-y-4">
            <div>
              <h3 className="text-sm font-bold text-foreground mb-1">Forecast Export</h3>
              <p className="text-xs text-muted-foreground">Generate audit reports for future cash flows.</p>
            </div>
            
            <button
              onClick={handleCSVExport}
              className="w-full h-10 inline-flex items-center justify-between rounded-xl border border-border bg-card hover:bg-muted/40 text-xs font-bold px-4 transition-colors"
            >
              <span className="flex items-center gap-2">
                <FileSpreadsheet className="h-4 w-4 text-emerald-600" /> Export Cash Projections (CSV)
              </span>
              <Download className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          </Card>
        </div>
      </div>

      {/* 5. Add Planned Inflow Modal */}
      {showInflowModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
          <div className="bg-card border border-border rounded-2xl w-full max-w-md p-6 shadow-xl animate-scale-up space-y-4">
            <div className="flex items-center justify-between border-b border-border/40 pb-3">
              <h3 className="text-base font-extrabold text-foreground flex items-center gap-2">
                <ArrowUpRight className="h-4 w-4 text-emerald-500" /> Schedule Planned Income
              </h3>
              <button onClick={() => setShowInflowModal(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleInflowSubmit} className="space-y-4">
              <div className="space-y-2">
                <label className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground">Income Title</label>
                <input
                  type="text"
                  placeholder="E.g. Expected new batch admissions, manual sponsorship"
                  value={inflowForm.title}
                  onChange={(e) => setInflowForm({ ...inflowForm, title: e.target.value })}
                  className="h-10 w-full rounded-xl border border-border bg-muted/40 px-3 text-sm outline-none focus:border-indigo-500 focus:bg-card transition-all"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground">Expected Amount (₹)</label>
                  <input
                    type="number"
                    placeholder="Enter amount"
                    value={inflowForm.amount}
                    onChange={(e) => setInflowForm({ ...inflowForm, amount: e.target.value })}
                    className="h-10 w-full rounded-xl border border-border bg-muted/40 px-3 text-sm outline-none focus:border-indigo-500 focus:bg-card transition-all"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground">Expected Date</label>
                  <input
                    type="date"
                    value={inflowForm.date}
                    onChange={(e) => setInflowForm({ ...inflowForm, date: e.target.value })}
                    className="h-10 w-full rounded-xl border border-border bg-muted/40 px-3 text-sm outline-none focus:border-indigo-500 focus:bg-card transition-all"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground">Category</label>
                <select
                  value={inflowForm.category}
                  onChange={(e) => setInflowForm({ ...inflowForm, category: e.target.value })}
                  className="h-10 w-full rounded-xl border border-border bg-muted/40 px-3 text-xs font-bold outline-none focus:border-indigo-500 focus:bg-card transition-all cursor-pointer"
                >
                  <option value="Fees">Fees & Installments</option>
                  <option value="Admission">Admissions</option>
                  <option value="Sponsorship">Sponsorships</option>
                  <option value="Other">Other Planned Income</option>
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground">Notes</label>
                <textarea
                  placeholder="Details or conditions..."
                  value={inflowForm.notes}
                  onChange={(e) => setInflowForm({ ...inflowForm, notes: e.target.value })}
                  className="w-full rounded-xl border border-border bg-muted/40 p-3 text-sm outline-none focus:border-indigo-500 focus:bg-card transition-all h-20 resize-none"
                />
              </div>

              {formError && <p className="text-xs font-bold text-red-500">{formError}</p>}

              <button
                type="submit"
                disabled={formBusy}
                className="h-10 w-full rounded-xl bg-primary text-xs font-bold text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                {formBusy ? 'Scheduling...' : 'Save Inflow'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* 6. Add Planned Outflow Modal */}
      {showOutflowModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
          <div className="bg-card border border-border rounded-2xl w-full max-w-md p-6 shadow-xl animate-scale-up space-y-4">
            <div className="flex items-center justify-between border-b border-border/40 pb-3">
              <h3 className="text-base font-extrabold text-foreground flex items-center gap-2">
                <ArrowDownLeft className="h-4 w-4 text-rose-500" /> Schedule Planned Expense
              </h3>
              <button onClick={() => setShowOutflowModal(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleOutflowSubmit} className="space-y-4">
              <div className="space-y-2">
                <label className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground">Expense Title</label>
                <input
                  type="text"
                  placeholder="E.g. Electricity bill, Rent payment, Teacher salaries"
                  value={outflowForm.title}
                  onChange={(e) => setOutflowForm({ ...outflowForm, title: e.target.value })}
                  className="h-10 w-full rounded-xl border border-border bg-muted/40 px-3 text-sm outline-none focus:border-indigo-500 focus:bg-card transition-all"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground">Expected Amount (₹)</label>
                  <input
                    type="number"
                    placeholder="Enter amount"
                    value={outflowForm.amount}
                    onChange={(e) => setOutflowForm({ ...outflowForm, amount: e.target.value })}
                    className="h-10 w-full rounded-xl border border-border bg-muted/40 px-3 text-sm outline-none focus:border-indigo-500 focus:bg-card transition-all"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground">Expected Date</label>
                  <input
                    type="date"
                    value={outflowForm.date}
                    onChange={(e) => setOutflowForm({ ...outflowForm, date: e.target.value })}
                    className="h-10 w-full rounded-xl border border-border bg-muted/40 px-3 text-sm outline-none focus:border-indigo-500 focus:bg-card transition-all"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground">Category</label>
                <select
                  value={outflowForm.category}
                  onChange={(e) => setOutflowForm({ ...outflowForm, category: e.target.value as any })}
                  className="h-10 w-full rounded-xl border border-border bg-muted/40 px-3 text-xs font-bold outline-none focus:border-indigo-500 focus:bg-card transition-all cursor-pointer"
                >
                  <option value="Salary">Salary Payout</option>
                  <option value="Rent">Rent</option>
                  <option value="Electricity">Electricity</option>
                  <option value="Internet">Internet</option>
                  <option value="Water">Water</option>
                  <option value="Maintenance">Maintenance</option>
                  <option value="Software">Software Subscription</option>
                  <option value="Other">Other Planned Expense</option>
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground">Notes</label>
                <textarea
                  placeholder="Details or conditions..."
                  value={outflowForm.notes}
                  onChange={(e) => setOutflowForm({ ...outflowForm, notes: e.target.value })}
                  className="w-full rounded-xl border border-border bg-muted/40 p-3 text-sm outline-none focus:border-indigo-500 focus:bg-card transition-all h-20 resize-none"
                />
              </div>

              {formError && <p className="text-xs font-bold text-red-500">{formError}</p>}

              <button
                type="submit"
                disabled={formBusy}
                className="h-10 w-full rounded-xl bg-primary text-xs font-bold text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                {formBusy ? 'Scheduling...' : 'Save Outflow'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
