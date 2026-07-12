'use client'

import {
  GoogleAuthProvider,
  browserLocalPersistence,
  onAuthStateChanged,
  setPersistence,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  type User,
} from 'firebase/auth'
import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { doc, getDoc, setDoc, updateDoc, collection } from 'firebase/firestore'
import { getFirebaseDb, getFirebaseAuth } from '@/lib/firebase'

interface AuthContextValue {
  user: User | null
  loading: boolean
  error: string | null
  adminEmail: string
  loginWithGoogle: () => Promise<void>
  logout: () => Promise<void>
  isAuthorized: boolean
  userRole: 'Owner' | 'Admin' | 'Teacher' | 'Receptionist' | 'Accountant' | null
  dbUserData: any
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [userRole, setUserRole] = useState<'Owner' | 'Admin' | 'Teacher' | 'Receptionist' | 'Accountant' | null>(null)
  const [dbUserData, setDbUserData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const auth = getFirebaseAuth()
    let mounted = true

    void setPersistence(auth, browserLocalPersistence).catch(() => undefined)

    const unsubscribe = onAuthStateChanged(auth, async (nextUser) => {
      if (!mounted) return
      if (nextUser && nextUser.email) {
        try {
          const emailLower = nextUser.email.toLowerCase()
          const userDocRef = doc(getFirebaseDb(), 'users', emailLower)
          const userDocSnap = await getDoc(userDocRef)

          let dbUser = null
          if (userDocSnap.exists()) {
            dbUser = userDocSnap.data()
          } else if (emailLower === 'itatharvdubey@gmail.com') {
            // Auto-create owner user
            const ownerPayload = {
              id: emailLower,
              email: emailLower,
              name: nextUser.displayName || 'Owner',
              role: 'Owner',
              status: 'Active',
              joinedDate: new Date().toISOString().slice(0, 10),
              lastLogin: new Date().toISOString(),
              lastActivity: new Date().toISOString(),
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            }
            await setDoc(userDocRef, ownerPayload)
            dbUser = ownerPayload
          }


          if (!dbUser && typeof window !== 'undefined') {
            const inviteToken = localStorage.getItem('inviteToken')
            if (inviteToken) {
              try {
                const { validateAndConsumeInvite } = require('@/lib/firestore')
                dbUser = await validateAndConsumeInvite(inviteToken, nextUser.displayName || '', emailLower)
                localStorage.removeItem('inviteToken')
              } catch (err: any) {
                console.error('[Invite Error]:', err.message)
                localStorage.removeItem('inviteToken')
              }
            }
          }

          if (!dbUser || dbUser.status === 'Disabled') {
            const reason = !dbUser
              ? 'You are not authorized to access this dashboard.'
              : 'Your account is disabled. Please contact the owner.'
            setError(reason)
            setUser(null)
            setUserRole(null)
            setDbUserData(null)
            setLoading(false)
            await signOut(auth)
            return
          }

          if (dbUser.status === 'Pending Invitation') {
            await updateDoc(userDocRef, {
              status: 'Active',
              name: nextUser.displayName || dbUser.name || 'User',
              joinedDate: new Date().toISOString().slice(0, 10),
              lastLogin: new Date().toISOString(),
              lastActivity: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            })
            // Log invitation accepted directly to firestore
            const auditRef = doc(collection(getFirebaseDb(), 'user_audit_logs'))
            await setDoc(auditRef, {
              id: auditRef.id,
              action: 'User Invitation Accepted',
              ownerEmail: 'System',
              targetUserEmail: emailLower,
              date: new Date().toISOString().slice(0, 10),
              time: new Date().toTimeString().slice(0, 8),
              createdAt: new Date().toISOString(),
            })
            dbUser.status = 'Active'
            dbUser.name = nextUser.displayName || dbUser.name || 'User'
          } else {
            await updateDoc(userDocRef, {
              lastLogin: new Date().toISOString(),
              lastActivity: new Date().toISOString(),
            })
          }

          setUserRole(dbUser.role)
          setDbUserData(dbUser)
          setUser(nextUser)
          setError(null)
          setLoading(false)
        } catch (err) {
          setError('Authentication error occurred.')
          setUser(null)
          setUserRole(null)
          setDbUserData(null)
          setLoading(false)
          await signOut(auth)
        }
      } else {
        setUser(null)
        setUserRole(null)
        setDbUserData(null)
        setLoading(false)
      }
    })

    return () => {
      mounted = false
      unsubscribe()
    }
  }, [])

  async function loginWithGoogle() {
    const auth = getFirebaseAuth()
    const provider = new GoogleAuthProvider()
    provider.setCustomParameters({
      prompt: 'select_account',
    })
    try {
      const result = await signInWithPopup(auth, provider)
      if (!result.user.email) {
        throw new Error('Google Auth did not provide an email.')
      }
      const emailLower = result.user.email.toLowerCase()
      const userDocRef = doc(getFirebaseDb(), 'users', emailLower)
      const userDocSnap = await getDoc(userDocRef)
      if (!userDocSnap.exists() && emailLower !== 'itatharvdubey@gmail.com') {
        await signOut(auth)
        throw new Error('You are not authorized to access this dashboard.')
      }
    } catch (err) {
      const code = typeof err === 'object' && err && 'code' in err ? String((err as { code?: unknown }).code) : ''
      if (code === 'auth/popup-blocked') {
        await signInWithRedirect(auth, provider)
        return
      }
      throw err
    }
  }

  async function logout() {
    await signOut(getFirebaseAuth())
  }

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      error,
      adminEmail: 'itatharvdubey@gmail.com',
      loginWithGoogle,
      logout,
      isAuthorized: !!user && !!userRole,
      userRole,
      dbUserData,
    }),
    [error, loading, user, userRole, dbUserData],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}
