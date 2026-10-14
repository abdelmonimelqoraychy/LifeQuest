import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { cookies } from 'next/headers';

export async function verifiedSession(writable = false) {
  if ((await cookies()).get('lifequest-access-locked')?.value === '1') return null;
  const client = await createSupabaseServerClient(writable);
  const { data, error } = await client.auth.getUser();
  if (error && (!error.status || error.status >= 500)) throw new Error('AUTH_UNAVAILABLE');
  if (error || !data.user || data.user.is_anonymous || !data.user.email_confirmed_at) return null;
  const active = await client.rpc('lifequest_session_active');
  if (active.error) throw new Error('AUTH_UNAVAILABLE');
  if (active.data !== true) return null;
  return { client, user: data.user };
}
