'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { X } from 'lucide-react'
import { Card, PageHeader, StatusPill, Avatar } from '@/components/ui-bits'
import { useAppData } from '@/components/state/app-data-provider'
import { formatINR } from '@/lib/domain'
import { cn } from '@/lib/utils'

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export default function CalendarPage() {
  const { calendarPayments } = useAppData()
  const [selected, setSelected] = useState<number | null>(null)
  const now = new Date()
  const monthLabel = now.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
  const currentDay = now.getDate()
  const firstDayIndex = new Date(now.getFullYear(), now.getMonth(), 1).getDay()
  const offset = (firstDayIndex + 6) % 7
  const totalDays = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  const payments = selected != null ? (calendarPayments[selected] ?? []) : []

  const days = useMemo(() => Array.from({ length: totalDays }, (_, index) => index + 1), [totalDays])

  return (
    <div>
      <PageHeader
        eyebrow="Payment Calendar"
        title={monthLabel}
        sub="Green means paid, yellow is upcoming, red is overdue. Tap a date to see its payments."
      />

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="p-5 md:p-7 lg:col-span-2 animate-fade-up [animation-delay:60ms]">
          <div className="mb-3 grid grid-cols-7">
            {DAYS.map((day) => (
              <span key={day} className="micro-label py-2 text-center">
                {day}
              </span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1.5">
            {Array.from({ length: offset }).map((_, index) => (
              <span key={`empty-${index}`} aria-hidden="true" />
            ))}
            {days.map((day) => {
              const dayPayments = calendarPayments[day]
              const isToday = day === currentDay
              const isSelected = day === selected
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => setSelected(dayPayments ? day : day)}
                  className={cn(
                    'relative flex aspect-square flex-col items-center justify-center gap-1 rounded-2xl text-sm transition-all duration-200',
                    isSelected
                      ? 'bg-primary text-primary-foreground shadow-[0_4px_14px_oklch(0.55_0.16_255/0.35)]'
                      : isToday
                        ? 'bg-accent font-semibold text-accent-foreground'
                        : dayPayments
                          ? 'hover:bg-muted'
                          : 'text-muted-foreground hover:bg-muted/60',
                  )}
                >
                  <span className="tabular">{day}</span>
                  {dayPayments && dayPayments.length > 0 && (
                    <span className="flex gap-1">
                      {dayPayments.slice(0, 3).map((payment) => (
                        <span
                          key={payment.id}
                          className={cn(
                            'h-1.5 w-1.5 rounded-full',
                            isSelected ? 'bg-primary-foreground' : payment.status === 'paid' ? 'bg-success' : payment.status === 'overdue' ? 'bg-destructive' : 'bg-warning',
                          )}
                        />
                      ))}
                    </span>
                  )}
                  {isToday && !isSelected && (
                    <span className="micro-label absolute bottom-1 hidden text-[8px] md:block">
                      today
                    </span>
                  )}
                </button>
              )
            })}
          </div>
          <div className="mt-6 flex flex-wrap items-center gap-5 border-t border-border pt-5 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-success" /> Paid
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-warning" /> Upcoming
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-destructive" /> Overdue
            </span>
          </div>
        </Card>

        <Card className="p-6 animate-fade-up [animation-delay:120ms]">
          {selected == null ? (
            <div className="flex h-full min-h-64 flex-col items-center justify-center gap-3 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-lg">
                <span className="tabular font-semibold text-muted-foreground">
                  {currentDay}
                </span>
              </span>
              <p className="text-sm font-medium">Pick a date</p>
              <p className="max-w-48 text-xs leading-relaxed text-muted-foreground">
                Dates with dots have payments. Tap one to see the details here.
              </p>
            </div>
          ) : (
            <>
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <p className="micro-label mb-1">
                    {selected} {now.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}
                  </p>
                  <h2 className="text-base font-semibold tracking-tight">
                    {payments.length} payment{payments.length !== 1 ? 's' : ''}
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => setSelected(null)}
                  aria-label="Clear selection"
                  className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <ul className="flex flex-col gap-2">
                {payments.map((payment) => (
                  <li key={payment.id}>
                    <Link
                      href={`/students/${payment.studentId}`}
                      className="flex items-center gap-3 rounded-2xl border border-border p-3.5 transition-colors hover:bg-muted/60"
                    >
                      <Avatar name={payment.studentName} size="sm" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">
                          {payment.studentName}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {payment.label}
                        </span>
                      </span>
                      <span className="flex flex-col items-end gap-1">
                        <span className="tabular text-sm font-semibold">
                          {formatINR(payment.amount)}
                        </span>
                        <StatusPill status={payment.status} />
                      </span>
                    </Link>
                  </li>
                ))}
                {payments.length === 0 && (
                  <li className="px-2 py-3 text-sm text-muted-foreground">
                    No fee is due on this date.
                  </li>
                )}
              </ul>
            </>
          )}
        </Card>
      </div>
    </div>
  )
}

