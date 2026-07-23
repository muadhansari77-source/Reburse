import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ClaimStatusBadge } from "@/components/claim-status-badge"
import { ClaimStatus } from "@/types/database"

function currency(amount: number | null, curr = 'GBP') {
  if (amount == null) return '—'
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: curr }).format(amount)
}

export default async function HRDashboard() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: firmMember } = await supabase
    .from('firm_members')
    .select('firm_id')
    .eq('user_id', user.id)
    .single()

  if (!firmMember) {
    return <div className="p-8 text-slate-500">No firm found for your account.</div>
  }

  const firmId = firmMember.firm_id

  // Stats
  const { data: allClaims } = await supabase
    .from('claims')
    .select('id, status, amount_claimed, currency, submitted_at, paid_at')
    .eq('firm_id', firmId)

  const counts = {
    pending: 0, approved: 0, rejected: 0, paid: 0,
    approvedTotal: 0,
  }
  const now = new Date()
  const quarterStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1)

  for (const c of allClaims ?? []) {
    if (['submitted', 'under_review', 'changes_requested'].includes(c.status)) counts.pending++
    if (c.status === 'approved' || c.status === 'payment_pending') counts.approved++
    if (c.status === 'rejected') counts.rejected++
    if (c.status === 'paid') counts.paid++
    if (['approved', 'payment_pending', 'paid'].includes(c.status) && c.paid_at && new Date(c.paid_at) >= quarterStart) {
      counts.approvedTotal += Number(c.amount_claimed ?? 0)
    }
    if (['approved', 'payment_pending'].includes(c.status)) {
      counts.approvedTotal += Number(c.amount_claimed ?? 0)
    }
  }

  // Approved quarter total (deduplicated)
  const approvedThisQuarter = (allClaims ?? [])
    .filter(c => ['approved', 'payment_pending'].includes(c.status))
    .reduce((sum, c) => sum + Number(c.amount_claimed ?? 0), 0)

  // Claims needing action
  const { data: actionClaims } = await supabase
    .from('claims')
    .select('id, status, amount_claimed, currency, submitted_at, candidate_id, event_id, profiles!claims_candidate_id_fkey(full_name, email), events(name)')
    .eq('firm_id', firmId)
    .in('status', ['submitted', 'under_review', 'changes_requested'])
    .order('submitted_at', { ascending: true })
    .limit(20)

  const stats = [
    { label: 'Pending review', value: counts.pending, color: 'text-amber-600' },
    { label: 'Approved / awaiting payment', value: counts.approved, color: 'text-green-600' },
    { label: 'Rejected', value: counts.rejected, color: 'text-red-600' },
    { label: 'Paid', value: counts.paid, color: 'text-emerald-700' },
    { label: 'Approved (this quarter)', value: currency(approvedThisQuarter), color: 'text-blue-700' },
  ]

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-8">
      <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {stats.map(s => (
          <Card key={s.label} className="border-slate-100">
            <CardContent className="pt-4 pb-4">
              <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-xs text-slate-500 mt-0.5 leading-tight">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Claims needing action */}
      <div>
        <h2 className="text-lg font-semibold text-slate-800 mb-3">Claims needing action</h2>
        {!actionClaims?.length ? (
          <Card className="border-slate-100">
            <CardContent className="py-12 text-center text-slate-400">
              <p className="text-lg">All caught up</p>
              <p className="text-sm mt-1">No claims awaiting your review.</p>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-slate-100">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="text-left px-4 py-3 text-slate-500 font-medium">Candidate</th>
                    <th className="text-left px-4 py-3 text-slate-500 font-medium">Event</th>
                    <th className="text-left px-4 py-3 text-slate-500 font-medium">Amount</th>
                    <th className="text-left px-4 py-3 text-slate-500 font-medium">Status</th>
                    <th className="text-left px-4 py-3 text-slate-500 font-medium">Submitted</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {actionClaims.map((c: Record<string, unknown>) => {
                    const profile = c.profiles as { full_name?: string; email?: string } | null
                    const event = c.events as { name?: string } | null
                    return (
                      <tr key={c.id as string} className="border-b border-slate-50 hover:bg-slate-50">
                        <td className="px-4 py-3 font-medium text-slate-800">{profile?.full_name || profile?.email || '—'}</td>
                        <td className="px-4 py-3 text-slate-600">{event?.name || '—'}</td>
                        <td className="px-4 py-3 text-slate-800">{currency(c.amount_claimed as number | null, c.currency as string)}</td>
                        <td className="px-4 py-3"><ClaimStatusBadge status={c.status as ClaimStatus} /></td>
                        <td className="px-4 py-3 text-slate-500">{c.submitted_at ? new Date(c.submitted_at as string).toLocaleDateString('en-GB') : '—'}</td>
                        <td className="px-4 py-3">
                          <Link href={`/hr/claims/${c.id}`} className="text-blue-700 hover:underline text-xs font-medium">Review →</Link>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>
    </div>
  )
}
