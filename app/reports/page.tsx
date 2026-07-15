'use client'

import { useState } from 'react'
import { TrendingUp, Lock } from 'lucide-react'
import { Card, PageHeader } from '@/components/ui-bits'
import {
  IncomeBar,
  ExpenseBar,
  ProfitLine,
} from '@/components/reports/report-charts'
import { useAppData } from '@/components/state/app-data-provider'
import { formatINR } from '@/lib/domain'

export default function ReportsPage() {
  const { stats, monthlySeries, revenueUnlocked, setRevenueUnlocked } = useAppData()
  const [unlockPassword, setUnlockPassword] = useState('')
  const [unlockError, setUnlockError] = useState<string | null>(null)

  function submitUnlock(e: React.FormEvent) {
    e.preventDefault()
    if (unlockPassword.trim() === '2006') {
      setRevenueUnlocked(true)
      setUnlockError(null)
      setUnlockPassword('')
    } else {
      setUnlockError('Incorrect password.')
      setUnlockPassword('')
    }
  }

  const profitPct = stats.monthCollection > 0 ? Math.round((stats.netProfit / stats.monthCollection) * 100) : 0

  if (!revenueUnlocked) {
    return (
      <div>
        <PageHeader
          eyebrow="Reports"
          title="How much did I earn?"
          sub="Three graphs and one honest answer. Nothing more."
        />
        <div className="flex min-h-[45vh] flex-col items-center justify-center gap-4 text-center py-10 animate-fade-up">
          <div className="rounded-full bg-primary/10 p-3.5 text-primary">
            <Lock className="h-6 w-6" />
          </div>
          <h2 className="text-base font-bold tracking-tight">Reports are Locked</h2>
          <p className="text-xs text-muted-foreground max-w-xs">
            Please enter the owner passcode to view financial analytics and graphs.
          </p>
          <form onSubmit={submitUnlock} className="flex gap-2 w-full max-w-xs mt-2">
            <input
              type="password"
              placeholder="Passcode"
              value={unlockPassword}
              onChange={(e) => setUnlockPassword(e.target.value)}
              className="h-10 flex-1 rounded-xl border border-border px-3 text-sm outline-none bg-card focus:border-ring"
            />
            <button
              type="submit"
              className="h-10 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90"
            >
              Unlock
            </button>
          </form>
          {unlockError && <p className="text-xs text-destructive">{unlockError}</p>}
        </div>
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        eyebrow="Reports"
        title="How much did I earn?"
        sub="Three graphs and one honest answer. Nothing more."
      />

      <Card className="mb-5 overflow-hidden bg-foreground text-background animate-fade-up [animation-delay:60ms]">
        <div className="grid gap-6 p-7 md:grid-cols-4 md:gap-4 md:p-9">
          <div>
            <p className="font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-background/60">
              Income
            </p>
            <p className="tabular mt-2 text-2xl font-semibold tracking-tight md:text-3xl">
              {formatINR(stats.monthCollection)}
            </p>
          </div>
          <div>
            <p className="font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-background/60">
              Expenses
            </p>
            <p className="tabular mt-2 text-2xl font-semibold tracking-tight md:text-3xl">
              {formatINR(stats.monthExpenses)}
            </p>
          </div>
          <div>
            <p className="font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-background/60">
              All-Time Net Profit
            </p>
            <p className="tabular mt-2 text-2xl font-semibold tracking-tight md:text-3xl">
              {formatINR(stats.netProfit)}
            </p>
          </div>
          <div>
            <p className="font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-background/60">
              Profit %
            </p>
            <p className="tabular mt-2 flex items-center gap-2 text-2xl font-semibold tracking-tight md:text-3xl">
              {profitPct}%
              <TrendingUp className="h-5 w-5 text-background/60" strokeWidth={1.75} />
            </p>
          </div>
        </div>
        <div className="border-t border-background/10 px-7 py-5 md:px-9">
          <p className="text-sm leading-relaxed text-background/75 text-pretty">
            Your coaching has earned {formatINR(stats.netProfit)} net profit overall.
            Expenses are being tracked live from Firestore.
          </p>
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="p-6 animate-fade-up [animation-delay:120ms]">
          <p className="micro-label mb-1">Graph 1</p>
          <h2 className="mb-5 text-base font-semibold tracking-tight">
            Monthly Income
          </h2>
          <IncomeBar data={monthlySeries} />
        </Card>
        <Card className="p-6 animate-fade-up [animation-delay:160ms]">
          <p className="micro-label mb-1">Graph 2</p>
          <h2 className="mb-5 text-base font-semibold tracking-tight">
            Monthly Expense
          </h2>
          <ExpenseBar data={monthlySeries} />
        </Card>
        <Card className="p-6 animate-fade-up [animation-delay:200ms]">
          <p className="micro-label mb-1">Graph 3</p>
          <h2 className="mb-5 text-base font-semibold tracking-tight">
            Profit Trend
          </h2>
          <ProfitLine data={monthlySeries} />
        </Card>
      </div>
    </div>
  )
}
