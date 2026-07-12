'use client'

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts'
import { type MonthlySeriesPoint } from '@/lib/domain'

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: { name: string; value: number }[]
  label?: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-xl border border-border bg-popover px-3.5 py-2.5 shadow-lg">
      <p className="micro-label mb-1">{label} {new Date().getFullYear()}</p>
      <p className="tabular text-sm font-semibold">
        ₹{payload[0].value.toLocaleString('en-IN')}
      </p>
    </div>
  )
}

const axisProps = {
  axisLine: false,
  tickLine: false,
  tick: { fontSize: 11, fill: 'var(--color-muted-foreground)' },
} as const

export function IncomeBar({ data }: { data: MonthlySeriesPoint[] }) {
  return (
    <div className="h-52 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 4, left: -14, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--color-border)" />
          <XAxis dataKey="month" {...axisProps} dy={6} />
          <YAxis {...axisProps} tickFormatter={(v: number) => `${Math.round(v / 1000)}k`} />
          <Tooltip content={<ChartTooltip />} cursor={{ fill: 'var(--color-muted)' }} />
          <Bar
            dataKey="income"
            fill="var(--color-primary)"
            radius={[8, 8, 2, 2]}
            animationDuration={800}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

export function ExpenseBar({ data }: { data: MonthlySeriesPoint[] }) {
  return (
    <div className="h-52 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 4, left: -14, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--color-border)" />
          <XAxis dataKey="month" {...axisProps} dy={6} />
          <YAxis {...axisProps} tickFormatter={(v: number) => `${Math.round(v / 1000)}k`} />
          <Tooltip content={<ChartTooltip />} cursor={{ fill: 'var(--color-muted)' }} />
          <Bar
            dataKey="expense"
            fill="var(--color-chart-2)"
            radius={[8, 8, 2, 2]}
            animationDuration={800}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

export function ProfitLine({ data }: { data: MonthlySeriesPoint[] }) {
  const profitSeries = data.map((m) => ({
    month: m.month,
    profit: m.income - m.expense,
  }))
  return (
    <div className="h-52 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={profitSeries} margin={{ top: 8, right: 4, left: -14, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--color-border)" />
          <XAxis dataKey="month" {...axisProps} dy={6} />
          <YAxis {...axisProps} tickFormatter={(v: number) => `${Math.round(v / 1000)}k`} />
          <Tooltip content={<ChartTooltip />} cursor={{ stroke: 'var(--color-border)' }} />
          <Line
            type="monotone"
            dataKey="profit"
            stroke="var(--color-chart-3)"
            strokeWidth={2.5}
            dot={{ r: 3, fill: 'var(--color-chart-3)', strokeWidth: 0 }}
            activeDot={{ r: 5 }}
            animationDuration={900}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
