'use client'
export const dynamic = 'force-dynamic'
import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { createClient } from "@/lib/supabase/client"
import { toast } from "sonner"

export default function FirmRegisterPage() {
  const router = useRouter()
  const [firmName, setFirmName] = useState('')
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const supabase = createClient()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password.length < 8) { toast.error('Password must be at least 8 characters'); return }
    setLoading(true)
    try {
      // Sign up with HR role
      const { error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName, role: 'hr' } },
      })
      if (signUpError) throw signUpError

      // Sign in
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
      if (signInError) {
        toast.success('Account created! Please confirm your email then log in.')
        router.push('/login')
        return
      }

      // Create firm via RPC
      const { error: firmError } = await supabase.rpc('register_firm', { p_name: firmName })
      if (firmError) throw firmError

      toast.success(`Welcome to TravelClaim! ${firmName} is all set up.`)
      router.push('/hr')
      router.refresh()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Registration failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="max-w-sm w-full space-y-6">
        <div className="text-center space-y-1">
          <Link href="/" className="text-blue-700 font-semibold text-xl">TravelClaim</Link>
          <h1 className="text-2xl font-bold text-slate-900">Register your firm</h1>
          <p className="text-sm text-slate-500">Set up your firm and HR account</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="firm">Firm name</Label>
            <Input id="firm" type="text" required value={firmName} onChange={e => setFirmName(e.target.value)} placeholder="Acme Law LLP" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="name">Your full name</Label>
            <Input id="name" type="text" required value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Alex Smith" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="email">Work email</Label>
            <Input id="email" type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="you@firm.com" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" required minLength={8} value={password} onChange={e => setPassword(e.target.value)} placeholder="At least 8 characters" />
          </div>
          <Button type="submit" className="w-full bg-blue-700 hover:bg-blue-800 text-white" disabled={loading}>
            {loading ? 'Setting up…' : 'Register firm'}
          </Button>
        </form>

        <p className="text-center text-sm text-slate-500">
          Already registered?{' '}
          <Link href="/login" className="text-blue-700 hover:underline">Log in</Link>
        </p>
      </div>
    </div>
  )
}
