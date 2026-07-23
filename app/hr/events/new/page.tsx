'use client'
import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { createClient } from "@/lib/supabase/client"
import { toast } from "sonner"

const EVENT_TYPES = [
  { value: 'open_day', label: 'Open Day' },
  { value: 'insight_scheme', label: 'Insight Scheme' },
  { value: 'assessment_centre', label: 'Assessment Centre' },
  { value: 'vacation_scheme', label: 'Vacation Scheme' },
  { value: 'interview', label: 'Interview' },
  { value: 'other', label: 'Other' },
]

export default function NewEventPage() {
  const router = useRouter()
  const supabase = createClient()
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    name: '', event_type: 'other', start_date: '', end_date: '',
    location: '', reimbursement_cap: '', currency: 'GBP',
  })

  function set(field: string, value: string) {
    setForm(f => ({ ...f, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')
      const { data: fm } = await supabase.from('firm_members').select('firm_id').eq('user_id', user.id).single()
      if (!fm) throw new Error('No firm found')

      const { error } = await supabase.from('events').insert({
        firm_id: fm.firm_id,
        name: form.name,
        event_type: form.event_type,
        start_date: form.start_date || null,
        end_date: form.end_date || null,
        location: form.location || null,
        reimbursement_cap: form.reimbursement_cap ? parseFloat(form.reimbursement_cap) : null,
        currency: form.currency,
        created_by: user.id,
      })
      if (error) throw error
      toast.success('Event created!')
      router.push('/hr/events')
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to create event')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-6 max-w-xl mx-auto space-y-6">
      <div className="flex items-center gap-2">
        <Link href="/hr/events" className="text-slate-400 hover:text-slate-600 text-sm">Events</Link>
        <span className="text-slate-300">/</span>
        <span className="text-sm text-slate-600">New event</span>
      </div>
      <h1 className="text-2xl font-bold text-slate-900">Create event</h1>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="space-y-1">
          <Label htmlFor="name">Event name *</Label>
          <Input id="name" required value={form.name} onChange={e => set('name', e.target.value)} placeholder="Vacation Scheme 2026" />
        </div>

        <div className="space-y-1">
          <Label>Event type *</Label>
          <Select value={form.event_type} onValueChange={v => set('event_type', v ?? 'other')}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {EVENT_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label htmlFor="start">Start date</Label>
            <Input id="start" type="date" value={form.start_date} onChange={e => set('start_date', e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="end">End date</Label>
            <Input id="end" type="date" value={form.end_date} onChange={e => set('end_date', e.target.value)} />
          </div>
        </div>

        <div className="space-y-1">
          <Label htmlFor="location">Location</Label>
          <Input id="location" value={form.location} onChange={e => set('location', e.target.value)} placeholder="London" />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label htmlFor="cap">Reimbursement cap (per candidate)</Label>
            <Input id="cap" type="number" min="0" step="0.01" value={form.reimbursement_cap} onChange={e => set('reimbursement_cap', e.target.value)} placeholder="Leave blank for no cap" />
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

        <div className="flex gap-3 pt-2">
          <Button type="submit" className="bg-blue-700 hover:bg-blue-800 text-white" disabled={loading}>
            {loading ? 'Creating…' : 'Create event'}
          </Button>
          <Link href="/hr/events"><Button variant="outline" type="button">Cancel</Button></Link>
        </div>
      </form>
    </div>
  )
}
