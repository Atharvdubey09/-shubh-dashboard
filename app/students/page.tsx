'use client'

import Link from 'next/link'
import { ChevronRight, Plus, Eye, Edit2, Trash2, KeyRound } from 'lucide-react'
import { Card, PageHeader, StatusPill, Avatar } from '@/components/ui-bits'
import { useAppData } from '@/components/state/app-data-provider'
import { useAuth } from '@/components/state/auth-provider'
import { useQuickAdd } from '@/components/shell/quick-add-context'
import { filterStudents } from '@/lib/firestore'
import { formatINR } from '@/lib/domain'
import { cn } from '@/lib/utils'
import { useMemo, useState } from 'react'
import { useToast } from '@/components/ui/toast'

export default function StudentsPage() {
  const { students, deleteStudent, loading } = useAppData()
  const { userRole } = useAuth()
  const { openQuickAdd } = useQuickAdd()
  const { toast } = useToast()
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all')
  const [paymentFilter, setPaymentFilter] = useState<'all' | 'Full Payment' | 'Monthly' | 'Split'>('all')

  const [gateOpen, setGateOpen] = useState(false)
  const [gateAction, setGateAction] = useState<'edit' | 'delete' | null>(null)
  const [gateValue, setGateValue] = useState('')
  const [gateError, setGateError] = useState('')
  const [targetStudentId, setTargetStudentId] = useState<string | null>(null)
  const [targetStudentName, setTargetStudentName] = useState('')

  function openProtectedAction(action: 'edit' | 'delete', studentId: string, name: string) {
    setGateAction(action)
    setTargetStudentId(studentId)
    setTargetStudentName(name)
    setGateValue('')
    setGateError('')
    setGateOpen(true)
  }

  async function handleDelete(studentId: string, name: string) {
    const confirmed = window.confirm(`Delete ${name}? This will remove the student from active listings.`)
    if (!confirmed) return
    try {
      await deleteStudent(studentId)
      toast({
        title: 'Student deleted',
        description: `${name} was soft-deleted successfully.`,
        tone: 'success',
      })
    } catch (err) {
      toast({
        title: 'Delete failed',
        description: err instanceof Error ? err.message : 'Please try again.',
        tone: 'error',
      })
    }
  }

  async function handleGateSubmit() {
    if (!targetStudentId || !gateAction) return
    if (gateValue.trim() !== '2006') {
      setGateError('Wrong password. Please try again.')
      return
    }
    setGateOpen(false)
    setGateError('')
    const action = gateAction
    const studentId = targetStudentId
    const name = targetStudentName
    
    setGateAction(null)
    setTargetStudentId(null)
    setTargetStudentName('')
    setGateValue('')

    if (action === 'edit') {
      openQuickAdd({ tab: 'student', studentId })
      return
    }
    await handleDelete(studentId, name)
  }

  const filteredStudents = useMemo(
    () => filterStudents(students, query, statusFilter, paymentFilter),
    [students, query, statusFilter, paymentFilter],
  )

  const totalPending = filteredStudents.reduce((sum, student) => sum + student.pending, 0)

  return (
    <div>
      <PageHeader
        eyebrow="Students"
        title="Who are my students?"
        sub={`${filteredStudents.length} students · ${formatINR(totalPending)} pending across ${filteredStudents.filter((s) => s.pending > 0).length} students`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search students"
              className="h-10 w-44 rounded-full border border-border bg-muted/60 px-4 text-sm outline-none transition-all placeholder:text-muted-foreground focus:border-ring focus:bg-card focus:shadow-[0_0_0_4px_oklch(0.55_0.16_255/0.08)]"
            />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
              className="h-10 rounded-full border border-border bg-muted/60 px-3 text-sm outline-none transition-all focus:border-ring focus:bg-card"
            >
              <option value="all">All status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
            <select
              value={paymentFilter}
              onChange={(e) => setPaymentFilter(e.target.value as typeof paymentFilter)}
              className="h-10 rounded-full border border-border bg-muted/60 px-3 text-sm outline-none transition-all focus:border-ring focus:bg-card"
            >
              <option value="all">All plans</option>
              <option value="Full Payment">Full</option>
              <option value="Monthly">Monthly</option>
              <option value="Split">Split</option>
            </select>
            <button
              type="button"
              onClick={() => openQuickAdd({ tab: 'student' })}
              className="flex h-10 items-center gap-1.5 rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
            >
              <Plus className="h-4 w-4" />
              Add Student
            </button>
          </div>
        }
      />

      <Card className="hidden overflow-hidden md:block animate-fade-up [animation-delay:80ms]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left">
              <th className="micro-label px-6 py-4 font-medium">Student</th>
              <th className="micro-label px-4 py-4 font-medium">Class</th>
              <th className="micro-label px-4 py-4 font-medium">Batch</th>
              <th className="micro-label px-4 py-4 font-medium">Parent Phone</th>
              <th className="micro-label px-4 py-4 font-medium">Payment</th>
              <th className="micro-label px-4 py-4 text-right font-medium">Pending</th>
              <th className="micro-label px-4 py-4 font-medium">Status</th>
              <th className="micro-label px-4 py-4 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredStudents.map((student) => (
              <tr
                key={student.id}
                className="group relative border-b border-border/60 transition-colors last:border-0 hover:bg-muted/50"
              >
                <td className="px-6 py-3.5">
                  <Link
                    href={`/students/${student.id}`}
                    className="flex items-center gap-3 after:absolute after:inset-0"
                  >
                    <Avatar name={student.name} size="sm" />
                    <span className="font-medium">{student.name}</span>
                  </Link>
                </td>
                <td className="px-4 py-3.5 text-muted-foreground">Class {student.class}</td>
                <td className="px-4 py-3.5 text-muted-foreground">{student.batch}</td>
                <td className="tabular px-4 py-3.5 text-muted-foreground">{student.parentPhone}</td>
                <td className="px-4 py-3.5">
                  <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium">
                    {student.paymentType}
                  </span>
                </td>
                <td
                  className={cn(
                    'tabular px-4 py-3.5 text-right font-medium',
                    student.pending > 0 ? 'text-warning-foreground' : 'text-muted-foreground',
                  )}
                >
                  {student.pending > 0 ? formatINR(student.pending) : '—'}
                </td>
                <td className="px-4 py-3.5">
                  <StatusPill status={student.status} />
                </td>
                <td className="relative z-10 px-4 py-3.5 text-right">
                  <div className="flex items-center justify-end gap-1.5">
                    <Link
                      href={`/students/${student.id}`}
                      title="View Student Profile"
                      className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground"
                    >
                      <Eye className="h-4 w-4" />
                    </Link>
                    <button
                      type="button"
                      onClick={() => openProtectedAction('edit', student.id, student.name)}
                      title="Edit Student"
                      className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground"
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                    </button>
                    {(userRole === 'Owner' || userRole === 'Admin') && (
                      <button
                        type="button"
                        onClick={() => openProtectedAction('delete', student.id, student.name)}
                        title="Delete Student"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-full text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && filteredStudents.length === 0 && (
          <div className="px-6 py-10 text-center text-sm text-muted-foreground">
            No students match your filters.
          </div>
        )}
      </Card>

      <div className="flex flex-col gap-3 md:hidden animate-fade-up [animation-delay:80ms]">
        {filteredStudents.map((student) => (
          <Link key={student.id} href={`/students/${student.id}`}>
            <Card className="flex items-center gap-3.5 p-4 active:scale-[0.99]">
              <Avatar name={student.name} />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="truncate text-sm font-semibold">{student.name}</span>
                  <StatusPill status={student.status} />
                </span>
                <span className="block text-xs text-muted-foreground">
                  Class {student.class} · {student.batch} · {student.paymentType}
                </span>
              </span>
              <span className="text-right">
                {student.pending > 0 ? (
                  <>
                    <span className="tabular block text-sm font-semibold text-warning-foreground">
                      {formatINR(student.pending)}
                    </span>
                    <span className="micro-label">pending</span>
                  </>
                ) : (
                  <span className="micro-label text-success">paid up</span>
                )}
              </span>
            </Card>
          </Link>
        ))}
      </div>

      {gateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 px-4 backdrop-blur-sm">
          <Card className="w-full max-w-md p-5 animate-fade-up">
            <div className="mb-4 flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                <KeyRound className="h-5 w-5" />
              </span>
              <div>
                <h3 className="text-base font-semibold tracking-tight">Security Verification</h3>
                <p className="text-sm text-muted-foreground">
                  Enter password to {gateAction} {targetStudentName}.
                </p>
              </div>
            </div>
            <label className="block">
              <span className="micro-label mb-1.5 block">Password</span>
              <input
                type="password"
                className="h-11 w-full rounded-xl border border-border bg-muted/50 px-3.5 text-sm outline-none transition-all focus:border-ring focus:bg-card"
                value={gateValue}
                onChange={(e) => setGateValue(e.target.value)}
                placeholder="Enter 4-digit password"
                autoFocus
              />
            </label>
            {gateError && <p className="mt-2 text-sm text-destructive">{gateError}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setGateOpen(false)
                  setGateAction(null)
                  setGateError('')
                  setGateValue('')
                }}
                className="h-10 rounded-full border border-border px-4 text-sm font-medium hover:bg-accent"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleGateSubmit()}
                className="h-10 rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90"
              >
                Continue
              </button>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}

