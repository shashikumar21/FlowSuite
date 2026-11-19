import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { requireSupabase } from '@/integrations/supabase/client'
import type { ProfileRow } from '@/types/database'

type AuthContextValue = {
  session: Session | null
  user: User | null
  profile: ProfileRow | null
  loading: boolean
  isPlatformAdmin: boolean
  signIn: (email: string, password: string) => Promise<void>
  signUp: (input: { email: string; password: string; fullName: string; phone?: string }) => Promise<boolean>
  signOut: () => Promise<void>
  resetPassword: (email: string) => Promise<void>
  updatePassword: (password: string) => Promise<void>
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<ProfileRow | null>(null)
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabase = requireSupabase()
    let active = true

    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return
      setSession(data.session)
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  const loadUserData = useCallback(async (user: User | null) => {
    if (!user) {
      setProfile(null)
      setIsPlatformAdmin(false)
      return
    }
    const supabase = requireSupabase()
    const [profileResult, adminResult] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', user.id).maybeSingle(),
      supabase.rpc('is_platform_admin', { allowed_roles: ['super_admin', 'support'] }),
    ])
    setProfile(profileResult.data ?? null)
    setIsPlatformAdmin(adminResult.data === true)
  }, [])

  useEffect(() => {
    const userId = session?.user?.id
    if (!userId) {
      setProfile(null)
      setIsPlatformAdmin(false)
      return
    }
    let active = true
    setLoading(true)
    void loadUserData(session.user).finally(() => {
      if (active) setLoading(false)
    })
    return () => {
      active = false
    }
  }, [session, loadUserData])

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      profile,
      loading,
      isPlatformAdmin,
      async signIn(email, password) {
        const { error } = await requireSupabase().auth.signInWithPassword({ email, password })
        if (error) throw error
      },
      async signUp({ email, password, fullName, phone }) {
        const { data, error } = await requireSupabase().auth.signUp({
          email,
          password,
          options: { data: { full_name: fullName, ...(phone ? { phone } : {}) } },
        })
        if (error) throw error
        return data.session === null
      },
      async signOut() {
        const { error } = await requireSupabase().auth.signOut()
        if (error) throw error
      },
      async resetPassword(email) {
        const { error } = await requireSupabase().auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        })
        if (error) throw error
      },
      async updatePassword(password) {
        const { error } = await requireSupabase().auth.updateUser({ password })
        if (error) throw error
      },
      async refreshProfile() {
        await loadUserData(session?.user ?? null)
      },
    }),
    [session, profile, loading, isPlatformAdmin, loadUserData],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside AuthProvider')
  return context
}
