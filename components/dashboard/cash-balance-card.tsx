'use client'

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Lock, Wallet, History, PlusCircle, MinusCircle, Settings2, X, Trash2, Edit3, Save, TrendingUp, TrendingDown } from 'lucide-react'
import { Card } from '@/components/ui-bits'
import { useAppData } from '@/components/state/app-data-provider'
import { useAuth } from '@/components/state/auth-provider'
import { formatINR, todayISO, CashTransaction } from '@/lib/domain'
import { cn } from '@/lib/utils'

const PASSWORD = '2006'

export function CashBalanceCard() {
  const {
    settings,
    persistSettings,
    cashTransactions,
    addCashTransaction,
    editCashTransaction,
    removeCashTransaction,
  } = useAppData()
  
  const { userRole, userName } = useAuth()

  const [drawerOpen, setDrawerOpen] = useState(false)
  const [unlocked, setUnlocked] = useState(false)
  const [password, setPassword] = useState('')
  const [passwordError, setPasswordError] = useState<string | null>(null)

  const [activeTab, setActiveTab] = useState<'overview' | 'deposit' | 'withdraw' | 'adjust' | 'opening'>('overview')
  
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(todayISO())
  const [reason, setReason] = useState('')
  const [notes, setNotes] = useState('')
  const [adjustmentMode, setAdjustmentMode] = useState<'increase' | 'decrease'>('increase')
  const [loading, setLoading] = useState(false)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editPassword, setEditPassword] = useState('')
  const [actionPending, setActionPending] = useState<string | null>(null)

  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const openingBalance = settings.openingBalance || 0
  
  const totalDeposits = cashTransactions.filter(t => t.type === 'deposit').reduce((sum, t) => sum + t.amount, 0)
  const totalWithdrawals = cashTransactions.filter(t => t.type === 'withdrawal').reduce((sum, t) => sum + t.amount, 0)
  
  const totalAdjustments = cashTransactions.filter(t => t.type === 'adjustment').reduce((sum, t) => {
    return t.adjustmentMode === 'increase' ? sum + t.amount : sum - t.amount
  }, 0)
  
  const currentBalance = openingBalance + totalDeposits - totalWithdrawals + totalAdjustments

  function canAccess() {
    return userRole === 'Owner' || userRole === 'Admin' || userRole === 'Accountant'
  }

  function handleUnlock(e: React.FormEvent) {
    e.preventDefault()
    if (password === PASSWORD) {
      setUnlocked(true)
      setPasswordError(null)
      setPassword('')
    } else {
      setPasswordError('Incorrect password.')
      setPassword('')
    }
  }

  function resetForm() {
    setAmount('')
    setDate(todayISO())
    setReason('')
    setNotes('')
    setAdjustmentMode('increase')
    setEditingId(null)
  }

  async function handleTransactionSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!amount || isNaN(Number(amount))) return
    
    setLoading(true)
    try {
      const payload: any = {
        date,
        amount: Number(amount),
        type: activeTab === 'deposit' ? 'deposit' : activeTab === 'withdraw' ? 'withdrawal' : 'adjustment',
        reason: reason.trim(),
        notes: notes.trim(),
        createdBy: userName || 'Admin'
      }
      
      if (activeTab === 'adjust') {
        payload.adjustmentMode = adjustmentMode
      }

      if (editingId) {
        await editCashTransaction(editingId, payload)
      } else {
        await addCashTransaction(payload)
      }
      
      resetForm()
      setActiveTab('overview')
    } catch (error) {
      console.error(error)
      alert('Failed to save transaction')
    } finally {
      setLoading(false)
    }
  }

  async function handleSetOpeningBalance(e: React.FormEvent) {
    e.preventDefault()
    if (!amount || isNaN(Number(amount))) return

    setLoading(true)
    try {
      await persistSettings({
        ...settings,
        openingBalance: Number(amount),
      })
      resetForm()
      setActiveTab('overview')
    } catch (error) {
      console.error(error)
      alert('Failed to set opening balance')
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete(id: string) {
    if (editPassword !== PASSWORD) {
      alert("Incorrect password")
      return
    }
    setLoading(true)
    try {
      await removeCashTransaction(id)
      setActionPending(null)
      setEditPassword('')
    } catch (e) {
      console.error(e)
      alert('Failed to delete transaction')
    } finally {
      setLoading(false)
    }
  }

  function startEdit(tx: CashTransaction) {
    if (editPassword !== PASSWORD) {
      alert("Incorrect password")
      return
    }
    setActiveTab(tx.type === 'withdrawal' ? 'withdraw' : tx.type === 'deposit' ? 'deposit' : 'adjust')
    setEditingId(tx.id)
    setAmount(tx.amount.toString())
    setDate(tx.date)
    setReason(tx.reason)
    setNotes(tx.notes || '')
    if (tx.adjustmentMode) setAdjustmentMode(tx.adjustmentMode)
    setActionPending(null)
    setEditPassword('')
  }

  return (
    <>
      <Card 
        onClick={() => {
          if (!canAccess()) return
          setDrawerOpen(true)
        }}
        className={cn(
          "relative flex flex-col justify-between overflow-hidden p-5 transition-all duration-300 hover:shadow-lg bg-emerald-950 text-emerald-50 border-emerald-900/50",
          canAccess() && "cursor-pointer hover:bg-emerald-900 active:scale-[0.99]"
        )}
      >
        <div className={cn("flex flex-col justify-between h-full", !canAccess() && "opacity-30 blur-[4px]")}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex items-center justify-center h-8 w-8 rounded-full bg-emerald-500/20 text-emerald-300">
                <Wallet className="h-4 w-4" strokeWidth={2} />
              </div>
              <p className="font-semibold text-xs uppercase tracking-wider text-emerald-200/90">
                Cash in Hand
              </p>
            </div>
          </div>
          <div className="mt-4">
            <p className="tabular text-2xl md:text-3xl font-bold tracking-tight text-white drop-shadow-sm">
              {formatINR(currentBalance)}
            </p>
            <p className="mt-1 text-xs text-emerald-200/70 font-medium">
              Independent Ledger
            </p>
          </div>
        </div>
        
        {!canAccess() && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/5 backdrop-blur-[2px]">
            <span className="flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-emerald-950 text-emerald-200/50">
              <Lock className="h-4 w-4" />
            </span>
          </div>
        )}
      </Card>

      {mounted && drawerOpen && createPortal(
        <div className="fixed inset-0 z-[100] flex justify-end bg-background/60 backdrop-blur-sm">
          <div className="absolute inset-0" onClick={() => setDrawerOpen(false)} />
          
          <div className="relative w-full max-w-lg bg-card h-full shadow-2xl flex flex-col border-l border-border animate-in slide-in-from-right duration-300">
            <div className="flex items-center justify-between p-5 border-b border-border bg-muted/30">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <Wallet className="h-6 w-6 text-emerald-500" /> Cash Management
              </h2>
              <button onClick={() => setDrawerOpen(false)} className="h-8 w-8 flex items-center justify-center rounded-full hover:bg-muted text-muted-foreground transition-colors">
                <X className="h-5 w-5" />
              </button>
            </div>

            {!unlocked ? (
              <div className="p-8 flex flex-col items-center justify-center flex-1">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600">
                  <Lock className="h-8 w-8" />
                </div>
                <h3 className="mb-2 text-xl font-bold tracking-tight text-center">Owner Security Lock</h3>
                <p className="mb-6 text-sm text-muted-foreground text-center max-w-[250px]">
                  Enter the owner password to access the independent cash ledger.
                </p>
                <form onSubmit={handleUnlock} className="flex gap-2 w-full max-w-xs">
                  <input
                    type="password"
                    autoFocus
                    placeholder="Password..."
                    className="flex-1 rounded-xl border border-border bg-transparent px-4 py-3 outline-none focus:border-emerald-500 transition-colors"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <button type="submit" className="rounded-xl bg-foreground px-6 py-3 font-semibold text-background hover:opacity-90 transition-opacity">
                    Unlock
                  </button>
                </form>
                {passwordError && <p className="mt-4 text-sm font-medium text-destructive">{passwordError}</p>}
              </div>
            ) : (
              <div className="flex flex-col h-full overflow-hidden">
                <div className="flex overflow-x-auto border-b border-border shrink-0 hide-scrollbar">
                  {[
                    { id: 'overview', label: 'Ledger' },
                    { id: 'opening', label: 'Set Opening' },
                    { id: 'deposit', label: 'Deposit' },
                    { id: 'withdraw', label: 'Withdraw' },
                    { id: 'adjust', label: 'Adjust' },
                  ].map((t) => (
                    <button
                      key={t.id}
                      onClick={() => { setActiveTab(t.id as any); resetForm(); }}
                      className={cn("px-5 py-4 text-sm font-semibold whitespace-nowrap border-b-2 transition-colors", activeTab === t.id ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400' : 'border-transparent text-muted-foreground hover:text-foreground')}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>

                <div className="p-6 overflow-y-auto flex-1">
                  {activeTab === 'overview' && (
                    <div className="space-y-6">
                      <div className="rounded-2xl bg-gradient-to-br from-emerald-50 to-emerald-100/50 dark:from-emerald-950/40 dark:to-emerald-900/20 border border-emerald-200/50 dark:border-emerald-800/50 p-6 text-center shadow-sm">
                        <p className="text-sm font-bold text-emerald-700/80 dark:text-emerald-400/80 uppercase tracking-widest">Current Balance</p>
                        <p className="text-5xl font-black text-emerald-900 dark:text-emerald-100 mt-3 tabular-nums tracking-tight">{formatINR(currentBalance)}</p>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="bg-muted/40 rounded-xl p-4 border border-border/50">
                           <p className="text-xs text-muted-foreground font-semibold mb-1 uppercase">Opening Cash</p>
                           <p className="font-bold">{formatINR(openingBalance)}</p>
                        </div>
                        <div className="bg-muted/40 rounded-xl p-4 border border-border/50">
                           <p className="text-xs text-muted-foreground font-semibold mb-1 uppercase">Total Deposits</p>
                           <p className="font-bold text-emerald-600">+{formatINR(totalDeposits)}</p>
                        </div>
                        <div className="bg-muted/40 rounded-xl p-4 border border-border/50">
                           <p className="text-xs text-muted-foreground font-semibold mb-1 uppercase">Total Withdrawals</p>
                           <p className="font-bold text-rose-600">-{formatINR(totalWithdrawals)}</p>
                        </div>
                        <div className="bg-muted/40 rounded-xl p-4 border border-border/50">
                           <p className="text-xs text-muted-foreground font-semibold mb-1 uppercase">Net Adjustments</p>
                           <p className={cn("font-bold", totalAdjustments > 0 ? "text-emerald-600" : totalAdjustments < 0 ? "text-rose-600" : "")}>
                             {totalAdjustments > 0 ? '+' : ''}{formatINR(totalAdjustments)}
                           </p>
                        </div>
                      </div>

                      <div className="mt-8">
                        <h4 className="text-sm font-bold text-foreground mb-4 flex items-center gap-2">
                          <History className="h-4 w-4 text-muted-foreground" /> Transaction History
                        </h4>
                        
                        <div className="space-y-3 relative before:absolute before:inset-y-0 before:left-4 before:w-[2px] before:bg-border/60">
                          {cashTransactions.map((tx) => (
                            <div key={tx.id} className="relative pl-10 pr-4 py-3 bg-card rounded-xl border border-border shadow-sm group">
                              <div className={cn("absolute left-[-2px] top-4 w-8 h-8 rounded-full border-4 border-card flex items-center justify-center -translate-x-1/2", 
                                tx.type === 'deposit' || (tx.type === 'adjustment' && tx.adjustmentMode === 'increase') ? 'bg-emerald-500' : 
                                tx.type === 'withdrawal' || (tx.type === 'adjustment' && tx.adjustmentMode === 'decrease') ? 'bg-rose-500' : 'bg-blue-500'
                              )}>
                                {tx.type === 'deposit' || (tx.type === 'adjustment' && tx.adjustmentMode === 'increase') ? <TrendingUp className="h-3 w-3 text-white" /> : <TrendingDown className="h-3 w-3 text-white" />}
                              </div>
                              
                              <div className="flex justify-between items-start mb-1">
                                <div>
                                  <p className="font-semibold text-sm">{tx.reason}</p>
                                  <p className="text-xs text-muted-foreground">{new Date(tx.date).toLocaleDateString('en-IN', {day:'numeric', month:'short', year:'numeric'})} · {tx.createdBy}</p>
                                </div>
                                <div className="text-right">
                                  <p className={cn("font-bold tabular-nums", 
                                    tx.type === 'deposit' || (tx.type === 'adjustment' && tx.adjustmentMode === 'increase') ? 'text-emerald-600' : 'text-rose-600'
                                  )}>
                                    {tx.type === 'deposit' || (tx.type === 'adjustment' && tx.adjustmentMode === 'increase') ? '+' : '-'}{formatINR(tx.amount)}
                                  </p>
                                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mt-0.5">{tx.type}</p>
                                </div>
                              </div>
                              {tx.notes && <p className="text-xs text-muted-foreground mt-2 bg-muted/50 p-2 rounded-md">{tx.notes}</p>}

                              <div className="mt-3 pt-3 border-t border-border/50 flex gap-2 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                                {actionPending === tx.id ? (
                                  <div className="flex items-center gap-2 w-full">
                                    <input type="password" placeholder="Pass..." value={editPassword} onChange={e => setEditPassword(e.target.value)} className="text-xs px-2 py-1 rounded border border-border flex-1" autoFocus />
                                    <button onClick={() => startEdit(tx)} className="text-xs bg-emerald-500 text-white px-3 py-1 rounded font-medium">Edit</button>
                                    <button onClick={() => handleDelete(tx.id)} className="text-xs bg-rose-500 text-white px-3 py-1 rounded font-medium">Del</button>
                                    <button onClick={() => setActionPending(null)} className="text-xs bg-muted px-2 py-1 rounded"><X className="h-3 w-3" /></button>
                                  </div>
                                ) : (
                                  <>
                                    <button onClick={() => setActionPending(tx.id)} className="text-xs flex items-center gap-1 text-muted-foreground hover:text-foreground"><Edit3 className="h-3 w-3" /> Edit</button>
                                    <button onClick={() => setActionPending(tx.id)} className="text-xs flex items-center gap-1 text-rose-500 hover:text-rose-600"><Trash2 className="h-3 w-3" /> Delete</button>
                                  </>
                                )}
                              </div>
                            </div>
                          ))}
                          
                          <div className="relative pl-10 pr-4 py-3 bg-muted/30 rounded-xl border border-border/50">
                            <div className="absolute left-[-2px] top-4 w-8 h-8 rounded-full border-4 border-card bg-slate-400 flex items-center justify-center -translate-x-1/2">
                              <Wallet className="h-3 w-3 text-white" />
                            </div>
                            <div className="flex justify-between items-center">
                              <div>
                                <p className="font-semibold text-sm text-muted-foreground">Opening Cash Set</p>
                              </div>
                              <p className="font-bold tabular-nums text-foreground">{formatINR(openingBalance)}</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {activeTab === 'opening' && (
                    <form onSubmit={handleSetOpeningBalance} className="space-y-5">
                      <div className="bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-400 p-4 rounded-xl text-sm mb-6">
                        <strong>Note:</strong> This is your starting cash base. This action requires the owner password.
                      </div>
                      <div>
                        <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 block">Opening Amount</label>
                        <div className="relative">
                          <span className="absolute left-4 top-3 text-muted-foreground">₹</span>
                          <input type="number" required min="0" value={amount} onChange={e => setAmount(e.target.value)} className="w-full rounded-xl border border-border bg-transparent pl-8 pr-4 py-3 outline-none focus:border-emerald-500" placeholder="e.g. 25000" />
                        </div>
                      </div>
                      <button type="submit" disabled={loading} className="w-full rounded-xl bg-foreground px-4 py-3 font-semibold text-background hover:opacity-90 disabled:opacity-50 flex justify-center items-center gap-2">
                        <Save className="h-4 w-4" /> Save Opening Cash
                      </button>
                    </form>
                  )}

                  {(activeTab === 'deposit' || activeTab === 'withdraw' || activeTab === 'adjust') && (
                    <form onSubmit={handleTransactionSubmit} className="space-y-5">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="col-span-2">
                          <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 block">Amount</label>
                          <div className="relative">
                            <span className="absolute left-4 top-3 text-muted-foreground">₹</span>
                            <input type="number" required min="1" value={amount} onChange={e => setAmount(e.target.value)} className="w-full rounded-xl border border-border bg-transparent pl-8 pr-4 py-3 outline-none focus:border-emerald-500" placeholder="0.00" />
                          </div>
                        </div>

                        {activeTab === 'adjust' && (
                          <div className="col-span-2">
                            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 block">Adjustment Type</label>
                            <div className="flex gap-4">
                              <label className="flex items-center gap-2 cursor-pointer bg-muted/50 px-4 py-2 rounded-lg flex-1 border border-transparent has-[:checked]:border-emerald-500 has-[:checked]:bg-emerald-500/10">
                                <input type="radio" name="adjMode" value="increase" checked={adjustmentMode === 'increase'} onChange={() => setAdjustmentMode('increase')} className="accent-emerald-500" /> Increase
                              </label>
                              <label className="flex items-center gap-2 cursor-pointer bg-muted/50 px-4 py-2 rounded-lg flex-1 border border-transparent has-[:checked]:border-rose-500 has-[:checked]:bg-rose-500/10">
                                <input type="radio" name="adjMode" value="decrease" checked={adjustmentMode === 'decrease'} onChange={() => setAdjustmentMode('decrease')} className="accent-rose-500" /> Decrease
                              </label>
                            </div>
                          </div>
                        )}

                        <div className="col-span-2 sm:col-span-1">
                          <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 block">Date</label>
                          <input type="date" required value={date} onChange={e => setDate(e.target.value)} className="w-full rounded-xl border border-border bg-transparent px-4 py-3 outline-none focus:border-emerald-500 text-sm" />
                        </div>

                        <div className="col-span-2 sm:col-span-1">
                          <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 block">Reason</label>
                          <input type="text" required value={reason} onChange={e => setReason(e.target.value)} className="w-full rounded-xl border border-border bg-transparent px-4 py-3 outline-none focus:border-emerald-500 text-sm" placeholder="e.g. Office Cash" />
                        </div>

                        <div className="col-span-2">
                          <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 block">Notes (Optional)</label>
                          <textarea value={notes} onChange={e => setNotes(e.target.value)} className="w-full rounded-xl border border-border bg-transparent px-4 py-3 outline-none focus:border-emerald-500 text-sm resize-none h-24" placeholder="Additional details..." />
                        </div>
                      </div>

                      <button type="submit" disabled={loading} className="w-full rounded-xl bg-emerald-600 px-4 py-3 font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 flex justify-center items-center gap-2 shadow-lg shadow-emerald-900/20">
                        <Save className="h-4 w-4" /> {editingId ? 'Save Changes' : `Save ${activeTab}`}
                      </button>
                      
                      {editingId && (
                        <button type="button" onClick={resetForm} className="w-full mt-2 text-sm text-muted-foreground hover:text-foreground">
                          Cancel Edit
                        </button>
                      )}
                    </form>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>,
        document.body
      )}
    </>
  )
}
