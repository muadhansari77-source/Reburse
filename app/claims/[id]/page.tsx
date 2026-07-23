import { createClient } from "@/lib/supabase/server"
import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { ClaimStatusBadge } from "@/components/claim-status-badge"
import { ClaimStatus } from "@/types/database"
import { ReceiptGallery } from "./receipt-gallery"

function formatDate(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

const STATUS_VERBS: Record<ClaimStatus, string> = {
  draft: 'Created',
  submitted: 'Submitted',
  under_review: 'Under review',
  changes_requested: 'Changes requested',
  approved: 'Approved',
  rejected: 'Rejected',
  payment_pending: 'Payment pending',
  paid: 'Paid',
}

export default async function ClaimDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: claim } = await supabase
    .from('claims')
    .select('*, events(name, reimbursement_cap, currency, firms(name)), profiles!claims_candidate_id_fkey(full_name, email)')
    .eq('id', id)
    .eq('candidate_id', user.id)
    .single()

  if (!claim) notFound()

  const { data: receipts } = await supabase.from('receipts').select('*').eq('claim_id', id).order('created_at')
  const { data: history } = await supabase.from('claim_status_history').select('*, profiles!claim_status_history_changed_by_fkey(full_name)').eq('claim_id', id).order('created_at')

  const event = claim.events as { name: string; reimbursement_cap: number | null; currency: string; firms: { name: string } | null } | null
  const extractedTotal = (receipts ?? []).reduce((s, r) => s + Number(r.extracted_amount ?? 0), 0)
  const mismatch = claim.amount_claimed && extractedTotal > 0 && Math.abs(Number(claim.amount_claimed) - extractedTotal) > 0.01

  return (
    <div className="p-4 sm:p-6 max-w-2xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-xs text-blue-700 font-medium">{event?.firms?.name}</p>
          <h1 className="text-xl font-bold text-slate-900">{event?.name}</h1>
          <Link href="/claims" className="text-xs text-slate-400 hover:underline">← My claims</Link>
        </div>
        <ClaimStatusBadge status={claim.status as ClaimStatus} />
      </div>

      {/* Changes requested banner */}
      {claim.status === 'changes_requested' && claim.review_note && (
        <Alert className="border-orange-200 bg-orange-50">
          <AlertDescription className="text-orange-800">
            <strong>HR has requested changes:</strong> {claim.review_note}
          </AlertDescription>
        </Alert>
      )}

      {/* Rejected banner */}
      {claim.status === 'rejected' && claim.review_note && (
        <Alert className="border-red-200 bg-red-50">
          <AlertDescription className="text-red-800">
            <strong>Claim rejected:</strong> {claim.review_note}
          </AlertDescription>
        </Alert>
      )}

      {/* Mismatch warning */}
      {mismatch && (
        <Alert className="border-amber-200 bg-amber-50">
          <AlertDescription className="text-amber-700">
            Claimed amount ({event?.currency} {Number(claim.amount_claimed).toFixed(2)}) differs from receipt total ({event?.currency} {extractedTotal.toFixed(2)}).
          </AlertDescription>
        </Alert>
      )}

      {/* Claim details */}
      <Card className="border-slate-100">
        <CardContent className="py-5 grid grid-cols-2 gap-3 text-sm">
          <span className="text-slate-500">Amount</span>
          <span className="font-semibold text-slate-900">{event?.currency} {claim.amount_claimed ? Number(claim.amount_claimed).toFixed(2) : '—'}</span>
          <span className="text-slate-500">Travel date</span>
          <span className="text-slate-800">{formatDate(claim.travel_date)}</span>
          {claim.description && <><span className="text-slate-500">Journey</span><span className="text-slate-800">{claim.description}</span></>}
          {claim.submitted_at && <><span className="text-slate-500">Submitted</span><span className="text-slate-800">{formatDate(claim.submitted_at)}</span></>}
          {claim.paid_at && <><span className="text-slate-500">Paid</span><span className="text-slate-800">{formatDate(claim.paid_at)}</span></>}
          {claim.payment_reference && <><span className="text-slate-500">Reference</span><span className="text-slate-800">{claim.payment_reference}</span></>}
        </CardContent>
      </Card>

      {/* Receipts */}
      {receipts && receipts.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-slate-700 mb-3">Receipts</h2>
          <ReceiptGallery receipts={receipts} />
        </div>
      )}

      {/* Status timeline */}
      <div>
        <h2 className="text-sm font-semibold text-slate-700 mb-3">Status history</h2>
        <div className="space-y-2">
          {history?.map(h => {
            const actor = h.profiles as { full_name?: string } | null
            return (
              <div key={h.id} className="flex gap-3 text-sm">
                <div className="w-2 h-2 rounded-full bg-blue-300 mt-1.5 shrink-0" />
                <div>
                  <span className="font-medium text-slate-700">{STATUS_VERBS[h.to_status as ClaimStatus] ?? h.to_status}</span>
                  {actor?.full_name && <span className="text-slate-400"> by {actor.full_name}</span>}
                  <p className="text-xs text-slate-400">{new Date(h.created_at).toLocaleString('en-GB')}</p>
                  {h.note && <p className="text-slate-600 mt-0.5">{h.note}</p>}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Actions */}
      {claim.status === 'changes_requested' && (
        <Link href={`/claims/new?event=${claim.event_id}`}>
          <Button className="bg-blue-700 hover:bg-blue-800 text-white">Edit & resubmit</Button>
        </Link>
      )}
    </div>
  )
}
