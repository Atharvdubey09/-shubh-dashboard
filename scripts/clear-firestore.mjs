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

async function deleteCollection(db, collectionPath) {
  const collectionRef = db.collection(collectionPath)
  const snapshot = await collectionRef.get()
  
  if (snapshot.size === 0) {
    console.log(`Collection '${collectionPath}' is already empty.`)
    return
  }

  const batch = db.batch()
  snapshot.docs.forEach((doc) => {
    batch.delete(doc.ref)
  })

  await batch.commit()
  console.log(`Deleted ${snapshot.size} documents from collection '${collectionPath}'.`)
}

async function main() {
  const app = getAppInstance()
  const db = getFirestore(app)

  console.log('Starting Firestore database cleanup...')
  console.log('Project ID:', projectId)

  const collections = [
    'students',
    'payments',
    'expenses',
    'transactions',
    'student_history',
    'tasks',
    'settings'
  ]

  for (const coll of collections) {
    await deleteCollection(db, coll)
  }

  console.log('Firestore database cleanup successfully completed!')
}

main().catch(err => {
  console.error('Error during cleanup:', err)
  process.exit(1)
})
