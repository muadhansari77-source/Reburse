'use client'
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { createClient } from "@/lib/supabase/client"
import { toast } from "sonner"

export function LogoutButton({ className }: { className?: string }) {
  const router = useRouter()
  const supabase = createClient()

  async function logout() {
    await supabase.auth.signOut()
    router.push('/')
    router.refresh()
    toast.success('Logged out')
  }

  return (
    <Button variant="ghost" size="sm" onClick={logout} className={className}>
      Log out
    </Button>
  )
}
