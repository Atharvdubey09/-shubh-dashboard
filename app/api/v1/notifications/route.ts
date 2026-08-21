import { NextRequest, NextResponse } from 'next/server'
import { getAdminDb, verifySessionAndGetRole } from '@/lib/firebase-admin'

export const runtime = 'nodejs'

function sanitizeFirestoreData(val: any): any {
  if (val === null || val === undefined) return null
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

export async function GET(req: NextRequest) {
  try {
    console.log('[API Access] GET /api/v1/notifications - Request received')

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
    console.log(`[API Access] Authenticated user: ${email}, role: ${role}`)

    const { searchParams } = req.nextUrl
    const typeParam = searchParams.get('type')
    const limitQuery = searchParams.get('limit')
    const limitNum = Math.min(parseInt(limitQuery || '50', 10), 100)

    const db = getAdminDb()
    let query: FirebaseFirestore.Query = db
      .collection('notifications')
      .orderBy('createdAt', 'desc')
      .limit(limitNum)

    const snap = await query.get()
    const notifications: any[] = []

    snap.forEach(docSnap => {
      const data = docSnap.data()

      // Teacher role must never receive fee/financial notifications
      if (role === 'teacher' && data.type === 'fee') {
        return
      }

      if (typeParam && data.type !== typeParam) {
        return
      }

      notifications.push({
        id: docSnap.id,
        title: data.title || '',
        body: data.body || '',
        type: data.type || 'system', // 'fee' | 'student' | 'attendance' | 'lecture' | 'system'
        isRead: !!data.isRead,
        recipientRoles: data.recipientRoles || [],
        metadata: data.metadata || {},
        createdAt: data.createdAt || '',
      })
    })

    return NextResponse.json({
      success: true,
      data: sanitizeFirestoreData(notifications),
    })
  } catch (error: any) {
    console.error('[API Error] GET /api/v1/notifications exception caught:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Unable to load notifications' },
      { status: 500 }
    )
  }
}

export async function POST(req: NextRequest) {
  try {
    console.log('[API Access] POST /api/v1/notifications - Request received')

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
    const body = await req.json()
    const { title, body: content, type, recipientRoles, metadata } = body

    if (!title || !content) {
      return NextResponse.json(
        { success: false, error: 'Title and content are required.' },
        { status: 400 }
      )
    }

    // Role guard: teachers cannot create fee notification records
    if (role === 'teacher' && type === 'fee') {
      return NextResponse.json(
        { success: false, error: 'Teachers do not have permission to trigger fee notifications.' },
        { status: 403 }
      )
    }

    const db = getAdminDb()
    const nowISO = new Date().toISOString()

    const notificationRecord: any = {
      title: String(title).trim(),
      body: String(content).trim(),
      type: type || 'system',
      isRead: false,
      recipientRoles: Array.isArray(recipientRoles) ? recipientRoles : ['admin', 'owner', 'staff'],
      metadata: metadata || {},
      createdByUser: email || role,
      createdAt: nowISO,
      updatedAt: nowISO,
    }

    const docRef = await db.collection('notifications').add(notificationRecord)

    return NextResponse.json({
      success: true,
      data: {
        id: docRef.id,
        ...sanitizeFirestoreData(notificationRecord),
      },
    }, { status: 201 })
  } catch (error: any) {
    console.error('[API Error] POST /api/v1/notifications exception caught:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Unable to record notification' },
      { status: 500 }
    )
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await verifySessionAndGetRole(req)
    if ('error' in session) {
      return NextResponse.json({ success: false, error: session.error }, { status: 401 })
    }

    const body = await req.json()
    const { id, markAllRead } = body
    const db = getAdminDb()

    if (markAllRead) {
      const snap = await db.collection('notifications').where('isRead', '==', false).get()
      const batch = db.batch()
      snap.forEach(docSnap => {
        batch.update(docSnap.ref, { isRead: true, updatedAt: new Date().toISOString() })
      })
      await batch.commit()
      return NextResponse.json({ success: true, message: 'All notifications marked as read.' })
    }

    if (id) {
      await db.collection('notifications').doc(id).update({
        isRead: true,
        updatedAt: new Date().toISOString(),
      })
      return NextResponse.json({ success: true, message: 'Notification marked as read.' })
    }

    return NextResponse.json({ success: false, error: 'Invalid request' }, { status: 400 })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
