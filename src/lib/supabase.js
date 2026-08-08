// Single shared Supabase client for the whole app.
// Credentials come from environment variables only — never hard-coded here.
// Vite exposes only VITE_-prefixed vars to browser code, and it reads .env at
// server start, so the dev server needs a restart after editing .env.

import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// Deliberately not throwing at module load: a throw here happens while the
// module graph is still evaluating, which kills the render and leaves a blank
// page. Instead we leave the client null and let fetchTripData() report it, so
// a missing .env surfaces as the on-screen error line.
export const supabase = url && anonKey ? createClient(url, anonKey) : null

export const missingEnvMessage =
  'missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY — copy .env.example to .env, fill it in, and restart the dev server'
