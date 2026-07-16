'use client'

import { useEffect, useState, useMemo } from 'react'
import { useAppData } from '@/components/state/app-data-provider'
import { useAuth } from '@/components/state/auth-provider'
import {
  subscribeDailyClosing,
  subscribeDailyClosingLogs,
  subscribeWallets,
  subscribeLedger,
  subscribeWalletConfig,
  closeDailyDay,
  reopenDailyDay,
  DailyClosing,
  DailyClosingLog,
  Wallet,
  LedgerEntry
} from '@/lib/firestore'
import {
  Calendar,
  Lock,
  Unlock,
  ChevronRight,
  Info,
  ArrowUpRight,
  ArrowDownLeft,
  X,
  FileSpreadsheet,
  Download,
  AlertCircle,
  TrendingUp,
  RefreshCw,
  Clock,
  Coins
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
  CartesianGrid
} from 'recharts'
import { Card } from '@/components/ui-bits'

export default function DailyClosingPage() {
  const { students, stats } = useAppData()
  const { user, userRole } = useAuth()
  const userName = user?.displayName || user?.email || 'Authorized User'
  const isAuthorizedToManage = userRole === 'Owner' || userRole === 'Admin'

  // DB Subscriptions State
  const [closings, setClosings] = useState<DailyClosing[]>([])
  const [logs, setLogs] = useState<DailyClosingLog[]>([])
  const [wallets, setWallets] = useState<Wallet[]>([])
  const [ledger, setLedger] = useState<LedgerEntry[]>([])
  const [walletConfig, setWalletConfig] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  // Selected Date state
  const [selectedDate, setSelectedDate] = useState<string>('')

  // Modals & Forms UI State
  const [showCloseModal, setShowCloseModal] = useState(false)
  const [showReopenModal, setShowReopenModal] = useState(false)
  const [closingNotes, setClosingNotes] = useState('')
  const [reopenReason, setReopenReason] = useState('')
  const [formError, setFormError] = useState('')
  const [formBusy, setFormBusy] = useState(false)

  // Subscriptions setup
  useEffect(() => {
    // Set default date to today
    setSelectedDate(new Date().toISOString().slice(0, 10))

    let unsubClosing = subscribeDailyClosing((data) => {
      setClosings(data)
      setLoading(false)
    })
    let unsubLogs = subscribeDailyClosingLogs((data) => setLogs(data))
    let unsubWallets = subscribeWallets((data) => setWallets(data))
    let unsubLedger = subscribeLedger((data) => setLedger(data))
    let unsubConfig = subscribeWalletConfig((data) => setWalletConfig(data))

    return () => {
      unsubClosing()
      unsubLogs()
      unsubWallets()
      unsubLedger()
      unsubConfig()
    }
  }, [])

  // 1. Dynamic Metric Calculations for Selected Date
  const dateClosingInfo = useMemo(() => {
    return closings.find((c) => c.date === selectedDate) || null
  }, [closings, selectedDate])

  const dayLedger = useMemo(() => {
    return ledger.filter((l) => l.timestamp.startsWith(selectedDate))
  }, [ledger, selectedDate])

  // Opening Balance calculation
  const computedOpeningBalance = useMemo(() => {
    // Calculate opening balance based on all ledger activity before selectedDate
    const priorLedger = ledger.filter((l) => l.timestamp.slice(0, 10) < selectedDate)
    const ledgerOpeningSum = priorLedger.reduce((sum, l) => sum + l.amount, 0)
    
    // Add original system opening cash and bank balances
    const initialConfigCash = walletConfig?.openingCash || 0
    const initialConfigBank = walletConfig?.openingBank || 0

    return ledgerOpeningSum + initialConfigCash + initialConfigBank
  }, [ledger, selectedDate, walletConfig])

  // Collection Splits
  const cashCollection = useMemo(() => {
    return dayLedger
      .filter((l) => l.walletId === 'cash' && l.amount > 0 && l.type.includes('Fee'))
      .reduce((sum, l) => sum + l.amount, 0)
  }, [dayLedger])

  const bankCollection = useMemo(() => {
    return dayLedger
      .filter((l) => l.walletId === 'bank' && l.amount > 0 && l.type.includes('Fee'))
      .reduce((sum, l) => sum + l.amount, 0)
  }, [dayLedger])

  const razorpayCollection = useMemo(() => {
    return dayLedger
      .filter((l) => l.walletId === 'razorpay' && l.amount > 0 && l.type.includes('Fee'))
      .reduce((sum, l) => sum + l.amount, 0)
  }, [dayLedger])

  const totalCollection = cashCollection + bankCollection + razorpayCollection

  // Expense Splits
  const cashExpenses = useMemo(() => {
    return dayLedger
      .filter((l) => l.walletId === 'cash' && l.amount < 0 && l.type === 'Expense')
      .reduce((sum, l) => sum + Math.abs(l.amount), 0)
  }, [dayLedger])

  const bankExpenses = useMemo(() => {
    return dayLedger
      .filter((l) => l.walletId === 'bank' && l.amount < 0 && l.type === 'Expense')
      .reduce((sum, l) => sum + Math.abs(l.amount), 0)
  }, [dayLedger])

  const totalExpenses = cashExpenses + bankExpenses

  // Manual Adjustments
  const manualDeposits = useMemo(() => {
    return dayLedger
      .filter((l) => l.amount > 0 && l.type === 'Manual Deposit')
      .reduce((sum, l) => sum + l.amount, 0)
  }, [dayLedger])

  const manualWithdrawals = useMemo(() => {
    return dayLedger
      .filter((l) => l.amount < 0 && l.type === 'Manual Withdrawal')
      .reduce((sum, l) => sum + Math.abs(l.amount), 0)
  }, [dayLedger])

  const settlements = useMemo(() => {
    return dayLedger
      .filter((l) => l.type === 'Settlement' && l.amount > 0)
      .reduce((sum, l) => sum + l.amount, 0)
  }, [dayLedger])

  // Final Closing Calculation
  const computedClosingBalance =
    computedOpeningBalance +
    totalCollection +
    manualDeposits +
    settlements -
    totalExpenses -
    manualWithdrawals

  // 2. Analytics Aggregates
  const analytics = useMemo(() => {
    const historicalClosed = closings.filter((c) => c.status === 'closed')
    if (historicalClosed.length === 0) {
      return {
        avgCollection: 0,
        avgExpense: 0,
        highestCollDay: 'N/A',
        highestCollAmt: 0,
        highestExpDay: 'N/A',
        highestExpAmt: 0
      }
    }

    const totalColl = historicalClosed.reduce((sum, c) => sum + c.collection, 0)
    const totalExp = historicalClosed.reduce((sum, c) => sum + c.expenses, 0)

    const sortedColl = [...historicalClosed].sort((a, b) => b.collection - a.collection)
    const sortedExp = [...historicalClosed].sort((a, b) => b.expenses - a.expenses)

    return {
      avgCollection: totalColl / historicalClosed.length,
      avgExpense: totalExp / historicalClosed.length,
      highestCollDay: sortedColl[0]?.date || 'N/A',
      highestCollAmt: sortedColl[0]?.collection || 0,
      highestExpDay: sortedExp[0]?.date || 'N/A',
      highestExpAmt: sortedExp[0]?.expenses || 0
    }
  }, [closings])

  const trendsData = useMemo(() => {
    return [...closings]
      .reverse()
      .slice(-10)
      .map((c) => ({
        name: new Date(c.date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }),
        Collection: c.collection,
        Expenses: c.expenses,
        Profit: c.collection - c.expenses
      }))
  }, [closings])

  // 3. Handlers
  const handleCloseDaySubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError('')
    setFormBusy(true)
    try {
      if (!isAuthorizedToManage) {
        throw new Error('Unauthorized: Only Owners or Admins can close the business day.')
      }
      await closeDailyDay({
        date: selectedDate,
        openingBalance: computedOpeningBalance,
        collection: totalCollection,
        expenses: totalExpenses,
        deposits: manualDeposits + settlements,
        withdrawals: manualWithdrawals,
        closingBalance: computedClosingBalance,
        closedBy: userName,
        notes: closingNotes
      })
      setShowCloseModal(false)
      setClosingNotes('')
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to close day.')
    } finally {
      setFormBusy(false)
    }
  }

  const handleReopenDaySubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError('')
    setFormBusy(true)
    try {
      if (!isAuthorizedToManage) {
        throw new Error('Unauthorized: Only Owners or Admins can reopen the business day.')
      }
      if (!reopenReason.trim()) {
        throw new Error('Reason is required to reopen locked day.')
      }
      await reopenDailyDay({
        date: selectedDate,
        reopenedBy: userName,
        reason: reopenReason
      })
      setShowReopenModal(false)
      setReopenReason('')
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to reopen day.')
    } finally {
      setFormBusy(false)
    }
  }

  // 4. Report Exports
  const handleCSVExport = (type: 'closing' | 'ledger') => {
    let headers = ''
    let rows = ''
    let fileName = ''

    if (type === 'closing') {
      headers = 'Date,Opening Balance,Collections,Expenses,Deposits/Settlements,Withdrawals,Closing Balance,Status,Closed By,Closed At,Notes\n'
      rows = closings
        .map(
          (c) =>
            `"${c.date}",${c.openingBalance},${c.collection},${c.expenses},${c.deposits},${c.withdrawals},${c.closingBalance},"${c.status}","${c.closedBy || 'N/A'}","${c.closedAt || 'N/A'}","${c.notes || ''}"`
        )
        .join('\n')
      fileName = 'daily_closings_report.csv'
    } else {
      headers = 'Timestamp,Transaction ID,Wallet,Student,Type,Method,Source,Amount,Balance After,Created By,Notes\n'
      rows = ledger
        .map(
          (l) =>
            `"${l.timestamp}","${l.transactionId}","${l.walletId}","${l.studentName || ''}","${l.type}","${l.method || ''}","${l.source || ''}",${l.amount},${l.balanceAfter},"${l.createdBy}","${l.notes || ''}"`
        )
        .join('\n')
      fileName = 'ledger_transactions_export.csv'
    }

    const blob = new Blob([headers + rows], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.setAttribute('download', fileName)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const currentStatus = dateClosingInfo?.status || 'open'

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center text-muted-foreground animate-pulse">
        <RefreshCw className="mr-3 h-5 w-5 animate-spin text-primary" />
        <span>Loading Daily Closing System...</span>
      </div>
    )
  }

  return (
    <div className="space-y-8 animate-fade-up">
      {/* Tab switch navigation at top */}
      <div className="flex gap-2 bg-muted/65 p-1 rounded-xl w-fit text-xs font-bold border border-border/40">
        <a href="/finance" className="px-4 py-1.5 rounded-lg text-muted-foreground hover:text-foreground transition-colors">
          Wallet & Ledger
        </a>
        <a href="/finance/closing" className="px-4 py-1.5 rounded-lg bg-background shadow text-foreground transition-all">
          Daily Closing
        </a>
      </div>

      {/* 1. Header with Date Selector */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-widest text-indigo-500">ERP Accounting Audit</span>
          <h1 className="text-3xl font-extrabold tracking-tight text-foreground">Daily Closing</h1>
          <p className="text-sm text-muted-foreground">Audit collections, log adjustments, freeze daily financials, and export reports.</p>
        </div>

        {/* Date Selector and Lock indicator */}
        <div className="flex items-center gap-3">
          <div className="relative">
            <Calendar className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="h-10 rounded-xl border border-border bg-card pl-10 pr-4 text-xs font-bold outline-none focus:border-indigo-500 transition-colors cursor-pointer"
            />
          </div>

          {currentStatus === 'closed' ? (
            <span className="h-10 inline-flex items-center gap-1.5 px-3 rounded-xl text-xs font-bold bg-red-500/10 border border-red-500/20 text-red-500">
              <Lock className="h-3.5 w-3.5" /> Day Locked
            </span>
          ) : (
            <span className="h-10 inline-flex items-center gap-1.5 px-3 rounded-xl text-xs font-bold bg-emerald-500/10 border border-emerald-500/20 text-emerald-500">
              <Unlock className="h-3.5 w-3.5" /> Day Open
            </span>
          )}
        </div>
      </div>

      {/* 2. Top level calculations grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4">
        {/* Opening Cash */}
        <div className="bg-card border border-border/80 rounded-2xl p-5 flex flex-col justify-between shadow-sm">
          <span className="text-xs font-bold text-muted-foreground block mb-2">Opening Cash</span>
          <h3 className="text-2xl font-extrabold tracking-tight text-foreground">
            ₹{(dateClosingInfo?.openingBalance ?? computedOpeningBalance).toLocaleString('en-IN')}
          </h3>
          <span className="text-[9px] text-muted-foreground block mt-1">Starting balance</span>
        </div>

        {/* Today's Collection */}
        <div className="bg-card border border-border/80 rounded-2xl p-5 flex flex-col justify-between shadow-sm">
          <span className="text-xs font-bold text-muted-foreground block mb-2">Today's Collection</span>
          <h3 className="text-2xl font-extrabold tracking-tight text-emerald-500">
            ₹{(dateClosingInfo?.collection ?? totalCollection).toLocaleString('en-IN')}
          </h3>
          <span className="text-[9px] text-muted-foreground block mt-1">Cash, UPI, Razorpay</span>
        </div>

        {/* Today's Expense */}
        <div className="bg-card border border-border/80 rounded-2xl p-5 flex flex-col justify-between shadow-sm">
          <span className="text-xs font-bold text-muted-foreground block mb-2">Today's Expense</span>
          <h3 className="text-2xl font-extrabold tracking-tight text-rose-500">
            ₹{(dateClosingInfo?.expenses ?? totalExpenses).toLocaleString('en-IN')}
          </h3>
          <span className="text-[9px] text-muted-foreground block mt-1">Deducted from wallets</span>
        </div>

        {/* Manual Deposits */}
        <div className="bg-card border border-border/80 rounded-2xl p-5 flex flex-col justify-between shadow-sm">
          <span className="text-xs font-bold text-muted-foreground block mb-2">Manual Deposits</span>
          <h3 className="text-2xl font-extrabold tracking-tight text-foreground">
            ₹{(dateClosingInfo?.deposits ?? (manualDeposits + settlements)).toLocaleString('en-IN')}
          </h3>
          <span className="text-[9px] text-muted-foreground block mt-1">Adjustments & Settlements</span>
        </div>

        {/* Manual Withdrawals */}
        <div className="bg-card border border-border/80 rounded-2xl p-5 flex flex-col justify-between shadow-sm">
          <span className="text-xs font-bold text-muted-foreground block mb-2">Manual Withdrawals</span>
          <h3 className="text-2xl font-extrabold tracking-tight text-foreground">
            ₹{(dateClosingInfo?.withdrawals ?? manualWithdrawals).toLocaleString('en-IN')}
          </h3>
          <span className="text-[9px] text-muted-foreground block mt-1">Adjustments/Withdrawals</span>
        </div>

        {/* Closing Cash */}
        <div className="bg-gradient-to-br from-indigo-50 to-indigo-100/30 dark:from-indigo-950/20 dark:to-indigo-900/10 border border-indigo-200/50 dark:border-indigo-800/30 rounded-2xl p-5 flex flex-col justify-between shadow-sm">
          <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 block mb-2">Closing Cash</span>
          <h3 className="text-2xl font-extrabold tracking-tight text-indigo-600 dark:text-indigo-400">
            ₹{(dateClosingInfo?.closingBalance ?? computedClosingBalance).toLocaleString('en-IN')}
          </h3>
          <span className="text-[9px] text-indigo-500/80 font-bold block mt-1">Calculated ending</span>
        </div>
      </div>

      {/* 3. Action Block: Close Day / Reopen Day */}
      <Card className="p-6 border border-border bg-card/60 backdrop-blur-md flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-1">
          <h3 className="text-sm font-bold text-foreground">Daily Operations Status</h3>
          <p className="text-xs text-muted-foreground max-w-xl">
            Closing a day freezes all collections, expenses, and ledger entries for that day. 
            Once closed, no new payments or expenses can be registered for this date.
          </p>
        </div>

        <div>
          {currentStatus === 'open' ? (
            <button
              onClick={() => setShowCloseModal(true)}
              className="h-10 inline-flex items-center gap-2 rounded-xl bg-primary px-6 text-xs font-bold text-primary-foreground hover:opacity-90 transition-opacity shadow-[0_4px_12px_rgba(37,99,235,0.2)] w-full md:w-auto justify-center"
            >
              <Lock className="h-3.5 w-3.5" /> Close and Lock Business Day
            </button>
          ) : (
            <button
              onClick={() => setShowReopenModal(true)}
              disabled={!isAuthorizedToManage}
              className="h-10 inline-flex items-center gap-2 rounded-xl bg-destructive px-6 text-xs font-bold text-destructive-foreground hover:opacity-90 disabled:opacity-50 transition-opacity shadow-[0_4px_12px_rgba(239,68,68,0.2)] w-full md:w-auto justify-center"
            >
              <Unlock className="h-3.5 w-3.5" /> Reopen Business Day
            </button>
          )}
        </div>
      </Card>

      {/* 4. Main grid: Detailed Daily Summary / Analytics */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left: Detailed Summary & Recharts */}
        <Card className="lg:col-span-2 p-6 border border-border bg-card/60 backdrop-blur-md space-y-6">
          <div>
            <h3 className="text-sm font-bold text-foreground mb-1">Financial Breakdown</h3>
            <p className="text-xs text-muted-foreground">Comprehensive collection and expense details for the selected day.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 text-xs">
            {/* Collection breakdown */}
            <div className="space-y-3 bg-muted/15 p-4 rounded-2xl border border-border/30">
              <span className="text-[10px] font-bold text-muted-foreground uppercase block mb-1">Collections Split</span>
              <div className="flex justify-between border-b border-border/30 pb-2">
                <span className="text-muted-foreground">Cash Collection:</span>
                <span className="font-bold text-foreground">₹{cashCollection.toLocaleString('en-IN')}</span>
              </div>
              <div className="flex justify-between border-b border-border/30 pb-2">
                <span className="text-muted-foreground">Bank/UPI Collection:</span>
                <span className="font-bold text-foreground">₹{bankCollection.toLocaleString('en-IN')}</span>
              </div>
              <div className="flex justify-between border-b border-border/30 pb-2">
                <span className="text-muted-foreground">Razorpay Collections:</span>
                <span className="font-bold text-foreground">₹{razorpayCollection.toLocaleString('en-IN')}</span>
              </div>
              <div className="flex justify-between pt-1">
                <span className="font-bold text-indigo-500">Total Collection:</span>
                <span className="font-extrabold text-indigo-600 dark:text-indigo-400">₹{totalCollection.toLocaleString('en-IN')}</span>
              </div>
            </div>

            {/* Expense breakdown */}
            <div className="space-y-3 bg-muted/15 p-4 rounded-2xl border border-border/30">
              <span className="text-[10px] font-bold text-muted-foreground uppercase block mb-1">Expenses Split</span>
              <div className="flex justify-between border-b border-border/30 pb-2">
                <span className="text-muted-foreground">Cash Expenses:</span>
                <span className="font-bold text-foreground">₹{cashExpenses.toLocaleString('en-IN')}</span>
              </div>
              <div className="flex justify-between border-b border-border/30 pb-2">
                <span className="text-muted-foreground">Bank/UPI Expenses:</span>
                <span className="font-bold text-foreground">₹{bankExpenses.toLocaleString('en-IN')}</span>
              </div>
              <div className="flex justify-between pt-5 border-t border-border/30">
                <span className="font-bold text-rose-500">Total Expenses:</span>
                <span className="font-extrabold text-rose-600 dark:text-rose-400">₹{totalExpenses.toLocaleString('en-IN')}</span>
              </div>
            </div>
          </div>

          <div className="border-t border-border/40 pt-6 space-y-4">
            <h4 className="text-xs font-bold text-foreground">Closing Trends</h4>
            <div className="h-[180px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trendsData}>
                  <XAxis dataKey="name" fontSize={9} stroke="var(--color-muted-foreground)" />
                  <YAxis fontSize={9} stroke="var(--color-muted-foreground)" />
                  <Tooltip
                    formatter={(val) => `₹${Number(val).toLocaleString('en-IN')}`}
                    contentStyle={{ backgroundColor: 'var(--color-popover)', borderColor: 'var(--color-border)', borderRadius: '12px' }}
                  />
                  <Area type="monotone" dataKey="Collection" stroke="#10b981" fill="#10b981" fillOpacity={0.05} strokeWidth={2} />
                  <Area type="monotone" dataKey="Expenses" stroke="#f43f5e" fill="#f43f5e" fillOpacity={0.05} strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </Card>

        {/* Right Panel: Analytics & Reports Download */}
        <div className="space-y-6">
          {/* Reports widget */}
          <Card className="p-6 border border-border bg-card/60 backdrop-blur-md space-y-4">
            <div>
              <h3 className="text-sm font-bold text-foreground mb-1">Financial Report Exports</h3>
              <p className="text-xs text-muted-foreground">Download standard CSV sheets for accounting audits.</p>
            </div>
            
            <div className="space-y-2">
              <button
                onClick={() => handleCSVExport('closing')}
                className="w-full h-10 inline-flex items-center justify-between rounded-xl border border-border bg-card hover:bg-muted/40 text-xs font-bold px-4 transition-colors"
              >
                <span className="flex items-center gap-2">
                  <FileSpreadsheet className="h-4 w-4 text-emerald-600" /> Export Daily Closing logs (CSV)
                </span>
                <Download className="h-3.5 w-3.5 text-muted-foreground" />
              </button>

              <button
                onClick={() => handleCSVExport('ledger')}
                className="w-full h-10 inline-flex items-center justify-between rounded-xl border border-border bg-card hover:bg-muted/40 text-xs font-bold px-4 transition-colors"
              >
                <span className="flex items-center gap-2">
                  <Coins className="h-4 w-4 text-blue-500" /> Export Ledger Transactions (CSV)
                </span>
                <Download className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            </div>
          </Card>

          {/* Closing Audit Logs list */}
          <Card className="p-6 border border-border bg-card/60 backdrop-blur-md space-y-4 max-h-[360px] overflow-y-auto">
            <h3 className="text-sm font-bold text-foreground">Closing Audit Trail</h3>
            {logs.length === 0 ? (
              <p className="text-xs text-muted-foreground">No audit logs logged in database.</p>
            ) : (
              <div className="relative border-l border-border/80 pl-4 ml-2 space-y-4 text-[11px]">
                {logs.slice(0, 10).map((log) => (
                  <div key={log.logId} className="relative">
                    <span className={`absolute -left-[21px] top-0.5 h-2.5 w-2.5 rounded-full border border-background ${log.action === 'close' ? 'bg-red-500' : 'bg-emerald-500'}`} />
                    <div className="space-y-0.5">
                      <div className="flex justify-between font-bold">
                        <span className="text-foreground capitalize">{log.action} Day ({log.date})</span>
                        <span className="text-muted-foreground font-mono text-[9px]">
                          {new Date(log.timestamp).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })}
                        </span>
                      </div>
                      <p className="text-muted-foreground">By: {log.user}</p>
                      <p className="text-foreground font-medium italic">"{log.reason}"</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* 5. Close Day Dialogue Modal */}
      {showCloseModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
          <div className="bg-card border border-border rounded-2xl w-full max-w-md p-6 shadow-xl animate-scale-up space-y-4">
            <div className="flex items-center justify-between border-b border-border/40 pb-3">
              <h3 className="text-base font-extrabold text-foreground flex items-center gap-2">
                <Lock className="h-4 w-4 text-indigo-500" /> Close and Lock Business Day
              </h3>
              <button onClick={() => setShowCloseModal(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleCloseDaySubmit} className="space-y-4">
              <p className="text-xs text-muted-foreground">
                This locks all ledger entries, payments, and expenses for **{selectedDate}**. 
                You will not be able to modify, add, or delete any record for this date unless reopened.
              </p>

              {/* Data Verification checklist */}
              <div className="rounded-xl bg-muted/30 p-3 border border-border/30 text-xs space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Opening Cash:</span>
                  <span className="font-bold text-foreground">₹{computedOpeningBalance.toLocaleString('en-IN')}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Collections:</span>
                  <span className="font-bold text-emerald-500">₹{totalCollection.toLocaleString('en-IN')}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Expenses:</span>
                  <span className="font-bold text-rose-500">₹{totalExpenses.toLocaleString('en-IN')}</span>
                </div>
                <div className="flex justify-between pt-1 border-t border-border/30">
                  <span className="font-bold text-indigo-600 dark:text-indigo-400">Closing Cash:</span>
                  <span className="font-extrabold text-indigo-600 dark:text-indigo-400">₹{computedClosingBalance.toLocaleString('en-IN')}</span>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground">Audit Notes (Optional)</label>
                <textarea
                  placeholder="E.g. Bank deposits completed, physical cash matched calculations."
                  value={closingNotes}
                  onChange={(e) => setClosingNotes(e.target.value)}
                  className="w-full rounded-xl border border-border bg-muted/40 p-3 text-sm outline-none focus:border-indigo-500 focus:bg-card transition-all h-20 resize-none"
                />
              </div>

              {formError && <p className="text-xs font-bold text-red-500">{formError}</p>}

              <button
                type="submit"
                disabled={formBusy}
                className="h-10 w-full rounded-xl bg-primary text-xs font-bold text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                {formBusy ? 'Locking...' : 'Lock and Freeze Day'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* 6. Reopen Day Dialogue Modal */}
      {showReopenModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
          <div className="bg-card border border-border rounded-2xl w-full max-w-md p-6 shadow-xl animate-scale-up space-y-4">
            <div className="flex items-center justify-between border-b border-border/40 pb-3">
              <h3 className="text-base font-extrabold text-foreground flex items-center gap-2">
                <Unlock className="h-4 w-4 text-red-500" /> Reopen Business Day
              </h3>
              <button onClick={() => setShowReopenModal(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleReopenDaySubmit} className="space-y-4">
              <p className="text-xs text-muted-foreground">
                Reopening the business day **{selectedDate}** unlocks it. Owners/Admins will be allowed to modify transactions, and an immutable log entry will track this event.
              </p>

              <div className="space-y-2">
                <label className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground">Reason for Reopening (Required)</label>
                <textarea
                  placeholder="Provide audit reason (e.g. Fee edit needed, expense correction)."
                  value={reopenReason}
                  onChange={(e) => setReopenReason(e.target.value)}
                  className="w-full rounded-xl border border-border bg-muted/40 p-3 text-sm outline-none focus:border-indigo-500 focus:bg-card transition-all h-20 resize-none"
                  required
                />
              </div>

              {formError && <p className="text-xs font-bold text-red-500">{formError}</p>}

              <button
                type="submit"
                disabled={formBusy}
                className="h-10 w-full rounded-xl bg-destructive text-xs font-bold text-destructive-foreground hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                {formBusy ? 'Unlocking...' : 'Reopen and Unlock Day'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
