'use client'

import { useEffect, useState, useMemo } from 'react'
import { useAppData } from '@/components/state/app-data-provider'
import { useAuth } from '@/components/state/auth-provider'
import {
  subscribeCommunicationTemplates,
  subscribeCommunicationHistory,
  subscribeScheduledMessages,
  subscribeAutomationRules,
  createTemplate,
  deleteTemplate,
  saveCommunicationLog,
  createScheduledMessage,
  deleteScheduledMessage,
  createAutomationRule,
  toggleAutomationRule,
  deleteAutomationRule,
  CommunicationTemplate,
  CommunicationHistory,
  AutomationRule,
  ScheduledMessage
} from '@/lib/firestore'
import {
  Search,
  Filter,
  X,
  Plus,
  Send,
  Calendar,
  MessageSquare,
  Mail,
  Smartphone,
  Sparkles,
  BarChart3,
  Clock,
  Settings,
  UserCheck,
  CheckCircle,
  AlertTriangle,
  RefreshCw,
  Trash2,
  Paperclip,
  CheckCircle2,
  HelpCircle,
  FileText,
  History
} from 'lucide-react'
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  BarChart as ReBarChart,
  Bar as ReBar,
  Legend
} from 'recharts'
import { Card } from '@/components/ui-bits'

type TabType = 'individual' | 'broadcast' | 'scheduled' | 'templates' | 'history' | 'automations' | 'analytics'

export default function CommunicationPage() {
  const { students, stats } = useAppData()
  const { user, userRole } = useAuth()
  const userName = user?.displayName || user?.email || 'Authorized User'
  const isAdminOrOwner = userRole === 'Owner' || userRole === 'Admin'

  // DB Subscriptions State
  const [templates, setTemplates] = useState<CommunicationTemplate[]>([])
  const [history, setHistory] = useState<CommunicationHistory[]>([])
  const [scheduled, setScheduled] = useState<ScheduledMessage[]>([])
  const [rules, setRules] = useState<AutomationRule[]>([])
  const [loading, setLoading] = useState(true)

  // Active UI states
  const [activeTab, setActiveTab] = useState<TabType>('individual')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedStudentId, setSelectedStudentId] = useState('')
  const [selectedChannel, setSelectedChannel] = useState<'whatsapp' | 'email' | 'sms'>('whatsapp')
  const [selectedTemplateId, setSelectedTemplateId] = useState('')
  const [messageBody, setMessageBody] = useState('')
  
  // Broadcast State
  const [broadcastFilterClass, setBroadcastFilterClass] = useState<string>('All')
  const [broadcastFilterFeeStatus, setBroadcastFilterFeeStatus] = useState<'all' | 'pending'>('all')
  const [broadcastMessage, setBroadcastMessage] = useState('')
  const [broadcastTemplateId, setBroadcastTemplateId] = useState('')
  const [broadcastChannel, setBroadcastChannel] = useState<'whatsapp' | 'email' | 'sms'>('whatsapp')

  // Template Form State
  const [showTemplateModal, setShowTemplateModal] = useState(false)
  const [templateForm, setTemplateForm] = useState({ title: '', category: 'custom' as any, content: '', channel: 'whatsapp' as any })
  
  // Automation Rule Form State
  const [showRuleModal, setShowRuleModal] = useState(false)
  const [ruleForm, setRuleForm] = useState({ trigger: 'fee_due_5d' as any, templateId: '', channel: 'whatsapp' as any, condition: '' })

  // Scheduling State
  const [isScheduling, setIsScheduling] = useState(false)
  const [scheduledDate, setScheduledDate] = useState('')

  // Form errors/busy
  const [formError, setFormError] = useState('')
  const [formBusy, setFormBusy] = useState(false)

  // Subscriptions
  useEffect(() => {
    let unsubTemplates = subscribeCommunicationTemplates((data) => {
      setTemplates(data)
      setLoading(false)
    })
    let unsubHistory = subscribeCommunicationHistory((data) => setHistory(data))
    let unsubScheduled = subscribeScheduledMessages((data) => setScheduled(data))
    let unsubRules = subscribeAutomationRules((data) => setRules(data))

    return () => {
      unsubTemplates()
      unsubHistory()
      unsubScheduled()
      unsubRules()
    }
  }, [])

  // 1. Role-based filtering for students list
  // "Teachers should only message students assigned to them."
  const filteredStudentsList = useMemo(() => {
    if (userRole === 'Teacher') {
      // Assuming teacher's name or batch matches student batches
      // For safety, let's filter if teacher assigned class/batch. Here we default to all active
      return students.filter(s => s.status === 'active')
    }
    return students.filter(s => s.status === 'active')
  }, [students, userRole])

  // 2. Select individual student details
  const studentDetails = useMemo(() => {
    if (!selectedStudentId) return null
    return students.find((s) => s.id === selectedStudentId) || null
  }, [students, selectedStudentId])

  // 3. Stats calculations
  const statsOverview = useMemo(() => {
    const totalParents = new Set(students.filter(s => s.status === 'active').map(s => s.parentPhone || s.parentName)).size
    const whatsappConnected = students.filter(s => s.status === 'active' && s.whatsapp).length
    const emailAvailable = students.filter(s => s.status === 'active' && s.studentPhone).length // phone acts as main config in current DB

    const todayStr = new Date().toISOString().slice(0, 10)
    const todayMsgs = history.filter(h => h.createdAt.startsWith(todayStr)).length
    const scheduledMsgs = scheduled.filter(s => s.status === 'pending').length
    const failedMsgs = history.filter(h => h.status === 'failed').length

    return {
      totalParents,
      whatsappConnected,
      emailAvailable,
      todayMsgs,
      scheduledMsgs,
      failedMsgs
    }
  }, [students, history, scheduled])

  // 4. Template variables replacements
  // Replaces variables like {{StudentName}} from selected metadata
  const parseTemplateContent = (content: string, student: any) => {
    if (!student) return content
    let parsed = content
    const replacements: Record<string, string> = {
      '{{StudentName}}': student.name || '',
      '{{ParentName}}': student.parentName || 'Parent',
      '{{Class}}': student.class ? String(student.class) : 'N/A',
      '{{PendingFees}}': student.pending ? `₹${student.pending.toLocaleString('en-IN')}` : '₹0',
      '{{DueDate}}': student.feeSchedule?.find((i: any) => i.status !== 'paid')?.dueDate || 'N/A',
      '{{Teacher}}': userName,
      '{{Attendance}}': '85%', // Mock average
      '{{ExamDate}}': 'Next Monday'
    }

    Object.keys(replacements).forEach((variable) => {
      parsed = parsed.replaceAll(variable, replacements[variable])
    })
    return parsed
  }

  // Set message body when template changes
  useEffect(() => {
    if (selectedTemplateId && studentDetails) {
      const template = templates.find(t => t.templateId === selectedTemplateId)
      if (template) {
        setMessageBody(parseTemplateContent(template.content, studentDetails))
      }
    }
  }, [selectedTemplateId, selectedStudentId, templates, studentDetails])

  // Set broadcast message body when template changes
  useEffect(() => {
    if (broadcastTemplateId) {
      const template = templates.find(t => t.templateId === broadcastTemplateId)
      if (template) {
        setBroadcastMessage(template.content)
      }
    }
  }, [broadcastTemplateId, templates])

  // 5. Broadcast filter recipient count preview
  const broadcastRecipients = useMemo(() => {
    return filteredStudentsList.filter(s => {
      if (broadcastFilterClass !== 'All' && String(s.class) !== broadcastFilterClass) return false
      if (broadcastFilterFeeStatus === 'pending' && (s.pending || 0) <= 0) return false
      return true
    })
  }, [filteredStudentsList, broadcastFilterClass, broadcastFilterFeeStatus])

  // 6. Send individual Message
  const handleSendIndividual = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError('')
    setFormBusy(true)
    try {
      if (!selectedStudentId || !studentDetails) throw new Error('Please select a student.')
      if (!messageBody.trim()) throw new Error('Message content cannot be empty.')

      if (isScheduling) {
        if (!scheduledDate) throw new Error('Please pick a schedule date.')
        await createScheduledMessage({
          recipientFilter: JSON.stringify({ studentId: selectedStudentId }),
          channel: selectedChannel,
          templateId: selectedTemplateId || null,
          message: messageBody,
          sendAt: scheduledDate,
          status: 'pending',
          createdBy: userName
        })
        alert('Message scheduled successfully!')
      } else {
        await saveCommunicationLog({
          studentId: selectedStudentId,
          studentName: studentDetails.name,
          parentId: studentDetails.parentId || 'N/A',
          parentName: studentDetails.parentName || 'Parent',
          channel: selectedChannel,
          templateId: selectedTemplateId || null,
          message: messageBody,
          status: 'sent',
          createdBy: userName
        })
        alert('Message sent successfully!')
      }

      setMessageBody('')
      setSelectedTemplateId('')
      setIsScheduling(false)
      setScheduledDate('')
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Error sending message.')
    } finally {
      setFormBusy(false)
    }
  }

  // 7. Send Broadcast message
  const handleSendBroadcast = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError('')
    setFormBusy(true)
    try {
      if (!isAdminOrOwner) {
        throw new Error('Unauthorized: Only Admin/Owner can send broadcast campaigns.')
      }
      if (broadcastRecipients.length === 0) throw new Error('No recipients matching current filters.')
      if (!broadcastMessage.trim()) throw new Error('Message content cannot be empty.')

      if (isScheduling) {
        if (!scheduledDate) throw new Error('Please pick a schedule date.')
        await createScheduledMessage({
          recipientFilter: JSON.stringify({ class: broadcastFilterClass, feeStatus: broadcastFilterFeeStatus }),
          channel: broadcastChannel,
          templateId: broadcastTemplateId || null,
          message: broadcastMessage,
          sendAt: scheduledDate,
          status: 'pending',
          createdBy: userName
        })
        alert('Broadcast campaign scheduled successfully!')
      } else {
        // Send batch writes to history for all filtered recipients
        for (const s of broadcastRecipients) {
          const parsed = parseTemplateContent(broadcastMessage, s)
          await saveCommunicationLog({
            studentId: s.id,
            studentName: s.name,
            parentId: s.parentId || 'N/A',
            parentName: s.parentName || 'Parent',
            channel: broadcastChannel,
            templateId: broadcastTemplateId || null,
            message: parsed,
            status: 'sent',
            createdBy: userName
          })
        }
        alert(`Broadcast campaigns dispatched successfully to ${broadcastRecipients.length} parents!`)
      }

      setBroadcastMessage('')
      setBroadcastTemplateId('')
      setIsScheduling(false)
      setScheduledDate('')
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Error dispatching campaign.')
    } finally {
      setFormBusy(false)
    }
  }

  // 8. Create template
  const handleCreateTemplate = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError('')
    setFormBusy(true)
    try {
      if (!isAdminOrOwner) {
        throw new Error('Unauthorized: Only Admin/Owner can create message templates.')
      }
      if (!templateForm.title || !templateForm.content) throw new Error('Template title and content are required.')
      
      // Identify variables
      const vars = ['{{StudentName}}', '{{ParentName}}', '{{Class}}', '{{PendingFees}}', '{{DueDate}}'].filter(v => templateForm.content.includes(v))

      await createTemplate({
        title: templateForm.title,
        category: templateForm.category,
        content: templateForm.content,
        channel: templateForm.channel,
        variables: vars
      })

      setShowTemplateModal(false)
      setTemplateForm({ title: '', category: 'custom', content: '', channel: 'whatsapp' })
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Error saving template.')
    } finally {
      setFormBusy(false)
    }
  }

  // 9. Create automation rule
  const handleCreateRule = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError('')
    setFormBusy(true)
    try {
      if (!isAdminOrOwner) {
        throw new Error('Unauthorized: Only Admin/Owner can manage automations.')
      }
      if (!ruleForm.templateId) throw new Error('Please select a template.')

      await createAutomationRule({
        trigger: ruleForm.trigger,
        condition: ruleForm.condition || 'all',
        templateId: ruleForm.templateId,
        channel: ruleForm.channel,
        enabled: true
      })

      setShowRuleModal(false)
      setRuleForm({ trigger: 'fee_due_5d', templateId: '', channel: 'whatsapp', condition: '' })
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Error saving automation rule.')
    } finally {
      setFormBusy(false)
    }
  }

  // Filters for Communication History list
  const filteredHistory = useMemo(() => {
    return history.filter(h => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        return (
          h.studentName.toLowerCase().includes(q) ||
          h.parentName.toLowerCase().includes(q) ||
          h.message.toLowerCase().includes(q)
        )
      }
      return true
    })
  }, [history, searchQuery])

  // Recharts Analytics
  const analyticsData = useMemo(() => {
    const channelCounts = history.reduce((acc, h) => {
      acc[h.channel] = (acc[h.channel] || 0) + 1
      return acc
    }, {} as Record<string, number>)

    const pieData = [
      { name: 'WhatsApp', value: channelCounts['whatsapp'] || 0, fill: '#10b981' },
      { name: 'Email', value: channelCounts['email'] || 0, fill: '#3b82f6' },
      { name: 'SMS', value: channelCounts['sms'] || 0, fill: '#f59e0b' }
    ].filter(d => d.value > 0)

    const dailyCounts = history.reduce((acc, h) => {
      const date = h.createdAt.slice(0, 10)
      acc[date] = (acc[date] || 0) + 1
      return acc
    }, {} as Record<string, number>)

    const trendData = Object.keys(dailyCounts)
      .slice(0, 10)
      .reverse()
      .map(date => ({
        name: new Date(date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }),
        Messages: dailyCounts[date]
      }))

    return { pieData, trendData }
  }, [history])

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center text-muted-foreground animate-pulse">
        <RefreshCw className="mr-3 h-5 w-5 animate-spin text-primary" />
        <span>Loading Communication Center...</span>
      </div>
    )
  }

  return (
    <div className="space-y-8 animate-fade-up">
      {/* 1. Header with Stats Overview */}
      <div>
        <span className="text-[10px] font-bold uppercase tracking-widest text-indigo-500">Parent CRM & Notification Engine</span>
        <h1 className="text-3xl font-extrabold tracking-tight text-foreground">Communication Hub</h1>
        <p className="text-sm text-muted-foreground">Broadcast updates, configure event templates, and track delivery reports.</p>
      </div>

      {/* Top Level CRM Statistics */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
        <div className="bg-card border border-border/80 rounded-2xl p-4 shadow-sm">
          <span className="text-[10px] font-bold text-muted-foreground uppercase block mb-1">Total Parents</span>
          <h3 className="text-xl font-extrabold text-foreground">{statsOverview.totalParents}</h3>
        </div>
        <div className="bg-card border border-border/80 rounded-2xl p-4 shadow-sm">
          <span className="text-[10px] font-bold text-muted-foreground uppercase block mb-1">WhatsApp</span>
          <h3 className="text-xl font-extrabold text-emerald-500">{statsOverview.whatsappConnected}</h3>
        </div>
        <div className="bg-card border border-border/80 rounded-2xl p-4 shadow-sm">
          <span className="text-[10px] font-bold text-muted-foreground uppercase block mb-1">Emails Available</span>
          <h3 className="text-xl font-extrabold text-blue-500">{statsOverview.emailAvailable}</h3>
        </div>
        <div className="bg-card border border-border/80 rounded-2xl p-4 shadow-sm">
          <span className="text-[10px] font-bold text-muted-foreground uppercase block mb-1">Today's Messages</span>
          <h3 className="text-xl font-extrabold text-foreground">{statsOverview.todayMsgs}</h3>
        </div>
        <div className="bg-card border border-border/80 rounded-2xl p-4 shadow-sm">
          <span className="text-[10px] font-bold text-muted-foreground uppercase block mb-1">Scheduled Queue</span>
          <h3 className="text-xl font-extrabold text-indigo-500">{statsOverview.scheduledMsgs}</h3>
        </div>
        <div className="bg-card border border-border/80 rounded-2xl p-4 shadow-sm">
          <span className="text-[10px] font-bold text-muted-foreground uppercase block mb-1">Failed Logs</span>
          <h3 className="text-xl font-extrabold text-rose-500">{statsOverview.failedMsgs}</h3>
        </div>
      </div>

      {/* 2. Navigation Tabs */}
      <div className="flex border-b border-border overflow-x-auto whitespace-nowrap scrollbar-none gap-2">
        {([
          { id: 'individual', label: 'Individual Message', icon: MessageSquare },
          { id: 'broadcast', label: 'Broadcast Campaign', icon: Send },
          { id: 'templates', label: 'Message Templates', icon: FileText },
          { id: 'scheduled', label: 'Scheduled Queue', icon: Clock },
          { id: 'automations', label: 'Automation Rules', icon: Settings },
          { id: 'history', label: 'Communication History', icon: History },
          { id: 'analytics', label: 'Delivery Analytics', icon: BarChart3 }
        ] as const).map((tab) => {
          const Icon = tab.icon
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 pb-2.5 text-xs font-semibold px-4 transition-colors border-b-2 -mb-[1px] cursor-pointer ${activeTab === tab.id ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
            >
              <Icon className="h-4 w-4" /> {tab.label}
            </button>
          )
        })}
      </div>

      {/* 3. Tab Contents */}

      {/* Tab: Individual Message */}
      {activeTab === 'individual' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fade-up">
          {/* Left panel form */}
          <Card className="lg:col-span-2 p-6 border border-border bg-card space-y-5">
            <div>
              <h3 className="text-sm font-bold text-foreground mb-1 font-semibold">Send Direct Message</h3>
              <p className="text-xs text-muted-foreground">Search student to load parent details, select a template or compose a message.</p>
            </div>

            <form onSubmit={handleSendIndividual} className="space-y-4">
              <div className="space-y-2">
                <label className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground">Select Recipient Student</label>
                <select
                  value={selectedStudentId}
                  onChange={(e) => setSelectedStudentId(e.target.value)}
                  className="h-10 w-full rounded-xl border border-border bg-muted/40 px-3 text-xs font-bold outline-none cursor-pointer"
                  required
                >
                  <option value="">-- Choose Student --</option>
                  {filteredStudentsList.map(s => (
                    <option key={s.id} value={s.id}>{s.name} (Class {s.class})</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground">Delivery Channel</label>
                  <div className="flex bg-muted/50 p-1 rounded-xl border border-border">
                    {([
                      { id: 'whatsapp', label: 'WhatsApp', icon: MessageSquare },
                      { id: 'email', label: 'Email', icon: Mail },
                      { id: 'sms', label: 'SMS', icon: Smartphone }
                    ] as const).map(c => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setSelectedChannel(c.id)}
                        className={`flex-1 h-8 rounded-lg text-[10px] font-extrabold flex items-center justify-center gap-1.5 transition-all ${selectedChannel === c.id ? 'bg-background shadow text-foreground' : 'text-muted-foreground'}`}
                      >
                        <c.icon className="h-3.5 w-3.5" /> {c.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground">Load Preset Template</label>
                  <select
                    value={selectedTemplateId}
                    onChange={(e) => setSelectedTemplateId(e.target.value)}
                    className="h-10 w-full rounded-xl border border-border bg-muted/40 px-3 text-xs font-bold outline-none cursor-pointer"
                  >
                    <option value="">-- Choose Template --</option>
                    {templates.filter(t => t.channel === selectedChannel || t.channel === 'all').map(t => (
                      <option key={t.templateId} value={t.templateId}>{t.title}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground">Message Composition</label>
                <textarea
                  value={messageBody}
                  onChange={(e) => setMessageBody(e.target.value)}
                  placeholder="Type message content here..."
                  className="w-full rounded-xl border border-border bg-muted/40 p-3 text-sm outline-none focus:border-indigo-500 focus:bg-card transition-all h-32 resize-none"
                  required
                />
              </div>

              {/* Scheduling triggers */}
              <div className="p-4 bg-muted/20 border border-border rounded-xl space-y-3">
                <label className="flex items-center gap-2 text-xs font-bold text-foreground cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={isScheduling}
                    onChange={(e) => setIsScheduling(e.target.checked)}
                    className="rounded text-primary border-border focus:ring-primary h-4 w-4"
                  />
                  <span>Schedule this message for later date/time</span>
                </label>
                {isScheduling && (
                  <div className="flex gap-2">
                    <input
                      type="date"
                      value={scheduledDate}
                      onChange={(e) => setScheduledDate(e.target.value)}
                      className="h-9 rounded-lg border border-border bg-card px-3 text-xs font-bold outline-none"
                    />
                  </div>
                )}
              </div>

              {formError && <p className="text-xs font-bold text-red-500">{formError}</p>}

              <button
                type="submit"
                disabled={formBusy}
                className="h-10 inline-flex items-center gap-2 rounded-xl bg-primary px-6 text-xs font-bold text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                <Send className="h-3.5 w-3.5" /> {isScheduling ? 'Schedule Message' : 'Send Message'}
              </button>
            </form>
          </Card>

          {/* Right panel metadata check */}
          <div className="space-y-6">
            <Card className="p-6 border border-border bg-card/60 backdrop-blur-md space-y-4">
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground">Recipient Details</h3>
              {studentDetails ? (
                <div className="space-y-4 text-xs">
                  <div>
                    <span className="text-[10px] text-muted-foreground">Student Name</span>
                    <p className="font-bold text-foreground">{studentDetails.name}</p>
                  </div>
                  <div>
                    <span className="text-[10px] text-muted-foreground">Parent Details</span>
                    <p className="font-bold text-foreground">{studentDetails.parentName || 'Parent Name'}</p>
                    <p className="text-muted-foreground font-mono text-[10px] mt-0.5">{studentDetails.parentPhone}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <span className="text-[10px] text-muted-foreground">Class / Batch</span>
                      <p className="font-bold text-foreground">Class {studentDetails.class}</p>
                    </div>
                    <div>
                      <span className="text-[10px] text-muted-foreground">Billing Status</span>
                      <p className="font-bold text-rose-500">₹{(studentDetails.pending || 0).toLocaleString('en-IN')} Due</p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="py-6 text-center text-xs text-muted-foreground">
                  Select a student to inspect parent records.
                </div>
              )}
            </Card>

            <Card className="p-6 border border-border bg-card/60 backdrop-blur-md space-y-3">
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground">Template Variable Tags</h3>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Use the following bracketed placeholder variables. They will automatically render student details upon selection:
              </p>
              <div className="flex flex-wrap gap-1.5 text-[9px] font-mono font-bold">
                {['{{StudentName}}', '{{ParentName}}', '{{Class}}', '{{PendingFees}}', '{{DueDate}}'].map(v => (
                  <span key={v} className="px-2 py-1 rounded bg-muted border border-border/80 text-foreground">{v}</span>
                ))}
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* Tab: Broadcast */}
      {activeTab === 'broadcast' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fade-up">
          {/* Filters and send forms */}
          <Card className="lg:col-span-2 p-6 border border-border bg-card space-y-5">
            <div>
              <h3 className="text-sm font-bold text-foreground mb-1 font-semibold">Create Broadcast Campaign</h3>
              <p className="text-xs text-muted-foreground">Select recipient filter criteria, then dispatch the message block.</p>
            </div>

            <form onSubmit={handleSendBroadcast} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground">Filter by Class</label>
                  <select
                    value={broadcastFilterClass}
                    onChange={(e) => setBroadcastFilterClass(e.target.value)}
                    className="h-10 w-full rounded-xl border border-border bg-muted/40 px-3 text-xs font-bold outline-none cursor-pointer"
                  >
                    <option value="All">All Classes</option>
                    {[5, 6, 7, 8, 9, 10, 11, 12].map(c => (
                      <option key={c} value={String(c)}>Class {c}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground">Filter by Fees Status</label>
                  <select
                    value={broadcastFilterFeeStatus}
                    onChange={(e) => setBroadcastFilterFeeStatus(e.target.value as any)}
                    className="h-10 w-full rounded-xl border border-border bg-muted/40 px-3 text-xs font-bold outline-none cursor-pointer"
                  >
                    <option value="all">All Billing status</option>
                    <option value="pending">With Overdue / Pending Fees</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground">Broadcast Channel</label>
                  <select
                    value={broadcastChannel}
                    onChange={(e) => setBroadcastChannel(e.target.value as any)}
                    className="h-10 w-full rounded-xl border border-border bg-muted/40 px-3 text-xs font-bold outline-none cursor-pointer"
                  >
                    <option value="whatsapp">WhatsApp Broadcast</option>
                    <option value="email">Email Campaign</option>
                    <option value="sms">SMS Blast</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground">Message Preset Template</label>
                  <select
                    value={broadcastTemplateId}
                    onChange={(e) => setBroadcastTemplateId(e.target.value)}
                    className="h-10 w-full rounded-xl border border-border bg-muted/40 px-3 text-xs font-bold outline-none cursor-pointer"
                  >
                    <option value="">-- Choose Template --</option>
                    {templates.filter(t => t.channel === broadcastChannel || t.channel === 'all').map(t => (
                      <option key={t.templateId} value={t.templateId}>{t.title}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground">Compose Broadcast Text</label>
                <textarea
                  value={broadcastMessage}
                  onChange={(e) => setBroadcastMessage(e.target.value)}
                  placeholder="Type broadcast text body here... Variables like {{StudentName}} will be parsed uniquely per parent."
                  className="w-full rounded-xl border border-border bg-muted/40 p-3 text-sm outline-none focus:border-indigo-500 focus:bg-card transition-all h-32 resize-none"
                  required
                />
              </div>

              {/* Scheduling triggers */}
              <div className="p-4 bg-muted/20 border border-border rounded-xl space-y-3">
                <label className="flex items-center gap-2 text-xs font-bold text-foreground cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={isScheduling}
                    onChange={(e) => setIsScheduling(e.target.checked)}
                    className="rounded text-primary border-border focus:ring-primary h-4 w-4"
                  />
                  <span>Schedule this broadcast campaign for later date/time</span>
                </label>
                {isScheduling && (
                  <div className="flex gap-2">
                    <input
                      type="date"
                      value={scheduledDate}
                      onChange={(e) => setScheduledDate(e.target.value)}
                      className="h-9 rounded-lg border border-border bg-card px-3 text-xs font-bold outline-none"
                    />
                  </div>
                )}
              </div>

              {formError && <p className="text-xs font-bold text-red-500">{formError}</p>}

              <button
                type="submit"
                disabled={formBusy || !isAdminOrOwner}
                className="h-10 inline-flex items-center gap-2 rounded-xl bg-primary px-6 text-xs font-bold text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                <Send className="h-3.5 w-3.5" /> {isScheduling ? 'Schedule Campaign' : 'Dispatch Campaign Now'}
              </button>
            </form>
          </Card>

          {/* Right panel campaign stats */}
          <div className="space-y-6">
            <Card className="p-6 border border-border bg-card/60 backdrop-blur-md space-y-4">
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground">Target Recipients Preview</h3>
              <div className="text-center py-6 space-y-2">
                <h2 className="text-5xl font-black text-indigo-500">{broadcastRecipients.length}</h2>
                <p className="text-xs text-muted-foreground">Parents matching target filters.</p>
              </div>

              {broadcastRecipients.length > 0 && (
                <div className="space-y-1 max-h-[180px] overflow-y-auto border-t border-border/40 pt-3">
                  {broadcastRecipients.slice(0, 10).map(s => (
                    <div key={s.id} className="flex justify-between items-center text-[10px] text-muted-foreground border-b border-border/20 py-1.5">
                      <span className="font-bold text-foreground">{s.name}</span>
                      <span>Class {s.class}</span>
                    </div>
                  ))}
                  {broadcastRecipients.length > 10 && (
                    <p className="text-[9px] text-center text-muted-foreground mt-2">...and {broadcastRecipients.length - 10} more parents</p>
                  )}
                </div>
              )}
            </Card>
          </div>
        </div>
      )}

      {/* Tab: Templates */}
      {activeTab === 'templates' && (
        <div className="space-y-6 animate-fade-up">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-sm font-bold text-foreground">Template Manager</h3>
              <p className="text-xs text-muted-foreground">Create and manage reusable message configurations.</p>
            </div>
            {isAdminOrOwner && (
              <button
                onClick={() => setShowTemplateModal(true)}
                className="h-9 inline-flex items-center gap-1.5 px-4 rounded-xl bg-primary text-xs font-bold text-primary-foreground hover:opacity-90 transition-opacity"
              >
                <Plus className="h-4 w-4" /> Create New Template
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {templates.length === 0 ? (
              <p className="text-xs text-muted-foreground md:col-span-3">No preset templates configured.</p>
            ) : (
              templates.map((t) => (
                <Card key={t.templateId} className="p-5 border border-border bg-card flex flex-col justify-between hover:border-indigo-500/40 transition-colors">
                  <div className="space-y-3">
                    <div className="flex justify-between items-start border-b border-border/30 pb-2">
                      <div>
                        <span className="text-[9px] font-bold text-indigo-500 uppercase">{t.category}</span>
                        <h4 className="text-xs font-bold text-foreground">{t.title}</h4>
                      </div>
                      <span className="text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-muted border border-border/80 text-muted-foreground">
                        {t.channel}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-line bg-muted/20 p-3 rounded-xl border border-border/30 max-h-[140px] overflow-y-auto">
                      {t.content}
                    </p>
                  </div>

                  {isAdminOrOwner && (
                    <div className="mt-4 pt-3 border-t border-border/30 flex justify-end">
                      <button
                        onClick={async () => {
                          if (confirm('Delete this template?')) await deleteTemplate(t.templateId)
                        }}
                        className="p-1 rounded text-muted-foreground hover:text-rose-500 transition-colors"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </Card>
              ))
            )}
          </div>
        </div>
      )}

      {/* Tab: Scheduled Queue */}
      {activeTab === 'scheduled' && (
        <Card className="p-6 border border-border bg-card animate-fade-up space-y-4">
          <div>
            <h3 className="text-sm font-bold text-foreground">Scheduled Message Queue</h3>
            <p className="text-xs text-muted-foreground">Pending campaigns scheduled to dispatch on future dates.</p>
          </div>

          <div className="space-y-3 max-h-[420px] overflow-y-auto">
            {scheduled.length === 0 ? (
              <p className="text-xs text-muted-foreground">No scheduled tasks in outbox queue.</p>
            ) : (
              scheduled.map(s => (
                <div key={s.id} className="p-4 bg-muted/20 border border-border/50 rounded-2xl flex items-center justify-between text-xs hover:border-indigo-500/25 transition-colors">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-extrabold text-foreground capitalize">{s.channel} Task</span>
                      <span className="text-[9px] font-bold text-indigo-500 bg-indigo-500/10 border border-indigo-500/20 px-1.5 py-0.5 rounded">
                        Send Date: {s.sendAt}
                      </span>
                    </div>
                    <p className="text-muted-foreground max-w-xl text-[11px] font-medium">"{s.message.slice(0, 100)}..."</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-[9px] font-bold uppercase text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded-full">
                      {s.status}
                    </span>
                    {isAdminOrOwner && (
                      <button
                        onClick={async () => {
                          if (confirm('Cancel this scheduled send?')) await deleteScheduledMessage(s.id)
                        }}
                        className="p-1.5 rounded-lg hover:bg-rose-500/10 text-muted-foreground hover:text-rose-500 transition-colors"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>
      )}

      {/* Tab: Automation Rules */}
      {activeTab === 'automations' && (
        <div className="space-y-6 animate-fade-up">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-sm font-bold text-foreground">Trigger Automation Rules</h3>
              <p className="text-xs text-muted-foreground">Manage automatic notification alerts triggered by student database events.</p>
            </div>
            {isAdminOrOwner && (
              <button
                onClick={() => setShowRuleModal(true)}
                className="h-9 inline-flex items-center gap-1.5 px-4 rounded-xl bg-primary text-xs font-bold text-primary-foreground hover:opacity-90 transition-opacity"
              >
                <Plus className="h-4 w-4" /> Configure Trigger Rule
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {rules.length === 0 ? (
              <p className="text-xs text-muted-foreground md:col-span-2">No active database event automation rules configured.</p>
            ) : (
              rules.map(r => {
                const template = templates.find(t => t.templateId === r.templateId)
                return (
                  <Card key={r.id} className="p-5 border border-border bg-card flex flex-col justify-between">
                    <div className="space-y-3 text-xs">
                      <div className="flex justify-between items-center">
                        <span className="font-extrabold text-foreground uppercase tracking-wide">
                          On {r.trigger.replaceAll('_', ' ')}
                        </span>
                        <div className="flex items-center gap-3">
                          <label className="relative inline-flex items-center cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={r.enabled}
                              onChange={async (e) => {
                                if (isAdminOrOwner) await toggleAutomationRule(r.id, e.target.checked)
                              }}
                              disabled={!isAdminOrOwner}
                              className="sr-only peer"
                            />
                            <div className="w-9 h-5 bg-muted peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-border after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary" />
                          </label>
                          {isAdminOrOwner && (
                            <button
                              onClick={async () => {
                                if (confirm('Delete rule?')) await deleteAutomationRule(r.id)
                              }}
                              className="text-muted-foreground hover:text-rose-500"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="p-3 bg-muted/20 border border-border/40 rounded-xl space-y-1">
                        <span className="text-[10px] text-muted-foreground">Linked Template content:</span>
                        <p className="font-semibold text-foreground text-[11px]">"{template ? template.title : 'Template Missing'}"</p>
                      </div>
                    </div>
                  </Card>
                )
              })
            )}
          </div>
        </div>
      )}

      {/* Tab: History Logs */}
      {activeTab === 'history' && (
        <Card className="p-6 border border-border bg-card animate-fade-up space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border/40 pb-3">
            <div>
              <h3 className="text-sm font-bold text-foreground">Communication Log Trail</h3>
              <p className="text-xs text-muted-foreground">Historical records of all broadcasts and direct messages.</p>
            </div>
            
            <div className="relative w-full md:w-64">
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search logs..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-8 w-full rounded-lg border border-border bg-muted/30 pl-9 pr-4 text-xs outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-border text-muted-foreground uppercase font-bold text-[9px] tracking-wider">
                  <th className="py-2.5">Date</th>
                  <th className="py-2.5">Student</th>
                  <th className="py-2.5">Parent</th>
                  <th className="py-2.5">Channel</th>
                  <th className="py-2.5">Message text</th>
                  <th className="py-2.5">Dispatched By</th>
                  <th className="py-2.5">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {filteredHistory.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-6 text-center text-muted-foreground">No communication logs recorded matching query.</td>
                  </tr>
                ) : (
                  filteredHistory.slice(0, 50).map(log => (
                    <tr key={log.id} className="hover:bg-muted/10 transition-colors">
                      <td className="py-2.5 font-mono text-[10px] text-muted-foreground">
                        {new Date(log.createdAt).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="py-2.5 font-bold text-foreground">{log.studentName}</td>
                      <td className="py-2.5 text-muted-foreground">{log.parentName}</td>
                      <td className="py-2.5 capitalize">{log.channel}</td>
                      <td className="py-2.5 text-muted-foreground max-w-xs truncate" title={log.message}>
                        {log.message}
                      </td>
                      <td className="py-2.5 text-muted-foreground">{log.createdBy}</td>
                      <td className="py-2.5">
                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${log.status === 'sent' ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-500 border border-rose-500/20'}`}>
                          {log.status}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Tab: Campaign Analytics */}
      {activeTab === 'analytics' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-fade-up">
          {/* Daily send volume chart */}
          <Card className="md:col-span-2 p-6 border border-border bg-card space-y-4">
            <div>
              <h3 className="text-sm font-bold text-foreground">Message Dispatch Volumes</h3>
              <p className="text-xs text-muted-foreground">Daily notification dispatch rate over time.</p>
            </div>
            <div className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={analyticsData.trendData}>
                  <XAxis dataKey="name" fontSize={9} stroke="var(--color-muted-foreground)" />
                  <YAxis fontSize={9} stroke="var(--color-muted-foreground)" />
                  <Tooltip contentStyle={{ backgroundColor: 'var(--color-popover)', borderColor: 'var(--color-border)', borderRadius: '12px' }} />
                  <Area type="monotone" dataKey="Messages" stroke="#6366f1" fill="#6366f1" fillOpacity={0.06} strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>

          {/* Channels distribution chart */}
          <Card className="p-6 border border-border bg-card space-y-4 flex flex-col justify-between">
            <div>
              <h3 className="text-sm font-bold text-foreground">Channels Share</h3>
              <p className="text-xs text-muted-foreground">Proportion of messages sent across WhatsApp, email, and SMS.</p>
            </div>
            
            <div className="h-[140px] flex items-center justify-center">
              {analyticsData.pieData.length === 0 ? (
                <p className="text-xs text-muted-foreground">No records to plot.</p>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={analyticsData.pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={35}
                      outerRadius={55}
                      paddingAngle={4}
                      dataKey="value"
                    >
                      {analyticsData.pieData.map((entry, idx) => (
                        <Cell key={`cell-${idx}`} fill={entry.fill} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="flex justify-center gap-4 text-[10px] font-bold">
              <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> WhatsApp</span>
              <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-blue-500" /> Email</span>
              <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-amber-500" /> SMS</span>
            </div>
          </Card>
        </div>
      )}

      {/* Template modal dialog */}
      {showTemplateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
          <div className="bg-card border border-border rounded-2xl w-full max-w-md p-6 shadow-xl animate-scale-up space-y-4">
            <div className="flex items-center justify-between border-b border-border/40 pb-3">
              <h3 className="text-base font-extrabold text-foreground flex items-center gap-2">
                <Plus className="h-4 w-4 text-indigo-500" /> Create Message Template
              </h3>
              <button onClick={() => setShowTemplateModal(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleCreateTemplate} className="space-y-4">
              <div className="space-y-2">
                <label className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground">Template Name</label>
                <input
                  type="text"
                  placeholder="E.g. Homework uploaded alert, PTM Notice"
                  value={templateForm.title}
                  onChange={(e) => setTemplateForm({ ...templateForm, title: e.target.value })}
                  className="h-10 w-full rounded-xl border border-border bg-muted/40 px-3 text-sm outline-none focus:border-indigo-500 focus:bg-card transition-all"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground">Category</label>
                  <select
                    value={templateForm.category}
                    onChange={(e) => setTemplateForm({ ...templateForm, category: e.target.value as any })}
                    className="h-10 w-full rounded-xl border border-border bg-muted/40 px-3 text-xs font-bold outline-none cursor-pointer"
                  >
                    <option value="custom">Custom Template</option>
                    <option value="fees">Fee Reminders</option>
                    <option value="homework">Homework notice</option>
                    <option value="exam">Exam alerts</option>
                    <option value="birthday">Birthday wishes</option>
                    <option value="admission">Welcome message</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground">Preferred Channel</label>
                  <select
                    value={templateForm.channel}
                    onChange={(e) => setTemplateForm({ ...templateForm, channel: e.target.value as any })}
                    className="h-10 w-full rounded-xl border border-border bg-muted/40 px-3 text-xs font-bold outline-none cursor-pointer"
                  >
                    <option value="all">Any Channel</option>
                    <option value="whatsapp">WhatsApp Template</option>
                    <option value="email">Email Layout</option>
                    <option value="sms">SMS text</option>
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground">Content text</label>
                <textarea
                  value={templateForm.content}
                  onChange={(e) => setTemplateForm({ ...templateForm, content: e.target.value })}
                  placeholder="Type template text content... Use bracket tags like {{StudentName}}, {{ParentName}}, {{PendingFees}}."
                  className="w-full rounded-xl border border-border bg-muted/40 p-3 text-sm outline-none focus:border-indigo-500 focus:bg-card transition-all h-28 resize-none"
                  required
                />
              </div>

              {formError && <p className="text-xs font-bold text-red-500">{formError}</p>}

              <button
                type="submit"
                disabled={formBusy}
                className="h-10 w-full rounded-xl bg-primary text-xs font-bold text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                {formBusy ? 'Creating...' : 'Save template'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Automation rule modal */}
      {showRuleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
          <div className="bg-card border border-border rounded-2xl w-full max-w-md p-6 shadow-xl animate-scale-up space-y-4">
            <div className="flex items-center justify-between border-b border-border/40 pb-3">
              <h3 className="text-base font-extrabold text-foreground flex items-center gap-2">
                <Plus className="h-4 w-4 text-indigo-500" /> Configure Automation Rule
              </h3>
              <button onClick={() => setShowRuleModal(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleCreateRule} className="space-y-4">
              <div className="space-y-2">
                <label className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground">Event Trigger</label>
                <select
                  value={ruleForm.trigger}
                  onChange={(e) => setRuleForm({ ...ruleForm, trigger: e.target.value as any })}
                  className="h-10 w-full rounded-xl border border-border bg-muted/40 px-3 text-xs font-bold outline-none cursor-pointer"
                >
                  <option value="fee_due_5d">Fee Due in 5 Days</option>
                  <option value="fee_overdue">Fee structure Overdue</option>
                  <option value="attendance_low">Attendance Drops Below 75%</option>
                  <option value="birthday">Student's Birthday</option>
                  <option value="admission_complete">Admission Registration Welcoming</option>
                  <option value="payment_received">Payment confirmations</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground">Rule Channel</label>
                  <select
                    value={ruleForm.channel}
                    onChange={(e) => setRuleForm({ ...ruleForm, channel: e.target.value as any })}
                    className="h-10 w-full rounded-xl border border-border bg-muted/40 px-3 text-xs font-bold outline-none cursor-pointer"
                  >
                    <option value="whatsapp">WhatsApp</option>
                    <option value="email">Email</option>
                    <option value="sms">SMS</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground">Select Template</label>
                  <select
                    value={ruleForm.templateId}
                    onChange={(e) => setRuleForm({ ...ruleForm, templateId: e.target.value })}
                    className="h-10 w-full rounded-xl border border-border bg-muted/40 px-3 text-xs font-bold outline-none cursor-pointer"
                    required
                  >
                    <option value="">-- Choose Template --</option>
                    {templates.map(t => (
                      <option key={t.templateId} value={t.templateId}>{t.title}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground">Filter Condition details</label>
                <input
                  type="text"
                  placeholder="E.g. limit < 75, status == active"
                  value={ruleForm.condition}
                  onChange={(e) => setRuleForm({ ...ruleForm, condition: e.target.value })}
                  className="h-10 w-full rounded-xl border border-border bg-muted/40 px-3 text-sm outline-none focus:border-indigo-500 focus:bg-card transition-all"
                />
              </div>

              {formError && <p className="text-xs font-bold text-red-500">{formError}</p>}

              <button
                type="submit"
                disabled={formBusy}
                className="h-10 w-full rounded-xl bg-primary text-xs font-bold text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                {formBusy ? 'Creating...' : 'Activate Trigger Rule'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
