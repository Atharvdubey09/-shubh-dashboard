import { NextRequest, NextResponse } from 'next/server'
import { getAdminDb } from '@/lib/firebase-admin'
import { createRazorpayOrder } from '@/lib/razorpay'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const { studentId, amount } = body

    // 1. Validation
    if (!studentId || typeof studentId !== 'string') {
      return NextResponse.json({ error: 'Invalid or missing studentId' }, { status: 400 })
    }
    if (typeof amount !== 'number' || isNaN(amount) || amount <= 0) {
      return NextResponse.json({ error: 'Amount must be a positive number' }, { status: 400 })
    }

    // 2. Fetch student details from Firestore (Server-side Admin DB)
    const db = getAdminDb()
    const studentSnap = await db.collection('students').doc(studentId).get()
    if (!studentSnap.exists) {
      return NextResponse.json({ error: `Student with ID ${studentId} not found` }, { status: 404 })
    }
    const student = studentSnap.data()!

    // 3. Generate unique receipt reference
    const timestamp = Date.now()
    const receipt = `rcpt_${studentId.slice(0, 4)}_${timestamp}`

    // 4. Create Razorpay order
    const order = await createRazorpayOrder(amount, receipt, { studentId })

    // 5. Logging
    console.log(`[Payment Created] Razorpay Order: ${order.id} for Student: ${student.name} (${studentId}) of amount INR ${amount}`)

    // 6. Return response
    return NextResponse.json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      receipt: order.receipt,
      studentName: student.name,
      studentId: studentId,
      keyId: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID, // Return Key ID to initialize checkout in frontend
    })
  } catch (error: any) {
    console.error('[Razorpay Order Creation Error]', error)
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 })
  }
}
