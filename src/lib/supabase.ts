import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { env } from '@/config/env'

let client: SupabaseClient | null = null

/**
 * Returns the Supabase browser client, or null when the project is running without
 * a backend (demo mode). Only the public anon key is used here; data access is
 * protected by Row Level Security policies in supabase/migrations.
 */
export function getSupabase(): SupabaseClient | null {
  if (!env.supabaseUrl || !env.supabaseAnonKey) return null
  if (!client) {
    client = createClient(env.supabaseUrl, env.supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  }
  return client
}

export const isSupabaseConfigured = () => Boolean(env.supabaseUrl && env.supabaseAnonKey)
