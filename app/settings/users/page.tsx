'use client'

import { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, UserPlus, Search, Trash2, ShieldAlert, UserCheck, UserX, Shield, Copy, Check } from 'lucide-react'
import { Card, PageHeader, Avatar } from '@/components/ui-bits'
import { useAuth } from '@/components/state/auth-provider'
import { subscribeUsers, generateInviteToken, changeUserRole, disableUser, enableUser, removeUser } from '@/lib/firestore'
import { useToast } from '@/components/ui/toast'
import { cn } from '@/lib/utils'

export default function UserManagementPage() {
  const { user, userRole } = useAuth()
  const { toast } = useToast()
  const router = useRouter()
  const [usersList, setUsersList] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')

  // Invite Form State
  const [isInviteOpen, setIsInviteOpen] = useState(false)
  const [inviteLink, setInviteLink] = useState('')
  const [inviteRole, setInviteRole] = useState('Admin')
  const [inviteError, setInviteError] = useState('')
  const [inviteBusy, setInviteBusy] = useState(false)

  // Redirect if not Owner
  useEffect(() => {
    if (userRole && userRole !== 'Owner') {
      router.replace('/')
    }
  }, [userRole, router])

  // Real-time subscribe to users
  useEffect(() => {
    if (!user || userRole !== 'Owner') return
    const unsubscribe = subscribeUsers(
      (list) => {
        setUsersList(list)
        setLoading(false)
      },
      () => {
        setLoading(false)
      }
    )
    return () => unsubscribe()
  }, [user, userRole])

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase()
    return usersList.filter((u) => {
      const matchesSearch =
        !q ||
        u.name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q)
      const matchesRole = roleFilter === 'all' || u.role === roleFilter
      const matchesStatus = statusFilter === 'all' || u.status === statusFilter
      return matchesSearch && matchesRole && matchesStatus
    })
  }, [usersList, search, roleFilter, statusFilter])

  async function handleInviteSubmit(e: React.FormEvent) {
    e.preventDefault()
    setInviteError('')

    setInviteBusy(true)
    try {
      const token = await generateInviteToken(inviteRole, user?.email || 'Owner')
      const link = `${window.location.origin}/signup?token=${token}`
      setInviteLink(link)
      toast({
        title: 'Link Generated',
        description: `Invite link created for ${inviteRole}.`,
        tone: 'success',
      })
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : 'Invitation failed')
    } finally {
      setInviteBusy(false)
    }
  }

  async function handleStatusToggle(targetEmail: string, currentStatus: string) {
    try {
      if (currentStatus === 'Disabled') {
        await enableUser(targetEmail, user?.email || 'Owner')
        toast({ title: 'User Enabled', description: `${targetEmail} is now active.`, tone: 'success' })
      } else {
        await disableUser(targetEmail, user?.email || 'Owner')
        toast({ title: 'User Disabled', description: `${targetEmail} has been disabled.`, tone: 'success' })
      }
    } catch (err) {
      alert('Failed to update status')
    }
  }

  async function handleRoleChange(targetEmail: string, nextRole: string) {
    try {
      await changeUserRole(targetEmail, nextRole, user?.email || 'Owner')
      toast({ title: 'Role Updated', description: `${targetEmail} role changed to ${nextRole}.`, tone: 'success' })
    } catch (err) {
      alert('Failed to change role')
    }
  }

  async function handleRevokeAccess(targetEmail: string) {
    const confirmed = window.confirm(`Are you sure you want to revoke access for ${targetEmail}? This will delete their credentials but preserve audit history.`)
    if (!confirmed) return
    try {
      await removeUser(targetEmail, user?.email || 'Owner')
      toast({ title: 'Access Revoked', description: `Removed user credentials for ${targetEmail}.`, tone: 'success' })
    } catch (err) {
      alert('Failed to revoke access')
    }
  }

  if (loading) {
    return <div className="text-sm text-muted-foreground">Loading authorized users directory...</div>
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
        eyebrow="User Management"
        title="Who has access?"
        sub="Invite teachers, accountants, admins, or receptionists and control their platform features."
        action={
          <button
            type="button"
            onClick={() => setIsInviteOpen(true)}
            className="flex h-10 items-center gap-1.5 rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity"
          >
            <UserPlus className="h-4 w-4" />
            Invite Staff
          </button>
        }
      />

      {/* Filter Row */}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3.5 top-3 h-4 w-4 text-muted-foreground" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or email..."
            className="h-10 w-full rounded-full border border-border bg-card pl-10 pr-4 text-sm outline-none transition-colors focus:border-ring"
          />
        </div>
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="h-10 rounded-full border border-border bg-card px-3 text-xs outline-none focus:border-ring"
        >
          <option value="all">All Roles</option>
          <option value="Owner">Owner</option>
          <option value="Admin">Admin</option>
          <option value="Accountant">Accountant</option>
          <option value="Teacher">Teacher</option>
          <option value="Receptionist">Receptionist</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="h-10 rounded-full border border-border bg-card px-3 text-xs outline-none focus:border-ring"
        >
          <option value="all">All Statuses</option>
          <option value="Active">Active</option>
          <option value="Disabled">Disabled</option>
          <option value="Pending Invitation">Pending</option>
        </select>
      </div>

      <Card className="overflow-hidden animate-fade-up">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left">
              <th className="micro-label px-6 py-4 font-medium">User</th>
              <th className="micro-label px-4 py-4 font-medium">Role</th>
              <th className="micro-label px-4 py-4 font-medium">Status</th>
              <th className="micro-label px-4 py-4 font-medium">Last Activity</th>
              <th className="w-40" aria-hidden="true" />
            </tr>
          </thead>
          <tbody>
            {filteredUsers.map((u) => {
              const isSelf = u.email === user?.email
              return (
                <tr key={u.id} className="border-b border-border/60 transition-colors last:border-0 hover:bg-muted/30">
                  <td className="px-6 py-3.5">
                    <div className="flex items-center gap-3">
                      <Avatar name={u.name} size="sm" />
                      <div>
                        <span className="font-semibold block">{u.name} {isSelf && <span className="text-[10px] bg-accent px-1.5 py-0.5 rounded font-normal text-muted-foreground">You</span>}</span>
                        <span className="text-xs text-muted-foreground block">{u.email}</span>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3.5">
                    {isSelf ? (
                      <span className="text-xs font-semibold px-2 py-1 rounded bg-muted text-muted-foreground">{u.role}</span>
                    ) : (
                      <select
                        value={u.role}
                        onChange={(e) => handleRoleChange(u.email, e.target.value)}
                        className="h-8 rounded-lg border border-border bg-card px-2 text-xs outline-none focus:border-ring"
                      >
                        <option value="Owner">Owner</option>
                        <option value="Admin">Admin</option>
                        <option value="Accountant">Accountant</option>
                        <option value="Teacher">Teacher</option>
                        <option value="Receptionist">Receptionist</option>
                      </select>
                    )}
                  </td>
                  <td className="px-4 py-3.5">
                    <span
                      className={cn(
                        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium',
                        u.status === 'Active' && 'bg-success/10 text-success',
                        u.status === 'Disabled' && 'bg-destructive/10 text-destructive',
                        u.status === 'Pending Invitation' && 'bg-warning/10 text-warning-foreground'
                      )}
                    >
                      {u.status}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 text-xs text-muted-foreground">
                    {u.lastActivity ? new Date(u.lastActivity).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' }) : 'Never'}
                  </td>
                  <td className="px-4 py-3.5 text-right">
                    {!isSelf && (
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => handleStatusToggle(u.email, u.status)}
                          title={u.status === 'Disabled' ? 'Enable user access' : 'Disable user access'}
                          className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-accent"
                        >
                          {u.status === 'Disabled' ? <UserCheck className="h-4 w-4 text-success" /> : <UserX className="h-4 w-4 text-destructive" />}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRevokeAccess(u.email)}
                          title="Revoke user account access"
                          className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              )
            })}
            {filteredUsers.length === 0 && (
              <tr>
                <td colSpan={5} className="px-6 py-12 text-center text-xs text-muted-foreground">
                  No staff members matching filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      {/* Invite Modal */}
      {isInviteOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/45 px-4 backdrop-blur-sm">
          <Card className="w-full max-w-sm p-6 animate-fade-up">
            <h3 className="text-base font-bold tracking-tight mb-1">Invite Staff Member</h3>
            <p className="text-xs text-muted-foreground mb-4">
              Enter their name and email. Once they log in with Google, they will get access instantly.
            </p>

            <form onSubmit={handleInviteSubmit} className="space-y-4">
              {!inviteLink ? (
                <>
                  <div>
                    <label className="block text-xs font-semibold mb-1">Select Role</label>
                    <select
                      value={inviteRole}
                      onChange={(e) => setInviteRole(e.target.value)}
                      className="h-10 w-full rounded-xl border border-border px-2.5 text-sm bg-muted/20 outline-none focus:border-ring"
                    >
                      <option value="Admin">Admin</option>
                      <option value="Accountant">Accountant</option>
                      <option value="Teacher">Teacher</option>
                      <option value="Receptionist">Receptionist</option>
                      <option value="Owner">Owner</option>
                    </select>
                  </div>

                  {inviteError && <p className="text-xs text-destructive mt-1">{inviteError}</p>}

                  <div className="flex gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setIsInviteOpen(false)}
                      disabled={inviteBusy}
                      className="flex-1 h-10 rounded-xl border border-border text-sm font-semibold hover:bg-muted"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={inviteBusy}
                      className="flex-1 h-10 rounded-xl bg-primary text-sm font-semibold text-primary-foreground hover:opacity-90"
                    >
                      {inviteBusy ? 'Generating...' : 'Generate Link'}
                    </button>
                  </div>
                </>
              ) : (
                <div className="space-y-4">
                  <div className="rounded-xl border border-border bg-muted/20 p-3 text-xs font-mono break-all selection:bg-primary/20">
                    {inviteLink}
                  </div>
                  <div className="flex gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        setIsInviteOpen(false)
                        setInviteLink('')
                      }}
                      className="flex-1 h-10 rounded-xl border border-border text-sm font-semibold hover:bg-muted"
                    >
                      Close
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(inviteLink)
                        toast({ title: 'Copied!', description: 'Link copied to clipboard.', tone: 'success' })
                      }}
                      className="flex-1 h-10 flex items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-primary-foreground hover:opacity-90"
                    >
                      <Copy className="h-4 w-4" />
                      Copy Link
                    </button>
                  </div>
                </div>
              )}
            </form>
          </Card>
        </div>
      )}
    </div>
  )
}
