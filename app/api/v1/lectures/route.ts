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
    console.log('[API Access] GET /api/v1/lectures - Request received')

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
    const teacherName = searchParams.get('teacherName')
    const classParam = searchParams.get('class')
    const batch = searchParams.get('batch')
    const limitQuery = searchParams.get('limit')
    const limitNum = Math.min(parseInt(limitQuery || '100', 10), 300)

    const db = getAdminDb()
    let query: FirebaseFirestore.Query = db
      .collection('lectures')
      .orderBy('date', 'desc')
      .limit(limitNum)

    const snap = await query.get()
    const rawLectures: any[] = []
    const teacherCounts: Record<string, { count: number; subjects: Set<string>; classes: Set<number | string> }> = {}

    snap.forEach(docSnap => {
      const data = docSnap.data()

      // In-memory filter if params passed
      if (teacherName && data.teacherName?.toLowerCase() !== teacherName.toLowerCase()) {
        return
      }
      if (classParam && String(data.class) !== String(classParam)) {
        return
      }
      if (batch && data.batch?.toLowerCase() !== batch.toLowerCase()) {
        return
      }

      const item = {
        id: docSnap.id,
        teacherName: data.teacherName || 'Unknown Teacher',
        teacherId: data.teacherId || '',
        class: typeof data.class === 'number' ? data.class : parseInt(String(data.class || '0'), 10),
        batch: data.batch || '',
        subject: data.subject || 'General',
        topic: data.topic || '',
        date: data.date || '',
        startTime: data.startTime || '',
        endTime: data.endTime || '',
        durationMinutes: typeof data.durationMinutes === 'number' ? data.durationMinutes : 60,
        notes: data.notes || '',
        recordedBy: data.recordedBy || '',
        createdAt: data.createdAt || '',
      }

      rawLectures.push(item)

      // Aggregate teacher stats
      const tName = item.teacherName
      if (!teacherCounts[tName]) {
        teacherCounts[tName] = { count: 0, subjects: new Set(), classes: new Set() }
      }
      teacherCounts[tName].count += 1
      if (item.subject) teacherCounts[tName].subjects.add(item.subject)
      if (item.class) teacherCounts[tName].classes.add(item.class)
    })

    const teacherSummary = Object.entries(teacherCounts).map(([name, stats]) => ({
      teacherName: name,
      lectureCount: stats.count,
      subjects: Array.from(stats.subjects),
      classes: Array.from(stats.classes),
    })).sort((a, b) => b.lectureCount - a.lectureCount)

    return NextResponse.json({
      success: true,
      data: {
        lectures: sanitizeFirestoreData(rawLectures),
        totalLectures: rawLectures.length,
        teacherSummary,
      },
    })
  } catch (error: any) {
    console.error('[API Error] GET /api/v1/lectures exception caught:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Unable to load lectures' },
      { status: 500 }
    )
  }
}

export async function POST(req: NextRequest) {
  try {
    console.log('[API Access] POST /api/v1/lectures - Request received')

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

    const body = await req.json()
    const {
      teacherName,
      teacherId,
      class: classVal,
      batch,
      subject,
      topic,
      date,
      startTime,
      endTime,
      durationMinutes,
      notes,
    } = body

    if (!teacherName || !classVal || !subject || !topic) {
      return NextResponse.json(
        { success: false, error: 'Teacher Name, Class, Subject, and Topic are required.' },
        { status: 400 }
      )
    }

    const db = getAdminDb()
    const nowISO = new Date().toISOString()
    const lectureDate = date ? String(date).slice(0, 10) : nowISO.slice(0, 10)

    const classNum = typeof classVal === 'number' ? classVal : parseInt(String(classVal), 10)

    const lectureRecord: any = {
      teacherName: String(teacherName).trim(),
      teacherId: teacherId ? String(teacherId) : '',
      class: isNaN(classNum) ? classVal : classNum,
      batch: batch ? String(batch).trim() : '',
      subject: String(subject).trim(),
      topic: String(topic).trim(),
      date: lectureDate,
      startTime: startTime || '',
      endTime: endTime || '',
      durationMinutes: typeof durationMinutes === 'number' ? durationMinutes : 60,
      notes: notes ? String(notes).trim() : '',
      recordedBy: email || role,
      createdAt: nowISO,
      updatedAt: nowISO,
    }

    const docRef = await db.collection('lectures').add(lectureRecord)

    console.log(`[API Access] Created lecture log ${docRef.id} for teacher ${teacherName}`)

    return NextResponse.json({
      success: true,
      data: {
        id: docRef.id,
        ...sanitizeFirestoreData(lectureRecord),
      },
    }, { status: 201 })
  } catch (error: any) {
    console.error('[API Error] POST /api/v1/lectures exception caught:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Unable to record lecture' },
      { status: 500 }
    )
  }
}
