import { getApps, initializeApp, cert } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

export function getFirebaseAdminApp() {
  const activeApps = getApps()
  if (activeApps.length) {
    return activeApps[0]!
  }

  // 1. Try Environment Variables (Individual and JSON-string variables)
  let projectId = process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
  let clientEmail = process.env.FIREBASE_CLIENT_EMAIL
  let privateKey = process.env.FIREBASE_PRIVATE_KEY

  // Helper to strip quotes
  const cleanEnvVar = (val: string | undefined): string | undefined => {
    if (!val) return val
    let cleaned = val.trim()
    if (cleaned.startsWith('"') && cleaned.endsWith('"')) {
      cleaned = cleaned.substring(1, cleaned.length - 1)
    }
    if (cleaned.startsWith("'") && cleaned.endsWith("'")) {
      cleaned = cleaned.substring(1, cleaned.length - 1)
    }
    return cleaned
  }

  projectId = cleanEnvVar(projectId)
  clientEmail = cleanEnvVar(clientEmail)
  privateKey = cleanEnvVar(privateKey)

  if (privateKey) {
    privateKey = privateKey.replace(/\\n/g, '\n')
  }

  // 1a. Try single JSON credentials environment variable
  const jsonEnv = process.env.FIREBASE_SERVICE_ACCOUNT_JSON || 
                  process.env.FIREBASE_SERVICE_ACCOUNT || 
                  process.env.FIREBASE_SERVICE_ACCOUNT_KEY || 
                  process.env.FIREBASE_CREDENTIALS;

  if (jsonEnv) {
    try {
      let cleanedJson = jsonEnv.trim()
      if (cleanedJson.startsWith('"') && cleanedJson.endsWith('"')) {
        cleanedJson = cleanedJson.substring(1, cleanedJson.length - 1)
      }
      if (cleanedJson.startsWith("'") && cleanedJson.endsWith("'")) {
        cleanedJson = cleanedJson.substring(1, cleanedJson.length - 1)
      }
      const serviceAccount = JSON.parse(cleanedJson)
      if (serviceAccount.private_key) {
        serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n')
      }
      console.log('[Firebase Admin Init]: Using Service Account JSON Environment Variable.')
      return initializeApp({
        credential: cert(serviceAccount),
        projectId: serviceAccount.project_id || projectId,
        storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
      })
    } catch (err) {
      console.error('[Firebase Admin Init Error]: Failed to parse service account JSON from environment:', err)
    }
  }

  // 1b. Try individual credentials variables
  if (projectId && clientEmail && privateKey) {
    console.log('[Firebase Admin Init]: Using Service Account Environment Variables.')
    return initializeApp({
      credential: cert({
        projectId,
        clientEmail,
        privateKey,
      }),
      projectId,
      storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    })
  }

  // 2. Try Local Service Account JSON File (Check standard and double-extension paths)
  try {
    const fs = require('fs')
    const path = require('path')
    const filePaths = [
      path.resolve(process.cwd(), 'firebase-service-account.json'),
      path.resolve(process.cwd(), 'firebase-service-account.json.json')
    ]

    for (const filePath of filePaths) {
      if (fs.existsSync(filePath)) {
        console.log(`[Firebase Admin Init]: Using local file: ${path.basename(filePath)}`)
        const serviceAccount = JSON.parse(fs.readFileSync(filePath, 'utf8'))
        return initializeApp({
          credential: cert(serviceAccount),
          projectId: serviceAccount.project_id || projectId,
          storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
        })
      }
    }
  } catch (err) {
    console.warn('[Firebase Admin Diagnostic Log]: Error reading local JSON file:', err)
  }

  // 3. Throw explicit Configuration Error
  throw new Error(
    'Firebase Admin SDK failed to initialize: Missing Credentials.\n' +
    'To resolve this, please either:\n' +
    '1. Add individual credentials to your .env.local / Vercel configuration:\n' +
    '   - FIREBASE_PROJECT_ID\n' +
    '   - FIREBASE_CLIENT_EMAIL\n' +
    '   - FIREBASE_PRIVATE_KEY\n' +
    '2. Save your service account credentials as a file named "firebase-service-account.json" in the root directory.\n' +
    'Do not rely on Google Cloud Application Default Credentials in this environment.'
  )
}

export function getAdminDb() {
  const app = getFirebaseAdminApp()
  return getFirestore(app)
}

export async function writeStudentHistoryAdmin(db: any, params: {
  studentId: string
  studentName: string
  eventType: string
  prevValue?: string
  newValue?: string
  remarks?: string
  source?: string
  paymentId?: string
  adminUser?: string
}) {
  const ref = db.collection('student_history').doc()
  const now = new Date()
  const date = now.toISOString().split('T')[0]
  const time = now.toTimeString().slice(0, 8)
  
  await ref.set({
    id: ref.id,
    studentId: params.studentId,
    studentName: params.studentName,
    eventType: params.eventType,
    prevValue: params.prevValue || '',
    newValue: params.newValue || '',
    remarks: params.remarks || '',
    source: params.source || 'System',
    paymentId: params.paymentId || '',
    adminUser: params.adminUser || 'Owner',
    date,
    time,
    timestamp: now.toISOString(),
  })
}

export async function runHistoryReconstructionMigration() {
  const db = getAdminDb()
  const statusRef = db.collection('gateway_status').doc('status')
  const statusSnap = await statusRef.get()
  const statusData = statusSnap.exists ? statusSnap.data() : {}
  
  if (statusData?.historyReconstructed) {
    return // Migration already run
  }

  console.log('[History Migration]: Starting historical data reconstruction...')
  const studentsSnap = await db.collection('students').get()
  const paymentsSnap = await db.collection('payments').get()
  const auditSnap = await db.collection('audit_logs').get()

  const allPayments = paymentsSnap.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }))
  const allAuditLogs = auditSnap.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }))

  for (const studentDoc of studentsSnap.docs) {
    const student = { id: studentDoc.id, ...studentDoc.data() } as any
    const studentId = student.id

    // Check if history already exists for this student
    const historySnap = await db.collection('student_history').where('studentId', '==', studentId).limit(1).get()
    if (!historySnap.empty) {
      continue // Skip if already reconstructed
    }

    const studentPayments = allPayments.filter((p: any) => p.studentId === studentId)
    const studentAuditLogs = allAuditLogs.filter((log: any) => log.targetId === studentId)

    const events: any[] = []

    // 1. Admission / Student Created
    const creationDate = student.createdAt || student.joined || new Date().toISOString()
    const creationTime = '00:00:00'
    
    events.push({
      studentId,
      studentName: student.name,
      eventType: 'student_created',
      date: creationDate.split('T')[0],
      time: creationTime,
      timestamp: creationDate,
      adminUser: 'System',
      prevValue: '',
      newValue: student.name,
      remarks: `Student registered and admitted on ${student.joined || creationDate.split('T')[0]}`,
      source: 'System Migration'
    })

    // 2. Fee Structure Created
    events.push({
      studentId,
      studentName: student.name,
      eventType: 'fee_structure_created',
      date: creationDate.split('T')[0],
      time: creationTime,
      timestamp: creationDate,
      adminUser: 'System',
      prevValue: '',
      newValue: `${student.paymentType} - INR ${student.totalFee}`,
      remarks: `Fee structure created: ${student.paymentType} plan of total fee INR ${student.totalFee}`,
      source: 'System Migration'
    })

    // 3. Installments Created
    if (student.feeSchedule && Array.isArray(student.feeSchedule)) {
      for (const item of student.feeSchedule) {
        events.push({
          studentId,
          studentName: student.name,
          eventType: 'installment_created',
          date: creationDate.split('T')[0],
          time: creationTime,
          timestamp: creationDate,
          adminUser: 'System',
          prevValue: '',
          newValue: `${item.label} (Due: ${item.dueDate})`,
          remarks: `Installment generated: ${item.label} of amount INR ${item.amount} due on ${item.dueDate}`,
          source: 'System Migration'
        })
      }
    }

    // 4. Payments Made
    for (const payment of studentPayments) {
      const pDate = payment.createdAt || payment.date + 'T12:00:00.000Z'
      events.push({
        studentId,
        studentName: student.name,
        eventType: 'payment_made',
        date: payment.date,
        time: pDate.includes('T') ? pDate.split('T')[1].slice(0, 8) : '12:00:00',
        timestamp: pDate,
        adminUser: 'Owner',
        prevValue: '',
        newValue: `INR ${payment.amount}`,
        remarks: `Payment recorded via ${payment.paymentMode}. Receipt: ${payment.receiptNumber || 'N/A'}${payment.notes ? ' - ' + payment.notes : ''}`,
        source: 'System Migration',
        paymentId: payment.id
      })
    }

    // 5. Audit Log Mappings (Manual Edits, Profile Updates, Fee Updates, Restore/Delete)
    for (const log of studentAuditLogs) {
      const lDate = log.createdAt || log.date + 'T' + log.time + '.000Z'
      let eventType = 'manual_edit'
      let remarks = `Field "${log.fieldName}" changed from "${log.oldValue}" to "${log.newValue}"`

      if (log.action === 'student_edit') {
        const profileFields = ['name', 'parentPhone', 'studentPhone', 'parentName', 'whatsapp', 'address']
        const feeFields = ['totalFee', 'paymentType', 'promiseToPayDate']
        
        if (profileFields.includes(log.fieldName)) {
          eventType = 'profile_updated'
          remarks = `Profile updated: Changed ${log.fieldName} from "${log.oldValue}" to "${log.newValue}"`
        } else if (feeFields.includes(log.fieldName)) {
          eventType = 'fee_updated'
          remarks = `Fee structure updated: Changed ${log.fieldName} from "${log.oldValue}" to "${log.newValue}"`
        }
      } else if (log.action === 'student_delete') {
        eventType = 'student_deleted'
        remarks = 'Student profile deleted / archived'
      } else if (log.action === 'student_restore') {
        eventType = 'student_restored'
        remarks = 'Student profile restored / unarchived'
      }

      events.push({
        studentId,
        studentName: student.name,
        eventType,
        date: log.date,
        time: log.time,
        timestamp: lDate,
        adminUser: log.user || 'Owner',
        prevValue: log.oldValue || '',
        newValue: log.newValue || '',
        remarks,
        source: 'Manual Edit'
      })
    }

    // Sort events chronologically (oldest to newest)
    events.sort((a: any, b: any) => a.timestamp.localeCompare(b.timestamp))

    // Write all events in batch to Firestore
    const batch = db.batch()
    for (const ev of events) {
      const ref = db.collection('student_history').doc()
      batch.set(ref, { id: ref.id, ...ev })
    }
    await batch.commit()
    console.log(`[History Migration]: Successfully reconstructed ${events.length} timeline events for student ${student.name}`)
  }

  // Set the migration completed flag
  await statusRef.set({ historyReconstructed: true }, { merge: true })
  console.log('[History Migration]: Chronological timeline reconstruction complete.')
}
