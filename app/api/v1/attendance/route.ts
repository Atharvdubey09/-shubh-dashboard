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
    console.log('[API Access] GET /api/v1/attendance - Request received')

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

    const { searchParams } = req.nextUrl
    const date = searchParams.get('date') || new Date().toISOString().slice(0, 10)
    const classParam = searchParams.get('class')
    const studentId = searchParams.get('studentId')

    const db = getAdminDb()
    let query: FirebaseFirestore.Query = db.collection('attendance')

    if (studentId) {
      query = query.where('studentId', '==', studentId)
    } else {
      query = query.where('date', '==', date)
    }

    const snap = await query.get()
    const records: any[] = []

    snap.forEach(docSnap => {
      const data = docSnap.data()
      if (classParam && String(data.class) !== String(classParam)) {
        return
      }
      records.push({
        id: docSnap.id,
        studentId: data.studentId || '',
        studentName: data.studentName || '',
        class: data.class || null,
        batch: data.batch || '',
        date: data.date || '',
        status: data.status || 'present',
        notes: data.notes || '',
        markedBy: data.markedBy || '',
        createdAt: data.createdAt || '',
      })
    })

    return NextResponse.json({
      success: true,
      data: sanitizeFirestoreData(records),
    })
  } catch (error: any) {
    console.error('[API Error] GET /api/v1/attendance exception caught:', error)
    return NextResponse.json(
      { success: false, error: 'Unable to load attendance records' },
      { status: 500 }
    )
  }
}

export async function POST(req: NextRequest) {
  try {
    console.log('[API Access] POST /api/v1/attendance - Request received')

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

    const body = await req.json()
    const records: any[] = Array.isArray(body) ? body : (Array.isArray(body.records) ? body.records : [body])

    if (records.length === 0) {
      return NextResponse.json({ success: false, error: 'No attendance records provided' }, { status: 400 })
    }

    const db = getAdminDb()
    const batch = db.batch()
    const nowISO = new Date().toISOString()

    records.forEach(rec => {
      const sId = (rec.studentId || rec.student_id || '').trim()
      const d = (rec.date || rec.attendance_date || new Date().toISOString().slice(0, 10)).slice(0, 10)
      if (!sId) return

      const docId = `${sId}_${d}`
      const docRef = db.collection('attendance').doc(docId)

      batch.set(docRef, {
        id: docId,
        studentId: sId,
        studentName: rec.studentName || rec.student?.full_name || '',
        class: rec.class ?? (rec.student?.current_enrollment?.batch?.class?.standard_number || null),
        batch: rec.batch || rec.batch_id || '',
        date: d,
        status: rec.status || rec.tempStatus || 'present',
        notes: rec.notes || '',
        markedBy: email || role,
        updatedAt: nowISO,
        createdAt: nowISO,
      }, { merge: true })
    })

    await batch.commit()

    console.log(`[API Access] Successfully committed ${records.length} attendance records`)

    return NextResponse.json({
      success: true,
      count: records.length,
    }, { status: 201 })
  } catch (error: any) {
    console.error('[API Error] POST /api/v1/attendance exception caught:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Unable to save attendance' },
      { status: 500 }
    )
  }
}
