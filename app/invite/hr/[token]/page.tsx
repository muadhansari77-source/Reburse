'use client'
import { useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { createClient } from "@/lib/supabase/client"
import { toast } from "sonner"

export default function HRInvitePage() {
  const params = useParams()
  const token = params.token as string
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const supabase = createClient()

  async function accept() {
    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push(`/login?redirect_to=/invite/hr/${token}`)
        return
      }
      const { error } = await supabase.rpc('accept_hr_invitation', { p_token: token })
      if (error) throw error
      toast.success('You\'ve joined the firm team!')
      router.push('/hr')
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to accept invitation')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50">
      <div className="max-w-md w-full space-y-5">
        <div className="text-center">
          <Link href="/" className="text-blue-700 font-semibold text-xl">TravelClaim</Link>
        </div>
        <Card className="border-slate-100">
          <CardContent className="py-8 text-center space-y-4">
            <div className="text-3xl">🏢</div>
            <h1 className="text-xl font-bold text-slate-900">HR Team Invitation</h1>
            <p className="text-sm text-slate-500">You&apos;ve been invited to join a firm&apos;s HR team on TravelClaim.</p>
            <Button onClick={accept} className="w-full bg-blue-700 hover:bg-blue-800 text-white" disabled={loading}>
              {loading ? 'Accepting…' : 'Accept & join team'}
            </Button>
            <p className="text-xs text-slate-400">You&apos;ll be logged in or prompted to sign in first.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
