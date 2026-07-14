import { NextRequest, NextResponse } from 'next/server'
import { getAdminDb } from '@/lib/firebase-admin'
import { createRazorpayPaymentLink } from '@/lib/razorpay'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const { studentId, amount, description } = body

    // 1. Validation
    if (!studentId || typeof studentId !== 'string') {
      return NextResponse.json({ error: 'Invalid or missing studentId' }, { status: 400 })
    }
    if (typeof amount !== 'number' || isNaN(amount) || amount <= 0) {
      return NextResponse.json({ error: 'Amount must be a positive number' }, { status: 400 })
    }

    // 2. Fetch student details from Firestore
    const db = getAdminDb()
    const studentSnap = await db.collection('students').doc(studentId).get()
    if (!studentSnap.exists) {
      return NextResponse.json({ error: `Student with ID ${studentId} not found` }, { status: 404 })
    }
    const student = studentSnap.data()!

    // 3. Prepare parameters
    const referenceId = `plink_${studentId.slice(0, 4)}_${Date.now()}`
    
    // Callback redirect URL back to the student's profile page
    const origin = req.nextUrl.origin
    const callbackUrl = `${origin}/students/${studentId}?payment=success`

    // 4. Create Razorpay Payment Link
    const paymentLink = await createRazorpayPaymentLink({
      amount,
      description: description || `Coaching fees collection for ${student.name}`,
      customerName: student.name,
      customerContact: student.parentPhone || student.studentPhone || '98765 00000',
      referenceId,
      callbackUrl,
      notes: { studentId },
    })

    // 5. Logging
    console.log(`[Payment Link Created] Razorpay Link ID: ${paymentLink.id} for Student: ${student.name} (${studentId}) of amount INR ${amount}`)

    // 6. Return response
    return NextResponse.json({
      id: paymentLink.id,
      url: paymentLink.short_url,
      amount: amount,
      status: paymentLink.status,
    })
  } catch (error: any) {
    console.error('[Razorpay Payment Link Creation Error]', error)
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 })
  }
}
