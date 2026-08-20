import { NextRequest, NextResponse } from 'next/server'
import { getAdminDb, verifySessionAndGetRole } from '@/lib/firebase-admin'

export const runtime = 'nodejs'

// Helper to recursively convert Firestore non-serializable objects (Timestamps, DocumentReferences) into JSON-safe representations
function sanitizeFirestoreData(val: any): any {
  if (val === null || val === undefined) {
    return null
  }

  // Handle Firestore Timestamp object
  if (typeof val.toDate === 'function') {
    try {
      return val.toDate().toISOString()
    } catch (_) {}
  }

  if (typeof val === 'object') {
    // Handle DocumentReference objects (convert reference to its string ID)
    if (val.id && typeof val.path === 'string' && typeof val.get === 'function') {
      return val.id
    }
    // Handle raw Timestamp-like objects with seconds and nanoseconds
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

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    console.log(`[API Access] GET /api/v1/students/${id} - Request received`)

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

    // 2. Fetch Student Document from Firestore
    const db = getAdminDb()
    const docSnap = await db.collection('students').doc(id).get()

    if (!docSnap.exists) {
      console.warn(`[API Access] Student ID "${id}" not found in Firestore`)
      return NextResponse.json(
        { success: false, error: 'Student not found' },
        { status: 404 }
      )
    }

    const data = docSnap.data()!

    // 3. Handle Soft-Deleted Students
    if (data.is_deleted === true) {
      console.warn(`[API Access] Student ID "${id}" is soft-deleted`)
      return NextResponse.json(
        { success: false, error: 'Student not found' },
        { status: 404 }
      )
    }

    // 4. Map and Sanitize Student Profile Fields
    const rawStudent: any = {
      id: docSnap.id,
      name: data.name || '',
      class: typeof data.class === 'number' ? data.class : 0,
      batch: data.batch || '',
      parentPhone: data.parentPhone || '',
      parentName: data.parentName || '',
      studentPhone: data.studentPhone || '',
      whatsapp: data.whatsapp || '',
      address: data.address || '',
      joined: data.joined || '',
      status: data.status || 'active',
      photoUrl: data.photoUrl || null,
      notes: data.notes || '',
      createdAt: data.createdAt || '',
      updatedAt: data.updatedAt || '',
    }

    // Role-based data sanitization (Teacher Financial Protection)
    if (role !== 'Teacher') {
      rawStudent.totalFee = typeof data.totalFee === 'number' ? data.totalFee : 0
      rawStudent.paid = typeof data.paid === 'number' ? data.paid : 0
      rawStudent.pending = typeof data.pending === 'number' ? data.pending : 0
      rawStudent.paymentType = data.paymentType || 'Monthly'
      rawStudent.feePlan = data.feePlan || null
      rawStudent.feeSchedule = data.feeSchedule || []
      rawStudent.promiseToPayDate = data.promiseToPayDate || null
      rawStudent.monthlyFee = typeof data.monthlyFee === 'number' ? data.monthlyFee : null
      rawStudent.dueDay = typeof data.dueDay === 'number' ? data.dueDay : null
    }

    // Convert Firestore Timestamp / Reference objects recursively
    const sanitizedStudent = sanitizeFirestoreData(rawStudent)

    console.log(`[API Access] Successfully fetched and serialized student ID "${id}"`)

    return NextResponse.json({
      success: true,
      data: sanitizedStudent,
    })
  } catch (error: any) {
    console.error(`[API Error] GET /api/v1/students/[id] exception caught:`, error)
    return NextResponse.json(
      { success: false, error: 'Unable to load student details' },
      { status: 500 }
    )
  }
}
