import { useState, useEffect } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../net/supabase'
import { AdminDashboard } from './AdminDashboard'

export default function AdminApp() {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [signingIn, setSigningIn] = useState(false)

  useEffect(() => {
    supabase().auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })
    const { data: { subscription } } = supabase().auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })
    return () => subscription.unsubscribe()
  }, [])

  const signIn = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSigningIn(true)
    const { error } = await supabase().auth.signInWithPassword({ email, password })
    setSigningIn(false)
    if (error) setError(error.message)
  }

  const signOut = () => supabase().auth.signOut()

  const inputStyle: React.CSSProperties = {
    padding: '10px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.2)',
    background: 'rgba(255,255,255,0.07)', color: '#fff', fontSize: 15, width: '100%', boxSizing: 'border-box',
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100dvh', color: '#fff' }}>
        Loading…
      </div>
    )
  }

  if (!session) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100dvh', background: '#16161d' }}>
        <form onSubmit={signIn} style={{ display: 'flex', flexDirection: 'column', gap: 12, width: 320, padding: 32, background: '#1d2b22', borderRadius: 18, border: '1px solid rgba(255,255,255,0.1)' }}>
          <h2 style={{ margin: 0, color: '#fff', fontStyle: 'italic' }}>LAST CARD! Admin</h2>
          <input style={inputStyle} type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <input style={inputStyle} type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          {error && <p style={{ color: '#eb1c24', margin: 0, fontSize: 14 }}>{error}</p>}
          <button className="btn btn-primary" type="submit" disabled={signingIn}>
            {signingIn ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    )
  }

  return <AdminDashboard onSignOut={signOut} />
}
