export function supabaseEnv() {
  return {
    url: import.meta.env.VITE_SUPABASE_URL as string | undefined,
    anon: import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined,
  }
}
