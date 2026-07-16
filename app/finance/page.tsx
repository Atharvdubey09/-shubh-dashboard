'use client'

import { useEffect, useState, useMemo } from 'react'
import { useAppData } from '@/components/state/app-data-provider'
import { useAuth } from '@/components/state/auth-provider'
import {
  subscribeWallets,
  subscribeLedger,
  subscribeWalletConfig,
  setOpeningBalances,
  recordWalletActivity,
  recordTransferActivity,
  Wallet,
  LedgerEntry
} from '@/lib/firestore'
import {
  Coins,
  Wallet as WalletIcon,
  Search,
  Filter,
  X,
  Plus,
  ArrowUpRight,
  ArrowDownLeft,
  Calendar,
  Lock,
  Sparkles,
  TrendingUp,
  Info,
  ChevronRight,
  RefreshCw
} from 'lucide-react'
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  CartesianGrid
} from 'recharts'
import { Card } from '@/components/ui-bits'

const COLORS = ['#2563eb', '#10b981', '#f59e0b']

export default function FinancePage() {
  const { students, payments, expenses } = useAppData()
  const { user } = useAuth()
  const userName = user?.displayName || user?.email || 'Authorized User'

  // DB Subscriptions State
  const [wallets, setWallets] = useState<Wallet[]>([])
  const [ledger, setLedger] = useState<LedgerEntry[]>([])
  const [config, setConfig] = useState<{ initialized: boolean; openingCash: number; openingBank: number } | null>(null)
  const [loading, setLoading] = useState(true)

  // Modals & Drawers UI State
  const [showInitModal, setShowInitModal] = useState(false)
  const [showAdjustModal, setShowAdjustModal] = useState(false)
  const [selectedEntry, setSelectedEntry] = useState<LedgerEntry | null>(null)

  // Form State
  const [initCash, setInitCash] = useState('')
  const [initBank, setInitBank] = useState('')
  const [adjustType, setAdjustType] = useState<'deposit' | 'withdrawal' | 'settlement'>('deposit')
  const [adjustWallet, setAdjustWallet] = useState<'cash' | 'bank'>('cash')
  const [adjustAmount, setAdjustAmount] = useState('')
  const [adjustReason, setAdjustReason] = useState('')
  const [formError, setFormError] = useState('')
  const [formBusy, setFormBusy] = useState(false)

  // Filters State
  const [searchQuery, setSearchQuery] = useState('')
  const [filterWallet, setFilterWallet] = useState<'all' | 'cash' | 'bank' | 'razorpay'>('all')
  const [filterType, setFilterType] = useState('all')
  const [filterDateRange, setFilterDateRange] = useState<'all' | '7d' | '30d' | 'this_month'>('all')

  // Real-time Firestore Subscriptions
  useEffect(() => {
    let unsubConfig = subscribeWalletConfig((cfg) => {
      setConfig(cfg)
      setLoading(false)
    })
    let unsubWallets = subscribeWallets((w) => setWallets(w))
    let unsubLedger = subscribeLedger((ledg) => setLedger(ledg))

    return () => {
      unsubConfig()
      unsubWallets()
      unsubLedger()
    }
  }, [])

  // 1. Calculations & Wallet Metric Derivations
  const cashBal = wallets.find((w) => w.walletId === 'cash')?.balance || 0
  const bankBal = wallets.find((w) => w.walletId === 'bank')?.balance || 0
  const razorpayBal = wallets.find((w) => w.walletId === 'razorpay')?.balance || 0

  const activeStudents = students.filter((s) => s.status === 'active')
  const totalOutstandingFees = activeStudents.reduce((sum, s) => sum + s.pending, 0)
  const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0)

  const netBusinessFunds = cashBal + bankBal + razorpayBal - totalExpenses

  // Compute Today's Changes
  const todayCashChange = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10)
    return ledger
      .filter((l) => l.walletId === 'cash' && l.timestamp.startsWith(today))
      .reduce((sum, l) => sum + l.amount, 0)
  }, [ledger])

  const todayBankChange = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10)
    return ledger
      .filter((l) => l.walletId === 'bank' && l.timestamp.startsWith(today))
      .reduce((sum, l) => sum + l.amount, 0)
  }, [ledger])

  const todayRazorpayChange = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10)
    return ledger
      .filter((l) => l.walletId === 'razorpay' && l.timestamp.startsWith(today))
      .reduce((sum, l) => sum + l.amount, 0)
  }, [ledger])

  // 2. Filter & Search Logic
  const filteredLedger = useMemo(() => {
    let result = [...ledger]

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter(
        (l) =>
          l.transactionId.toLowerCase().includes(q) ||
          (l.studentName && l.studentName.toLowerCase().includes(q)) ||
          (l.source && l.source.toLowerCase().includes(q)) ||
          (l.notes && l.notes.toLowerCase().includes(q)) ||
          l.type.toLowerCase().includes(q)
      )
    }

    if (filterWallet !== 'all') {
      result = result.filter((l) => l.walletId === filterWallet)
    }

    if (filterType !== 'all') {
      result = result.filter((l) => l.type === filterType)
    }

    if (filterDateRange !== 'all') {
      const now = new Date()
      let cutoff = new Date()
      if (filterDateRange === '7d') cutoff.setDate(now.getDate() - 7)
      if (filterDateRange === '30d') cutoff.setDate(now.getDate() - 30)
      if (filterDateRange === 'this_month') {
        cutoff = new Date(now.getFullYear(), now.getMonth(), 1)
      }
      result = result.filter((l) => new Date(l.timestamp) >= cutoff)
    }

    return result
  }, [ledger, searchQuery, filterWallet, filterType, filterDateRange])

  // 3. Analytics Chart Formatting
  const cashVsBankData = [
    { name: 'Cash Balance', value: Math.max(0, cashBal) },
    { name: 'Bank Balance', value: Math.max(0, bankBal) },
    { name: 'Razorpay', value: Math.max(0, razorpayBal) }
  ]

  const monthlyCashflowData = useMemo(() => {
    const monthGroups: Record<string, { income: number; expense: number }> = {}
    ledger.forEach((l) => {
      const mKey = l.timestamp.slice(0, 7) // YYYY-MM
      if (!monthGroups[mKey]) monthGroups[mKey] = { income: 0, expense: 0 }
      if (l.amount > 0 && l.type !== 'Opening Balance') {
        monthGroups[mKey].income += l.amount
      } else if (l.amount < 0 && l.type === 'Expense') {
        monthGroups[mKey].expense += Math.abs(l.amount)
      }
    })

    return Object.keys(monthGroups)
      .sort()
      .slice(-6)
      .map((key) => {
        const [yr, mn] = key.split('-')
        const label = new Date(Number(yr), Number(mn) - 1, 1).toLocaleDateString('en-IN', { month: 'short' })
        return {
          month: label,
          Income: monthGroups[key].income,
          Expenses: monthGroups[key].expense
        }
      })
  }, [ledger])

  const walletGrowthData = useMemo(() => {
    // Reconstruct balances over the last 15 entries
    const chronologicalLedger = [...ledger].reverse()
    let runningCash = 0
    let runningBank = 0
    let runningSettlement = 0

    return chronologicalLedger.map((l, index) => {
      if (l.walletId === 'cash') runningCash += l.amount
      if (l.walletId === 'bank') runningBank += l.amount
      if (l.walletId === 'razorpay') runningSettlement += l.amount

      return {
        name: new Date(l.timestamp).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }),
        Funds: runningCash + runningBank + runningSettlement
      }
    }).slice(-15)
  }, [ledger])

  // Analytics Aggregates
  const highestExpenseDay = useMemo(() => {
    const dayTotals: Record<string, number> = {}
    ledger.forEach((l) => {
      if (l.type === 'Expense' && l.amount < 0) {
        const day = l.timestamp.slice(0, 10)
        dayTotals[day] = (dayTotals[day] || 0) + Math.abs(l.amount)
      }
    })
    const sorted = Object.keys(dayTotals).sort((a, b) => dayTotals[b] - dayTotals[a])
    return sorted[0]
      ? { date: sorted[0], amount: dayTotals[sorted[0]] }
      : { date: 'N/A', amount: 0 }
  }, [ledger])

  const highestCollectionDay = useMemo(() => {
    const dayTotals: Record<string, number> = {}
    ledger.forEach((l) => {
      if (l.amount > 0 && l.type.includes('Fee')) {
        const day = l.timestamp.slice(0, 10)
        dayTotals[day] = (dayTotals[day] || 0) + l.amount
      }
    })
    const sorted = Object.keys(dayTotals).sort((a, b) => dayTotals[b] - dayTotals[a])
    return sorted[0]
      ? { date: sorted[0], amount: dayTotals[sorted[0]] }
      : { date: 'N/A', amount: 0 }
  }, [ledger])

  // Form Handlers
  const handleSetOpeningBalances = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError('')
    setFormBusy(true)
    try {
      const cash = Number(initCash)
      const bank = Number(initBank)
      if (isNaN(cash) || cash < 0 || isNaN(bank) || bank < 0) {
        throw new Error('Please enter valid, non-negative amounts.')
      }
      await setOpeningBalances(cash, bank, userName)
      setShowInitModal(false)
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to save opening balance.')
    } finally {
      setFormBusy(false)
    }
  }

  const handleManualAdjustmentSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError('')
    setFormBusy(true)
    try {
      const amt = Number(adjustAmount)
      if (isNaN(amt) || amt <= 0) {
        throw new Error('Please enter a valid amount greater than 0.')
      }
      if (!adjustReason.trim()) {
        throw new Error('Reason/Notes are required for manual audit logs.')
      }

      if (adjustType === 'settlement') {
        if (razorpayBal < amt) {
          throw new Error('Insufficient funds in Razorpay Settlement Wallet.')
        }
        await recordTransferActivity({
          fromWalletId: 'razorpay',
          toWalletId: 'bank',
          amount: amt,
          type: 'Settlement',
          createdBy: userName,
          notes: adjustReason
        })
      } else {
        const multiplier = adjustType === 'withdrawal' ? -1 : 1
        await recordWalletActivity({
          walletId: adjustWallet,
          amount: amt * multiplier,
          type: adjustType === 'deposit' ? 'Manual Deposit' : 'Manual Withdrawal',
          method: adjustWallet === 'cash' ? 'Cash' : 'Bank Transfer',
          source: 'Manual Adjustment',
          createdBy: userName,
          notes: adjustReason
        })
      }

      setShowAdjustModal(false)
      setAdjustAmount('')
      setAdjustReason('')
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Action failed.')
    } finally {
      setFormBusy(false)
    }
  }

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center text-muted-foreground animate-pulse">
        <RefreshCw className="mr-3 h-5 w-5 animate-spin text-primary" />
        <span>Loading Real-time Wallets & Ledger...</span>
      </div>
    )
  }

  return (
    <div className="space-y-8 animate-fade-up">
      {/* 1. Header & Quick Audit Row */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-widest text-indigo-500">ERP Finance Engine</span>
          <h1 className="text-3xl font-extrabold tracking-tight text-foreground">Wallet & Ledger</h1>
          <p className="text-sm text-muted-foreground">Immutable double-entry internal ledger tracking all coaching funds.</p>
        </div>
        
        <div className="flex gap-2">
          {!config?.initialized ? (
            <button
              onClick={() => setShowInitModal(true)}
              className="h-10 inline-flex items-center gap-2 rounded-xl bg-primary px-4 text-xs font-bold text-primary-foreground hover:opacity-90 transition-opacity shadow-[0_4px_12px_rgba(37,99,235,0.2)]"
            >
              <Lock className="h-3.5 w-3.5" /> Initialize Opening Balance
            </button>
          ) : (
            <button
              onClick={() => {
                setAdjustType('deposit')
                setShowAdjustModal(true)}
              }
              className="h-10 inline-flex items-center gap-2 rounded-xl bg-primary px-4 text-xs font-bold text-primary-foreground hover:opacity-90 transition-opacity shadow-[0_4px_12px_rgba(37,99,235,0.2)]"
            >
              <Plus className="h-4 w-4" /> Add Manual Entry
            </button>
          )}
          <button
            onClick={() => {
              setAdjustType('settlement')
              setShowAdjustModal(true)
            }}
            className="h-10 inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 text-xs font-bold text-card-foreground hover:bg-muted/50 transition-colors"
          >
            Record Razorpay Settlement
          </button>
        </div>
      </div>

      {/* 2. Wallets Summary Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4">
        {/* Cash Wallet */}
        <div className="bg-card border border-border/80 rounded-2xl p-5 flex flex-col justify-between shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-muted-foreground">Cash Wallet</span>
            <Coins className="h-4 w-4 text-yellow-500" />
          </div>
          <div>
            <h3 className="text-2xl font-extrabold tracking-tight text-foreground">₹{cashBal.toLocaleString('en-IN')}</h3>
            <div className="mt-1 flex items-center gap-1">
              <span className={`text-[10px] font-bold flex items-center ${todayCashChange >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                {todayCashChange >= 0 ? '+' : ''}₹{todayCashChange.toLocaleString('en-IN')}
              </span>
              <span className="text-[9px] text-muted-foreground">Today</span>
            </div>
          </div>
        </div>

        {/* Bank Wallet */}
        <div className="bg-card border border-border/80 rounded-2xl p-5 flex flex-col justify-between shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-muted-foreground">Bank Wallet</span>
            <WalletIcon className="h-4 w-4 text-blue-500" />
          </div>
          <div>
            <h3 className="text-2xl font-extrabold tracking-tight text-foreground">₹{bankBal.toLocaleString('en-IN')}</h3>
            <div className="mt-1 flex items-center gap-1">
              <span className={`text-[10px] font-bold flex items-center ${todayBankChange >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                {todayBankChange >= 0 ? '+' : ''}₹{todayBankChange.toLocaleString('en-IN')}
              </span>
              <span className="text-[9px] text-muted-foreground">Today</span>
            </div>
          </div>
        </div>

        {/* Razorpay Settlement Wallet */}
        <div className="bg-card border border-border/80 rounded-2xl p-5 flex flex-col justify-between shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-muted-foreground">Razorpay Wallet</span>
            <RefreshCw className="h-4 w-4 text-indigo-500" />
          </div>
          <div>
            <h3 className="text-2xl font-extrabold tracking-tight text-foreground">₹{razorpayBal.toLocaleString('en-IN')}</h3>
            <div className="mt-1 flex items-center gap-1">
              <span className="text-[9px] text-indigo-500 font-bold">Waiting for Settlement</span>
            </div>
          </div>
        </div>

        {/* Outstanding Fees */}
        <div className="bg-card border border-border/80 rounded-2xl p-5 flex flex-col justify-between shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-muted-foreground">Outstanding Fees</span>
            <Info className="h-4 w-4 text-amber-500" />
          </div>
          <div>
            <h3 className="text-2xl font-extrabold tracking-tight text-foreground">₹{totalOutstandingFees.toLocaleString('en-IN')}</h3>
            <span className="text-[9px] text-muted-foreground block mt-1">Fee collection due</span>
          </div>
        </div>

        {/* Expenses Wallet */}
        <div className="bg-card border border-border/80 rounded-2xl p-5 flex flex-col justify-between shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-muted-foreground">Total Expenses</span>
            <ArrowUpRight className="h-4 w-4 text-rose-500" />
          </div>
          <div>
            <h3 className="text-2xl font-extrabold tracking-tight text-rose-500">₹{totalExpenses.toLocaleString('en-IN')}</h3>
            <span className="text-[9px] text-muted-foreground block mt-1">Paid out from funds</span>
          </div>
        </div>

        {/* Net Business Funds */}
        <div className="bg-gradient-to-br from-indigo-50 to-indigo-100/30 dark:from-indigo-950/20 dark:to-indigo-900/10 border border-indigo-200/50 dark:border-indigo-800/30 rounded-2xl p-5 flex flex-col justify-between shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400">Net Business Funds</span>
            <Sparkles className="h-4 w-4 text-indigo-600" />
          </div>
          <div>
            <h3 className="text-2xl font-extrabold tracking-tight text-indigo-600 dark:text-indigo-400">₹{netBusinessFunds.toLocaleString('en-IN')}</h3>
            <span className="text-[9px] text-indigo-500/80 font-bold block mt-1">Cash + Bank + Razorpay - Expenses</span>
          </div>
        </div>
      </div>

      {/* 3. Financial Analytics Area */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Total Funds Growth Line Chart */}
        <Card className="lg:col-span-2 p-6 border border-border bg-card/60 backdrop-blur-md">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-sm font-bold text-foreground">Fund Growth History</h3>
              <p className="text-xs text-muted-foreground">Historical trajectory of combined wallets over the last transactions.</p>
            </div>
            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-full">
              <TrendingUp className="h-3 w-3" /> Real-time tracking
            </span>
          </div>
          <div className="h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={walletGrowthData}>
                <defs>
                  <linearGradient id="growthGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="name" fontSize={10} stroke="var(--color-muted-foreground)" />
                <YAxis fontSize={10} stroke="var(--color-muted-foreground)" />
                <Tooltip
                  formatter={(val) => [`₹${Number(val).toLocaleString('en-IN')}`, 'Business Funds']}
                  contentStyle={{ backgroundColor: 'var(--color-popover)', borderColor: 'var(--color-border)', borderRadius: '12px' }}
                />
                <Area type="monotone" dataKey="Funds" stroke="#6366f1" strokeWidth={2.5} fillOpacity={1} fill="url(#growthGradient)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Right: Cash Vs Bank Split & Stats */}
        <Card className="p-6 border border-border bg-card/60 backdrop-blur-md flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-bold text-foreground mb-4">Capital Distribution</h3>
            <div className="h-[140px] flex items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={cashVsBankData}
                    cx="50%"
                    cy="50%"
                    innerRadius={45}
                    outerRadius={60}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {cashVsBankData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(val) => `₹${Number(val).toLocaleString('en-IN')}`} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            
            <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
              <div className="flex flex-col items-center">
                <span className="h-2 w-2 rounded-full bg-blue-600 block mb-1"></span>
                <span className="text-[10px] text-muted-foreground">Cash</span>
                <span className="font-bold">₹{cashBal.toLocaleString('en-IN')}</span>
              </div>
              <div className="flex flex-col items-center">
                <span className="h-2 w-2 rounded-full bg-emerald-500 block mb-1"></span>
                <span className="text-[10px] text-muted-foreground">Bank</span>
                <span className="font-bold">₹{bankBal.toLocaleString('en-IN')}</span>
              </div>
              <div className="flex flex-col items-center">
                <span className="h-2 w-2 rounded-full bg-amber-500 block mb-1"></span>
                <span className="text-[10px] text-muted-foreground">Razorpay</span>
                <span className="font-bold">₹{razorpayBal.toLocaleString('en-IN')}</span>
              </div>
            </div>
          </div>

          <div className="border-t border-border/40 pt-4 mt-4 space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Highest Collection Day:</span>
              <span className="font-bold">{highestCollectionDay.date} (₹{highestCollectionDay.amount.toLocaleString('en-IN')})</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Highest Expense Day:</span>
              <span className="font-bold">{highestExpenseDay.date} (₹{highestExpenseDay.amount.toLocaleString('en-IN')})</span>
            </div>
          </div>
        </Card>
      </div>

      {/* 4. Ledger Filters & Transaction History Table */}
      <Card className="border border-border bg-card/60 backdrop-blur-md overflow-hidden">
        {/* Filters Header */}
        <div className="p-6 border-b border-border/40 space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <h3 className="text-sm font-bold text-foreground">Immutable Ledger History</h3>
            
            {/* Search Input */}
            <div className="relative w-full md:w-72">
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search transaction, notes, name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-9 w-full rounded-xl border border-border bg-muted/40 pl-9 pr-4 text-xs outline-none focus:border-indigo-500 focus:bg-card transition-all"
              />
            </div>
          </div>

          {/* Filtering row */}
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Filter className="h-3.5 w-3.5" /> Filters:
            </div>

            {/* Wallet Filter */}
            <select
              value={filterWallet}
              onChange={(e) => setFilterWallet(e.target.value as any)}
              className="h-8 rounded-lg border border-border bg-muted/30 px-3 text-[11px] outline-none"
            >
              <option value="all">All Wallets</option>
              <option value="cash">Cash Wallet</option>
              <option value="bank">Bank Wallet</option>
              <option value="razorpay">Razorpay Settlement</option>
            </select>

            {/* Type Filter */}
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="h-8 rounded-lg border border-border bg-muted/30 px-3 text-[11px] outline-none"
            >
              <option value="all">All Types</option>
              <option value="Opening Balance">Opening Balance</option>
              <option value="Admission Fee">Admission Fee</option>
              <option value="Monthly Fee">Monthly Fee</option>
              <option value="Split Fee">Split Fee</option>
              <option value="Partial Fee">Partial Fee</option>
              <option value="Expense">Expense</option>
              <option value="Refund">Refund</option>
              <option value="Adjustment">Adjustment</option>
              <option value="Settlement">Settlement</option>
              <option value="Manual Deposit">Manual Deposit</option>
              <option value="Manual Withdrawal">Manual Withdrawal</option>
            </select>

            {/* Date range Filter */}
            <select
              value={filterDateRange}
              onChange={(e) => setFilterDateRange(e.target.value as any)}
              className="h-8 rounded-lg border border-border bg-muted/30 px-3 text-[11px] outline-none"
            >
              <option value="all">All Dates</option>
              <option value="7d">Last 7 Days</option>
              <option value="30d">Last 30 Days</option>
              <option value="this_month">This Month</option>
            </select>

            {(searchQuery || filterWallet !== 'all' || filterType !== 'all' || filterDateRange !== 'all') && (
              <button
                onClick={() => {
                  setSearchQuery('')
                  setFilterWallet('all')
                  setFilterType('all')
                  setFilterDateRange('all')
                }}
                className="h-8 inline-flex items-center gap-1 text-indigo-500 hover:text-indigo-600 font-bold px-2"
              >
                Clear Filters <X className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>

        {/* Ledger Table Rendering */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-muted/30 border-b border-border/30 text-muted-foreground font-semibold">
                <th className="p-4">Date</th>
                <th className="p-4">Transaction ID</th>
                <th className="p-4">Student/Source</th>
                <th className="p-4">Type</th>
                <th className="p-4">Wallet</th>
                <th className="p-4 text-right">Amount</th>
                <th className="p-4 text-right">Balance After</th>
                <th className="p-4">Created By</th>
                <th className="p-4 text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredLedger.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center p-12 text-muted-foreground">
                    No ledger entries found matching the filter criteria.
                  </td>
                </tr>
              ) : (
                filteredLedger.map((entry) => {
                  const isPositive = entry.amount >= 0
                  return (
                    <tr key={entry.transactionId} className="border-b border-border/30 hover:bg-muted/10 transition-colors">
                      <td className="p-4 whitespace-nowrap text-muted-foreground">
                        {new Date(entry.timestamp).toLocaleDateString('en-IN', {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </td>
                      <td className="p-4 font-mono text-[10px] text-muted-foreground">{entry.transactionId}</td>
                      <td className="p-4 font-medium text-foreground">
                        {entry.studentName || entry.source || 'N/A'}
                      </td>
                      <td className="p-4">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-muted/65 text-muted-foreground">
                          {entry.type}
                        </span>
                      </td>
                      <td className="p-4">
                        <span className={`text-[10px] font-bold ${entry.walletId === 'cash' ? 'text-yellow-600 dark:text-yellow-400' : entry.walletId === 'bank' ? 'text-blue-600 dark:text-blue-400' : 'text-indigo-600 dark:text-indigo-400'}`}>
                          {entry.walletId === 'cash' ? 'Cash Wallet' : entry.walletId === 'bank' ? 'Bank Wallet' : 'Razorpay Settlement'}
                        </span>
                      </td>
                      <td className={`p-4 text-right font-extrabold whitespace-nowrap ${isPositive ? 'text-emerald-500' : 'text-red-500'}`}>
                        {isPositive ? '+' : ''}₹{entry.amount.toLocaleString('en-IN')}
                      </td>
                      <td className="p-4 text-right font-bold text-foreground">
                        ₹{entry.balanceAfter.toLocaleString('en-IN')}
                      </td>
                      <td className="p-4 text-muted-foreground">{entry.createdBy}</td>
                      <td className="p-4 text-center">
                        <button
                          onClick={() => setSelectedEntry(entry)}
                          className="h-7 inline-flex items-center gap-1 px-3 rounded-lg border border-border hover:bg-muted text-[10px] font-bold transition-colors"
                        >
                          Details <ChevronRight className="h-3 w-3" />
                        </button>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* 5. Opening Balance setup Modal (one-time only) */}
      {showInitModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
          <div className="bg-card border border-border rounded-2xl w-full max-w-md p-6 shadow-xl animate-scale-up space-y-4">
            <div className="flex items-center justify-between border-b border-border/40 pb-3">
              <h3 className="text-base font-extrabold text-foreground flex items-center gap-2">
                <Lock className="h-4 w-4 text-indigo-500" /> Initialize Opening Balances
              </h3>
              <button onClick={() => setShowInitModal(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSetOpeningBalances} className="space-y-4">
              <p className="text-xs text-muted-foreground">
                Opening balances can be set **only once**. Afterwards, all changes must go through adjustments or fee/expense activities.
              </p>

              <div className="space-y-2">
                <label className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground">Opening Cash Balance</label>
                <input
                  type="number"
                  placeholder="₹ 50,000"
                  value={initCash}
                  onChange={(e) => setInitCash(e.target.value)}
                  className="h-10 w-full rounded-xl border border-border bg-muted/40 px-3 text-sm outline-none focus:border-indigo-500 focus:bg-card transition-all"
                  required
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground">Opening Bank Balance</label>
                <input
                  type="number"
                  placeholder="₹ 2,00,000"
                  value={initBank}
                  onChange={(e) => setInitBank(e.target.value)}
                  className="h-10 w-full rounded-xl border border-border bg-muted/40 px-3 text-sm outline-none focus:border-indigo-500 focus:bg-card transition-all"
                  required
                />
              </div>

              {formError && <p className="text-xs font-bold text-red-500">{formError}</p>}

              <button
                type="submit"
                disabled={formBusy}
                className="h-10 w-full rounded-xl bg-primary text-xs font-bold text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                {formBusy ? 'Saving...' : 'Set Opening Balances'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* 6. Manual adjustments & Settlements modal */}
      {showAdjustModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
          <div className="bg-card border border-border rounded-2xl w-full max-w-md p-6 shadow-xl animate-scale-up space-y-4">
            <div className="flex items-center justify-between border-b border-border/40 pb-3">
              <h3 className="text-base font-extrabold text-foreground flex items-center gap-2">
                {adjustType === 'deposit' && <Plus className="h-4 w-4 text-emerald-500" />}
                {adjustType === 'withdrawal' && <X className="h-4 w-4 text-red-500" />}
                {adjustType === 'settlement' && <RefreshCw className="h-4 w-4 text-indigo-500" />}
                {adjustType === 'deposit' && 'Add Manual Deposit'}
                {adjustType === 'withdrawal' && 'Add Manual Withdrawal'}
                {adjustType === 'settlement' && 'Razorpay Settlement Completed'}
              </h3>
              <button onClick={() => setShowAdjustModal(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleManualAdjustmentSubmit} className="space-y-4">
              {/* Type Switcher if not settlement */}
              {adjustType !== 'settlement' && (
                <div className="grid grid-cols-2 gap-2 bg-muted/65 p-1 rounded-xl text-xs">
                  <button
                    type="button"
                    onClick={() => setAdjustType('deposit')}
                    className={`py-1.5 rounded-lg font-bold transition-all ${adjustType === 'deposit' ? 'bg-background shadow text-foreground' : 'text-muted-foreground'}`}
                  >
                    Deposit
                  </button>
                  <button
                    type="button"
                    onClick={() => setAdjustType('withdrawal')}
                    className={`py-1.5 rounded-lg font-bold transition-all ${adjustType === 'withdrawal' ? 'bg-background shadow text-foreground' : 'text-muted-foreground'}`}
                  >
                    Withdrawal
                  </button>
                </div>
              )}

              {/* Wallet Selector if not settlement */}
              {adjustType !== 'settlement' && (
                <div className="space-y-2">
                  <label className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground">Select Target Wallet</label>
                  <select
                    value={adjustWallet}
                    onChange={(e) => setAdjustWallet(e.target.value as any)}
                    className="h-10 w-full rounded-xl border border-border bg-muted/40 px-3 text-sm outline-none focus:border-indigo-500 focus:bg-card transition-all"
                  >
                    <option value="cash">Cash Wallet</option>
                    <option value="bank">Bank Wallet</option>
                  </select>
                </div>
              )}

              {adjustType === 'settlement' && (
                <div className="rounded-xl bg-indigo-50 dark:bg-indigo-950/20 p-3 border border-indigo-200/50 dark:border-indigo-800/30 text-xs space-y-1.5">
                  <div className="flex justify-between font-bold text-indigo-600 dark:text-indigo-400">
                    <span>Razorpay Settlement Balance:</span>
                    <span>₹{razorpayBal.toLocaleString('en-IN')}</span>
                  </div>
                  <p className="text-muted-foreground text-[10px]">
                    This action transfers funds out of your Razorpay Settlement Wallet into your Bank Wallet, representing a settlement payout.
                  </p>
                </div>
              )}

              <div className="space-y-2">
                <label className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground">Amount (INR)</label>
                <input
                  type="number"
                  placeholder="₹ 5,000"
                  value={adjustAmount}
                  onChange={(e) => setAdjustAmount(e.target.value)}
                  className="h-10 w-full rounded-xl border border-border bg-muted/40 px-3 text-sm outline-none focus:border-indigo-500 focus:bg-card transition-all"
                  required
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground">Reason / Audit notes</label>
                <textarea
                  placeholder={adjustType === 'settlement' ? 'Settlement cycle payout ID XXXXXX' : 'Reason for manual adjustment...'}
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                  className="w-full rounded-xl border border-border bg-muted/40 p-3 text-sm outline-none focus:border-indigo-500 focus:bg-card transition-all h-20 resize-none"
                  required
                />
              </div>

              {formError && <p className="text-xs font-bold text-red-500">{formError}</p>}

              <button
                type="submit"
                disabled={formBusy}
                className="h-10 w-full rounded-xl bg-primary text-xs font-bold text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                {formBusy ? 'Processing...' : (adjustType === 'settlement' ? 'Record Settlement Payout' : 'Apply Adjustment')}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* 7. Ledger Entry Details Drawer */}
      {selectedEntry && (
        <div className="fixed inset-0 z-50 flex items-center justify-end bg-background/80 backdrop-blur-sm">
          <div className="bg-card border-l border-border w-full max-w-md h-full p-6 shadow-xl flex flex-col justify-between animate-slide-left space-y-6">
            <div className="space-y-6 flex-1 overflow-y-auto">
              <div className="flex items-center justify-between border-b border-border/40 pb-3">
                <h3 className="text-base font-extrabold text-foreground">Transaction Details</h3>
                <button onClick={() => setSelectedEntry(null)} className="text-muted-foreground hover:text-foreground">
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Amount Display Header */}
              <div className="text-center py-6 bg-muted/15 border border-border/30 rounded-2xl">
                <span className="text-[10px] font-extrabold uppercase tracking-widest text-muted-foreground">Transaction Amount</span>
                <h2 className={`text-3xl font-extrabold mt-1 ${selectedEntry.amount >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                  {selectedEntry.amount >= 0 ? '+' : ''}₹{selectedEntry.amount.toLocaleString('en-IN')}
                </h2>
                <span className="text-[10px] text-muted-foreground font-mono block mt-1">{selectedEntry.transactionId}</span>
              </div>

              {/* Data list */}
              <div className="space-y-4 text-xs">
                <div className="flex justify-between border-b border-border/30 pb-2">
                  <span className="text-muted-foreground">Transaction Date:</span>
                  <span className="font-semibold text-foreground">
                    {new Date(selectedEntry.timestamp).toLocaleString('en-IN', {
                      month: 'long',
                      day: 'numeric',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </span>
                </div>

                <div className="flex justify-between border-b border-border/30 pb-2">
                  <span className="text-muted-foreground">Student Name:</span>
                  <span className="font-semibold text-foreground">{selectedEntry.studentName || 'N/A'}</span>
                </div>

                <div className="flex justify-between border-b border-border/30 pb-2">
                  <span className="text-muted-foreground">Category/Type:</span>
                  <span className="font-semibold text-foreground">{selectedEntry.type}</span>
                </div>

                <div className="flex justify-between border-b border-border/30 pb-2">
                  <span className="text-muted-foreground">Payment Method:</span>
                  <span className="font-semibold text-foreground">{selectedEntry.method || 'N/A'}</span>
                </div>

                <div className="flex justify-between border-b border-border/30 pb-2">
                  <span className="text-muted-foreground">Source Detail:</span>
                  <span className="font-semibold text-foreground">{selectedEntry.source || 'N/A'}</span>
                </div>

                <div className="flex justify-between border-b border-border/30 pb-2">
                  <span className="text-muted-foreground">Wallet Impacted:</span>
                  <span className="font-bold text-indigo-500">
                    {selectedEntry.walletId === 'cash' ? 'Cash Wallet' : selectedEntry.walletId === 'bank' ? 'Bank Wallet' : 'Razorpay Settlement'}
                  </span>
                </div>

                <div className="flex justify-between border-b border-border/30 pb-2">
                  <span className="text-muted-foreground">Wallet Balance After:</span>
                  <span className="font-semibold text-foreground">₹{selectedEntry.balanceAfter.toLocaleString('en-IN')}</span>
                </div>

                <div className="flex justify-between border-b border-border/30 pb-2">
                  <span className="text-muted-foreground">Created By User:</span>
                  <span className="font-semibold text-foreground">{selectedEntry.createdBy}</span>
                </div>

                {selectedEntry.notes && (
                  <div className="bg-muted/30 p-3 rounded-xl border border-border/30 space-y-1">
                    <span className="text-[10px] font-bold text-muted-foreground uppercase block">Audit Notes</span>
                    <p className="text-foreground leading-normal">{selectedEntry.notes}</p>
                  </div>
                )}
              </div>
            </div>

            <button
              onClick={() => setSelectedEntry(null)}
              className="h-10 w-full rounded-xl border border-border bg-card text-xs font-bold text-card-foreground hover:bg-muted/50 transition-colors"
            >
              Close Details Drawer
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
