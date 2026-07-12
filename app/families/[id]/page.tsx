'use client'

import { useState, useMemo, use } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  Calendar,
  CreditCard,
  Edit2,
  Trash2,
  Users,
  AlertCircle,
  Clock,
  CheckCircle,
} from 'lucide-react'
import { Card, PageHeader, Avatar, StatusPill } from '@/components/ui-bits'
import { useAppData } from '@/components/state/app-data-provider'
import { formatINR, formatLongDate } from '@/lib/domain'
import { cn } from '@/lib/utils'

export default function FamilyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter()
  const { id: familyId } = use(params)
  const {
    families,
    students,
    payments,
    editFamily,
    deleteFamily,
    addFamilyPayment,
  } = useAppData()

  const [isEditOpen, setIsEditOpen] = useState(false)
  const [isPayOpen, setIsPayOpen] = useState(false)
  
  // Edit Form State
  const [parentName, setParentName] = useState('')
  const [parentPhone, setParentPhone] = useState('')
  const [parentWhatsApp, setParentWhatsApp] = useState('')
  const [combinedAgreedFee, setCombinedAgreedFee] = useState('')
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([])
  const [allocationType, setAllocationType] = useState<'proportional' | 'equal' | 'manual'>('proportional')
  const [manualAllocations, setManualAllocations] = useState<Record<string, string>>({})
  const [editError, setEditError] = useState('')
  const [editBusy, setEditBusy] = useState(false)

  // Payment Form State
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10))
  const [paymentMode, setPaymentMode] = useState<'Cash' | 'UPI' | 'Card' | 'Bank Transfer' | 'Cheque'>('Cash')
  const [payAllocationType, setPayAllocationType] = useState<'proportional' | 'equal' | 'manual'>('proportional')
  const [payManualAllocations, setPayManualAllocations] = useState<Record<string, string>>({})
  const [payNotes, setPayNotes] = useState('')
  const [payError, setPayError] = useState('')
  const [payBusy, setPayBusy] = useState(false)

  // Find current family
  const family = useMemo(() => {
    return families.find((f) => f.id === familyId)
  }, [families, familyId])

  // Linked students
  const familyStudents = useMemo(() => {
    if (!family) return []
    return students.filter((s) => family.studentIds.includes(s.id))
  }, [students, family])

  // Family payments
  const familyPayments = useMemo(() => {
    return payments.filter((p) => p.parentId === familyId)
  }, [payments, familyId])

  // Aggregate stats
  const stats = useMemo(() => {
    let original = 0
    let paid = 0
    let pending = 0
    familyStudents.forEach((s) => {
      original += s.totalFee
      paid += s.paid
      pending += s.pending
    })
    return { original, paid, pending }
  }, [familyStudents])

  // Find next due date from all schedules
  const nextDueDate = useMemo(() => {
    let earliest = ''
    familyStudents.forEach((s) => {
      s.feeSchedule.forEach((item) => {
        if (item.status !== 'paid') {
          if (!earliest || item.dueDate < earliest) {
            earliest = item.dueDate
          }
        }
      })
    })
    return earliest ? formatLongDate(earliest) : 'No upcoming dues'
  }, [familyStudents])

  // Open Edit Modal
  function openEditModal() {
    if (!family) return
    setParentName(family.parentName)
    setParentPhone(family.parentPhone)
    setParentWhatsApp(family.parentWhatsApp)
    setCombinedAgreedFee(String(family.combinedAgreedFee))
    setSelectedStudentIds(family.studentIds)
    setAllocationType('proportional')
    
    // Initialize manual allocations if needed
    const allocations: Record<string, string> = {}
    familyStudents.forEach((s) => {
      allocations[s.id] = String(s.totalFee)
    })
    setManualAllocations(allocations)
    
    setEditError('')
    setIsEditOpen(true)
  }

  // Handle Edit Save
  async function handleEditSave(e: React.FormEvent) {
    e.preventDefault()
    setEditError('')
    if (!parentName.trim()) return setEditError('Parent name is required')
    if (!parentPhone.trim()) return setEditError('Parent phone is required')
    if (selectedStudentIds.length === 0) return setEditError('Please select at least one student')
    const fee = Number(combinedAgreedFee)
    if (!Number.isFinite(fee) || fee <= 0) return setEditError('Please enter a valid combined fee')

    let manualMap: Record<string, number> | undefined = undefined
    if (allocationType === 'manual') {
      manualMap = {}
      let manualSum = 0
      for (const sid of selectedStudentIds) {
        const val = Number(manualAllocations[sid] || 0)
        if (!Number.isFinite(val) || val < 0) return setEditError('Please enter valid manual allocations')
        manualMap[sid] = val
        manualSum += val
      }
      if (manualSum !== fee) {
        return setEditError(`Manual allocations must sum up to the combined fee of ${formatINR(fee)} (currently ${formatINR(manualSum)})`)
      }
    }

    setEditBusy(true)
    try {
      await editFamily(
        familyId,
        {
          parentName: parentName.trim(),
          parentPhone: parentPhone.trim(),
          parentWhatsApp: parentWhatsApp.trim() || parentPhone.trim(),
          studentIds: selectedStudentIds,
          combinedAgreedFee: fee,
        },
        allocationType,
        manualMap
      )
      setIsEditOpen(false)
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Update failed')
    } finally {
      setEditBusy(false)
    }
  }

  // Open Payment Modal
  function openPayModal() {
    setPaymentAmount('')
    setPayNotes('')
    setPayAllocationType('proportional')
    
    // Init manual payment allocations
    const allocs: Record<string, string> = {}
    familyStudents.forEach((s) => {
      allocs[s.id] = ''
    })
    setPayManualAllocations(allocs)
    
    setPayError('')
    setIsPayOpen(true)
  }

  // Handle Family Payment Submit
  async function handlePaymentSubmit(e: React.FormEvent) {
    e.preventDefault()
    setPayError('')
    const amount = Number(paymentAmount)
    if (!Number.isFinite(amount) || amount <= 0) return setPayError('Please enter a valid amount')

    let manualMap: Record<string, number> | undefined = undefined
    if (payAllocationType === 'manual') {
      manualMap = {}
      let manualSum = 0
      for (const s of familyStudents) {
        const val = Number(payManualAllocations[s.id] || 0)
        if (!Number.isFinite(val) || val < 0) return setPayError('Please enter valid manual allocations')
        manualMap[s.id] = val
        manualSum += val
      }
      if (manualSum !== amount) {
        return setPayError(`Manual allocations sum (${formatINR(manualSum)}) must equal total payment of ${formatINR(amount)}`)
      }
    }

    setPayBusy(true)
    try {
      await addFamilyPayment(
        familyId,
        amount,
        paymentDate,
        paymentMode,
        payAllocationType,
        manualMap,
        payNotes
      )
      setIsPayOpen(false)
    } catch (err) {
      setPayError(err instanceof Error ? err.message : 'Failed to collect payment')
    } finally {
      setPayBusy(false)
    }
  }

  async function handleDelete() {
    if (!family) return
    const confirmed = window.confirm(`Are you sure you want to delete family account for ${family.parentName}? Students will be unlinked.`)
    if (!confirmed) return
    try {
      await deleteFamily(familyId)
      router.push('/families')
    } catch (err) {
      alert('Delete failed')
    }
  }

  if (!family) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3">
        <AlertCircle className="h-10 w-10 text-destructive" />
        <h2 className="text-base font-semibold">Family Account Not Found</h2>
        <Link href="/families" className="text-xs font-semibold text-primary hover:underline">
          Go back to Families list
        </Link>
      </div>
    )
  }

  return (
    <div className="pb-12">
      <div className="mb-6 flex items-center justify-between">
        <Link
          href="/families"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Families
        </Link>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={openEditModal}
            className="flex h-9 items-center gap-1.5 rounded-full border border-border bg-card px-3.5 text-xs font-semibold hover:bg-muted"
          >
            <Edit2 className="h-3.5 w-3.5" />
            Edit Family
          </button>
          <button
            type="button"
            onClick={handleDelete}
            className="flex h-9 items-center gap-1.5 rounded-full border border-destructive/20 bg-destructive/5 px-3.5 text-xs font-semibold text-destructive hover:bg-destructive/10"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete
          </button>
        </div>
      </div>

      <div className="mb-8 flex items-center gap-4 animate-fade-up">
        <Avatar name={family.parentName} size="lg" />
        <div>
          <span className="micro-label">Family Account</span>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">{family.parentName}</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            Phone: {family.parentPhone} · WhatsApp: {family.parentWhatsApp}
          </p>
        </div>
      </div>

      {/* Stats row */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4 animate-fade-up [animation-delay:60ms]">
        <Card className="p-5">
          <p className="micro-label mb-1">Combined Agreed Fee</p>
          <h3 className="text-xl font-bold tabular">{formatINR(family.combinedAgreedFee)}</h3>
          <p className="mt-1 text-[10px] text-muted-foreground">
            Discounted from original {formatINR(stats.original)}
          </p>
        </Card>
        <Card className="p-5">
          <p className="micro-label mb-1">Total Paid</p>
          <h3 className="text-xl font-bold tabular text-success">{formatINR(stats.paid)}</h3>
          <p className="mt-1 text-[10px] text-muted-foreground">
            {stats.original > 0 ? Math.round((stats.paid / family.combinedAgreedFee) * 100) : 0}% of agreed fee
          </p>
        </Card>
        <Card className="p-5">
          <p className="micro-label mb-1">Pending Amount</p>
          <h3 className="text-xl font-bold tabular text-warning-foreground">
            {formatINR(stats.pending)}
          </h3>
          <p className="mt-1 text-[10px] text-muted-foreground">
            Outstanding balance to be collected
          </p>
        </Card>
        <Card className="p-5">
          <p className="micro-label mb-1">Next Dues</p>
          <h3 className="text-sm font-semibold truncate mt-1.5">{nextDueDate}</h3>
          <p className="mt-2 text-[10px] text-muted-foreground">
            Combined payment schedule tracking
          </p>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Linked Students & Payments */}
        <div className="space-y-6 lg:col-span-2">
          {/* Linked Students */}
          <Card className="p-6 animate-fade-up [animation-delay:120ms]">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-bold tracking-tight">Linked Students</h2>
              <span className="rounded-full bg-accent px-2.5 py-0.5 text-[11px] font-semibold text-accent-foreground">
                {familyStudents.length} Students
              </span>
            </div>

            <div className="divide-y divide-border/60">
              {familyStudents.map((student) => (
                <div key={student.id} className="flex items-center gap-4 py-4 first:pt-0 last:pb-0">
                  <Avatar name={student.name} size="md" />
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/students/${student.id}`}
                      className="block truncate text-sm font-semibold hover:underline"
                    >
                      {student.name}
                    </Link>
                    <span className="block text-xs text-muted-foreground">
                      Class {student.class} · {student.batch} · {student.paymentType}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="block text-sm font-semibold tabular">
                      {formatINR(student.totalFee)}
                    </span>
                    <span className="block text-[11px] text-muted-foreground">
                      {formatINR(student.paid)} paid
                    </span>
                  </div>
                  <div>
                    <StatusPill status={student.pending > 0 ? 'upcoming' : 'paid'} />
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* Payment History */}
          <Card className="p-6 animate-fade-up [animation-delay:180ms]">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold tracking-tight font-semibold">Payment History</h2>
                <p className="text-xs text-muted-foreground">Payments made by this parent</p>
              </div>
              {stats.pending > 0 && (
                <button
                  type="button"
                  onClick={openPayModal}
                  className="flex h-8 items-center gap-1 rounded-full bg-primary px-3 text-xs font-semibold text-primary-foreground hover:opacity-90"
                >
                  <CreditCard className="h-3.5 w-3.5" />
                  Collect Payment
                </button>
              )}
            </div>

            <div className="divide-y divide-border/60">
              {familyPayments.map((p) => (
                <div key={p.id} className="flex items-center justify-between py-3.5 first:pt-0 last:pb-0">
                  <div>
                    <span className="block text-sm font-semibold">
                      {formatINR(p.amount)} · {p.paymentMode}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      Received for {p.studentName} on {formatLongDate(p.date)}
                    </span>
                  </div>
                  <span className="tabular text-xs text-muted-foreground font-mono">
                    {p.receiptNumber}
                  </span>
                </div>
              ))}
              {familyPayments.length === 0 && (
                <div className="py-8 text-center text-xs text-muted-foreground">
                  No payment history log found.
                </div>
              )}
            </div>
          </Card>
        </div>

        {/* Sidebar Schedule & Information */}
        <div className="space-y-6">
          <Card className="p-6 animate-fade-up [animation-delay:200ms]">
            <h2 className="mb-4 text-base font-bold tracking-tight">Parent Profile</h2>
            <div className="space-y-3.5 text-xs">
              <div>
                <span className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                  Parent Name
                </span>
                <span className="block text-sm font-medium mt-0.5">{family.parentName}</span>
              </div>
              <div>
                <span className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                  Contact Phone
                </span>
                <span className="block text-sm font-medium mt-0.5">{family.parentPhone}</span>
              </div>
              <div>
                <span className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                  WhatsApp Number
                </span>
                <span className="block text-sm font-medium mt-0.5">{family.parentWhatsApp}</span>
              </div>
              <div>
                <span className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                  Linked Address
                </span>
                <span className="block text-sm font-medium mt-0.5 text-balance">
                  {familyStudents.find((s) => s.address)?.address || 'Not Provided'}
                </span>
              </div>
              <div>
                <span className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                  Family Promise To Pay Date
                </span>
                <span className="block text-sm font-medium mt-0.5">
                  {familyStudents.find((s) => s.promiseToPayDate)?.promiseToPayDate
                    ? formatLongDate(familyStudents.find((s) => s.promiseToPayDate)!.promiseToPayDate!)
                    : 'No Promise Date set'}
                </span>
              </div>
              <div>
                <span className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                  Notes
                </span>
                <p className="block text-xs leading-relaxed text-muted-foreground mt-0.5">
                  {familyStudents.find((s) => s.notes)?.notes || 'No custom parent notes.'}
                </p>
              </div>
            </div>
          </Card>
        </div>
      </div>

      {/* Edit Modal */}
      {isEditOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 px-4 backdrop-blur-sm">
          <Card className="w-full max-w-md p-6 animate-fade-up max-h-[85vh] overflow-y-auto">
            <h3 className="text-lg font-bold tracking-tight mb-1">Edit Family Configuration</h3>
            <p className="text-xs text-muted-foreground mb-4">
              Update details, modify linked students, or recalculate agreed total fee allocations.
            </p>

            <form onSubmit={handleEditSave} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold mb-1">Parent Name *</label>
                <input
                  type="text"
                  required
                  value={parentName}
                  onChange={(e) => setParentName(e.target.value)}
                  className="h-10 w-full rounded-xl border border-border px-3 text-sm bg-muted/30 outline-none focus:border-ring"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold mb-1">Parent Phone *</label>
                  <input
                    type="tel"
                    required
                    value={parentPhone}
                    onChange={(e) => setParentPhone(e.target.value)}
                    className="h-10 w-full rounded-xl border border-border px-3 text-sm bg-muted/30 outline-none focus:border-ring"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">WhatsApp Number</label>
                  <input
                    type="tel"
                    value={parentWhatsApp}
                    onChange={(e) => setParentWhatsApp(e.target.value)}
                    className="h-10 w-full rounded-xl border border-border px-3 text-sm bg-muted/30 outline-none focus:border-ring"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold mb-1">Family Agreed Fee *</label>
                  <input
                    type="number"
                    required
                    value={combinedAgreedFee}
                    onChange={(e) => setCombinedAgreedFee(e.target.value)}
                    className="h-10 w-full rounded-xl border border-border px-3 text-sm bg-muted/30 outline-none focus:border-ring"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Allocation Rule</label>
                  <select
                    value={allocationType}
                    onChange={(e) => setAllocationType(e.target.value as any)}
                    className="h-10 w-full rounded-xl border border-border px-2 text-sm bg-muted/30 outline-none focus:border-ring"
                  >
                    <option value="proportional">Proportional</option>
                    <option value="equal">Equal Share</option>
                    <option value="manual">Manual Allocation</option>
                  </select>
                </div>
              </div>

              {allocationType === 'manual' && (
                <div className="border border-border/80 rounded-xl p-3 bg-muted/10 space-y-2.5">
                  <p className="text-[11px] font-semibold text-muted-foreground">Distribute Agreed Fee manually:</p>
                  {familyStudents.map((s) => (
                    <div key={s.id} className="flex items-center gap-3 text-xs">
                      <span className="flex-1 font-medium truncate">{s.name}</span>
                      <input
                        type="number"
                        placeholder="Share"
                        value={manualAllocations[s.id] || ''}
                        onChange={(e) =>
                          setManualAllocations((prev) => ({ ...prev, [s.id]: e.target.value }))
                        }
                        className="h-9 w-28 rounded-lg border border-border px-2.5 outline-none bg-card focus:border-ring text-right"
                      />
                    </div>
                  ))}
                </div>
              )}

              {editError && <p className="text-xs text-destructive mt-1">{editError}</p>}

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsEditOpen(false)}
                  disabled={editBusy}
                  className="flex-1 h-10 rounded-xl border border-border text-sm font-semibold hover:bg-muted"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={editBusy}
                  className="flex-1 h-10 rounded-xl bg-primary text-sm font-semibold text-primary-foreground hover:opacity-90"
                >
                  {editBusy ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </Card>
        </div>
      )}

      {/* Collect Payment Modal */}
      {isPayOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 px-4 backdrop-blur-sm">
          <Card className="w-full max-w-md p-6 animate-fade-up max-h-[85vh] overflow-y-auto">
            <h3 className="text-lg font-bold tracking-tight mb-1">Collect Family Payment</h3>
            <p className="text-xs text-muted-foreground mb-4">
              Enter amount. It will automatically update all linked student payment timeline schedules.
            </p>

            <form onSubmit={handlePaymentSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold mb-1">Payment Amount *</label>
                  <input
                    type="number"
                    required
                    value={paymentAmount}
                    onChange={(e) => setPaymentAmount(e.target.value)}
                    placeholder="e.g. 4000"
                    className="h-10 w-full rounded-xl border border-border px-3 text-sm bg-muted/30 outline-none focus:border-ring"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Payment Mode</label>
                  <select
                    value={paymentMode}
                    onChange={(e) => setPaymentMode(e.target.value as any)}
                    className="h-10 w-full rounded-xl border border-border px-2 text-sm bg-muted/30 outline-none focus:border-ring"
                  >
                    <option value="Cash">Cash</option>
                    <option value="UPI">UPI</option>
                    <option value="Card">Card</option>
                    <option value="Bank Transfer">Bank Transfer</option>
                    <option value="Cheque">Cheque</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold mb-1">Payment Date *</label>
                  <input
                    type="date"
                    required
                    value={paymentDate}
                    onChange={(e) => setPaymentDate(e.target.value)}
                    className="h-10 w-full rounded-xl border border-border px-3 text-sm bg-muted/30 outline-none focus:border-ring"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Payment Allocation</label>
                  <select
                    value={payAllocationType}
                    onChange={(e) => setPayAllocationType(e.target.value as any)}
                    className="h-10 w-full rounded-xl border border-border px-2 text-sm bg-muted/30 outline-none focus:border-ring"
                  >
                    <option value="proportional">Proportional (Dues)</option>
                    <option value="equal">Equal Share</option>
                    <option value="manual">Manual Share</option>
                  </select>
                </div>
              </div>

              {payAllocationType === 'manual' && (
                <div className="border border-border/80 rounded-xl p-3 bg-muted/10 space-y-2.5">
                  <p className="text-[11px] font-semibold text-muted-foreground">Allocate payment amount manually:</p>
                  {familyStudents.map((s) => (
                    <div key={s.id} className="flex items-center gap-3 text-xs">
                      <span className="flex-1 font-medium truncate">
                        {s.name} (pending: {formatINR(s.pending)})
                      </span>
                      <input
                        type="number"
                        placeholder="Amount"
                        value={payManualAllocations[s.id] || ''}
                        onChange={(e) =>
                          setPayManualAllocations((prev) => ({ ...prev, [s.id]: e.target.value }))
                        }
                        className="h-9 w-28 rounded-lg border border-border px-2.5 outline-none bg-card focus:border-ring text-right"
                      />
                    </div>
                  ))}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold mb-1">Notes</label>
                <input
                  type="text"
                  value={payNotes}
                  onChange={(e) => setPayNotes(e.target.value)}
                  placeholder="e.g. Received combined fee installment for July"
                  className="h-10 w-full rounded-xl border border-border px-3 text-sm bg-muted/30 outline-none focus:border-ring"
                />
              </div>

              {payError && <p className="text-xs text-destructive mt-1">{payError}</p>}

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsPayOpen(false)}
                  disabled={payBusy}
                  className="flex-1 h-10 rounded-xl border border-border text-sm font-semibold hover:bg-muted"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={payBusy}
                  className="flex-1 h-10 rounded-xl bg-primary text-sm font-semibold text-primary-foreground hover:opacity-90"
                >
                  {payBusy ? 'Processing...' : 'Record Payment'}
                </button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  )
}
