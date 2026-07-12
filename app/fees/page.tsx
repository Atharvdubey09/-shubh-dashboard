'use client'

import Link from 'next/link'
import { CircleCheck, Clock, CircleAlert } from 'lucide-react'
import { Card, PageHeader, Avatar } from '@/components/ui-bits'
import { useAppData } from '@/components/state/app-data-provider'
import { formatINR, formatLongDate } from '@/lib/domain'
import { cn } from '@/lib/utils'

export default function FeesPage() {
  const { students } = useAppData()

  const feeTypes = [
    {
      title: 'Full Payment',
      desc: 'One-time payment for the full year. No dues, no follow-ups.',
      count: students.filter((student) => student.paymentType === 'Full Payment').length,
    },
    {
      title: 'Monthly Payment',
      desc: 'A fixed amount on a fixed date. Future dues are created automatically.',
      count: students.filter((student) => student.paymentType === 'Monthly').length,
    },
    {
      title: 'Split Payment',
      desc: 'Custom installments you decide with the parent. Shown as a simple timeline.',
      count: students.filter((student) => student.paymentType === 'Split').length,
    },
  ]

  const pendingStudents = students
    .filter((student) => student.pending > 0)
    .sort((a, b) => b.pending - a.pending)
  const paidUp = students.filter((student) => student.pending === 0)
  const splitStudent = students.find((student) => student.paymentType === 'Split') ?? students[0]

  return (
    <div>
      <PageHeader
        eyebrow="Fees"
        title="Who has paid, and who hasn't?"
        sub={`${paidUp.length} students fully paid · ${pendingStudents.length} with pending fees`}
      />

      <div className="mb-5 grid gap-3 md:grid-cols-3 animate-fade-up [animation-delay:60ms]">
        {feeTypes.map((feeType) => (
          <Card key={feeType.title} className="p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold">{feeType.title}</h2>
              <span className="tabular rounded-full bg-accent px-2.5 py-1 text-xs font-semibold text-accent-foreground">
                {feeType.count}
              </span>
            </div>
            <p className="text-sm leading-relaxed text-muted-foreground text-pretty">
              {feeType.desc}
            </p>
          </Card>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-5">
        <Card className="p-6 lg:col-span-3 animate-fade-up [animation-delay:120ms]">
          <p className="micro-label mb-1">Needs attention</p>
          <h2 className="mb-5 text-base font-semibold tracking-tight">
            Pending Fees
          </h2>
          <ul className="flex flex-col">
            {pendingStudents.map((student) => {
              const due = student.feeSchedule.find((item) => item.status !== 'paid')
              return (
                <li key={student.id}>
                  <Link
                    href={`/students/${student.id}`}
                    className="flex items-center gap-3 rounded-2xl px-2 py-3 transition-colors hover:bg-muted/70"
                  >
                    <Avatar name={student.name} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {student.name}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        Class {student.class} · {student.paymentType}
                        {due ? ` · next due ${formatLongDate(due.dueDate)}` : ''}
                      </span>
                    </span>
                    <span className="tabular text-sm font-semibold text-warning-foreground">
                      {formatINR(student.pending)}
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>

          <div className="mt-5 border-t border-border pt-5">
            <p className="micro-label mb-3">Fully paid</p>
            <div className="flex flex-wrap gap-2">
              {paidUp.map((student) => (
                <Link
                  key={student.id}
                  href={`/students/${student.id}`}
                  className="flex items-center gap-1.5 rounded-full bg-success/10 py-1.5 pl-2 pr-3 text-xs font-medium text-success transition-transform hover:scale-105"
                >
                  <CircleCheck className="h-3.5 w-3.5" strokeWidth={2} />
                  {student.name.split(' ')[0]}
                </Link>
              ))}
            </div>
          </div>
        </Card>

        <Card className="p-6 lg:col-span-2 animate-fade-up [animation-delay:180ms]">
          <p className="micro-label mb-1">Split Payment</p>
          <h2 className="mb-1 text-base font-semibold tracking-tight">
            {splitStudent?.name ?? 'No split students'}
          </h2>
          <p className="mb-6 text-xs text-muted-foreground">
            {splitStudent ? `${formatINR(splitStudent.totalFee)} total · ${splitStudent.paymentType} plan` : 'Add a split-plan student to see the timeline here.'}
          </p>
          <ol className="relative ml-2 flex flex-col gap-7 border-l border-border pl-6">
            {(splitStudent?.feeSchedule.length ? splitStudent.feeSchedule : []).map((step) => (
              <li key={step.id} className="relative">
                <span
                  className={cn(
                    'absolute -left-[31px] top-0.5 flex h-5 w-5 items-center justify-center rounded-full ring-4',
                    step.status === 'paid'
                      ? 'bg-success text-success-foreground ring-success/15'
                      : 'bg-warning text-warning-foreground ring-warning/20',
                  )}
                >
                  {step.status === 'paid' ? (
                    <CircleCheck className="h-3 w-3" strokeWidth={2.5} />
                  ) : (
                    <Clock className="h-3 w-3" strokeWidth={2.5} />
                  )}
                </span>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">{step.label}</p>
                    <p className="text-xs text-muted-foreground">
                      {step.status === 'paid' ? `Paid on ${formatLongDate(step.dueDate)}` : `Due ${formatLongDate(step.dueDate)}`}
                    </p>
                  </div>
                  <p className="tabular text-sm font-semibold">
                    {formatINR(step.amount)}
                  </p>
                </div>
              </li>
            ))}
          </ol>
          <div className="mt-7 flex items-start gap-2.5 rounded-2xl bg-accent p-4">
            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-accent-foreground" strokeWidth={1.75} />
            <p className="text-xs leading-relaxed text-accent-foreground text-pretty">
              {splitStudent
                ? `${formatINR(splitStudent.pending)} is still pending for ${splitStudent.name}.`
                : 'Split payment timelines will appear automatically once a split-plan student exists.'}
            </p>
          </div>
        </Card>
      </div>
    </div>
  )
}
