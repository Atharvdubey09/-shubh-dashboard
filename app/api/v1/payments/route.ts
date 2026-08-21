import { NextRequest, NextResponse } from 'next/server'
import { getAdminDb, verifySessionAndGetRole } from '@/lib/firebase-admin'

export const runtime = 'nodejs'

function sanitizeFirestoreData(val: any): any {
  if (val === null || val === undefined) {
    return null
  }
  if (typeof val.toDate === 'function') {
    try {
      return val.toDate().toISOString()
    } catch (_) {}
  }
  if (typeof val === 'object') {
    if (val.id && typeof val.path === 'string' && typeof val.get === 'function') {
      return val.id
    }
    const seconds = val.seconds ?? val._seconds
    const nanoseconds = val.nanoseconds ?? val._nanoseconds
    if (typeof seconds === 'number' && typeof nanoseconds === 'number') {
      try {
        return new Date(seconds * 1000).toISOString()
      } catch (_) {}
    }
    if (val instanceof Date) {
      return val.toISOString()
    }
    if (Array.isArray(val)) {
      return val.map(sanitizeFirestoreData)
    }
    const result: any = {}
    for (const key of Object.keys(val)) {
      result[key] = sanitizeFirestoreData(val[key])
    }
    return result
  }
  return val
}

function nextReceiptNumber() {
  const now = new Date()
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase()
  return `RCPT-${stamp}-${rand}`
}

export async function POST(req: NextRequest) {
  try {
    console.log('[API Access] POST /api/v1/payments - Request received')

    // 1. Authenticate & Resolve Role
    const session = await verifySessionAndGetRole(req)
    if ('error' in session) {
      console.warn(`[API Access] Authentication failed: ${session.error}`)
      return NextResponse.json(
        { success: false, error: session.error },
        { status: session.status || 401 }
      )
    }

    const { email, role } = session
    console.log(`[API Access] Authenticated user email: ${email}, resolved role: ${role}`)

    // 2. Authorize Financial Roles (Explicitly Block Teacher)
    const allowedRoles = ['Owner', 'Admin', 'Accountant', 'Receptionist']
    if (!allowedRoles.includes(role)) {
      console.warn(`[API Access] User ${email} with role ${role} denied access to record payment`)
      return NextResponse.json(
        { success: false, error: 'Access denied. Teachers cannot collect or record fees.' },
        { status: 403 }
      )
    }

    // 3. Parse Body
    const body = await req.json()
    const studentId = (body.studentId || '').trim()
    const amount = typeof body.amount === 'number' ? body.amount : parseFloat(String(body.amount || '0'))
    const date = (body.date || new Date().toISOString().slice(0, 10)).slice(0, 10)
    const paymentMode = (body.paymentMode || 'Cash').trim()
    const notes = (body.notes || '').trim()
    const receiptNumber = (body.receiptNumber || nextReceiptNumber()).trim()
    const label = (body.label || 'Fee Payment').trim()

    if (!studentId) {
      return NextResponse.json({ success: false, error: 'Student ID is required' }, { status: 400 })
    }
    if (isNaN(amount) || amount <= 0) {
      return NextResponse.json({ success: false, error: 'Payment amount must be greater than 0' }, { status: 400 })
    }

    // 4. Fetch Student Document
    const db = getAdminDb()
    const studentRef = db.collection('students').doc(studentId)
    const studentSnap = await studentRef.get()

    if (!studentSnap.exists) {
      return NextResponse.json({ success: false, error: 'Student not found' }, { status: 404 })
    }

    const studentData = studentSnap.data()!
    if (studentData.is_deleted === true) {
      return NextResponse.json({ success: false, error: 'Student record is archived or removed' }, { status: 404 })
    }

    // 5. Create Payment Document in `payments` collection
    const paymentRef = db.collection('payments').doc()
    const paymentId = paymentRef.id
    const nowISO = new Date().toISOString()

    const paymentRecord = {
      id: paymentId,
      studentId,
      studentName: studentData.name || 'Unknown Student',
      amount,
      date,
      label,
      status: 'paid',
      paymentMode,
      notes,
      receiptNumber,
      parentId: studentData.parentId || '',
      parentName: studentData.parentName || '',
      createdAt: nowISO,
    }

    await paymentRef.set(paymentRecord)

    // 6. Recalculate Student Paid / Pending / Fee Schedule
    const currentTotalFee = typeof studentData.totalFee === 'number' ? studentData.totalFee : 0
    const currentPaid = typeof studentData.paid === 'number' ? studentData.paid : 0
    const newPaid = currentPaid + amount
    const newPending = Math.max(currentTotalFee - newPaid, 0)

    // Update installments if schedule exists
    let updatedSchedule = studentData.feeSchedule || []
    if (Array.isArray(updatedSchedule) && updatedSchedule.length > 0) {
      let remainingCredit = amount
      updatedSchedule = updatedSchedule.map((item: any, idx: number) => {
        if (remainingCredit <= 0 || item.status === 'paid') return item
        const itemAmount = typeof item.amount === 'number' ? item.amount : 0
        const itemPaid = typeof item.paidAmount === 'number' ? item.paidAmount : 0
        const itemNeeded = Math.max(itemAmount - itemPaid, 0)

        if (remainingCredit >= itemNeeded) {
          remainingCredit -= itemNeeded
          return {
            ...item,
            status: 'paid',
            paidAmount: itemAmount,
            paymentId: item.paymentId || paymentId,
          }
        } else {
          const partialPaid = itemPaid + remainingCredit
          remainingCredit = 0
          return {
            ...item,
            paidAmount: partialPaid,
          }
        }
      })
    }

    await studentRef.update({
      paid: newPaid,
      pending: newPending,
      feeSchedule: updatedSchedule,
      updatedAt: nowISO,
    })

    console.log(`[API Access] Successfully recorded payment ${paymentId} (₹${amount}) for student ${studentId}`)

    return NextResponse.json({
      success: true,
      data: sanitizeFirestoreData(paymentRecord),
    }, { status: 201 })
  } catch (error: any) {
    console.error('[API Error] POST /api/v1/payments exception caught:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Unable to record payment' },
      { status: 500 }
    )
  }
}
