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
    console.log(`[API Access] GET /api/v1/students/${id}/fees - Request received`)

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

    // 2. Authorize Financial Roles (Explicitly Block Teachers)
    const allowedRoles = ['Owner', 'Admin', 'Accountant', 'Receptionist']
    if (!allowedRoles.includes(role)) {
      console.warn(`[API Access] User ${email} with role ${role} denied access to financial data`)
      return NextResponse.json(
        { success: false, error: 'Access denied' },
        { status: 403 }
      )
    }

    // 3. Fetch Student Document from Firestore
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

    // 4. Handle Soft-Deleted Students
    if (data.is_deleted === true) {
      console.warn(`[API Access] Student ID "${id}" is soft-deleted`)
      return NextResponse.json(
        { success: false, error: 'Student not found' },
        { status: 404 }
      )
    }

    // 5. Map and Sanitize Student Fee Details
    const rawFees: any = {
      studentId: docSnap.id,
      totalFee: typeof data.totalFee === 'number' ? data.totalFee : 0,
      paid: typeof data.paid === 'number' ? data.paid : 0,
      pending: typeof data.pending === 'number' ? data.pending : Math.max((data.totalFee || 0) - (data.paid || 0), 0),
      paymentType: data.paymentType || 'Monthly',
      feePlan: data.feePlan || null,
      feeSchedule: data.feeSchedule || [],
      promiseToPayDate: data.promiseToPayDate || null,
      monthlyFee: typeof data.monthlyFee === 'number' ? data.monthlyFee : null,
      dueDay: typeof data.dueDay === 'number' ? data.dueDay : null,
    }

    // Convert Firestore Timestamp / Reference objects recursively
    const sanitizedFees = sanitizeFirestoreData(rawFees)

    console.log(`[API Access] Successfully fetched and serialized fees for student ID "${id}"`)

    return NextResponse.json({
      success: true,
      data: sanitizedFees,
    })
  } catch (error: any) {
    console.error(`[API Error] GET /api/v1/students/[id]/fees exception caught:`, error)
    return NextResponse.json(
      { success: false, error: 'Unable to load student fees summary' },
      { status: 500 }
    )
  }
}
