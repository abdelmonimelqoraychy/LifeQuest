export function supabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error('AUTH_CONFIGURATION_UNAVAILABLE');
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(parsed.hostname))) {
    throw new Error('AUTH_CONFIGURATION_UNAVAILABLE');
  }
  if (!key.startsWith('sb_publishable_')) throw new Error('AUTH_PUBLIC_KEY_REQUIRED');
  return { url, key };
}
