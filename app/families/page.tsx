'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { Plus, ChevronRight, Users, Trash2 } from 'lucide-react'
import { Card, PageHeader, Avatar } from '@/components/ui-bits'
import { useAppData } from '@/components/state/app-data-provider'
import { formatINR } from '@/lib/domain'
import { cn } from '@/lib/utils'

export default function FamiliesPage() {
  const { families, students, addFamily, deleteFamily } = useAppData()
  const [query, setQuery] = useState('')
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [parentName, setParentName] = useState('')
  const [parentPhone, setParentPhone] = useState('')
  const [parentWhatsApp, setParentWhatsApp] = useState('')
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([])
  const [combinedAgreedFee, setCombinedAgreedFee] = useState('')
  const [allocationType, setAllocationType] = useState<'proportional' | 'equal'>('proportional')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const filteredFamilies = useMemo(() => {
    const q = query.trim().toLowerCase()
    return families.filter((f) => {
      return (
        !q ||
        f.parentName.toLowerCase().includes(q) ||
        f.parentPhone.includes(q)
      )
    })
  }, [families, query])

  const familyStats = useMemo(() => {
    const map: Record<string, { paid: number; pending: number; original: number }> = {}
    families.forEach((f) => {
      let paid = 0
      let pending = 0
      let original = 0
      f.studentIds.forEach((sid) => {
        const student = students.find((s) => s.id === sid)
        if (student) {
          paid += student.paid
          pending += student.pending
          original += student.totalFee
        }
      })
      map[f.id] = { paid, pending, original }
    })
    return map
  }, [families, students])

  const availableStudents = useMemo(() => {
    return students.filter((s) => !s.parentId)
  }, [students])

  async function handleCreateFamily(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!parentName.trim()) return setError('Parent name is required')
    if (!parentPhone.trim()) return setError('Parent phone is required')
    if (selectedStudentIds.length === 0) return setError('Please select at least one student')
    const fee = Number(combinedAgreedFee)
    if (!Number.isFinite(fee) || fee <= 0) return setError('Please enter a valid combined fee')

    setBusy(true)
    try {
      await addFamily(
        {
          parentName: (parentName || '').trim(),
          parentPhone: (parentPhone || '').trim(),
          parentWhatsApp: (parentWhatsApp || parentPhone || '').trim(),
          studentIds: Array.isArray(selectedStudentIds) ? selectedStudentIds : [],
          combinedAgreedFee: fee || 0,
        },
        allocationType || 'proportional'
      )
      setIsAddOpen(false)
      setParentName('')
      setParentPhone('')
      setParentWhatsApp('')
      setSelectedStudentIds([])
      setCombinedAgreedFee('')
      setAllocationType('proportional')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create family')
    } finally {
      setBusy(false)
    }
  }

  function toggleStudentSelection(sid: string) {
    setSelectedStudentIds((prev) =>
      prev.includes(sid) ? prev.filter((id) => id !== sid) : [...prev, sid]
    )
  }

  async function handleDeleteFamily(fid: string, name: string) {
    const confirmed = window.confirm(`Are you sure you want to delete family account for ${name}? Students will be unlinked.`)
    if (!confirmed) return
    try {
      await deleteFamily(fid)
    } catch (err) {
      alert('Delete failed')
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="Families"
        title="Family Accounts"
        sub={`${families.length} families linked · Managing group discount fee agreements`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by parent..."
              className="h-10 w-48 rounded-full border border-border bg-muted/60 px-4 text-sm outline-none transition-all placeholder:text-muted-foreground focus:border-ring focus:bg-card"
            />
            <button
              type="button"
              onClick={() => setIsAddOpen(true)}
              className="flex h-10 items-center gap-1.5 rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
            >
              <Plus className="h-4 w-4" />
              Link Family
            </button>
          </div>
        }
      />

      <Card className="overflow-hidden animate-fade-up">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left">
              <th className="micro-label px-6 py-4 font-medium">Parent Name</th>
              <th className="micro-label px-4 py-4 font-medium">Phone</th>
              <th className="micro-label px-4 py-4 font-medium">Students</th>
              <th className="micro-label px-4 py-4 text-right font-medium">Agreed Fee</th>
              <th className="micro-label px-4 py-4 text-right font-medium">Paid</th>
              <th className="micro-label px-4 py-4 text-right font-medium">Pending</th>
              <th className="w-24" aria-hidden="true" />
            </tr>
          </thead>
          <tbody>
            {filteredFamilies.map((f) => {
              const stats = familyStats[f.id] || { paid: 0, pending: 0, original: 0 }
              const linkedNames = f.studentIds
                .map((sid) => students.find((s) => s.id === sid)?.name.split(' ')[0])
                .filter(Boolean)
                .join(', ')

              return (
                <tr
                  key={f.id}
                  className="group relative border-b border-border/60 transition-colors last:border-0 hover:bg-muted/50"
                >
                  <td className="px-6 py-3.5">
                    <Link
                      href={`/families/${f.id}`}
                      className="flex items-center gap-3 after:absolute after:inset-0"
                    >
                      <Avatar name={f.parentName} size="sm" />
                      <span className="font-semibold">{f.parentName}</span>
                    </Link>
                  </td>
                  <td className="px-4 py-3.5 text-muted-foreground">{f.parentPhone}</td>
                  <td className="px-4 py-3.5 text-muted-foreground">
                    <span className="block text-xs font-medium text-foreground">
                      {f.studentIds.length} students
                    </span>
                    <span className="block text-[11px] text-muted-foreground truncate max-w-44">
                      ({linkedNames})
                    </span>
                  </td>
                  <td className="tabular px-4 py-3.5 text-right font-semibold">
                    {formatINR(f.combinedAgreedFee)}
                  </td>
                  <td className="tabular px-4 py-3.5 text-right text-success font-medium">
                    {formatINR(stats.paid)}
                  </td>
                  <td
                    className={cn(
                      'tabular px-4 py-3.5 text-right font-semibold',
                      stats.pending > 0 ? 'text-warning-foreground' : 'text-muted-foreground'
                    )}
                  >
                    {stats.pending > 0 ? formatINR(stats.pending) : '—'}
                  </td>
                  <td className="relative z-10 px-4 py-3.5 text-right">
                    <div className="flex items-center justify-end gap-3">
                      <button
                        type="button"
                        onClick={() => handleDeleteFamily(f.id, f.parentName)}
                        className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {filteredFamilies.length === 0 && (
          <div className="px-6 py-12 text-center text-sm text-muted-foreground flex flex-col items-center justify-center gap-2">
            <Users className="h-8 w-8 text-muted-foreground/60" />
            <p>No family accounts linked yet.</p>
          </div>
        )}
      </Card>

      {/* Add Modal */}
      {isAddOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 px-4 backdrop-blur-sm">
          <Card className="w-full max-w-md p-6 animate-fade-up max-h-[85vh] overflow-y-auto">
            <h3 className="text-lg font-bold tracking-tight mb-1">Link Family Account</h3>
            <p className="text-xs text-muted-foreground mb-4">
              Combine multiple students under one parent and negotiate a combined fee.
            </p>

            <form onSubmit={handleCreateFamily} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold mb-1">Parent Name *</label>
                <input
                  type="text"
                  required
                  value={parentName}
                  onChange={(e) => setParentName(e.target.value)}
                  placeholder="e.g. Ramesh Kumar"
                  className="h-10 w-full rounded-xl border border-border px-3 text-sm bg-muted/30 outline-none focus:border-ring"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold mb-1">Parent Phone *</label>
                  <input
                    type="tel"
                    required
                    value={parentPhone}
                    onChange={(e) => setParentPhone(e.target.value)}
                    placeholder="98765 00000"
                    className="h-10 w-full rounded-xl border border-border px-3 text-sm bg-muted/30 outline-none focus:border-ring"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">WhatsApp Number</label>
                  <input
                    type="tel"
                    value={parentWhatsApp}
                    onChange={(e) => setParentWhatsApp(e.target.value)}
                    placeholder="Same as phone"
                    className="h-10 w-full rounded-xl border border-border px-3 text-sm bg-muted/30 outline-none focus:border-ring"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold mb-2">Select Students to Link *</label>
                {availableStudents.length === 0 ? (
                  <p className="text-xs text-muted-foreground bg-muted/20 p-2.5 rounded-xl">
                    All students are already linked to a family.
                  </p>
                ) : (
                  <div className="max-h-36 overflow-y-auto border border-border rounded-xl p-2 space-y-1.5">
                    {availableStudents.map((s) => (
                      <label
                        key={s.id}
                        className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-muted/50 cursor-pointer text-xs"
                      >
                        <input
                          type="checkbox"
                          checked={selectedStudentIds.includes(s.id)}
                          onChange={() => toggleStudentSelection(s.id)}
                          className="rounded text-primary focus:ring-primary"
                        />
                        <span className="flex-1 font-medium">{s.name}</span>
                        <span className="text-[10px] text-muted-foreground">
                          Class {s.class} · {formatINR(s.totalFee)}
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold mb-1">Family Agreed Fee *</label>
                  <input
                    type="number"
                    required
                    value={combinedAgreedFee}
                    onChange={(e) => setCombinedAgreedFee(e.target.value)}
                    placeholder="e.g. 8000"
                    className="h-10 w-full rounded-xl border border-border px-3 text-sm bg-muted/30 outline-none focus:border-ring"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Allocation Rule</label>
                  <select
                    value={allocationType}
                    onChange={(e) => setAllocationType(e.target.value as any)}
                    className="h-10 w-full rounded-xl border border-border px-2 text-sm bg-muted/30 outline-none focus:border-ring"
                  >
                    <option value="proportional">Proportional</option>
                    <option value="equal">Equal Share</option>
                  </select>
                </div>
              </div>

              {error && <p className="text-xs text-destructive mt-1">{error}</p>}

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddOpen(false)}
                  disabled={busy}
                  className="flex-1 h-10 rounded-xl border border-border text-sm font-semibold hover:bg-muted"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="flex-1 h-10 rounded-xl bg-primary text-sm font-semibold text-primary-foreground hover:opacity-90"
                >
                  {busy ? 'Linking...' : 'Save & Link'}
                </button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  )
}
