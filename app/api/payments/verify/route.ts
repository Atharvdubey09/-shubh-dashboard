import { NextRequest, NextResponse } from 'next/server'
import { getAdminDb } from '@/lib/firebase-admin'
import { verifyCheckoutSignature } from '@/lib/razorpay'

// Recalculates fee schedules and updates student balance using Firebase Admin
export async function adminRecalculateStudentFees(db: any, studentId: string) {
  const studentRef = db.collection('students').doc(studentId)
  const studentSnap = await studentRef.get()
  if (!studentSnap.exists) return

  const student = studentSnap.data()!
  const paymentsSnap = await db.collection('payments').where('studentId', '==', studentId).get()
  const payments = paymentsSnap.docs.map((doc: any) => ({ id: doc.id, ...doc.data() })) as any[]

  // Sort payments by date, then by createdAt time
  payments.sort((a, b) => a.date.localeCompare(b.date) || (a.createdAt || '').localeCompare(b.createdAt || ''))

  const paid = payments.reduce((sum, p) => sum + p.amount, 0)
  const pending = Math.max(student.totalFee - paid, 0)

  const updatedSchedule = (student.feeSchedule || []).map((item: any) => ({
    ...item,
    status: 'upcoming',
    paymentId: undefined,
    paidAmount: 0,
  }))

  const today = new Date().toISOString().split('T')[0] // yyyy-mm-dd
  const hasActivePromise = student.promiseToPayDate && student.promiseToPayDate >= today

  let remaining = paid
  for (const item of updatedSchedule) {
    if (remaining >= item.amount) {
      item.status = 'paid'
      item.paidAmount = item.amount
      let temp = remaining
      for (const p of payments) {
        if (temp > 0) {
          item.paymentId = p.id
          temp -= p.amount
        }
      }
      remaining -= item.amount
    } else if (remaining > 0) {
      item.status = 'partial'
      item.paidAmount = remaining
      let temp = remaining
      for (const p of payments) {
        if (temp > 0) {
          item.paymentId = p.id
          temp -= p.amount
        }
      }
      remaining = 0
    } else {
      item.paidAmount = 0
      if (item.dueDate === today) {
        item.status = 'due-today'
      } else if (item.dueDate < today) {
        if (hasActivePromise) {
          item.status = 'upcoming'
        } else {
          const diffTime = Math.abs(new Date(today).getTime() - new Date(item.dueDate).getTime())
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
          item.status = diffDays > 7 ? 'critical' : 'overdue'
        }
      } else {
        item.status = 'upcoming'
      }
    }
  }

  for (const item of updatedSchedule) {
    if (item.status === 'upcoming') {
      if (item.dueDate === today) {
        item.status = 'due-today'
      } else if (item.dueDate < today) {
        if (hasActivePromise) {
          item.status = 'upcoming'
        } else {
          const diffTime = Math.abs(new Date(today).getTime() - new Date(item.dueDate).getTime())
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
          item.status = diffDays > 7 ? 'critical' : 'overdue'
        }
      }
    }
  }

  await studentRef.update({
    paid,
    pending,
    feeSchedule: updatedSchedule,
    updatedAt: new Date().toISOString(),
  })
}

function generateReceiptNumber() {
  const now = new Date()
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`
  return `RCPT-${stamp}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, studentId, amount, notes } = body

    // 1. Validation
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !studentId) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 })
    }
    if (typeof amount !== 'number' || isNaN(amount) || amount <= 0) {
      return NextResponse.json({ error: 'Amount must be a positive number' }, { status: 400 })
    }

    // 2. Verify signature
    let isValid = false
    try {
      isValid = verifyCheckoutSignature(razorpay_order_id, razorpay_payment_id, razorpay_signature)
    } catch (err: any) {
      console.error('[Verification Failed] Error during verification:', err)
      return NextResponse.json({ error: 'Failed to verify checkout signature' }, { status: 400 })
    }

    if (!isValid) {
      console.warn(`[Verification Failed] Signature invalid. Order: ${razorpay_order_id}, Payment: ${razorpay_payment_id}`)
      return NextResponse.json({ error: 'Payment signature verification failed' }, { status: 400 })
    }

    // 3. Store payment and update student using a Firestore transaction
    const db = getAdminDb()
    const result = await db.runTransaction(async (transaction: any) => {
      const studentRef = db.collection('students').doc(studentId)
      const paymentRef = db.collection('payments').doc(razorpay_payment_id)

      // Fetch student
      const studentSnap = await transaction.get(studentRef)
      if (!studentSnap.exists) {
        throw new Error('Student not found')
      }
      const student = studentSnap.data()!

      // Check if payment already exists
      const paymentSnap = await transaction.get(paymentRef)
      if (paymentSnap.exists) {
        return { duplicate: true, studentName: student.name }
      }

      const today = new Date().toISOString().split('T')[0]
      const receiptNumber = generateReceiptNumber()
      const label = `Razorpay - ${new Date().toLocaleDateString('en-IN', { month: 'long' })}`

      const paymentPayload = {
        id: razorpay_payment_id,
        studentId,
        studentName: student.name,
        amount,
        date: today,
        label,
        status: 'paid',
        paymentMode: 'Razorpay',
        notes: notes || 'Razorpay checkout payment',
        receiptNumber,
        createdAt: new Date().toISOString(),
        razorpayPaymentId: razorpay_payment_id,
        razorpayOrderId: razorpay_order_id,
        gatewayResponse: {
          razorpay_order_id,
          razorpay_payment_id,
          razorpay_signature,
        },
      }

      transaction.set(paymentRef, paymentPayload)
      return { duplicate: false, studentName: student.name, amount }
    })

    if (result.duplicate) {
      console.log(`[Payment Success (Duplicate Ignored)] Payment: ${razorpay_payment_id} was already registered.`)
      return NextResponse.json({ message: 'Payment verified (already processed)', studentName: result.studentName })
    }

    // Recalculate student fees
    await adminRecalculateStudentFees(db, studentId)

    // Store gateway status metadata
    const gatewayStatusRef = db.collection('gateway_status').doc('status')
    await gatewayStatusRef.set({
      lastPaymentAt: new Date().toISOString(),
      lastSyncAt: new Date().toISOString(),
    }, { merge: true })

    console.log(`[Payment Success] Verified and recorded checkout payment: ${razorpay_payment_id} for student: ${result.studentName} of amount INR ${result.amount}`)

    return NextResponse.json({
      message: 'Payment verified and recorded successfully',
      studentName: result.studentName,
    })
  } catch (error: any) {
    console.error('[Razorpay Verification Error]', error)
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 })
  }
}
