'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { PageHeader, Card } from '@/components/ui-bits'
import { subscribeTeachers, addTeacherProfile, updateTeachingRecord } from '@/lib/firestore'
import { getFirebaseDb } from '@/lib/firebase'
import { collection, onSnapshot } from 'firebase/firestore'
import { TeachingRecord, TeacherProfile } from '@/lib/domain'
import { BookOpen, Users, Clock, ArrowRight, Search, ChevronDown, ChevronUp, RefreshCw, CheckCircle2, BarChart } from 'lucide-react'
import { useToast } from '@/components/ui/toast'
import { cn } from '@/lib/utils'

export default function AcademicsPage() {
  const [records, setRecords] = useState<TeachingRecord[]>([])
  const [teachers, setTeachers] = useState<TeacherProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<'classes' | 'teachers'>('classes')
  const [teacherSearch, setTeacherSearch] = useState('')
  const [expandedRow, setExpandedRow] = useState<string | null>(null)
  const [isMigrating, setIsMigrating] = useState(false)
  const { toast } = useToast()

  useEffect(() => {
    const db = getFirebaseDb()
    const coll = collection(db, 'teaching_records')
    const unsubscribeRecords = onSnapshot(coll, (snapshot) => {
      const list: TeachingRecord[] = []
      snapshot.forEach(doc => list.push({ id: doc.id, ...doc.data() } as TeachingRecord))
      list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime() || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      setRecords(list)
    })

    const unsubscribeTeachers = subscribeTeachers((data) => {
      setTeachers(data)
      setLoading(false)
    })
    
    return () => {
      unsubscribeRecords()
      unsubscribeTeachers()
    }
  }, [])

  const classes = Array.from({ length: 10 }, (_, i) => i + 1)

  const handleMigration = async () => {
    setIsMigrating(true)
    try {
      const uniqueTeacherNames = new Map<string, string>() // key: normalized, value: original casing (most frequent or first)
      records.forEach(r => {
        if (!r.teacherId) {
          const norm = r.teacherName.trim().toLowerCase()
          if (!uniqueTeacherNames.has(norm)) {
            // Capitalize first letters for display name
            const displayName = norm.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
            uniqueTeacherNames.set(norm, displayName)
          }
        }
      })

      if (uniqueTeacherNames.size === 0) {
        toast({ title: 'Up to date', description: 'All records are already linked to Teacher Profiles.', tone: 'success' })
        setIsMigrating(false)
        return
      }

      // Create missing profiles
      const normToIdMap = new Map<string, string>()
      
      // Match with existing profiles first
      teachers.forEach(t => {
        normToIdMap.set(t.displayName.trim().toLowerCase(), t.id)
      })

      for (const [norm, displayName] of Array.from(uniqueTeacherNames.entries())) {
        if (!normToIdMap.has(norm)) {
          const newProfile = await addTeacherProfile({
            displayName,
            status: 'active'
          })
          normToIdMap.set(norm, newProfile.id)
        }
      }

      // Update records
      let updatedCount = 0
      for (const r of records) {
        if (!r.teacherId) {
          const norm = r.teacherName.trim().toLowerCase()
          const matchedId = normToIdMap.get(norm)
          if (matchedId) {
            await updateTeachingRecord(r.id, { 
              teacherId: matchedId,
              // Normalize the display name on the record too to fix existing bad data
              teacherName: uniqueTeacherNames.get(norm) || r.teacherName 
            })
            updatedCount++
          }
        }
      }

      toast({ title: 'Migration Complete', description: `Normalized ${updatedCount} teaching records.`, tone: 'success' })
    } catch (err: any) {
      toast({ title: 'Migration Failed', description: err.message, tone: 'destructive' })
    } finally {
      setIsMigrating(false)
    }
  }

  const filteredTeachers = teachers.filter(t => t.displayName.toLowerCase().includes(teacherSearch.toLowerCase()))

  return (
    <div className="flex flex-col h-full bg-muted/10 relative">
      <PageHeader 
        eyebrow="Dashboard"
        title="Academics Tracker" 
        sub="Daily teaching register and class progress" 
        action={
          <div className="flex items-center gap-4">
            {records.some(r => !r.teacherId) && (
              <button 
                onClick={handleMigration} 
                disabled={isMigrating}
                className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold bg-amber-500/10 text-amber-600 rounded-lg border border-amber-500/20 hover:bg-amber-500/20 transition-colors"
              >
                <RefreshCw className={cn("h-3.5 w-3.5", isMigrating && "animate-spin")} />
                {isMigrating ? 'Normalizing Data...' : 'Sync Legacy Teachers'}
              </button>
            )}
            <div className="flex bg-muted p-1 rounded-xl">
              <button onClick={() => setView('classes')} className={cn("px-4 py-1.5 text-sm font-semibold rounded-lg transition-colors", view === 'classes' ? 'bg-background shadow text-foreground' : 'text-muted-foreground hover:text-foreground')}>Classes</button>
              <button onClick={() => setView('teachers')} className={cn("px-4 py-1.5 text-sm font-semibold rounded-lg transition-colors", view === 'teachers' ? 'bg-background shadow text-foreground' : 'text-muted-foreground hover:text-foreground')}>Teacher Analytics</button>
            </div>
          </div>
        }
      />

      <div className="p-4 md:p-6 lg:p-8 flex-1 overflow-y-auto">
        {view === 'classes' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {classes.map(classId => {
              const classRecords = records.filter(r => r.classId === classId)
              const totalLectures = classRecords.length
              const uniqueSubjects = new Set(classRecords.map(r => r.subject)).size
              const lastRecord = classRecords[0] // Since they are ordered descending by date

              return (
                <Link key={classId} href={`/academics/${classId}`}>
                  <Card className="group relative p-5 hover:border-primary/50 hover:shadow-md transition-all cursor-pointer h-full flex flex-col">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                        <BookOpen className="h-6 w-6" />
                      </div>
                      <div className="h-8 w-8 rounded-full bg-muted/50 flex items-center justify-center group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                        <ArrowRight className="h-4 w-4" />
                      </div>
                    </div>
                    
                    <h3 className="text-xl font-bold tracking-tight mb-1">Class {classId}</h3>
                    <p className="text-sm text-muted-foreground mb-6">
                      {uniqueSubjects} Subjects tracked
                    </p>

                    <div className="mt-auto space-y-3">
                      <div className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-2 text-muted-foreground">
                          <Users className="h-4 w-4" /> Total Lectures
                        </span>
                        <span className="font-semibold">{totalLectures}</span>
                      </div>

                      <div className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-2 text-muted-foreground">
                          <Clock className="h-4 w-4" /> Last Updated
                        </span>
                        <span className="font-semibold">
                          {lastRecord ? new Date(lastRecord.date).toLocaleDateString('en-GB') : 'N/A'}
                        </span>
                      </div>
                    </div>
                  </Card>
                </Link>
              )
            })}
          </div>
        ) : (
          <div className="space-y-6">
            <div className="max-w-xl">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                <input 
                  type="text" 
                  placeholder="Search teachers..." 
                  value={teacherSearch}
                  onChange={e => setTeacherSearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 rounded-xl border border-border bg-card shadow-sm text-base focus:outline-none focus:border-primary"
                />
              </div>
            </div>

            <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="px-6 py-4 font-semibold">Teacher Name</th>
                      <th className="px-6 py-4 font-semibold text-center">Total Lectures</th>
                      <th className="px-6 py-4 font-semibold text-center">Classes Taken</th>
                      <th className="px-6 py-4 font-semibold">Primary Subjects</th>
                      <th className="px-6 py-4 font-semibold">Status</th>
                      <th className="px-6 py-4 font-semibold text-right">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filteredTeachers.map(teacher => {
                      const tRecords = records.filter(r => r.teacherId === teacher.id || (r.teacherName.toLowerCase() === teacher.displayName.toLowerCase() && !r.teacherId))
                      const totalLecs = tRecords.length
                      const uniqueClasses = new Set(tRecords.map(r => r.classId)).size
                      const uniqueSubjects = Array.from(new Set(tRecords.map(r => r.subject)))
                      
                      const isExpanded = expandedRow === teacher.id

                      return (
                        <React.Fragment key={teacher.id}>
                          <tr 
                            onClick={() => setExpandedRow(isExpanded ? null : teacher.id)}
                            className={cn("transition-colors cursor-pointer group", isExpanded ? "bg-primary/5" : "hover:bg-muted/30")}
                          >
                            <td className="px-6 py-4 font-bold text-base text-foreground">
                              {teacher.displayName}
                            </td>
                            <td className="px-6 py-4 text-center">
                              <span className="inline-flex items-center justify-center h-8 w-10 rounded-lg bg-primary/10 text-primary font-bold">
                                {totalLecs}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-center font-medium">
                              {uniqueClasses}
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex gap-1 flex-wrap">
                                {uniqueSubjects.slice(0, 3).map(s => (
                                  <span key={s} className="px-2 py-0.5 rounded text-xs font-semibold bg-muted text-muted-foreground border border-border">{s}</span>
                                ))}
                                {uniqueSubjects.length > 3 && <span className="px-2 py-0.5 rounded text-xs font-semibold bg-muted text-muted-foreground border border-border">+{uniqueSubjects.length - 3}</span>}
                                {uniqueSubjects.length === 0 && <span className="text-muted-foreground opacity-50">-</span>}
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <span className={cn("px-2.5 py-1 rounded-full text-xs font-bold", teacher.status === 'active' ? "bg-emerald-500/10 text-emerald-600" : "bg-muted text-muted-foreground")}>
                                {teacher.status === 'active' ? 'Active' : 'Inactive'}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-right">
                              <div className="inline-flex items-center justify-center p-2 rounded-full hover:bg-background transition-colors">
                                {isExpanded ? <ChevronUp className="h-5 w-5 text-primary" /> : <ChevronDown className="h-5 w-5 text-muted-foreground" />}
                              </div>
                            </td>
                          </tr>

                          {/* EXPANDED ROW */}
                          {isExpanded && (
                            <tr className="bg-primary/5 border-b border-primary/10">
                              <td colSpan={6} className="p-0">
                                <div className="p-6 md:p-8 animate-fade-down">
                                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                                    
                                    {/* Subject Analytics */}
                                    <div className="lg:col-span-1 space-y-6">
                                      <div>
                                        <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-4 flex items-center gap-2">
                                          <BarChart className="h-4 w-4" /> Subject Analytics
                                        </h4>
                                        <div className="space-y-4">
                                          {uniqueSubjects.map(subj => {
                                            const count = tRecords.filter(r => r.subject === subj).length
                                            const percentage = totalLecs > 0 ? (count / totalLecs) * 100 : 0
                                            return (
                                              <div key={subj}>
                                                <div className="flex justify-between text-sm font-semibold mb-1.5">
                                                  <span>{subj}</span>
                                                  <span className="text-muted-foreground">{count} lec</span>
                                                </div>
                                                <div className="h-2 w-full bg-background rounded-full overflow-hidden border border-border/50">
                                                  <div className="h-full bg-primary rounded-full transition-all duration-1000" style={{ width: `${percentage}%` }} />
                                                </div>
                                              </div>
                                            )
                                          })}
                                          {uniqueSubjects.length === 0 && <p className="text-sm text-muted-foreground">No subjects taught yet.</p>}
                                        </div>
                                      </div>

                                      <div className="pt-6 border-t border-primary/10">
                                        <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-4 flex items-center gap-2">
                                          <Users className="h-4 w-4" /> Class Breakdown
                                        </h4>
                                        <div className="flex flex-wrap gap-2">
                                          {Array.from(new Set(tRecords.map(r => r.classId))).map(cId => {
                                            const count = tRecords.filter(r => r.classId === cId).length
                                            return (
                                              <span key={cId} className="px-3 py-1.5 rounded-lg bg-background text-sm font-semibold border border-primary/20 shadow-sm">
                                                Class {cId} <span className="text-muted-foreground ml-1">{count}</span>
                                              </span>
                                            )
                                          })}
                                        </div>
                                      </div>
                                    </div>

                                    {/* Recent Timeline */}
                                    <div className="lg:col-span-2">
                                      <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-4 flex items-center gap-2">
                                        <Clock className="h-4 w-4" /> Recent Lectures Timeline
                                      </h4>
                                      <div className="bg-background rounded-2xl border border-primary/10 overflow-hidden shadow-sm">
                                        {tRecords.length === 0 ? (
                                          <div className="p-8 text-center text-muted-foreground text-sm">No lectures recorded.</div>
                                        ) : (
                                          <ul className="divide-y divide-primary/5">
                                            {tRecords.slice(0, 8).map(r => (
                                              <li key={r.id} className="p-4 hover:bg-muted/30 transition-colors flex flex-col sm:flex-row sm:items-center gap-4">
                                                <div className="w-24 shrink-0 text-xs font-semibold text-muted-foreground">
                                                  {new Date(r.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                                                </div>
                                                <div className="flex-1">
                                                  <div className="flex items-center gap-2 mb-1">
                                                    <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-primary/10 text-primary">Class {r.classId}</span>
                                                    <span className="font-semibold text-sm">{r.subject}</span>
                                                    <span className="text-xs text-muted-foreground font-medium ml-auto">Lec {r.lectureNumber}</span>
                                                  </div>
                                                  <div className="text-sm font-medium text-foreground">{r.chapter}</div>
                                                  <div className="text-xs text-muted-foreground mt-0.5">{r.topic}</div>
                                                </div>
                                              </li>
                                            ))}
                                          </ul>
                                        )}
                                        {tRecords.length > 8 && (
                                          <div className="p-3 text-center border-t border-primary/10 bg-muted/20">
                                            <span className="text-xs font-bold text-primary">+{tRecords.length - 8} older records hidden</span>
                                          </div>
                                        )}
                                      </div>
                                    </div>

                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      )
                    })}
                  </tbody>
                </table>
                {filteredTeachers.length === 0 && (
                  <div className="p-12 text-center text-muted-foreground">
                    <h3 className="text-lg font-bold mb-2">No Teachers Found</h3>
                    <p className="text-sm">We couldn't find any teacher matching "{teacherSearch}".</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
