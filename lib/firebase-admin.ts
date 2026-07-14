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
