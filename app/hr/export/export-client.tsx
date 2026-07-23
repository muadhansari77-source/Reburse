'use client'
import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { ClaimStatusBadge } from "@/components/claim-status-badge"
import { ClaimStatus } from "@/types/database"
import { toast } from "sonner"

interface ClaimRow {
  id: string
  status: string
  amount_claimed: number | null
  currency: string
  travel_date: string | null
  exported_at: string | null
  profiles: { full_name?: string; email?: string } | null
  events: { name?: string } | null
}

export function ExportPageClient({ claims }: { claims: ClaimRow[] }) {
  const router = useRouter()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState<'export' | 'pay' | null>(null)

  function toggle(id: string) {
    setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  function toggleAll() {
    if (selected.size === claims.length) setSelected(new Set())
    else setSelected(new Set(claims.map(c => c.id)))
  }

  async function handleExport() {
    if (!selected.size) { toast.error('Select at least one claim'); return }
    setLoading('export')
    try {
      const res = await fetch('/api/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ claim_ids: [...selected] }),
      })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error) }
      const blob = await res.blob()
      const disposition = res.headers.get('content-disposition')
      const filename = disposition?.match(/filename="?([^"]+)"?/)?.[1] ?? 'reimbursements.csv'
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = filename; a.click()
      URL.revokeObjectURL(url)
      toast.success('CSV downloaded — claims moved to payment pending')
      router.refresh()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Export failed')
    } finally {
      setLoading(null)
    }
  }

  async function handleMarkPaid() {
    if (!selected.size) { toast.error('Select at least one claim'); return }
    setLoading('pay')
    try {
      const { createClient } = await import('@/lib/supabase/client')
      const sb = createClient()
      const { error } = await sb.rpc('mark_paid', { p_claim_ids: [...selected], p_payment_reference: null })
      if (error) throw error
      toast.success(`${selected.size} claim${selected.size > 1 ? 's' : ''} marked as paid`)
      setSelected(new Set())
      router.refresh()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed')
    } finally {
      setLoading(null)
    }
  }

  if (!claims.length) {
    return (
      <Card className="border-slate-100">
        <CardContent className="py-16 text-center text-slate-400">
          <p className="text-lg font-medium">No approved claims</p>
          <p className="text-sm mt-1">Approved claims will appear here for export and payment.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {/* Actions bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-sm text-slate-500">{selected.size} of {claims.length} selected</span>
        <Button variant="outline" size="sm" onClick={toggleAll}>
          {selected.size === claims.length ? 'Deselect all' : 'Select all'}
        </Button>
        <Button size="sm" onClick={handleExport} disabled={!selected.size || loading !== null} className="bg-blue-700 hover:bg-blue-800 text-white">
          {loading === 'export' ? 'Exporting…' : 'Export to CSV'}
        </Button>
        <Button size="sm" variant="outline" onClick={handleMarkPaid} disabled={!selected.size || loading !== null} className="border-emerald-200 text-emerald-700 hover:bg-emerald-50">
          {loading === 'pay' ? 'Updating…' : 'Mark as paid'}
        </Button>
      </div>

      <Card className="border-slate-100">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="px-4 py-3 w-10">
                  <Checkbox checked={selected.size === claims.length && claims.length > 0} onCheckedChange={toggleAll} />
                </th>
                <th className="text-left px-4 py-3 text-slate-500 font-medium">Candidate</th>
                <th className="text-left px-4 py-3 text-slate-500 font-medium">Event</th>
                <th className="text-left px-4 py-3 text-slate-500 font-medium">Amount</th>
                <th className="text-left px-4 py-3 text-slate-500 font-medium">Status</th>
                <th className="text-left px-4 py-3 text-slate-500 font-medium">Exported</th>
              </tr>
            </thead>
            <tbody>
              {claims.map(c => (
                <tr key={c.id} className={`border-b border-slate-50 hover:bg-slate-50 ${selected.has(c.id) ? 'bg-blue-50/50' : ''}`}>
                  <td className="px-4 py-3">
                    <Checkbox checked={selected.has(c.id)} onCheckedChange={() => toggle(c.id)} />
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-800">{c.profiles?.full_name || '—'}</p>
                    <p className="text-xs text-slate-400">{c.profiles?.email}</p>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{c.events?.name}</td>
                  <td className="px-4 py-3 font-medium">{c.amount_claimed ? `${c.currency} ${Number(c.amount_claimed).toFixed(2)}` : '—'}</td>
                  <td className="px-4 py-3"><ClaimStatusBadge status={c.status as ClaimStatus} /></td>
                  <td className="px-4 py-3 text-slate-400 text-xs">{c.exported_at ? new Date(c.exported_at).toLocaleDateString('en-GB') : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
