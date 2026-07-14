import { NextRequest, NextResponse } from 'next/server'
import { getAdminDb, runHistoryReconstructionMigration } from '@/lib/firebase-admin'

export async function GET(req: NextRequest) {
  try {
    const keyId = process.env.RAZORPAY_KEY_ID
    const secret = process.env.RAZORPAY_KEY_SECRET
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET

    const isConnected = !!(keyId && secret)
    const isWebhookConfigured = !!webhookSecret

    let mode: 'Live Mode' | 'Test Mode' | 'Disconnected' = 'Disconnected'
    if (isConnected) {
      mode = keyId!.startsWith('rzp_live') ? 'Live Mode' : 'Test Mode'
    }

    const db = getAdminDb()
    const snap = await db.collection('gateway_status').doc('status').get()
    const metadata = snap.exists ? snap.data()! : {}

    if (!metadata.historyReconstructed) {
      runHistoryReconstructionMigration().catch(err => {
        console.error('[History Migration Failed]:', err)
      })
    }

    // Expose only public metadata and connection metrics
    return NextResponse.json({
      isConnected,
      isWebhookConfigured,
      mode,
      keyId: keyId ? `${keyId.slice(0, 8)}...` : '',
      lastPayment: metadata.lastPaymentAt || null,
      lastWebhook: metadata.lastWebhookAt || null,
      lastWebhookEvent: metadata.lastWebhookEvent || null,
      lastSync: metadata.lastSyncAt || new Date().toISOString(),
      lastSyncStatus: metadata.lastSyncStatus || 'Connected',
    })
  } catch (error: any) {
    console.error('[Razorpay Status API Error]', error)
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 })
  }
}
