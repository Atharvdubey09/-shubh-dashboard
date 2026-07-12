'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Card } from '@/components/ui-bits'
import { getDoc, doc } from 'firebase/firestore'
import { getFirebaseDb } from '@/lib/firebase'
import { useAuth } from '@/components/state/auth-provider'

export default function SignupPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { loginWithGoogle, isAuthorized } = useAuth()
  const [tokenInfo, setTokenInfo] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (isAuthorized) {
      router.replace('/')
      return
    }

    const token = searchParams.get('token')
    if (!token) {
      setError('No invite token found in the URL.')
      setLoading(false)
      return
    }

    // Verify token exists and is valid
    async function verifyToken() {
      try {
        const db = getFirebaseDb()
        const snap = await getDoc(doc(db, 'invites', token as string))
        
        if (!snap.exists()) {
          setError('Invalid invite link.')
          return
        }

        const data = snap.data()
        if (data.used) {
          setError('This invite link has already been used.')
          return
        }

        if (new Date() > new Date(data.expiresAt)) {
          setError('This invite link has expired.')
          return
        }

        // Token is valid!
        setTokenInfo(data)
        // Store it so AuthProvider can intercept it after Google login
        if (typeof window !== 'undefined') {
          localStorage.setItem('inviteToken', token as string)
        }
      } catch (err) {
        setError('Failed to verify invite link.')
      } finally {
        setLoading(false)
      }
    }

    verifyToken()
  }, [searchParams, isAuthorized, router])

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/20">
        <div className="text-sm font-medium text-muted-foreground animate-pulse">Verifying invite...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/20 p-4">
        <Card className="max-w-md w-full p-6 text-center animate-fade-up">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 mb-4">
            <span className="text-destructive font-bold text-xl">!</span>
          </div>
          <h2 className="text-xl font-bold tracking-tight mb-2">Invalid Invite</h2>
          <p className="text-sm text-muted-foreground mb-6">{error}</p>
          <button
            onClick={() => router.push('/')}
            className="h-10 px-6 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity"
          >
            Go to Login
          </button>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-muted/20 p-4">
      <Card className="max-w-md w-full p-8 text-center animate-fade-up border-primary/20 shadow-xl">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
          <span className="text-2xl font-bold text-primary">ERP</span>
        </div>
        <h1 className="text-2xl font-bold tracking-tight mb-2">You've been invited!</h1>
        <p className="text-sm text-muted-foreground mb-8">
          You have been invited to join the Coaching ERP as a <strong className="text-foreground">{tokenInfo?.role}</strong>.
          <br />Sign in with your Google account to accept the invitation and securely access the dashboard.
        </p>

        <button
          onClick={loginWithGoogle}
          className="flex h-12 w-full items-center justify-center gap-3 rounded-xl bg-foreground text-sm font-semibold text-background hover:opacity-90 transition-opacity"
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24">
            <path
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              fill="#4285F4"
            />
            <path
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              fill="#34A853"
            />
            <path
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              fill="#FBBC05"
            />
            <path
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              fill="#EA4335"
            />
          </svg>
          Accept Invite & Sign in with Google
        </button>
      </Card>
    </div>
  )
}
