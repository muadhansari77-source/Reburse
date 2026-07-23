'use client'
import { useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "sonner"
import { Receipt } from "@/types/database"

interface Props {
  eventId: string
  eventName: string
  firmName: string
  reimbursementCap: number | null
  currency: string
  existingClaimId: string | null
  existingClaimStatus: string | null
}

interface ReceiptCard extends Receipt {
  preview?: string
}

const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf']

export function ClaimWizard({ eventId, eventName, firmName, reimbursementCap, currency, existingClaimId, existingClaimStatus }: Props) {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [claimId, setClaimId] = useState<string | null>(existingClaimId && ['draft', 'changes_requested'].includes(existingClaimStatus ?? '') ? existingClaimId : null)
  const [receipts, setReceipts] = useState<ReceiptCard[]>([])
  const [uploading, setUploading] = useState<Record<string, boolean>>({})
  const [form, setForm] = useState({ amount_claimed: '', travel_date: '', description: '' })
  const [submitting, setSubmitting] = useState(false)

  function setField(f: string, v: string) { setForm(p => ({ ...p, [f]: v })) }

  async function ensureClaim(): Promise<string> {
    if (claimId) return claimId
    const res = await fetch('/api/claims', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event_id: eventId }) })
    if (!res.ok) { const d = await res.json(); throw new Error(d.error ?? 'Failed to create claim') }
    const { claim } = await res.json()
    setClaimId(claim.id)
    return claim.id
  }

  async function handleFiles(files: FileList | null) {
    if (!files || !files.length) return
    for (const file of Array.from(files)) {
      if (!ALLOWED.includes(file.type)) { toast.error(`${file.name}: unsupported file type`); continue }
      if (file.size > 10 * 1024 * 1024) { toast.error(`${file.name}: exceeds 10 MB`); continue }
      if (receipts.length >= 5) { toast.error('Maximum 5 receipts per claim'); break }

      const tempId = crypto.randomUUID()
      const preview = file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined
      setUploading(u => ({ ...u, [tempId]: true }))

      const fd = new FormData()
      fd.append('file', file)
      const cid = await ensureClaim()
      fd.append('claim_id', cid)

      try {
        const res = await fetch('/api/receipts/upload', { method: 'POST', body: fd })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error)
        const newReceipt: ReceiptCard = { ...data.receipt, preview }
        setReceipts(r => [...r, newReceipt])

        // Auto-fill claim fields from first successful extraction
        if (newReceipt.ocr_status === 'succeeded' && newReceipt.extracted_amount) {
          setForm(f => ({
            amount_claimed: f.amount_claimed || String(
              receipts.reduce((s, r) => s + Number(r.extracted_amount ?? 0), 0) + Number(newReceipt.extracted_amount ?? 0)
            ),
            travel_date: f.travel_date || (newReceipt.extracted_date ?? ''),
            description: f.description || (newReceipt.extracted_journey ?? ''),
          }))
        }

        if (newReceipt.ocr_status === 'failed') {
          toast.warning(`${file.name}: couldn't read automatically — please fill in the details manually`)
        } else if (newReceipt.raw_extraction && !(newReceipt.raw_extraction as Record<string, unknown>).is_travel_receipt) {
          toast.warning(`${file.name}: this may not be a travel receipt — please verify the details`)
        }
      } catch (err: unknown) {
        toast.error(err instanceof Error ? err.message : 'Upload failed')
      } finally {
        setUploading(u => { const n = { ...u }; delete n[tempId]; return n })
      }
    }
  }

  async function deleteReceipt(id: string) {
    if (!claimId) return
    // Remove from storage via direct delete (allowed for own draft claim via RLS)
    const { createClient } = await import('@/lib/supabase/client')
    const sb = createClient()
    const receipt = receipts.find(r => r.id === id)
    if (receipt?.storage_path) {
      await sb.storage.from('receipts').remove([receipt.storage_path])
    }
    await sb.from('receipts').delete().eq('id', id)
    setReceipts(r => r.filter(x => x.id !== id))
    toast.success('Receipt removed')
  }

  async function handleSubmit() {
    if (!claimId) { toast.error('No claim to submit'); return }
    if (!form.amount_claimed || !form.travel_date) { toast.error('Amount and travel date are required'); return }

    const amount = parseFloat(form.amount_claimed)
    if (isNaN(amount) || amount <= 0) { toast.error('Invalid amount'); return }

    setSubmitting(true)
    try {
      // Save claim fields
      const patchRes = await fetch(`/api/claims/${claimId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount_claimed: amount, travel_date: form.travel_date, description: form.description || null }),
      })
      if (!patchRes.ok) { const d = await patchRes.json(); throw new Error(d.error) }

      // Submit
      const submitRes = await fetch(`/api/claims/${claimId}/submit`, { method: 'POST' })
      if (!submitRes.ok) { const d = await submitRes.json(); throw new Error(d.error) }

      toast.success('Claim submitted!')
      router.push(`/claims/${claimId}`)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Submit failed')
    } finally {
      setSubmitting(false)
    }
  }

  const capWarning = reimbursementCap && form.amount_claimed && parseFloat(form.amount_claimed) > reimbursementCap
  const pendingUploads = Object.keys(uploading).length

  return (
    <div className="p-4 sm:p-6 max-w-2xl mx-auto space-y-6">
      {/* Breadcrumb */}
      <div>
        <p className="text-xs text-blue-700 font-medium">{firmName}</p>
        <h1 className="text-xl font-bold text-slate-900">{eventName}</h1>
        <p className="text-sm text-slate-500">New claim</p>
      </div>

      {/* Step indicators */}
      <div className="flex items-center gap-2 text-sm">
        {['Upload receipts', 'Review details', 'Confirm & submit'].map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold
              ${step === i+1 ? 'bg-blue-700 text-white' : step > i+1 ? 'bg-green-500 text-white' : 'bg-slate-200 text-slate-500'}`}>
              {step > i+1 ? '✓' : i+1}
            </span>
            <span className={step === i+1 ? 'text-slate-800 font-medium' : 'text-slate-400'}>{s}</span>
            {i < 2 && <span className="text-slate-200 mx-1">›</span>}
          </div>
        ))}
      </div>

      {/* Step 1: Upload */}
      {step === 1 && (
        <div className="space-y-4">
          <Card className={`border-dashed border-2 border-slate-200 hover:border-blue-300 transition-colors cursor-pointer`}
            onDragOver={e => { e.preventDefault() }}
            onDrop={e => { e.preventDefault(); handleFiles(e.dataTransfer.files) }}>
            <CardContent className="py-10 text-center">
              <label className="cursor-pointer block space-y-2">
                <p className="text-2xl">📎</p>
                <p className="font-medium text-slate-700">Drop receipt files here or click to browse</p>
                <p className="text-sm text-slate-400">JPG, PNG, WebP, HEIC, PDF · Max 10 MB each · Up to 5 files</p>
                <input type="file" multiple accept={ALLOWED.join(',')} className="sr-only" onChange={e => handleFiles(e.target.files)} />
              </label>
            </CardContent>
          </Card>

          {/* Uploading spinners */}
          {Object.keys(uploading).map(tid => (
            <Card key={tid} className="border-slate-100">
              <CardContent className="py-4 flex items-center gap-3">
                <div className="w-10 h-10 bg-slate-100 rounded animate-pulse" />
                <div className="flex-1 space-y-1">
                  <Skeleton className="h-3 w-32" />
                  <p className="text-xs text-blue-700">Reading your receipt…</p>
                </div>
              </CardContent>
            </Card>
          ))}

          {/* Receipt cards */}
          {receipts.map(r => (
            <Card key={r.id} className={`border-slate-100 ${r.ocr_status === 'failed' ? 'border-amber-200' : ''}`}>
              <CardContent className="py-4">
                <div className="flex items-start gap-3">
                  {r.preview ? (
                    <img src={r.preview} alt="Receipt" className="w-12 h-12 object-cover rounded border border-slate-100" />
                  ) : (
                    <div className="w-12 h-12 bg-slate-100 rounded flex items-center justify-center text-xl">📄</div>
                  )}
                  <div className="flex-1 space-y-1">
                    <p className="font-medium text-sm text-slate-800">{r.file_name}</p>
                    {r.ocr_status === 'failed' ? (
                      <p className="text-xs text-amber-600">⚠ Couldn&apos;t read automatically — fill in the details in step 2</p>
                    ) : (
                      <div className="text-xs text-slate-500 space-y-0.5">
                        {r.extracted_merchant && <p>🏪 {r.extracted_merchant}</p>}
                        {r.extracted_amount && <p>💰 {r.extracted_currency ?? currency} {Number(r.extracted_amount).toFixed(2)}</p>}
                        {r.extracted_journey && <p>🚂 {r.extracted_journey}</p>}
                      </div>
                    )}
                  </div>
                  <button onClick={() => deleteReceipt(r.id)} className="text-slate-300 hover:text-red-500 text-lg leading-none">×</button>
                </div>
              </CardContent>
            </Card>
          ))}

          <div className="flex justify-end">
            <Button
              onClick={() => setStep(2)}
              disabled={receipts.length === 0 || pendingUploads > 0}
              className="bg-blue-700 hover:bg-blue-800 text-white">
              {pendingUploads > 0 ? `Uploading ${pendingUploads}…` : 'Next: Review details'}
            </Button>
          </div>
        </div>
      )}

      {/* Step 2: Review */}
      {step === 2 && (
        <div className="space-y-5">
          <div className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="amount">Total amount claimed ({currency}) *</Label>
              <Input
                id="amount" type="number" min="0.01" step="0.01" required
                value={form.amount_claimed} onChange={e => setField('amount_claimed', e.target.value)}
                placeholder="0.00"
              />
              {capWarning && (
                <p className="text-xs text-amber-600">⚠ This exceeds the reimbursement cap of {currency} {reimbursementCap?.toFixed(2)}. You may still submit.</p>
              )}
            </div>
            <div className="space-y-1">
              <Label htmlFor="date">Travel date *</Label>
              <Input id="date" type="date" required value={form.travel_date} onChange={e => setField('travel_date', e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="desc">Journey description</Label>
              <Textarea id="desc" value={form.description} onChange={e => setField('description', e.target.value)} placeholder="e.g. Return train, Leeds to London" rows={2} />
            </div>
          </div>

          {/* Receipt summary */}
          {receipts.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-slate-700">Receipts ({receipts.length})</p>
              {receipts.map(r => (
                <div key={r.id} className="flex items-center gap-3 text-sm border border-slate-100 rounded-md p-3 bg-white">
                  <span className="text-slate-400">{r.file_name}</span>
                  {r.extracted_merchant && <span className="text-slate-600">· {r.extracted_merchant}</span>}
                  {r.extracted_amount && <span className="text-slate-600">· {r.extracted_currency ?? currency} {Number(r.extracted_amount).toFixed(2)}</span>}
                  {r.extracted_reference && <span className="text-slate-400 text-xs">Ref: {r.extracted_reference}</span>}
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-3 justify-between">
            <Button variant="outline" onClick={() => setStep(1)}>Back</Button>
            <Button onClick={() => setStep(3)} disabled={!form.amount_claimed || !form.travel_date} className="bg-blue-700 hover:bg-blue-800 text-white">
              Review & submit
            </Button>
          </div>
        </div>
      )}

      {/* Step 3: Confirm */}
      {step === 3 && (
        <div className="space-y-5">
          <Card className="border-slate-100">
            <CardContent className="py-5 space-y-3">
              <h2 className="font-semibold text-slate-800">Claim summary</h2>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <span className="text-slate-500">Event</span><span className="text-slate-800">{eventName}</span>
                <span className="text-slate-500">Amount</span><span className="text-slate-800 font-medium">{currency} {parseFloat(form.amount_claimed).toFixed(2)}</span>
                <span className="text-slate-500">Travel date</span><span className="text-slate-800">{new Date(form.travel_date).toLocaleDateString('en-GB')}</span>
                {form.description && <><span className="text-slate-500">Journey</span><span className="text-slate-800">{form.description}</span></>}
                <span className="text-slate-500">Receipts</span><span className="text-slate-800">{receipts.length} file{receipts.length !== 1 ? 's' : ''}</span>
              </div>
            </CardContent>
          </Card>

          {capWarning && (
            <Alert className="border-amber-200 bg-amber-50">
              <AlertDescription className="text-amber-700">
                ⚠ The claimed amount ({currency} {parseFloat(form.amount_claimed).toFixed(2)}) exceeds the event reimbursement cap of {currency} {reimbursementCap?.toFixed(2)}. HR will be notified.
              </AlertDescription>
            </Alert>
          )}

          <div className="flex gap-3 justify-between">
            <Button variant="outline" onClick={() => setStep(2)}>Back</Button>
            <Button onClick={handleSubmit} disabled={submitting} className="bg-blue-700 hover:bg-blue-800 text-white">
              {submitting ? 'Submitting…' : 'Submit claim'}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
