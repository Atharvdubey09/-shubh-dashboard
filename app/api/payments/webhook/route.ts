import { NextRequest, NextResponse } from 'next/server'
import { getAdminDb, writeStudentHistoryAdmin } from '@/lib/firebase-admin'
import { verifyWebhookSignature } from '@/lib/razorpay'
import { adminRecalculateStudentFees } from '../verify/route'

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text()
    const signature = req.headers.get('x-razorpay-signature') || ''
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET

    if (!secret) {
      console.error('[Razorpay Webhook Error] RAZORPAY_WEBHOOK_SECRET is not configured.')
      return NextResponse.json({ error: 'Webhook secret is not configured' }, { status: 500 })
    }

    // 1. Verify Webhook Signature
    const isValid = verifyWebhookSignature(rawBody, signature, secret)
    if (!isValid) {
      console.error('[Webhook Received] Signature verification failed.')
      // Update gateway status with verification failure
      const db = getAdminDb()
      await db.collection('gateway_status').doc('status').set({
        lastSyncAt: new Date().toISOString(),
        lastSyncStatus: 'Verification Failed',
      }, { merge: true })
      
      return NextResponse.json({ error: 'Invalid webhook signature' }, { status: 400 })
    }

    const payload = JSON.parse(rawBody)
    const eventName = payload.event
    console.log(`[Webhook Received] Razorpay Event: ${eventName}`)

    const db = getAdminDb()

    // Update gateway status showing successful webhook check
    const gatewayStatusRef = db.collection('gateway_status').doc('status')
    await gatewayStatusRef.set({
      lastWebhookAt: new Date().toISOString(),
      lastWebhookEvent: eventName,
      lastSyncAt: new Date().toISOString(),
      lastSyncStatus: 'Connected',
    }, { merge: true })

    // 2. Handle specific events
    if (eventName === 'payment.captured' || eventName === 'order.paid') {
      const paymentEntity = eventName === 'payment.captured' 
        ? payload.payload.payment.entity 
        : null
      const orderEntity = eventName === 'order.paid'
        ? payload.payload.order.entity
        : null

      const paymentId = paymentEntity?.id || ''
      const orderId = paymentEntity?.order_id || orderEntity?.id || ''
      const amountPaise = paymentEntity?.amount || orderEntity?.amount_paid || 0
      const amount = amountPaise / 100 // convert to Rupees

      const notes = paymentEntity?.notes || orderEntity?.notes || {}
      const studentId = notes.studentId || ''

      if (!studentId) {
        console.warn(`[Webhook Ignored] No studentId found in metadata notes for event ${eventName}. Payment: ${paymentId}`)
        return NextResponse.json({ message: 'No studentId found in notes, ignored.' })
      }

      if (eventName === 'order.paid' && !paymentId) {
        // If order.paid occurs, it might not have paymentId. payment.captured is the ideal event to create a transaction.
        console.log(`[Webhook Received] order.paid received for order: ${orderId}. Waiting for payment.captured.`)
        return NextResponse.json({ message: 'Waiting for payment.captured to record details' })
      }

      // Record transaction
      const result = await db.runTransaction(async (transaction: any) => {
        const studentRef = db.collection('students').doc(studentId)
        const paymentRef = db.collection('payments').doc(paymentId)

        const studentSnap = await transaction.get(studentRef)
        if (!studentSnap.exists) {
          throw new Error(`Student ${studentId} not found`)
        }
        const student = studentSnap.data()!

        const paymentSnap = await transaction.get(paymentRef)
        if (paymentSnap.exists) {
          return { duplicate: true, studentName: student.name }
        }

        const today = new Date().toISOString().split('T')[0]
        
        // Determine PaymentMode source
        let paymentMode = 'Razorpay'
        // If description includes Payment Link or order_id starts with plink
        const isLink = paymentEntity?.invoice_id || 
                       paymentEntity?.description?.toLowerCase().includes('link') || 
                       orderId?.startsWith('plink')
        if (isLink) {
          paymentMode = 'Razorpay Link'
        }

        const receiptNumber = paymentEntity?.receipt || `RCPT-WH-${Date.now()}`

        const paymentPayload = {
          id: paymentId,
          studentId,
          studentName: student.name,
          amount,
          date: today,
          label: paymentEntity?.description || `Razorpay Webhook - ${new Date().toLocaleDateString('en-IN', { month: 'long' })}`,
          status: 'paid',
          paymentMode,
          notes: `Recorded via Webhook (${eventName})`,
          receiptNumber,
          createdAt: new Date().toISOString(),
          razorpayPaymentId: paymentId,
          razorpayOrderId: orderId,
          gatewayResponse: payload,
        }

        transaction.set(paymentRef, paymentPayload)
        return {
          duplicate: false,
          studentName: student.name,
          amount,
          studentClass: student.class || 0,
          studentRoll: student.roll || 'N/A',
          studentPhone: student.parentPhone || student.studentPhone || 'N/A',
          receiptNumber,
          createdAt: paymentPayload.createdAt,
          paymentMode,
        }
      })

      if (!result.duplicate) {
        // Recalculate balances
        await adminRecalculateStudentFees(db, studentId)

        // Write transaction history entry
        const pDate = result.createdAt || new Date().toISOString()
        const todayStr = pDate.split('T')[0]
        const timeStr = pDate.split('T')[1].slice(0, 8)
        
        await db.collection('transactions').doc(paymentId).set({
          id: paymentId,
          studentId,
          studentName: result.studentName,
          studentClass: result.studentClass || 0,
          studentRoll: result.studentRoll || 'N/A',
          studentPhone: result.studentPhone || 'N/A',
          transactionType: 'payment',
          amount: result.amount,
          discount: 0,
          fine: 0,
          netAmount: result.amount,
          paymentMethod: result.paymentMode,
          paymentStatus: 'success',
          collectionSource: `Razorpay Webhook`,
          collectedBy: 'System',
          date: todayStr,
          time: timeStr,
          receiptNumber: result.receiptNumber,
          razorpayPaymentId: paymentId,
          razorpayOrderId: orderId,
          notes: `Recorded via Webhook (${eventName})`,
          createdAt: pDate,
          updatedAt: pDate,
          docRef: `payments/${paymentId}`,
          verificationStatus: 'Verified',
          timeline: [
            { status: 'created', timestamp: pDate, remarks: 'Transaction registered in system via webhook' },
            { status: 'success', timestamp: pDate, remarks: `Payment marked as successful via Razorpay Webhook (${eventName})` }
          ]
        })

        // Write webhook payment success history
        await writeStudentHistoryAdmin(db, {
          studentId,
          studentName: result.studentName,
          eventType: 'payment_verified',
          newValue: `INR ${paymentEntity.amount / 100}`,
          remarks: `Razorpay Webhook payment success logged (${eventName}). Payment ID: ${paymentId}. Order ID: ${orderId}`,
          source: 'Razorpay Webhook',
          paymentId: paymentId
        })
        
        // Update gateway status with last payment timestamp
        await gatewayStatusRef.set({
          lastPaymentAt: new Date().toISOString(),
          lastSyncAt: new Date().toISOString(),
        }, { merge: true })

        console.log(`[Payment Success] Webhook successfully recorded payment: ${paymentId} for student: ${result.studentName}`)
      } else {
        console.log(`[Payment Success (Duplicate)] Webhook bypassed duplicate payment: ${paymentId}`)
      }
    } else if (eventName === 'payment.failed') {
      const paymentEntity = payload.payload.payment.entity
      const paymentId = paymentEntity.id
      const errorMsg = paymentEntity.error_description || 'Payment failed'
      const studentId = paymentEntity.notes?.studentId || 'unknown'
      const studentName = paymentEntity.notes?.studentName || 'Student'
      const studentClass = Number(paymentEntity.notes?.studentClass) || 0
      const studentRoll = paymentEntity.notes?.studentRoll || 'N/A'
      
      console.error(`[Payment Failed] Razorpay Webhook failed. Payment ID: ${paymentId}, Student: ${studentId}, Reason: ${errorMsg}`)
      
      const pDate = new Date().toISOString()
      const todayStr = pDate.split('T')[0]
      const timeStr = pDate.split('T')[1].slice(0, 8)

      // Write failed transaction history
      await db.collection('transactions').doc(paymentId).set({
        id: paymentId,
        studentId,
        studentName,
        studentClass,
        studentRoll,
        transactionType: 'failed_attempt',
        amount: paymentEntity.amount / 100,
        discount: 0,
        fine: 0,
        netAmount: paymentEntity.amount / 100,
        paymentMethod: 'Razorpay',
        paymentStatus: 'failed',
        collectionSource: 'Razorpay Webhook',
        collectedBy: 'System',
        date: todayStr,
        time: timeStr,
        receiptNumber: `RCPT-FAILED-${Date.now()}`,
        razorpayPaymentId: paymentId,
        razorpayOrderId: paymentEntity.order_id || '',
        notes: `Razorpay payment failed. Reason: ${errorMsg}`,
        createdAt: pDate,
        updatedAt: pDate,
        docRef: `failed_attempts/${paymentId}`,
        verificationStatus: 'Failed',
        timeline: [
          { status: 'created', timestamp: pDate, remarks: 'Transaction registered as failed' },
          { status: 'failed', timestamp: pDate, remarks: `Payment attempt failed: ${errorMsg}` }
        ]
      })

      // Write payment failed history
      await writeStudentHistoryAdmin(db, {
        studentId,
        studentName,
        eventType: 'payment_failed',
        prevValue: `INR ${paymentEntity.amount / 100}`,
        remarks: `Razorpay payment failed. Reason: ${errorMsg}. Payment ID: ${paymentId}`,
        source: 'Razorpay Webhook',
        paymentId: paymentId
      })
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('[Razorpay Webhook Handler Error]', error)
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 })
  }
}
