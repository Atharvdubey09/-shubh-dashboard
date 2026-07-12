import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import admin from 'firebase-admin'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')

const ADMIN_EMAIL = 'itatharvdubey@gmail.com'

const seed = {
  settings: {
    coachingName: 'Shubh Classes',
    ownerName: 'Shubh Dubey',
    phone: '98765 00000',
    address: '1st Floor, Shubh Complex, Station Road',
    reminders: {
      todaysDueFees: true,
      tomorrowsDueFees: true,
      rentAndSalary: true,
      utilities: true,
    },
  },
  students: [
    { id: 's1', name: 'Rahul Sharma', class: 8, batch: 'Morning A', parentPhone: '98765 43210', paymentType: 'Monthly', totalFee: 24000, paid: 21500, status: 'active', joined: '2026-04-01', notes: 'Strong in Maths. Needs attention in English grammar.' },
    { id: 's2', name: 'Pooja Verma', class: 10, batch: 'Evening B', parentPhone: '99887 66554', paymentType: 'Split', totalFee: 36000, paid: 31000, status: 'active', joined: '2026-03-01', notes: 'Board exam batch. Extra doubt sessions on Saturday.' },
    { id: 's3', name: 'Aarav Gupta', class: 6, batch: 'Morning A', parentPhone: '91234 56789', paymentType: 'Full Payment', totalFee: 18000, paid: 18000, status: 'active', joined: '2026-04-01', notes: 'Fee fully paid for the year.' },
    { id: 's4', name: 'Sneha Patel', class: 9, batch: 'Evening A', parentPhone: '90123 45678', paymentType: 'Monthly', totalFee: 30000, paid: 22500, status: 'active', joined: '2026-01-01', notes: 'Parents requested monthly progress report.' },
    { id: 's5', name: 'Vivaan Singh', class: 4, batch: 'Afternoon', parentPhone: '98700 12345', paymentType: 'Monthly', totalFee: 14400, paid: 13200, status: 'active', joined: '2026-06-01', notes: '' },
    { id: 's6', name: 'Ananya Joshi', class: 10, batch: 'Evening B', parentPhone: '99001 22334', paymentType: 'Split', totalFee: 36000, paid: 24000, status: 'active', joined: '2026-02-01', notes: 'Second installment due mid-July.' },
    { id: 's7', name: 'Kabir Mehta', class: 7, batch: 'Morning B', parentPhone: '98111 22333', paymentType: 'Monthly', totalFee: 21600, paid: 21600, status: 'active', joined: '2026-04-01', notes: '' },
    { id: 's8', name: 'Ishita Rao', class: 2, batch: 'Afternoon', parentPhone: '97654 32109', paymentType: 'Full Payment', totalFee: 12000, paid: 12000, status: 'active', joined: '2026-05-01', notes: 'Youngest sibling of Sneha (Class 9).' },
    { id: 's9', name: 'Arjun Nair', class: 9, batch: 'Evening A', parentPhone: '96543 21098', paymentType: 'Monthly', totalFee: 30000, paid: 25000, status: 'inactive', joined: '2024-12-01', notes: 'On break for one month - family travel.' },
    { id: 's10', name: 'Diya Kulkarni', class: 5, batch: 'Morning A', parentPhone: '95432 10987', paymentType: 'Monthly', totalFee: 16800, paid: 16800, status: 'active', joined: '2026-04-01', notes: '' },
  ],
  payments: [
    { id: 'p1', studentId: 's1', studentName: 'Rahul Sharma', amount: 2500, date: '2026-07-10', label: 'Monthly Fees - July', status: 'paid', paymentMode: 'Cash', notes: 'Collected at counter', receiptNumber: 'RCPT-20260710-RAH1' },
    { id: 'p2', studentId: 's2', studentName: 'Pooja Verma', amount: 5000, date: '2026-07-13', label: 'Split Payment', status: 'paid', paymentMode: 'UPI', notes: 'Second installment', receiptNumber: 'RCPT-20260713-POO2' },
    { id: 'p3', studentId: 's5', studentName: 'Vivaan Singh', amount: 1200, date: '2026-07-14', label: 'Monthly Fees - July', status: 'paid', paymentMode: 'Cash', notes: '', receiptNumber: 'RCPT-20260714-VIV3' },
    { id: 'p4', studentId: 's4', studentName: 'Sneha Patel', amount: 2500, date: '2026-07-15', label: 'Monthly Fees - July', status: 'paid', paymentMode: 'UPI', notes: '', receiptNumber: 'RCPT-20260715-SNE4' },
    { id: 'p5', studentId: 's6', studentName: 'Ananya Joshi', amount: 6000, date: '2026-07-16', label: 'Split Payment', status: 'paid', paymentMode: 'Cash', notes: '', receiptNumber: 'RCPT-20260716-ANA5' },
    { id: 'p6', studentId: 's1', studentName: 'Rahul Sharma', amount: 2500, date: '2026-06-10', label: 'Monthly Fees - June', status: 'paid', paymentMode: 'Cash', notes: '', receiptNumber: 'RCPT-20260610-RAH6' },
    { id: 'p7', studentId: 's1', studentName: 'Rahul Sharma', amount: 2500, date: '2026-05-10', label: 'Monthly Fees - May', status: 'paid', paymentMode: 'Cash', notes: '', receiptNumber: 'RCPT-20260510-RAH7' },
    { id: 'p8', studentId: 's2', studentName: 'Pooja Verma', amount: 12000, date: '2026-03-05', label: 'Installment 1 of 3', status: 'paid', paymentMode: 'UPI', notes: '', receiptNumber: 'RCPT-20260305-POO8' },
    { id: 'p9', studentId: 's2', studentName: 'Pooja Verma', amount: 12000, date: '2026-05-05', label: 'Installment 2 of 3', status: 'paid', paymentMode: 'UPI', notes: '', receiptNumber: 'RCPT-20260505-POO9' },
    { id: 'p10', studentId: 's6', studentName: 'Ananya Joshi', amount: 12000, date: '2026-02-20', label: 'Installment 1 of 3', status: 'paid', paymentMode: 'Cash', notes: '', receiptNumber: 'RCPT-20260220-ANA10' },
    { id: 'p11', studentId: 's6', studentName: 'Ananya Joshi', amount: 12000, date: '2026-04-20', label: 'Installment 2 of 3', status: 'paid', paymentMode: 'Cash', notes: '', receiptNumber: 'RCPT-20260420-ANA11' },
    { id: 'p12', studentId: 's7', studentName: 'Kabir Mehta', amount: 1800, date: '2026-07-02', label: 'Monthly Fees - July', status: 'paid', paymentMode: 'UPI', notes: '', receiptNumber: 'RCPT-20260702-KAB12' },
    { id: 'p13', studentId: 's10', studentName: 'Diya Kulkarni', amount: 1400, date: '2026-07-05', label: 'Monthly Fees - July', status: 'paid', paymentMode: 'Cash', notes: '', receiptNumber: 'RCPT-20260705-DIY13' },
    { id: 'p14', studentId: 's4', studentName: 'Sneha Patel', amount: 2500, date: '2026-07-08', label: 'Monthly Fees - July', status: 'overdue', paymentMode: 'Cash', notes: '', receiptNumber: 'RCPT-20260708-SNE14' },
    { id: 'p15', studentId: 's9', studentName: 'Arjun Nair', amount: 2500, date: '2026-07-08', label: 'Monthly Fees - July', status: 'overdue', paymentMode: 'Cash', notes: '', receiptNumber: 'RCPT-20260708-ARJ15' },
  ],
  expenses: [
    { id: 'e1', category: 'Rent', amount: 15000, date: '2026-07-01', note: 'July rent - Shubh Classes premises' },
    { id: 'e2', category: 'Teacher Salary', amount: 22000, date: '2026-07-05', note: 'Salaries - Sharma Sir & Meena Maam' },
    { id: 'e3', category: 'Electricity', amount: 4200, date: '2026-07-06', note: 'June bill - higher due to summer ACs' },
    { id: 'e4', category: 'Internet', amount: 999, date: '2026-07-03', note: 'Fiber plan - monthly' },
    { id: 'e5', category: 'Books', amount: 3600, date: '2026-06-28', note: 'Class 10 board sample papers x 24' },
    { id: 'e6', category: 'Stationery', amount: 850, date: '2026-06-25', note: 'Whiteboard markers, chalk, registers' },
    { id: 'e7', category: 'Other', amount: 1200, date: '2026-06-22', note: 'Water cooler service' },
  ],
}

function readServiceAccount() {
  const jsonEnv = process.env.FIREBASE_SERVICE_ACCOUNT_JSON || process.env.FIREBASE_SERVICE_ACCOUNT_KEY
  if (jsonEnv) {
    return JSON.parse(jsonEnv)
  }
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    const resolved = path.resolve(process.env.GOOGLE_APPLICATION_CREDENTIALS)
    return JSON.parse(fs.readFileSync(resolved, 'utf8'))
  }
  return null
}

function getAppInstance() {
  if (admin.apps.length) return admin.app()
  const serviceAccount = readServiceAccount()
  if (serviceAccount) {
    return admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: serviceAccount.project_id || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    })
  }
  return admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  })
}

async function main() {
  const app = getAppInstance()
  const db = admin.firestore(app)
  const batchSize = 450
  let batch = db.batch()
  let ops = 0

  function queue(ref, data) {
    batch.set(ref, data, { merge: true })
    ops += 1
    if (ops >= batchSize) {
      const commitBatch = batch
      batch = db.batch()
      ops = 0
      return commitBatch.commit()
    }
    return Promise.resolve()
  }

  const commitQueue = []

  commitQueue.push(queue(db.collection('settings').doc('app'), { ...seed.settings, updatedAt: new Date().toISOString() }))

  for (const student of seed.students) {
    commitQueue.push(queue(db.collection('students').doc(student.id), {
      ...student,
      paid: student.paid,
      pending: Math.max(student.totalFee - student.paid, 0),
      createdAt: student.joined,
      updatedAt: student.joined,
    }))
  }

  for (const payment of seed.payments) {
    commitQueue.push(queue(db.collection('payments').doc(payment.id), {
      ...payment,
      createdAt: payment.date,
    }))
  }

  for (const expense of seed.expenses) {
    commitQueue.push(queue(db.collection('expenses').doc(expense.id), {
      ...expense,
      billImageUrl: null,
      createdAt: expense.date,
      updatedAt: expense.date,
    }))
  }

  await Promise.all(commitQueue)
  if (ops > 0) {
    await batch.commit()
  }

  console.log('Firestore seed completed for project:', process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || app.options.projectId)
  console.log('Admin email:', ADMIN_EMAIL)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})

