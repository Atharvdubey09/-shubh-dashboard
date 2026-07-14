'use client'

import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import {
  ArrowLeft,
  ChevronDown,
  CircleCheck,
  CreditCard,
  FileText,
  KeyRound,
  MoreHorizontal,
  Paperclip,
  Phone,
  Upload,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Card, StatusPill, Avatar } from '@/components/ui-bits'
import { useAppData } from '@/components/state/app-data-provider'
import { useAuth } from '@/components/state/auth-provider'
import { useQuickAdd } from '@/components/shell/quick-add-context'
import { useToast } from '@/components/ui/toast'
import { formatINR, formatLongDate, type PaymentStatus } from '@/lib/domain'
import { cn } from '@/lib/utils'

export default function StudentProfilePage() {
  const REVENUE_PASSWORD = '2006'
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const { userRole } = useAuth()
  const {
    students,
    payments,
    deleteStudent,
    attachStudentPhoto,
    loading,
    families,
    assignStudentToFamily,
    createFamilyAndLink,
    unassignStudentFromFamily,
  } = useAppData()
  const { openQuickAdd } = useQuickAdd()
  const { toast } = useToast()
  const student = students.find((entry) => entry.id === params.id)
  const history = payments.filter((payment) => payment.studentId === params.id)
  const progress = student ? Math.round((student.paid / Math.max(student.totalFee, 1)) * 100) : 0
  const menuRef = useRef<HTMLDivElement>(null)
  const photoInputRef = useRef<HTMLInputElement>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [gateOpen, setGateOpen] = useState(false)

  // Link family modal states
  const [linkFamilyOpen, setLinkFamilyOpen] = useState(false)
  const [selectedFamilyId, setSelectedFamilyId] = useState('')
  const [newFamilyMode, setNewFamilyMode] = useState(false)
  const [newParentName, setNewParentName] = useState('')
  const [newParentPhone, setNewParentPhone] = useState('')
  const [newParentWhatsApp, setNewParentWhatsApp] = useState('')
  const [linkError, setLinkError] = useState('')
  const [linkBusy, setLinkBusy] = useState(false)

  // Razorpay integration states
  const [razorpayModalOpen, setRazorpayModalOpen] = useState(false)
  const [razorpayAmount, setRazorpayAmount] = useState('')
  const [razorpayMethod, setRazorpayMethod] = useState<'checkout' | 'link'>('checkout')
  const [razorpayLoading, setRazorpayLoading] = useState(false)
  const [paymentLink, setPaymentLink] = useState('')
  const [paymentLinkCopied, setPaymentLinkCopied] = useState(false)
  const [razorpayError, setRazorpayError] = useState('')

  async function handleLinkExistingSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!student || !selectedFamilyId) return
    setLinkBusy(true)
    setLinkError('')
    try {
      await assignStudentToFamily(student.id, selectedFamilyId)
      toast({ title: 'Student Linked', description: `${student.name} was successfully linked to the family.`, tone: 'success' })
      setLinkFamilyOpen(false)
    } catch (err) {
      setLinkError(err instanceof Error ? err.message : 'Linking failed.')
    } finally {
      setLinkBusy(false)
    }
  }

  async function handleCreateAndLinkSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!student || !newParentName.trim() || !newParentPhone.trim()) return
    setLinkBusy(true)
    setLinkError('')
    try {
      await createFamilyAndLink(
        student.id,
        newParentName,
        newParentPhone,
        newParentWhatsApp || undefined,
        undefined
      )
      toast({ title: 'Family Created', description: `Successfully created family and linked ${student.name}.`, tone: 'success' })
      setLinkFamilyOpen(false)
    } catch (err) {
      setLinkError(err instanceof Error ? err.message : 'Creation failed.')
    } finally {
      setLinkBusy(false)
    }
  }

  async function handleUnlinkFamily() {
    if (!student) return
    const confirmed = window.confirm(`Are you sure you want to remove ${student.name} from their linked family?`)
    if (!confirmed) return
    try {
      await unassignStudentFromFamily(student.id)
      toast({ title: 'Student Unlinked', description: `${student.name} has been removed from the family.`, tone: 'success' })
    } catch (err) {
      alert('Unlinking failed.')
    }
  }
  const [gateAction, setGateAction] = useState<'edit' | 'delete' | null>(null)
  const [gateValue, setGateValue] = useState('')
  const [gateError, setGateError] = useState('')

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  const splitTimeline = useMemo(() => {
    if (!student) return []
    return student.feeSchedule.length > 0
      ? student.feeSchedule
      : [
          {
            id: `${student.id}-full`,
            label: student.paymentType,
            amount: student.totalFee,
            dueDate: student.joined,
            status: student.pending > 0 ? ('upcoming' as PaymentStatus) : ('paid' as PaymentStatus),
          },
        ]
  }, [student])

  async function handleDelete() {
    if (!student) return
    const confirmed = window.confirm(`Delete ${student.name}? This will remove the student and payment history.`)
    if (!confirmed) return
    try {
      await deleteStudent(student.id)
      toast({
        title: 'Student deleted',
        description: `${student.name} was removed from Firestore.`,
        tone: 'success',
      })
      router.push('/students')
    } catch (err) {
      toast({
        title: 'Delete failed',
        description: err instanceof Error ? err.message : 'Please try again.',
        tone: 'error',
      })
    }
  }

  function openProtectedAction(action: 'edit' | 'delete') {
    setGateAction(action)
    setGateValue('')
    setGateError('')
    setGateOpen(true)
  }

  async function handleGateSubmit() {
    if (!student || !gateAction) return
    if (gateValue.trim() !== REVENUE_PASSWORD) {
      setGateError('Wrong password. Please try again.')
      return
    }
    setGateOpen(false)
    setGateError('')
    const action = gateAction
    setGateAction(null)
    setGateValue('')
    if (action === 'edit') {
      openQuickAdd({ tab: 'student', studentId: student.id })
      return
    }
    await handleDelete()
  }

  async function handlePhotoUpload(file: File) {
    if (!student) return
    try {
      await attachStudentPhoto(student.id, file)
      toast({
        title: 'Photo uploaded',
        description: `${student.name}'s photo was saved to Storage.`,
        tone: 'success',
      })
    } catch (err) {
      toast({
        title: 'Upload failed',
        description: err instanceof Error ? err.message : 'Could not upload the photo.',
        tone: 'error',
      })
    }
  }

  function loadRazorpayScript(): Promise<boolean> {
    return new Promise((resolve) => {
      if (window.hasOwnProperty('Razorpay')) {
        resolve(true)
        return
      }
      const script = document.createElement('script')
      script.src = 'https://checkout.razorpay.com/v1/checkout.js'
      script.onload = () => resolve(true)
      script.onerror = () => resolve(false)
      document.body.appendChild(script)
    })
  }

  async function handleRazorpayPayment() {
    if (!student) return
    setRazorpayError('')
    setPaymentLink('')
    const amountNum = parseFloat(razorpayAmount)
    if (isNaN(amountNum) || amountNum <= 0) {
      setRazorpayError('Please enter a valid amount')
      return
    }

    setRazorpayLoading(true)

    try {
      if (razorpayMethod === 'checkout') {
        // 1. Create order
        const orderRes = await fetch('/api/payments/create-order', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ studentId: student.id, amount: amountNum }),
        })
        const orderData = await orderRes.json()
        if (!orderRes.ok) {
          throw new Error(orderData.error || 'Failed to create order')
        }

        // 2. Load Razorpay script
        const isScriptLoaded = await loadRazorpayScript()
        if (!isScriptLoaded) {
          throw new Error('Failed to load Razorpay checkout script')
        }

        // 3. Open Razorpay Checkout modal
        const razorpayKey = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID

        // Debugging logs: Verify whether Razorpay key exists before initialization.
        const isKeyValid = !!(razorpayKey && razorpayKey !== 'undefined' && razorpayKey !== 'null')
        console.log(isKeyValid ? "KEY FOUND" : "KEY MISSING")

        if (!isKeyValid) {
          throw new Error('Razorpay client-side key (NEXT_PUBLIC_RAZORPAY_KEY_ID) is not configured.')
        }

        const options = {
          key: razorpayKey,
          amount: orderData.amount,
          currency: orderData.currency || 'INR',
          name: 'Shubh Classes',
          description: `Coaching Fee Collection for ${student.name}`,
          order_id: orderData.orderId,
          prefill: {
            name: student.name,
            contact: student.parentPhone || student.studentPhone || '',
          },
          theme: {
            color: '#4f46e5',
          },
          handler: async function (response: any) {
            try {
              setRazorpayLoading(true)
              const verifyRes = await fetch('/api/payments/verify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  razorpay_order_id: response.razorpay_order_id,
                  razorpay_payment_id: response.razorpay_payment_id,
                  razorpay_signature: response.razorpay_signature,
                  studentId: student.id,
                  amount: amountNum,
                }),
              })
              const verifyData = await verifyRes.json()
              if (!verifyRes.ok) {
                throw new Error(verifyData.error || 'Signature verification failed')
              }
              toast({ title: 'Payment Recorded', description: `Successfully verified and logged Razorpay payment.`, tone: 'success' })
              setRazorpayModalOpen(false)
            } catch (err: any) {
              setRazorpayError(err.message || 'Verification failed')
            } finally {
              setRazorpayLoading(false)
            }
          },
          modal: {
            ondismiss: function () {
              setRazorpayLoading(false)
            },
          },
        }

        const RazorpayConstructor = (window as any).Razorpay
        const rzp = new RazorpayConstructor(options)
        rzp.open()
      } else {
        // Create payment link
        const linkRes = await fetch('/api/payments/create-payment-link', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ studentId: student.id, amount: amountNum }),
        })
        const linkData = await linkRes.json()
        if (!linkRes.ok) {
          throw new Error(linkData.error || 'Failed to create payment link')
        }
        setPaymentLink(linkData.url)
        toast({ title: 'Link Generated', description: `Payment link created successfully.`, tone: 'success' })
      }
    } catch (err: any) {
      setRazorpayError(err.message || 'Payment operation failed')
    } finally {
      if (razorpayMethod !== 'checkout') {
        setRazorpayLoading(false)
      }
    }
  }

  if (loading) {
    return <div className="text-sm text-muted-foreground">Loading student data...</div>
  }

  if (!student) {
    return <div className="text-sm text-muted-foreground">Student not found.</div>
  }

  return (
    <div>
      <Link
        href="/students"
        className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground animate-fade-up"
      >
        <ArrowLeft className="h-4 w-4" /> All students
      </Link>

      <Card className="mb-5 flex flex-col gap-6 p-6 md:flex-row md:items-center md:p-8 animate-fade-up [animation-delay:60ms]">
        <button
          type="button"
          onClick={() => photoInputRef.current?.click()}
          className="relative inline-flex shrink-0"
          aria-label="Upload student photo"
        >
          <Avatar name={student.name} size="lg" className="cursor-pointer" src={student.photoUrl} />
          <span className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full border border-background bg-primary text-primary-foreground shadow">
            <Upload className="h-3.5 w-3.5" />
          </span>
        </button>
        <input
          ref={photoInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) void handlePhotoUpload(file)
          }}
        />
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-xl font-semibold tracking-tight md:text-2xl">
              {student.name}
            </h1>
            <StatusPill status={student.status} />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Class {student.class} · {student.batch} · Joined {student.joined}
          </p>
        </div>
        <div className="relative flex flex-wrap gap-2 md:ml-auto">
          <a
            href={`tel:${student.parentPhone.replace(/\s/g, '')}`}
            className="flex h-10 items-center gap-2 rounded-full border border-border px-4 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            <Phone className="h-4 w-4" strokeWidth={1.75} /> {student.parentPhone}
          </a>
          <button
            type="button"
            onClick={() => openProtectedAction('edit')}
            className="flex h-10 items-center gap-1.5 rounded-full border border-border px-4 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            ✏️ Edit Student
          </button>
          {(userRole === 'Owner' || userRole === 'Admin') && (
            <button
              type="button"
              onClick={() => openProtectedAction('delete')}
              className="flex h-10 items-center gap-1.5 rounded-full border border-destructive/25 text-destructive px-4 text-sm font-medium transition-colors hover:bg-destructive/10"
            >
              🗑 Delete Student
            </button>
          )}
          {userRole !== 'Teacher' && (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setRazorpayAmount(student.pending > 0 ? student.pending.toString() : '')
                  setRazorpayModalOpen(true)
                  setPaymentLink('')
                  setRazorpayError('')
                  setRazorpayMethod('checkout')
                }}
                className="flex h-10 items-center gap-2 rounded-full bg-indigo-600 px-4 text-sm font-medium text-white transition-opacity hover:opacity-90 shadow-sm"
              >
                💳 Collect via Razorpay
              </button>
              <button
                type="button"
                onClick={() => openQuickAdd({ tab: 'fee', studentId: student.id })}
                className="flex h-10 items-center gap-2 rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
              >
                Collect Fee
              </button>
            </div>
          )}
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-5">
        <Card className="p-6 lg:col-span-2 animate-fade-up [animation-delay:120ms]">
          <p className="micro-label mb-1">Fee Details</p>
          <h2 className="mb-6 text-base font-semibold tracking-tight">
            {student.paymentType} plan
          </h2>
          {student.feePlan && (
            <p className="mb-4 text-xs text-muted-foreground">
              Agreed total fee: {formatINR(student.totalFee)}
              {student.feePlan.type === 'Monthly' && student.feePlan.monthlyFeeAmount
                ? ` · Monthly amount ${formatINR(student.feePlan.monthlyFeeAmount)}`
                : student.feePlan.type === 'Split' && student.feePlan.installments
                  ? ` · ${student.feePlan.installments.length} installments`
                  : ''}
            </p>
          )}
          <div className="mb-2 flex items-end justify-between">
            <p className="tabular text-2xl font-semibold tracking-tight">
              {formatINR(student.paid)}
            </p>
            <p className="tabular text-sm text-muted-foreground">
              of agreed {formatINR(student.totalFee)}
            </p>
          </div>
          <div className="mb-6 h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all duration-700 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-muted/70 p-4">
              <p className="micro-label mb-1">Pending</p>
              <p className="tabular text-lg font-semibold">
                {student.pending > 0 ? formatINR(student.pending) : '₹0'}
              </p>
            </div>
            <div className="rounded-2xl bg-muted/70 p-4">
              <p className="micro-label mb-1">Paid</p>
              <p className="tabular text-lg font-semibold">{progress}%</p>
            </div>
          </div>

          <div className="mt-6 border-t border-border pt-5">
            <p className="micro-label mb-3">Notes</p>
            <p className="text-sm leading-relaxed text-pretty text-muted-foreground">
              {student.notes || 'No notes yet.'}
            </p>
          </div>

          <div className="mt-6 border-t border-border pt-5">
            <p className="micro-label mb-3">Documents</p>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => photoInputRef.current?.click()}
                className="flex items-center gap-2.5 rounded-xl border border-border px-3.5 py-2.5 text-left text-sm transition-colors hover:bg-accent hover:text-accent-foreground"
              >
                <Paperclip className="h-4 w-4 text-muted-foreground" strokeWidth={1.75} />
                Upload student photo
              </button>
              {student.photoUrl && (
                <a
                  href={student.photoUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-2.5 rounded-xl border border-border px-3.5 py-2.5 text-left text-sm transition-colors hover:bg-accent hover:text-accent-foreground"
                >
                  <Paperclip className="h-4 w-4 text-muted-foreground" strokeWidth={1.75} />
                  Open uploaded photo
                </a>
              )}
            </div>
          </div>

          {/* Parent / Family Details */}
          <div className="mt-6 border-t border-border pt-5 space-y-3">
            <p className="micro-label">Parent / Family Details</p>
            {student.parentId ? (
              <div className="rounded-xl bg-accent p-3 text-xs mb-2">
                <p className="font-semibold text-accent-foreground">Family Linked</p>
                <div className="flex items-center gap-2 mt-1">
                  <Link
                    href={`/families/${student.parentId}`}
                    className="font-medium text-primary hover:underline"
                  >
                    View Family Dashboard →
                  </Link>
                  <span className="text-muted-foreground/50">·</span>
                  <button
                    type="button"
                    onClick={handleUnlinkFamily}
                    className="font-medium text-destructive hover:underline"
                  >
                    Unlink
                  </button>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-border p-4 text-center text-xs">
                <p className="text-muted-foreground mb-3">Not linked to any Family</p>
                <button
                  type="button"
                  onClick={() => {
                    setLinkFamilyOpen(true)
                    setNewFamilyMode(false)
                    setSelectedFamilyId('')
                    setNewParentName('')
                    setNewParentPhone('')
                    setNewParentWhatsApp('')
                    setLinkError('')
                  }}
                  className="inline-flex h-8 items-center justify-center rounded-lg bg-primary px-3 font-semibold text-primary-foreground hover:opacity-90"
                >
                  Assign to Family
                </button>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-muted-foreground block text-[10px] uppercase font-semibold">Parent Name</span>
                <span className="font-medium">{student.parentName || '—'}</span>
              </div>
              <div>
                <span className="text-muted-foreground block text-[10px] uppercase font-semibold">Student Phone</span>
                <span className="font-medium">{student.studentPhone || '—'}</span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-muted-foreground block text-[10px] uppercase font-semibold">WhatsApp</span>
                <span className="font-medium">{student.whatsapp || '—'}</span>
              </div>
              <div>
                <span className="text-muted-foreground block text-[10px] uppercase font-semibold">Promise To Pay</span>
                <span className="font-medium">
                  {student.promiseToPayDate ? formatLongDate(student.promiseToPayDate) : '—'}
                </span>
              </div>
            </div>
            <div className="text-xs">
              <span className="text-muted-foreground block text-[10px] uppercase font-semibold">Address</span>
              <span className="font-medium block text-pretty">{student.address || '—'}</span>
            </div>
          </div>
        </Card>

        <Card className="p-6 lg:col-span-3 animate-fade-up [animation-delay:180ms]">
          <p className="micro-label mb-1">Payment History</p>
          <h2 className="mb-6 text-base font-semibold tracking-tight">
            Every rupee, on record
          </h2>
          {history.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-14 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                <FileText className="h-5 w-5 text-muted-foreground" strokeWidth={1.5} />
              </span>
              <p className="text-sm font-medium">No payments recorded yet</p>
              <p className="max-w-56 text-xs leading-relaxed text-muted-foreground">
                When you collect a fee from {student.name.split(' ')[0]}, it will
                appear here.
              </p>
            </div>
          ) : (
            <ol className="relative ml-2 flex flex-col gap-6 border-l border-border pl-6">
              {history.map((payment) => (
                <li key={payment.id} className="relative">
                  <span className="absolute -left-[31px] top-1 h-2.5 w-2.5 rounded-full bg-success ring-4 ring-success/15" />
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium">{payment.label}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatLongDate(payment.date)}
                      </p>
                    </div>
                    <p className="tabular text-sm font-semibold">
                      {formatINR(payment.amount)}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          )}

          <div className="mt-7 border-t border-border pt-5">
            <p className="micro-label mb-3">Fee Schedule</p>
            <ol className="relative ml-2 flex flex-col gap-7 border-l border-border pl-6">
              {splitTimeline.map((step) => (
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
                      <Paperclip className="h-3 w-3" strokeWidth={2.5} />
                    )}
                  </span>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">{step.label}</p>
                      <p className="text-xs text-muted-foreground">
                        {step.status === 'paid'
                          ? `Paid on ${formatLongDate(step.dueDate)}`
                          : `Due ${formatLongDate(step.dueDate)}`}
                      </p>
                    </div>
                    <p className="tabular text-sm font-semibold">
                      {formatINR(step.amount)}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </Card>
      </div>

      {gateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 px-4 backdrop-blur-sm">
          <Card className="w-full max-w-md p-5 animate-fade-up">
            <div className="mb-4 flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                <KeyRound className="h-5 w-5" />
              </span>
              <div>
                <h3 className="text-base font-semibold tracking-tight">Revenue Password</h3>
                <p className="text-sm text-muted-foreground">
                  Enter the password to continue.
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

      {linkFamilyOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/45 px-4 backdrop-blur-sm">
          <Card className="w-full max-w-sm p-6 animate-fade-up">
            <h3 className="text-base font-bold tracking-tight mb-1">Assign to Family</h3>
            <p className="text-xs text-muted-foreground mb-4">
              Link {student.name} to a family to view shared balances and group billing.
            </p>

            <div className="mb-4 flex border-b border-border text-xs">
              <button
                type="button"
                onClick={() => setNewFamilyMode(false)}
                className={cn(
                  'flex-1 pb-2 font-semibold text-center border-b-2',
                  !newFamilyMode ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground'
                )}
              >
                Select Existing
              </button>
              <button
                type="button"
                onClick={() => setNewFamilyMode(true)}
                className={cn(
                  'flex-1 pb-2 font-semibold text-center border-b-2',
                  newFamilyMode ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground'
                )}
              >
                Create New Family
              </button>
            </div>

            {newFamilyMode ? (
              <form onSubmit={handleCreateAndLinkSubmit} className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold mb-1">Parent Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Mahesh Dubey"
                    value={newParentName}
                    onChange={(e) => setNewParentName(e.target.value)}
                    className="h-10 w-full rounded-xl border border-border px-3 text-sm bg-muted/20 outline-none focus:border-ring"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Parent Phone</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 98765 00000"
                    value={newParentPhone}
                    onChange={(e) => setNewParentPhone(e.target.value)}
                    className="h-10 w-full rounded-xl border border-border px-3 text-sm bg-muted/20 outline-none focus:border-ring"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">WhatsApp Number (Optional)</label>
                  <input
                    type="text"
                    placeholder="Same as phone"
                    value={newParentWhatsApp}
                    onChange={(e) => setNewParentWhatsApp(e.target.value)}
                    className="h-10 w-full rounded-xl border border-border px-3 text-sm bg-muted/20 outline-none focus:border-ring"
                  />
                </div>
                {linkError && <p className="text-xs text-destructive">{linkError}</p>}
                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setLinkFamilyOpen(false)}
                    disabled={linkBusy}
                    className="flex-1 h-10 rounded-xl border border-border text-sm font-semibold hover:bg-muted"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={linkBusy}
                    className="flex-1 h-10 rounded-xl bg-primary text-sm font-semibold text-primary-foreground hover:opacity-90"
                  >
                    {linkBusy ? 'Creating...' : 'Create & Link'}
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleLinkExistingSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold mb-1">Select Family</label>
                  <select
                    value={selectedFamilyId}
                    onChange={(e) => setSelectedFamilyId(e.target.value)}
                    required
                    className="h-10 w-full rounded-xl border border-border px-2.5 text-sm bg-muted/20 outline-none focus:border-ring"
                  >
                    <option value="">-- Choose a Family --</option>
                    {families.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.parentName} ({f.parentPhone})
                      </option>
                    ))}
                  </select>
                </div>
                {linkError && <p className="text-xs text-destructive">{linkError}</p>}
                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setLinkFamilyOpen(false)}
                    disabled={linkBusy}
                    className="flex-1 h-10 rounded-xl border border-border text-sm font-semibold hover:bg-muted"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={linkBusy}
                    className="flex-1 h-10 rounded-xl bg-primary text-sm font-semibold text-primary-foreground hover:opacity-90"
                  >
                    {linkBusy ? 'Linking...' : 'Link Student'}
                  </button>
                </div>
              </form>
            )}
          </Card>
        </div>
      )}

      {razorpayModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/45 px-4 backdrop-blur-sm animate-fade-in">
          <Card className="w-full max-w-md p-6 animate-fade-up shadow-2xl border-border">
            <h3 className="text-base font-bold tracking-tight mb-1">Collect via Razorpay</h3>
            <p className="text-xs text-muted-foreground mb-4">
              Collect payment from {student.name} using Razorpay Checkout or generate a remote payment link.
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold mb-1">Amount (INR)</label>
                <input
                  type="number"
                  className="h-10 w-full rounded-xl border border-border px-3 text-sm bg-muted/20 outline-none focus:border-ring"
                  value={razorpayAmount}
                  onChange={(e) => setRazorpayAmount(e.target.value)}
                  placeholder="Enter amount"
                />
              </div>

              <div className="flex gap-4 text-xs font-medium border-b border-border pb-2">
                <button
                  type="button"
                  onClick={() => { setRazorpayMethod('checkout'); setPaymentLink(''); }}
                  className={cn(
                    'pb-1 border-b-2 transition-colors',
                    razorpayMethod === 'checkout' ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground'
                  )}
                >
                  Razorpay Checkout
                </button>
                <button
                  type="button"
                  onClick={() => { setRazorpayMethod('link'); setPaymentLink(''); }}
                  className={cn(
                    'pb-1 border-b-2 transition-colors',
                    razorpayMethod === 'link' ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground'
                  )}
                >
                  Generate Payment Link
                </button>
              </div>

              {razorpayError && (
                <p className="text-xs text-destructive bg-destructive/10 p-2 rounded-lg">{razorpayError}</p>
              )}

              {paymentLink && (
                <div className="rounded-xl border border-border p-3 bg-muted/30">
                  <p className="text-xs font-semibold mb-1">Payment Link Generated:</p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      readOnly
                      value={paymentLink}
                      className="h-8 flex-1 text-xs px-2.5 rounded-lg border border-border bg-card outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(paymentLink);
                        setPaymentLinkCopied(true);
                        setTimeout(() => setPaymentLinkCopied(false), 2000);
                      }}
                      className="h-8 px-3 text-xs bg-primary text-primary-foreground font-semibold rounded-lg hover:opacity-90 shrink-0"
                    >
                      {paymentLinkCopied ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setRazorpayModalOpen(false)
                    setRazorpayError('')
                    setPaymentLink('')
                  }}
                  disabled={razorpayLoading}
                  className="flex-1 h-10 rounded-xl border border-border text-sm font-semibold hover:bg-muted"
                >
                  Cancel
                </button>
                {!paymentLink && (
                  <button
                    type="button"
                    onClick={() => void handleRazorpayPayment()}
                    disabled={razorpayLoading}
                    className="flex-1 h-10 rounded-xl bg-indigo-600 text-sm font-semibold text-white hover:opacity-90 flex items-center justify-center gap-1.5"
                  >
                    {razorpayLoading ? (
                      'Processing...'
                    ) : razorpayMethod === 'checkout' ? (
                      'Open Checkout'
                    ) : (
                      'Generate Link'
                    )}
                  </button>
                )}
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
