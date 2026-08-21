'use client'

import { useState, useRef } from 'react'
import { X, Upload, Check, AlertCircle, FileText, Clipboard, Search, Trash2 } from 'lucide-react'
import { Card, StatusPill } from '@/components/ui-bits'
import { useAppData } from '@/components/state/app-data-provider'
import { useToast } from '@/components/ui/toast'
import * as XLSX from 'xlsx'

interface ImportStudentsDialogProps {
  isOpen: boolean
  onClose: () => void
}

export default function ImportStudentsDialog({ isOpen, onClose }: ImportStudentsDialogProps) {
  const { addStudent } = useAppData()
  const { toast } = useToast()

  const [activeTab, setActiveTab] = useState<'upload' | 'paste'>('upload')
  const [file, setFile] = useState<File | null>(null)
  const [pasteText, setPasteText] = useState('')
  
  const [parsedStudents, setParsedStudents] = useState<any[]>([])
  const [isParsing, setIsParsing] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const [isImporting, setIsImporting] = useState(false)
  const [importProgress, setImportProgress] = useState(0)
  const [searchQuery, setSearchQuery] = useState('')

  const fileInputRef = useRef<HTMLInputElement>(null)

  if (!isOpen) return null

  // 1. Process Excel / CSV files
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (!selectedFile) return
    setFile(selectedFile)
    setErrorMsg(null)
    setIsParsing(true)

    try {
      const name = selectedFile.name.toLowerCase()
      if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
        const reader = new FileReader()
        reader.onload = (evt) => {
          try {
            const data = new Uint8Array(evt.target?.result as ArrayBuffer)
            const workbook = XLSX.read(data, { type: 'array' })
            const firstSheetName = workbook.SheetNames[0]
            const worksheet = workbook.Sheets[firstSheetName]
            const json: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1 })
            const students = parseRows(json)
            if (students.length === 0) {
              setErrorMsg('No valid student records found in Excel. Make sure you have at least a Name column.')
            } else {
              setParsedStudents(students)
            }
          } catch (err: any) {
            setErrorMsg(`Failed to parse Excel file: ${err.message || err}`)
          } finally {
            setIsParsing(false)
          }
        }
        reader.readAsArrayBuffer(selectedFile)
      } else if (name.endsWith('.csv')) {
        const reader = new FileReader()
        reader.onload = (evt) => {
          try {
            const text = evt.target?.result as string
            const rows = text.split('\n').map((line) => {
              // basic CSV parse handling commas inside quotes
              const result = []
              let current = ''
              let inQuotes = false
              for (let i = 0; i < line.length; i++) {
                const char = line[i]
                if (char === '"') {
                  inQuotes = !inQuotes
                } else if (char === ',' && !inQuotes) {
                  result.push(current.trim())
                  current = ''
                } else {
                  current += char
                }
              }
              result.push(current.trim())
              return result
            })
            const students = parseRows(rows)
            if (students.length === 0) {
              setErrorMsg('No valid student records found in CSV. Make sure you have at least a Name column.')
            } else {
              setParsedStudents(students)
            }
          } catch (err: any) {
            setErrorMsg(`Failed to parse CSV file: ${err.message || err}`)
          } finally {
            setIsParsing(false)
          }
        }
        reader.readAsText(selectedFile)
      } else if (name.endsWith('.pdf')) {
        // PDF client-side text extractor via dynamic PDF.js from CDN
        const reader = new FileReader()
        reader.onload = async (evt) => {
          try {
            const arrayBuffer = evt.target?.result as ArrayBuffer
            
            // Dynamically load PDF.js if not present
            if (!(window as any).pdfjsLib) {
              await new Promise<void>((resolve, reject) => {
                const script = document.createElement('script')
                script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js'
                script.onload = () => resolve()
                script.onerror = () => reject(new Error('Failed to load PDF parser from CDN'))
                document.head.appendChild(script)
              })
            }

            const pdfjsLib = (window as any).pdfjsLib
            pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'

            const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer })
            const pdf = await loadingTask.promise
            let fullText = ''

            for (let i = 1; i <= pdf.numPages; i++) {
              const page = await pdf.getPage(i)
              const textContent = await page.getTextContent()
              const pageText = textContent.items.map((item: any) => item.str).join(' ')
              fullText += pageText + '\n'
            }

            const students = parseRawText(fullText)
            if (students.length === 0) {
              setErrorMsg('Could not extract any structured student records from PDF. Try using the "Paste Raw Text" option instead.')
            } else {
              setParsedStudents(students)
            }
          } catch (err: any) {
            setErrorMsg(`PDF Parse Error: ${err.message || err}`)
          } finally {
            setIsParsing(false)
          }
        }
        reader.readAsArrayBuffer(selectedFile)
      } else {
        setErrorMsg('Unsupported file type. Please upload a .xlsx, .xls, .csv, or .pdf file.')
        setIsParsing(false)
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Error uploading file.')
      setIsParsing(false)
    }
  }

  // 2. Process Paste Text
  const handlePasteSubmit = () => {
    setErrorMsg(null)
    if (!pasteText.trim()) {
      setErrorMsg('Please paste some student data first.')
      return
    }
    setIsParsing(true)
    try {
      const students = parseRawText(pasteText)
      if (students.length === 0) {
        setErrorMsg('No student records could be parsed. Check your format.')
      } else {
        setParsedStudents(students)
      }
    } catch (err: any) {
      setErrorMsg(`Failed to parse text: ${err.message || err}`)
    } finally {
      setIsParsing(false)
    }
  }

  // Helper row normalizer
  const parseRows = (rows: any[][]) => {
    if (rows.length === 0) return []
    
    // Normalize headers
    const firstRow = rows[0].map((r) => String(r || '').toLowerCase().trim())
    let nameIdx = firstRow.findIndex((h) => h.includes('name') && !h.includes('parent') && !h.includes('father') && !h.includes('mother'))
    let classIdx = firstRow.findIndex((h) => h.includes('class') || h.includes('std') || h.includes('grade'))
    let batchIdx = firstRow.findIndex((h) => h.includes('batch') || h.includes('group') || h.includes('timing'))
    let parentPhoneIdx = firstRow.findIndex((h) => h.includes('parent') && (h.includes('phone') || h.includes('mobile') || h.includes('contact')))
    if (parentPhoneIdx === -1) {
      parentPhoneIdx = firstRow.findIndex((h) => h.includes('phone') || h.includes('mobile') || h.includes('contact'))
    }
    let whatsappIdx = firstRow.findIndex((h) => h.includes('whatsapp') || h.includes('wa'))
    let parentNameIdx = firstRow.findIndex((h) => h.includes('parent.*name') || h.includes('father') || h.includes('mother') || h.includes('parent name'))
    let totalFeeIdx = firstRow.findIndex((h) => h.includes('total') || h.includes('fee') || h.includes('amount') || h.includes('plan'))
    let paidIdx = firstRow.findIndex((h) => h.includes('paid') || h.includes('deposit'))
    let statusIdx = firstRow.findIndex((h) => h.includes('status') || h.includes('active'))
    let notesIdx = firstRow.findIndex((h) => h.includes('note') || h.includes('remark') || h.includes('comment'))
    let studentPhoneIdx = firstRow.findIndex((h) => h.includes('student') && (h.includes('phone') || h.includes('mobile')))
    let addressIdx = firstRow.findIndex((h) => h.includes('address') || h.includes('location'))

    // Fallbacks based on position
    if (nameIdx === -1) nameIdx = 0
    if (classIdx === -1 && firstRow.length > 1) classIdx = 1
    if (batchIdx === -1 && firstRow.length > 2) batchIdx = 2
    if (parentPhoneIdx === -1 && firstRow.length > 3) parentPhoneIdx = 3
    if (totalFeeIdx === -1 && firstRow.length > 4) totalFeeIdx = 4
    if (paidIdx === -1 && firstRow.length > 5) paidIdx = 5
    if (statusIdx === -1 && firstRow.length > 6) statusIdx = 6
    if (notesIdx === -1 && firstRow.length > 7) notesIdx = 7

    const hasHeaders = firstRow.some((h) => h.includes('name') || h.includes('class') || h.includes('phone') || h.includes('batch'))
    const startIdx = hasHeaders ? 1 : 0

    const students: any[] = []
    for (let i = startIdx; i < rows.length; i++) {
      const row = rows[i]
      if (!row || row.length === 0) continue

      const name = String(row[nameIdx] || '').trim()
      if (!name || name.toLowerCase() === 'name') continue // skip empty or duplicate header rows

      const classVal = parseInt(String(row[classIdx] || '1').replace(/\D/g, ''), 10) || 1
      const batch = String(row[batchIdx] || 'Morning A').trim()
      const parentPhone = String(row[parentPhoneIdx] || '').trim().replace(/\s/g, '')
      const whatsapp = whatsappIdx !== -1 ? String(row[whatsappIdx] || '').trim().replace(/\s/g, '') : parentPhone
      const parentName = parentNameIdx !== -1 ? String(row[parentNameIdx] || '').trim() : ''
      const studentPhone = studentPhoneIdx !== -1 ? String(row[studentPhoneIdx] || '').trim().replace(/\s/g, '') : ''
      const address = addressIdx !== -1 ? String(row[addressIdx] || '').trim() : ''
      const totalFee = parseFloat(String(row[totalFeeIdx] || '0').replace(/[^\d.]/g, '')) || 0
      const paid = parseFloat(String(row[paidIdx] || '0').replace(/[^\d.]/g, '')) || 0
      const status = String(row[statusIdx] || 'active').trim().toLowerCase().includes('inactive') ? 'inactive' : 'active'
      const notes = notesIdx !== -1 ? String(row[notesIdx] || '').trim() : ''

      students.push({
        name,
        class: classVal,
        batch,
        parentPhone,
        whatsapp,
        parentName,
        studentPhone,
        address,
        totalFee,
        paid,
        status,
        notes,
        paymentType: 'Monthly',
      })
    }

    return students
  }

  // Parse space-separated/newline lines of copied data
  const parseRawText = (text: string) => {
    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)
    const rows: any[][] = []

    for (const line of lines) {
      if (line.includes('\t')) {
        rows.push(line.split('\t'))
      } else if (line.includes(',')) {
        rows.push(line.split(','))
      } else {
        const parts = line.split(/\s{2,}/) // split by multiple spaces
        if (parts.length > 1) {
          rows.push(parts)
        } else {
          // split by single space but isolate 10-digit numbers for names
          const phoneMatch = line.match(/\b\d{10}\b/)
          if (phoneMatch) {
            const phone = phoneMatch[0]
            const rest = line.replace(phone, '').trim()
            rows.push([rest, '', '', phone])
          } else {
            rows.push([line])
          }
        }
      }
    }
    return parseRows(rows)
  }

  // 3. Edit Handler for students in preview grid
  const handleEditStudent = (index: number, field: string, value: any) => {
    const updated = [...parsedStudents]
    updated[index] = { ...updated[index], [field]: value }
    setParsedStudents(updated)
  }

  // 4. Delete Handler for students in preview grid
  const handleDeleteStudent = (index: number) => {
    const updated = parsedStudents.filter((_, i) => i !== index)
    setParsedStudents(updated)
  }

  // 5. Commit import array sequentially to Firestore
  const handleImportConfirm = async () => {
    if (parsedStudents.length === 0) return
    setIsImporting(true)
    setImportProgress(0)

    let successCount = 0
    let failCount = 0

    for (let i = 0; i < parsedStudents.length; i++) {
      const student = parsedStudents[i]
      try {
        const paymentType = student.totalFee === student.paid ? 'Full Payment' as const : 'Monthly' as const
        await addStudent({
          name: student.name,
          class: student.class,
          batch: student.batch,
          parentPhone: student.parentPhone,
          whatsapp: student.whatsapp,
          parentName: student.parentName,
          studentPhone: student.studentPhone,
          address: student.address,
          totalFee: student.totalFee,
          status: student.status,
          notes: student.notes,
          paymentType,
          feePlan: {
            type: paymentType,
            agreedTotalFee: student.totalFee,
            amountPaidNow: student.paid,
            monthlyFeeAmount: paymentType === 'Monthly' ? Math.round(student.totalFee / 12) : undefined,
          }
        })
        successCount++
      } catch (err) {
        console.error(`Failed to import student "${student.name}":`, err)
        failCount++
      }
      setImportProgress(Math.round(((i + 1) / parsedStudents.length) * 100))
    }

    setIsImporting(false)
    toast({
      title: 'Import completed',
      description: `Successfully imported ${successCount} students.${failCount > 0 ? ` Failed to import ${failCount} records.` : ''}`,
      tone: successCount > 0 ? 'success' : 'error',
    })

    // Reset and close
    setParsedStudents([])
    setFile(null)
    setPasteText('')
    onClose()
  }

  const filteredStudents = parsedStudents.filter((student) => {
    const query = searchQuery.toLowerCase()
    return (
      student.name.toLowerCase().includes(query) ||
      student.parentPhone.includes(query) ||
      student.batch.toLowerCase().includes(query)
    )
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 px-4 backdrop-blur-sm">
      <Card className="w-full max-w-5xl max-h-[85vh] flex flex-col p-6 animate-fade-up overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border pb-4 mb-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-50 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-400">
              <Upload className="h-5 w-5" />
            </span>
            <div>
              <h3 className="text-lg font-semibold tracking-tight">Import Students List</h3>
              <p className="text-xs text-muted-foreground">Add multiple students quickly via file uploading or copy-pasting</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1.5 hover:bg-muted text-muted-foreground transition-colors"
          >
            <X className="h-4.5 w-4.5" />
          </button>
        </div>

        {/* Import Tab Configuration or Import Progress */}
        {isImporting ? (
          <div className="flex-1 flex flex-col items-center justify-center py-10 px-6">
            <div className="w-full max-w-md">
              <h4 className="text-center font-medium text-sm mb-3">Importing student records... ({importProgress}%)</h4>
              <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                <div 
                  className="h-full bg-primary transition-all duration-300 rounded-full" 
                  style={{ width: `${importProgress}%` }}
                />
              </div>
            </div>
          </div>
        ) : parsedStudents.length > 0 ? (
          
          /* Preview and Edit Grid Screen */
          <div className="flex-1 flex flex-col min-h-0">
            <div className="flex items-center justify-between gap-4 mb-3">
              <h4 className="text-sm font-semibold tracking-tight text-indigo-600 dark:text-indigo-400">
                Parsed {parsedStudents.length} Students. Review and edit before saving:
              </h4>
              <div className="relative w-64">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Filter preview list..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-9 w-full rounded-xl border border-border bg-muted/30 pl-9 pr-3 text-xs outline-none focus:border-ring"
                />
              </div>
            </div>

            {/* Preview Table */}
            <div className="flex-1 overflow-auto border border-border rounded-2xl bg-muted/10">
              <table className="w-full text-xs text-left">
                <thead className="sticky top-0 bg-card border-b border-border shadow-sm z-10">
                  <tr>
                    <th className="px-4 py-3 font-semibold text-muted-foreground">Name *</th>
                    <th className="px-3 py-3 font-semibold text-muted-foreground w-20">Class *</th>
                    <th className="px-3 py-3 font-semibold text-muted-foreground w-28">Batch *</th>
                    <th className="px-3 py-3 font-semibold text-muted-foreground">Parent Phone</th>
                    <th className="px-3 py-3 font-semibold text-muted-foreground">Total Fee</th>
                    <th className="px-3 py-3 font-semibold text-muted-foreground">Paid Amount</th>
                    <th className="px-3 py-3 font-semibold text-muted-foreground w-24">Status</th>
                    <th className="px-3 py-3 font-semibold text-muted-foreground">Notes</th>
                    <th className="px-3 py-3 font-semibold text-muted-foreground text-center w-12">Delete</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStudents.map((student, idx) => (
                    <tr key={idx} className="border-b border-border/50 hover:bg-muted/40 transition-colors last:border-0">
                      <td className="p-2">
                        <input
                          type="text"
                          value={student.name}
                          onChange={(e) => handleEditStudent(idx, 'name', e.target.value)}
                          className="h-8 w-full rounded-lg border border-transparent bg-transparent hover:border-border focus:border-ring focus:bg-card px-2 outline-none font-medium"
                        />
                      </td>
                      <td className="p-2">
                        <input
                          type="number"
                          value={student.class}
                          min={1}
                          max={12}
                          onChange={(e) => handleEditStudent(idx, 'class', parseInt(e.target.value, 10) || 1)}
                          className="h-8 w-full rounded-lg border border-transparent bg-transparent hover:border-border focus:border-ring focus:bg-card px-2 outline-none"
                        />
                      </td>
                      <td className="p-2">
                        <input
                          type="text"
                          value={student.batch}
                          onChange={(e) => handleEditStudent(idx, 'batch', e.target.value)}
                          className="h-8 w-full rounded-lg border border-transparent bg-transparent hover:border-border focus:border-ring focus:bg-card px-2 outline-none"
                        />
                      </td>
                      <td className="p-2">
                        <input
                          type="text"
                          value={student.parentPhone}
                          onChange={(e) => handleEditStudent(idx, 'parentPhone', e.target.value)}
                          className="h-8 w-full rounded-lg border border-transparent bg-transparent hover:border-border focus:border-ring focus:bg-card px-2 outline-none tabular-nums"
                        />
                      </td>
                      <td className="p-2">
                        <input
                          type="number"
                          value={student.totalFee}
                          onChange={(e) => handleEditStudent(idx, 'totalFee', parseFloat(e.target.value) || 0)}
                          className="h-8 w-full rounded-lg border border-transparent bg-transparent hover:border-border focus:border-ring focus:bg-card px-2 outline-none tabular-nums"
                        />
                      </td>
                      <td className="p-2">
                        <input
                          type="number"
                          value={student.paid}
                          onChange={(e) => handleEditStudent(idx, 'paid', parseFloat(e.target.value) || 0)}
                          className="h-8 w-full rounded-lg border border-transparent bg-transparent hover:border-border focus:border-ring focus:bg-card px-2 outline-none tabular-nums"
                        />
                      </td>
                      <td className="p-2">
                        <select
                          value={student.status}
                          onChange={(e) => handleEditStudent(idx, 'status', e.target.value)}
                          className="h-8 w-full rounded-lg border border-transparent bg-transparent hover:border-border focus:border-ring focus:bg-card px-2 outline-none font-medium text-xs"
                        >
                          <option value="active">Active</option>
                          <option value="inactive">Inactive</option>
                        </select>
                      </td>
                      <td className="p-2">
                        <input
                          type="text"
                          value={student.notes}
                          onChange={(e) => handleEditStudent(idx, 'notes', e.target.value)}
                          className="h-8 w-full rounded-lg border border-transparent bg-transparent hover:border-border focus:border-ring focus:bg-card px-2 outline-none"
                        />
                      </td>
                      <td className="p-2 text-center">
                        <button
                          type="button"
                          onClick={() => handleDeleteStudent(idx)}
                          className="p-1 rounded text-destructive hover:bg-destructive/10"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Footer Buttons */}
            <div className="mt-4 flex justify-between items-center border-t border-border pt-4">
              <button
                type="button"
                onClick={() => {
                  setParsedStudents([])
                  setFile(null)
                  setPasteText('')
                }}
                className="h-10 px-4 rounded-full border border-border text-sm font-medium hover:bg-muted"
              >
                Clear Preview
              </button>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="h-10 px-4 rounded-full border border-border text-sm font-medium hover:bg-muted"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleImportConfirm}
                  className="h-10 px-5 rounded-full bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 shadow-sm"
                >
                  Confirm Import ({parsedStudents.length} Students)
                </button>
              </div>
            </div>
          </div>
        ) : (
          
          /* Form Entry Screen (File upload / Paste text) */
          <div className="flex-grow flex flex-col min-h-0">
            {/* Tabs */}
            <div className="flex border-b border-border mb-5">
              <button
                type="button"
                onClick={() => { setActiveTab('upload'); setErrorMsg(null); }}
                className={`pb-2.5 px-4 text-sm font-medium border-b-2 transition-all ${
                  activeTab === 'upload'
                    ? 'border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                <span className="flex items-center gap-1.5">
                  <FileText className="h-4 w-4" />
                  Excel / CSV / PDF File
                </span>
              </button>
              <button
                type="button"
                onClick={() => { setActiveTab('paste'); setErrorMsg(null); }}
                className={`pb-2.5 px-4 text-sm font-medium border-b-2 transition-all ${
                  activeTab === 'paste'
                    ? 'border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                <span className="flex items-center gap-1.5">
                  <Clipboard className="h-4 w-4" />
                  Paste Raw Text
                </span>
              </button>
            </div>

            {/* Error Message */}
            {errorMsg && (
              <div className="mb-4 flex items-center gap-2 rounded-xl bg-destructive/10 p-3.5 text-xs text-destructive">
                <AlertCircle className="h-4.5 w-4.5 flex-shrink-0" />
                <p>{errorMsg}</p>
              </div>
            )}

            {/* Tab content */}
            {activeTab === 'upload' ? (
              <div className="flex-1 flex flex-col items-center justify-center p-6 border-2 border-dashed border-border/80 rounded-2xl bg-muted/10 hover:bg-muted/20 hover:border-border transition-colors">
                <Upload className="h-10 w-10 text-muted-foreground mb-3 animate-bounce" />
                <h4 className="font-semibold text-sm mb-1">Upload student spreadsheet or document</h4>
                <p className="text-xs text-muted-foreground mb-4">Supported formats: Excel (.xlsx, .xls), CSV (.csv), or PDF (.pdf)</p>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isParsing}
                  className="h-10 px-5 rounded-full bg-primary text-primary-foreground font-medium text-sm hover:opacity-90 transition-opacity"
                >
                  {isParsing ? 'Parsing file...' : 'Choose File'}
                </button>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  accept=".xlsx,.xls,.csv,.pdf"
                  className="hidden"
                />
              </div>
            ) : (
              <div className="flex-grow flex flex-col min-h-0">
                <label className="block mb-1.5 text-xs font-semibold text-muted-foreground uppercase">
                  Paste student records (one student per line):
                </label>
                <textarea
                  value={pasteText}
                  onChange={(e) => setPasteText(e.target.value)}
                  placeholder="Example:&#10;Arjun Patel&#9;10&#9;Morning A&#9;9876543210&#9;36000&#9;12000&#10;Karan Sharma&#9;9&#9;Evening B&#9;9123456789&#9;24000&#9;0"
                  className="flex-grow min-h-[180px] w-full rounded-2xl border border-border bg-muted/20 p-4 text-xs font-mono outline-none focus:border-ring resize-none focus:bg-card"
                />
                
                <div className="mt-4 flex justify-end gap-2 border-t border-border pt-4">
                  <button
                    type="button"
                    onClick={onClose}
                    className="h-10 px-4 rounded-full border border-border text-sm font-medium hover:bg-muted"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handlePasteSubmit}
                    disabled={isParsing}
                    className="h-10 px-5 rounded-full bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700"
                  >
                    {isParsing ? 'Parsing...' : 'Parse Text'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  )
}
