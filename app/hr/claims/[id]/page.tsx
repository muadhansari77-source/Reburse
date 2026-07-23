import { createClient } from "@/lib/supabase/server"
import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { ClaimStatusBadge } from "@/components/claim-status-badge"
import { ClaimStatus } from "@/types/database"
import { HRReceiptViewer } from "./receipt-viewer"
import { ReviewActions } from "./review-actions"

function formatDate(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

const STATUS_VERBS: Record<string, string> = {
  draft: 'Created', submitted: 'Submitted', under_review: 'Under review',
  changes_requested: 'Changes requested', approved: 'Approved',
  rejected: 'Rejected', payment_pending: 'Payment pending', paid: 'Paid',
}

export default async function HRClaimReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: fm } = await supabase.from('firm_members').select('firm_id').eq('user_id', user.id).single()
  if (!fm) redirect('/hr')

  const { data: claim } = await supabase
    .from('claims')
    .select(`
      *,
      events(name, reimbursement_cap, currency, firms(name)),
      profiles!claims_candidate_id_fkey(full_name, email),
      reviewer:profiles!claims_reviewed_by_fkey(full_name)
    `)
    .eq('id', id)
    .eq('firm_id', fm.firm_id)
    .single()

  if (!claim) notFound()

  const { data: receipts } = await supabase.from('receipts').select('*').eq('claim_id', id).order('created_at')
  const { data: history } = await supabase
    .from('claim_status_history')
    .select('*, actor:profiles!claim_status_history_changed_by_fkey(full_name, role)')
    .eq('claim_id', id)
    .order('created_at')

  const event = claim.events as { name: string; reimbursement_cap: number | null; currency: string; firms: { name: string } | null } | null
  const candidate = claim.profiles as { full_name?: string; email?: string } | null
  const reviewer = claim.reviewer as { full_name?: string } | null

  const extractedTotal = (receipts ?? []).reduce((s: number, r) => s + Number(r.extracted_amount ?? 0), 0)
  const mismatch = claim.amount_claimed && extractedTotal > 0 && Math.abs(Number(claim.amount_claimed) - extractedTotal) > 0.01
  const capExceeded = event?.reimbursement_cap && claim.amount_claimed && Number(claim.amount_claimed) > Number(event.reimbursement_cap)

  const isActionable = ['submitted', 'under_review'].includes(claim.status)

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <Link href="/hr/claims" className="text-xs text-slate-400 hover:underline">← All claims</Link>
          <h1 className="text-xl font-bold text-slate-900 mt-1">{event?.firms?.name} · {event?.name}</h1>
          <p className="text-sm text-slate-500">{candidate?.full_name} · {candidate?.email}</p>
        </div>
        <div className="flex items-center gap-3">
          <ClaimStatusBadge status={claim.status as ClaimStatus} />
        </div>
      </div>

      {/* Warnings */}
      {mismatch && (
        <Alert className="border-amber-200 bg-amber-50">
          <AlertDescription className="text-amber-700">
            ⚠ <strong>Amount mismatch:</strong> Candidate claimed {event?.currency} {Number(claim.amount_claimed).toFixed(2)} but receipt total is {event?.currency} {extractedTotal.toFixed(2)}.
          </AlertDescription>
        </Alert>
      )}
      {capExceeded && (
        <Alert className="border-amber-200 bg-amber-50">
          <AlertDescription className="text-amber-700">
            ⚠ Claimed amount exceeds the event cap of {event?.currency} {Number(event?.reimbursement_cap).toFixed(2)}.
          </AlertDescription>
        </Alert>
      )}

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Receipt viewer */}
        <div>
          <h2 className="text-sm font-semibold text-slate-700 mb-3">Receipts ({receipts?.length ?? 0})</h2>
          {receipts && receipts.length > 0 ? (
            <HRReceiptViewer receipts={receipts} />
          ) : (
            <Card className="border-slate-100">
              <CardContent className="py-10 text-center text-slate-400 text-sm">No receipts attached.</CardContent>
            </Card>
          )}
        </div>

        {/* Right: Claim details */}
        <div className="space-y-5">
          <Card className="border-slate-100">
            <CardContent className="py-5 grid grid-cols-2 gap-3 text-sm">
              <span className="text-slate-500">Amount claimed</span>
              <span className="font-semibold text-slate-900">{event?.currency} {claim.amount_claimed ? Number(claim.amount_claimed).toFixed(2) : '—'}</span>
              {extractedTotal > 0 && (
                <>
                  <span className="text-slate-500">Receipt total</span>
                  <span className={mismatch ? 'text-amber-600 font-medium' : 'text-slate-700'}>{event?.currency} {extractedTotal.toFixed(2)}</span>
                </>
              )}
              <span className="text-slate-500">Travel date</span>
              <span className="text-slate-800">{formatDate(claim.travel_date)}</span>
              {claim.description && (
                <><span className="text-slate-500">Journey</span><span className="text-slate-800">{claim.description}</span></>
              )}
              <span className="text-slate-500">Submitted</span>
              <span className="text-slate-800">{formatDate(claim.submitted_at)}</span>
              {claim.reviewed_at && (
                <><span className="text-slate-500">Reviewed</span><span className="text-slate-800">{formatDate(claim.reviewed_at)} {reviewer?.full_name ? `by ${reviewer.full_name}` : ''}</span></>
              )}
              {claim.review_note && (
                <><span className="text-slate-500">Note</span><span className="text-slate-800">{claim.review_note}</span></>
              )}
              {claim.paid_at && (
                <><span className="text-slate-500">Paid</span><span className="text-slate-800">{formatDate(claim.paid_at)}</span></>
              )}
              {claim.payment_reference && (
                <><span className="text-slate-500">Ref</span><span className="text-slate-800">{claim.payment_reference}</span></>
              )}
            </CardContent>
          </Card>

          {/* Extracted receipt data */}
          {receipts && receipts.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Extracted receipt data</h3>
              <div className="space-y-2">
                {receipts.map(r => (
                  <Card key={r.id} className="border-slate-100">
                    <CardContent className="py-3 text-xs space-y-0.5">
                      <p className="font-medium text-slate-700 mb-1">{r.file_name}</p>
                      {r.extracted_merchant && <p><span className="text-slate-400">Merchant:</span> {r.extracted_merchant}</p>}
                      {r.extracted_provider && r.extracted_provider !== r.extracted_merchant && <p><span className="text-slate-400">Provider:</span> {r.extracted_provider}</p>}
                      {r.extracted_amount && <p><span className="text-slate-400">Amount:</span> {r.extracted_currency} {Number(r.extracted_amount).toFixed(2)}</p>}
                      {r.extracted_journey && <p><span className="text-slate-400">Journey:</span> {r.extracted_journey}</p>}
                      {r.extracted_date && <p><span className="text-slate-400">Date:</span> {formatDate(r.extracted_date)}</p>}
                      {r.extracted_reference && <p><span className="text-slate-400">Ref:</span> {r.extracted_reference}</p>}
                      <p><span className="text-slate-400">Confidence:</span> {r.extraction_confidence ?? '—'}</p>
                      {r.ocr_status === 'failed' && <p className="text-amber-600">⚠ Extraction failed</p>}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* Status history */}
          <div>
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">History</h3>
            <div className="space-y-2">
              {history?.map(h => {
                const actor = h.actor as { full_name?: string; role?: string } | null
                return (
                  <div key={h.id} className="flex gap-2 text-xs">
                    <div className="w-1.5 h-1.5 rounded-full bg-slate-300 mt-1.5 shrink-0" />
                    <div>
                      <span className="text-slate-700 font-medium">{STATUS_VERBS[h.to_status] ?? h.to_status}</span>
                      {actor?.full_name && <span className="text-slate-400"> by {actor.full_name}</span>}
                      <p className="text-slate-400">{new Date(h.created_at).toLocaleString('en-GB')}</p>
                      {h.note && <p className="text-slate-600 mt-0.5 italic">{h.note}</p>}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Action buttons */}
          {isActionable && <ReviewActions claimId={id} />}
          {(claim.status === 'approved' || claim.status === 'payment_pending') && (
            <ReviewActions claimId={id} payMode />
          )}
        </div>
      </div>
    </div>
  )
}
