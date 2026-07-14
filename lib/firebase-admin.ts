import { getApps, initializeApp, cert, applicationDefault } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

import fs from 'fs'
import path from 'path'

function readServiceAccount(): any {
  const jsonEnv = process.env.FIREBASE_SERVICE_ACCOUNT_JSON || process.env.FIREBASE_SERVICE_ACCOUNT_KEY
  if (jsonEnv) {
    try {
      return JSON.parse(jsonEnv)
    } catch (e) {
      console.error('Failed to parse FIREBASE_SERVICE_ACCOUNT_JSON:', e)
    }
  }

  // Fallback to checking local file in project root
  try {
    const filePath = path.resolve(process.cwd(), 'firebase-service-account.json')
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'))
    }
  } catch (err) {
    console.warn('Could not read local firebase-service-account.json file:', err)
  }

  return null
}

export function getFirebaseAdminApp() {
  const activeApps = getApps()
  if (activeApps.length) {
    return activeApps[0]!
  }

  const serviceAccount = readServiceAccount()
  if (serviceAccount) {
    return initializeApp({
      credential: cert(serviceAccount),
      projectId: serviceAccount.project_id || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    })
  }

  try {
    return initializeApp({
      credential: applicationDefault(),
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    })
  } catch (e) {
    console.warn('applicationDefault credential failed, attempting initialization with projectId only:', e)
    return initializeApp({
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    })
  }
}

export function getAdminDb() {
  const app = getFirebaseAdminApp()
  return getFirestore(app)
}
