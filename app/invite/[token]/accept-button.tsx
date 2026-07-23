'use client'
import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { createClient } from "@/lib/supabase/client"
import { toast } from "sonner"

export function AcceptInviteButton({ token }: { token: string }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const supabase = createClient()

  async function accept() {
    setLoading(true)
    try {
      const { data, error } = await supabase.rpc('accept_invitation', { p_token: token })
      if (error) throw error
      toast.success('Invitation accepted! Welcome.')
      router.push('/dashboard')
      router.refresh()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to accept invitation')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Button onClick={accept} className="w-full bg-blue-700 hover:bg-blue-800 text-white" disabled={loading}>
      {loading ? 'Accepting…' : 'Accept invitation & start claim'}
    </Button>
  )
}
