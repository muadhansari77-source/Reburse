'use client'
import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { createClient } from "@/lib/supabase/client"
import { toast } from "sonner"
import { Event } from "@/types/database"

const EVENT_TYPES = [
  { value: 'open_day', label: 'Open Day' },
  { value: 'insight_scheme', label: 'Insight Scheme' },
  { value: 'assessment_centre', label: 'Assessment Centre' },
  { value: 'vacation_scheme', label: 'Vacation Scheme' },
  { value: 'interview', label: 'Interview' },
  { value: 'other', label: 'Other' },
]

export function EventSettingsTab({ event }: { event: Event }) {
  const router = useRouter()
  const supabase = createClient()
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState<{
    name: string; event_type: string; start_date: string; end_date: string;
    location: string; reimbursement_cap: string; currency: string; is_open: boolean;
  }>({
    name: event.name,
    event_type: event.event_type as string,
    start_date: event.start_date ?? '',
    end_date: event.end_date ?? '',
    location: event.location ?? '',
    reimbursement_cap: event.reimbursement_cap != null ? String(event.reimbursement_cap) : '',
    currency: event.currency,
    is_open: event.is_open,
  })

  function set(field: string, value: string | boolean) {
    setForm(f => ({ ...f, [field]: value }))
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      const { error } = await supabase.from('events').update({
        name: form.name,
        event_type: form.event_type,
        start_date: form.start_date || null,
        end_date: form.end_date || null,
        location: form.location || null,
        reimbursement_cap: form.reimbursement_cap ? parseFloat(form.reimbursement_cap) : null,
        currency: form.currency,
        is_open: form.is_open,
      }).eq('id', event.id)
      if (error) throw error
      toast.success('Event updated')
      router.refresh()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to update event')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSave} className="max-w-lg space-y-5">
      <div className="space-y-1">
        <Label htmlFor="name">Event name</Label>
        <Input id="name" required value={form.name} onChange={e => set('name', e.target.value)} />
      </div>
      <div className="space-y-1">
        <Label>Type</Label>
        <Select value={form.event_type} onValueChange={v => set('event_type', v ?? 'other')}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>{EVENT_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label htmlFor="s">Start date</Label>
          <Input id="s" type="date" value={form.start_date} onChange={e => set('start_date', e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="e">End date</Label>
          <Input id="e" type="date" value={form.end_date} onChange={e => set('end_date', e.target.value)} />
        </div>
      </div>
      <div className="space-y-1">
        <Label htmlFor="loc">Location</Label>
        <Input id="loc" value={form.location} onChange={e => set('location', e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label htmlFor="cap">Reimbursement cap</Label>
          <Input id="cap" type="number" min="0" step="0.01" value={form.reimbursement_cap} onChange={e => set('reimbursement_cap', e.target.value)} placeholder="No cap" />
        </div>
        <div className="space-y-1">
          <Label>Currency</Label>
          <Select value={form.currency} onValueChange={v => set('currency', v ?? 'GBP')}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="GBP">GBP £</SelectItem>
              <SelectItem value="EUR">EUR €</SelectItem>
              <SelectItem value="USD">USD $</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <input type="checkbox" id="open" checked={form.is_open} onChange={e => set('is_open', e.target.checked)} className="w-4 h-4" />
        <Label htmlFor="open">Event is open (accepts new claims)</Label>
      </div>
      <Button type="submit" className="bg-blue-700 hover:bg-blue-800 text-white" disabled={loading}>
        {loading ? 'Saving…' : 'Save changes'}
      </Button>
    </form>
  )
}
