import dotenv from 'dotenv'
import path from 'node:path'
import { getApps, initializeApp, cert } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })
dotenv.config()

const cleanEnvVar = (val) => {
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

const projectId = cleanEnvVar(process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID)
if (projectId) {
  process.env.GCLOUD_PROJECT = projectId
  process.env.GCP_PROJECT = projectId
}

function readServiceAccount() {
  const jsonEnv = process.env.FIREBASE_SERVICE_ACCOUNT_JSON || process.env.FIREBASE_SERVICE_ACCOUNT_KEY || process.env.FIREBASE_SERVICE_ACCOUNT_KEY_SECRET
  if (jsonEnv) return JSON.parse(jsonEnv)
  return null
}

function getAppInstance() {
  const activeApps = getApps()
  if (activeApps.length) return activeApps[0]
  const serviceAccount = readServiceAccount()
  if (serviceAccount) {
    return initializeApp({ credential: cert(serviceAccount) })
  }
  let clientEmail = cleanEnvVar(process.env.FIREBASE_CLIENT_EMAIL)
  let privateKey = cleanEnvVar(process.env.FIREBASE_PRIVATE_KEY)
  if (projectId && clientEmail && privateKey) {
    const formattedKey = privateKey.replace(/\\n/g, '\n')
    return initializeApp({
      credential: cert({ projectId, clientEmail, privateKey: formattedKey })
    })
  }
  return initializeApp()
}

async function main() {
  const app = getAppInstance()
  const db = getFirestore(app)

  const expensesSnap = await db.collection('expenses').get()
  const expenses = expensesSnap.docs.map(d => ({ id: d.id, ...d.data() }))

  console.log('ALL EXPENSES:')
  expenses.forEach(e => {
    console.log(`ID: ${e.id} | Amount: ₹${e.amount} | Date: ${e.date} | Note: ${e.note} | Category: ${e.category}`)
  })
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
