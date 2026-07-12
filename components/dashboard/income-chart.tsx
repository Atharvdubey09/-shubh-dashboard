'use client'

import {
  ResponsiveContainer,
  AreaChart,
  Area,
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
      <p className="micro-label mb-1.5">{label} {new Date().getFullYear()}</p>
      {payload.map((p) => (
        <p key={p.name} className="tabular text-sm font-medium">
          <span className="capitalize text-muted-foreground">{p.name}: </span>
          ₹{p.value.toLocaleString('en-IN')}
        </p>
      ))}
    </div>
  )
}

export function IncomeChart({ data }: { data: MonthlySeriesPoint[] }) {
  return (
    <div className="h-64 w-full md:h-72">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={data}
          margin={{ top: 8, right: 4, left: -8, bottom: 0 }}
        >
          <defs>
            <linearGradient id="incomeFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.14} />
              <stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid
            vertical={false}
            stroke="var(--color-border)"
            strokeDasharray="0"
          />
          <XAxis
            dataKey="month"
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 11, fill: 'var(--color-muted-foreground)' }}
            dy={8}
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 11, fill: 'var(--color-muted-foreground)' }}
            tickFormatter={(v: number) => `${Math.round(v / 1000)}k`}
            width={44}
          />
          <Tooltip content={<ChartTooltip />} cursor={{ stroke: 'var(--color-border)' }} />
          <Area
            type="monotone"
            dataKey="income"
            stroke="var(--color-primary)"
            strokeWidth={2}
            fill="url(#incomeFill)"
            animationDuration={900}
          />
          <Area
            type="monotone"
            dataKey="expense"
            stroke="var(--color-chart-2)"
            strokeWidth={2}
            strokeDasharray="5 5"
            fill="transparent"
            animationDuration={900}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
