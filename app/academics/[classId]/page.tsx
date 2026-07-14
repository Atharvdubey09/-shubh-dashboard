'use client'

import { useEffect, useState, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { PageHeader, Card } from '@/components/ui-bits'
import { subscribeTeachingRecords, subscribeTeachers, addTeachingRecord, updateTeachingRecord, deleteTeachingRecord } from '@/lib/firestore'
import { TeachingRecord, TeacherProfile } from '@/lib/domain'
import { useAuth } from '@/components/state/auth-provider'
import { ArrowLeft, BookOpen, Clock, Filter, Plus, Search, Trash2, Edit3, X, User } from 'lucide-react'
import { useToast } from '@/components/ui/toast'
import { cn } from '@/lib/utils'

const SUBJECTS = [
  'English',
  'Marathi',
  'Hindi',
  'Mathematics',
  'Science 1',
  'Science 2',
  'History',
  'Geography',
  'Civics',
]

export default function ClassAcademicsPage() {
  const { classId } = useParams()
  const router = useRouter()
  const { user } = useAuth()
  const { toast } = useToast()
  
  const [records, setRecords] = useState<TeachingRecord[]>([])
  const [teachers, setTeachers] = useState<TeacherProfile[]>([])
  const [loading, setLoading] = useState(true)

  // Filters
  const [search, setSearch] = useState('')
  const [selectedSubject, setSelectedSubject] = useState<string>('all')
  const [selectedMonth, setSelectedMonth] = useState<string>('all')
  const [selectedTeacher, setSelectedTeacher] = useState<string>('all')

  // Modals
  const [isRecordModalOpen, setIsRecordModalOpen] = useState(false)
  const [editingRecord, setEditingRecord] = useState<TeachingRecord | null>(null)
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false)
  const [recordToDelete, setRecordToDelete] = useState<string | null>(null)
  const [deletePin, setDeletePin] = useState('')

  // Form State
  const [formData, setFormData] = useState({
    subject: SUBJECTS[0],
    date: new Date().toISOString().split('T')[0],
    teacherId: '',
    chapter: '',
    topic: '',
    lectureNumber: 1,
    durationMin: '',
    homework: '',
    notes: '',
  })
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    if (!classId) return
    const unsubscribe = subscribeTeachingRecords(
      Number(classId),
      (data) => {
        setRecords(data)
        setLoading(false)
      },
      (err) => {
        console.error(err)
        setLoading(false)
      }
    )
    const unsubscribeTeachers = subscribeTeachers((data) => {
      setTeachers(data)
    })
    return () => {
      unsubscribe()
      unsubscribeTeachers()
    }
  }, [classId])

  const filteredRecords = useMemo(() => {
    const q = search.toLowerCase()
    return records.filter(r => {
      const matchSearch = q === '' || 
        r.chapter.toLowerCase().includes(q) || 
        r.topic.toLowerCase().includes(q) || 
        r.teacherName.toLowerCase().includes(q)
      const matchSubject = selectedSubject === 'all' || r.subject === selectedSubject
      const matchMonth = selectedMonth === 'all' || r.date.startsWith(selectedMonth)
      const matchTeacher = selectedTeacher === 'all' || r.teacherName === selectedTeacher
      
      return matchSearch && matchSubject && matchMonth && matchTeacher
    })
  }, [records, search, selectedSubject, selectedMonth, selectedTeacher])

  // Extract unique lists for filters
  const uniqueMonths = Array.from(new Set(records.map(r => r.date.slice(0, 7)))).sort().reverse()
  const uniqueTeachers = Array.from(new Set(records.map(r => r.teacherName))).sort()

  const handleOpenModal = (record?: TeachingRecord) => {
    if (record) {
      setEditingRecord(record)
      setFormData({
        subject: record.subject,
        date: record.date,
        teacherId: record.teacherId || '',
        chapter: record.chapter,
        topic: record.topic,
        lectureNumber: record.lectureNumber,
        durationMin: record.durationMin?.toString() || '',
        homework: record.homework || '',
        notes: record.notes || '',
      })
    } else {
      setEditingRecord(null)
      setFormData({
        subject: selectedSubject !== 'all' ? selectedSubject : SUBJECTS[0],
        date: new Date().toISOString().split('T')[0],
        teacherId: teachers.length > 0 ? teachers[0].id : '',
        chapter: '',
        topic: '',
        lectureNumber: records.length > 0 ? Math.max(...records.map(r => r.lectureNumber)) + 1 : 1,
        durationMin: '',
        homework: '',
        notes: '',
      })
    }
    setIsRecordModalOpen(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    try {
      const teacherName = teachers.find(t => t.id === formData.teacherId)?.displayName || 'Unknown Teacher'
      const payload = {
        classId: Number(classId),
        subject: formData.subject,
        date: formData.date,
        teacherId: formData.teacherId,
        teacherName,
        chapter: formData.chapter.trim(),
        topic: formData.topic.trim(),
        lectureNumber: Number(formData.lectureNumber) || 1,
        durationMin: formData.durationMin ? Number(formData.durationMin) : undefined,
        homework: formData.homework.trim(),
        notes: formData.notes.trim(),
      }

      if (editingRecord) {
        await updateTeachingRecord(editingRecord.id, payload)
        toast({ title: 'Success', description: 'Record updated', tone: 'success' })
      } else {
        await addTeachingRecord(payload)
        toast({ title: 'Success', description: 'Record added', tone: 'success' })
      }
      setIsRecordModalOpen(false)
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, tone: 'destructive' })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDelete = async () => {
    if (!recordToDelete) return
    if (deletePin !== '2006') {
      toast({ title: 'Unauthorized', description: 'Invalid PIN.', tone: 'destructive' })
      return
    }
    setIsSubmitting(true)
    try {
      await deleteTeachingRecord(recordToDelete, deletePin)
      toast({ title: 'Deleted', description: 'Record removed successfully', tone: 'success' })
      setIsDeleteModalOpen(false)
      setRecordToDelete(null)
      setDeletePin('')
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, tone: 'destructive' })
    } finally {
      setIsSubmitting(false)
    }
  }

  if (loading) return <div className="p-8 text-center text-muted-foreground">Loading records...</div>

  return (
    <div className="flex flex-col h-full bg-muted/10">
      <PageHeader 
        eyebrow="Academics"
        title={`Class ${classId} Academics`} 
        sub="Daily Teaching Register" 
        action={
          <button onClick={() => handleOpenModal()} className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground font-semibold rounded-xl text-sm hover:opacity-90 transition-opacity">
            <Plus className="h-4 w-4" /> Add Record
          </button>
        }
      />
      
      <div className="flex items-center gap-2 px-4 md:px-6 py-2 border-b border-border/50 bg-background/50 backdrop-blur">
        <button onClick={() => router.push('/academics')} className="p-2 hover:bg-muted rounded-full transition-colors mr-2">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="flex-1 flex items-center gap-3 overflow-x-auto no-scrollbar py-1">
          <button 
            onClick={() => setSelectedSubject('all')}
            className={cn("px-4 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors", selectedSubject === 'all' ? "bg-primary text-primary-foreground" : "bg-muted/50 hover:bg-muted text-muted-foreground")}
          >
            All Subjects
          </button>
          {SUBJECTS.map(sub => (
            <button 
              key={sub}
              onClick={() => setSelectedSubject(sub)}
              className={cn("px-4 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors", selectedSubject === sub ? "bg-primary text-primary-foreground" : "bg-muted/50 hover:bg-muted text-muted-foreground")}
            >
              {sub}
            </button>
          ))}
        </div>
      </div>

      <div className="p-4 md:p-6 lg:p-8 flex-1 overflow-y-auto">
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input 
              type="text" 
              placeholder="Search chapters, topics, or teachers..." 
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:border-primary"
            />
          </div>
          <select 
            value={selectedMonth} 
            onChange={e => setSelectedMonth(e.target.value)}
            className="px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:border-primary"
          >
            <option value="all">All Months</option>
            {uniqueMonths.map(m => <option key={m} value={m}>{new Date(m).toLocaleString('default', { month: 'long', year: 'numeric' })}</option>)}
          </select>
          <select 
            value={selectedTeacher} 
            onChange={e => setSelectedTeacher(e.target.value)}
            className="px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:border-primary"
          >
            <option value="all">All Teachers</option>
            {uniqueTeachers.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>

        {filteredRecords.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 bg-background border border-border/50 rounded-2xl text-center">
            <BookOpen className="h-12 w-12 text-muted-foreground mb-4 opacity-50" />
            <h3 className="text-lg font-semibold mb-1">No Records Found</h3>
            <p className="text-sm text-muted-foreground max-w-sm mb-4">No teaching entries match your current filters. Add a new record to get started.</p>
            <button onClick={() => handleOpenModal()} className="px-4 py-2 bg-primary text-primary-foreground font-semibold rounded-xl text-sm hover:opacity-90 transition-opacity">Add Record</button>
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Date</th>
                    <th className="px-4 py-3 font-semibold">Teacher</th>
                    <th className="px-4 py-3 font-semibold">Subject</th>
                    <th className="px-4 py-3 font-semibold">Chapter & Topic</th>
                    <th className="px-4 py-3 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredRecords.map(record => (
                    <tr key={record.id} className="hover:bg-muted/20 transition-colors group">
                      <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                        {new Date(record.date).toLocaleDateString('en-GB')}
                      </td>
                      <td className="px-4 py-3 font-medium">
                        {record.teacherName}
                      </td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-1 rounded-md bg-primary/10 text-primary text-xs font-semibold whitespace-nowrap">
                          {record.subject}
                        </span>
                      </td>
                      <td className="px-4 py-3 min-w-[200px]">
                        <div className="font-semibold mb-0.5">{record.chapter}</div>
                        <div className="text-xs text-muted-foreground">{record.topic} <span className="opacity-50 mx-1">•</span> Lec {record.lectureNumber}</div>
                        {(record.homework || record.notes) && (
                          <div className="mt-1 text-[10px] text-muted-foreground flex gap-2">
                            {record.homework && <span className="px-1.5 py-0.5 rounded bg-muted">HW</span>}
                            {record.notes && <span className="px-1.5 py-0.5 rounded bg-muted">Notes</span>}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => handleOpenModal(record)} className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground">
                            <Edit3 className="h-4 w-4" />
                          </button>
                          <button onClick={() => { setRecordToDelete(record.id); setIsDeleteModalOpen(true); }} className="p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      {isRecordModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/45 px-4 backdrop-blur-sm">
          <Card className="w-full max-w-md p-6 max-h-[90vh] overflow-y-auto animate-fade-up relative">
            <button onClick={() => setIsRecordModalOpen(false)} className="absolute right-4 top-4 p-1 rounded-md hover:bg-muted">
              <X className="h-4 w-4" />
            </button>
            <h3 className="text-lg font-bold tracking-tight mb-4">{editingRecord ? 'Edit Record' : 'Add Teaching Record'}</h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold mb-1">Date</label>
                  <input type="date" required value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} className="h-9 w-full rounded-lg border border-border px-3 text-sm bg-muted/20 outline-none focus:border-primary" />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Teacher</label>
                  <select required value={formData.teacherId} onChange={e => setFormData({...formData, teacherId: e.target.value})} className="h-9 w-full rounded-lg border border-border px-2 text-sm bg-muted/20 outline-none focus:border-primary">
                    <option value="" disabled>Select a teacher</option>
                    {teachers.filter(t => t.status === 'active').map(t => (
                      <option key={t.id} value={t.id}>{t.displayName}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold mb-1">Subject</label>
                  <select required value={formData.subject} onChange={e => setFormData({...formData, subject: e.target.value})} className="h-9 w-full rounded-lg border border-border px-2 text-sm bg-muted/20 outline-none focus:border-primary">
                    {SUBJECTS.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Lecture Number</label>
                  <input type="number" required min="1" value={formData.lectureNumber} onChange={e => setFormData({...formData, lectureNumber: parseInt(e.target.value) || 1})} className="h-9 w-full rounded-lg border border-border px-3 text-sm bg-muted/20 outline-none focus:border-primary" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Chapter Name</label>
                <input type="text" required value={formData.chapter} onChange={e => setFormData({...formData, chapter: e.target.value})} placeholder="e.g. Force and Pressure" className="h-9 w-full rounded-lg border border-border px-3 text-sm bg-muted/20 outline-none focus:border-primary" />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Topic Covered</label>
                <input type="text" required value={formData.topic} onChange={e => setFormData({...formData, topic: e.target.value})} placeholder="e.g. Pressure in Liquids" className="h-9 w-full rounded-lg border border-border px-3 text-sm bg-muted/20 outline-none focus:border-primary" />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Lecture Duration (mins) <span className="font-normal text-muted-foreground">(Optional)</span></label>
                <input type="number" value={formData.durationMin} onChange={e => setFormData({...formData, durationMin: e.target.value})} placeholder="45" className="h-9 w-full rounded-lg border border-border px-3 text-sm bg-muted/20 outline-none focus:border-primary" />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Homework <span className="font-normal text-muted-foreground">(Optional)</span></label>
                <textarea rows={2} value={formData.homework} onChange={e => setFormData({...formData, homework: e.target.value})} placeholder="Page 52 Questions 1-5" className="w-full rounded-lg border border-border p-3 text-sm bg-muted/20 outline-none focus:border-primary resize-none" />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Notes <span className="font-normal text-muted-foreground">(Optional)</span></label>
                <textarea rows={2} value={formData.notes} onChange={e => setFormData({...formData, notes: e.target.value})} placeholder="Students struggled with formula..." className="w-full rounded-lg border border-border p-3 text-sm bg-muted/20 outline-none focus:border-primary resize-none" />
              </div>

              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setIsRecordModalOpen(false)} className="flex-1 h-10 rounded-xl border border-border text-sm font-semibold hover:bg-muted">Cancel</button>
                <button type="submit" disabled={isSubmitting} className="flex-1 h-10 rounded-xl bg-primary text-sm font-semibold text-primary-foreground hover:opacity-90">
                  {isSubmitting ? 'Saving...' : 'Save Record'}
                </button>
              </div>
            </form>
          </Card>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {isDeleteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/45 px-4 backdrop-blur-sm">
          <Card className="w-full max-w-sm p-6 animate-fade-up">
            <h3 className="text-base font-bold tracking-tight mb-2 text-destructive">Delete Record?</h3>
            <p className="text-xs text-muted-foreground mb-4">
              Deleting a teaching record is a permanent action. Please enter the Owner PIN to confirm deletion.
            </p>
            <div className="mb-4">
              <label className="block text-xs font-semibold mb-1">Owner PIN</label>
              <input 
                type="password" 
                autoFocus
                placeholder="****" 
                value={deletePin} 
                onChange={e => setDeletePin(e.target.value)} 
                className="h-10 w-full rounded-xl border border-border px-3 text-center tracking-widest bg-muted/20 outline-none focus:border-destructive" 
              />
            </div>
            <div className="flex gap-2">
              <button onClick={() => { setIsDeleteModalOpen(false); setDeletePin(''); }} disabled={isSubmitting} className="flex-1 h-10 rounded-xl border border-border text-sm font-semibold hover:bg-muted">Cancel</button>
              <button onClick={handleDelete} disabled={isSubmitting || deletePin.length === 0} className="flex-1 h-10 rounded-xl bg-destructive text-sm font-semibold text-destructive-foreground hover:opacity-90">
                {isSubmitting ? 'Deleting...' : 'Confirm'}
              </button>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
