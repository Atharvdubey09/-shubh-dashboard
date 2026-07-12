import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app'
import { getAuth, type Auth } from 'firebase/auth'
import { getAnalytics, isSupported, type Analytics } from 'firebase/analytics'
import { getFirestore, type Firestore } from 'firebase/firestore'
import { getStorage, type FirebaseStorage } from 'firebase/storage'

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
}

const requiredKeys = [
  'apiKey',
  'authDomain',
  'projectId',
  'storageBucket',
  'messagingSenderId',
  'appId',
] as const

function missingKeys() {
  return requiredKeys.filter((key) => !firebaseConfig[key])
}

function ensureFirebaseApp() {
  const missing = missingKeys()
  if (missing.length > 0) {
    throw new Error(
      `Missing Firebase environment variables: ${missing.join(', ')}. Add them to .env.local before running the app.`,
    )
  }
  return getApps().length ? getApp() : initializeApp(firebaseConfig)
}

let app: FirebaseApp | null = null
let db: Firestore | null = null
let auth: Auth | null = null
let storage: FirebaseStorage | null = null
let analytics: Analytics | null = null

export function getFirebaseApp() {
  app ??= ensureFirebaseApp()
  return app
}

export function getFirebaseDb() {
  db ??= getFirestore(getFirebaseApp())
  return db
}

export function getFirebaseAuth() {
  auth ??= getAuth(getFirebaseApp())
  return auth
}

export function getFirebaseStorage() {
  storage ??= getStorage(getFirebaseApp())
  return storage
}

export async function getFirebaseAnalytics() {
  if (typeof window === 'undefined') return null
  if (!firebaseConfig.measurementId) return null
  if (!(await isSupported())) return null
  analytics ??= getAnalytics(getFirebaseApp())
  return analytics
}
