import { NextRequest, NextResponse } from 'next/server'
import { getAdminDb, verifySessionAndGetRole } from '@/lib/firebase-admin'

export const runtime = 'nodejs'

const DEFAULT_PAGE_SIZE = 50
const MAX_PAGE_SIZE = 100


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

export async function GET(req: NextRequest) {
  try {
    console.log('[API Access] GET /api/v1/students - Request received')

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

    // 2. Parse & Validate Query Parameters
    const { searchParams } = req.nextUrl
    const limitQuery = searchParams.get('limit') || searchParams.get('pageSize')
    const pageSizeParam = parseInt(limitQuery || String(DEFAULT_PAGE_SIZE), 10)
    const pageSize = Math.max(1, Math.min(pageSizeParam || DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE))
    const nextCursor = searchParams.get('nextCursor') || null

    const classFilter = searchParams.get('class')
    const batchFilter = searchParams.get('batch')
    const statusFilter = searchParams.get('status')
    const nameFilter = searchParams.get('name')

    console.log(`[API Access] Query parameters - limit: ${pageSize}, cursor: ${nextCursor}, class: ${classFilter}, batch: ${batchFilter}, status: ${statusFilter}`)

    // 3. Query Firestore with Native Pagination & Soft-Delete Filtering
    const db = getAdminDb()
    let cursorId = nextCursor
    const activeStudents: any[] = []

    console.log('[API Access] Initiating query on Firestore students collection...')

    while (activeStudents.length < pageSize) {
      let batchQuery = db.collection('students').orderBy('name', 'asc')

      // Fetch slightly more to account for soft-deleted/filtered documents in the batch
      const fetchLimit = pageSize - activeStudents.length + 5
      batchQuery = batchQuery.limit(fetchLimit)

      if (cursorId) {
        const cursorDocSnap = await db.collection('students').doc(cursorId).get()
        if (cursorDocSnap.exists) {
          batchQuery = batchQuery.startAfter(cursorDocSnap)
        } else {
          console.warn(`[API Access] cursorId "${cursorId}" not found in Firestore`)
          break
        }
      }

      const snap = await batchQuery.get()
      if (snap.empty) {
        break
      }

      let newCursorId = null
      for (const docSnap of snap.docs) {
        const data = docSnap.data()
        newCursorId = docSnap.id

        // Apply soft-delete filter
        if (data.is_deleted !== true) {
          // Apply status filter in memory to avoid Firestore composite index requirements
          if (statusFilter && data.status !== statusFilter) {
            continue
          }

          // Apply class filter in memory
          if (classFilter && data.class !== parseInt(classFilter, 10)) {
            continue
          }

          // Apply batch filter in memory
          if (batchFilter && data.batch !== batchFilter) {
            continue
          }

          // Future client name search filtering (case-insensitive substring match)
          if (nameFilter && !data.name?.toLowerCase().includes(nameFilter.toLowerCase())) {
            continue
          }

          // Build clean student record using raw data, then sanitize
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

          // Sanitize Firestore types (Timestamps/References) recursively to ensure JSON safety
          const sanitizedStudent = sanitizeFirestoreData(rawStudent)
          activeStudents.push(sanitizedStudent)

          if (activeStudents.length === pageSize) {
            break
          }
        }
      }

      // Check if we reached the end of the query batch
      if (snap.docs.length < fetchLimit) {
        cursorId = newCursorId
        break
      }

      cursorId = newCursorId
    }

    console.log(`[API Access] Query completed. Fetched ${activeStudents.length} active students.`)

    // 4. Lookahead check to determine if nextCursor is valid
    let nextCursorValue: string | null = null
    if (activeStudents.length === pageSize && cursorId) {
      let lookaheadQuery = db.collection('students').orderBy('name', 'asc')
      const cursorDocSnap = await db.collection('students').doc(cursorId).get()
      if (cursorDocSnap.exists) {
        // Lookahead check gets the next 15 records to see if any match our filters
        const lookaheadSnap = await lookaheadQuery.startAfter(cursorDocSnap).limit(15).get()
        if (!lookaheadSnap.empty) {
          let hasMoreMatching = false
          for (const docSnap of lookaheadSnap.docs) {
            const data = docSnap.data()
            if (data.is_deleted !== true) {
              if (statusFilter && data.status !== statusFilter) continue
              if (classFilter && data.class !== parseInt(classFilter, 10)) continue
              if (batchFilter && data.batch !== batchFilter) continue
              if (nameFilter && !data.name?.toLowerCase().includes(nameFilter.toLowerCase())) continue
              hasMoreMatching = true
              break
            }
          }
          if (hasMoreMatching) {
            nextCursorValue = cursorId
          }
        }
      }
    }

    console.log('[API Access] Response serialization complete. Returning success.')

    // 5. Successful Response
    return NextResponse.json({
      success: true,
      data: activeStudents,
      pagination: {
        pageSize: activeStudents.length,
        nextCursor: nextCursorValue,
      },
    })
  } catch (error: any) {
    console.error('[API Error] GET /api/v1/students exception caught:', error)
    return NextResponse.json(
      { success: false, error: 'Unable to load students' },
      { status: 500 }
    )
  }
}
