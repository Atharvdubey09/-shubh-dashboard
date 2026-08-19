import { NextRequest, NextResponse } from 'next/server'
import { getAdminDb, verifySessionAndGetRole } from '@/lib/firebase-admin'

export const runtime = 'nodejs'

const DEFAULT_PAGE_SIZE = 50
const MAX_PAGE_SIZE = 100

export async function GET(req: NextRequest) {
  try {
    // 1. Authenticate & Resolve Role
    const session = await verifySessionAndGetRole(req)
    if ('error' in session) {
      return NextResponse.json(
        { success: false, error: session.error },
        { status: session.status || 401 }
      )
    }

    const { email, role } = session
    console.log(`[API Access] GET /api/v1/students - User: ${email} - Role: ${role}`)

    // 2. Parse & Validate Query Parameters
    const { searchParams } = req.nextUrl
    const limitQuery = searchParams.get('limit') || searchParams.get('pageSize')
    const pageSizeParam = parseInt(limitQuery || String(DEFAULT_PAGE_SIZE), 10)
    const pageSize = Math.max(1, Math.min(pageSizeParam || DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE))
    const nextCursor = searchParams.get('nextCursor') || null

    // Future Filters support
    const classFilter = searchParams.get('class')
    const batchFilter = searchParams.get('batch')
    const statusFilter = searchParams.get('status')
    const nameFilter = searchParams.get('name')

    // 3. Query Firestore with Native Pagination & Soft-Delete Filtering
    const db = getAdminDb()
    let cursorId = nextCursor
    const activeStudents: any[] = []

    while (activeStudents.length < pageSize) {
      let batchQuery = db.collection('students').orderBy('name', 'asc')

      // Apply dynamic filters if present
      if (classFilter) {
        batchQuery = batchQuery.where('class', '==', parseInt(classFilter, 10))
      }
      if (batchFilter) {
        batchQuery = batchQuery.where('batch', '==', batchFilter)
      }
      if (statusFilter) {
        batchQuery = batchQuery.where('status', '==', statusFilter)
      }

      // Fetch slightly more to account for soft-deleted documents in the batch
      const fetchLimit = pageSize - activeStudents.length + 5
      batchQuery = batchQuery.limit(fetchLimit)

      if (cursorId) {
        const cursorDocSnap = await db.collection('students').doc(cursorId).get()
        if (cursorDocSnap.exists) {
          batchQuery = batchQuery.startAfter(cursorDocSnap)
        } else {
          // Cursor document not found, prevent infinite loop
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
          // Future client name search filtering (case-insensitive substring match)
          if (nameFilter && !data.name?.toLowerCase().includes(nameFilter.toLowerCase())) {
            continue
          }

          // Build clean student record
          const student: any = {
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
            student.totalFee = typeof data.totalFee === 'number' ? data.totalFee : 0
            student.paid = typeof data.paid === 'number' ? data.paid : 0
            student.pending = typeof data.pending === 'number' ? data.pending : 0
            student.paymentType = data.paymentType || 'Monthly'
            student.feePlan = data.feePlan || null
            student.feeSchedule = data.feeSchedule || []
            student.promiseToPayDate = data.promiseToPayDate || null
            student.monthlyFee = typeof data.monthlyFee === 'number' ? data.monthlyFee : null
            student.dueDay = typeof data.dueDay === 'number' ? data.dueDay : null
          }

          activeStudents.push(student)

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

    // 4. Lookahead check to determine if nextCursor is valid
    let nextCursorValue: string | null = null
    if (activeStudents.length === pageSize && cursorId) {
      let lookaheadQuery = db.collection('students').orderBy('name', 'asc')
      if (classFilter) {
        lookaheadQuery = lookaheadQuery.where('class', '==', parseInt(classFilter, 10))
      }
      if (batchFilter) {
        lookaheadQuery = lookaheadQuery.where('batch', '==', batchFilter)
      }
      if (statusFilter) {
        lookaheadQuery = lookaheadQuery.where('status', '==', statusFilter)
      }

      const cursorDocSnap = await db.collection('students').doc(cursorId).get()
      if (cursorDocSnap.exists) {
        const lookaheadSnap = await lookaheadQuery.startAfter(cursorDocSnap).limit(1).get()
        if (!lookaheadSnap.empty) {
          nextCursorValue = cursorId
        }
      }
    }

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
    console.error('[API Error] GET /api/v1/students:', error)
    return NextResponse.json(
      { success: false, error: 'Internal Server Error' },
      { status: 500 }
    )
  }
}
