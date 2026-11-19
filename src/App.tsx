import { AppProviders } from '@/app/providers/AppProviders'
import { SetupRequiredPage } from '@/app/pages/SetupRequiredPage'
import { AppRouter } from '@/app/router'
import { isSupabaseConfigured } from '@/integrations/supabase/client'

export default function App() {
  if (!isSupabaseConfigured) return <SetupRequiredPage />

  return (
    <AppProviders>
      <AppRouter />
    </AppProviders>
  )
}
