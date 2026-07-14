'use client'

import { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import {
  History,
  Search,
  ArrowUpDown,
  SlidersHorizontal,
  Download,
  Printer,
  X,
  ExternalLink,
  AlertCircle,
  CircleCheck,
  DollarSign,
  Check,
  RotateCcw,
  FileText,
  Filter,
  Calendar,
  User,
} from 'lucide-react'
import { Card } from '@/components/ui-bits'
import { subscribeTransactions } from '@/lib/firestore'
import { formatINR, formatLongDate } from '@/lib/domain'
import { cn } from '@/lib/utils'

interface Transaction {
  id: string
  studentId: string
  studentName: string
  studentClass: number
  studentRoll: string
  studentPhone?: string
  transactionType: 'payment' | 'discount' | 'fine' | 'refund' | 'cancellation' | 'failed_attempt'
  amount: number
  discount?: number
  fine?: number
  netAmount: number
  paymentMethod: 'Cash' | 'UPI' | 'Card' | 'Bank Transfer' | 'Razorpay'
  paymentStatus: 'success' | 'failed' | 'pending' | 'refunded' | 'cancelled'
  collectionSource: string
  collectedBy: string
  date: string
  time: string
  receiptNumber: string
  razorpayPaymentId?: string
  razorpayOrderId?: string
  notes?: string
  createdAt: string
  updatedAt: string
  previousDueAmount?: number
  remainingDueAmount?: number
  gatewayResponse?: any
  verificationStatus?: string
  docRef?: string
  timeline?: Array<{
    status: string
    timestamp: string
    remarks: string
  }>
}

function TransactionStatusPill({ status }: { status: Transaction['paymentStatus'] }) {
  const styles = {
    success: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
    failed: 'bg-rose-500/10 text-rose-500 border-rose-500/20',
    pending: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
    refunded: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
    cancelled: 'bg-slate-500/10 text-slate-500 border-slate-500/20',
  }
  return (
    <span className={cn('inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold border capitalize', styles[status] || 'bg-muted text-muted-foreground')}>
      {status}
    </span>
  )
}

export default function TransactionHistoryPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null)

  // Filters State
  const [searchTerm, setSearchTerm] = useState('')
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc')
  const [classFilter, setClassFilter] = useState<string>('all')
  const [methodFilter, setMethodFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [collectedByFilter, setCollectedByFilter] = useState<string>('all')
  const [monthFilter, setMonthFilter] = useState<string>('all')
  const [yearFilter, setYearFilter] = useState<string>('all')
  const [startDate, setStartDate] = useState<string>('')
  const [endDate, setEndDate] = useState<string>('')
  const [showFilters, setShowFilters] = useState(false)

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1)
  const pageSize = 15

  // Subscribe to transactions
  useEffect(() => {
    const unsubscribe = subscribeTransactions(
      (list) => {
        setTransactions(list as Transaction[])
        setLoading(false)
      },
      (err) => {
        console.error('Failed to subscribe to transactions:', err)
        setLoading(false)
      }
    )
    return () => unsubscribe()
  }, [])

  // Calculate unique collected by list
  const collectorsList = useMemo(() => {
    const set = new Set<string>()
    transactions.forEach((t) => {
      if (t.collectedBy) set.add(t.collectedBy)
    })
    return Array.from(set)
  }, [transactions])

  // Reset Filters
  const handleResetFilters = () => {
    setSearchTerm('')
    setClassFilter('all')
    setMethodFilter('all')
    setStatusFilter('all')
    setCollectedByFilter('all')
    setMonthFilter('all')
    setYearFilter('all')
    setStartDate('')
    setEndDate('')
    setCurrentPage(1)
  }

  // Filtered & Sorted Transactions
  const filteredTransactions = useMemo(() => {
    let result = [...transactions]

    // Search query
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase().trim()
      result = result.filter(
        (t) =>
          t.studentName?.toLowerCase().includes(q) ||
          t.receiptNumber?.toLowerCase().includes(q) ||
          t.id?.toLowerCase().includes(q) ||
          t.razorpayPaymentId?.toLowerCase().includes(q) ||
          t.razorpayOrderId?.toLowerCase().includes(q) ||
          t.studentId?.toLowerCase().includes(q) ||
          t.studentPhone?.toLowerCase().includes(q)
      )
    }

    // Class
    if (classFilter !== 'all') {
      result = result.filter((t) => String(t.studentClass) === classFilter)
    }

    // Method
    if (methodFilter !== 'all') {
      result = result.filter((t) => t.paymentMethod === methodFilter)
    }

    // Status
    if (statusFilter !== 'all') {
      result = result.filter((t) => t.paymentStatus === statusFilter)
    }

    // Collected By
    if (collectedByFilter !== 'all') {
      result = result.filter((t) => t.collectedBy === collectedByFilter)
    }

    // Month
    if (monthFilter !== 'all') {
      result = result.filter((t) => {
        if (!t.date) return false
        const m = t.date.slice(5, 7) // yyyy-mm-dd
        return m === monthFilter
      })
    }

    // Year
    if (yearFilter !== 'all') {
      result = result.filter((t) => {
        if (!t.date) return false
        const y = t.date.slice(0, 4)
        return y === yearFilter
      })
    }

    // Date Range
    if (startDate) {
      result = result.filter((t) => t.date >= startDate)
    }
    if (endDate) {
      result = result.filter((t) => t.date <= endDate)
    }

    // Sort order (default: newest first)
    result.sort((a, b) => {
      const timeA = a.createdAt || a.date + 'T' + a.time
      const timeB = b.createdAt || b.date + 'T' + b.time
      return sortOrder === 'desc' ? timeB.localeCompare(timeA) : timeA.localeCompare(timeB)
    })

    return result
  }, [
    transactions,
    searchTerm,
    sortOrder,
    classFilter,
    methodFilter,
    statusFilter,
    collectedByFilter,
    monthFilter,
    yearFilter,
    startDate,
    endDate,
  ])

  // Paginated list
  const paginatedTransactions = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return filteredTransactions.slice(start, start + pageSize)
  }, [filteredTransactions, currentPage])

  const totalPages = Math.ceil(filteredTransactions.length / pageSize) || 1

  // Statistics Calculations
  const stats = useMemo(() => {
    const now = new Date()
    const todayStr = now.toISOString().split('T')[0]

    // Calculate start of week (Sunday)
    const sunday = new Date(now)
    sunday.setDate(now.getDate() - now.getDay())
    const weekStartStr = sunday.toISOString().split('T')[0]

    const monthStr = now.toISOString().slice(0, 7) // yyyy-mm
    const yearStr = now.toISOString().slice(0, 4) // yyyy

    let todayCollection = 0
    let weekCollection = 0
    let monthCollection = 0
    let yearCollection = 0
    let totalCollected = 0
    let totalRevenue = 0 // sum of all success payments

    let totalTxCount = 0
    let onlineCount = 0
    let manualCount = 0
    let pendingCount = 0
    let failedCount = 0
    let refundCount = 0

    transactions.forEach((t) => {
      totalTxCount++
      const amount = t.amount || 0

      if (t.paymentStatus === 'success') {
        totalRevenue += amount
        totalCollected += amount

        if (t.date === todayStr) {
          todayCollection += amount
        }
        if (t.date >= weekStartStr) {
          weekCollection += amount
        }
        if (t.date?.startsWith(monthStr)) {
          monthCollection += amount
        }
        if (t.date?.startsWith(yearStr)) {
          yearCollection += amount
        }

        if (t.paymentMethod === 'Razorpay') {
          onlineCount++
        } else {
          manualCount++
        }
      } else if (t.paymentStatus === 'pending') {
        pendingCount++
      } else if (t.paymentStatus === 'failed') {
        failedCount++
      } else if (t.paymentStatus === 'refunded') {
        refundCount++
      }
    })

    return {
      todayCollection,
      weekCollection,
      monthCollection,
      yearCollection,
      totalCollected,
      totalRevenue,
      totalTxCount,
      onlineCount,
      manualCount,
      pendingCount,
      failedCount,
      refundCount,
    }
  }, [transactions])

  // Export to CSV
  const handleExportCSV = () => {
    const headers = [
      'Transaction ID',
      'Date',
      'Time',
      'Student Name',
      'Student ID',
      'Class',
      'Type',
      'Amount',
      'Discount',
      'Fine',
      'Net Amount',
      'Method',
      'Status',
      'Source',
      'Collected By',
      'Receipt Number',
      'Razorpay Payment ID',
      'Razorpay Order ID',
      'Notes',
    ]

    const rows = filteredTransactions.map((t) => [
      t.id,
      t.date,
      t.time,
      t.studentName,
      t.studentId,
      t.studentClass,
      t.transactionType,
      t.amount,
      t.discount || 0,
      t.fine || 0,
      t.netAmount,
      t.paymentMethod,
      t.paymentStatus,
      t.collectionSource,
      t.collectedBy,
      t.receiptNumber,
      t.razorpayPaymentId || '',
      t.razorpayOrderId || '',
      (t.notes || '').replace(/"/g, '""'),
    ])

    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((e) => e.map((val) => `"${val}"`).join(','))].join('\n')

    const encodedUri = encodeURI(csvContent)
    const link = document.createElement('a')
    link.setAttribute('href', encodedUri)
    link.setAttribute('download', `Transaction_Ledger_${new Date().toISOString().split('T')[0]}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  // Print Window Trigger
  const handlePrint = () => {
    window.print()
  }



  return (
    <main className="p-6 md:p-8 space-y-8 max-w-7xl mx-auto pb-24">
      {/* Title Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border pb-5 print:hidden">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-foreground flex items-center gap-3">
            <History className="h-8 w-8 text-primary" strokeWidth={2.25} />
            Transaction Ledger
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Reconstructed historical financial events and real-time transaction tracking
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleExportCSV}
            className="inline-flex items-center gap-2 px-4 py-2 border border-border bg-card text-foreground hover:bg-muted text-xs font-semibold rounded-lg shadow-sm transition-all cursor-pointer"
          >
            <Download className="h-4 w-4 text-muted-foreground" /> Export Ledger (CSV)
          </button>
          <button
            onClick={handlePrint}
            className="inline-flex items-center gap-2 px-4 py-2 border border-border bg-card text-foreground hover:bg-muted text-xs font-semibold rounded-lg shadow-sm transition-all cursor-pointer"
          >
            <Printer className="h-4 w-4 text-muted-foreground" /> Print Statement
          </button>
        </div>
      </div>

      {/* Printable Heading */}
      <div className="hidden print:block border-b border-double border-slate-900 pb-5 mb-5 text-center">
        <h1 className="text-2xl font-bold uppercase tracking-widest text-slate-900">Shubh Classes</h1>
        <h2 className="text-md font-semibold text-slate-700 mt-1">Official Financial Transaction Statement</h2>
        <p className="text-[10px] text-slate-500 mt-1">Generated on: {new Date().toLocaleDateString()} at {new Date().toLocaleTimeString()}</p>
      </div>

      {/* Stats Summary Section */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 print:grid-cols-4 print:gap-2">
        <Card className="p-4 bg-slate-950 border-slate-900 flex flex-col justify-center shadow-md">
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Today's Collection</p>
          <p className="text-xl md:text-2xl font-black text-emerald-400 mt-1 tabular-nums">{formatINR(stats.todayCollection)}</p>
        </Card>
        <Card className="p-4 bg-card border-border flex flex-col justify-center shadow-sm">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">This Month</p>
          <p className="text-xl md:text-2xl font-black text-foreground mt-1 tabular-nums">{formatINR(stats.monthCollection)}</p>
        </Card>
        <Card className="p-4 bg-card border-border flex flex-col justify-center shadow-sm">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">This Year</p>
          <p className="text-xl md:text-2xl font-black text-foreground mt-1 tabular-nums">{formatINR(stats.yearCollection)}</p>
        </Card>
        <Card className="p-4 bg-slate-950 border-slate-900 flex flex-col justify-center shadow-md">
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Total Revenue</p>
          <p className="text-xl md:text-2xl font-black text-emerald-400 mt-1 tabular-nums">{formatINR(stats.totalRevenue)}</p>
        </Card>
      </div>

      {/* Second Level Stats Panel */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-3 print:hidden">
        <Card className="p-3 bg-muted/40 text-center rounded-lg">
          <p className="text-[9px] uppercase tracking-wider font-semibold text-muted-foreground">Transactions</p>
          <p className="text-lg font-bold text-foreground mt-0.5">{stats.totalTxCount}</p>
        </Card>
        <Card className="p-3 bg-muted/40 text-center rounded-lg">
          <p className="text-[9px] uppercase tracking-wider font-semibold text-muted-foreground font-medium text-emerald-500">Online Success</p>
          <p className="text-lg font-bold text-foreground mt-0.5">{stats.onlineCount}</p>
        </Card>
        <Card className="p-3 bg-muted/40 text-center rounded-lg">
          <p className="text-[9px] uppercase tracking-wider font-semibold text-muted-foreground font-medium text-indigo-500">Manual Success</p>
          <p className="text-lg font-bold text-foreground mt-0.5">{stats.manualCount}</p>
        </Card>
        <Card className="p-3 bg-muted/40 text-center rounded-lg">
          <p className="text-[9px] uppercase tracking-wider font-semibold text-muted-foreground font-medium text-amber-500">Pending</p>
          <p className="text-lg font-bold text-foreground mt-0.5">{stats.pendingCount}</p>
        </Card>
        <Card className="p-3 bg-muted/40 text-center rounded-lg">
          <p className="text-[9px] uppercase tracking-wider font-semibold text-muted-foreground font-medium text-rose-500">Failed</p>
          <p className="text-lg font-bold text-foreground mt-0.5">{stats.failedCount}</p>
        </Card>
        <Card className="p-3 bg-muted/40 text-center rounded-lg">
          <p className="text-[9px] uppercase tracking-wider font-semibold text-muted-foreground font-medium text-blue-500">Refunded</p>
          <p className="text-lg font-bold text-foreground mt-0.5">{stats.refundCount}</p>
        </Card>
      </div>

      {/* Search and Filters Drawer */}
      <div className="space-y-4 print:hidden">
        <div className="flex flex-col md:flex-row gap-3 items-center justify-between">
          <div className="relative w-full md:max-w-md">
            <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-muted-foreground">
              <Search className="h-4 w-4" />
            </span>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value)
                setCurrentPage(1)
              }}
              placeholder="Search by student, receipt, order, payment ID..."
              className="pl-9 pr-4 py-2 w-full text-sm rounded-lg border border-border bg-card text-foreground shadow-sm focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <div className="flex items-center gap-3 w-full md:w-auto">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={cn(
                'inline-flex items-center gap-2 px-4 py-2 border rounded-lg text-xs font-semibold shadow-sm transition-all cursor-pointer w-full md:w-auto justify-center',
                showFilters
                  ? 'border-primary/40 bg-primary/10 text-primary'
                  : 'border-border bg-card text-foreground hover:bg-muted'
              )}
            >
              <SlidersHorizontal className="h-4 w-4" /> Filters {showFilters ? 'Open' : 'Closed'}
            </button>
            <button
              onClick={() => {
                setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc')
                setCurrentPage(1)
              }}
              className="inline-flex items-center gap-2 px-4 py-2 border border-border bg-card text-foreground hover:bg-muted text-xs font-semibold rounded-lg shadow-sm transition-all cursor-pointer w-full md:w-auto justify-center"
            >
              <ArrowUpDown className="h-4 w-4 text-muted-foreground" /> Date: {sortOrder === 'desc' ? 'Newest First' : 'Oldest First'}
            </button>
            <button
              onClick={handleResetFilters}
              className="inline-flex items-center gap-2 px-3 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground transition-all cursor-pointer"
            >
              <RotateCcw className="h-4 w-4" /> Reset
            </button>
          </div>
        </div>

        {/* Collapsible filters box */}
        {showFilters && (
          <Card className="p-5 border border-border bg-muted/20 grid grid-cols-2 md:grid-cols-4 gap-4 animate-fade-in">
            {/* Class filter */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide">Class</label>
              <select
                value={classFilter}
                onChange={(e) => {
                  setClassFilter(e.target.value)
                  setCurrentPage(1)
                }}
                className="w-full text-xs border border-border bg-card rounded-md p-1.5 focus:outline-none"
              >
                <option value="all">All Classes</option>
                {Array.from({ length: 12 }, (_, i) => String(i + 1)).map((cls) => (
                  <option key={cls} value={cls}>
                    Class {cls}
                  </option>
                ))}
              </select>
            </div>

            {/* Payment Method filter */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide">Method</label>
              <select
                value={methodFilter}
                onChange={(e) => {
                  setMethodFilter(e.target.value)
                  setCurrentPage(1)
                }}
                className="w-full text-xs border border-border bg-card rounded-md p-1.5 focus:outline-none"
              >
                <option value="all">All Methods</option>
                <option value="Cash">Cash</option>
                <option value="UPI">UPI</option>
                <option value="Card">Card</option>
                <option value="Bank Transfer">Bank Transfer</option>
                <option value="Razorpay">Razorpay (Online)</option>
              </select>
            </div>

            {/* Payment Status filter */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide">Status</label>
              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value)
                  setCurrentPage(1)
                }}
                className="w-full text-xs border border-border bg-card rounded-md p-1.5 focus:outline-none"
              >
                <option value="all">All Statuses</option>
                <option value="success">Success</option>
                <option value="pending">Pending</option>
                <option value="failed">Failed</option>
                <option value="refunded">Refunded</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>

            {/* Collected By filter */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide">Collected By</label>
              <select
                value={collectedByFilter}
                onChange={(e) => {
                  setCollectedByFilter(e.target.value)
                  setCurrentPage(1)
                }}
                className="w-full text-xs border border-border bg-card rounded-md p-1.5 focus:outline-none"
              >
                <option value="all">All Collectors</option>
                {collectorsList.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            {/* Date Range filters */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide">From Date</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value)
                  setCurrentPage(1)
                }}
                className="w-full text-xs border border-border bg-card rounded-md p-1.5 focus:outline-none"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide">To Date</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => {
                  setEndDate(e.target.value)
                  setCurrentPage(1)
                }}
                className="w-full text-xs border border-border bg-card rounded-md p-1.5 focus:outline-none"
              />
            </div>

            {/* Month & Year filter */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide">Month</label>
              <select
                value={monthFilter}
                onChange={(e) => {
                  setMonthFilter(e.target.value)
                  setCurrentPage(1)
                }}
                className="w-full text-xs border border-border bg-card rounded-md p-1.5 focus:outline-none"
              >
                <option value="all">All Months</option>
                {Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0')).map((m) => (
                  <option key={m} value={m}>
                    {new Date(2000, Number(m) - 1).toLocaleDateString('en-IN', { month: 'long' })}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide">Year</label>
              <select
                value={yearFilter}
                onChange={(e) => {
                  setYearFilter(e.target.value)
                  setCurrentPage(1)
                }}
                className="w-full text-xs border border-border bg-card rounded-md p-1.5 focus:outline-none"
              >
                <option value="all">All Years</option>
                <option value="2026">2026</option>
                <option value="2025">2025</option>
              </select>
            </div>
          </Card>
        )}
      </div>

      {/* Ledger Table Container */}
      <Card className="overflow-hidden border border-border bg-card shadow-sm">
        {loading ? (
          <div className="text-center py-20 text-sm text-muted-foreground">Loading transaction ledger...</div>
        ) : filteredTransactions.length === 0 ? (
          <div className="text-center py-20">
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground mb-4">
              <FileText className="h-6 w-6" />
            </span>
            <p className="text-sm font-semibold">No transactions found</p>
            <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
              No money movements match the current filter or search criteria.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-border bg-muted/30 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  <th className="py-3.5 px-4">Student</th>
                  <th className="py-3.5 px-4">Class</th>
                  <th className="py-3.5 px-4">Type</th>
                  <th className="py-3.5 px-4 text-right">Amount</th>
                  <th className="py-3.5 px-4 text-right">Discount</th>
                  <th className="py-3.5 px-4 text-right">Fine</th>
                  <th className="py-3.5 px-4 text-right">Net Amount</th>
                  <th className="py-3.5 px-4">Method</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4">Date & Time</th>
                  <th className="py-3.5 px-4">Receipt No.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60 text-xs">
                {paginatedTransactions.map((tx) => {
                    return (
                      <tr
                        key={tx.id}
                        onClick={() => setSelectedTx(tx)}
                        className="hover:bg-muted/30 cursor-pointer transition-colors active:bg-muted/50"
                      >
                        <td className="py-3.5 px-4 font-semibold text-foreground">
                          {tx.studentName}
                          <span className="block text-[10px] text-muted-foreground font-medium font-mono">{tx.studentId}</span>
                        </td>
                        <td className="py-3.5 px-4 font-medium text-foreground">Class {tx.studentClass}</td>
                        <td className="py-3.5 px-4">
                          <span className="capitalize px-2 py-0.5 bg-muted rounded font-medium text-foreground">
                            {tx.transactionType === 'failed_attempt' ? 'Failed Attempt' : tx.transactionType}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-right font-semibold text-foreground tabular-nums">
                          {formatINR(tx.amount)}
                        </td>
                        <td className="py-3.5 px-4 text-right font-medium text-muted-foreground tabular-nums">
                          {tx.discount ? `-${formatINR(tx.discount)}` : '—'}
                        </td>
                        <td className="py-3.5 px-4 text-right font-medium text-rose-500 tabular-nums">
                          {tx.fine ? `+${formatINR(tx.fine)}` : '—'}
                        </td>
                        <td className="py-3.5 px-4 text-right font-bold text-foreground tabular-nums">
                          {formatINR(tx.netAmount)}
                        </td>
                        <td className="py-3.5 px-4 font-medium text-muted-foreground">{tx.paymentMethod}</td>
                        <td className="py-3.5 px-4">
                          <TransactionStatusPill status={tx.paymentStatus} />
                        </td>
                      <td className="py-3.5 px-4 text-muted-foreground">
                        <span className="block font-medium text-foreground">{formatLongDate(tx.date)}</span>
                        <span className="block text-[10px]">{tx.time}</span>
                      </td>
                      <td className="py-3.5 px-4 font-mono text-muted-foreground font-medium">{tx.receiptNumber}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Table Pagination Footer */}
        {!loading && filteredTransactions.length > 0 && (
          <div className="border-t border-border px-4 py-4 flex items-center justify-between gap-4 print:hidden">
            <span className="text-xs text-muted-foreground font-medium">
              Showing {(currentPage - 1) * pageSize + 1} to{' '}
              {Math.min(currentPage * pageSize, filteredTransactions.length)} of{' '}
              {filteredTransactions.length} entries
            </span>
            <div className="flex items-center gap-1.5">
              <button
                disabled={currentPage === 1}
                onClick={() => setCurrentPage((c) => Math.max(c - 1, 1))}
                className="px-3 py-1.5 border border-border rounded bg-card text-xs font-semibold text-foreground hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                Previous
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((pg) => {
                const active = pg === currentPage
                return (
                  <button
                    key={pg}
                    onClick={() => setCurrentPage(pg)}
                    className={cn(
                      'w-8 h-8 rounded text-xs font-bold border transition-all cursor-pointer',
                      active
                        ? 'bg-primary border-primary text-primary-foreground'
                        : 'border-border bg-card text-foreground hover:bg-muted'
                    )}
                  >
                    {pg}
                  </button>
                )
              })}
              <button
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage((c) => Math.min(c + 1, totalPages))}
                className="px-3 py-1.5 border border-border rounded bg-card text-xs font-semibold text-foreground hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </Card>

      {/* Transaction Details Modal */}
      {selectedTx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 py-10 backdrop-blur-sm animate-fade-in print:hidden">
          <Card className="w-full max-w-2xl bg-card border border-border shadow-2xl overflow-hidden rounded-xl animate-scale-up max-h-[85vh] flex flex-col">
            {/* Modal Header */}
            <div className="border-b border-border p-5 flex items-center justify-between bg-muted/20">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <History className="h-5 w-5" />
                </span>
                <div>
                  <h3 className="font-bold text-base text-foreground">Transaction Ledger Details</h3>
                  <p className="text-xs text-muted-foreground font-mono mt-0.5">ID: {selectedTx.id}</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedTx(null)}
                className="h-8 w-8 inline-flex items-center justify-center rounded-full hover:bg-muted text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Content Scrollable */}
            <div className="p-6 overflow-y-auto space-y-6 text-sm divide-y divide-border/60">
              {/* Student info */}
              <div className="grid grid-cols-2 gap-4 pb-4">
                <div>
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide block mb-1">Student</span>
                  <p className="font-bold text-base text-foreground">{selectedTx.studentName}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Roll No: {selectedTx.studentRoll || 'N/A'}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Phone: {selectedTx.studentPhone || 'N/A'}</p>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide block mb-1">Class & Profile</span>
                  <p className="font-semibold text-sm text-foreground">Class {selectedTx.studentClass}</p>
                  <Link
                    href={`/students/${selectedTx.studentId}`}
                    onClick={() => setSelectedTx(null)}
                    className="text-xs text-primary hover:underline font-medium inline-flex items-center gap-1 mt-1"
                  >
                    View Full Profile <ExternalLink className="h-3 w-3" />
                  </Link>
                </div>
              </div>

              {/* Financial Calculation breakdown */}
              <div className="py-4 space-y-3">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide block">Financial Ledger Breakdown</span>
                <div className="grid grid-cols-3 gap-4 bg-muted/30 p-4 rounded-lg border border-border/55">
                  <div>
                    <span className="text-[10px] text-muted-foreground font-medium block">Base Amount</span>
                    <p className="font-bold text-base text-foreground mt-0.5 tabular-nums">{formatINR(selectedTx.amount)}</p>
                  </div>
                  <div>
                    <span className="text-[10px] text-muted-foreground font-medium block">Discount Allowed</span>
                    <p className="font-bold text-base text-muted-foreground mt-0.5 tabular-nums">
                      {selectedTx.discount ? `-${formatINR(selectedTx.discount)}` : '—'}
                    </p>
                  </div>
                  <div>
                    <span className="text-[10px] text-muted-foreground font-medium block">Late Fine Collected</span>
                    <p className="font-bold text-base text-rose-500 mt-0.5 tabular-nums">
                      {selectedTx.fine ? `+${formatINR(selectedTx.fine)}` : '—'}
                    </p>
                  </div>
                </div>
                <div className="flex justify-between items-center pt-2 px-1">
                  <span className="font-bold text-sm">Net Transaction Amount</span>
                  <span className="font-extrabold text-lg text-emerald-500 tabular-nums">{formatINR(selectedTx.netAmount)}</span>
                </div>
              </div>

              {/* Status and Gateway metadata */}
              <div className="py-4 grid grid-cols-2 gap-4">
                <div>
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide block mb-1">Receipt Details</span>
                  <p className="font-medium text-foreground">Method: <span className="font-bold">{selectedTx.paymentMethod}</span></p>
                  <p className="text-xs text-muted-foreground mt-1">Status: <span className="capitalize font-semibold">{selectedTx.paymentStatus}</span></p>
                  <p className="text-xs text-muted-foreground mt-1">Receipt: <span className="font-mono font-semibold">{selectedTx.receiptNumber}</span></p>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide block mb-1">Audit Details</span>
                  <p className="text-xs text-muted-foreground">Source: <span className="font-medium text-foreground">{selectedTx.collectionSource}</span></p>
                  <p className="text-xs text-muted-foreground mt-1">Collected By: <span className="font-medium text-foreground">{selectedTx.collectedBy}</span></p>
                  <p className="text-xs text-muted-foreground mt-1">Firestore Doc: <span className="font-mono text-foreground font-medium">{selectedTx.docRef || 'N/A'}</span></p>
                </div>
              </div>

              {/* Razorpay Gateway Payload details */}
              {selectedTx.paymentMethod === 'Razorpay' && (
                <div className="py-4 space-y-2">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide block">Razorpay Gateway Integration Metadata</span>
                  <div className="text-xs space-y-1 font-mono bg-muted/50 p-3 rounded border border-border">
                    <p><span className="text-muted-foreground">Payment ID:</span> {selectedTx.razorpayPaymentId || '—'}</p>
                    <p><span className="text-muted-foreground">Order ID:</span> {selectedTx.razorpayOrderId || '—'}</p>
                    <p><span className="text-muted-foreground">Verify Status:</span> {selectedTx.verificationStatus || 'N/A'}</p>
                    {selectedTx.gatewayResponse && (
                      <details className="mt-2 text-[11px] cursor-pointer">
                        <summary className="text-primary font-semibold hover:underline">Inspect Raw Gateway Response</summary>
                        <pre className="overflow-x-auto text-[10px] bg-card p-2 border rounded mt-2 text-muted-foreground select-text max-h-40">
                          {JSON.stringify(selectedTx.gatewayResponse, null, 2)}
                        </pre>
                      </details>
                    )}
                  </div>
                </div>
              )}

              {/* Transaction history timeline */}
              {selectedTx.timeline && selectedTx.timeline.length > 0 && (
                <div className="py-4 space-y-3">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide block">Transaction Lifecycle Timeline</span>
                  <ol className="relative ml-2 flex flex-col gap-4 border-l border-border pl-5">
                    {selectedTx.timeline.map((step, idx) => (
                      <li key={idx} className="relative">
                        <span className="absolute -left-[25px] top-1.5 h-2 w-2 rounded-full bg-primary ring-4 ring-primary/10" />
                        <div className="space-y-0.5">
                          <p className="text-xs font-semibold text-foreground capitalize">{step.status}</p>
                          <p className="text-[10px] text-muted-foreground">{step.remarks}</p>
                          <p className="text-[9px] text-muted-foreground/80 font-medium">
                            {new Date(step.timestamp).toLocaleString()}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ol>
                </div>
              )}

              {/* Notes */}
              {selectedTx.notes && (
                <div className="py-4">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide block mb-1">Remarks / Notes</span>
                  <p className="text-xs bg-muted/30 p-2.5 rounded border border-border italic text-muted-foreground">{selectedTx.notes}</p>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="border-t border-border p-4 bg-muted/10 flex justify-end">
              <button
                onClick={() => setSelectedTx(null)}
                className="px-4 py-2 border border-border bg-card hover:bg-muted text-xs font-bold rounded-lg cursor-pointer transition-all"
              >
                Close Ledger
              </button>
            </div>
          </Card>
        </div>
      )}
    </main>
  )
}
