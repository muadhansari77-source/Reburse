'use client'
import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { toast } from "sonner"

type Action = 'approve' | 'reject' | 'request_changes' | 'start_review' | 'pay'

interface Props {
  claimId: string
  payMode?: boolean
}

export function ReviewActions({ claimId, payMode = false }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState<Action | null>(null)
  const [note, setNote] = useState('')
  const [payRef, setPayRef] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleAction(action: Action) {
    setLoading(true)
    try {
      if (action === 'pay') {
        const res = await fetch(`/api/claims/${claimId}/pay`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ payment_reference: payRef || undefined }),
        })
        if (!res.ok) { const d = await res.json(); throw new Error(d.error) }
        toast.success('Marked as paid')
      } else {
        const res = await fetch(`/api/claims/${claimId}/review`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action, note: note || undefined }),
        })
        if (!res.ok) { const d = await res.json(); throw new Error(d.error) }
        const labels: Record<string, string> = {
          approve: 'Approved', reject: 'Rejected', request_changes: 'Changes requested', start_review: 'Review started'
        }
        toast.success(labels[action] ?? 'Done')
      }
      setOpen(null)
      setNote('')
      setPayRef('')
      router.refresh()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Action failed')
    } finally {
      setLoading(false)
    }
  }

  if (payMode) {
    return (
      <>
        <Button onClick={() => setOpen('pay')} className="bg-emerald-700 hover:bg-emerald-800 text-white w-full">
          Mark as paid
        </Button>
        <Dialog open={open === 'pay'} onOpenChange={o => !o && setOpen(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Mark as paid</DialogTitle>
              <DialogDescription>Optionally record a payment reference.</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="ref">Payment reference (optional)</Label>
                <Input id="ref" value={payRef} onChange={e => setPayRef(e.target.value)} placeholder="e.g. BACS-2026-001" />
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setOpen(null)}>Cancel</Button>
                <Button onClick={() => handleAction('pay')} className="bg-emerald-700 hover:bg-emerald-800 text-white" disabled={loading}>
                  {loading ? 'Saving…' : 'Mark as paid'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <Button onClick={() => handleAction('approve')} className="bg-green-700 hover:bg-green-800 text-white" disabled={loading}>
        Approve
      </Button>
      <Button variant="outline" onClick={() => setOpen('request_changes')} className="border-orange-200 text-orange-700 hover:bg-orange-50" disabled={loading}>
        Request changes
      </Button>
      <Button variant="outline" onClick={() => setOpen('reject')} className="border-red-200 text-red-700 hover:bg-red-50" disabled={loading}>
        Reject
      </Button>

      {/* Request changes dialog */}
      <Dialog open={open === 'request_changes'} onOpenChange={o => !o && setOpen(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request changes</DialogTitle>
            <DialogDescription>Explain what the candidate needs to fix.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="note-rc">Note for candidate *</Label>
              <Textarea id="note-rc" value={note} onChange={e => setNote(e.target.value)} placeholder="Please upload a clearer receipt showing the total amount…" rows={3} />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setOpen(null)}>Cancel</Button>
              <Button onClick={() => handleAction('request_changes')} disabled={!note.trim() || loading} className="bg-orange-600 hover:bg-orange-700 text-white">
                {loading ? 'Sending…' : 'Request changes'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Reject dialog */}
      <Dialog open={open === 'reject'} onOpenChange={o => !o && setOpen(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject claim</DialogTitle>
            <DialogDescription>This will notify the candidate. Provide a clear reason.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="note-r">Rejection reason *</Label>
              <Textarea id="note-r" value={note} onChange={e => setNote(e.target.value)} placeholder="This receipt does not appear to be a travel expense…" rows={3} />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setOpen(null)}>Cancel</Button>
              <Button onClick={() => handleAction('reject')} disabled={!note.trim() || loading} className="bg-red-600 hover:bg-red-700 text-white">
                {loading ? 'Rejecting…' : 'Reject claim'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
