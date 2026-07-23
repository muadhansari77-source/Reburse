'use client'
import { Suspense, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { createClient } from "@/lib/supabase/client"
import { toast } from "sonner"

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const redirectTo = searchParams.get('redirect_to')
  const [mode, setMode] = useState<'password' | 'magic'>('password')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [magicSent, setMagicSent] = useState(false)

  const supabase = createClient()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      if (mode === 'magic') {
        const { error } = await supabase.auth.signInWithOtp({
          email,
          options: { emailRedirectTo: `${window.location.origin}${redirectTo ?? '/dashboard'}` }
        })
        if (error) throw error
        setMagicSent(true)
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        const { data: profile } = await supabase.from('profiles').select('role').eq('id', data.user.id).single()
        if (redirectTo) router.push(redirectTo)
        else if (profile?.role === 'hr') router.push('/hr')
        else router.push('/dashboard')
        router.refresh()
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  if (magicSent) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="max-w-sm w-full text-center space-y-4">
          <div className="text-4xl">✉️</div>
          <h1 className="text-xl font-semibold">Check your email</h1>
          <p className="text-slate-500 text-sm">We sent a magic link to <strong>{email}</strong>. Click it to sign in.</p>
          <Link href="/" className="text-sm text-blue-700 hover:underline">Back to home</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="max-w-sm w-full space-y-6">
        <div className="text-center space-y-1">
          <Link href="/" className="text-blue-700 font-semibold text-xl">TravelClaim</Link>
          <h1 className="text-2xl font-bold text-slate-900">Log in</h1>
        </div>

        <div className="flex rounded-lg border border-slate-200 overflow-hidden">
          {(['password', 'magic'] as const).map(m => (
            <button key={m} onClick={() => setMode(m)}
              className={`flex-1 py-2 text-sm font-medium transition-colors ${mode === m ? 'bg-blue-700 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>
              {m === 'password' ? 'Password' : 'Magic link'}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" />
          </div>
          {mode === 'password' && (
            <div className="space-y-1">
              <div className="flex justify-between items-center">
                <Label htmlFor="password">Password</Label>
                <Link href="/auth/reset-password" className="text-xs text-blue-700 hover:underline">Forgot password?</Link>
              </div>
              <Input id="password" type="password" required value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" />
            </div>
          )}
          <Button type="submit" className="w-full bg-blue-700 hover:bg-blue-800 text-white" disabled={loading}>
            {loading ? 'Loading…' : mode === 'magic' ? 'Send magic link' : 'Log in'}
          </Button>
        </form>

        <p className="text-center text-sm text-slate-500">
          No account?{' '}
          <Link href={`/signup${redirectTo ? `?redirect_to=${redirectTo}` : ''}`} className="text-blue-700 hover:underline">Sign up</Link>
        </p>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><Skeleton className="h-64 w-full max-w-sm" /></div>}>
      <LoginForm />
    </Suspense>
  )
}
