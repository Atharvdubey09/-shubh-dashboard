'use client'

import { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import { ArrowLeft, RotateCcw, Trash, Search } from 'lucide-react'
import { Card, PageHeader, Avatar } from '@/components/ui-bits'
import { useAppData } from '@/components/state/app-data-provider'
import { subscribeDeletedStudents } from '@/lib/firestore'
import { useToast } from '@/components/ui/toast'
import { useAuth } from '@/components/state/auth-provider'

export default function DeletedStudentsPage() {
  const { recoverStudent } = useAppData()
  const { userRole } = useAuth()
  const { toast } = useToast()
  const [deletedList, setDeletedList] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  // Load deleted students
  useEffect(() => {
    const unsubscribe = subscribeDeletedStudents(
      (list) => {
        setDeletedList(list)
        setLoading(false)
      },
      () => setLoading(false)
    )
    return () => unsubscribe()
  }, [])

  const filteredDeleted = useMemo(() => {
    const q = search.trim().toLowerCase()
    return deletedList.filter((s) => {
      return (
        !q ||
        s.name.toLowerCase().includes(q) ||
        s.parentPhone.includes(q) ||
        s.batch.toLowerCase().includes(q)
      )
    })
  }, [deletedList, search])

  async function handleRestore(studentId: string, name: string) {
    // Only Owners or Admins are allowed to edit/restore students
    if (userRole !== 'Owner' && userRole !== 'Admin') {
      alert('Only Owners or Admins can restore student profiles.')
      return
    }

    const confirmed = window.confirm(`Are you sure you want to restore student ${name}?`)
    if (!confirmed) return

    try {
      await recoverStudent(studentId)
      toast({
        title: 'Student Restored',
        description: `${name} has been restored to the active registry.`,
        tone: 'success',
      })
    } catch (err) {
      toast({
        title: 'Restore Failed',
        description: 'Could not restore student profile.',
        tone: 'error',
      })
    }
  }

  if (loading) {
    return <div className="text-sm text-muted-foreground">Loading deleted registry...</div>
  }

  return (
    <div>
      <div className="mb-6">
        <Link
          href="/settings"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Settings
        </Link>
      </div>

      <PageHeader
        eyebrow="Archived Records"
        title="Deleted Students"
        sub="List of all soft-deleted student records. You can restore them and their parent linkages at any time."
      />

      <div className="mb-5 relative max-w-md">
        <Search className="absolute left-3.5 top-3 h-4 w-4 text-muted-foreground" />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by student name, phone or batch..."
          className="h-10 w-full rounded-full border border-border bg-card pl-10 pr-4 text-sm outline-none transition-colors focus:border-ring"
        />
      </div>

      <Card className="overflow-hidden animate-fade-up">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left">
              <th className="micro-label px-6 py-4 font-medium">Student Name</th>
              <th className="micro-label px-4 py-4 font-medium">Class & Batch</th>
              <th className="micro-label px-4 py-4 font-medium">Parent Phone</th>
              <th className="micro-label px-4 py-4 font-medium">Deleted On</th>
              <th className="w-28" aria-hidden="true" />
            </tr>
          </thead>
          <tbody>
            {filteredDeleted.map((s) => (
              <tr key={s.id} className="border-b border-border/60 transition-colors last:border-0 hover:bg-muted/30">
                <td className="px-6 py-3.5">
                  <div className="flex items-center gap-3">
                    <Avatar name={s.name} size="sm" src={s.photoUrl} />
                    <span className="font-semibold block">{s.name}</span>
                  </div>
                </td>
                <td className="px-4 py-3.5 text-muted-foreground">
                  Class {s.class} · {s.batch}
                </td>
                <td className="px-4 py-3.5 text-muted-foreground">{s.parentPhone || '—'}</td>
                <td className="px-4 py-3.5 text-xs text-muted-foreground">
                  {s.deleted_at ? new Date(s.deleted_at).toLocaleDateString('en-IN', { dateStyle: 'medium' }) : 'Unknown'}
                </td>
                <td className="px-6 py-3.5 text-right">
                  {(userRole === 'Owner' || userRole === 'Admin') && (
                    <button
                      type="button"
                      onClick={() => handleRestore(s.id, s.name)}
                      className="inline-flex h-8 items-center gap-1 rounded-full border border-border bg-card px-3 text-xs font-semibold hover:bg-muted transition-colors"
                    >
                      <RotateCcw className="h-3.5 w-3.5 text-primary" />
                      Restore
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {filteredDeleted.length === 0 && (
              <tr>
                <td colSpan={5} className="px-6 py-12 text-center text-xs text-muted-foreground">
                  <div className="flex flex-col items-center gap-2 justify-center py-6">
                    <Trash className="h-6 w-6 text-muted-foreground/55" />
                    <p>No deleted students found in the archived registry.</p>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  )
}
